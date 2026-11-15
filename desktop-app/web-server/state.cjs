const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

// One locked Postgres row is the authoritative state for this single-school pilot.
// Local files are only a disposable working copy of that row, never durable storage.
const MAX_STATE = 128 * 1024 * 1024
function pack(db, root) {
  const files = {}
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(name)
      else if (entry.isFile() && !name.includes('school.sqlite')) files[path.relative(root, name).split(path.sep).join('/')] = fs.readFileSync(name).toString('base64')
    }
  }
  visit(root)
  const json = JSON.stringify({ version: 1, assetRoot: root, database: db.serialize().toString('base64'), files })
  if (Buffer.byteLength(json) > MAX_STATE) throw new Error('The online pilot storage limit has been reached. Export a backup and contact the administrator.')
  return zlib.gzipSync(json)
}
function unpack(bytes, root) {
  const state = JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: MAX_STATE }).toString())
  if (state.version !== 1 || typeof state.database !== 'string' || !state.files || typeof state.files !== 'object') throw new Error('Invalid school backup format.')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'school.sqlite'), Buffer.from(state.database, 'base64'))
  for (const [name, data] of Object.entries(state.files)) {
    if (!name || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(name) || name.includes('school.sqlite')) throw new Error('Invalid backup file path.')
    if (typeof data !== 'string') throw new Error('Invalid backup file.')
    const destination = path.resolve(root, name)
    if (!destination.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid backup file path.')
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, Buffer.from(data, 'base64'))
  }
  return state
}
module.exports = { pack, unpack }
