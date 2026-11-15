const fs = require('node:fs')
const path = require('node:path')

function openDatabase(filename, Database = require('better-sqlite3')) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const db = new Database(filename)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
  for (const statement of ['ALTER TABLE schools ADD COLUMN motto TEXT','ALTER TABLE resources ADD COLUMN resource_type TEXT NOT NULL DEFAULT \'Learning material\'','ALTER TABLE stakeholder_registrations ADD COLUMN exam_type TEXT NOT NULL DEFAULT \'WAEC\'','ALTER TABLE stakeholder_registrations ADD COLUMN amount_paid_kobo INTEGER NOT NULL DEFAULT 0','ALTER TABLE stakeholder_registrations ADD COLUMN amount_due_kobo INTEGER NOT NULL DEFAULT 0','ALTER TABLE report_cards ADD COLUMN class_teacher_comment TEXT','ALTER TABLE report_cards ADD COLUMN head_teacher_comment TEXT']) { try { db.exec(statement) } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error } }
  const registrationSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='stakeholder_registrations'").get()?.sql || ''
  if (!registrationSql.includes('Common Entrance') || !registrationSql.includes("'CASS'")) {
    db.exec(`CREATE TABLE stakeholder_registrations_new (id TEXT PRIMARY KEY, stakeholder_id TEXT NOT NULL REFERENCES stakeholder_schools(id), first_name TEXT NOT NULL, surname TEXT NOT NULL, date_of_birth TEXT, gender TEXT CHECK(gender IN ('Female','Male','Other')), exam_type TEXT NOT NULL DEFAULT 'WAEC' CHECK(exam_type IN ('WAEC','NECO','JAMB','BECE','CASS','Common Entrance','WAEC & NECO','WAEC, NECO & JAMB')), photograph_path TEXT, documents_json TEXT NOT NULL DEFAULT '[]', requested_session_id INTEGER NOT NULL REFERENCES academic_sessions(id), assigned_admission_number TEXT UNIQUE, assigned_class_arm_id INTEGER REFERENCES class_arms(id), status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected')), decision_note TEXT, amount_paid_kobo INTEGER NOT NULL DEFAULT 0 CHECK(amount_paid_kobo>=0), amount_due_kobo INTEGER NOT NULL DEFAULT 0 CHECK(amount_due_kobo>=0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO stakeholder_registrations_new(id,stakeholder_id,first_name,surname,date_of_birth,gender,exam_type,photograph_path,documents_json,requested_session_id,assigned_admission_number,assigned_class_arm_id,status,decision_note,amount_paid_kobo,amount_due_kobo,created_at)
      SELECT id,stakeholder_id,first_name,surname,date_of_birth,gender,exam_type,photograph_path,documents_json,requested_session_id,assigned_admission_number,assigned_class_arm_id,status,decision_note,amount_paid_kobo,amount_due_kobo,created_at FROM stakeholder_registrations;
      DROP TABLE stakeholder_registrations;
      ALTER TABLE stakeholder_registrations_new RENAME TO stakeholder_registrations;`)
  }
  db.prepare("INSERT OR IGNORE INTO schools(id,name) VALUES(1,'')").run()
  installSyncOutbox(db)
  return db
}

// Every application table is mirrored through a local transactional outbox.
// Password material and transient authentication sessions are intentionally
// excluded from the cloud copy.
function installSyncOutbox(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS desktop_sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    table_name TEXT NOT NULL,
    local_key TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
    payload_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS desktop_sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('sessions','desktop_sync_outbox','desktop_sync_meta')").all()
  for (const { name } of tables) {
    const quoted = `\"${name.replaceAll('"', '""')}\"`
    const columns = db.prepare(`PRAGMA table_info(${quoted})`).all()
    const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name)
    if (!keys.length) continue
    const safeColumns = columns.filter(column => !['password_hash','password_salt','token_hash'].includes(column.name))
    const json = (prefix) => `json_object(${safeColumns.map(column => `'${column.name.replaceAll("'", "''")}', ${prefix}.\"${column.name.replaceAll('"','""')}\"`).join(', ')})`
    const keyExpr = (prefix) => keys.length === 1 ? `CAST(${prefix}.\"${keys[0]}\" AS TEXT)` : `json_array(${keys.map(key => `${prefix}.\"${key}\"`).join(', ')})`
    for (const [suffix, operation, prefix] of [['insert','upsert','NEW'],['update','upsert','NEW'],['delete','delete','OLD']]) {
      const trigger = `desktop_sync_${name}_${suffix}`.replaceAll(/[^a-zA-Z0-9_]/g, '_')
      db.exec(`CREATE TRIGGER IF NOT EXISTS \"${trigger}\" AFTER ${suffix.toUpperCase()} ON ${quoted}
        BEGIN INSERT INTO desktop_sync_outbox(event_id,table_name,local_key,operation,payload_json)
        VALUES(lower(hex(randomblob(16))),'${name.replaceAll("'", "''")}',${keyExpr(prefix)},'${operation}',${operation === 'delete' ? 'NULL' : json(prefix)}); END;`)
    }
  }
}
module.exports = { openDatabase }
