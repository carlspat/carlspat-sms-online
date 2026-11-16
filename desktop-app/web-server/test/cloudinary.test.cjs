const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib')
const {createCloudinaryStore,filesIn}=require('../cloudinary-store.cjs')
const {pack,unpack}=require('../state.cjs')
const {cloudinaryFixture}=require('./cloudinary-fixture.cjs')

test('official SDK signs a time-limited authenticated raw download without public delivery URLs',()=>{
  const sdk=require('cloudinary').v2
  const url=new URL(sdk.utils.private_download_url('olufunmilayo/files/'+ 'a'.repeat(64)+'.pdf','',{cloud_name:'ixqbuvsd',api_key:'test-key',api_secret:'test-secret',resource_type:'raw',type:'authenticated',expires_at:Math.floor(Date.now()/1000)+60,secure:true}))
  assert.equal(url.origin,'https://api.cloudinary.com')
  assert.ok(url.pathname.endsWith('/raw/download'))
  assert.equal(url.searchParams.get('type'),'authenticated')
  assert.ok(url.searchParams.get('signature'))
  assert.ok(Number(url.searchParams.get('expires_at'))>Date.now()/1000)
})

test('migration stores authenticated immutable assets, verifies downloads and removes active inline bytes',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sms-cloud-test-'))
  const fixture=cloudinaryFixture(),media=createCloudinaryStore(fixture)
  const db={serialize:()=>Buffer.from('school database fixture')}
  try {
    fs.mkdirSync(path.join(root,'resources'));fs.writeFileSync(path.join(root,'resources','lesson.docx'),'private lesson contents')
    const before=filesIn(root)
    const initial=pack(db,root)
    const migrated=await media.persist(root,{},before,{all:true})
    assert.equal(migrated.migrated,1)
    assert.equal(fixture.uploads[0].type,'authenticated')
    assert.equal(fixture.uploads[0].resource_type,'raw')
    assert.equal(fixture.uploads[0].overwrite,false)
    assert.ok(fixture.uploads[0].public_id.startsWith('olufunmilayo/resources/'))
    assert.equal(fixture.downloads[0].options.type,'authenticated')
    assert.ok(fixture.downloads[0].options.expires_at<=Math.floor(Date.now()/1000)+61)
    const cloudSnapshot=pack(db,root,migrated.references)
    const parsed=JSON.parse(zlib.gunzipSync(cloudSnapshot))
    assert.deepEqual(parsed.files,{})
    assert.equal(Object.keys(parsed.cloudFiles).length,1)
    assert.equal(JSON.parse(zlib.gunzipSync(initial)).files['resources/lesson.docx'],Buffer.from('private lesson contents').toString('base64'))
    fs.rmSync(root,{recursive:true});unpack(cloudSnapshot,root)
    assert.equal(fs.existsSync(path.join(root,'resources','lesson.docx')),false)
    await media.hydrate(root,'resources/lesson.docx',migrated.references)
    assert.equal(fs.readFileSync(path.join(root,'resources','lesson.docx'),'utf8'),'private lesson contents')
    const again=await media.persist(root,migrated.references,new Map())
    assert.equal(again.migrated,0)
    assert.equal(fixture.uploads.length,1)
    const backup=JSON.parse(zlib.gunzipSync(pack(db,root)))
    assert.ok(backup.files['resources/lesson.docx'])
  } finally {fs.rmSync(root,{recursive:true,force:true})}
})

test('failed verification keeps local data and forged provider references are rejected',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sms-cloud-fail-'))
  const fixture=cloudinaryFixture(),media=createCloudinaryStore(fixture)
  try {
    const file=path.join(root,'receipt.pdf');fs.writeFileSync(file,'%PDF-private-receipt')
    fixture.failDownloads=true
    await assert.rejects(()=>media.store(file,'payment-receipts/receipt.pdf'),/retained/)
    assert.equal(fs.readFileSync(file,'utf8'),'%PDF-private-receipt')
    assert.throws(()=>media.validate({cloudName:'other-cloud'}),/Invalid/)
    await assert.rejects(()=>media.hydrate(root,'../outside',{}),/Invalid school file path/)
    const unconfigured=createCloudinaryStore({env:{}})
    assert.equal(unconfigured.configured,false)
    await assert.rejects(()=>unconfigured.store(file,'payment-receipts/receipt.pdf'),/retained/)
  } finally {fs.rmSync(root,{recursive:true,force:true})}
})
