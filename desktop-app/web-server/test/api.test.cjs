const {test} = require('node:test')
const assert = require('node:assert/strict')
process.env.DATABASE_URL = 'postgresql://not-used-in-test'
process.env.SETUP_KEY = 'private-test-setup-key-123456789'
process.env.CORS_ORIGIN = 'https://school.example.test'
process.env.PORT = '0'
const {start} = require('../server.cjs')

// Model durable Postgres state without touching the user's live Supabase project.
// SQL locking is verified by inspection; concurrency in this test exercises the
// API's request queue. A real Postgres integration check is still required.
class DurablePool {
  constructor() {this.saved = null; this.backups = []}
  async query() {return {rows:[]}}
  async connect() {
    let pending = this.saved
    return {release(){},query:async(sql,args)=>{
      if(sql.startsWith('SELECT payload')) return {rows:pending?[{payload:pending}]:[]}
      if(sql.startsWith('INSERT INTO desktop_web.school_state')) pending = args[0]
      if(sql.startsWith('INSERT INTO desktop_web.backup_history')) this.backups.push(args[0])
      if(sql==='COMMIT') this.saved = pending
      return {rows:[]}
    }}
  }
}
test('browser API setup, authentication, logo upload, durable reload and CORS', async()=>{
  const durable = new DurablePool()
  let server = await start(durable)
  let base = `http://127.0.0.1:${server.address().port}`
  async function rpc(channel,args=[],key) {
    const response = await fetch(`${base}/api/desktop/${encodeURIComponent(channel)}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:process.env.CORS_ORIGIN,...(key?{'X-School-Setup-Key':key}:{})},body:JSON.stringify({args})})
    return {status:response.status,...await response.json()}
  }
  try {
    assert.equal((await rpc('setup:status')).data,true)
    assert.equal((await rpc('auth:setup',[{username:'owner',password:'OwnerPassword123'}])).ok,false)
    const setup = await rpc('auth:setup',[{username:'owner',password:'OwnerPassword123'}],process.env.SETUP_KEY)
    assert.equal(setup.ok,true,JSON.stringify(setup))
    const token=setup.data.token
    assert.equal((await rpc('school:update',[token,{name:'Olufunmilyo Test School',motto:'Learning'}])).ok,true)
    assert.equal((await rpc('school:choose-logo',[token,{name:'logo.png',data:Buffer.from('logo-test').toString('base64')}])).ok,true)
    assert.equal((await rpc('school:get',['wrong-token-123456789012345'])).ok,false)
    await Promise.all(Array.from({length:3},(_,i)=>rpc('school:create-session',[token,{name:`202${i}/202${i+1}`}])) )
    assert.equal((await rpc('school:academic-data',[token])).data.sessions.length,3)
    const partner=await rpc('stakeholders:self-register',[{username:'receipt-partner',password:'PartnerPassword123',email:'partner@example.test',name:'Partner School',phone:'08000000000',representative:'Representative'}])
    const partners=await rpc('stakeholders:list',[token])
    await rpc('stakeholders:review',[token,partners.data[0].id,'Approved'])
    const academic=await rpc('school:academic-data',[token])
    const application=await rpc('portal:register-student',[partner.data.token,{firstName:'Receipt',surname:'Student',gender:'Female',examType:'WAEC',sessionId:academic.data.sessions[0].id}])
    const proof={name:'bank-receipt.pdf',data:Buffer.from('%PDF-1.4\nAPI receipt fixture').toString('base64')}
    const uploaded=await rpc('receipts:choose-upload',[partner.data.token,{purpose:'examinations',registrationId:application.data.id,amount:2500,paidOn:new Date().toISOString().slice(0,10)},proof])
    assert.equal(uploaded.ok,true,JSON.stringify(uploaded))
    await new Promise(resolve=>server.close(resolve))
    server=await start(durable);base=`http://127.0.0.1:${server.address().port}`
    const school=await rpc('school:get',[token])
    assert.equal(school.data.name,'Olufunmilyo Test School')
    assert.ok(school.data.logo_data_url.startsWith('data:image/png;base64,'))
    const downloaded=await rpc('receipts:read',[token,uploaded.data.id])
    assert.equal(downloaded.data.data,proof.data)
    assert.equal((await rpc('receipts:list',[token])).data[0].amount,2500)
    const forbidden=await fetch(`${base}/api/v1/health`,{headers:{Origin:'https://other.example.test'}})
    assert.equal(forbidden.status,403)
    const backup=await rpc('backups:choose-create',[token])
    assert.equal(backup.ok,true)
    assert.equal(durable.backups.length,1)
  } finally {await new Promise(resolve=>server.close(resolve))}
})
