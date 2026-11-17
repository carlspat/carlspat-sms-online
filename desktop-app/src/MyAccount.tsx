import {useState} from 'react'

export default function MyAccount({user,token,onSignOut}:{user:SchoolUser;token:string;onSignOut:()=>void}) {
  const [username,setUsername]=useState(user.username),[email,setEmail]=useState(user.email||'')
  const [currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[confirmation,setConfirmation]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
  async function save(event:React.FormEvent) {
    event.preventDefault();setError('')
    if(newPassword!==confirmation){setError('New passwords do not match.');return}
    setBusy(true)
    try{await window.schoolApp.updateOwnAccount(token,{username,email,currentPassword,newPassword});sessionStorage.removeItem('school-session');setCurrentPassword('');setNewPassword('');setConfirmation('');setSaved(true)}
    catch(e){setError(e instanceof Error?e.message:'Could not update your account.')}
    finally{setBusy(false)}
  }
  return <section className="panel" style={{maxWidth:720}}><div className="section-kicker">ACCOUNT SECURITY</div><h1>My account</h1>
    {saved?<div role="status"><p>Your login details have been updated. All previous sessions have been signed out.</p><button className="button primary" onClick={onSignOut}>Sign in with updated details</button></div>:<form onSubmit={save}>
      <p>Change your own login details. Your current password is required. Leave the new password blank to keep it. Saving signs out all your sessions.</p>
      {error&&<p className="module-error" role="alert">{error}</p>}
      <div className="form-grid">
        <label>Username<input required maxLength={60} autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label>
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label>Current password<input type="password" required autoComplete="current-password" maxLength={200} value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>
        <label>New password<input type="password" minLength={10} maxLength={200} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><small>10–200 characters when changing your password.</small></label>
        <label>Confirm new password<input type="password" maxLength={200} autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
      </div><button className="button primary" disabled={busy}>{busy?'Saving…':'Save login details'}</button>
    </form>}
  </section>
}
