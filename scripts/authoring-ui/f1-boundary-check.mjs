/* eslint-disable no-console */
// F1-4 real-page Gate: deterministic Ghost prose, derived scene/beat boundaries,
// author correction, responsive edge controls, and zero formal writes.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { installDeterministicProviderMock, MOCK_BLOCK_INSTRUCTION } from './provider-mock.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-context-closure')
const OUT_DIR = path.resolve('/tmp/pinax-authoring-f1')
const REPORT_DIR = path.resolve('tmp/authoring-rollout/f1')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const sample = [
  '雾从码头一直漫到旧港的石阶。',
  '莉娜把潮湿的总册夹在外套里。',
  '“钟声比约定早了一刻。”艾德加说。',
  '“所以有人已经进去过。”',
  '他们没有再说话，只沿着税务所外墙前行。',
  '次日清晨，钟楼广场只剩下烧焦的绳索。',
  '守卫认出那是昨夜封门用的绳结。',
  '莉娜意识到失窃者一直留在城内。'
].join('\n\n')
const results = []
const screenshots = {
  desktop: path.join(OUT_DIR, 'f1-4-ghost-boundaries-1440.png'),
  mobile: path.join(OUT_DIR, 'f1-4-ghost-boundaries-390.png')
}
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(REPORT_DIR, { recursive: true })

function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 800) })
}

function formalStorage(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => (
    key === 'writing_books'
    || key.startsWith('worldbook_')
    || key.includes('memory')
    || key.includes('outline')
  )))
}

async function seedContext(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
  }, storage)
  return context
}

async function openGhost(page) {
  await installDeterministicProviderMock(page, {
    passiveInline: false,
    blockText: sample,
    expectedComposerInstruction: MOCK_BLOCK_INSTRUCTION
  })
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 30000 })
  const before = formalStorage(await page.evaluate(() => ({ ...localStorage })))
  const target = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
  await target.locator('p').first().click({ position: { x: 70, y: 10 } })
  await page.waitForTimeout(250)
  await page.evaluate(() => document.querySelector('.writing-unit-gap__action')?.click())
  const composer = page.locator('[data-test="block-composer"]')
  await composer.waitFor({ state: 'visible' })
  await composer.locator('.authoring-block-composer__instruction textarea').fill(MOCK_BLOCK_INSTRUCTION)
  await composer.locator('[data-test="block-primary"]').click()
  const draft = page.locator('[data-test="block-draft"]')
  await draft.waitFor({ state: 'visible', timeout: 25000 })
  await draft.locator('.authoring-block-draft__boundary-tick').first().waitFor({ state: 'visible' })
  return { draft, before }
}

const browser = await chromium.launch()
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await seedContext(browser, viewport)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    const { draft, before } = await openGhost(page)
    const ticks = draft.locator('.authoring-block-draft__boundary-tick')
    const ghostParagraphCount = (await draft.locator('textarea').inputValue()).trim().split(/\n\s*\n/).length
    check(`F1-4 ${viewport.width} 每个真实 Ghost 自然段间只有一个边界刻度`,
      await ticks.count() === ghostParagraphCount - 1,
      JSON.stringify({ ticks: await ticks.count(), ghostParagraphCount }))
    check(`F1-4 ${viewport.width} 多人对白未逐段切碎且明确转场切开`,
      await draft.locator('.authoring-block-draft__boundary-tick.is-split').count() === 1
        && (await draft.innerText()).includes('调整结构（2 个写作单元）'),
      await draft.innerText())
    check(`F1-4 ${viewport.width} 派生轴不泄漏到作者界面`,
      !/(environment|dialogue|changes|projectionFingerprint)/.test(await draft.innerText()), await draft.innerText())

    const firstContinuous = draft.locator('.authoring-block-draft__boundary-tick:not(.is-split)').first()
    await firstContinuous.click()
    const caret = await draft.locator('textarea').evaluate((element) => element.selectionStart)
    check(`F1-4 ${viewport.width} 选择刻度会定位对应草稿位置`, caret > 0, String(caret))
    const actions = draft.locator('.authoring-block-draft__boundary-action')
    check(`F1-4 ${viewport.width} 结构操作默认折叠`, !await actions.isVisible())
    await draft.locator('.authoring-block-draft__structure > summary').first().click()
    check(`F1-4 ${viewport.width} 选中边界并展开结构后显示拆分/合并`,
      await actions.isVisible()
        && (await actions.innerText()).includes('拆分')
        && (await actions.innerText()).includes('合并'))
    await actions.getByRole('button', { name: '拆分', exact: true }).click()
    check(`F1-4 ${viewport.width} 作者修正优先并立即更新预览`,
      await draft.locator('.authoring-block-draft__boundary-tick.is-split').count() === 2
        && (await draft.innerText()).includes('调整结构（3 个写作单元）'))

    const after = formalStorage(await page.evaluate(() => ({ ...localStorage })))
    check(`F1-4 ${viewport.width} 边界调整正式数据零写入`, JSON.stringify(before) === JSON.stringify(after))
    check(`F1-4 ${viewport.width} 无横向滚动`, await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
    if (viewport.width === 390) {
      const heights = await actions.locator('button').evaluateAll((buttons) => buttons.map((button) => (
        Math.max(button.getBoundingClientRect().height, Number.parseFloat(getComputedStyle(button).minHeight) || 0)
      )))
      check('F1-4 390 拆分/合并满足 44px 触控', heights.every((height) => height >= 44), JSON.stringify(heights))
    }
    check(`F1-4 ${viewport.width} 零页面错误`, errors.length === 0, errors.join(' | '))
    await draft.scrollIntoViewIfNeeded()
    await page.screenshot({ path: viewport.width === 1440 ? screenshots.desktop : screenshots.mobile, fullPage: false })
    await context.close()
  }
} catch (error) {
  check('F1-4 浏览器旅程执行完成', false, error?.stack || error)
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.pass)
fs.writeFileSync(path.join(REPORT_DIR, 'f1-4-report.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(), screenshots, results
}, null, 2)}\n`)
console.log(`[f1-4] pass: ${results.length - failed.length}/${results.length}`)
for (const item of failed) console.log(`[f1-4] FAIL ${item.label}: ${item.detail}`)
if (failed.length) process.exitCode = 1
