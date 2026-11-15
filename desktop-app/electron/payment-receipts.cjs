const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function createPaymentReceipts(db, app, actor, audit) {
  const host = user => user.permissions.includes('school.manage') || user.permissions.includes('finance.manage') || user.permissions.includes('stakeholders.manage')
  function visible(token, id) {
    const user = actor(token)
    const row = db.prepare('SELECT * FROM payment_receipts WHERE id=?').get(id)
    if (!row || (!host(user) && row.uploaded_by !== user.id)) throw new Error('Payment receipt not found or not accessible.')
    return row
  }
  return {
    list(token) {
      const user = actor(token)
      return db.prepare(`SELECT r.id,r.purpose,r.amount_kobo/100.0 amount,r.paid_on,r.bank_reference,r.original_name,r.size_bytes,r.created_at,u.username uploaded_by,s.first_name||' '||s.surname student_name,s.admission_number,sr.first_name||' '||sr.surname applicant_name,sr.exam_type,ss.name stakeholder_name FROM payment_receipts r JOIN users u ON u.id=r.uploaded_by LEFT JOIN students s ON s.id=r.student_id LEFT JOIN stakeholder_registrations sr ON sr.id=r.registration_id LEFT JOIN stakeholder_schools ss ON ss.id=sr.stakeholder_id ${host(user)?'':'WHERE r.uploaded_by=?'} ORDER BY r.created_at DESC`).all(...(host(user)?[]:[user.id]))
    },
    upload(token, source, input) {
      const user = actor(token)
      if (!user.roles.includes('Parent') && !user.roles.includes('Stakeholder')) throw new Error('Only parents and stakeholders can submit payment receipts.')
      const stakeholder = user.roles.includes('Stakeholder')
      if (stakeholder) {
        if (input.purpose !== 'examinations') throw new Error('Stakeholders may submit examination receipts only.')
        if (!db.prepare("SELECT 1 FROM stakeholder_registrations r JOIN stakeholder_schools ss ON ss.id=r.stakeholder_id WHERE r.id=? AND ss.user_id=? AND ss.status='Approved'").get(input.registrationId,user.id)) throw new Error('Choose a student application belonging to your approved stakeholder school.')
      } else {
        if (!['examinations','school-fees'].includes(input.purpose)) throw new Error('Choose a payment purpose.')
        if (!db.prepare('SELECT 1 FROM student_parents sp JOIN parents p ON p.id=sp.parent_id WHERE sp.student_id=? AND p.user_id=?').get(input.studentId,user.id)) throw new Error('Choose a pupil linked to your parent account.')
      }
      const amount=Number(input.amount)
      if (!Number.isFinite(amount) || amount<=0 || amount>1000000000) throw new Error('Enter a valid positive payment amount.')
      const paidOn=String(input.paidOn||'')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || !Number.isFinite(Date.parse(paidOn)) || new Date(paidOn).toISOString().slice(0,10)!==paidOn || paidOn>new Date().toISOString().slice(0,10)) throw new Error('Enter a valid payment date that is not in the future.')
      const reference=String(input.bankReference||'').trim()
      if (reference.length>120) throw new Error('Payment reference must be 120 characters or fewer.')
      const extension=path.extname(source||'').toLowerCase()
      const mime={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[extension]
      if (!mime || !path.isAbsolute(source) || !fs.existsSync(source)) throw new Error('Select a PDF, PNG, or JPG receipt.')
      const bytes=fs.readFileSync(source)
      if (!bytes.length || bytes.length>5*1024*1024) throw new Error('Receipt files must be between 1 byte and 5 MB.')
      const valid=extension==='.pdf'?bytes.subarray(0,5).toString()==='%PDF-':extension==='.png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255
      if (!valid) throw new Error('The receipt content does not match its PDF or image file type.')
      const id=crypto.randomUUID(),directory=path.join(app.getPath('userData'),'payment-receipts')
      fs.mkdirSync(directory,{recursive:true})
      const stored=path.join(directory,id+extension)
      fs.writeFileSync(stored,bytes)
      try {
        db.prepare('INSERT INTO payment_receipts(id,uploaded_by,student_id,registration_id,purpose,amount_kobo,paid_on,bank_reference,stored_path,original_name,mime_type,size_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,stakeholder?null:input.studentId,stakeholder?input.registrationId:null,input.purpose,Math.round(amount*100),paidOn,reference||null,stored,path.basename(source),mime,bytes.length)
        audit(user.id,'payment_receipt_uploaded','payment_receipts',id,{purpose:input.purpose,amountKobo:Math.round(amount*100)})
      } catch(error) {fs.unlinkSync(stored);throw error}
      return {id}
    },
    read(token,id) {
      const row=visible(token,id)
      return {filename:row.original_name,mimeType:row.mime_type,data:fs.readFileSync(row.stored_path).toString('base64')}
    },
  }
}
module.exports={createPaymentReceipts}
