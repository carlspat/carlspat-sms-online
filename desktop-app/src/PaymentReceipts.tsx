import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { paymentAccountsForRoles } from './payment-accounts'

export default function PaymentReceipts({roles,token}:{roles:string[];token:string}) {
  const stakeholder=roles.includes('Stakeholder'),parent=roles.includes('Parent')&&!stakeholder
  const host=roles.includes('Super Admin')||roles.includes('Finance Officer')||roles.includes('Principal')||roles.includes('ICT Officer')
  const [receipts,setReceipts]=useState<any[]>([]),[targets,setTargets]=useState<any[]>([])
  const [target,setTarget]=useState(''),[purpose,setPurpose]=useState(stakeholder?'examinations':'school-fees')
  const [amount,setAmount]=useState(''),[paidOn,setPaidOn]=useState(new Date().toISOString().slice(0,10)),[reference,setReference]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  useEffect(()=>{
    let live=true
    Promise.all([window.schoolApp.paymentReceipts(token),stakeholder?window.schoolApp.myRegistrations(token):parent?window.schoolApp.students(token):Promise.resolve([])]).then(([rows,choices])=>{if(live){setReceipts(rows);setTargets(choices)}}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not load payment receipts.')})
    return()=>{live=false}
  },[token,stakeholder,parent])
  if(!stakeholder&&!parent&&!host)return null
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');setNotice('')
    try {
      const result=await window.schoolApp.uploadPaymentReceipt(token,{purpose,amount:Number(amount),paidOn,bankReference:reference,...(stakeholder?{registrationId:target}:{studentId:target})})
      if(!result)return
      setReceipts(await window.schoolApp.paymentReceipts(token));setAmount('');setReference('')
      setNotice('Receipt uploaded. The host school can download it and verify the transfer. Your recorded balance changes only after the host updates the payment.')
    }catch(e){setError(e instanceof Error?e.message:'Could not upload receipt.')}finally{setBusy(false)}
  }
  async function download(id:string){
    setError('')
    try {
      const file=await window.schoolApp.readPaymentReceipt(token,id)
      const bytes=Uint8Array.from(atob(file.data),character=>character.charCodeAt(0))
      const url=URL.createObjectURL(new Blob([bytes],{type:file.mimeType}))
      const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(e){setError(e instanceof Error?e.message:'Could not download receipt.')}
  }
  return <section className="panel payment-details" aria-labelledby="payment-receipts-heading">
    <header className="panel-heading"><div><div className="section-kicker">PROOF OF PAYMENT</div><h2 id="payment-receipts-heading">{host?'Submitted payment receipts':'Your payment receipts'}</h2><p>{host?'Download receipts submitted by parents and stakeholder schools. Verify transfers before updating payment records.':'Upload a bank receipt after making a transfer. PDF, PNG and JPG files up to 5 MB are accepted.'}</p></div></header>
    {(parent||stakeholder)&&<form onSubmit={submit} className="payment-receipt-form">
      <div className="form-grid">
        <label>{stakeholder?'Student exam application':'Pupil'}<select required value={target} onChange={e=>setTarget(e.target.value)}><option value="">Select {stakeholder?'an application':'your child'}</option>{targets.map(item=><option key={item.id} value={item.id}>{item.first_name} {item.surname}{stakeholder?` · ${item.exam_type}`:` · ${item.class_name} ${item.arm_name}`}</option>)}</select></label>
        <label>Payment purpose<select required value={purpose} onChange={e=>setPurpose(e.target.value)}>{paymentAccountsForRoles(roles).map(account=><option value={account.purpose} key={account.purpose}>{account.title}</option>)}</select></label>
        <label>Amount on this receipt (₦)<input type="number" min="0.01" step="0.01" max="1000000000" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label>Payment date<input type="date" required max={new Date().toISOString().slice(0,10)} value={paidOn} onChange={e=>setPaidOn(e.target.value)}/></label>
        <label className="wide-field">Bank transaction reference (optional)<input maxLength={120} value={reference} onChange={e=>setReference(e.target.value)}/></label>
      </div>
      {!targets.length&&<p>{stakeholder?'Submit a student exam application before uploading its receipt.':'Your host school must link your pupil to this parent account before you can upload a receipt.'}</p>}
      <button className="button primary" type="submit" disabled={busy||!targets.length}><Upload size={16} aria-hidden="true"/>{busy?'Uploading receipt…':'Choose receipt and upload'}</button>
    </form>}
    {error&&<div className="module-error" role="alert">{error}</div>}{notice&&<div className="module-success" role="status">{notice}</div>}
    {receipts.length?<div className="table-wrap"><table><thead><tr><th>Pupil / applicant</th>{host&&<th>Submitted by</th>}<th>Purpose</th><th>Amount on receipt</th><th>Payment date</th><th>Reference</th><th>Receipt file</th></tr></thead><tbody>{receipts.map(receipt=><tr key={receipt.id}><td>{receipt.student_name||receipt.applicant_name}{receipt.exam_type&&<small> · {receipt.exam_type}</small>}</td>{host&&<td>{receipt.stakeholder_name||receipt.uploaded_by}</td>}<td>{receipt.purpose==='examinations'?'Examinations':'School fees'}</td><td>{new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(receipt.amount)}</td><td>{receipt.paid_on}</td><td>{receipt.bank_reference||'—'}</td><td><button className="button secondary compact" type="button" onClick={()=>void download(receipt.id)}><Download size={15} aria-hidden="true"/>Download receipt</button></td></tr>)}</tbody></table></div>:<p className="payment-instructions">No payment receipts have been submitted yet.</p>}
  </section>
}
