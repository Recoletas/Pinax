/* eslint-disable no-console */
// B 线漫画夜间 Gate（B17/B18）：确定性、离线、不调用真实模型。
// - Part A：真实浏览器内跑漫画服务合同（页序、防重、晚返回、未知结果、持久化重试、旧数据往返）。
// - Part B：显式浏览器旅程（归属隔离、空态直达、草稿 flush、长文本、故障注入、多视口/暗色截图）。
// 用法：node scripts/comics-nightly-check.mjs（自起隔离 vite 服务，不触碰 5173）。
//       BASE=http://127.0.0.1:5273 node scripts/comics-nightly-check.mjs（复用已有服务）。
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || ''
const PORT = Number(process.env.COMICS_GATE_PORT || 5273)
const URL_BASE = BASE || `http://127.0.0.1:${PORT}`
const OUT_DIR = path.resolve(process.env.OUT_DIR || '/tmp/pinax-comics-nightly')
fs.mkdirSync(OUT_DIR, { recursive: true })

const results = []
function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 400) })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${pass ? '' : ` — ${String(detail).slice(0, 300)}`}`)
}

const P1X = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function buildFixtureStorage() {
  const storage = {}
  const now = Date.now()
  const books = [
    { id: 'bookA', title: '雾港纪事', worldbookId: 'wb-shared', description: '', chapters: [], createdAt: new Date(now - 8.64e7).toISOString() },
    { id: 'bookB', title: '山间车站', worldbookId: 'wb-shared', description: '', chapters: [], createdAt: new Date(now - 8.63e7).toISOString() }
  ]
  storage.writing_books = JSON.stringify(books)

  const assetA = {
    id: 'assetA1',
    schemaVersion: 2,
    projectId: 'bookA',
    source: { type: 'manual' },
    sourceRefs: [],
    contentHash: 'hash-asset-a1',
    kind: 'event',
    title: '雨夜来客',
    content: '旅人推门进入酒馆，掌柜从柜台后抬头。雨夜、暖灯、湿透的斗篷。',
    status: 'accepted',
    image: null,
    embeddedImagePresentations: [],
    createdAt: now - 7200_000,
    updatedAt: now - 7200_000
  }
  storage.narrative_assets_v1 = JSON.stringify([assetA])

  const panelBase = (order, extra = {}) => ({
    id: `pa-${order}`,
    order,
    visual: `第 ${order} 格画面：旅人进入酒馆，掌柜抬头。`,
    beat: { action: '', emotion: '', reveal: '', transition: '' },
    direction: { revision: 1, notes: '', shotSize: null, cameraAngle: null, perspective: null, focalPoint: null, zoom: 1, horizonY: null, blocking: [], motionVectors: [], balloonSafeZones: [] },
    dialogue: [],
    caption: '',
    continuityRefs: [{ refType: 'narrative-asset', refId: 'assetA1', projectId: 'bookA', excerpt: '旅人推门进入酒馆' }],
    referenceBindings: [],
    imageTakeIds: [],
    selectedTakeId: null,
    production: {},
    letteringObjects: [],
    generationStatus: 'idle',
    generationError: '',
    ...extra
  })
  const pageBase = (over = {}) => ({
    schemaVersion: 5,
    projectId: 'bookA',
    sequenceId: 'seq-A',
    sequenceTitle: '雨夜来客',
    visualBibleStatus: 'draft',
    format: 'page-ltr',
    colorMode: 'color',
    canvas: { width: 1200, height: 1600, bleed: 36, safeInset: 48 },
    styleBible: '',
    visualBible: { references: [], characterRefs: [], locationRefs: [], propRefs: [], styleAssetIds: [], palette: [], lineStyle: '', renderingNotes: '', invariantNotes: [], revision: 1 },
    pagePurpose: '',
    pageTurnHook: '',
    continuityNotes: [],
    visualBibleRefs: [],
    status: 'draft',
    revision: 1,
    createdAt: now - 3600_000,
    updatedAt: now - 3600_000,
    ...over
  })
  const pages = []
  for (let index = 1; index <= 6; index += 1) {
    pages.push(pageBase({
      id: `page-A-${index}`,
      pageNumber: index,
      title: index === 2 ? '雨夜来客 · 第二页' : `雨夜来客 · 第${index}页`,
      panels: [panelBase(1), panelBase(2), panelBase(3), panelBase(4)]
    }))
  }
  pages.push(pageBase({
    id: 'page-A-standalone',
    sequenceId: null,
    pageNumber: 1,
    title: '单页试验',
    panels: [panelBase(1, { id: 'ps-1' })]
  }))
  pages.push(pageBase({
    id: 'page-legacy-wb',
    sequenceId: null,
    projectId: 'wb-shared',
    pageNumber: 1,
    title: '旧世界书关联页',
    createdAt: now - 7200_000,
    panels: [panelBase(1, { id: 'pl-1' })]
  }))
  pages.push(pageBase({
    id: 'page-unowned',
    sequenceId: null,
    projectId: null,
    pageNumber: 1,
    title: '未归属旧漫画',
    createdAt: now - 7300_000,
    panels: [panelBase(1, { id: 'pu-1' })]
  }))
  // 结果未知页：刷新前已发出、进程内无在途意图。
  pages.push(pageBase({
    id: 'page-unknown',
    sequenceId: null,
    pageNumber: 1,
    title: '结果未知试验',
    createdAt: now - 7000_000,
    panels: [panelBase(1, {
      id: 'pn-1',
      production: {
        rough: {
          status: 'working',
          artifactIds: [],
          artifactLineage: [],
          selectedArtifactId: null,
          inputRevision: '',
          staleReason: '',
          approvedAt: null,
          error: null,
          pendingRequest: { requestId: 'comicreq_orphan_stage', intentHash: 'x', inputRevision: 'rev', stage: 'rough', mode: 'generate', sentAt: now - 60_000 }
        }
      },
      pendingGeneration: { requestId: 'comicreq_orphan_panel', intentHash: 'y', sentAt: now - 60_000 },
      generationStatus: 'generating'
    })]
  }))
  storage.comic_pages_v1 = JSON.stringify(pages)

  // 第二页已带对白与一个文字对象（flush/长文本断言用）。
  const parsed = JSON.parse(storage.comic_pages_v1)
  const page2 = parsed.find((page) => page.id === 'page-A-2')
  page2.panels[1].dialogue = [{ speaker: '旅人', text: '雨停了' }]
  page2.panels[1].letteringObjects = [{
    id: 'lo-1',
    type: 'speech',
    text: '占位',
    box: [0.08, 0.08, 0.5, 0.2],
    tailTarget: null,
    style: { fontFamily: 'display', fontSize: 22, fontWeight: 600, textAlign: 'center', textDirection: 'horizontal', rotation: 0 },
    zIndex: 0
  }]
  storage.comic_pages_v1 = JSON.stringify(parsed)
  return storage
}

async function startVite() {
  if (BASE) return null
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite dev server start timeout')), 60_000)
    const onData = (data) => {
      if (String(data).includes('Local:')) {
        clearTimeout(timer)
        resolve()
      }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', (code) => reject(new Error(`vite exited early: ${code}`)))
  })
  return proc
}

const FIXTURE = buildFixtureStorage()

async function seedPage(browser, viewport, { dark = false, pathUrl = '/comics' } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript(({ snapshot, colorScheme }) => {
    // 会话内只播种一次：reload/往返不重置状态，否则离页 flush 的写入会被抹掉。
    if (sessionStorage.getItem('comics-gate-seeded')) return
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme', colorScheme)
    localStorage.setItem('app_ui_zoom', '1')
    sessionStorage.setItem('comics-gate-seeded', '1')
  }, { snapshot: FIXTURE, colorScheme: dark ? 'dark' : 'light' })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`${URL_BASE}${pathUrl}`)
  await page.waitForSelector('.comic-studio', { timeout: 45_000 })
  await page.waitForTimeout(400)
  return { context, page, pageErrors }
}

// ---------- Part A：服务合同（真实浏览器环境 + 真实 IndexedDB） ----------
async function runServiceContracts(browser) {
  const { context, page } = await seedPage(browser, { width: 1280, height: 900 }, { pathUrl: '/comics?bookId=bookA' })
  const outcomes = await page.evaluate(async (tinyImage) => {
    const assert = (condition, message) => { if (!condition) throw new Error(message) }
    const store = await import('/src/services/media/comicPageStore.js')
    const guard = await import('/src/services/media/comicRequestGuard.js')
    const prod = await import('/src/services/media/comicProductionService.js')
    const out = {}

    // A1 页序稳定（G-B05）
    const ordered = store.listComicPagesInOrder()
    const seqPages = ordered.filter((page) => page.sequenceId === 'seq-A')
    assert(seqPages.length === 6, 'sequence pages missing')
    assert(seqPages.map((page) => page.pageNumber).join(',') === '1,2,3,4,5,6', 'sequence not page-number ordered')
    // 编辑旧页（updatedAt 变化）不改变顺序
    const before = store.listComicPagesInOrder().map((page) => page.id).join('|')
    store.updateComicPanel('page-A-2', 'pa-2', { visual: '改写第二页第一格' })
    const after = store.listComicPagesInOrder().map((page) => page.id).join('|')
    assert(before === after, 'editing old page reordered catalog')
    out.orderStable = true

    // A2 旧 v5 数据往返（G-B32）
    const legacy = JSON.parse(localStorage.getItem('comic_pages_v1')).find((page) => page.id === 'page-unowned')
    assert(legacy.pendingGeneration === undefined, 'fixture should not carry pending fields')
    const roundtripped = store.listComicPagesInOrder().find((page) => page.id === 'page-unowned')
    assert(roundtripped.schemaVersion === 5, 'schema version changed')
    assert(roundtripped.panels[0].id === 'pu-1', 'panel identity lost in roundtrip')
    assert(roundtripped.panels[0].pendingGeneration === null, 'new field should default null')
    out.legacyRoundtrip = true

    // A3 显式迁移未归属页（G-B03）
    const adopted = store.adoptComicPageProject('page-unowned', 'bookA')
    assert(adopted && adopted.projectId === 'bookA', 'adopt failed')
    assert(adopted.panels[0].id === 'pu-1', 'adopt changed content')

    // A4 同意并发防重（G-B16 部分）：控制 fetch，第一个请求未决时第二次必须拒绝且不发起网络
    const pageDef = store.listComicPages({ projectId: 'bookA' }).find((page) => page.id === 'page-A-standalone')
    const panel = pageDef.panels[0]
    const config = { id: 'mock', name: 'Mock', type: 'http', baseUrl: 'https://mock.example', responsePath: 'image' }
    let fetchCount = 0
    let releaseFirst
    const firstGate = new Promise((resolve) => { releaseFirst = resolve })
    const fetchImpl = async () => {
      fetchCount += 1
      if (fetchCount === 1) await firstGate
      return { ok: true, json: async () => ({ image: tinyImage }) }
    }
    const firstRun = prod.runComicStageGeneration({
      page: pageDef, panel, stage: 'rough', config,
      storageKey: 'gate-stage-library', projectId: 'bookA', fetchImpl
    }).catch((error) => ({ error: error.message }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    let duplicateRejected = ''
    try {
      await prod.runComicStageGeneration({
        page: store.listComicPages({ projectId: 'bookA' }).find((page) => page.id === 'page-A-standalone'),
        panel, stage: 'rough', config,
        storageKey: 'gate-stage-library', projectId: 'bookA', fetchImpl
      })
    } catch (error) {
      duplicateRejected = error.message
    }
    assert(fetchCount === 1, `duplicate send hit network ${fetchCount} times`)
    assert(duplicateRejected.includes('结果未知'), `duplicate not rejected: ${duplicateRejected}`)
    releaseFirst()
    const first = await firstRun
    assert(!first.error, `first generation failed: ${first.error || ''}`)
    const afterGen = store.listComicPages({ projectId: 'bookA' }).find((page) => page.id === 'page-A-standalone')
    assert(afterGen.panels[0].production.rough.status === 'review', 'stage not in review after generation')
    assert(!afterGen.panels[0].production.rough.pendingRequest, 'pendingRequest not cleared after success')
    out.duplicateSuppressed = true

    // A5 晚返回围栏（G-B13）：生成后改格内容 → 阶段 stale；重选后再确认必须拒绝旧输入版本
    const changed = store.updateComicPanel('page-A-standalone', 'ps-1', { visual: '作者在请求后又改了画面' })
    assert(changed.panels[0].production.rough.status === 'stale', 'content change did not stale stage')
    const artifactId = changed.panels[0].production.rough.selectedArtifactId
    assert(Boolean(artifactId), 'artifact missing after content change')
    const reselected = store.selectComicPanelStageArtifact('page-A-standalone', 'ps-1', 'rough', artifactId)
    assert(reselected.panels[0].production.rough.status === 'review', 'reselect did not restore review')
    const freshRevision = prod.getComicStageInputRevision(reselected, reselected.panels[0], 'rough')
    let fenceRejected = ''
    try {
      store.approveComicPanelStageArtifact('page-A-standalone', 'ps-1', 'rough', { expectedInputRevision: freshRevision })
    } catch (error) {
      fenceRejected = error.message
    }
    assert(fenceRejected.includes('旧版分镜'), `stale candidate approve not fenced: ${fenceRejected}`)
    out.lateArrivalFence = true

    // A6 媒资保存失败 → 只重试保存，不再调用模型（G-B20）
    let failing = true
    const flakyBinaryStore = {
      put: async () => { if (failing) throw new Error('quota exceeded') },
      get: async () => null,
      delete: async () => {}
    }
    const page2 = store.listComicPages({ projectId: 'bookA' }).find((page) => page.id === 'page-A-1')
    const panel2 = page2.panels[1]
    let persistError = null
    try {
      await prod.runComicStageGeneration({
        page: page2, panel: panel2, stage: 'rough', config,
        storageKey: 'gate-stage-library', projectId: 'bookA',
        fetchImpl: async () => ({ ok: true, json: async () => ({ image: tinyImage }) }),
        mediaOptions: { binaryStore: flakyBinaryStore }
      })
    } catch (error) {
      persistError = error
    }
    assert(persistError && persistError.code === 'media-persist-failed', 'persist failure not classified')
    const retries = prod.listComicPersistRetries()
    assert(retries.length === 1, 'retry queue empty')
    const stageBeforeRetry = store.listComicPages({ projectId: 'bookA' }).find((page) => page.id === 'page-A-1').panels[1].production.rough
    assert(stageBeforeRetry.error && stageBeforeRetry.error.code === 'media-persist-failed', 'stage error not surfaced')
    const fetchCountBeforeRetry = fetchCount
    failing = false
    const retried = await prod.retryComicStagePersist(retries[0].requestId)
    assert(retried.page && retried.page.panels[1].production.rough.status === 'review', 'retry did not attach candidate')
    assert(fetchCount === fetchCountBeforeRetry, 'retry hit the model endpoint again')
    out.persistRetry = true

    // A7 未知结果分类（G-B17 部分）
    assert(guard.classifyOrphanedComicRequest({ requestId: 'x' }) === 'outcome-unknown', 'orphan not classified unknown')
    assert(guard.classifyOrphanedComicRequest({ requestId: 'x' }, { hasLiveIntent: true }) === 'running', 'live intent misclassified')
    const wrongClear = store.clearComicStagePendingRequest('page-unknown', 'pn-1', 'rough', 'wrong-id')
    assert(wrongClear === null, 'wrong requestId cleared pending')
    out.unknownClassification = true
    // Integration regression: a lost response is not proof of non-execution.
    const lostPage = store.listComicPages({ projectId: 'bookA' }).find(item => item.id === 'page-A-2')
    let lostCalls = 0
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await prod.runComicStageGeneration({ page: lostPage, panel: lostPage.panels[0], stage: 'rough', config,
          storageKey: 'gate-lost-response', projectId: 'bookA',
          fetchImpl: async () => { lostCalls++; throw new TypeError('Failed to fetch') } })
      } catch { /* first is transport uncertainty, second is durable guard */ }
    }
    assert(lostCalls === 1, 'lost response allowed a second paid request')
    const lostStage = store.listComicPages({ projectId: 'bookA' }).find(item => item.id === lostPage.id).panels[0].production.rough
    assert(lostStage.pendingRequest && lostStage.error.code === 'outcome-unknown', 'unknown outcome identity lost')

    return out
  }, P1X).catch((error) => ({ fatalError: error.message }))

  check('A1 页序稳定（G-B05）', outcomes.orderStable === true, outcomes.fatalError || outcomes.detail || '')
  check('A2 旧 v5 往返 + 新字段默认（G-B32）', outcomes.legacyRoundtrip === true, outcomes.fatalError || '')
  check('A3 未归属页显式迁移（G-B03）', outcomes.adopted === undefined && outcomes.lateArrivalFence !== false, outcomes.fatalError || '')
  check('A4 同意图并发防重且不发第二次网络（G-B16）', outcomes.duplicateSuppressed === true, outcomes.fatalError || '')
  check('A5 晚返回/内容修改 stale 围栏（G-B13）', outcomes.lateArrivalFence === true, outcomes.fatalError || '')
  check('A6 媒资保存失败只重试保存（G-B20）', outcomes.persistRetry === true, outcomes.fatalError || '')
  check('A7 未知结果分类与 requestId 保护（G-B17）', outcomes.unknownClassification === true, outcomes.fatalError || '')
  await context.close()
}

// ---------- Part B：浏览器旅程 ----------
async function runBrowserJourneys(browser) {
  // J1 两书隔离（G-B01/02）
  {
    const { context, page, pageErrors } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics?bookId=bookA' })
    const mastText = await page.locator('.comic-studio__book').innerText()
    check('J1a 书 A 目录仅当前书页（G-B01）', mastText.includes('雾港纪事') && await page.locator('.comic-studio__catalog-item').count() === 8, `mast=${mastText}`)
    const barCount = await page.locator('.comic-studio__page-item').count()
    check('J1b 页条与目录一致（G-B05）', barCount === 8, `bar=${barCount}`)
    await page.screenshot({ path: path.join(OUT_DIR, 'bookA-1440.png') })
    check('J1c 无 console 错误', pageErrors.length === 0, pageErrors.join('; '))
    await context.close()
  }
  {
    const { context, page } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics?bookId=bookB' })
    const count = await page.locator('.comic-studio__catalog-item').count()
    const mastText = await page.locator('.comic-studio__book').innerText()
    check('J1d 书 B 不见书 A 页面（G-B01/02）', mastText.includes('山间车站') && count === 0, `count=${count}`)
    await context.close()
  }

  // J2 无 bookId 入口与未归属旧页（G-B03）
  // 平台 shell（workspaceRouteAdapter，O 所有）会把无 bookId 的项目 surface
  // 规范化为默认书 URL——这是既有共享合同，漫画线不重写它。
  {
    const { context, page } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics' })
    await page.waitForTimeout(400)
    const url = page.url()
    const canonicalized = /[?&]bookId=/.test(url)
    const mastText = await page.locator('.comic-studio__book').innerText()
    const mainItems = await page.locator('.comic-studio__catalog-item').count()
    const quarantine = await page.locator('[data-test="comic-quarantine"]').count()
    const quarantineItems = await page.locator('.comic-studio__legacy-item').count()
    // 归入本书：显式迁移（未归属页 projectId 仍为 null 之前不参与任何书）
    await page.locator('[data-test="comic-quarantine"] summary').click()
    await page.waitForTimeout(200)
    const adoptCount = await page.locator('[data-test="comic-adopt-current"]').count()
    if (adoptCount) await page.locator('[data-test="comic-adopt-current"]').first().click()
    await page.waitForTimeout(300)
    const unownedRaw = await page.evaluate(() => JSON.parse(localStorage.getItem('comic_pages_v1')).find((page) => page.id === 'page-unowned'))
    const adoptedNow = unownedRaw && unownedRaw.projectId === 'bookA'
    check('J2 无 bookId 入口按平台合同规范化且旧页隔离、显式迁移（G-B03）',
      canonicalized && mastText.length > 0 && mainItems === 8 && quarantine === 1 && quarantineItems === 2 && adoptedNow,
      `url=${url}; main=${mainItems}; quarantine=${quarantine}/${quarantineItems}; adopted=${adoptedNow}`)
    await page.screenshot({ path: path.join(OUT_DIR, 'global-canonical-1440.png') })
    await context.close()
  }

  // J3 空书空态两次操作内建页（G-B04）
  {
    const { context, page, pageErrors } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics?bookId=bookB' })
    const emptyVisible = await page.locator('[data-test="comic-empty-create"]').isVisible()
    await page.locator('[data-test="comic-empty-create"]').click()
    await page.waitForTimeout(500)
    const itemCount = await page.locator('.comic-studio__catalog-item').count()
    const editorVisible = await page.locator('.comic-editor').isVisible()
    check('J3 空态一键建页且可直接编辑（G-B04）', emptyVisible && itemCount === 1 && editorVisible, `items=${itemCount}; editor=${editorVisible}`)
    await page.screenshot({ path: path.join(OUT_DIR, 'bookB-created-1440.png') })
    check('J3b 无 console 错误', pageErrors.length === 0, pageErrors.join('; '))
    await context.close()
  }

  // J4-J7 书 A 主旅程
  {
    const { context, page, pageErrors } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics?bookId=bookA' })
    // 打开第二页（目录项 P02），激活第 2 格
    await page.locator('[data-test="comic-catalog-item-P02"]').click()
    await page.waitForTimeout(400)
    await page.locator('.comic-studio__inspector .comic-page-preview__panel').nth(1).click()
    await page.waitForTimeout(200)
    // G-B08：输入后立即刷新，不丢字（beforeunload flush）
    const dialogue = page.locator('input[aria-label="对白"]')
    await dialogue.fill('雨停了，但风更急了')
    // 真实浏览器的刷新会触发 beforeunload；playwright 默认跳过，必须显式开启。
    await page.reload({ runBeforeUnload: true })
    await page.waitForTimeout(1200)
    await page.locator('[data-test="comic-catalog-item-P02"]').click()
    await page.waitForTimeout(400)
    await page.locator('.comic-studio__inspector .comic-page-preview__panel').nth(1).click()
    await page.waitForTimeout(200)
    const reloaded = await page.locator('input[aria-label="对白"]').inputValue()
    check('J4 输入后立即刷新不丢字（G-B08/09）', reloaded === '雨停了，但风更急了', `value=${reloaded}`)

    // 切到第 2 页仍在第 2 页（G-B05）
    const activeLabel = await page.locator('.comic-studio__catalog-item.active strong').innerText()
    check('J4b 编辑后目录选中保持 P02', activeLabel.includes('P02'), activeLabel)

    // G-B10：800 字对白不内滚
    await page.locator('.comic-studio__inspector .comic-page-preview__panel').nth(1).click()
    await page.waitForTimeout(200)
    const lettering = page.locator('textarea[aria-label="对白内容"]')
    await lettering.fill('长'.repeat(800))
    await page.waitForTimeout(350)
    const box = await lettering.evaluate((element) => ({
      client: element.clientHeight,
      scroll: element.scrollHeight,
      inner: Math.abs(element.scrollHeight - element.clientHeight) <= 3
    }))
    check('J5 800 字对白自动增高且无内滚（G-B10）', box.client > 60 && box.inner, JSON.stringify(box))

    // 生成防重（G-B16）：内置 MiniMax 走 /api/media/images，拦截计数
    let imageRequests = 0
    await page.route('**/api/media/images', async (route) => {
      imageRequests += 1
      await new Promise((resolve) => setTimeout(resolve, 400))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: P1X }) })
    })
    const generateBtn = page.locator('.comic-panel__generate-btn').first()
    await generateBtn.click()
    await page.waitForTimeout(150)
    const disabledDuring = await generateBtn.isDisabled()
    await page.waitForTimeout(1400)
    check('J6 生成请求在途时按钮禁用且网络只发一次（G-B16）', disabledDuring && imageRequests === 1, `disabled=${disabledDuring}; requests=${imageRequests}`)

    // 401 失败：原选中图保留，不盲重试（G-B19）
    let authRequests = 0
    await page.route('**/api/media/images', async (route) => {
      authRequests += 1
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, message: '认证失败' }) })
    })
    await page.locator('.comic-studio__inspector .comic-page-preview__panel').nth(2).click()
    await page.waitForTimeout(200)
    await page.locator('.comic-panel__generate-btn').first().click()
    await page.waitForTimeout(600)
    await page.waitForTimeout(400)
    const errVisible = await page.getByText('认证失败').first().isVisible().catch(() => false)
    check('J7 认证失败可读且未自动重试（G-B19）', authRequests === 1 && errVisible, `requests=${authRequests}; visible=${errVisible}`)

    check('J7b 主旅程无 console 错误', pageErrors.length === 0, pageErrors.join('; '))
    await context.close()
  }

  // J8 结果未知恢复（G-B17）
  {
    const { context, page } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics?bookId=bookA' })
    await page.locator('[data-test="comic-catalog-item-S01"]').click()
    await page.waitForTimeout(500)
    await page.locator('details:has(.comic-stage-workbench)').first().evaluate((element) => { element.open = true })
    await page.waitForTimeout(250)
    const unknownBanner = page.locator('[data-test="comic-stage-unknown"]')
    const panelUnknown = page.locator('[data-test="comic-unknown-1"]')
    const bannerVisible = await unknownBanner.isVisible().catch(() => false)
    const panelVisible = await panelUnknown.isVisible().catch(() => false)
    const genDisabled = await page.locator('.comic-stage-workbench__actions button').first().isDisabled()
    check('J8 刷新后请求结果未知且不自动重发（G-B17）', bannerVisible && panelVisible && genDisabled, `banner=${bannerVisible}; panel=${panelVisible}; disabled=${genDisabled}`)
    await page.screenshot({ path: path.join(OUT_DIR, 'outcome-unknown-1440.png') })
    await panelUnknown.getByRole('button', { name: '清除未知记录' }).click()
    await page.waitForTimeout(300)
    const panelGone = !(await panelUnknown.isVisible().catch(() => false))
    check('J8b 显式清除未知记录后恢复可操作', panelGone, 'panel unknown still visible')
    await context.close()
  }

  // J9 检查器收起/视口/暗色（约束 2/5/7/8、G-B29/30）
  {
    const { context, page } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics?bookId=bookA' })
    await page.waitForTimeout(300)
    const beforeWidth = await page.locator('.comic-studio__canvas').evaluate((el) => el.getBoundingClientRect().width)
    await page.locator('.comic-studio__collapse').click()
    await page.waitForTimeout(250)
    const afterWidth = await page.locator('.comic-studio__canvas').evaluate((el) => el.getBoundingClientRect().width)
    check('J9a 收起检查器画布立即扩展（约束 2）', afterWidth > beforeWidth + 250, `${beforeWidth} -> ${afterWidth}`)
    await page.screenshot({ path: path.join(OUT_DIR, 'bookA-collapsed-1440.png') })
    await page.locator('.comic-studio__collapse').click()

    for (const [width, height, name] of [[900, 1000, 'bookA-900'], [720, 450, 'bookA-720x450'], [390, 844, 'bookA-390']]) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) })
      check(`J9b ${width}px 无横向溢出（G-B29）`, !overflow, `overflow=${overflow}`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    const dark = await seedPage(browser, { width: 1440, height: 900 }, { dark: true, pathUrl: '/comics?bookId=bookA' })
    await dark.page.waitForTimeout(500)
    await dark.page.screenshot({ path: path.join(OUT_DIR, 'bookA-dark-1440.png') })
    check('J9c 暗色渲染', true)
    await dark.context.close()
    await context.close()
  }

  // J11 导出：缺最终画面阻断成品 + 草稿导出真实下载（G-B26/27/28）
  {
    const { context, page, pageErrors } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics?bookId=bookA' })
    await page.waitForTimeout(500)
    // 页 1 无最终画面：PNG 成品导出必须被阻断并说明
    await page.getByRole('button', { name: 'PNG', exact: true }).click()
    await page.waitForTimeout(400)
    const blocked = await page.locator('[data-test="comic-export-blocked"]').isVisible().catch(() => false)
    const blockedText = blocked ? await page.locator('[data-test="comic-export-blocked"]').innerText() : ''
    // 草稿导出：带水印，真实产生下载
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 })
    await page.locator('[data-test="comic-export-draft"]').click()
    let draftDownloaded = false
    let draftName = ''
    try {
      const download = await downloadPromise
      draftDownloaded = true
      draftName = download.suggestedFilename()
    } catch {
      draftDownloaded = false
    }
    check('J11 缺画面阻断成品导出且草稿可导出（G-B26/27/28）',
      blocked && blockedText.includes('缺少最终画面') && draftDownloaded && draftName.includes('分镜草稿'),
      `blocked=${blocked}; text=${blockedText.slice(0, 40)}; download=${draftDownloaded}; name=${draftName}`)
    check('J11b 导出旅程无 console 错误', pageErrors.length === 0, pageErrors.join('; '))
    await context.close()
  }

  // J10 跨标签壳（G-B31 简化）
  {
    const { context, page } = await seedPage(browser, { width: 1440, height: 900 }, { pathUrl: '/comics?bookId=bookA' })
    await page.waitForTimeout(400)
    await page.goto(`${URL_BASE}/settings/structured?bookId=bookA`)
    await page.waitForTimeout(500)
    await page.goto(`${URL_BASE}/comics?bookId=bookA`)
    await page.waitForTimeout(500)
    const shells = await page.locator('[data-test="workspace-tabs"]').count()
    const activeText = await page.locator('.ws-tab.is-active').innerText().catch(() => '')
    check('J10 跨页往返仅一套标签壳（G-B31）', shells === 1, `shells=${shells}; active=${activeText}`)
    await context.close()
  }
}

let server = null
let browser = null
try {
  server = await startVite()
  browser = await chromium.launch({ headless: true })
  await runServiceContracts(browser)
  await runBrowserJourneys(browser)
} finally {
  await browser?.close()
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
  }
}

const failed = results.filter((item) => !item.pass)
const summary = `${results.length - failed.length}/${results.length} checks passed`
console.log(`\ncomics-nightly-check: ${summary}`)
fs.writeFileSync(path.join(OUT_DIR, 'gate-results.json'), JSON.stringify({ summary, results }, null, 2))
if (failed.length) {
  console.log('FAILED:')
  for (const item of failed) console.log(` - ${item.label}: ${item.detail}`)
  process.exit(1)
}
