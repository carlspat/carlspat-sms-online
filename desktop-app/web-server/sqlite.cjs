// Compatibility adapter for the desktop service layer. Node 22.16+ includes
// SQLite, so hosting this API does not require Electron or a native-addon build.
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
class SQLite {
  constructor(filename) {
    this.temporary = Buffer.isBuffer(filename)
    this.name = this.temporary ? path.join(os.tmpdir(), `sms-copy-${crypto.randomUUID()}.sqlite`) : filename
    if (this.temporary) fs.writeFileSync(this.name, filename)
    this.db = new DatabaseSync(this.name)
    this.depth = 0; this.open = true
  }
  exec(sql) { return this.db.exec(sql) }
  prepare(sql) {
    const statement = this.db.prepare(sql)
    return {
      get: (...args) => statement.get(...args),
      all: (...args) => statement.all(...args),
      run: (...args) => { const value = statement.run(...args); return { changes: Number(value.changes), lastInsertRowid: Number(value.lastInsertRowid) } },
    }
  }
  pragma(sql, options) { const rows = this.db.prepare('PRAGMA ' + sql).all(); return options?.simple ? Object.values(rows[0] || {})[0] : rows }
  transaction(fn) {
    return (...args) => {
      const name = `school_transaction_${this.depth++}`
      this.exec('SAVEPOINT ' + name)
      try { const result = fn(...args); this.exec('RELEASE ' + name); return result }
      catch (error) { this.exec('ROLLBACK TO ' + name); this.exec('RELEASE ' + name); throw error }
      finally { this.depth-- }
    }
  }
  serialize() { this.db.exec('PRAGMA wal_checkpoint(FULL)'); return fs.readFileSync(this.name) }
  close() {
    this.db.close(); this.open = false
    if (this.temporary) for (const suffix of ['', '-wal', '-shm']) fs.rmSync(this.name + suffix, { force: true })
  }
}
module.exports = SQLite
