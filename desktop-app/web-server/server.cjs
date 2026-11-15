const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { Pool } = require('pg')
const Database = require('./sqlite.cjs')
const { openDatabase } = require('../electron/storage.cjs')
const { createServices } = require('../electron/services.cjs')
const operations = require('./operations.json')
const { pack, unpack } = require('./state.cjs')

if (!process.env.DATABASE_URL || !process.env.SETUP_KEY || !process.env.CORS_ORIGIN) throw new Error('DATABASE_URL, SETUP_KEY, and CORS_ORIGIN are required.')
if (process.env.SETUP_KEY.length < 24) throw new Error('SETUP_KEY must contain at least 24 characters.')
let pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 15000 })
const origins = process.env.CORS_ORIGIN.split(',').map(value => value.trim())
const root = path.join(os.tmpdir(), 'olufunmilyo-web-school')
const filename = path.join(root, 'school.sqlite')
const runtime = { getPath: () => root }
const rate = new Map()
setInterval(() => { for (const [key, value] of rate) if (Date.now() > value.until) rate.delete(key) }, 60000).unref()
let queue = Promise.resolve()
const publicActions = new Set(['setup:status', 'auth:setup', 'auth:login', 'stakeholders:self-register'])
function requirePermission(services, token, permission) {
  const user = services.auth.me(token)
  if (!user.permissions.includes(permission)) throw new Error('You do not have permission to perform this action.')
  return user
}
function setupAllowed(value) {
  const actual = crypto.createHash('sha256').update(value || '').digest()
  const expected = crypto.createHash('sha256').update(process.env.SETUP_KEY).digest()
  return crypto.timingSafeEqual(actual, expected)
}
function validatePaths(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (/path$/i.test(key) && typeof item === 'string' && item && (!path.resolve(item).startsWith(root + path.sep) || !fs.existsSync(item))) throw new Error('Select a file through the upload control.')
    if (typeof item === 'object') validatePaths(item)
  }
}
function upload(file, extensions, limit = 20 * 1024 * 1024) {
  if (!file || typeof file.name !== 'string' || typeof file.data !== 'string') throw new Error('Select a file to upload.')
  const extension = path.extname(file.name).toLowerCase()
  if (!extensions.includes(extension)) throw new Error('This file type is not supported.')
  const bytes = Buffer.from(file.data, 'base64')
  if (!bytes.length || bytes.length > limit) throw new Error('The uploaded file is empty or exceeds the size limit.')
  const dir = path.join(root, 'uploads', crypto.randomUUID()); fs.mkdirSync(dir, { recursive: true })
  const destination = path.join(dir, path.basename(file.name).replace(/[^a-zA-Z0-9._ -]/g, '_'))
  fs.writeFileSync(destination, bytes)
  return destination
}
function rebaseFiles(db, state) {
  if (!state?.assetRoot || state.assetRoot === root) return
  for (const [table, column] of [['schools','logo_path'], ['students','photograph_path'], ['stakeholder_registrations','photograph_path'], ['resources','stored_path'], ['payment_receipts','stored_path']]) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all()
    if (!columns.some(item => item.name === column)) continue
    for (const row of db.prepare(`SELECT id, ${column} value FROM ${table} WHERE ${column} IS NOT NULL`).all()) {
      const relative = row.value.replaceAll('\\', '/').slice(state.assetRoot.replaceAll('\\', '/').length + 1)
      if (row.value.replaceAll('\\', '/').startsWith(state.assetRoot.replaceAll('\\', '/') + '/') && relative && !relative.split('/').includes('..')) db.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(path.join(root, ...relative.split('/')), row.id)
    }
  }
}
async function execute(channel, args, setupKey) {
  const client = await pool.connect()
  let db
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(71590321)")
    const saved = await client.query("SELECT payload FROM desktop_web.school_state WHERE id = 1 FOR UPDATE")
    fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true })
    const previous = saved.rows[0]?.payload ? unpack(saved.rows[0].payload, root) : null
    db = openDatabase(filename, Database)
    rebaseFiles(db, previous)
    const services = createServices(db, runtime)
    if (channel === 'stakeholders:self-register' && services.auth.needsSetup()) throw new Error('The host must register the first administrator before accepting stakeholder applications.')
    if (!publicActions.has(channel)) services.auth.me(args[0])
    if (channel === 'auth:setup' && !setupAllowed(setupKey)) throw new Error('The school setup key is incorrect.')
    for (const arg of args) validatePaths(arg)
    let data
    if (channel === 'school:choose-logo') {
      requirePermission(services, args[0], 'school.manage')
      const source = upload(args.at(-1), ['.png', '.jpg', '.jpeg', '.webp'], 5 * 1024 * 1024)
      data = services.school.setLogo(args[0], source)
    } else if (channel === 'students:choose-photo') {
      requirePermission(services, args[0], 'students.manage')
      data = upload(args.at(-1), ['.png', '.jpg', '.jpeg', '.webp'], 5 * 1024 * 1024)
    } else if (channel === 'receipts:choose-upload') {
      const source=upload(args.at(-1),['.pdf','.png','.jpg','.jpeg'],5*1024*1024)
      data=services.paymentReceipts.upload(args[0],source,args[1]||{})
      fs.unlinkSync(source)
    } else if (channel === 'resources:choose-upload') {
      requirePermission(services, args[0], 'resources.manage')
      const source = upload(args.at(-1), ['.pdf', '.docx', '.pptx', '.xlsx', '.jpg', '.jpeg', '.png', '.txt'])
      data = services.resources.upload(args[0], source, args[1] || {})
      fs.unlinkSync(source)
    } else if (channel === 'backups:choose-create') {
      requirePermission(services, args[0], 'backups.manage')
      const bytes = pack(db, root)
      await client.query('INSERT INTO desktop_web.backup_history(payload) VALUES($1)', [bytes])
      const backupName = `olufunmilyo-${new Date().toISOString().slice(0,10)}.smsbackup`
      data = { filename: backupName, filePath: backupName, data: bytes.toString('base64') }
    } else if (channel === 'backups:choose-restore') {
      requirePermission(services, args[0], 'backups.manage')
      const file = args.at(-1)
      if (!file || !file.name.endsWith('.smsbackup')) throw new Error('Select an online school backup (.smsbackup).')
      const old = pack(db, root)
      const bytes = Buffer.from(file.data, 'base64')
      db.close(); db = null
      fs.rmSync(root, { recursive: true, force: true }); const restored = unpack(bytes, root)
      db = openDatabase(filename, Database)
      rebaseFiles(db, restored)
      if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup integrity check failed.')
      db.prepare('DELETE FROM sessions').run()
      await client.query('INSERT INTO desktop_web.backup_history(payload) VALUES($1)', [old])
      data = true
    } else if (channel === 'cloud-sync:status') {
      requirePermission(services, args[0], 'school.manage')
      data = { configured: true, pending: 0, apiBaseUrl: '', lastSyncAt: new Date().toISOString(), lastError: null, deviceId: 'shared-web' }
    } else if (channel.startsWith('cloud-sync:')) throw new Error('Browser changes are saved directly to the shared school. Desktop sync is configured separately.')
    else {
      const operation = operations[channel]
      if (!operation || operation[0] === 'backups' || channel === 'school:logo') throw new Error('Unknown school operation.')
      data = await services[operation[0]][operation[1]](...args)
    }
    // Cloud snapshots do not use the desktop mirror outbox.
    db.prepare('DELETE FROM desktop_sync_outbox').run()
    const snapshot = pack(db, root)
    await client.query('INSERT INTO desktop_web.school_state(id,payload) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=now()', [snapshot])
    await client.query('COMMIT')
    return data
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { if (db?.open) db.close(); fs.rmSync(root, { recursive: true, force: true }); client.release() }
}
function json(response, status, body) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(body)) }
async function body(request) {
  let size = 0; const chunks = []
  for await (const chunk of request) { size += chunk.length; if (size > 30 * 1024 * 1024) throw new Error('The request exceeds the upload limit.'); chunks.push(chunk) }
  return JSON.parse(Buffer.concat(chunks).toString())
}
async function start(databasePool) {
  if (databasePool) pool = databasePool
  await pool.query('CREATE SCHEMA IF NOT EXISTS desktop_web; REVOKE ALL ON SCHEMA desktop_web FROM PUBLIC, anon, authenticated; CREATE TABLE IF NOT EXISTS desktop_web.school_state(id integer PRIMARY KEY CHECK(id=1),payload bytea NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS desktop_web.backup_history(id bigserial PRIMARY KEY,payload bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE desktop_web.school_state ENABLE ROW LEVEL SECURITY; ALTER TABLE desktop_web.backup_history ENABLE ROW LEVEL SECURITY; REVOKE ALL ON ALL TABLES IN SCHEMA desktop_web FROM PUBLIC, anon, authenticated;')
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin
    if (origin && !origins.includes(origin)) return json(response, 403, { ok: false, error: 'This website is not allowed.' })
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin') }
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-School-Setup-Key')
    response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    if (request.method === 'OPTIONS') { response.writeHead(204); return response.end() }
    if (request.url === '/api/v1/health') {
      try { await pool.query('SELECT 1'); return json(response, 200, { ok: true, application: 'OlufunmilyoSMS desktop web', status: 'ok' }) }
      catch { return json(response, 503, { ok: false, error: 'School database unavailable.' }) }
    }
    if (request.method !== 'POST' || !request.url?.startsWith('/api/desktop/')) return json(response, 404, { ok: false, error: 'Not found.' })
    try {
      const channel = decodeURIComponent(request.url.slice('/api/desktop/'.length))
      const key = `${request.socket.remoteAddress}:${publicActions.has(channel) ? 'auth' : 'school'}`
      const counter = rate.get(key) || { n: 0, until: Date.now() + 60000 }
      if (Date.now() > counter.until) { counter.n = 0; counter.until = Date.now() + 60000 }
      counter.n++; rate.set(key, counter)
      if (counter.n > (publicActions.has(channel) ? 30 : 300)) return json(response, 429, { ok: false, error: 'Too many requests. Please wait one minute.' })
      const input = await body(request)
      if (!Array.isArray(input.args) || input.args.length > 8) throw new Error('Invalid school request.')
      const task = queue.then(() => execute(channel, input.args, request.headers['x-school-setup-key']))
      queue = task.catch(() => {})
      return json(response, 200, { ok: true, data: await task })
    } catch (error) {
      const message = error.message || ''
      // Driver errors contain SQL and connection details; do not send these to browsers.
      return json(response, 400, { ok: false, error: error.code || /SQLITE|postgres|password authentication|connect ECONN/.test(message) ? 'The school operation could not be completed. Contact the administrator.' : message.slice(0, 250) })
    }
  })
  await new Promise(resolve => server.listen(Number(process.env.PORT || 4001), '0.0.0.0', resolve))
  return server
}
if (require.main === module) start().catch(() => { console.error('School API initialization failed. Check database connectivity and required environment variables.'); process.exitCode = 1 })
module.exports = { start, execute, setupAllowed }
