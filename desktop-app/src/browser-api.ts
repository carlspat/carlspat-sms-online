import operations from './browser-operations.json'

export const browserMode = !window.schoolApp
const endpoint = (import.meta.env.VITE_SCHOOL_API_URL || '').replace(/\/$/, '')

function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = accept
    input.onchange = () => resolve(input.files?.[0] || null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
async function filePayload(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Online uploads must be 20 MB or smaller.')
  return new Promise<{ name: string; data: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read this file.'))
    reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(',')[1] })
    reader.readAsDataURL(file)
  })
}
function download(filename: string, data: string, mime: string) {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
if (browserMode) {
  const api = Object.fromEntries(Object.entries(operations).map(([name, channel]) => [name, async (...args: unknown[]) => {
    if (!endpoint) throw new Error('The school API address has not been configured for this website.')
    let setupKey: string | null = null
    if (name === 'setupAdmin') {
      const input = args[0] as Record<string, unknown> | undefined
      setupKey = typeof input?.setupKey === 'string' ? input.setupKey.trim() : null
      const { setupKey: _setupKey, ...credentials } = input || {}
      args[0] = credentials
      if (!setupKey) throw new Error('The setup key is required to register the first administrator.')
    }
    if (['chooseSchoolLogo', 'chooseStudentPhoto', 'uploadResource', 'restoreBackup'].includes(name)) {
      const accept = name === 'restoreBackup' ? '.smsbackup' : name === 'uploadResource' ? '.pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.txt' : '.png,.jpg,.jpeg,.webp'
      const file = await pickFile(accept)
      if (!file) return null
      args.push(await filePayload(file))
    }
    const response = await fetch(`${endpoint}/api/desktop/${encodeURIComponent(channel)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(setupKey ? { 'X-School-Setup-Key': setupKey } : {}) },
      body: JSON.stringify({ args }), cache: 'no-store',
    })
    const result = await response.json().catch(() => { throw new Error('The school server is unavailable. Please retry shortly.') })
    if (!response.ok || !result.ok) throw new Error(result.error || 'The school operation failed.')
    if (name === 'createBackup' && result.data) download(result.data.filename, result.data.data, 'application/octet-stream')
    if (name === 'restoreBackup' && result.data) { sessionStorage.removeItem('school-session'); window.location.reload() }
    return result.data
  }]))
  window.schoolApp = api as unknown as Window['schoolApp']
}
