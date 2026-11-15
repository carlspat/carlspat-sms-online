type BalanceRow = {
  name?: string
  admissionNumber?: string
  class_name?: string
  arm_name?: string
  assigned?: number
  discount?: number
  paid?: number
  outstanding?: number
}

const amount = (value: number | undefined) => `NGN ${(Number(value) || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateStamp = () => new Date().toISOString().slice(0, 10)
const safeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'school'
const className = (row: BalanceRow) => [row.class_name, row.arm_name].filter(Boolean).join(' / ') || '—'
const xml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

export async function downloadBalancePdf(rows: BalanceRow[], school: string, logoDataUrl = './olufunmilayo-logo.png') {
  const lines = [school, 'Outstanding student balances', `Generated ${dateStamp()}`, '', 'Student | Class | Amount paid | Outstanding balance', ...rows.map((row) => `${row.name || '—'} | ${className(row)} | ${amount(row.paid)} | ${amount(row.outstanding)}`), '', `Students with outstanding balances: ${rows.length}`, `Total paid: ${amount(rows.reduce((sum, row) => sum + (Number(row.paid) || 0), 0))}`, `Total outstanding: ${amount(rows.reduce((sum, row) => sum + (Number(row.outstanding) || 0), 0))}`]
  const pdf = await createPdf(lines, logoDataUrl)
  download(pdf, `${safeName(school)}-outstanding-balances-${dateStamp()}.pdf`)
}

export async function downloadReceiptPdf(receipt: any, logoDataUrl = './olufunmilayo-logo.png') {
  const fullName = [receipt.first_name, receipt.middle_name, receipt.surname].filter(Boolean).join(' ')
  const lines = [
    receipt.school_name || 'School',
    'OFFICIAL PAYMENT RECEIPT',
    '',
    `Receipt number: ${receipt.receipt_number || '—'}`,
    `Payment date: ${receipt.paid_at ? new Date(receipt.paid_at).toLocaleString('en-NG') : '—'}`,
    '',
    'STUDENT DETAILS',
    `Student: ${fullName || '—'}`,
    `Admission number: ${receipt.admission_number || '—'}`,
    `Class: ${[receipt.class_name, receipt.arm_name].filter(Boolean).join(' ') || '—'}`,
    '',
    'PAYMENT DETAILS',
    `Amount received: ${amount(receipt.amount)}`,
    `Payment method: ${receipt.method || '—'}`,
    `Transaction reference: ${receipt.reference || '—'}`,
    `Status: ${receipt.status || 'Verified'}`,
    '',
    'This receipt confirms a verified payment recorded by the school.',
  ]
  const pdf = await createPdf(lines, logoDataUrl)
  download(pdf, `${safeName(receipt.receipt_number || fullName || 'payment')}-receipt.pdf`)
}

export async function downloadWorkbook(rows: any[], columns: string[], school: string, reportName: string, logoSource = './olufunmilayo-logo.png') {
  const logo = decodeDataUrl(await ensureDataUrl(logoSource))
  const cell = (reference: string, value: unknown) => `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
  const colRef = (index: number) => { let value = index + 1, result = ''; while (value) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26) } return result }
  const headerRows = `<row r="1">${cell('C1', school)}</row><row r="2">${cell('C2', `${reportName} · Generated ${dateStamp()}`)}</row><row r="3"/><row r="4"/>`
  const tableRows = [`<row r="5">${columns.map((column, index) => cell(`${colRef(index)}5`, column)).join('')}</row>`, ...rows.map((row, rowIndex) => `<row r="${rowIndex + 6}">${columns.map((column, columnIndex) => cell(`${colRef(columnIndex)}${rowIndex + 6}`, row[column])).join('')}</row>`)].join('')
  const drawing = `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>4</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="School logo"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1219200" cy="1219200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="${Math.max(2, columns.length)}" width="24" customWidth="1"/></cols><sheetData>${headerRows}${tableRows}</sheetData><drawing r:id="rId1"/></worksheet>`
  const files: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="${logo.extension}" ContentType="${logo.mimeType}"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(reportName.slice(0,31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/worksheets/_rels/sheet1.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
    'xl/drawings/drawing1.xml': drawing,
    'xl/drawings/_rels/drawing1.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.${logo.extension}"/></Relationships>`,
    [`xl/media/logo.${logo.extension}`]: logo.bytes,
  }
  const safeReport = safeName(reportName)
  download(new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeReport}-${dateStamp()}.xlsx`)
}

export async function createPdf(lines: string[], logoDataUrl?: string, photoDataUrl?: string) {
  const pages: string[][] = []
  const pageSize = photoDataUrl ? 28 : 38
  for (let index = 0; index < lines.length; index += pageSize) pages.push(lines.slice(index, index + pageSize))
  const logo = logoDataUrl ? await jpegAsset(logoDataUrl) : null
  const photo = photoDataUrl ? await jpegAsset(photoDataUrl) : null
  const bodies: (string | Uint8Array)[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']
  let logoId: number | undefined
  let photoId: number | undefined
  if (logo) { logoId = bodies.length + 1; bodies.push(imagePdfBody(logo)) }
  if (photo) { photoId = bodies.length + 1; bodies.push(imagePdfBody(photo)) }
  const pageIds: number[] = []
  const clean = (value: string) => value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '?').replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  pages.forEach((page, index) => {
    const pageId = bodies.length + 1
    const streamId = pageId + 1
    pageIds.push(pageId)
    const commands = [] as string[]
    if (logoId) commands.push('q 58 0 0 58 48 716 cm /Logo Do Q')
    if (photoId && index === 0) commands.push('q 76 0 0 98 488 696 cm /Photo Do Q')
    const top = photoId ? 670 : 682
    commands.push('BT', '/F1 10 Tf', `48 ${top} Td`, ...page.flatMap((line, lineIndex) => lineIndex === 0 ? [`(${clean(line)}) Tj`] : ['0 -18 Td', `(${clean(line)}) Tj`]), 'ET')
    const xObjects = [logoId ? `/Logo ${logoId} 0 R` : '', photoId ? `/Photo ${photoId} 0 R` : ''].filter(Boolean).join(' ')
    bodies.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >>${xObjects ? ` /XObject << ${xObjects} >>` : ''} >> /Contents ${streamId} 0 R >>`)
    bodies.push(`<< /Length ${new TextEncoder().encode(commands.join('\n')).length} >>\nstream\n${commands.join('\n')}\nendstream`)
  })
  bodies[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n')]
  const offsets = [0]
  let byteLength = chunks[0].length
  bodies.forEach((body, index) => {
    offsets.push(byteLength)
    const prefix = encoder.encode(`${index + 1} 0 obj\n`)
    const content = typeof body === 'string' ? encoder.encode(body) : body
    const suffix = encoder.encode('\nendobj\n')
    chunks.push(prefix, content, suffix)
    byteLength += prefix.length + content.length + suffix.length
  })
  const xref = byteLength
  const trailer = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  chunks.push(encoder.encode(trailer))
  return new Blob(chunks, { type: 'application/pdf' })
}

async function jpegAsset(dataUrl: string) {
  const image = new Image()
  image.src = dataUrl
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('A document image could not be loaded.')) })
  const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare an image for the document.')
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
  return { bytes: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)), width: canvas.width, height: canvas.height }
}

function imagePdfBody(asset: { bytes: Uint8Array; width: number; height: number }) {
  const header = new TextEncoder().encode(`<< /Type /XObject /Subtype /Image /Width ${asset.width} /Height ${asset.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${asset.bytes.length} >>\nstream\n`)
  return concat([header, asset.bytes, new TextEncoder().encode('\nendstream')])
}

export async function downloadBalanceDocx(rows: BalanceRow[], school: string, logoDataUrl = './olufunmilayo-logo.png') {
  const logo = decodeDataUrl(await ensureDataUrl(logoDataUrl))
  const imageParagraph = logo ? `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="762000" cy="762000"/><wp:docPr id="1" name="School logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="School logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="762000" cy="762000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` : ''
  const headings = ['Student name', 'Class', 'Amount paid', 'Outstanding balance']
  const tableRows = [headings, ...rows.map((row) => [row.name || '—', className(row), amount(row.paid), amount(row.outstanding)])]
  const rowXml = tableRows.map((cells, rowIndex) => `<w:tr>${cells.map((cell) => `<w:tc><w:tcPr>${rowIndex === 0 ? '<w:shd w:fill="17345B"/><w:tcW w:w="2400" w:type="dxa"/>' : ''}</w:tcPr><w:p><w:r>${rowIndex === 0 ? '<w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(cell)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')
  const totalPaid = rows.reduce((sum, row) => sum + (Number(row.paid) || 0), 0)
  const totalDue = rows.reduce((sum, row) => sum + (Number(row.outstanding) || 0), 0)
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${imageParagraph}<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${xml(school)}</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Outstanding student balances</w:t></w:r></w:p><w:p><w:r><w:t>Generated ${dateStamp()} · ${rows.length} students with outstanding balances</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C6D8"/><w:left w:val="single" w:sz="4" w:color="B8C6D8"/><w:bottom w:val="single" w:sz="4" w:color="B8C6D8"/><w:right w:val="single" w:sz="4" w:color="B8C6D8"/><w:insideH w:val="single" w:sz="4" w:color="D8E0EA"/><w:insideV w:val="single" w:sz="4" w:color="D8E0EA"/></w:tblBorders></w:tblPr>${rowXml}</w:tbl><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Total amount paid: ${xml(amount(totalPaid))}</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Total outstanding balance: ${xml(amount(totalDue))}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`
  const files: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logo ? `<Default Extension="${logo.extension}" ContentType="${logo.mimeType}"/>` : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ...(logo ? { 'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${logo.extension}"/></Relationships>`, [`word/media/logo.${logo.extension}`]: logo.bytes } : {}),
    'word/document.xml': documentXml,
  }
  download(new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${safeName(school)}-outstanding-balances-${dateStamp()}.docx`)
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/)
  if (!match) throw new Error('The school logo must be a supported image.')
  const mimeType = match[1]
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png'
  return { mimeType, extension, bytes: Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0)) }
}

async function ensureDataUrl(source: string) {
  if (source.startsWith('data:')) return source
  const response = await fetch(source)
  if (!response.ok) throw new Error('The school logo could not be loaded for this document.')
  const blob = await response.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The school logo could not be prepared.'))
    reader.onerror = () => reject(new Error('The school logo could not be prepared.'))
    reader.readAsDataURL(blob)
  })
}

function zipStore(files: Record<string, string | Uint8Array>) {
  const encoder = new TextEncoder()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const [name, contents] of Object.entries(files)) {
    const fileName = encoder.encode(name)
    const data = typeof contents === 'string' ? encoder.encode(contents) : contents
    const crc = crc32(data)
    const header = new Uint8Array(30 + fileName.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true)
    view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, fileName.length, true)
    header.set(fileName, 30); local.push(header, data)
    const directory = new Uint8Array(46 + fileName.length)
    const centralView = new DataView(directory.buffer)
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0x0800, true)
    centralView.setUint32(16, crc, true); centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true); centralView.setUint16(28, fileName.length, true); centralView.setUint32(42, offset, true)
    directory.set(fileName, 46); central.push(directory); offset += header.length + data.length
  }
  const directorySize = central.reduce((size, part) => size + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, Object.keys(files).length, true); endView.setUint16(10, Object.keys(files).length, true); endView.setUint32(12, directorySize, true); endView.setUint32(16, offset, true)
  return concat([...local, ...central, end])
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}
