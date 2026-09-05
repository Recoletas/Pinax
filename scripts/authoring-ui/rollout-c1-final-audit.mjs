/* eslint-disable no-console */
// C1-7 最终真实页面 Gate：只产出三张批准证据，并把固定侧栏、落笔位置、
// 内容轴与响应式边界变成几何断言。数据来自隔离 fixture，不触碰用户浏览器。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { installDeterministicProviderMock, MOCK_BLOCK_INSTRUCTION } from './provider-mock.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-context-closure')
const EVIDENCE_DIR = path.resolve('docs/engineering/authoring-c1-assets')
const REPORT_DIR = path.resolve('tmp/authoring-rollout/c1-final')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
fs.mkdirSync(REPORT_DIR, { recursive: true })

const evidence = Object.freeze({
  scene: path.join(EVIDENCE_DIR, 'c1-scene-reference-1440.png'),
  ghost: path.join(EVIDENCE_DIR, 'c1-ghost-context-1440.png'),
  mobile: path.join(EVIDENCE_DIR, 'c1-scene-sheet-390.png'),
})
const results = []
const metrics = {}

function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 800) })
}

function near(a, b, tolerance = 1.5) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance
}

async function seedContext(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
  }, storage)
  return context
}

function collectErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`)
  })
  return errors
}

async function openFixture(page) {
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 30000 })
  await page.waitForTimeout(900)
  const target = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
  await target.locator('p').first().click({ position: { x: 90, y: 12 } })
  return target
}

async function editorState(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('.wall__dossier-scroll')
    const selection = document.getSelection()
    const anchorElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement
    const focusElement = selection?.focusNode?.nodeType === Node.ELEMENT_NODE
      ? selection.focusNode
      : selection?.focusNode?.parentElement
    const anchorUnit = anchorElement?.closest?.('[data-writing-unit]')
    const focusUnit = focusElement?.closest?.('[data-writing-unit]')
    const paragraphIndex = (element, unit) => unit && element
      ? [...unit.querySelectorAll('p')].findIndex((paragraph) => paragraph.contains(element))
      : -1
    return {
      scrollTop: Number(scroll?.scrollTop || 0),
      anchorUnitId: anchorUnit?.getAttribute('data-unit-id') || '',
      anchorParagraph: paragraphIndex(anchorElement, anchorUnit),
      anchorOffset: Number(selection?.anchorOffset || 0),
      focusUnitId: focusUnit?.getAttribute('data-unit-id') || '',
      focusParagraph: paragraphIndex(focusElement, focusUnit),
      focusOffset: Number(selection?.focusOffset || 0),
    }
  })
}

function sameSelection(before, after) {
  return before.anchorUnitId
    && before.anchorUnitId === after.anchorUnitId
    && before.anchorParagraph === after.anchorParagraph
    && before.anchorOffset === after.anchorOffset
    && before.focusUnitId === after.focusUnitId
    && before.focusParagraph === after.focusParagraph
    && before.focusOffset === after.focusOffset
}

async function railGeometry(page) {
  return page.evaluate(() => Object.fromEntries([
    ['shelf', document.querySelector('.wall__shelf')],
    ['tools', document.querySelector('.writing-tool-rail')],
    ['inspector', document.querySelector('.writing-inspector')],
  ].map(([key, element]) => {
    const box = element?.getBoundingClientRect()
    return [key, box ? { top: box.top, left: box.left, right: box.right, bottom: box.bottom } : null]
  })))
}

async function assertNoHorizontalOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    root: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    body: [document.body.scrollWidth, document.body.clientWidth],
  }))
  check(label, geometry.root[0] === geometry.root[1] && geometry.body[0] <= geometry.body[1], JSON.stringify(geometry))
}

const browser = await chromium.launch()

try {
  // 1440：当前场的三种语义 + 世界书人物/地点 + 本次参考。
  const desktopContext = await seedContext(browser, { width: 1440, height: 900 })
  const page = await desktopContext.newPage()
  const desktopErrors = collectErrors(page)
  const provider = await installDeterministicProviderMock(page, {
    passiveInline: false,
    expectedComposerInstruction: MOCK_BLOCK_INSTRUCTION,
  })
  const target = await openFixture(page)
  const stateBeforeInspector = await editorState(page)
  await page.locator('.wall__shelf-scene [data-test="scene-edit"]').click()
  const inspector = page.locator('.writing-inspector.is-open')
  const curation = inspector.locator('.scene-curation')
  const picker = inspector.locator('[data-test="context-picker"]')
  await curation.waitFor({ state: 'visible' })
  await picker.waitFor({ state: 'visible' })
  await picker.evaluate((details) => { details.open = true })
  const stateAfterInspector = await editorState(page)
  check('1440 打开当前场不改变正文 scrollTop', near(stateBeforeInspector.scrollTop, stateAfterInspector.scrollTop), JSON.stringify({ stateBeforeInspector, stateAfterInspector }))
  check('1440 打开当前场保留落笔 selection', sameSelection(stateBeforeInspector, stateAfterInspector), JSON.stringify({ stateBeforeInspector, stateAfterInspector }))

  const curationText = await curation.innerText()
  const edgarRow = curation.locator('.scene-curation__people li').filter({ hasText: '艾德加' }).first()
  await edgarRow.locator('.scene-curation__person-toggle').click()
  const edgarActions = await edgarRow.innerText()
  check('当前场先选择对象再呈现三种明确动作',
    ['加入当前场', '让他下一段入场', '仅带入本次推演'].every((text) => edgarActions.includes(text)), edgarActions)
  check('中央目标块同步显示当前场草稿', await page.locator('[data-test="scene-curation-preview"]').count() === 1)
  check('世界书人物和地点在同一现场详情中可见',
    curationText.includes('旧港税务所') && curationText.includes('莉娜') && curationText.includes('艾德加'), curationText)
  const addButtons = picker.locator('[data-test="context-reference-add"]')
  await addButtons.nth(0).click()
  await addButtons.nth(1).click()
  check('本次参考最多三条且当前选择两条', (await picker.innerText()).includes('2/3'), await picker.innerText())

  const railsBeforeScroll = await railGeometry(page)
  await page.evaluate(() => {
    const scroll = document.querySelector('.wall__dossier-scroll')
    if (scroll) scroll.scrollTop = Math.min(scroll.scrollHeight - scroll.clientHeight, scroll.scrollTop + 180)
  })
  await page.waitForTimeout(100)
  const railsAfterScroll = await railGeometry(page)
  metrics.desktopRails = { before: railsBeforeScroll, after: railsAfterScroll }
  check('左右工具区域不随正文滚动',
    ['shelf', 'tools', 'inspector'].every((key) => near(railsBeforeScroll[key]?.top, railsAfterScroll[key]?.top)),
    JSON.stringify(metrics.desktopRails))
  await assertNoHorizontalOverflow(page, '1440 当前场无横向滚动')
  await page.screenshot({ path: evidence.scene, fullPage: false })

  // 回到正文后用同一已选参考生成 Ghost；右侧展示实际参考。
  await page.getByRole('button', { name: '← 取消并返回' }).click()
  await page.getByRole('button', { name: /推演下一段/ }).click()
  const composer = page.locator('[data-test="block-composer"]')
  await composer.waitFor({ state: 'visible' })
  await composer.locator('.authoring-block-composer__instruction textarea').fill(MOCK_BLOCK_INSTRUCTION)
  await page.waitForFunction(() => (
    document.querySelector('[data-test="context-summary"][data-context-mode="planned"]')?.textContent || ''
  ).includes('自选 2'))
  await composer.locator('[data-test="block-primary"]').click()
  const draft = page.locator('[data-test="block-draft"]')
  await draft.waitFor({ state: 'visible', timeout: 25000 })
  await draft.locator('textarea').fill('守卫先拾起铜钥匙，再沿潮湿石阶进入灯室；门内无人，艾德加的咳嗽声却从身后传来。')
  const targetBox = await target.boundingBox()
  const draftBox = await draft.boundingBox()
  metrics.contentAxis = { target: targetBox, draft: draftBox }
  check('Ghost 与目标 writingUnit 使用同一内容轴和宽度',
    Boolean(targetBox && draftBox && near(targetBox.x, draftBox.x, 2) && near(targetBox.width, draftBox.width, 2)),
    JSON.stringify(metrics.contentAxis))
  await page.locator('[data-authoring-tool="ai"]').click()
  const actualSummary = page.locator('.writing-inspector.is-open [data-test="context-summary"][data-context-mode="actual"]')
  await actualSummary.waitFor({ state: 'visible' })
  await actualSummary.locator('summary').click()
  await draft.scrollIntoViewIfNeeded()
  const editedDraftText = await draft.locator('textarea').inputValue()
  const canonicalText = (await page.locator('[data-writing-unit]').allInnerTexts()).join('\n')
  check('Ghost 可编辑且仍为非正文状态',
    await draft.locator('textarea').isEditable()
    && (await draft.innerText()).includes('已修改')
    && !canonicalText.includes(editedDraftText),
  JSON.stringify({ editable: await draft.locator('textarea').isEditable(), state: await draft.innerText(), canonicalContainsDraft: canonicalText.includes(editedDraftText) }))
  check('生成后实际参考可追溯到两条作者来源',
    (await actualSummary.innerText()).includes('第七响之后') && (await actualSummary.innerText()).includes('潮水退账的意象'))
  check('长推演只发生一条 plan/prose 链',
    provider.count({ phase: 'plan' }) === 1 && provider.count({ phase: 'prose' }) === 1,
    JSON.stringify(provider.summary()))
  await assertNoHorizontalOverflow(page, '1440 Ghost 无横向滚动')
  await page.screenshot({ path: evidence.ghost, fullPage: false })
  check('1440 旅程零页面与 console error', desktopErrors.length === 0, desktopErrors.join(' | '))
  await desktopContext.close()

  // 1024：检查器必须降为覆盖层，不压窄正文或制造横向滚动；不额外留截图。
  const tabletContext = await seedContext(browser, { width: 1024, height: 768 })
  const tablet = await tabletContext.newPage()
  const tabletErrors = collectErrors(tablet)
  await openFixture(tablet)
  const manuscriptBefore = await tablet.locator('.wall__dossier').boundingBox()
  await tablet.locator('[data-authoring-tool="scene"]').click()
  const tabletInspector = tablet.locator('.writing-inspector.is-open')
  await tabletInspector.waitFor({ state: 'visible' })
  const manuscriptAfter = await tablet.locator('.wall__dossier').boundingBox()
  const tabletInspectorBox = await tabletInspector.boundingBox()
  metrics.tablet = { manuscriptBefore, manuscriptAfter, inspector: tabletInspectorBox }
  check('1024 检查器作为覆盖层且不压窄正文',
    Boolean(manuscriptBefore && manuscriptAfter && near(manuscriptBefore.width, manuscriptAfter.width, 1)), JSON.stringify(metrics.tablet))
  check('1024 检查器完整位于视口内',
    Boolean(tabletInspectorBox && tabletInspectorBox.x >= 0 && tabletInspectorBox.x + tabletInspectorBox.width <= 1024), JSON.stringify(tabletInspectorBox))
  await assertNoHorizontalOverflow(tablet, '1024 无横向滚动')
  check('1024 旅程零页面与 console error', tabletErrors.length === 0, tabletErrors.join(' | '))
  await tabletContext.close()

  // 390：右栏转为底部 sheet，独立滚动，不改正文位置/selection。
  const mobileContext = await seedContext(browser, { width: 390, height: 844 })
  const mobile = await mobileContext.newPage()
  const mobileErrors = collectErrors(mobile)
  await openFixture(mobile)
  const mobileBefore = await editorState(mobile)
  await mobile.locator('[data-authoring-tool="scene"]').click({ force: true })
  const mobileInspector = mobile.locator('.writing-inspector.is-open')
  await mobileInspector.locator('[data-test="scene-edit"]').click()
  const mobilePicker = mobileInspector.locator('[data-test="context-picker"]')
  await mobilePicker.waitFor({ state: 'visible' })
  await mobilePicker.scrollIntoViewIfNeeded()
  await mobilePicker.evaluate((details) => { details.open = true })
  const sheetBox = await mobileInspector.boundingBox()
  const pickerBox = await mobilePicker.boundingBox()
  const touchTarget = await mobileInspector.locator('[data-test="context-reference-add"]').first().evaluate((element) => ({
    logicalMinHeight: Number.parseFloat(getComputedStyle(element).minHeight),
    renderedHeight: element.getBoundingClientRect().height,
  }))
  metrics.mobile = { sheetBox, pickerBox, touchTarget }
  check('390 详情降为视口内完整 sheet',
    Boolean(sheetBox && sheetBox.x >= 0 && sheetBox.x + sheetBox.width <= 390 && sheetBox.y >= 0 && sheetBox.y + sheetBox.height <= 844), JSON.stringify(sheetBox))
  check('390 本次参考可在 sheet 内滚动到达',
    Boolean(pickerBox && pickerBox.x >= sheetBox.x && pickerBox.x + pickerBox.width <= sheetBox.x + sheetBox.width), JSON.stringify(pickerBox))
  check('390 参考动作满足 44px 逻辑触控高度', touchTarget.logicalMinHeight >= 44, JSON.stringify(touchTarget))
  await assertNoHorizontalOverflow(mobile, '390 无横向滚动')
  await mobile.screenshot({ path: evidence.mobile, fullPage: false })
  await mobileInspector.locator('.writing-inspector__icon-btn[title="关闭检查器"]').click()
  await mobile.waitForTimeout(100)
  const mobileAfter = await editorState(mobile)
  check('390 关闭 sheet 恢复正文 scrollTop', near(mobileBefore.scrollTop, mobileAfter.scrollTop), JSON.stringify({ mobileBefore, mobileAfter }))
  check('390 关闭 sheet 保留落笔 selection', sameSelection(mobileBefore, mobileAfter), JSON.stringify({ mobileBefore, mobileAfter }))
  check('390 旅程零页面与 console error', mobileErrors.length === 0, mobileErrors.join(' | '))
  await mobileContext.close()
} catch (error) {
  check('C1-7 最终旅程执行完成', false, error?.stack || error)
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.pass)
const report = {
  generatedAt: new Date().toISOString(),
  viewportEvidence: Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, path.relative(process.cwd(), value)])),
  metrics,
  results,
}
fs.writeFileSync(path.join(REPORT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`[c1-final] pass: ${results.length - failed.length}/${results.length}`)
for (const item of failed) console.log(`[c1-final] FAIL ${item.label}: ${item.detail}`)
if (failed.length) process.exitCode = 1
