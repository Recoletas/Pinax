/* eslint-disable no-console */
// 设定页 ↔ Authoring 联动闭环 Gate（L8）。两本书/两个世界书播种 + 跨 surface 旅程。
// 只断言上下文、隔离、回程与失效，不逐像素审视觉；不调用真实模型。
// 用法：BASE=http://127.0.0.1:5198 node scripts/authoring-ui/settings-linkage-check.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '../..')
const BASE = process.env.BASE || 'http://127.0.0.1:5198'
const OUT_DIR = path.resolve(process.env.OUT_DIR || '/tmp/pinax-settings-linkage')
const FIXTURE_DIR = path.resolve(process.env.FIXTURE_DIR || 'tmp/authoring-context-closure')
fs.mkdirSync(OUT_DIR, { recursive: true })
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const sourceStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const results = []
function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 500) })
  if (!pass) console.log(`FAIL ${label} — ${String(detail).slice(0, 260)}`)
}

// —— 播种：两本书 A/B，各自绑定 WA/WB；同名人物不同 ID 不同内容。——
function buildStorage() {
  const snapshot = { ...sourceStorage }
  // 保留 fixture 世界书为 WA（改名内容便于识别）。
  const baseKey = Object.keys(snapshot).find((key) => key.startsWith('worldbook_'))
  const baseWorldbook = JSON.parse(snapshot[baseKey])
  const wa = { ...baseWorldbook, id: 'wa', name: '雾港世界（甲）', updatedAt: Date.now() }
  const characterIndex = wa.entries.findIndex((entry) => entry.type === 'character')
  if (characterIndex >= 0) {
    wa.entries[characterIndex] = {
      ...wa.entries[characterIndex],
      id: 'char-wa-lin',
      content: '【甲库版本】旧港抄表员，随身带黄铜钥匙。'
    }
  }
  // WB：同名人物、不同 ID、不同内容。
  const wbCharacter = characterIndex >= 0
    ? { ...wa.entries[characterIndex], id: 'char-wb-lin', content: '【乙库版本】北地猎手，与旧港抄表员无关。' }
    : { id: 'char-wb-lin', name: '林绣', type: 'character', content: '【乙库版本】北地猎手。', keys: ['林绣'], keysSecondary: [], injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1, excludeRecursion: false, group: null }, relations: {}, samples: [], speechStyle: '', metadata: { updatedAt: Date.now() } }
  const wb = {
    ...baseWorldbook,
    id: 'wb',
    name: '北地世界（乙）',
    updatedAt: Date.now() + 5,
    entries: [wbCharacter, ...wa.entries.filter((_, index) => index !== characterIndex).map((entry) => ({ ...entry, id: `${entry.id}-wb` }))]
  }
  snapshot.worldbook_wa = JSON.stringify(wa)
  snapshot.worldbook_wb = JSON.stringify(wb)
  const entriesMapA = Object.fromEntries(wa.entries.map((entry) => [entry.id, entry]))
  const entriesMapB = Object.fromEntries(wb.entries.map((entry) => [entry.id, entry]))
  snapshot.worldbook_wa = JSON.stringify({ ...wa, entriesMap: entriesMapA })
  snapshot.worldbook_wb = JSON.stringify({ ...wb, entriesMap: entriesMapB })
  snapshot.worldbooks_index = JSON.stringify([
    { id: 'wa', name: wa.name, updatedAt: wa.updatedAt, entryCount: wa.entries.length },
    { id: 'wb', name: wb.name, updatedAt: wb.updatedAt, entryCount: wb.entries.length }
  ])
  snapshot.active_worldbook_id = 'wa'
  const now = new Date().toISOString()
  const chapters = JSON.parse(snapshot.writing_books || '[]')
  const bookA = {
    id: 'book-a', title: '雾港纪事·甲', description: '', worldbookId: 'wa',
    createdAt: now, updatedAt: now,
    chapters: chapters[0]?.chapters?.length ? chapters[0].chapters : []
  }
  const bookB = { ...bookA, id: 'book-b', title: '北地手记·乙', worldbookId: 'wb' }
  const bookNone = { ...bookA, id: 'book-none', title: '未绑定之书', worldbookId: '' }
  snapshot.writing_books = JSON.stringify([bookA, bookB, bookNone])
  return snapshot
}
const SNAPSHOT = buildStorage()

// J7 需要 F1 的地点地图绑定（否则地点详情按钮不可见）；复用 F1 的 storage 增补。
function buildF1Storage() {
  // 从原始 fixture 构建（保留 fixture 书目），只补地图绑定与地图节点。
  const snapshot = { ...sourceStorage }
  const key = Object.keys(snapshot).find((item) => item.startsWith('worldbook_'))
  const worldbook = JSON.parse(snapshot[key])
  const locationIndex = worldbook.entries.findIndex((entry) => String(entry.id) === String(state.locationEntryId))
  if (locationIndex >= 0) {
    worldbook.entries[locationIndex] = {
      ...worldbook.entries[locationIndex],
      mapBinding: { status: 'confirmed', placeId: `place:${worldbook.id}:mist-map:tax-office`, mapAssetId: 'mist-map', mapName: '雾港地图', markerId: 'f1-tax-office', x: 480, y: 320 },
      parentRef: { targetName: '北海联邦 · 旧港' },
      placeRelations: [{ type: 'adjacent', targetName: '钟楼广场' }],
      metadata: { ...(worldbook.entries[locationIndex].metadata || {}), place: { ...(worldbook.entries[locationIndex].metadata?.place || {}), parentRef: { targetName: '北海联邦 · 旧港' }, relations: [{ type: 'adjacent', targetName: '钟楼广场' }] } }
    }
    // L6 地图→条目旅程需要地点实体：最小 geoHistory 节点绑定 placeId 与条目。
    worldbook.geoHistory = {
      mapId: 'mist-map',
      placeRefs: [],
      nodes: [{
        id: 'node-tax-office', title: '旧港税务所',
        placeRef: { placeId: `place:${worldbook.id}:mist-map:tax-office`, name: '旧港税务所' },
        entryIds: [state.locationEntryId],
        mapBinding: { placeId: `place:${worldbook.id}:mist-map:tax-office`, markerId: 'f1-tax-office', scene: '旧港税务所' }
      }]
    }
    snapshot[key] = JSON.stringify(worldbook)
  }
  snapshot.world_nodes = JSON.stringify([{
    id: 'f1-mist-map-root', parentId: null, name: '雾港地图', description: '', icon: 'world', sortOrder: 0, createdAt: 1,
    mapConfigJSON: JSON.stringify({ voronoiConfig: null, markers: [{ id: 'f1-tax-office', name: '旧港税务所', type: 'location', source: 'worldbook', worldbookEntryId: state.locationEntryId, bindingStatus: 'confirmed', bindingMethod: 'manual', placeId: `place:${worldbook.id}:mist-map:tax-office`, x: 480, y: 320 }], mapVersions: [], activeMapRevision: null, lastGenerationMeta: null })
  }])
  return snapshot
}
const F1_SNAPSHOT = buildF1Storage()
const WA_LIN_ID = 'char-wa-lin'

async function seed(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme', 'light')
    localStorage.setItem('app_ui_zoom', '1')
  }, SNAPSHOT)
  return context
}

async function contextInfo(page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-test="settings-context-bar"]')
    return {
      kicker: bar?.querySelector('.context-kicker')?.textContent.trim() || '',
      projectTitle: document.querySelector('.ws-tab.is-active')?.getAttribute('title') || '',
      selected: bar?.querySelector('.context-worldbook-select')?.selectedOptions?.[0]?.textContent.trim()
        || bar?.querySelector('.context-worldbook-empty')?.textContent.trim() || '',
      mismatch: bar?.querySelector('.context-mismatch')?.textContent.trim() || '',
      selectDisabled: bar?.querySelector('.context-worldbook-select')?.disabled ?? null,
      returnBtn: Boolean(document.querySelector('[data-test="settings-return-authoring"]'))
    }
  })
}

const browser = await chromium.launch()
try {
  // —— J1/J2/J3/J5/J6（1440）——
  {
    const context = await seed(browser, { width: 1440, height: 900 })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)))

    // J1a：A 书 + WA 条目 → 正确定位同一条目，上下文条显示书名，选择器锁定。
    await page.goto(`${BASE}/settings/worldbook/advanced?bookId=book-a&worldbookId=wa&entryId=${WA_LIN_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const j1a = { ...(await contextInfo(page)), ...await page.evaluate(() => ({
      missing: Boolean(document.querySelector('[data-test="entry-missing"]')),
      hasJiaKu: [...document.querySelectorAll('textarea, input[type="text"]')].some((node) => (node.value || '').includes('【甲库版本】')),
      listHit: [...document.querySelectorAll('[data-entry-id]')].some((node) => node.dataset.entryId === 'char-wa-lin' && node.offsetTop >= 0)
    })) }
    check('J1a A 书打开条目显示甲库上下文与内容', j1a.projectTitle.includes('雾港纪事·甲') && j1a.selected === '雾港世界（甲）'
      && j1a.hasJiaKu && !j1a.missing, JSON.stringify(j1a))
    check('J1a 项目模式选择器锁定', j1a.selectDisabled === true, j1a.selectDisabled)
    check('J1a 提供回到正文', j1a.returnBtn === true, j1a.returnBtn)

    // J1b：同一 entryId 在 B 书（WB 无此 ID）→ 明确缺失提示，不冒充目标。
    await page.goto(`${BASE}/settings/worldbook/advanced?bookId=book-b&worldbookId=wb&entryId=${WA_LIN_ID}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const j1b = { ...(await contextInfo(page)), ...await page.evaluate(() => ({
      missing: Boolean(document.querySelector('[data-test="entry-missing"]')),
      bodyHasYiKu: document.body.innerText.includes('【乙库版本】') || [...document.querySelectorAll('textarea')].some((node) => (node.value || '').includes('【乙库版本】'))
    })) }
    check('J1b 跨库 entryId 明确缺失且不串库', j1b.projectTitle.includes('北地手记·乙') && j1b.missing === true && !j1b.bodyHasJiaKu, JSON.stringify(j1b))

    // J6：路由快照与绑定不一致 → 提示并按当前绑定打开。
    await page.goto(`${BASE}/settings/structured?bookId=book-a&worldbookId=wb`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const j6 = await contextInfo(page)
    check('J6 路由不一致提示并使用当前绑定', j6.mismatch.includes('已变化') && j6.selected === '雾港世界（甲）', JSON.stringify(j6))

    // J2：分区切换保留 bookId/worldbookId。
    await page.goto(`${BASE}/settings/worldbook/advanced?bookId=book-a&worldbookId=wa`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    await page.locator('[data-test="settings-section-tab-structured"]').click()
    await page.waitForTimeout(700)
    const j2a = { url: page.url(), ...(await contextInfo(page)) }
    check('J2 条目→设定保留项目上下文', /[?&]bookId=book-a/.test(j2a.url) && /[?&]worldbookId=wa/.test(j2a.url) && j2a.projectTitle.includes('雾港纪事·甲'), JSON.stringify({ url: j2a.url, kicker: j2a.kicker }))
    await page.locator('[data-test="settings-section-tab-map"]').click()
    await page.waitForTimeout(900)
    const j2b = { url: page.url(), ...(await contextInfo(page)) }
    check('J2 设定→地图保留项目上下文', /[?&]bookId=book-a/.test(j2b.url) && /[?&]worldbookId=wa/.test(j2b.url), JSON.stringify({ url: j2b.url }))

    // J1c：普通设定往返（旅程 2）——编辑条目 → 保存 → 回到正文 → 工作台读到新值。
    const locationEntryId = String(state.locationEntryId || '')
    await page.goto(`${BASE}/settings/worldbook/advanced?bookId=book-a&worldbookId=wa&entryId=${locationEntryId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const contentBox = page.locator('.entry-editor textarea').first()
    await contentBox.waitFor({ timeout: 15000 })
    const editedMarker = `【往返编辑 ${Date.now() % 100000}】`
    await contentBox.fill((await contentBox.inputValue()).slice(0, 40) + ' ' + editedMarker)
    await page.getByRole('button', { name: '保存条目' }).click()
    await page.waitForTimeout(1000)
    await page.locator('[data-test="settings-return-authoring"]').click()
    await page.waitForSelector('.ProseMirror', { timeout: 30000 })
    const worldbookTool = page.locator('[data-authoring-tool="worldbook"]')
    await worldbookTool.click()
    await page.locator('[data-authoring-inspector="worldbook"]').waitFor({ timeout: 15000 })
    await page.locator('.setting-directory__modes button', { hasText: '全部' }).click()
    await page.getByLabel('搜索设定').fill(editedMarker)
    await page.waitForTimeout(700)
    const j1c = await page.evaluate(() => ({
      hit: Boolean(document.querySelector('.setting-directory__group button')),
      emptyText: document.querySelector('.setting-directory__empty')?.innerText || ''
    }))
    check('J1c 编辑保存后工作台读到新值', j1c.hit === true,
      JSON.stringify({ ...j1c, marker: editedMarker }))

    // J5：A/B 标签隔离——同时打开两书条目标签，标题与内容各自对应。
    await page.goto(`${BASE}/settings/worldbook/advanced?bookId=book-a&worldbookId=wa`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(600)
    await page.goto(`${BASE}/settings/worldbook/advanced?bookId=book-b&worldbookId=wb&entryId=char-wb-lin`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const j5 = await page.evaluate(() => ({
      kicker: document.querySelector('[data-test="settings-context-bar"] .context-kicker')?.textContent.trim() || '',
      projectTitle: document.querySelector('.ws-tab.is-active')?.getAttribute('title') || '',
      selectValue: document.querySelector('[data-test="settings-context-bar"] .context-worldbook-select')?.value || '',
      anyTextAreaHasYiKu: [...document.querySelectorAll('textarea')].some((node) => (node.value || '').includes('【乙库版本】')),
      anyTextAreaHasJiaKu: [...document.querySelectorAll('textarea')].some((node) => (node.value || '').includes('【甲库版本】')),
      listNames: [...document.querySelectorAll('[data-entry-id]')].slice(0, 4).map((node) => node.textContent.trim().slice(0, 24))
    }))
    check('J5 B 书条目页绑定乙库且无甲库内容', j5.projectTitle.includes('北地手记·乙') && j5.selectValue === 'wb' && j5.anyTextAreaHasYiKu && !j5.anyTextAreaHasJiaKu, JSON.stringify(j5))

    // J5b：无 bookId 的高级页仍是全局模式，但显式 worldbookId 必须生效。
    await page.goto(`${BASE}/settings/worldbook/advanced?worldbookId=wb&entryId=char-wb-lin`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    const j5b = { ...(await contextInfo(page)), hasYiKu: await page.locator('.entry-editor textarea').first().inputValue().then((value) => value.includes('【乙库版本】')).catch(() => false) }
    check('J5b 全局条目页遵从显式世界书定位', j5b.kicker === '世界书' && j5b.selectDisabled === false && j5b.selected === '北地世界（乙）' && j5b.hasYiKu, JSON.stringify(j5b))

    // J3：回到正文 → 聚焦既有/新建 Authoring 标签，落在同一本书。
    await page.goto(`${BASE}/settings/worldbook/advanced?bookId=book-a&worldbookId=wa`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    await page.locator('[data-test="settings-return-authoring"]').click()
    await page.waitForSelector('.ProseMirror', { timeout: 30000 })
    const j3 = { url: page.url(), ...await page.evaluate(() => ({
      editor: Boolean(document.querySelector('.ProseMirror'))
    })) }
    check('J3 回到正文落在原书写作页', /authoring/.test(j3.url) && /[?&]bookId=book-a/.test(j3.url) && j3.editor, JSON.stringify({ url: j3.url, editor: j3.editor, title: j3.title }))

    check('J1 无页面错误（1440）', errors.length === 0, errors.join(' | '))
    await page.screenshot({ path: path.join(OUT_DIR, 'linkage-1440.png') })
    await context.close()
  }

  // —— J7（fixture 书）：Authoring 地点出程 → 地图 → 条目 → 回到正文。——
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await context.addInitScript((snapshot) => {
      localStorage.clear()
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
      localStorage.setItem('app_theme', 'light')
      localStorage.setItem('app_ui_zoom', '1')
    }, F1_SNAPSHOT)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)))
    await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ProseMirror', { timeout: 30000 })
    const unit = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
    await unit.waitFor({ state: 'visible' })
    await unit.locator('p').first().click({ position: { x: 80, y: 10 } })
    await page.waitForTimeout(300)
    let deletedLocationEntry = false
    // 地点详情 → 在地图查看（既有桥接，出程带 volatile 恢复状态）。
    const detailButton = page.locator('.wall__shelf-scene [aria-label="查看地点详情"]')
    if (await detailButton.count()) {
      await detailButton.click()
      const inspector = page.locator('.writing-inspector.is-open')
      await inspector.locator('[data-test="scene-location-map-bridge"]').waitFor({ state: 'visible' })
      const mapBridge = inspector.locator('[data-test="scene-location-map-bridge"] button, [data-test="scene-location-map-bridge"] a').first()
      await mapBridge.click()
      await page.waitForTimeout(1500)
      const onMap = page.url()
      check('J7 地点出程落在地图并带项目上下文', /settings\/world-map/.test(onMap) && /[?&]bookId=/.test(onMap), onMap)
      // 地图 → 条目（打开该地点条目）。地点实体面板随地图数据加载，显式等待。
      // 地点实体面板在「地图资料」工具抽屉内：先展开抽屉再点打开条目。
      const atlasToggle = page.locator('[aria-controls="atlas-tools-panel"], [aria-expanded][class*="atlas"]').first()
      if (await atlasToggle.count() && !(await atlasToggle.getAttribute('aria-expanded') === 'true')) {
        await atlasToggle.click()
      }
      await page.locator('[data-test="place-entity-panel"]').waitFor({ timeout: 15000 })
      const entryButton = page.getByRole('button', { name: '打开条目' }).first()
      const entryReachable = await entryButton.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
      if (entryReachable) {
        await entryButton.click()
        await page.waitForTimeout(1200)
        const onEntries = page.url()
        check('J7 地图→条目保留项目上下文', /settings\/worldbook\/advanced/.test(onEntries) && /[?&]bookId=/.test(onEntries), onEntries)
        // 在完整往返链中删除当前场引用，回正文后必须显式失效，不能继续假装有效。
        page.once('dialog', (dialog) => dialog.accept())
        await page.getByRole('button', { name: '删除条目', exact: true }).click()
        await page.locator('[data-test="entry-missing"]').waitFor({ timeout: 15000 })
        deletedLocationEntry = true
      } else {
        const diag = await page.evaluate(() => ({
          panel: Boolean(document.querySelector('[data-test="place-entity-panel"]')),
          rows: document.querySelectorAll('.place-entity-row').length,
          buttons: [...document.querySelectorAll('button')].map((node) => node.textContent.trim()).filter(Boolean).slice(0, 30),
          url: location.href
        }))
        check('J7 地图→条目入口存在', false, JSON.stringify(diag).slice(0, 400))
      }
      // 回到正文 → 回到同一本书同一章。
      const back = page.locator('[data-test="settings-return-authoring"]')
      await back.waitFor({ timeout: 10000 })
      await back.click()
      await page.waitForTimeout(1500)
      const backUrl = page.url()
      const backState = {
        targetUnit: await page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`).count() > 0,
        chapterId: new URL(backUrl).searchParams.get('chapterId') || ''
      }
      check('J7 回到正文回到原书原章与原单元', /authoring/.test(backUrl)
        && new URL(backUrl).searchParams.get('bookId') === String(state.bookId)
        && backState.chapterId === String(state.targetChapterId)
        && backState.targetUnit, JSON.stringify({ backUrl, ...backState }))
      if (backState.targetUnit && deletedLocationEntry) {
        await page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"] p`).first().click({ position: { x: 60, y: 10 } })
        const invalid = page.locator('[data-test="scene-bind"]')
        await invalid.waitFor({ timeout: 15000 })
        const invalidText = (await invalid.innerText()).trim()
        check('J7 删除当前场地点后显示引用失效', invalidText.includes('现场引用已失效'), invalidText)
      } else {
        check('J7 删除当前场地点后显示引用失效', false, JSON.stringify({ deletedLocationEntry, ...backState }))
      }
    } else {
      check('J7 场景地点入口存在', false, 'fixture 未提供地点详情按钮')
    }
    check('J7 无页面错误', errors.length === 0, errors.join(' | '))
    await page.screenshot({ path: path.join(OUT_DIR, 'linkage-j7.png') })
    await context.close()
  }

  // —— J4（独立 context）：未绑定 / 不存在的书。——
  {
    const context = await seed(browser, { width: 1440, height: 900 })
    const page = await context.newPage()
    await page.goto(`${BASE}/settings/structured?bookId=book-none`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const j4 = await page.evaluate(() => ({
      unbound: Boolean(document.querySelector('[data-test="settings-unbound"]')),
      kicker: document.querySelector('[data-test="settings-context-bar"] .context-kicker')?.textContent.trim() || ''
    }))
    check('J4a 未绑定书显示空态', j4.unbound === true, JSON.stringify(j4))
    await page.goto(`${BASE}/settings/structured?bookId=book-gone`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const j4c = await page.evaluate(() => document.body.innerText.includes('这本书已不存在'))
    check('J4b 不存在的书显示明确缺失', j4c === true, j4c)
    await context.close()
  }

  // —— 390 抽查：上下文条与回程可达 ——
  {
    const context = await seed(browser, { width: 390, height: 844 })
    const page = await context.newPage()
    await page.goto(`${BASE}/settings/worldbook/advanced?bookId=book-a&worldbookId=wa`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const mobile = await page.evaluate(() => {
      const bar = document.querySelector('[data-test="settings-context-bar"]')
      const back = document.querySelector('[data-test="settings-return-authoring"]')
      const box = back?.getBoundingClientRect()
      return {
        kicker: bar?.querySelector('.context-kicker')?.textContent.trim() || '',
      projectTitle: document.querySelector('.ws-tab.is-active')?.getAttribute('title') || '',
        overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      overflowBy: (() => {
        const cw = document.documentElement.clientWidth
        return [...document.querySelectorAll('.settings-context-bar, .settings-section-nav, .settings-return-authoring, .context-worldbook-select, .context-kicker')]
          .filter((node) => { const box = node.getBoundingClientRect(); return box.right > cw + 1 })
          .map((node) => node.className.toString().slice(0, 40) + '@' + Math.round(node.getBoundingClientRect().right))
      })(),
        backH: box ? Math.round(box.height) : 0,
        backVisible: Boolean(back && box && box.top >= 0 && box.bottom <= window.innerHeight)
      }
    })
    check('J8 390 上下文条、回程可达、无横向溢出', mobile.projectTitle.includes('雾港纪事·甲') && mobile.overflow && mobile.backH >= 40 && mobile.backVisible, JSON.stringify(mobile))
    await page.screenshot({ path: path.join(OUT_DIR, 'linkage-390.png') })
    await context.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.pass)
console.log(`\n[settings-linkage] pass: ${results.length - failed.length}/${results.length}`)
fs.writeFileSync(path.join(OUT_DIR, 'settings-linkage-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, results, failed: failed.map((item) => item.label) }, null, 2))
process.exit(failed.length ? 1 : 0)
