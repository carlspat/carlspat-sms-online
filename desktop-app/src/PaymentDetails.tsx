import { useState } from 'react'
import { Copy, Landmark } from 'lucide-react'
import { paymentAccountsForRoles } from './payment-accounts'
import PaymentReceipts from './PaymentReceipts'

export default function PaymentDetails({ roles, token }: { roles: string[]; token: string }) {
  const [notice, setNotice] = useState('')
  const accounts = paymentAccountsForRoles(roles)
  if (!accounts.length) return null
  async function copyAccount(number: string) {
    try { await navigator.clipboard.writeText(number); setNotice(`Account number ${number} copied.`) }
    catch { setNotice('Select the account number below and copy it manually.') }
  }
  return <><section className="panel payment-details" aria-labelledby="payment-details-heading">
    <header className="panel-heading"><div><div className="section-kicker">BANK TRANSFER</div><h2 id="payment-details-heading">Where to pay</h2><p>Use the account matching the payment purpose.</p></div></header>
    <div className="payment-account-grid">{accounts.map(account => <article className="payment-account" key={account.purpose}>
      <h3><Landmark size={20} aria-hidden="true"/>{account.title}</h3>
      <dl><div><dt>Bank name</dt><dd>{account.bank}</dd></div><div><dt>Account number</dt><dd className="payment-account-number">{account.accountNumber}</dd></div><div><dt>Account name</dt><dd>{account.accountName}</dd></div></dl>
      <button className="button secondary" type="button" onClick={() => void copyAccount(account.accountNumber)} aria-label={`Copy ${account.title} account number`}><Copy size={16} aria-hidden="true"/>Copy account number</button>
    </article>)}</div>
    <p className="payment-instructions">Include the pupil’s name and payment purpose in your transfer narration. Keep your bank receipt. The host school confirms payments and updates the amount paid and outstanding balance.</p>
    <p className="payment-copy-status" role="status" aria-live="polite">{notice}</p>
  </section><PaymentReceipts roles={roles} token={token}/></>
}
