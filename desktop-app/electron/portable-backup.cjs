const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')

// Export from a copy: never rewrite the installed school's live database.
function portableBackup(db, Database = require('better-sqlite3')) {
  const copy = new Database(db.serialize())
  const files = {}
  const missingFiles = []
  const assetRoot = '/school-export'
  try {
    copy.prepare('DELETE FROM sessions').run()
    for (const [table,column] of [['schools','logo_path'],['students','photograph_path'],['stakeholder_registrations','photograph_path'],['resources','stored_path']]) {
      if (!copy.prepare(`PRAGMA table_info(${table})`).all().some(item=>item.name===column)) continue
      for (const row of copy.prepare(`SELECT id, ${column} value FROM ${table} WHERE ${column} IS NOT NULL`).all()) {
        if (!row.value) continue
        if (!fs.existsSync(row.value)) { missingFiles.push({table,id:row.id}); continue }
        const name = `assets/${crypto.randomUUID()}${path.extname(row.value).toLowerCase()}`
        files[name] = fs.readFileSync(row.value).toString('base64')
        copy.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(`${assetRoot}/${name}`,row.id)
      }
    }
    copy.prepare('DELETE FROM desktop_sync_outbox').run()
    const json = JSON.stringify({version:1,assetRoot,database:copy.serialize().toString('base64'),files})
    if (Buffer.byteLength(json)>128*1024*1024) throw new Error('School data exceeds the online pilot archive limit.')
    const bytes = zlib.gzipSync(json)
    if (bytes.length>20*1024*1024) throw new Error('School data exceeds the browser import limit of 20 MB. A server-assisted migration is required.')
    return {bytes,missingFiles}
  } finally {copy.close()}
}
module.exports = {portableBackup}
