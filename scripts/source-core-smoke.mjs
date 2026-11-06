/* eslint-disable no-console -- isolated browser acceptance prints its evidence */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const base = process.env.PINAX_SOURCE_SMOKE_URL || 'http://127.0.0.1:5307'
const docx = new JSZip()
docx.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
docx.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
docx.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX archive fixture.</w:t></w:r></w:p></w:body></w:document>')
const epub = new JSZip()
epub.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')
epub.file('OEBPS/content.opf', '<package><metadata><dc:title>Source fixture</dc:title><dc:creator>Fixture Author</dc:creator></metadata><manifest><item id="second" href="b.xhtml" media-type="application/xhtml+xml"/><item id="first" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>')
epub.file('OEBPS/b.xhtml', '<html><body><h1>Second</h1><p>The guard returns.</p></body></html>')
epub.file('OEBPS/a.xhtml', '<html><body><h1>First</h1><p>The gate opens.</p></body></html>')
const stream = 'BT /F1 12 Tf 20 200 Td (PDF archive fixture.) Tj ET'
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
let pdf = '%PDF-1.4\n'
const offsets = [0]
for (const [index, object] of objects.entries()) { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` }
const xref = pdf.length
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
const fixtures = { docx: [...await docx.generateAsync({ type: 'uint8array' })], epub: [...await epub.generateAsync({ type: 'uint8array' })], pdf: [...new TextEncoder().encode(pdf)] }
const browser = await chromium.launch({ headless: true })
try {
  // Warm only the isolated dev server; Vite may reload while discovering parser libraries.
  const warm = await browser.newPage()
  await warm.route('**/api/localmirror/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }))
  await warm.goto(base)
  for (let attempt = 0; ; attempt++) {
    try {
      await warm.waitForLoadState('networkidle')
      await warm.evaluate(async data => {
        const libs = await import('/src/services/worldbook/sourceParserLibraries.js')
        await Promise.all([libs.loadSourcePdf(), libs.loadSourceMammoth(), import('/src/services/worldbook/worldbookSourceAdapters.js'), import('/src/services/storage/workspaceBackupBundle.js')])
        await (await import('/src/services/writing/epubAdapter.js')).extractEpub(new Uint8Array(data.epub).buffer)
      }, fixtures)
      break
    } catch (error) { if (attempt >= 2 || !String(error.message).includes('Execution context was destroyed')) throw error }
  }
  await warm.close()
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/api/localmirror/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }))
  await page.goto(base)
  await page.waitForLoadState('networkidle')
  const result = await page.evaluate(async fixtures => {
    const A = await import('/src/services/worldbook/worldbookSourceArchive.js')
    const P = await import('/src/services/worldbook/worldbookSourceAdapters.js')
    const W = await import('/src/services/worldbook/worldbookSourceParser.js')
    const B = await import('/src/services/storage/workspaceBackupBundle.js')
    const check = (value, label) => { if (!value) throw new Error(label) }
    const files = [new File([new TextEncoder().encode('第一章 开门\n守卫打开城门。\n第二章 归来\n守卫从远方返回。')], '章节.txt'), ...['docx', 'epub', 'pdf'].map(kind => new File([new Uint8Array(fixtures[kind])], 'source.' + kind))]
    const reports = await P.parseSourceFiles(files)
    check(reports.every(report => report.status === 'ready'), 'real parser failure: ' + JSON.stringify(reports.map(report => ({ name: report.fileName, status: report.status, error: report.error }))))
    const epub = reports.find(report => report.artifact.kind === 'epub')
    check(epub.artifact.chapters.length === 2, 'EPUB chapters missing')
    const epubText = epub.chunks.map(chunk => chunk.text).join('\n')
    check(epubText.indexOf('The gate opens.') < epubText.indexOf('The guard returns.'), 'EPUB ignored spine order')
    const workerReports = await W.parseSourceFilesWithWorker(files)
    check(workerReports.every(report => report.status === 'ready') && workerReports[0].artifact.chapters.length === 2, 'worker parser contract failed: ' + JSON.stringify(workerReports.map(report => ({ status: report.status, error: report.error }))))
    const stopped = new AbortController()
    const cancelled = W.parseSourceFilesWithWorker([files[0]], { signal: stopped.signal })
    stopped.abort()
    let cancelledCorrectly = false
    try { await cancelled } catch (error) { cancelledCorrectly = error.name === 'AbortError' }
    check(cancelledCorrectly, 'worker cancellation was not acknowledged')
    for (const report of reports) await A.saveSourceArchiveBundle({ artifact: report.artifact, chunks: report.chunks })
    const concurrent = A.buildSourceArchiveBundle({ id: 'concurrent-source', content: '并发重复导入的原文。' })
    const repeated = await Promise.all(Array.from({ length: 8 }, () => A.saveSourceArchiveBundle(concurrent)))
    check(repeated.filter(saved => !saved.reused).length === 1, 'concurrent import duplicated source')
    await A.archiveSourceDocuments([{ id: 'collision-A', content: 'costarring' }, { id: 'collision-B', content: 'liquid' }])
    await A.saveCreationWorkspace({ id: 'source-workspace', sourceIds: [reports[0].artifact.id], pastedText: '仍待编辑的输入', sourceInputMode: 'text', generationState: 'generating', generationAction: 'sources' })
    const { createBrowserSourceArchiveStore } = await import('/src/services/worldbook/browserSourceArchiveStore.js')
    let unavailable = false
    const broken = createBrowserSourceArchiveStore({ getIndexedDB: () => unavailable ? undefined : { open() { const request = {}; queueMicrotask(() => { request.error = new Error('open failed fixture'); request.onerror() }); return request } } })
    let openRejected = false
    try { await broken.write({ artifacts: { put: [{ id: 'must-not-fall-back' }] } }) } catch { openRejected = true }
    unavailable = true
    check(openRejected && (await broken.readAll('artifacts')).length === 0, 'failed IDB silently fell back to memory')
    const before = await A.loadAllSourceArchiveRecords()
    let failed = false
    try { await A.restoreSourceArchiveRecords({ artifacts: [{ ...reports[0].artifact, id: 'must-rollback' }], chunks: [{}] }) } catch (error) { failed = error.name === 'DataError' }
    check(failed, 'invalid IDB write did not fail')
    check(JSON.stringify(await A.loadAllSourceArchiveRecords()) === JSON.stringify(before), 'multi-store IDB write was partially committed')
    const backup = await B.buildWorkspaceBackupBundle()
    await A.replaceAllSourceArchiveRecords({})
    const restored = await B.restoreWorkspaceBackupBundle(backup.bytes, { overwrite: true, acceptRestoreRisk: true })
    check(restored.success, 'ZIP source restore failed: ' + restored.reason)
    check(JSON.stringify(await A.loadAllSourceArchiveRecords()) === JSON.stringify(before), 'ZIP changed source IDs/chunks/locators')
    return { artifacts: before.artifacts.length, chunks: before.chunks.length, parsed: reports.length, zipBytes: backup.bytes.length }
  }, fixtures)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.evaluate(async result => {
    const A = await import('/src/services/worldbook/worldbookSourceArchive.js')
    const restored = await A.loadAllSourceArchiveRecords()
    if (restored.artifacts.length !== result.artifacts || restored.chunks.length !== result.chunks) throw new Error('reload lost archived sources')
    const workspace = await A.loadCreationWorkspace('source-workspace')
    if (workspace.pastedText !== '仍待编辑的输入' || workspace.sourceInputMode !== 'text' || workspace.generationState !== 'cancelled') throw new Error('workspace recovery lost input')
    if (!restored.chunks.some(chunk => chunk.text === 'costarring') || !restored.chunks.some(chunk => chunk.text === 'liquid')) throw new Error('hash collision lost text')
    await A.replaceAllSourceArchiveRecords({})
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(A.SOURCE_ARCHIVE_DB_NAME)
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('source adapter leaked an open DB connection'))
    })
  }, result)
  assert.deepEqual(errors, [])
  console.log('PASS real Host: TXT/DOCX/EPUB/PDF, worker, concurrent dedupe/collision, atomic IDB failure, ZIP, refresh and workspace recovery', result)
} finally { await browser.close() }
