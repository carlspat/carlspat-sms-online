const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { openDatabase } = require('./storage.cjs')
const { createServices } = require('./services.cjs')
const { createSync } = require('./sync.cjs')

let services
let cloudSync
function createWindow() {
  const win = new BrowserWindow({ title: 'OlufunmilayoSMS', icon: path.join(__dirname, '..', 'build', 'icon.ico'), width: 1440, height: 920, minWidth: 960, minHeight: 640, backgroundColor: '#f5f6fa', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  win.removeMenu()
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:5173"]}}))
  if (!app.isPackaged) win.loadURL('http://127.0.0.1:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' } })
}

app.whenReady().then(async () => {
  // Keep school records in the original product-name folder after the app was
  // rebranded, so upgrades continue using the database users already created.
  for (const previousName of ['Northstar School Management', 'OlufunmilyoSMS']) {
    const previousUserDataPath = path.join(app.getPath('appData'), previousName)
    try {
      await fs.access(path.join(previousUserDataPath, 'northstar-school.sqlite3'))
      app.setPath('userData', previousUserDataPath)
      break
    } catch { /* Try the next previous product name before using the default. */ }
  }
  const dbPath = path.join(app.getPath('userData'), 'northstar-school.sqlite3')
  const db = openDatabase(dbPath)
  services = createServices(db)
  cloudSync = createSync(db, app, safeStorage)
  cloudSync.startAutomaticSync()
  const handlers = {
    'receipts:list': (_,token) => services.paymentReceipts.list(token),
    'receipts:read': (_,token,id) => services.paymentReceipts.read(token,id),
    'setup:status': () => services.auth.needsSetup(),
    'auth:setup': (_, input) => services.auth.createFirstAdmin(input),
    'auth:login': (_, input) => services.auth.login(input),
    'auth:logout': (_, token) => services.auth.logout(token),
    'auth:me': (_, token) => services.auth.me(token),
    'cloud-sync:status': async (_, token) => { const user=services.auth.me(token);if(!user.permissions.includes('school.manage'))throw new Error('Only a school administrator can manage cloud sync.');return cloudSync.status() },
    'cloud-sync:connect': async (_, token, input) => { const user=services.auth.me(token);if(!user.permissions.includes('school.manage'))throw new Error('Only a school administrator can manage cloud sync.');return cloudSync.connect(input) },
    'cloud-sync:run': async (_, token) => { const user=services.auth.me(token);if(!user.permissions.includes('school.manage'))throw new Error('Only a school administrator can manage cloud sync.');return cloudSync.run() },
    'cloud-sync:initial': async (_, token) => { const user=services.auth.me(token);if(!user.permissions.includes('school.manage'))throw new Error('Only a school administrator can manage cloud sync.');const queued=cloudSync.queueFullSnapshot();const result=await cloudSync.run();return {...result,initialRecordsQueued:queued} },
    'cloud-sync:disconnect': async (_, token) => { const user=services.auth.me(token);if(!user.permissions.includes('school.manage'))throw new Error('Only a school administrator can manage cloud sync.');return cloudSync.disconnect() },
    'stakeholders:self-register': (_, input) => services.stakeholders.selfRegister(input),
    'school:get': (_, token) => services.school.get(token),
    'school:update': (_, token, input) => services.school.update(token, input),
    'school:logo': (_, token, source) => services.school.setLogo(token, source),
    'school:academic-data': (_, token) => services.school.academicData(token),
    'school:create-session': (_, token, input) => services.school.createSession(token, input),
    'school:create-term': (_, token, input) => services.school.createTerm(token, input),
    'school:update-session': (_, token, id, input) => services.school.updateSession(token, id, input),
    'school:update-term': (_, token, id, input) => services.school.updateTerm(token, id, input),
    'dashboard:summary': (_, token) => services.dashboard.summary(token),
    'students:list': (_, token, filters) => services.students.list(token, filters),
    'students:create': (_, token, input) => services.students.create(token, input),
    'students:update': (_, token, id, input) => services.students.update(token, id, input),
    'students:archive': (_, token, id) => services.students.archive(token, id),
    'students:profile': (_, token, id) => services.students.profile(token, id),
    'students:status': (_, token, id, input) => services.students.changeStatus(token, id, input),
    'classes:list': (_, token) => services.classes.list(token),
    'classes:create': (_, token, input) => services.classes.create(token, input),
    'classes:assign-teacher': (_, token, input) => services.classes.assignTeacher(token, input),
    'classes:assignments': (_, token) => services.classes.assignments(token),
    'classes:teachers': (_, token) => services.classes.teachers(token),
    'classes:subjects': (_, token) => services.classes.classSubjects(token),
    'classes:assign-subject': (_, token, input) => services.classes.assignSubject(token, input),
    'calendar:list': (_, token) => services.calendar.list(token),
    'calendar:event': (_, token, input) => services.calendar.addEvent(token, input),
    'calendar:timetable': (_, token, input) => services.calendar.addTimetable(token, input),
    'fees:categories': (_, token) => services.finance.categories(token),
    'fees:create-category': (_, token, input) => services.finance.createCategory(token, input),
    'fees:update-category': (_, token, id, input) => services.finance.updateCategory(token, id, input),
    'fees:delete-category': (_, token, id) => services.finance.deleteCategory(token, id),
    'users:list': (_, token) => services.users.list(token),
    'users:create': (_, token, input) => services.users.create(token, input),
    'users:update': (_, token, id, input) => services.users.update(token, id, input),
    'users:reset-password': (_, token, id, password) => services.users.resetPassword(token, id, password),
    'users:deactivate': (_, token, id) => services.users.deactivate(token, id),
    'finance:summary': (_, token, period) => services.finance.summary(token, period),
    'finance:my-account': (_, token) => services.finance.myAccount(token),
    'finance:record-payment': (_, token, input) => services.finance.recordPayment(token, input),
    'finance:payments': (_, token, filter) => services.finance.payments(token, filter),
    'finance:reverse-payment': (_, token, id, reason) => services.finance.reversePayment(token, id, reason),
    'finance:receipt': (_, token, receiptNumber) => services.finance.receipt(token, receiptNumber),
    'finance:expenses': (_, token) => services.finance.expenses(token),
    'finance:expense-categories': (_, token) => services.finance.expenseCategories(token),
    'finance:add-expense-category': (_, token, input) => services.finance.addExpenseCategory(token, input),
    'finance:update-expense-category': (_, token, id, input) => services.finance.updateExpenseCategory(token, id, input),
    'finance:delete-expense-category': (_, token, id) => services.finance.deleteExpenseCategory(token, id),
    'finance:add-expense': (_, token, input) => services.finance.addExpense(token, input),
    'finance:update-expense': (_, token, id, input) => services.finance.updateExpense(token, id, input),
    'finance:delete-expense': (_, token, id) => services.finance.deleteExpense(token, id),
    'finance:outstanding': (_, token, filters) => services.finance.outstanding(token, filters),
    'finance:assignments': (_, token) => services.finance.feeAssignments(token),
    'finance:assign-fee': (_, token, input) => services.finance.assignFee(token, input),
    'finance:update-assignment': (_, token, id, input) => services.finance.updateFeeAssignment(token, id, input),
    'finance:delete-assignment': (_, token, id) => services.finance.deleteFeeAssignment(token, id),
    'finance:discount': (_, token, input) => services.finance.grantDiscount(token, input),
    'academics:subjects': (_, token) => services.academics.subjects(token),
    'academics:grading-scales': (_, token) => services.academics.gradingScales(token),
    'academics:add-grade': (_, token, input) => services.academics.addGrade(token, input),
    'academics:create-subject': (_, token, input) => services.academics.createSubject(token, input),
    'academics:components': (_, token, filter) => services.academics.components(token, filter),
    'academics:create-component': (_, token, input) => services.academics.createComponent(token, input),
    'academics:record-result': (_, token, input) => services.academics.recordResult(token, input),
    'academics:results': (_, token, filter) => services.academics.results(token, filter),
    'academics:submit-results': (_, token, input) => services.academics.submitResults(token, input),
    'academics:approve-results': (_, token, input) => services.academics.approveResults(token, input),
    'academics:promotion': (_, token, input) => services.academics.setPromotion(token, input),
    'academics:report-cards': (_, token, filter) => services.academics.reportCards(token, filter),
    'academics:report-comments': (_, token, input) => services.academics.saveReportComments(token, input),
    'academics:publish-report': (_, token, id) => services.academics.publishReport(token, id),
    'academics:report-access': (_, token, studentId, sessionId, termId) => services.academics.getReportCard(token, studentId, sessionId, termId),
    'attendance:list': (_, token, filter) => services.attendance.list(token, filter),
    'attendance:mark': (_, token, records) => services.attendance.mark(token, records),
    'attendance:classes': (_, token) => services.attendance.classes(token),
    'stakeholders:list': (_, token) => services.stakeholders.list(token),
    'stakeholders:registrations': (_, token) => services.stakeholders.registrations(token),
    'stakeholders:register': (_, token, input) => services.stakeholders.register(token, input),
    'stakeholders:update': (_, token, id, input) => services.stakeholders.update(token, id, input),
    'stakeholders:deactivate': (_, token, id) => services.stakeholders.deactivate(token, id),
    'stakeholders:review': (_, token, id, decision) => services.stakeholders.review(token, id, decision),
    'stakeholders:review-student': (_, token, id, input) => services.stakeholders.reviewStudent(token, id, input),
    'stakeholders:record-student': (_, token, input) => services.stakeholders.recordStudent(token, input),
    'stakeholders:update-payment': (_, token, id, input) => services.stakeholders.updatePayment(token, id, input),
    'portal:register-student': (_, token, input) => services.stakeholders.registerStudent(token, input),
    'portal:my-registrations': (_, token) => services.stakeholders.myRegistrations(token),
    'announcements:list': (_, token) => services.communication.announcements(token),
    'announcements:create': (_, token, input) => services.communication.createAnnouncement(token, input),
    'messages:list': (_, token) => services.communication.messages(token),
    'messages:send': (_, token, input) => services.communication.sendMessage(token, input),
    'messages:recipients': (_, token) => services.communication.recipients(token),
    'messages:read': (_, token, id) => services.communication.markMessageRead(token, id),
    'notifications:list': (_, token) => services.communication.notifications(token),
    'notifications:read': (_, token, id) => services.communication.markRead(token, id),
    'resources:list': (_, token) => services.resources.list(token),
    'resources:read': (_, token, id) => services.resources.read(token, id),
    'reports:student-register': (_, token, filters) => services.reports.studentRegister(token, filters),
    'reports:financial': (_, token, filters) => services.reports.financial(token, filters),
    'reports:data': (_, token, kind, filters) => services.reports.data(token, kind, filters),
    'backups:create': (_, token, target) => services.backups.create(token, target),
    'backups:restore': (_, token, source) => services.backups.restore(token, source),
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, async (event, ...args) => {
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith('file://') && !event.senderFrame.url.startsWith('http://127.0.0.1:5173')) throw new Error('Untrusted application frame')
    try { return { ok: true, data: await handler(event, ...args) } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'The operation failed.' } }
  })
  ipcMain.handle('resources:choose-upload', async (event, token, input) => {
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith('file://') && !event.senderFrame.url.startsWith('http://127.0.0.1:5173')) return { ok:false, error:'Untrusted application frame' }
    try { const selected=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'School learning resources',extensions:['pdf','docx','pptx','xlsx','jpg','jpeg','png','txt']}]});if(selected.canceled)return{ok:true,data:null};return{ok:true,data:services.resources.upload(token,selected.filePaths[0],input)} }
    catch(error){return{ok:false,error:error instanceof Error?error.message:'Resource upload failed.'}}
  })
  ipcMain.handle('school:choose-logo', async (event, token) => {
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith('file://') && !event.senderFrame.url.startsWith('http://127.0.0.1:5173')) return { ok:false, error:'Untrusted application frame' }
    try { const selected=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'School logo image',extensions:['png','jpg','jpeg','webp']}]});if(selected.canceled)return{ok:true,data:null};return{ok:true,data:services.school.setLogo(token,selected.filePaths[0])} }
    catch(error){return{ok:false,error:error instanceof Error?error.message:'School logo upload failed.'}}
  })
  ipcMain.handle('students:choose-photo', async (event) => {
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith('file://') && !event.senderFrame.url.startsWith('http://127.0.0.1:5173')) return { ok:false, error:'Untrusted application frame' }
    try {
      const selected=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Student photograph',extensions:['jpg','jpeg','png','webp']}]})
      if(selected.canceled||!selected.filePaths[0])return{ok:true,data:null}
      const source=selected.filePaths[0],folder=path.join(app.getPath('userData'),'student-photos')
      await fs.mkdir(folder,{recursive:true})
      const ext=path.extname(source).toLowerCase(),name=`${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,destination=path.join(folder,name)
      await fs.copyFile(source,destination)
      return{ok:true,data:destination}
    } catch(error) { return {ok:false,error:error instanceof Error?error.message:'Student photo selection failed.'} }
  })
  ipcMain.handle('backups:choose-create', async (event, token) => {
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith('file://') && !event.senderFrame.url.startsWith('http://127.0.0.1:5173')) return { ok:false, error:'Untrusted application frame' }
    try { const selected=await dialog.showSaveDialog({title:'Save school database backup',defaultPath:path.join(app.getPath('documents'),`northstar-backup-${new Date().toISOString().slice(0,10)}.sqlite3`),filters:[{name:'SQLite backup',extensions:['sqlite3','db']}]});if(selected.canceled||!selected.filePath)return{ok:true,data:null};return{ok:true,data:services.backups.create(token,selected.filePath)} }
    catch(error){return{ok:false,error:error instanceof Error?error.message:'Backup failed.'}}
  })
  ipcMain.handle('backups:choose-restore', async (event, token) => {
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith('file://') && !event.senderFrame.url.startsWith('http://127.0.0.1:5173')) return { ok:false, error:'Untrusted application frame' }
    try { const selected=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'SQLite backup',extensions:['sqlite3','db']}]});if(selected.canceled)return{ok:true,data:null};return{ok:true,data:services.backups.restore(token,selected.filePaths[0])} }
    catch(error){return{ok:false,error:error instanceof Error?error.message:'Restore failed.'}}
  })
  ipcMain.handle('online:export-backup', async (event, token) => {
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith('file://') && !event.senderFrame.url.startsWith('http://127.0.0.1:5173')) return {ok:false,error:'Untrusted application frame'}
    try {
      const user = services.auth.me(token)
      if (!user.permissions.includes('backups.manage')) throw new Error('Only a school administrator can export school data.')
      const selected = await dialog.showSaveDialog({title:'Export school for online migration',defaultPath:path.join(app.getPath('documents'),'olufunmilyo-online.smsbackup'),filters:[{name:'Online school backup',extensions:['smsbackup']}]})
      if (selected.canceled || !selected.filePath) return {ok:true,data:null}
      const {bytes,missingFiles} = require('./portable-backup.cjs').portableBackup(db)
      await fs.writeFile(selected.filePath,bytes)
      return {ok:true,data:{filePath:selected.filePath,missingFiles:missingFiles.length}}
    } catch(error) {return {ok:false,error:error.message || 'Export failed.'}}
  })
  ipcMain.handle('receipts:choose-upload', async(event,token,input)=>{
    if (event.senderFrame?.url && !event.senderFrame.url.startsWith('file://') && !event.senderFrame.url.startsWith('http://127.0.0.1:5173')) return {ok:false,error:'Untrusted application frame'}
    try {
      services.auth.me(token)
      const selected=await dialog.showOpenDialog({title:'Upload payment receipt',properties:['openFile'],filters:[{name:'Payment receipt',extensions:['pdf','png','jpg','jpeg']}]})
      if(selected.canceled||!selected.filePaths[0])return {ok:true,data:null}
      return {ok:true,data:services.paymentReceipts.upload(token,selected.filePaths[0],input)}
    }catch(error){return {ok:false,error:error.message||'Receipt upload failed.'}}
  })
  createWindow()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
