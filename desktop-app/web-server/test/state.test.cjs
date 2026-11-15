const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { pack, unpack } = require('../state.cjs')

test('school archive survives working-directory removal and retains uploads', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-state-test-'))
  try {
    fs.mkdirSync(path.join(root, 'resources')); fs.writeFileSync(path.join(root, 'resources', 'lesson.pdf'), 'private lesson')
    fs.writeFileSync(path.join(root, 'school.sqlite'), 'working sqlite')
    const bytes = pack({ serialize: () => Buffer.from('serialized school database') }, root)
    fs.rmSync(root, { recursive: true }); const restored = unpack(bytes, root)
    assert.equal(restored.assetRoot, root)
    assert.equal(fs.readFileSync(path.join(root, 'school.sqlite'), 'utf8'), 'serialized school database')
    assert.equal(fs.readFileSync(path.join(root, 'resources', 'lesson.pdf'), 'utf8'), 'private lesson')
    assert.equal(Object.keys(restored.files).length, 1)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

for (const name of ['../escape', '/etc/passwd', 'C:\\outside', 'school.sqlite', 'resources/../../escape']) test(`backup rejects unsafe path: ${name}`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-invalid-test-'))
  try {
    const bytes = zlib.gzipSync(JSON.stringify({version:1,database:'AA==',files:{[name]:'AA=='}}))
    assert.throws(() => unpack(bytes, root), /Invalid backup file path/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('every Electron browser method has an API route or explicit cloud handling', () => {
  const calls = require('../../src/browser-operations.json')
  const handlers = require('../operations.json')
  const special = new Set(['school:choose-logo','students:choose-photo','resources:choose-upload','backups:choose-create','backups:choose-restore','receipts:choose-upload'])
  for (const channel of Object.values(calls)) assert.ok(handlers[channel] || special.has(channel) || channel.startsWith('cloud-sync:'), `Missing ${channel}`)
})
