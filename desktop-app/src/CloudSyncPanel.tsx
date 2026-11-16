import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Cloud, CloudUpload, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'
import { browserMode } from './browser-api'
import CloudMediaPanel from './CloudMediaPanel'

type SyncStatus={configured:boolean;apiBaseUrl:string;pending:number;lastSyncAt:string|null;lastError:string|null;deviceId:string|null}

export default function CloudSyncPanel({token}:{token:string}){
  if (browserMode) return <><section className="panel"><h2>Shared online school</h2><p>Changes are saved to the shared school server. This browser requires an internet connection. Desktop synchronization must be configured separately.</p></section><CloudMediaPanel token={token}/></>
  const [status,setStatus]=useState<SyncStatus|null>(null)
  const [apiBaseUrl,setApiBaseUrl]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function refresh(){try{const value=await window.schoolApp.cloudSyncStatus(token);setStatus(value);setApiBaseUrl(value.apiBaseUrl||'')}catch(e){setError(e instanceof Error?e.message:'Could not read sync status.')}}
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),10000);return()=>clearInterval(timer)},[token])
  async function connect(event:FormEvent){event.preventDefault();setBusy(true);setError('');setNotice('');try{const value=await window.schoolApp.connectCloudSync(token,{apiBaseUrl,email,password});setStatus(value);setPassword('');setNotice('Online host account connected. Run the initial sync to copy existing records.')}catch(e){setError(e instanceof Error?e.message:'Could not connect to the online host.')}finally{setBusy(false)}}
  async function run(initial=false){setBusy(true);setError('');setNotice('');try{const value=initial?await window.schoolApp.initialCloudSync(token):await window.schoolApp.runCloudSync(token);setStatus(value);setNotice(initial?`${value.initialRecordsQueued.toLocaleString()} local records queued and synced to the online school.`:'Pending local changes synced to the online school.')}catch(e){const message=e instanceof Error?e.message:'Cloud sync failed. Pending records remain stored locally.';await refresh();setError(message)}finally{setBusy(false)}}
  async function disconnect(){if(!window.confirm('Disconnect cloud sync on this computer? The online copy and local school data will not be deleted.'))return;setBusy(true);try{const value=await window.schoolApp.disconnectCloudSync(token);setStatus(value);setNotice('This computer is disconnected. Existing cloud records were kept.')}catch(e){setError(e instanceof Error?e.message:'Could not disconnect.')}finally{setBusy(false)}}
  return <section className="panel cloud-sync-panel" aria-labelledby="cloud-sync-title">
    <div className="panel-heading"><div><div className="section-kicker">OFFLINE + ONLINE</div><h2 id="cloud-sync-title">Cloud data sync</h2><p>Keep a protected copy of this computer’s local school records in the online school database.</p></div><div className={`sync-state ${status?.configured?'is-connected':'is-disconnected'}`}><span/>{status?.configured?'Connected':'Not connected'}</div></div>
    {status?.configured?<div className="sync-summary"><div><span>Pending changes</span><strong>{status.pending.toLocaleString()}</strong></div><div><span>Last successful sync</span><strong>{status.lastSyncAt?new Date(status.lastSyncAt).toLocaleString():'Not yet synced'}</strong></div><div className="wide-field"><span>Online API</span><strong>{status.apiBaseUrl}</strong></div></div>:null}
    {error&&<div className="module-error" role="alert">{error}</div>}{status?.lastError&&<div className="module-error" role="alert">Latest sync issue: {status.lastError}</div>}{notice&&<div className="module-success" role="status" aria-live="polite">{notice}</div>}
    {status?.configured?<div className="sync-actions"><button className="button primary" disabled={busy} onClick={()=>void run(false)}><RefreshCw size={16}/>{busy?'Syncing…':`Sync pending changes${status.pending?` (${status.pending})`:''}`}</button><button className="button secondary" disabled={busy} onClick={()=>void run(true)}><CloudUpload size={16}/>Copy all local records</button><button className="button secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/>Refresh status</button><button className="button secondary" disabled={busy} onClick={()=>void disconnect()}><Unplug size={16}/>Disconnect</button></div>:<form className="form-grid sync-connect-form" onSubmit={connect}>
      <label className="wide-field">Online API address<input required type="url" placeholder="https://api.yourschool.com" value={apiBaseUrl} onChange={e=>setApiBaseUrl(e.target.value)}/><small>Enter the deployed Express API address, not the Vercel website URL, unless both share the same host.</small></label>
      <label>Online host admin email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Online host admin password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><small>Password is used only to sign in. A refresh token is stored using Windows secure credential storage.</small></label>
      <div className="wide-field sync-actions"><button className="button primary" disabled={busy}><Cloud size={16}/>{busy?'Connecting…':'Connect online school'}</button></div>
    </form>}
    <div className="sync-footnote"><ShieldCheck size={16}/><span>Only host-school administrators can connect. Password hashes and local login sessions are never copied. Pending edits stay in the queue until acknowledged by the API. Local photos and resource files need a separate secure file upload and are not copied by this record sync yet.</span></div>
  </section>
}
