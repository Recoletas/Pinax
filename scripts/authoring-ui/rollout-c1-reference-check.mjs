// C1-3 Gate：现场详情选择速记/素材 → 同一生产 session 预检 → Ghost → 实际参考。
// 只使用固定 fixture 与浏览器内 provider mock，不写正式项目数据。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { installDeterministicProviderMock, MOCK_BLOCK_INSTRUCTION } from './provider-mock.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-context-closure')
const OUT_DIR = path.resolve('tmp/authoring-rollout/c1-reference')
fs.mkdirSync(OUT_DIR, { recursive: true })
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))

async function seedContext(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
  }, storage)
  return context
}

async function openFixture(page) {
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 30000 })
  await page.waitForTimeout(1200)
  const target = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
  await target.locator('p').first().click({ position: { x: 90, y: 12 } })
  return target
}

function check(results, label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 500) })
}

const browser = await chromium.launch()
const results = []

// Desktop: fixed scene detail owns selection; composer owns exact preflight.
const desktopContext = await seedContext(browser, { width: 1440, height: 900 })
const page = await desktopContext.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`) })
const provider = await installDeterministicProviderMock(page, {
  passiveInline: false,
  expectedComposerInstruction: MOCK_BLOCK_INSTRUCTION
})
await openFixture(page)
await page.locator('.wall__shelf-scene [data-test="scene-edit"]').click()
const scenePicker = page.locator('.writing-inspector.is-open [data-test="context-picker"]')
await scenePicker.waitFor({ state: 'visible' })
await scenePicker.evaluate((details) => { details.open = true })
check(results, '现场详情提供本次参考', await scenePicker.count() === 1)
const scenePickerText = await scenePicker.innerText()
check(results, '候选按速记与素材分组', ['速记', '素材'].every((label) => scenePickerText.includes(label)), scenePickerText)
const addButtons = scenePicker.locator('[data-test="context-reference-add"]')
check(results, '固定 fixture 提供两类来源', await addButtons.count() === 2, await scenePicker.innerText())
await addButtons.nth(0).click()
await addButtons.nth(1).click()
check(results, '可同时选择两条且上限可见', (await scenePicker.innerText()).includes('2/3'), await scenePicker.innerText())
await page.screenshot({ path: path.join(OUT_DIR, 'c1-3-scene-picker-1440.png') })

await page.getByRole('button', { name: '← 取消并返回' }).click()
await page.getByRole('button', { name: /推演下一段/ }).click()
const composer = page.locator('[data-test="block-composer"]')
await composer.waitFor({ state: 'visible' })
await composer.locator('.authoring-block-composer__instruction textarea').fill(MOCK_BLOCK_INSTRUCTION)
const plannedSummary = composer.locator('[data-test="context-summary"][data-context-mode="planned"]')
await plannedSummary.waitFor({ state: 'visible' })
await page.waitForFunction(() => {
  const summary = document.querySelector('[data-test="context-summary"][data-context-mode="planned"]')
  const text = summary?.textContent || ''
  return text.includes('正文 2') && text.includes('自选 2')
})
const plannedText = await plannedSummary.innerText()
check(results, '生成前预检来自冻结 manifest', ['正文 2', '现场 1', '设定 2', '自选 2'].every((label) => plannedText.includes(label)), plannedText)
check(results, '作者视图不暴露内部 profile/token/candidateId', !/narrative-long|token|candidateId/i.test(plannedText), plannedText)
await page.screenshot({ path: path.join(OUT_DIR, 'c1-3-preflight-1440.png') })

await composer.locator('[data-test="block-primary"]').click()
const draft = page.locator('[data-test="block-draft"]')
try {
  await draft.waitFor({ state: 'visible', timeout: 20000 })
} catch (error) {
  throw new Error(`C1 reference Ghost did not appear: ${await composer.innerText()} | ${JSON.stringify(provider.summary())} | ${errors.join(' | ')}`, { cause: error })
}
await page.locator('[data-authoring-tool="ai"]').click()
const actualSummary = page.locator('.writing-inspector.is-open [data-test="context-summary"][data-context-mode="actual"]')
await actualSummary.waitFor({ state: 'visible' })
await actualSummary.locator('summary').click()
const actualText = await actualSummary.innerText()
check(results, '生成后显示实际参考', actualText.includes('实际参考') && actualText.includes('作者参考 2'), actualText)
check(results, '实际参考保留作者来源名称', actualText.includes('第七响之后') && actualText.includes('潮水退账的意象'), actualText)
check(results, '只发生一次长推演模型链', provider.summary().narrativeCount >= 2, JSON.stringify(provider.summary()))
check(results, '桌面无横向滚动', await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
await page.screenshot({ path: path.join(OUT_DIR, 'c1-3-ghost-actual-1440.png') })
await desktopContext.close()

// Mobile: the existing right inspector becomes a scrollable sheet; picker remains operable.
const mobileContext = await seedContext(browser, { width: 390, height: 844 })
const mobile = await mobileContext.newPage()
const mobileErrors = []
mobile.on('pageerror', (error) => mobileErrors.push(`pageerror:${error.message}`))
mobile.on('console', (message) => { if (message.type() === 'error') mobileErrors.push(`console:${message.text()}`) })
await openFixture(mobile)
await mobile.locator('[data-authoring-tool="scene"]').click({ force: true })
const mobileInspector = mobile.locator('.writing-inspector.is-open')
await mobileInspector.locator('[data-test="scene-edit"]').click()
const mobilePicker = mobileInspector.locator('[data-test="context-picker"]')
await mobilePicker.waitFor()
await mobilePicker.scrollIntoViewIfNeeded()
await mobilePicker.evaluate((details) => { details.open = true })
await mobile.waitForTimeout(200)
const mobileBox = await mobilePicker.boundingBox()
check(results, '390 sheet 可滚动到完整选择器', Boolean(mobileBox && mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390), JSON.stringify(mobileBox))
check(results, '390 无横向滚动', await mobile.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
await mobile.screenshot({ path: path.join(OUT_DIR, 'c1-3-picker-390.png') })
await mobileContext.close()

// Desktop rewrite: same frozen session and Ghost, but adoption replaces the target unit in place.
const rewriteContext = await seedContext(browser, { width: 1440, height: 900 })
const rewritePage = await rewriteContext.newPage()
const rewriteErrors = []
rewritePage.on('pageerror', (error) => rewriteErrors.push(`pageerror:${error.message}`))
rewritePage.on('console', (message) => { if (message.type() === 'error') rewriteErrors.push(`console:${message.text()}`) })
const rewriteProvider = await installDeterministicProviderMock(rewritePage, {
  passiveInline: false,
  expectedComposerInstruction: MOCK_BLOCK_INSTRUCTION
})
const rewriteTarget = await openFixture(rewritePage)
const originalUnitText = await rewriteTarget.innerText()
const originalUnitCount = await rewritePage.locator('[data-writing-unit]').count()
await rewritePage.getByRole('button', { name: /推演下一段/ }).click()
const rewriteComposer = rewritePage.locator('[data-test="block-composer"]')
await rewriteComposer.getByRole('radio', { name: '重写当前块' }).click()
await rewriteComposer.locator('.authoring-block-composer__instruction textarea').fill(MOCK_BLOCK_INSTRUCTION)
await rewriteComposer.locator('[data-test="context-summary"] summary').click()
await rewritePage.waitForFunction(() => {
  const summary = document.querySelector('[data-test="context-summary"][data-context-mode="planned"]')
  return (summary?.textContent || '').includes('待重写文本块')
})
await rewriteComposer.locator('[data-test="block-primary"]').click()
const rewriteDraft = rewritePage.locator('[data-test="block-draft"]')
await rewriteDraft.waitFor({ state: 'visible', timeout: 20000 })
check(results, '重写结果仍是可编辑 Ghost', (await rewriteDraft.innerText()).includes('重写草稿'), await rewriteDraft.innerText())
const editedRewrite = '雨声压住了门轴的轻响。守卫握紧铜钥匙，在灯室门前停住。'
await rewriteDraft.locator('textarea').fill(editedRewrite)
await rewritePage.screenshot({ path: path.join(OUT_DIR, 'c1-5-rewrite-ghost-1440.png') })
await rewriteDraft.getByRole('button', { name: '替换当前块' }).click()
await rewriteDraft.waitFor({ state: 'detached', timeout: 10000 })
const rewrittenTarget = rewritePage.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
const rewrittenTargetCount = await rewrittenTarget.count()
const rewrittenUnitIds = await rewritePage.locator('[data-writing-unit]').evaluateAll((units) => units.map((unit) => unit.getAttribute('data-unit-id')))
check(results, '采纳重写保留 unitId 与单元数量',
  rewrittenTargetCount === 1 && await rewritePage.locator('[data-writing-unit]').count() === originalUnitCount,
  JSON.stringify(rewrittenUnitIds))
const rewrittenText = rewrittenTargetCount ? await rewrittenTarget.innerText() : ''
check(results, '采纳只写入作者编辑后的版本', rewrittenText.includes(editedRewrite), JSON.stringify({ rewrittenText, rewrittenUnitIds }))
check(results, '重写只发生一次长推演模型链', rewriteProvider.summary().narrativeCount >= 2, JSON.stringify(rewriteProvider.summary()))
await rewritePage.locator('.authoring-transient-notice__undo').click()
try {
  await rewritePage.waitForFunction(({ unitId, original }) => {
    const unit = document.querySelector(`[data-writing-unit][data-unit-id="${unitId}"]`)
    return (unit?.textContent || '').includes(original.trim().slice(0, 12))
  }, { unitId: state.targetUnitId, original: originalUnitText }, { timeout: 10000 })
} catch (error) {
  throw new Error(`rewrite undo failed: ${await rewrittenTarget.innerText()} | ${await rewritePage.locator('.authoring-transient-notice').innerText().catch(() => '')}`, { cause: error })
}
check(results, '撤销恢复原文本块且不删除 unit',
  await rewrittenTarget.count() === 1 && (await rewrittenTarget.innerText()).includes(originalUnitText.trim().slice(0, 12)))
check(results, '重写旅程无页面错误', rewriteErrors.length === 0, rewriteErrors.join(' | '))
await rewriteContext.close()

const mobileRewriteContext = await seedContext(browser, { width: 390, height: 844 })
const mobileRewrite = await mobileRewriteContext.newPage()
const mobileRewriteErrors = []
mobileRewrite.on('pageerror', (error) => mobileRewriteErrors.push(`pageerror:${error.message}`))
mobileRewrite.on('console', (message) => { if (message.type() === 'error') mobileRewriteErrors.push(`console:${message.text()}`) })
await openFixture(mobileRewrite)
await mobileRewrite.getByRole('button', { name: /推演下一段/ }).click()
const mobileRewriteComposer = mobileRewrite.locator('[data-test="block-composer"]')
await mobileRewriteComposer.getByRole('radio', { name: '重写当前块' }).click()
const mobileRewriteBox = await mobileRewriteComposer.boundingBox()
check(results, '390 重写任务保持在正文宽度内', Boolean(mobileRewriteBox
  && mobileRewriteBox.x >= 0 && mobileRewriteBox.x + mobileRewriteBox.width <= 390), JSON.stringify(mobileRewriteBox))
check(results, '390 重写任务无横向滚动', await mobileRewrite.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
check(results, '390 重写任务无页面错误', mobileRewriteErrors.length === 0, mobileRewriteErrors.join(' | '))
await mobileRewrite.screenshot({ path: path.join(OUT_DIR, 'c1-5-rewrite-composer-390.png') })
await mobileRewriteContext.close()

check(results, '桌面无页面错误', errors.length === 0, errors.join(' | '))
check(results, '移动端无页面错误', mobileErrors.length === 0, mobileErrors.join(' | '))
await browser.close()

const report = { generatedAt: new Date().toISOString(), results }
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
const failed = results.filter((item) => !item.pass)
console.log(`[c1-reference] pass: ${results.length - failed.length}/${results.length}`)
for (const item of failed) console.log(`[c1-reference] FAIL ${item.label}: ${item.detail}`)
if (failed.length) process.exitCode = 1
