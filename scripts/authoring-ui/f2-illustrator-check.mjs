/* eslint-disable no-console */
// F2-5 real-page Gate: selection-owned authoring illustrator, frozen scene
// provenance, explicit material/media writes, stale guards and phone sheet.
// Every journey runs in an isolated Playwright context and never touches the
// user's browser profile or the repository fixture files.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-rollout')
const OUT_DIR = path.resolve('/tmp/pinax-f2-illustrator')
const FINAL_DIR = path.resolve('/tmp/pinax-f2-final')
const IMAGE_PATHS = [
  path.resolve('src/assets/characters/kao-archive-opening-scene-01.webp'),
  path.resolve('src/assets/characters/kao-archive-opening-scene-02.webp')
]
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const baseStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const imageDataUrls = IMAGE_PATHS.map((imagePath) => `data:image/webp;base64,${fs.readFileSync(imagePath).toString('base64')}`)
const screenshotPaths = {
  desktop: path.join(OUT_DIR, 'illustrator-1440.png'),
  tablet: path.join(OUT_DIR, 'illustrator-1024.png'),
  mobile: path.join(OUT_DIR, 'illustrator-390.png')
}
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(FINAL_DIR, { recursive: true })

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nodeText(node) {
  if (typeof node?.text === 'string') return node.text
  return (node?.content || []).map(nodeText).join('')
}

function unitText(unit) {
  return (unit?.content || []).map(nodeText).filter(Boolean).join('\n\n').trim()
}

function isolatedStorage() {
  const storage = clone(baseStorage)
  const books = JSON.parse(storage.writing_books || '[]')
  const book = books.find((candidate) => String(candidate.id) === String(state.bookId))
  const chapter = book?.chapters?.[0]
  const firstUnit = chapter?.editorDocument?.content?.[0]
  const worldbookKey = Object.keys(storage).find((key) => (
    key === `worldbook_${state.worldbookId || book?.worldbookId}`
  )) || Object.keys(storage).find((key) => key.startsWith('worldbook_') && key !== 'worldbooks_index')
  const worldbook = worldbookKey ? JSON.parse(storage[worldbookKey]) : null
  const lina = worldbook?.entries?.find((entry) => entry.type === 'character' && entry.name === '莉娜')
  const taxOffice = worldbook?.entries?.find((entry) => entry.type === 'location' && entry.name === '旧港税务所')
  if (!book || !chapter || !firstUnit?.attrs?.unitId || !worldbook || !lina || !taxOffice) {
    throw new Error('F2 illustrator fixture is missing the first unit, 莉娜 or 旧港税务所')
  }
  chapter.sceneAnchors = [{
    schemaVersion: 1,
    id: 'anchor-f2-illustrator-first-unit',
    unitId: String(firstUnit.attrs.unitId),
    worldbookId: String(worldbook.id),
    castMode: 'manual',
    presentCharacterIds: [String(lina.id)],
    plannedCharacterIds: [],
    locationId: String(taxOffice.id),
    viewpointCharacterId: String(lina.id),
    time: { label: '嘉禾十七年黄昏', period: 'evening' },
    status: '',
    staleReason: '',
    source: 'f2-illustrator-gate'
  }]
  storage.writing_books = JSON.stringify(books)
  storage.narrative_assets_v1 = '[]'
  storage.media_assets_v1 = '[]'
  storage.prose_image_library = '[]'
  storage.image_model_configs = '[]'
  return {
    storage,
    fixture: {
      chapterId: String(chapter.id),
      secondChapterId: String(book.chapters?.[1]?.id || ''),
      firstUnitId: String(firstUnit.attrs.unitId),
      firstUnitText: unitText(firstUnit),
      linaId: String(lina.id),
      locationId: String(taxOffice.id),
      worldbookId: String(worldbook.id)
    }
  }
}

function check(results, label, pass, detail = '') {
  const result = { label, pass: Boolean(pass), detail: String(detail).slice(0, 1000) }
  results.push(result)
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${label}${result.detail ? ` — ${result.detail}` : ''}`)
}

function installImageProvider(page) {
  const requests = []
  const pending = new Map()
  let mode = 'success'
  let sequence = 0

  page.route('**/api/media/images', async (route) => {
    let payload = null
    try { payload = route.request().postDataJSON() } catch { /* asserted by caller */ }
    const request = { id: ++sequence, payload, mode, requestedAt: Date.now() }
    requests.push(request)
    let disposition = mode
    if (mode === 'delay') {
      disposition = await new Promise((resolve) => pending.set(request.id, resolve))
    }
    try {
      if (disposition === 'failure') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, message: 'F2 illustrator deterministic failure' })
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, image: imageDataUrls[(request.id - 1) % imageDataUrls.length] })
        })
      }
    } catch (error) {
      request.routeError = String(error?.message || error)
    } finally {
      pending.delete(request.id)
      request.completedAt = Date.now()
    }
  })

  return {
    requests,
    setMode(nextMode) { mode = nextMode },
    releaseAll(disposition = 'success') {
      for (const resolve of pending.values()) resolve(disposition)
    },
    async waitForCount(count, timeout = 10000) {
      const deadline = Date.now() + timeout
      while (requests.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
      if (requests.length < count) throw new Error(`provider request timeout: ${requests.length}/${count}`)
    }
  }
}

async function createPage(browser, viewport) {
  const { storage, fixture } = isolatedStorage()
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_ui_zoom', '1')
  }, storage)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`)
  })
  const provider = installImageProvider(page)
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.waitForTimeout(900)
  return { context, page, errors, provider, fixture }
}

function drawer(page) {
  return page.locator('[data-test="authoring-illustrator-layer"]')
}

function promptInput(page) {
  return drawer(page).locator('.image-gen-prompt-input:not(.small)')
}

async function selectPhrase(page, phrase) {
  const paragraph = page.locator('.wall__dossier .ProseMirror p').filter({ hasText: phrase }).first()
  await paragraph.waitFor({ state: 'visible' })
  await paragraph.evaluate((element, selectedText) => {
    element.closest('.ProseMirror')?.focus()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const nodes = []
    let combined = ''
    while (walker.nextNode()) {
      nodes.push({ node: walker.currentNode, start: combined.length, end: combined.length + walker.currentNode.textContent.length })
      combined += walker.currentNode.textContent
    }
    const start = combined.indexOf(selectedText)
    if (start < 0) throw new Error(`selection phrase missing: ${selectedText}`)
    const end = start + selectedText.length
    const startNode = nodes.find((item) => start >= item.start && start <= item.end)
    const endNode = [...nodes].reverse().find((item) => end >= item.start && end <= item.end)
    if (!startNode || !endNode) throw new Error('selection range could not be mapped to text nodes')
    const range = document.createRange()
    range.setStart(startNode.node, start - startNode.start)
    range.setEnd(endNode.node, end - endNode.start)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  }, phrase)
  await page.waitForTimeout(80)
}

async function collapseInFirstParagraph(page) {
  const paragraph = page.locator('.wall__dossier .ProseMirror p').first()
  await paragraph.click()
  await page.keyboard.press('End')
  await page.waitForTimeout(80)
}

async function setEditorScroll(page, top = 240) {
  return page.evaluate((nextTop) => {
    const owner = document.querySelector('.wall__dossier-scroll, .wall__dossier [data-notebook-scroll-owner], .wall__dossier .writing-notebook-editor__scroll')
    if (!owner) return 0
    owner.scrollTop = Math.min(nextTop, Math.max(0, owner.scrollHeight - owner.clientHeight))
    return owner.scrollTop
  }, top)
}

async function surfaceState(page) {
  return page.evaluate(() => {
    const owner = document.querySelector('.wall__dossier-scroll, .wall__dossier [data-notebook-scroll-owner], .wall__dossier .writing-notebook-editor__scroll')
    return {
      selection: window.getSelection()?.toString() || '',
      scrollTop: owner?.scrollTop || 0,
      editorFocused: Boolean(document.activeElement?.closest?.('.wall__dossier .ProseMirror'))
    }
  })
}

async function openDesktopIllustrator(page) {
  await page.locator('[data-test="authoring-illustrator-trigger"]').click()
  await drawer(page).waitFor({ state: 'visible', timeout: 10000 })
}

async function openMobileIllustrator(page) {
  await page.getByRole('button', { name: '更多写作操作' }).click()
  const menu = page.locator('.wall__more-menu[aria-label="更多写作操作"]')
  await menu.waitFor({ state: 'visible' })
  await menu.locator('[data-test="mobile-illustrator-action"]').click()
  await drawer(page).waitFor({ state: 'visible', timeout: 10000 })
}

async function closeIllustrator(page) {
  await drawer(page).getByRole('button', { name: '关闭画师' }).click()
  await drawer(page).waitFor({ state: 'hidden' })
  await page.waitForTimeout(120)
}

async function selectAllSceneSources(page) {
  const rows = drawer(page).locator('.authoring-illustrator__scene-row')
  const expected = ['莉娜', '旧港税务所', '嘉禾十七年黄昏']
  for (const label of expected) {
    const row = rows.filter({ hasText: label }).first()
    await row.waitFor({ state: 'visible' })
    if (await row.locator('strong').innerText() !== label) throw new Error(`unexpected scene row for ${label}`)
    const checkbox = row.locator('input[type="checkbox"]')
    if (!await checkbox.isChecked()) await row.click()
  }
  await page.waitForTimeout(80)
  return rows.locator('input[type="checkbox"]:checked').count()
}

async function storageState(page) {
  return page.evaluate(({ bookId }) => {
    const parse = (key, fallback) => {
      try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
    }
    const books = parse('writing_books', [])
    const book = books.find((candidate) => String(candidate.id) === String(bookId)) || null
    const narrative = parse('narrative_assets_v1', [])
    const media = parse('media_assets_v1', [])
    const library = parse('prose_image_library', [])
    const chapters = (book?.chapters || []).map((chapter) => ({
      id: String(chapter.id || ''),
      content: String(chapter.content || ''),
      sceneAnchors: chapter.sceneAnchors || [],
      mediaNodeCount: (chapter.editorDocument?.content || []).reduce((sum, unit) => (
        sum + (unit?.content || []).filter((node) => node?.type === 'mediaReference').length
      ), 0)
    }))
    return {
      chapters,
      narrativeCount: narrative.length,
      narrative,
      mediaCount: media.length,
      media,
      libraryCount: library.length,
      library,
      base64InLocalStorage: Object.values(localStorage).some((value) => /data:image\/[a-z0-9.+-]+;base64,/i.test(String(value)))
    }
  }, { bookId: state.bookId })
}

function formalFingerprint(snapshot) {
  return JSON.stringify({
    chapters: snapshot.chapters.map((chapter) => ({
      id: chapter.id,
      content: chapter.content,
      sceneAnchors: chapter.sceneAnchors,
      mediaNodeCount: chapter.mediaNodeCount
    })),
    narrative: snapshot.narrative
  })
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const box = node.getBoundingClientRect()
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
    }
    const controls = rect('.authoring-illustrator .image-gen-controls')
    const results = rect('.authoring-illustrator .image-gen-results')
    return {
      dialog: rect('.authoring-illustrator'),
      layer: rect('[data-test="authoring-illustrator-layer"]'),
      controls,
      results,
      split: Boolean(controls && results && results.x >= controls.right - 1),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      drawerOverflow: (() => {
        const node = document.querySelector('.authoring-illustrator')
        return node ? node.scrollWidth - node.clientWidth : null
      })()
    }
  })
}

async function runJourney(results, label, callback) {
  try {
    await callback()
  } catch (error) {
    check(results, `${label}旅程可完成`, false, error?.stack || error)
  }
}

const browser = await chromium.launch()
const results = []
const evidence = {}

try {
  await runJourney(results, '1440 主链', async () => {
    const run = await createPage(browser, { width: 1440, height: 900 })
    try {
      const page = run.page
      const phrase = '莉娜数完第三盏航灯'
      await selectPhrase(page, phrase)
      await setEditorScroll(page)
      await page.waitForTimeout(80)
      const beforeOpen = await surfaceState(page)
      await openDesktopIllustrator(page)
      check(results, '选区优先成为冻结画面描述', await promptInput(page).inputValue() === phrase, await promptInput(page).inputValue())
      check(results, '选区来源对作者标为选中文字', await drawer(page).getByText('选中文字', { exact: true }).count() >= 1)
      await closeIllustrator(page)
      const afterClose = await surfaceState(page)
      check(results, '关闭画师恢复 selection、scroll 与正文 focus', beforeOpen.scrollTop > 0 && afterClose.selection === beforeOpen.selection && afterClose.scrollTop === beforeOpen.scrollTop && afterClose.editorFocused, JSON.stringify({ beforeOpen, afterClose }))

      await collapseInFirstParagraph(page)
      await openDesktopIllustrator(page)
      const fallbackPrompt = await promptInput(page).inputValue()
      check(results, '空选区回退当前 writingUnit', fallbackPrompt === run.fixture.firstUnitText, JSON.stringify({ expected: run.fixture.firstUnitText.slice(0, 160), actual: fallbackPrompt.slice(0, 160) }))
      check(results, 'unit fallback 对作者标为当前文本块', await drawer(page).getByText('当前文本块', { exact: true }).count() >= 1)
      await closeIllustrator(page)

      await selectPhrase(page, phrase)
      await openDesktopIllustrator(page)
      const selectedSceneCount = await selectAllSceneSources(page)
      check(results, '人物、地点、时间均需作者显式勾选', selectedSceneCount === 3, selectedSceneCount)
      const desktopGeometry = await geometry(page)
      check(results, '1440 抽屉遵循 min(920px, 72vw)', Math.abs((desktopGeometry.dialog?.width || 0) - 920) <= 2, JSON.stringify(desktopGeometry))
      check(results, '桌面参数与结果为同层 split 且没有空白占栏', desktopGeometry.split && (desktopGeometry.controls?.width || 0) >= 280 && (desktopGeometry.results?.width || 0) >= 300, JSON.stringify(desktopGeometry))

      const beforeGenerate = await storageState(page)
      await drawer(page).locator('.image-gen-compact-field').filter({ hasText: '数量' }).locator('select').selectOption('2')
      await drawer(page).getByRole('button', { name: '生成插画' }).click()
      await run.provider.waitForCount(2)
      await drawer(page).locator('.image-gen-status.is-success').waitFor({ state: 'visible', timeout: 30000 })
      const providerPrompt = String(run.provider.requests[0]?.payload?.prompt || '')
      check(results, 'provider prompt 使用冻结选区', providerPrompt.includes(phrase), providerPrompt)
      check(results, '显式人物、地点、时间进入 provider prompt', ['人物：莉娜', '地点：旧港税务所', '时间：嘉禾十七年黄昏'].every((part) => providerPrompt.includes(part)), providerPrompt)
      const afterGenerate = await storageState(page)
      check(results, '生成成功只归档两张媒体候选且零正文/素材写入', afterGenerate.mediaCount === beforeGenerate.mediaCount + 2 && afterGenerate.libraryCount === beforeGenerate.libraryCount + 2 && formalFingerprint(afterGenerate) === formalFingerprint(beforeGenerate), JSON.stringify({ before: { media: beforeGenerate.mediaCount, library: beforeGenerate.libraryCount, narrative: beforeGenerate.narrativeCount }, after: { media: afterGenerate.mediaCount, library: afterGenerate.libraryCount, narrative: afterGenerate.narrativeCount } }))
      const generatedMedia = afterGenerate.media[0]
      const generatedRefs = generatedMedia?.sourceRefs || []
      check(results, '媒体候选保留 VisualBrief、revision 与稳定世界书 refs', Boolean(generatedMedia?.generationParams?.authoringVisualBrief?.fingerprint) && Boolean(generatedMedia?.generationParams?.sourceRevisions) && generatedRefs.some((ref) => ref.refType === 'worldbook-entry' && ref.refId === run.fixture.linaId) && generatedRefs.some((ref) => ref.refType === 'worldbook-entry' && ref.refId === run.fixture.locationId), JSON.stringify({ generationParams: generatedMedia?.generationParams, sourceRefs: generatedRefs }))
      await page.screenshot({ path: screenshotPaths.desktop, fullPage: false })
      await page.screenshot({ path: path.join(FINAL_DIR, '04-illustrator-two-candidates-1440.png'), fullPage: false })

      const saveButton = drawer(page).getByRole('button', { name: '保存为素材' })
      await saveButton.click()
      await drawer(page).getByText('已保存到素材库。', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
      const afterFirstSave = await storageState(page)
      await saveButton.click()
      await drawer(page).getByText('这张图片已经在素材库中。', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
      const afterSecondSave = await storageState(page)
      check(results, '显式保存素材幂等', afterFirstSave.narrativeCount === beforeGenerate.narrativeCount + 1 && afterSecondSave.narrativeCount === afterFirstSave.narrativeCount, `${beforeGenerate.narrativeCount}->${afterFirstSave.narrativeCount}->${afterSecondSave.narrativeCount}`)

      const insertButton = drawer(page).getByRole('button', { name: '插入正文' })
      const mediaNodesBefore = afterSecondSave.chapters.find((chapter) => chapter.id === run.fixture.chapterId)?.mediaNodeCount || 0
      await insertButton.click()
      await drawer(page).getByText('已插入正文；正文中只保存媒体引用。', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('.wall__dossier figure[data-media-reference]').waitFor({ state: 'visible', timeout: 10000 })
      await page.waitForTimeout(1400)
      const afterInsert = await storageState(page)
      const insertedChapter = afterInsert.chapters.find((chapter) => chapter.id === run.fixture.chapterId)
      check(results, '显式插入产生一个 pinax-media 引用且无 base64', insertedChapter?.mediaNodeCount === mediaNodesBefore + 1 && /pinax-media:\/\//.test(insertedChapter?.content || '') && !/base64|data:image/i.test(insertedChapter?.content || '') && !afterInsert.base64InLocalStorage, JSON.stringify({ mediaNodeCount: insertedChapter?.mediaNodeCount, tail: insertedChapter?.content?.slice(-240), base64InLocalStorage: afterInsert.base64InLocalStorage }))
      await page.waitForTimeout(120)
      check(results, '插入后候选 stale 并阻断二次插入', await insertButton.isDisabled() && await drawer(page).getByText(/来源已更新|不能插入/).count() >= 1)
      await insertButton.evaluate((button) => button.click())
      await page.waitForTimeout(300)
      const afterSecondInsertAttempt = await storageState(page)
      check(results, '二次插入尝试不重复写正文', afterSecondInsertAttempt.chapters.find((chapter) => chapter.id === run.fixture.chapterId)?.mediaNodeCount === insertedChapter?.mediaNodeCount)
      check(results, '1440 无横向滚动和控制台错误', desktopGeometry.overflow === 0 && run.errors.length === 0, run.errors.join(' | '))
      evidence.desktopProviderPrompt = providerPrompt
      evidence.desktopMediaAssetId = generatedMedia?.id || ''
    } finally {
      await run.context.close()
    }
  })

  await runJourney(results, '1024 响应式', async () => {
    const run = await createPage(browser, { width: 1024, height: 768 })
    try {
      await collapseInFirstParagraph(run.page)
      await openDesktopIllustrator(run.page)
      const tabletGeometry = await geometry(run.page)
      check(results, '1024 抽屉保持 72vw', Math.abs((tabletGeometry.dialog?.width || 0) - 1024 * 0.72) <= 2, JSON.stringify(tabletGeometry))
      check(results, '1024 参数/结果仍并列且无水平滚动', tabletGeometry.split && tabletGeometry.overflow === 0 && tabletGeometry.drawerOverflow === 0, JSON.stringify(tabletGeometry))
      await run.page.screenshot({ path: screenshotPaths.tablet, fullPage: false })
      check(results, '1024 旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      await run.context.close()
    }
  })

  await runJourney(results, '失败回滚', async () => {
    const run = await createPage(browser, { width: 1440, height: 800 })
    try {
      run.provider.setMode('failure')
      await collapseInFirstParagraph(run.page)
      await openDesktopIllustrator(run.page)
      const before = await storageState(run.page)
      await drawer(run.page).getByRole('button', { name: '生成插画' }).click()
      await drawer(run.page).locator('.image-gen-status.is-error').waitFor({ state: 'visible', timeout: 30000 })
      const after = await storageState(run.page)
      check(results, 'provider 失败零正文/素材/媒体候选写入', formalFingerprint(after) === formalFingerprint(before) && after.mediaCount === before.mediaCount && after.libraryCount === before.libraryCount)
    } finally {
      run.provider.releaseAll('failure')
      await run.context.close()
    }
  })

  await runJourney(results, '取消回滚', async () => {
    const run = await createPage(browser, { width: 1440, height: 800 })
    try {
      run.provider.setMode('delay')
      await collapseInFirstParagraph(run.page)
      await openDesktopIllustrator(run.page)
      const before = await storageState(run.page)
      await drawer(run.page).getByRole('button', { name: '生成插画' }).click()
      await run.provider.waitForCount(1)
      await drawer(run.page).getByRole('button', { name: '取消生成' }).click()
      run.provider.releaseAll('success')
      await drawer(run.page).locator('.image-gen-status.is-cancelled').waitFor({ state: 'visible', timeout: 10000 })
      await run.page.waitForTimeout(250)
      const after = await storageState(run.page)
      check(results, '作者取消零正文/素材/媒体候选写入', formalFingerprint(after) === formalFingerprint(before) && after.mediaCount === before.mediaCount && after.libraryCount === before.libraryCount)
    } finally {
      run.provider.releaseAll('success')
      await run.context.close()
    }
  })

  await runJourney(results, '切章迟到', async () => {
    const run = await createPage(browser, { width: 1440, height: 800 })
    try {
      run.provider.setMode('delay')
      const phrase = '莉娜数完第三盏航灯'
      await selectPhrase(run.page, phrase)
      await openDesktopIllustrator(run.page)
      const before = await storageState(run.page)
      await drawer(run.page).getByRole('button', { name: '生成插画' }).click()
      await run.provider.waitForCount(1)
      await closeIllustrator(run.page)
      await run.page.locator('.authoring-chapter-row').nth(1).click()
      await run.page.waitForTimeout(450)
      await collapseInFirstParagraph(run.page)
      await openDesktopIllustrator(run.page)
      check(results, '关闭再打开仍显示原 active provider session', await promptInput(run.page).inputValue() === phrase, await promptInput(run.page).inputValue())
      run.provider.releaseAll('success')
      await drawer(run.page).locator('.image-gen-status.is-success').waitFor({ state: 'visible', timeout: 30000 })
      await run.page.waitForTimeout(250)
      const after = await storageState(run.page)
      const insertButton = drawer(run.page).getByRole('button', { name: '插入正文' })
      check(results, '切章迟到结果零正文/素材写入并禁止插入', formalFingerprint(after) === formalFingerprint(before) && await insertButton.isDisabled(), JSON.stringify({ narrativeBefore: before.narrativeCount, narrativeAfter: after.narrativeCount, mediaAfter: after.mediaCount }))
    } finally {
      run.provider.releaseAll('success')
      await run.context.close()
    }
  })

  await runJourney(results, '390 手机', async () => {
    const run = await createPage(browser, { width: 390, height: 844 })
    try {
      const phrase = '莉娜数完第三盏航灯'
      await selectPhrase(run.page, phrase)
      await openMobileIllustrator(run.page)
      check(results, '390 通过 More→画师进入', await drawer(run.page).isVisible() && await promptInput(run.page).inputValue() === phrase)
      const mobileGeometry = await geometry(run.page)
      check(results, '390 画师为完整 viewport sheet 且无横滚', Math.abs((mobileGeometry.dialog?.width || 0) - 390) <= 1 && Math.abs((mobileGeometry.dialog?.height || 0) - 844) <= 1 && mobileGeometry.overflow === 0 && mobileGeometry.drawerOverflow === 0, JSON.stringify(mobileGeometry))
      const switcher = drawer(run.page).getByRole('radiogroup', { name: '画师工作区' })
      const parameters = switcher.getByRole('radio', { name: '画面与参数' })
      const resultsPane = switcher.getByRole('radio', { name: '候选与历史' })
      check(results, '390 内部参数/结果使用双态 switch', await parameters.getAttribute('aria-checked') === 'true' && await resultsPane.getAttribute('aria-checked') === 'false')
      await selectAllSceneSources(run.page)
      await drawer(run.page).getByRole('button', { name: '生成插画' }).click()
      await drawer(run.page).locator('.image-gen-status.is-success').waitFor({ state: 'visible', timeout: 30000 })
      await resultsPane.click()
      await drawer(run.page).locator('.image-gen-current-preview').waitFor({ state: 'visible' })
      check(results, '390 画师持有交互期间正文选区浮条不穿透', await run.page.locator('.writing-selection-actions').count() === 0)
      const mobileTouch = await run.page.evaluate(() => {
        const root = document.querySelector('.authoring-illustrator')
        const visible = (selector) => [...(root?.querySelectorAll(selector) || [])].filter((node) => node.offsetParent !== null)
        const targets = visible('.authoring-illustrator__head-actions button, .workspace-pane-switch button, .image-gen-generate-btn, .image-gen-cancel-btn, .image-preview-action-btn, .authoring-illustrator__scene-row')
        return {
          heights: targets.map((node) => ({ text: node.textContent?.trim() || node.getAttribute('aria-label') || node.className, height: node.getBoundingClientRect().height })),
          minHeight: Math.min(...targets.map((node) => node.getBoundingClientRect().height)),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          drawerOverflow: root ? root.scrollWidth - root.clientWidth : null
        }
      })
      check(results, '390 所有可见主操作命中区至少 44px', mobileTouch.minHeight >= 44, JSON.stringify(mobileTouch))
      check(results, '390 切到结果层后仍无水平滚动', mobileTouch.overflow === 0 && mobileTouch.drawerOverflow === 0, JSON.stringify(mobileTouch))
      await run.page.screenshot({ path: screenshotPaths.mobile, fullPage: false })
      check(results, '390 旅程无控制台错误', run.errors.length === 0, run.errors.join(' | '))
    } finally {
      await run.context.close()
    }
  })
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.pass)
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  fixtureImages: IMAGE_PATHS.map((imagePath) => path.relative(process.cwd(), imagePath)),
  total: results.length,
  failed: failed.length,
  screenshots: screenshotPaths,
  evidence,
  results
}
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
console.log(`F2-5 illustrator Gate: ${results.length - failed.length}/${results.length}`)
console.log(`Report: ${path.join(OUT_DIR, 'report.json')}`)
if (failed.length) process.exitCode = 1
