const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

function createSync(db, app, safeStorage) {
  const authFile = path.join(app.getPath('userData'), 'cloud-sync-auth.bin')
  const deviceFile = path.join(app.getPath('userData'), 'cloud-sync-device-id.txt')
  let accessToken = null
  let running = false
  let timer = null
  const getMeta = key => db.prepare('SELECT value FROM desktop_sync_meta WHERE key=?').get(key)?.value ?? null
  const setMeta = (key, value) => db.prepare('INSERT INTO desktop_sync_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value))
  const deviceId = () => { let value; try { value = fs.readFileSync(deviceFile, 'utf8').trim() } catch {} if (!value) { value = randomUUID(); fs.writeFileSync(deviceFile, value, { mode: 0o600 }) } setMeta('device_id', value); return value }
  const baseUrl = () => (getMeta('api_base_url') || '').replace(/\/+$/, '').replace(/\/api\/v1$/i, '')
  const status = () => ({ configured: Boolean(baseUrl() && fs.existsSync(authFile)), apiBaseUrl: baseUrl(), pending: db.prepare('SELECT count(*) AS n FROM desktop_sync_outbox').get().n, lastSyncAt: getMeta('last_sync_at'), lastError: getMeta('last_sync_error'), deviceId: getMeta('device_id') })
  function authData() {
    if (!fs.existsSync(authFile) || !safeStorage.isEncryptionAvailable()) return null
    try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(authFile))) } catch { return null }
  }
  function saveAuth(value) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable on this computer. Enable Windows device encryption or reconnect each time.')
    const encrypted = safeStorage.encryptString(JSON.stringify(value))
    fs.writeFileSync(authFile, encrypted, { mode: 0o600 })
  }
  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, signal: AbortSignal.timeout(30000) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.success === false) throw new Error(body.message || `Cloud API returned HTTP ${response.status}`)
    return body.data ?? body
  }
  async function refreshToken() {
    const auth = authData()
    if (!auth?.refreshToken) throw new Error('Connect this desktop app to the online school account first.')
    const result = await jsonRequest(`${baseUrl()}/api/v1/auth/refresh`, { method: 'POST', body: JSON.stringify({ refreshToken: auth.refreshToken }) })
    auth.refreshToken = result.refreshToken
    accessToken = result.accessToken
    saveAuth(auth)
    return accessToken
  }
  async function authorized(pathname, options = {}) {
    if (!accessToken) await refreshToken()
    try { return await jsonRequest(`${baseUrl()}/api/v1${pathname}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) } }) }
    catch (error) {
      if (!/401|expired|Invalid/i.test(error.message)) throw error
      await refreshToken()
      return jsonRequest(`${baseUrl()}/api/v1${pathname}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) } })
    }
  }
  async function connect(input) {
    const url = new URL(String(input.apiBaseUrl || '').trim())
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Use an HTTPS API address. For local development, localhost is allowed.')
    const root = url.href.replace(/\/+$/, '').replace(/\/api\/v1$/i, '')
    const result = await jsonRequest(`${root}/api/v1/auth/login`, { method: 'POST', body: JSON.stringify({ email: String(input.email || '').trim(), password: String(input.password || '') }) })
    if (!['SUPER_ADMIN', 'ADMIN'].includes(result.user?.role) || !result.user?.schoolId) throw new Error('Sign in with an online host school administrator account. Stakeholder accounts cannot sync school records.')
    setMeta('api_base_url', root)
    saveAuth({ refreshToken: result.refreshToken, userId: result.user.id, schoolId: result.user.schoolId, email: result.user.email })
    accessToken = result.accessToken
    setMeta('last_sync_error', '')
    return status()
  }
  function queueFullSnapshot() {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','desktop_sync_outbox','desktop_sync_meta')").all()
    let queued = 0
    const add = db.transaction(() => {
      for (const { name } of tables) {
        const quoted = `\"${name.replaceAll('"', '""')}\"`
        const columns = db.prepare(`PRAGMA table_info(${quoted})`).all()
        const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name)
        if (!keys.length) continue
        const safeColumns = columns.filter(column => !['password_hash','password_salt','token_hash'].includes(column.name)).map(column => column.name)
        const rows = db.prepare(`SELECT ${safeColumns.map(col => `\"${col.replaceAll('"','""')}\"`).join(',')} FROM ${quoted}`).all()
        const insert = db.prepare("INSERT INTO desktop_sync_outbox(event_id,table_name,local_key,operation,payload_json) VALUES(?,?,?,'upsert',?)")
        for (const row of rows) {
          const values = keys.map(key => row[key])
          const key = values.length === 1 ? String(values[0]) : JSON.stringify(values)
          insert.run(randomUUID(), name, key, JSON.stringify(row))
          queued++
        }
      }
    })
    add()
    return queued
  }
  async function run() {
    if (running) return status()
    running = true
    try {
      if (!baseUrl() || !authData()?.refreshToken) throw new Error('Connect the online host school account before syncing.')
      if (!accessToken) await refreshToken()
      const id = deviceId()
      while (true) {
        const batch = db.prepare('SELECT id,event_id,table_name,local_key,operation,payload_json FROM desktop_sync_outbox ORDER BY id LIMIT 25').all()
        if (!batch.length) break
        const records = batch.map(row => ({ eventId: row.event_id, revision: row.id, tableName: row.table_name, localId: row.local_key, operation: row.operation, payload: row.payload_json ? JSON.parse(row.payload_json) : null }))
        const response = await authorized('/sync/push', { method: 'POST', body: JSON.stringify({ deviceId: id, records }) })
        const acknowledged = new Set(response.acknowledgedEventIds || [])
        if (!acknowledged.size) throw new Error('Cloud API did not acknowledge any sync records. Pending changes were kept on this device.')
        const remove = db.prepare('DELETE FROM desktop_sync_outbox WHERE event_id=?')
        const commit = db.transaction(ids => ids.forEach(eventId => remove.run(eventId)))
        commit([...acknowledged])
        if (acknowledged.size < batch.length) throw new Error(`${batch.length - acknowledged.size} changes were not acknowledged and remain queued.`)
      }
      setMeta('last_sync_at', new Date().toISOString())
      setMeta('last_sync_error', '')
      return status()
    } catch (error) {
      setMeta('last_sync_error', error instanceof Error ? error.message : 'Cloud sync failed.')
      throw error
    } finally { running = false }
  }
  function startAutomaticSync() {
    if (timer) clearInterval(timer)
    timer = setInterval(() => { if (baseUrl() && authData()?.refreshToken && db.prepare('SELECT 1 FROM desktop_sync_outbox LIMIT 1').get()) run().catch(() => {}) }, 120000)
    if (baseUrl() && authData()?.refreshToken) setTimeout(() => run().catch(() => {}), 5000)
  }
  function disconnect() { accessToken = null; setMeta('api_base_url', ''); setMeta('last_sync_error', ''); try { fs.unlinkSync(authFile) } catch {} return status() }
  return { status, connect, queueFullSnapshot, run, startAutomaticSync, disconnect }
}

module.exports = { createSync }
