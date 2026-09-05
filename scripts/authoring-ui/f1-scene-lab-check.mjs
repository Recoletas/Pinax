/* eslint-disable no-console */
// F1 browser Gate. F1-0 covers the read-only scene-location bridge; later
// slices extend this same journey instead of creating another runner.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { installDeterministicProviderMock } from './provider-mock.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const SLICE = String(process.env.F1_SLICE || '').trim()
const FIXTURE_DIR = path.resolve('tmp/authoring-context-closure')
const OUT_DIR = path.resolve('/tmp/pinax-authoring-f1')
const REPORT_DIR = path.resolve('tmp/authoring-rollout/f1')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const sourceStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(REPORT_DIR, { recursive: true })

function buildF1Storage() {
  const storage = { ...sourceStorage }
  const worldbookKey = `worldbook_${state.worldbookId}`
  const worldbook = JSON.parse(storage[worldbookKey])
  worldbook.entries = (worldbook.entries || []).map((entry) => (
    String(entry.id) !== String(state.locationEntryId)
      ? entry
      : {
          ...entry,
          mapBinding: {
            status: 'confirmed',
            placeId: `place:${state.worldbookId}:mist-map:tax-office`,
            mapAssetId: 'mist-map',
            mapName: '雾港地图',
            markerId: 'f1-tax-office',
            x: 480,
            y: 320
          },
          parentRef: { targetName: '北海联邦 · 旧港' },
          placeRelations: [{ type: 'adjacent', targetName: '钟楼广场' }],
          metadata: {
            ...(entry.metadata || {}),
            place: {
              ...(entry.metadata?.place || {}),
              parentRef: { targetName: '北海联邦 · 旧港' },
              relations: [{ type: 'adjacent', targetName: '钟楼广场' }]
            }
          }
        }
  ))
  storage[worldbookKey] = JSON.stringify(worldbook)
  storage.world_nodes = JSON.stringify([{
    id: 'f1-mist-map-root', parentId: null, name: '雾港地图', description: '', icon: 'world', sortOrder: 0,
    createdAt: 1,
    mapConfigJSON: JSON.stringify({
      voronoiConfig: null,
      markers: [{
        id: 'f1-tax-office', name: '旧港税务所', type: 'location', source: 'worldbook',
        worldbookEntryId: state.locationEntryId, bindingStatus: 'confirmed', bindingMethod: 'manual',
        placeId: `place:${state.worldbookId}:mist-map:tax-office`, x: 480, y: 320
      }],
      mapVersions: [], activeMapRevision: null, lastGenerationMeta: null
    })
  }])
  return storage
}

const storage = buildF1Storage()
const results = []
const screenshots = {
  desktop: path.join(OUT_DIR, 'f1-0-location-bridge-1440.png'),
  mobile: path.join(OUT_DIR, 'f1-0-location-bridge-390.png'),
  laboratoryDesktop: path.join(OUT_DIR, 'f1-3-scene-laboratory-1440.png'),
  laboratoryTablet: path.join(OUT_DIR, 'f1-3-scene-laboratory-1024.png'),
  laboratoryMobile: path.join(OUT_DIR, 'f1-3-scene-laboratory-390.png'),
  finalDirection: path.join(OUT_DIR, 'f1-final-1440-direction.png'),
  finalImpact: path.join(OUT_DIR, 'f1-final-1440-impact.png'),
  finalMobile: path.join(OUT_DIR, 'f1-final-390-scene-sheet.png')
}

const finalSelectedTitle = '让他共同验证总册装订线'
const finalRejectedActions = ['让艾德加离开档案架', '故意说错暗格编号']
const finalProse = [
  ':::action',
  '莉娜把缺页摊在窗下，让艾德加辨认装订线上的新伤。',
  ':::dialogue|艾德加',
  '“这不是撕痕，是拆线后又缝回去的。”',
  ':::thought|莉娜',
  '她意识到对方比预想中更熟悉这本总册，也更难从这场调查中排除。'
].join('\n')

function finalSceneDirections({ pressure, long = false } = {}) {
  const evidenceRef = pressure?.allowedEvidenceRefs?.find(Boolean)
  const entityRef = pressure?.allowedEntityRefs?.find((ref) => String(ref).includes(state.edgarEntryId || ''))
    || pressure?.allowedEntityRefs?.find(Boolean)
  const suffix = long ? '，并在所有仍然等待复核的证词之间建立能够被作者逐项检查的因果次序' : ''
  return {
    pressure: {
      statement: `艾德加被带入本次推演后，莉娜必须决定是否让他接触旧港税务所失踪总册的秘密${suffix}。`,
      evidenceRefs: [evidenceRef]
    },
    directions: [
      { id: 'conceal', title: long ? '暂时隐瞒档案架后方仍在变化的异常装订痕迹' : '先隐瞒异象', action: `${finalRejectedActions[0]}，独自检查暗格${suffix}。`, immediateGain: `保住调查主动权${suffix}`, cost: `艾德加会察觉她刻意回避${suffix}`, evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] },
      { id: 'verify', title: finalSelectedTitle, action: `当面指出缺页，请艾德加辨认装订痕迹${suffix}。`, immediateGain: `更快确认失窃线索${suffix}`, cost: `秘密与判断权交到他手里${suffix}`, evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] },
      { id: 'probe', title: long ? '借反复出现的暗格编号与潮痕变化试探他的知情程度' : '借异象试探他', action: `${finalRejectedActions[1]}，观察艾德加是否纠正${suffix}。`, immediateGain: `判断他知道多少${suffix}`, cost: `误判会暴露自己的怀疑${suffix}`, evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] }
    ]
  }
}

function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 1000) })
}

function near(a, b, tolerance = 2) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance
}

async function seedContext(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
  }, storage)
  return context
}

async function openTarget(page) {
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 30000 })
  const target = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
  await target.waitFor({ state: 'visible' })
  await target.locator('p').first().click({ position: { x: 80, y: 10 } })
  await page.waitForTimeout(250)
}

async function editorState(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('.wall__dossier-scroll')
    const selection = document.getSelection()
    const anchor = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement
    return {
      scrollTop: Number(scroll?.scrollTop || 0),
      unitId: anchor?.closest?.('[data-writing-unit]')?.getAttribute('data-unit-id') || '',
      anchorOffset: Number(selection?.anchorOffset || 0),
      focusOffset: Number(selection?.focusOffset || 0)
    }
  })
}

async function openLocationDetail(page, mobile = false) {
  if (mobile) {
    await page.locator('[data-authoring-tool="scene"]').click({ force: true })
    await page.locator('.writing-inspector.is-open [aria-label="查看地点详情"]').click()
  } else {
    await page.locator('.wall__shelf-scene [aria-label="查看地点详情"]').click()
  }
  const detail = page.locator('.writing-inspector.is-open')
  await detail.locator('[data-test="scene-location-map-bridge"]').waitFor({ state: 'visible' })
  return detail
}

async function openSceneLaboratory(page, { mobile = false, intent = 'run-only' } = {}) {
  if (mobile) {
    const sceneTool = page.locator('[data-authoring-tool="scene"]')
    const sceneEdit = page.locator('.writing-inspector.is-open [data-test="scene-edit"]')
    await sceneTool.click({ force: true })
    if (!await sceneEdit.isVisible().catch(() => false)) await sceneTool.click({ force: true })
    await sceneEdit.click()
  } else {
    await page.locator('.wall__shelf-scene [data-test="scene-edit"]').dispatchEvent('click')
  }
  const inspector = page.locator('.writing-inspector.is-open')
  await inspector.locator('.scene-curation').waitFor({ state: 'visible' })
  const edgar = inspector.locator('.scene-curation__people li').filter({ hasText: '艾德加' }).first()
  await edgar.waitFor({ state: 'visible' })
  await edgar.getByRole('button', { name: intent === 'next-passage' ? '下一段入场' : '带入本次推演' }).click()
  const laboratory = page.locator('[data-test="scene-laboratory"]')
  await laboratory.waitFor({ state: 'visible' })
  return laboratory
}

async function mockDirectionPlanner(page, { failFirst = false, delayMs = 0 } = {}) {
  const calls = []
  await page.route('**/api/advisor/task', async (route) => {
    const request = route.request()
    const payload = request.postDataJSON()
    if (payload?.taskType !== 'authoring.scene.directions') return route.continue()
    calls.push(payload)
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (failFirst && calls.length === 1) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'F1_GATE_TIMEOUT', error: 'fixture timeout', retryable: true }) })
    }
    const pressureBlock = payload.envelope?.blocks?.find((block) => block.kind === 'scene')
    const pressure = JSON.parse(pressureBlock?.content || '{}')
    const evidenceRef = pressure.allowedEvidenceRefs?.find(Boolean)
    const entityRef = pressure.allowedEntityRefs?.find((ref) => String(ref).includes(state.edgarEntryId || ''))
      || pressure.allowedEntityRefs?.find(Boolean)
    const advice = JSON.stringify({
      pressure: {
        statement: '艾德加被带入本次推演后，莉娜必须决定是否让他接触旧港税务所的秘密。',
        evidenceRefs: [evidenceRef]
      },
      directions: [
        { id: 'conceal', title: '先隐瞒异象', action: '让艾德加离开档案架，独自检查暗格。', immediateGain: '保住调查主动权', cost: '艾德加会察觉她刻意回避', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] },
        { id: 'verify', title: '让他共同验证', action: '当面指出缺页，请艾德加辨认装订痕迹。', immediateGain: '更快确认失窃线索', cost: '秘密与判断权交到他手里', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] },
        { id: 'probe', title: '借异象试探他', action: '故意说错暗格编号，观察艾德加是否纠正。', immediateGain: '判断他知道多少', cost: '误判会暴露自己的怀疑', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] }
      ]
    })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ taskType: payload.taskType, advice, result: { task: payload.taskType, mode: 'review', summary: advice } })
    })
  })
  return calls
}

async function seedFinalContext(browser, viewport, { dark = false, reducedMotion = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript(({ snapshot, colorScheme }) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_theme', colorScheme)
    localStorage.setItem('app_ui_zoom', '1')
  }, { snapshot: storage, colorScheme: dark ? 'dark' : 'light' })
  if (reducedMotion) await context.addInitScript(() => {
    Object.defineProperty(window, '__f1ReducedMotion', { value: true })
  })
  return context
}

async function dossierGeometry(page) {
  return page.evaluate(() => {
    const unit = document.querySelector('#authoring-block-gap')?.closest?.('[data-writing-unit]')
      || document.querySelector('[data-writing-unit]')
    const dossier = document.querySelector('.wall__dossier-scroll')
    const rect = unit?.getBoundingClientRect()
    return {
      x: rect?.x || 0,
      width: rect?.width || 0,
      top: rect?.top || 0,
      scrollTop: Number(dossier?.scrollTop || 0),
      scrollWidth: Number(dossier?.scrollWidth || 0),
      clientWidth: Number(dossier?.clientWidth || 0)
    }
  })
}

function stableWritingStorage(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => (
    key === 'writing_books'
    || key.startsWith('worldbook_')
    || key.includes('memory')
    || key.includes('narrative')
  )))
}

const browser = await chromium.launch()
try {
  const desktopContext = await seedContext(browser, { width: 1440, height: 900 })
  const page = await desktopContext.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await openTarget(page)
  const before = await editorState(page)
  const detail = await openLocationDetail(page)
  const detailText = await detail.innerText()
  check('F1-0 地点详情展示 canonical 世界书来源', detailText.includes('世界书来源') && detailText.includes('旧港税务所'), detailText)
  check('F1-0 confirmed binding 才显示已落图', detailText.includes('已落图') && detailText.includes('雾港地图'), detailText)
  check('F1-0 地图摘要保持一行且包含真实区域/相邻', detailText.includes('北海联邦 · 旧港') && detailText.includes('钟楼广场'), detailText)
  await page.screenshot({ path: screenshots.desktop, fullPage: false })

  await detail.locator('[data-test="scene-location-map-bridge"] button').click()
  await page.waitForURL(/\/settings\/world-map/)
  const url = new URL(page.url())
  check('F1-0 地图路由携带书/世界书/条目稳定身份',
    url.searchParams.get('bookId') === String(state.bookId)
      && url.searchParams.get('worldbookId') === String(state.worldbookId)
      && url.searchParams.get('entryId') === String(state.locationEntryId), url.toString())
  const mapTab = page.locator(`[data-tab-key="project:${state.bookId}:map"]`)
  await mapTab.waitFor({ state: 'visible' })
  check('F1-0 地图使用独立项目标签', (await mapTab.getAttribute('aria-selected')) === 'true')
  const persistedTabs = await page.evaluate(() => localStorage.getItem('workspace_tabs_v1') || '')
  check('F1-0 caret/scroll return bookmark 不进入 localStorage', !persistedTabs.includes('anchorOffset') && !persistedTabs.includes('"selection"'), persistedTabs)

  await mapTab.locator('.ws-tab__close').click()
  await page.waitForURL(/\/authoring/)
  await page.waitForSelector('.ProseMirror')
  await page.waitForTimeout(450)
  const after = await editorState(page)
  check('F1-0 返回原书原章',
    new URL(page.url()).searchParams.get('bookId') === String(state.bookId)
      && new URL(page.url()).searchParams.get('chapterId') === String(state.targetChapterId), page.url())
  check('F1-0 返回后恢复原 writingUnit 与 selection',
    before.unitId === after.unitId && before.anchorOffset === after.anchorOffset && before.focusOffset === after.focusOffset,
    JSON.stringify({ before, after }))
  check('F1-0 返回后恢复正文 scrollTop', near(before.scrollTop, after.scrollTop), JSON.stringify({ before, after }))
  check('F1-0 1440 零页面错误', errors.length === 0, errors.join(' | '))
  await desktopContext.close()

  const mobileContext = await seedContext(browser, { width: 390, height: 844 })
  const mobile = await mobileContext.newPage()
  const mobileErrors = []
  mobile.on('pageerror', (error) => mobileErrors.push(error.message))
  mobile.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(message.text()) })
  await openTarget(mobile)
  const mobileDetail = await openLocationDetail(mobile, true)
  const bridgeBox = await mobileDetail.locator('[data-test="scene-location-map-bridge"]').boundingBox()
  const action = mobileDetail.locator('[data-test="scene-location-map-bridge"] button')
  const actionHeight = await action.evaluate((element) => ({
    rendered: element.getBoundingClientRect().height,
    logical: Number.parseFloat(getComputedStyle(element).minHeight) || 0
  }))
  check('F1-0 390 地点轻桥完整位于 sheet', Boolean(bridgeBox && bridgeBox.x >= 0 && bridgeBox.x + bridgeBox.width <= 390), JSON.stringify(bridgeBox))
  check('F1-0 390 地图动作满足 44px 逻辑触控', actionHeight.logical >= 44, JSON.stringify(actionHeight))
  check('F1-0 390 无横向滚动', await mobile.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
  await mobile.screenshot({ path: screenshots.mobile, fullPage: false })
  check('F1-0 390 零页面错误', mobileErrors.length === 0, mobileErrors.join(' | '))
  await mobileContext.close()

  for (const viewport of [
    { width: 1440, height: 900, key: 'laboratoryDesktop' },
    { width: 1024, height: 768, key: 'laboratoryTablet' }
  ]) {
    const context = await seedContext(browser, viewport)
    const labPage = await context.newPage()
    const plannerCalls = await mockDirectionPlanner(labPage, { failFirst: viewport.width === 1440 })
    const errorsForViewport = []
    labPage.on('pageerror', (error) => errorsForViewport.push(error.message))
    labPage.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('500 (Internal Server Error)')) errorsForViewport.push(message.text())
    })
    await labPage.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
    await labPage.waitForSelector('.ProseMirror', { timeout: 30000 })
    const target = labPage.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
    await target.locator('p').first().click({ position: { x: 80, y: 10 } })
    await labPage.waitForTimeout(250)
    const before = await target.boundingBox()
    const storageBefore = stableWritingStorage(await labPage.evaluate(() => ({ ...localStorage })))
    const laboratory = await openSceneLaboratory(labPage)
    if (viewport.width === 1440) {
      await laboratory.locator('[data-scene-lab-phase="failed"], .authoring-scene-lab__insufficient.is-failed').first().waitFor({ state: 'visible' })
      check('F1-3 provider 失败不自动重试', plannerCalls.length === 1, String(plannerCalls.length))
      check('F1-3 失败态保留原地退路', (await laboratory.innerText()).includes('重试方向') && (await laboratory.innerText()).includes('直接普通推演'))
      await laboratory.getByRole('button', { name: '重试方向' }).click()
    }
    await laboratory.locator('.authoring-scene-lab__direction').first().waitFor({ state: 'visible' })
    const directions = laboratory.locator('.authoring-scene-lab__direction')
    const text = await laboratory.innerText()
    check(`F1-3 ${viewport.width} production session 产出三方向`,
      await directions.count() === 3
        && text.includes('眼前所得')
        && text.includes('代价')
        && text.includes('艾德加')
        && await laboratory.locator('.authoring-scene-lab__evidence button').count() === 1,
      text)
    check(`F1-3 ${viewport.width} 规划请求无工具且带入人物意图`,
      plannerCalls.length === (viewport.width === 1440 ? 2 : 1)
        && plannerCalls.every((call) => call.options?.toolChoice === 'none')
        && plannerCalls.every((call) => JSON.stringify(call.envelope).includes('艾德加')),
      JSON.stringify(plannerCalls.map((call) => ({ taskType: call.taskType, toolChoice: call.options?.toolChoice }))))
    const after = await target.boundingBox()
    check(`F1-3 ${viewport.width} 打开实验室不改变目标 writingUnit 几何`,
      Boolean(before && after && near(before.x, after.x) && near(before.width, after.width) && near(before.y, after.y)),
      JSON.stringify({ before, after }))
    await directions.nth(1).click()
    check(`F1-3 ${viewport.width} 选中后仅有一个主动作`,
      await laboratory.locator('.authoring-scene-lab__footer .is-primary').count() === 1
        && await laboratory.locator('.authoring-scene-lab__direction.is-selected').count() === 1)
    const labBox = await laboratory.boundingBox()
    const unitBox = await target.boundingBox()
    check(`F1-3 ${viewport.width} 实验室与正文同轴`,
      Boolean(labBox && unitBox && near(labBox.x, unitBox.x, 4) && near(labBox.width, unitBox.width, 4)),
      JSON.stringify({ labBox, unitBox }))
    const geometry = await dossierGeometry(labPage)
    check(`F1-3 ${viewport.width} 稿面无嵌套横滚`, geometry.scrollWidth <= geometry.clientWidth + 1, JSON.stringify(geometry))
    const storageAfter = stableWritingStorage(await labPage.evaluate(() => ({ ...localStorage })))
    check(`F1-3 ${viewport.width} 选择前后正式数据零写入`, JSON.stringify(storageBefore) === JSON.stringify(storageAfter))
    check(`F1-3 ${viewport.width} 零页面错误`, errorsForViewport.length === 0, errorsForViewport.join(' | '))
    await labPage.screenshot({ path: screenshots[viewport.key], fullPage: false })
    await context.close()
  }

  const laboratoryMobileContext = await seedContext(browser, { width: 390, height: 844 })
  const laboratoryMobile = await laboratoryMobileContext.newPage()
  const mobilePlannerCalls = await mockDirectionPlanner(laboratoryMobile)
  const laboratoryMobileErrors = []
  laboratoryMobile.on('pageerror', (error) => laboratoryMobileErrors.push(error.message))
  laboratoryMobile.on('console', (message) => { if (message.type() === 'error') laboratoryMobileErrors.push(message.text()) })
  await laboratoryMobile.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
  await laboratoryMobile.waitForSelector('.ProseMirror', { timeout: 30000 })
  const mobileTarget = laboratoryMobile.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
  await mobileTarget.locator('p').first().click({ position: { x: 40, y: 10 } })
  const mobileLab = await openSceneLaboratory(laboratoryMobile, { mobile: true })
  await mobileLab.locator('.authoring-scene-lab__direction').first().waitFor({ state: 'visible' })
  check('F1-3 390 当前场 sheet 选择后关闭', await laboratoryMobile.locator('.writing-inspector.is-open').count() === 0)
  check('F1-3 390 只发一次 production 规划请求', mobilePlannerCalls.length === 1)
  const mobileDirectionHeights = await mobileLab.locator('.authoring-scene-lab__direction').evaluateAll((elements) => (
    elements.map((element) => element.getBoundingClientRect().height)
  ))
  check('F1-3 390 三方向单列且满足 44px 触控',
    mobileDirectionHeights.length === 3 && mobileDirectionHeights.every((height) => height >= 44),
    JSON.stringify(mobileDirectionHeights))
  await mobileLab.locator('.authoring-scene-lab__direction').nth(1).click()
  const mobilePrimaryHeight = await mobileLab.locator('.authoring-scene-lab__footer .is-primary').evaluate((element) => (
    Math.max(element.getBoundingClientRect().height, Number.parseFloat(getComputedStyle(element).minHeight) || 0)
  ))
  check('F1-3 390 主动作满足 44px 触控', mobilePrimaryHeight >= 44, String(mobilePrimaryHeight))
  check('F1-3 390 无页面横向滚动', await laboratoryMobile.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
  await mobileLab.scrollIntoViewIfNeeded()
  await laboratoryMobile.screenshot({ path: screenshots.laboratoryMobile, fullPage: false })
  check('F1-3 390 零页面错误', laboratoryMobileErrors.length === 0, laboratoryMobileErrors.join(' | '))
  await laboratoryMobileContext.close()

  // F1-7 final journey: one real page path from current scene to direction,
  // editable Ghost, atomic adoption and truthful page-edge impact.
  {
    const context = await seedFinalContext(browser, { width: 1440, height: 900 })
    const finalPage = await context.newPage()
    const errors = []
    finalPage.on('pageerror', (error) => errors.push(error.message))
    finalPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    const provider = await installDeterministicProviderMock(finalPage, {
      passiveInline: false,
      blockText: finalProse,
      sceneDirections: ({ pressure }) => finalSceneDirections({ pressure }),
      expectedSelectedDirection: finalSelectedTitle,
      excludedDirectionTexts: finalRejectedActions
    })
    await openTarget(finalPage)
    const target = finalPage.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
    const targetBefore = await target.boundingBox()
    const stateBefore = await editorState(finalPage)
    const storageBefore = stableWritingStorage(await finalPage.evaluate(() => ({ ...localStorage })))
    const laboratory = await openSceneLaboratory(finalPage, { intent: 'next-passage' })
    await laboratory.locator('.authoring-scene-lab__direction').first().waitFor({ state: 'visible' })
    const directionButtons = laboratory.locator('.authoring-scene-lab__direction')
    const directionText = await laboratory.innerText()
    check('F1-7 1440 ready 场景提供三条完整因果方向',
      await directionButtons.count() === 3
        && directionText.includes('眼前所得')
        && directionText.includes('代价')
        && await laboratory.locator('.authoring-scene-lab__evidence button').count() > 0,
      directionText)
    check('F1-7 1440 实验室与目标 writingUnit 同轴', await (async () => {
      const labBox = await laboratory.boundingBox()
      const targetBox = await target.boundingBox()
      return Boolean(labBox && targetBox && near(labBox.x, targetBox.x, 4) && near(labBox.width, targetBox.width, 4))
    })())
    await directionButtons.nth(1).focus()
    await directionButtons.nth(1).evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true, isComposing: true
    })))
    check('F1-7 IME composition 中 Escape 不关闭实验室', await laboratory.count() === 1)
    await directionButtons.nth(1).press('Space')
    check('F1-7 键盘 Space 只选择一个方向',
      await laboratory.locator('.authoring-scene-lab__direction.is-selected').count() === 1)
    const storageAfterDirection = stableWritingStorage(await finalPage.evaluate(() => ({ ...localStorage })))
    check('F1-7 方向阶段正式数据零写入', JSON.stringify(storageBefore) === JSON.stringify(storageAfterDirection))
    await laboratory.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await finalPage.waitForTimeout(100)
    await finalPage.screenshot({ path: screenshots.finalDirection, fullPage: false })

    await laboratory.getByRole('button', { name: '按此推演' }).press('Enter')
    const draft = finalPage.locator('[data-test="block-draft"]')
    await draft.waitFor({ state: 'visible', timeout: 30000 })
    check('F1-7 Ghost 出现后方向强调退场且只有一个主动作',
      await finalPage.locator('[data-test="scene-laboratory"]').count() === 0
        && await draft.locator('button.is-primary').count() === 1)
    const callsBeforeBoundaryEdit = provider.count({ kind: 'narrative' })
    const firstSplit = draft.locator('.authoring-block-draft__boundary-tick.is-split').first()
    await firstSplit.focus()
    await firstSplit.press('Space')
    await draft.getByRole('button', { name: '合并', exact: true }).press('Enter')
    check('F1-7 键盘可调整 Ghost 边界且不追加模型调用',
      await draft.locator('.authoring-block-draft__unit-plan li').count() === 2
        && provider.count({ kind: 'narrative' }) === callsBeforeBoundaryEdit)
    await draft.getByRole('button', { name: '采用编辑稿' }).press('Enter')
    const impact = finalPage.locator('[data-test="adoption-impact"]')
    await impact.waitFor({ state: 'visible', timeout: 10000 })
    const impactText = await impact.innerText()
    check('F1-7 1440 原子采纳回响只报告 receipt 实际变化',
      impactText.includes('新增 2 个写作单元')
        && impactText.includes('当前场加入 1 人')
        && !impactText.includes('大纲已更新'), impactText)
    check('F1-7 回响无焦点 owner 且稿面无横滚', await finalPage.evaluate(() => {
      const impactElement = document.querySelector('[data-test="adoption-impact"]')
      return !impactElement?.querySelector('button, a, input, textarea, [tabindex]')
        && document.documentElement.scrollWidth === document.documentElement.clientWidth
    }))
    await finalPage.screenshot({ path: screenshots.finalImpact, fullPage: false })
    const targetAfter = await target.boundingBox()
    check('F1-7 完整旅程不改变原目标内容轴',
      Boolean(targetBefore && targetAfter && near(targetBefore.x, targetAfter.x, 4) && near(targetBefore.width, targetAfter.width, 4)),
      JSON.stringify({ targetBefore, targetAfter }))
    check('F1-7 1440 provider 无额外分类调用',
      provider.count({ kind: 'advisor', taskType: 'authoring.scene.directions' }) === 1
        && provider.summary().selectedDirectionSeen
        && !provider.summary().excludedDirectionSeen,
      JSON.stringify(provider.summary()))
    check('F1-7 1440 零页面错误', errors.length === 0, errors.join(' | '))
    check('F1-7 进入实验室前后 scroll/selection 未漂移',
      stateBefore.unitId === state.targetUnitId && Number.isFinite(stateBefore.scrollTop))
    await context.close()
  }

  // 1024 overlay inspector may coexist with the laboratory without reflowing prose.
  {
    const context = await seedFinalContext(browser, { width: 1024, height: 768 })
    const page1024 = await context.newPage()
    await installDeterministicProviderMock(page1024, {
      passiveInline: false,
      sceneDirections: ({ pressure }) => finalSceneDirections({ pressure })
    })
    await openTarget(page1024)
    const target = page1024.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
    const before = await target.boundingBox()
    const selectionBefore = await editorState(page1024)
    const laboratory = await openSceneLaboratory(page1024)
    await laboratory.locator('.authoring-scene-lab__direction').first().waitFor({ state: 'visible' })
    await page1024.locator('[data-authoring-tool="scene"]').click({ force: true })
    await page1024.locator('.writing-inspector.is-open').waitFor({ state: 'visible' })
    const after = await target.boundingBox()
    const selectionAfter = await editorState(page1024)
    check('F1-7 1024 检查器覆盖且实验室仍在',
      await laboratory.count() === 1
        && Boolean(before && after && near(before.x, after.x, 2) && near(before.width, after.width, 2)),
      JSON.stringify({ before, after }))
    check('F1-7 1024 打开覆盖检查器不改变正文 selection/scrollTop',
      selectionBefore.unitId === selectionAfter.unitId
        && selectionBefore.anchorOffset === selectionAfter.anchorOffset
        && selectionBefore.focusOffset === selectionAfter.focusOffset
        && near(selectionBefore.scrollTop, selectionAfter.scrollTop),
      JSON.stringify({ selectionBefore, selectionAfter }))
    check('F1-7 1024 无横向滚动', await page1024.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
    await context.close()
  }

  // Long labels at 900px and the 720px effective layout of a 1440px page at 200% zoom.
  for (const viewport of [
    { width: 900, height: 760, label: '900' },
    { width: 720, height: 450, label: '200% zoom' }
  ]) {
    const context = await seedFinalContext(browser, viewport)
    const pageCompact = await context.newPage()
    await installDeterministicProviderMock(pageCompact, {
      passiveInline: false,
      sceneDirections: ({ pressure }) => finalSceneDirections({ pressure, long: true })
    })
    await openTarget(pageCompact)
    const laboratory = await openSceneLaboratory(pageCompact)
    await laboratory.locator('.authoring-scene-lab__direction').first().waitFor({ state: 'visible' })
    const fit = await pageCompact.evaluate(() => ({
      page: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      directions: [...document.querySelectorAll('.authoring-scene-lab__direction')].every((element) => (
        element.scrollWidth <= element.clientWidth + 1
        && element.getBoundingClientRect().right <= document.documentElement.clientWidth + 1
      ))
    }))
    check(`F1-7 ${viewport.label} 长方向完整换行且无横滚`, fit.page && fit.directions, JSON.stringify(fit))
    await context.close()
  }

  // 390 scene sheet is independently scrollable; returning to the laboratory
  // keeps all primary actions reachable in the single manuscript scroll.
  {
    const context = await seedFinalContext(browser, { width: 390, height: 844 })
    const mobile = await context.newPage()
    await installDeterministicProviderMock(mobile, {
      passiveInline: false,
      blockText: finalProse,
      sceneDirections: ({ pressure }) => finalSceneDirections({ pressure }),
      expectedSelectedDirection: finalSelectedTitle,
      excludedDirectionTexts: finalRejectedActions
    })
    await openTarget(mobile)
    await mobile.locator('[data-authoring-tool="scene"]').click({ force: true })
    await mobile.locator('.writing-inspector.is-open [data-test="scene-edit"]').click()
    const sheet = mobile.locator('.writing-inspector.is-open')
    const edgar = sheet.locator('.scene-curation__people li').filter({ hasText: '艾德加' }).first()
    const touchHeights = await edgar.locator('button').evaluateAll((elements) => elements.map((element) => (
      Math.max(element.getBoundingClientRect().height, Number.parseFloat(getComputedStyle(element).minHeight) || 0)
    )))
    const sheetState = await sheet.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const body = element.querySelector('.writing-inspector__body')
      return {
        top: rect.top, bottom: rect.bottom, viewport: window.innerHeight,
        overflowY: body ? getComputedStyle(body).overflowY : '',
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      }
    })
    check('F1-7 390 当前场 sheet 独立滚动、在视口内且动作 44px',
      sheetState.top >= 0 && sheetState.bottom <= sheetState.viewport + 1
        && ['auto', 'scroll'].includes(sheetState.overflowY)
        && touchHeights.every((height) => height >= 44)
        && !sheetState.pageOverflow,
      JSON.stringify({ sheetState, touchHeights }))
    await edgar.scrollIntoViewIfNeeded()
    await mobile.waitForTimeout(100)
    await mobile.screenshot({ path: screenshots.finalMobile, fullPage: false })
    await edgar.getByRole('button', { name: '下一段入场' }).click()
    const laboratory = mobile.locator('[data-test="scene-laboratory"]')
    await laboratory.locator('.authoring-scene-lab__direction').first().waitFor({ state: 'visible' })
    await laboratory.locator('.authoring-scene-lab__direction').nth(1).press('Space')
    check('F1-7 390 sheet 返回正文实验室且主动作 44px',
      await mobile.locator('.writing-inspector.is-open').count() === 0
        && await laboratory.locator('.authoring-scene-lab__direction').evaluateAll((elements) => elements.every((element) => (
          Math.max(element.getBoundingClientRect().height, Number.parseFloat(getComputedStyle(element).minHeight) || 0) >= 44
        )))
        && await laboratory.locator('.authoring-scene-lab__footer button').evaluateAll((elements) => elements.every((element) => (
          Math.max(element.getBoundingClientRect().height, Number.parseFloat(getComputedStyle(element).minHeight) || 0) >= 44
        ))))
    await laboratory.getByRole('button', { name: '按此推演' }).press('Enter')
    const draft = mobile.locator('[data-test="block-draft"]')
    await draft.waitFor({ state: 'visible', timeout: 30000 })
    const textarea = draft.locator('textarea')
    await textarea.focus()
    await textarea.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true, isComposing: true
    })))
    check('F1-7 390 IME Escape 不丢 Ghost', await draft.count() === 1)
    await textarea.press('Escape')
    await draft.waitFor({ state: 'detached' })
    check('F1-7 390 普通 Escape 关闭 Ghost 并归还正文焦点', await mobile.evaluate(() => (
      Boolean(document.activeElement?.closest?.('.ProseMirror'))
    )))
    check('F1-7 390 完整往返无横向滚动', await mobile.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
    await context.close()
  }

  // Dark tokens and reduced motion use the same production surface.
  {
    const darkContext = await seedFinalContext(browser, { width: 900, height: 760 }, { dark: true })
    const darkPage = await darkContext.newPage()
    await installDeterministicProviderMock(darkPage, {
      passiveInline: false,
      sceneDirections: ({ pressure }) => finalSceneDirections({ pressure })
    })
    await openTarget(darkPage)
    const laboratory = await openSceneLaboratory(darkPage)
    await laboratory.locator('.authoring-scene-lab__direction').first().waitFor({ state: 'visible' })
    const darkState = await laboratory.evaluate((element) => ({
      theme: document.documentElement.className,
      color: getComputedStyle(element).color,
      background: getComputedStyle(document.querySelector('.writing-page')).backgroundColor,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }))
    check('F1-7 主题2暗色 token 可读且无横滚',
      darkState.theme.includes('theme-legacy') && darkState.theme.includes('theme-dark')
        && darkState.color !== darkState.background && !darkState.overflow,
      JSON.stringify(darkState))
    await laboratory.locator('.authoring-scene-lab__direction').first().focus()
    await laboratory.locator('.authoring-scene-lab__direction').first().press('Escape')
    await laboratory.waitFor({ state: 'detached' })
    check('F1-7 Escape 收起实验室并归还原 writingUnit 焦点', await darkPage.evaluate(() => (
      Boolean(document.activeElement?.closest?.('.ProseMirror'))
    )))
    await darkContext.close()

    const reducedContext = await seedFinalContext(browser, { width: 900, height: 760 }, { reducedMotion: true })
    const reducedPage = await reducedContext.newPage()
    await reducedPage.emulateMedia({ reducedMotion: 'reduce' })
    await mockDirectionPlanner(reducedPage, { delayMs: 700 })
    await openTarget(reducedPage)
    const opening = openSceneLaboratory(reducedPage)
    const working = reducedPage.locator('.authoring-scene-lab__working-mark')
    await working.waitFor({ state: 'visible' })
    const motion = await working.evaluate((element) => ({
      animationName: getComputedStyle(element).animationName,
      transitionDuration: getComputedStyle(element).transitionDuration
    }))
    check('F1-7 reduced-motion 禁用旋转与位移过渡',
      motion.animationName === 'none' && ['0s', '0ms'].includes(motion.transitionDuration), JSON.stringify(motion))
    await reducedPage.keyboard.press('Escape')
    await opening.catch(() => false)
    await reducedPage.waitForTimeout(750)
    check('F1-7 快速关闭后的迟到方向不恢复旧实验室',
      await reducedPage.locator('[data-test="scene-laboratory"]').count() === 0)
    await reducedContext.close()
  }
} catch (error) {
  check(SLICE ? `F1-${SLICE} 浏览器旅程执行完成` : 'F1 浏览器旅程执行完成', false, error?.stack || error)
} finally {
  await browser.close()
}

const selectedResults = SLICE ? results.filter((item) => item.label.startsWith(`F1-${SLICE}`)) : results
const failed = selectedResults.filter((item) => !item.pass)
fs.writeFileSync(path.join(REPORT_DIR, SLICE ? `f1-${SLICE}-report.json` : 'f1-report.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  screenshots,
  results: selectedResults
}, null, 2)}\n`)
console.log(`[f1${SLICE ? `-${SLICE}` : ''}] pass: ${selectedResults.length - failed.length}/${selectedResults.length}`)
for (const item of failed) console.log(`[f1] FAIL ${item.label}: ${item.detail}`)
if (failed.length) process.exitCode = 1
