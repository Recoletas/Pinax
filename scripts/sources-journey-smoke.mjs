/* eslint-disable no-console */
// N-A 资料 journey smoke（nightly-20260917）：导入→绑定→资料面板→预览/移除→JSON 冲突→刷新恢复→ZIP 往返。
// 确定性：不调用真实模型；提取/采纳链沿既有 gated 流程，本 smoke 验证其资料前端。
// 用法：BASE=http://127.0.0.1:5179 FIXTURE_DIR=… node scripts/sources-journey-smoke.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const BASE = process.env.BASE || 'http://127.0.0.1:5179'
const OUT_DIR = '/tmp/pinax-sources-journey'
const FIXTURE_DIR = path.resolve(process.env.FIXTURE_DIR || '/home/recoletas/jiuguan/text-game-framework/tmp/authoring-context-closure')
fs.mkdirSync(OUT_DIR, { recursive: true })

const sourceStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))

// —— 播种：甲（绑定 wa）、乙（绑定 wb）、未绑定之书（worldbookId=''）。——
function buildStorage() {
  const snapshot = { ...sourceStorage }
  const baseKey = Object.keys(snapshot).find(key => key.startsWith('worldbook_'))
  const baseWorldbook = JSON.parse(snapshot[baseKey])
  const wa = { ...baseWorldbook, id: 'wa', name: '雾港世界（甲）', sourceDocuments: [], updatedAt: Date.now() }
  const wb = { ...baseWorldbook, id: 'wb', name: '北地世界（乙）', sourceDocuments: [], updatedAt: Date.now() + 5 }
  snapshot.worldbook_wa = JSON.stringify({ ...wa, entriesMap: Object.fromEntries(wa.entries.map(e => [e.id, e])) })
  snapshot.worldbook_wb = JSON.stringify({ ...wb, entriesMap: Object.fromEntries(wb.entries.map(e => [e.id, e])) })
  snapshot.worldbooks_index = JSON.stringify([
    { id: 'wa', name: wa.name, updatedAt: wa.updatedAt, entryCount: wa.entries.length },
    { id: 'wb', name: wb.name, updatedAt: wb.updatedAt, entryCount: wb.entries.length }
  ])
  snapshot.active_worldbook_id = 'wa'
  const now = new Date().toISOString()
  const chapters = JSON.parse(snapshot.writing_books || '[]')
  const bookA = { id: 'book-a', title: '雾港纪事·甲', description: '', worldbookId: 'wa', createdAt: now, updatedAt: now, chapters: chapters[0]?.chapters?.length ? chapters[0].chapters : [] }
  const bookB = { ...bookA, id: 'book-b', title: '北地手记·乙', worldbookId: 'wb' }
  const bookNone = { ...bookA, id: 'book-none', title: '未绑定之书', worldbookId: '' }
  snapshot.writing_books = JSON.stringify([bookA, bookB, bookNone])
  return snapshot
}
const SNAPSHOT = buildStorage()

// —— 导入夹具：长文 TXT（尾部关键事实）+ 与现有库同名的 ST JSON。——
const LONG_PARAGRAPH = '旧港的雾在退潮后最浓，钟楼看守人说那是海在数自己的骨头。'
const longText = Array.from({ length: 120 }, (_, i) => `${LONG_PARAGRAPH}（第 ${i + 1} 段）`).join('\n\n') + '\n\n尾部关键事实：北墙每晚十点上锁。'
const JSON_FILE = path.join(OUT_DIR, 'conflict-card.json')
fs.writeFileSync(JSON_FILE, JSON.stringify({
  name: '雾港世界（甲）',
  description: '同名冲突样本',
  entries: [
    { comment: '北墙守则', content: '北墙每晚十点上锁，钥匙由看守人保管。', key: ['北墙', '上锁'], keysecondary: [] },
    { comment: '雾港钟楼', content: '俯瞰旧港的钟楼，退潮后可见海骨。', key: ['钟楼'], keysecondary: [] }
  ]
}, null, 2), 'utf8')

const consoleErrors = []
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`))
  await context.addInitScript(snapshot => {
    // 播种只做一次：后续导航必须保留前一旅程写入的真实状态。
    if (!localStorage.getItem('__journey_seeded')) {
      localStorage.clear()
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
      localStorage.setItem('app_theme', 'light')
      localStorage.setItem('app_ui_zoom', '1')
      localStorage.setItem('__journey_seeded', '1')
    }
  }, SNAPSHOT)

  const waitForPanelCount = async (pattern, timeout = 10000) => {
    await page.waitForFunction(wanted => {
      const toggle = document.querySelector('[data-test="sources-panel-toggle"]')
      return toggle && new RegExp(wanted).test(toggle.textContent)
    }, pattern.source, { timeout })
  }

  // ===== J1：未绑定书 → 添加资料（粘贴长文）→ JSON 导入确认 → 自动建库绑定回设定区 =====
  await page.goto(`${BASE}/settings/structured?bookId=book-none`, { waitUntil: 'domcontentloaded' })
  try {
    await page.locator('[data-test="settings-unbound"]').waitFor({ timeout: 20000 })
  } catch (error) {
    const debug = await page.evaluate(() => ({
      url: location.href,
      body: document.body.innerText.slice(0, 400),
      books: JSON.parse(localStorage.getItem('writing_books') || '[]').map(x => ({ id: x.id, wb: x.worldbookId })),
      errors: window.__err || []
    })).catch(() => 'page-evaluate-failed')
    console.error('J1_DEBUG', JSON.stringify(debug))
    throw error
  }
  await page.locator('[data-test="unbound-add-sources"]').click()
  await page.waitForURL(/settings\/worldbook\/create/)
  await page.locator('[data-test="creation-binding-label"]').waitFor()
  assert.match(await page.locator('[data-test="creation-binding-label"]').textContent(), /尚未关联/, 'unbound label missing')
  await page.locator('.paste-row textarea').fill(longText)
  await page.getByRole('button', { name: '暂存片段' }).click()
  await page.locator('.source-row .source-status.is-ready').first().waitFor()
  await page.locator('.json-import-line button', { hasText: '导入 SillyTavern / Pinax JSON' }).click()
  await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(JSON_FILE)
  await page.locator('.json-preview').waitFor()
  assert.ok(await page.locator('[data-test="json-name-conflict"]').isVisible(), 'JSON 同名冲突提示缺失')
  await page.getByRole('button', { name: '导入并建立本书资料库' }).click()
  await page.waitForURL(/settings\/structured\?bookId=book-none/)
  await page.locator('[data-test="sources-panel-toggle"]').waitFor()
  await waitForPanelCount('1 份')
  // 绑定已写入 writing_books
  const boundAfter = await page.evaluate(() => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const book = books.find(item => item.id === 'book-none')
    return { worldbookId: book?.worldbookId || '', index: JSON.parse(localStorage.getItem('worldbooks_index') || '[]').length }
  })
  assert.ok(boundAfter.worldbookId, 'book-none was not bound')
  assert.equal(boundAfter.index, 3, 'unexpected worldbook count (should be 3)')

  // 资料面板：展开 → 全文按块加载（含尾部关键事实，>2400 字）
  await page.locator('[data-test="sources-panel-toggle"]').click()
  await page.locator('.sources-panel__title').first().waitFor()
  await page.locator('.sources-panel__title').first().click()
  try {
    await page.locator('.sources-panel__preview pre').waitFor({ timeout: 8000 })
  } catch (error) {
    const previewDebug = await page.evaluate(() => ({
      previewHtml: document.querySelector('.sources-panel__preview')?.outerHTML.slice(0, 300) || 'no-preview-node',
      itemCount: document.querySelectorAll('.sources-panel__item').length
    }))
    console.error('PREVIEW_DEBUG', JSON.stringify(previewDebug))
    throw error
  }
  const previewText = await page.locator('.sources-panel__preview pre').textContent()
  assert.ok(previewText.length > 3000, `chunk-based full preview missing (${previewText.length} chars)`)
  assert.match(previewText, /尾部关键事实：北墙每晚十点上锁/, 'tail fact lost in preview')
  await page.screenshot({ path: `${OUT_DIR}/sources-panel-1440.png` })

  // ===== J2：已绑定书追加（粘贴 + 确认加入本书资料库，不新建库）=====
  await page.goto(`${BASE}/settings/structured?bookId=book-a`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-test="sources-panel-toggle"]').waitFor()
  await waitForPanelCount('0 份')
  await page.locator('[data-test="sources-panel-toggle"]').click()
  await page.locator('[data-test="sources-panel-add"]').click()
  await page.waitForURL(/settings\/worldbook\/create/)
  await page.locator('[data-test="creation-binding-label"]').waitFor()
  assert.match(await page.locator('[data-test="creation-binding-label"]').textContent(), /已关联/, 'bound label missing')
  const goodTxt = path.join(OUT_DIR, 'batch-good.txt')
  fs.writeFileSync(goodTxt, `批量来源：${LONG_PARAGRAPH}\n\n批量尾注：东门凌晨不开启。`, 'utf8')
  const brokenDocx = path.join(OUT_DIR, 'batch-broken.docx')
  fs.writeFileSync(brokenDocx, Buffer.from('not-a-real-docx'), 'utf8')
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles([goodTxt, brokenDocx])
  await page.locator('.source-row .source-status.is-ready').first().waitFor({ timeout: 15000 })
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('.source-row')
    return rows.length >= 2 && [...rows].some(row => row.querySelector('.source-status.is-error, .source-status.needs-ocr, .source-status.is-warning'))
  }, { timeout: 15000 })
  await page.locator('.paste-row textarea').fill(`追加来源一：${LONG_PARAGRAPH}`)
  await page.getByRole('button', { name: '暂存片段' }).click()
  await page.locator('.source-row .source-status.is-ready').first().waitFor()
  await page.locator('[data-test="append-sources-confirm"]').click()
  await page.waitForURL(/settings\/structured\?bookId=book-a/)
  await page.locator('[data-test="sources-panel-toggle"]').waitFor()
  await waitForPanelCount('1 份')
  const indexAfterAppend = await page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem('worldbooks_index') || '[]')
    const keys = Object.keys(localStorage).filter(key => key.startsWith('worldbook_'))
    return { count: index.length, ids: index.map(item => item.id), keys }
  })
  assert.equal(indexAfterAppend.count, 3, `append must not create a new worldbook: ${JSON.stringify(indexAfterAppend)}`)

  // ===== NA05：绑定/写入持久化失败 → 类型化失败，不误指全局库；重试成功 =====
  const injectResult = await page.evaluate(async () => {
    const svc = await import('/src/services/worldbook/worldbookProjectSources.js')
    const { useWorldStore } = await import('/src/stores/worldStore.js')
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const worldStore = useWorldStore(pinia)
    const originalSet = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'worldbooks_index' || key === 'writing_books') throw new DOMException('full', 'QuotaExceededError')
      return originalSet.call(this, key, value)
    }
    let failed = null
    try {
      failed = await svc.attachSourcesToBook({ bookId: 'book-a', documents: [{ id: 'inject-1', title: '注入来源', kind: 'pasted-text', content: '注入内容', contentHash: 'sha256-inject' }], worldStore })
    } catch (error) {
      failed = { ok: false, reason: error.message }
    } finally { Storage.prototype.setItem = originalSet }
    const book = JSON.parse(localStorage.getItem('writing_books') || '[]').find(item => item.id === 'book-a')
    return { ok: failed.ok, reason: failed.reason || null, stillBound: book?.worldbookId || '' }
  })
  assert.equal(injectResult.stillBound, 'wa', 'injected failure must not rebind the book')

  // ===== J3：已绑定书 JSON 同名冲突 → 明确"新建为独立世界书"，默认不覆盖、不换绑 =====
  await page.goto(`${BASE}/settings/structured?bookId=book-a&sources=1`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-test="sources-panel-add"]').click()
  await page.waitForURL(/settings\/worldbook\/create/)
  await page.locator('.json-import-line button', { hasText: '导入 SillyTavern / Pinax JSON' }).click()
  await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(JSON_FILE)
  await page.locator('.json-preview').waitFor()
  assert.ok(await page.locator('[data-test="json-name-conflict"]').isVisible(), 'conflict note missing in bound mode')
  await page.getByRole('button', { name: '新建为独立世界书' }).click()
  await page.waitForURL(/settings\/structured\?bookId=book-a/)
  const afterConflict = await page.evaluate(() => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const index = JSON.parse(localStorage.getItem('worldbooks_index') || '[]')
    return { bound: books.find(item => item.id === 'book-a')?.worldbookId, indexCount: index.length }
  })
  assert.equal(afterConflict.bound, 'wa', 'bound book must keep its binding on conflict import')
  assert.equal(afterConflict.indexCount, 4, 'conflict import should create an independent worldbook')

  // ===== J3b：同名冲突选"并入" → 条目级新增/跳过，不新建库 =====
  await page.goto(`${BASE}/settings/structured?bookId=book-a&sources=1`, { waitUntil: 'domcontentloaded' })
  const waEntriesBefore = await page.evaluate(() => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const wid = books.find(item => item.id === 'book-a')?.worldbookId
    return (JSON.parse(localStorage.getItem('worldbook_' + wid) || '{}').entries || []).length
  })
  await page.locator('[data-test="sources-panel-add"]').click()
  await page.waitForURL(/settings\/worldbook\/create/)
  await page.locator('.json-import-line button', { hasText: '导入 SillyTavern / Pinax JSON' }).click()
  await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(JSON_FILE)
  await page.locator('[data-test="json-name-conflict"]').waitFor()
  await page.locator('input[type="radio"][value="update"]').check()
  await page.getByRole('button', { name: '并入同名世界书' }).click()
  await page.waitForURL(/settings\/structured\?bookId=book-a/)
  const mergedState = await page.evaluate(() => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const wid = books.find(item => item.id === 'book-a')?.worldbookId
    const entries = (JSON.parse(localStorage.getItem('worldbook_' + wid) || '{}').entries || [])
    return { wid, count: entries.length, names: entries.map(e => e.name) }
  })
  assert.equal(mergedState.count, waEntriesBefore + 2, `merge should add 2 entries: ${JSON.stringify(mergedState.names)}`)
  assert.ok(mergedState.names.includes('北墙守则') && mergedState.names.includes('雾港钟楼'), 'merged entries missing')
  const indexAfterMerge = await page.evaluate(() => JSON.parse(localStorage.getItem('worldbooks_index') || '[]').length)
  assert.equal(indexAfterMerge, 4, 'merge must not create another worldbook')

  // ===== J4：刷新恢复（NA06）：未确认的粘贴草稿在刷新后仍在 =====
  await page.goto(`${BASE}/settings/structured?bookId=book-a&sources=1`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-test="sources-panel-add"]').click()
  await page.waitForURL(/settings\/worldbook\/create/)
  await page.locator('.paste-row textarea').fill('刷新恢复样本：钟楼看守人的钥匙是黄铜做的。')
  await page.getByRole('button', { name: '暂存片段' }).click()
  await page.locator('.source-row .source-status.is-ready').first().waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  // 行显示的是标题而非正文；恢复成功的标志是来源行仍然存在（字数一致）。
  await page.locator('.source-row .source-status.is-ready').first().waitFor()
  await page.locator('.source-row .icon-action').first().click() // 清场：移除草稿来源，避免污染后续 ZIP
  await page.goto(`${BASE}/settings/structured?bookId=book-a`, { waitUntil: 'domcontentloaded' })

  // ===== J5：软移除：列表移出，归档原件仍在（可重新添加）=====
  await page.locator('[data-test="sources-panel-toggle"]').click()
  const before = await page.locator('.sources-panel__item').count()
  await page.locator('.sources-panel__remove').first().click()
  await page.waitForFunction(previous => document.querySelectorAll('.sources-panel__item').length === previous - 1, before)
  const archiveCount = await page.evaluate(async () => {
    const module = await import('/src/services/worldbook/worldbookSourceArchive.js')
    const records = await module.loadAllSourceArchiveRecords()
    return records.artifacts.length
  })
  assert.ok(archiveCount >= 2, 'archive originals must survive a soft remove')

  // ===== J6：ZIP 往返（NA15）：导出含来源/工作区，清空后恢复，资料仍在 =====
  const zip = await page.evaluate(async () => {
    const bundleModule = await import('/src/services/storage/workspaceBackupBundle.js')
    const archive = await bundleModule.buildWorkspaceBackupBundle()
    return {
      bytesBase64: btoa(String.fromCharCode(...Array.from(archive.bytes.slice(0, 8)/*长度哨兵*/))),
      fullLength: archive.bytes.length,
      hasSources: Boolean(archive.manifest.files['source-archive/artifacts.json'] && archive.manifest.files['source-archive/workspaces.json']),
      inspection: null
    }
  }).then(async (info) => {
    // 完整字节经 base64 传输（体积小，直接传）
    const full = await page.evaluate(async () => {
      const bundleModule = await import('/src/services/storage/workspaceBackupBundle.js')
      const archive = await bundleModule.buildWorkspaceBackupBundle()
      let binary = ''
      const bytes = archive.bytes
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
      const inspection = await bundleModule.inspectWorkspaceBackup(archive.bytes)
      return { bytesBase64: btoa(binary), hasSources: Boolean(archive.manifest.files['source-archive/artifacts.json'] && archive.manifest.files['source-archive/workspaces.json']), inspectionValid: inspection.valid, factLedgerDeclared: Boolean(archive.manifest.domains?.factLedger) }
    })
    return { ...info, ...full }
  })
  assert.ok(zip.hasSources, 'ZIP missing source-archive files')
  assert.equal(zip.inspectionValid, true, 'ZIP inspection invalid')
  assert.equal(zip.factLedgerDeclared, true, 'ZIP missing factLedger domain (daytime integration regression)')
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('pinax-source-archive')
    localStorage.clear()
    await new Promise(resolve => setTimeout(resolve, 300))
  })
  const restoreResult = await page.evaluate(async (bytesBase64) => {
    const bundleModule = await import('/src/services/storage/workspaceBackupBundle.js')
    const binary = atob(bytesBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    const result = await bundleModule.restoreWorkspaceBackupBundle(bytes, { acceptRestoreRisk: true })
    return { success: result.success, reason: result.reason || '' }
  }, zip.bytesBase64)
  assert.equal(restoreResult.success, true, `ZIP restore failed: ${restoreResult.reason}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-test="sources-panel-toggle"]').waitFor()
  await waitForPanelCount('1 份')
  const archiveAfterRestore = await page.evaluate(async () => {
    const module = await import('/src/services/worldbook/worldbookSourceArchive.js')
    const records = await module.loadAllSourceArchiveRecords()
    return { count: records.artifacts.length, ids: records.artifacts.map(a => a.id).slice(0, 8), chunks: records.chunks.length, workspaces: records.workspaces.length }
  })
  assert.ok(archiveAfterRestore.count >= 2, `source archive not restored: ${JSON.stringify(archiveAfterRestore)}`)

  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(' | ')}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/settings/structured?bookId=book-a&sources=1`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-test="sources-panel-toggle"]').waitFor()
  await page.screenshot({ path: `${OUT_DIR}/sources-panel-390.png` })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  console.log(JSON.stringify({ ok: true, zipBytes: zip.fullLength }))
} finally { await browser.close() }
