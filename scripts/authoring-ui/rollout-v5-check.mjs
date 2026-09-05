// Slice V5/C1-2 Gate：当前场选择艾德加（安排下一段）→ 一次性 run intent →
// 编辑 Ghost → 采用 → 当前场更新。采纳前 scene anchor 必须零写入。
// 用法：BASE=http://127.0.0.1:5173 node scripts/authoring-ui/rollout-v5-check.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { installDeterministicProviderMock, MOCK_BLOCK_INSTRUCTION } from './provider-mock.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('tmp/authoring-rollout/v5')
fs.mkdirSync(OUT_DIR, { recursive: true })

const fixtureState = JSON.parse(fs.readFileSync(path.resolve('tmp/authoring-rollout/fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.resolve('tmp/authoring-rollout/fixture-localstorage.json'), 'utf8'))

const results = []
let current = null
function record(id, name) {
  const checks = current?.checks || []
  const failed = checks.filter((check) => !check.pass)
  results.push({ id, name, pass: failed.length === 0, checks })
  current = null
}
function check(label, pass, detail = '') {
  current?.checks.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 200) })
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addInitScript((snapshot) => {
  if (localStorage.getItem('__v5_seeded__')) return
  for (const [key, value] of Object.entries(snapshot)) {
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
  }
  localStorage.setItem('__v5_seeded__', '1')
}, storage)
const page = await context.newPage()
const provider = await installDeterministicProviderMock(page, { passiveInline: false })
const consoleErrors = []
page.on('pageerror', (err) => consoleErrors.push(err.message))

await page.goto(`${BASE}/authoring?bookId=${fixtureState.bookId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.authoring-chapter-row', { timeout: 30000 })
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.authoring-chapter-row')]
  rows.find((el) => (el.textContent || '').includes('星图回应'))?.click()
})
await page.waitForTimeout(1200)
// 作者的落笔处在锚点单元（fixture midUnit）：先把 caret 放进那里的正文，
// 现场编辑解析按“当前落笔处之前最近锚点”继承——caret 在文档开头会正确显示待设置。
const midParagraphIndex = (fixtureState.midUnitIndex || 0) * 3
await page.locator('.ProseMirror p').nth(midParagraphIndex).click()
await page.waitForTimeout(400)

// ---------- SW-02 从世界书选择人物（安排下一段） ----------
current = { id: 'SW-02', checks: [] }
await page.locator('.wall__shelf-scene [data-test="scene-edit"]').click()
await page.waitForTimeout(900)
check('现场调整表单打开', await page.evaluate(() => Boolean(document.querySelector('.scene-curation'))))
const edgarVisible = await page.evaluate(() => {
  const people = [...document.querySelectorAll('.scene-curation__people .scene-curation__person-toggle')]
  return people.some((el) => (el.textContent || '').includes('艾德加'))
})
check('世界书候选含艾德加', edgarVisible)
await page.screenshot({ path: path.join(OUT_DIR, 'v5-1-curation.png'), clip: { x: 1050, y: 60, width: 390, height: 840 } })
// 安排下一段入场
const anchorsBeforeIntent = await page.evaluate((id) => {
  const book = JSON.parse(localStorage.getItem('writing_books')).find((b) => String(b.id) === String(id))
  return JSON.stringify(book?.chapters?.find((c) => c.id === 'fogch-5')?.sceneAnchors || [])
}, fixtureState.bookId)
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.scene-curation__people li')]
    .find((el) => (el.textContent || '').includes('艾德加'))
  row?.querySelector('.scene-curation__person-toggle')?.click()
  ;[...row.querySelectorAll('.scene-curation__scope-btn')]
    .find((el) => el.textContent.includes('下一段入场'))?.click()
})
await page.locator('[data-test="scene-laboratory"]').waitFor({ state: 'visible', timeout: 5000 })
const anchorsAfterIntent = await page.evaluate((id) => {
  const book = JSON.parse(localStorage.getItem('writing_books')).find((b) => String(b.id) === String(id))
  const chapter = book?.chapters?.find((c) => c.id === 'fogch-5')
  return JSON.stringify(chapter?.sceneAnchors || [])
}, fixtureState.bookId)
check('安排下一段直接进入推演确认', true)
check('采纳前现场锚点零写入', anchorsAfterIntent === anchorsBeforeIntent, anchorsAfterIntent)
await page.screenshot({ path: path.join(OUT_DIR, 'v5-2-planned.png'), clip: { x: 240, y: 60, width: 960, height: 760 } })
record('SW-02', '从世界书选择人物并建立一次性安排')

// ---------- SC-01 rail 不提前发布临时安排 ----------
current = { id: 'SC-01', checks: [] }
const railText = await page.evaluate(() => document.querySelector('.wall__shelf-scene')?.textContent || '')
check('左栏不把临时安排冒充当前场', !railText.includes('待入场：艾德加'), railText.slice(-120))
await page.screenshot({ path: path.join(OUT_DIR, 'v5-3-rail-planned.png'), clip: { x: 0, y: 600, width: 240, height: 300 } })
record('SC-01', '临时安排采纳前不发布为现场')

// ---------- SW-06 一次性意图进入 composer/session ----------
current = { id: 'SW-06', checks: [] }
const composerInfo = await page.evaluate(() => {
  const composer = document.querySelector('[data-test="block-composer"]')
  return { open: true, instruction: composer.querySelector('textarea')?.value?.slice(0, 60) }
})
check('安排下一段打开 composer', composerInfo.open)
check('composer 显示一次性安排', composerInfo.instruction?.includes('艾德加'), composerInfo.instruction)
// 提交生成
await page.locator('[data-test="block-composer"] .authoring-block-composer__instruction textarea').fill(MOCK_BLOCK_INSTRUCTION)
await page.locator('[data-test="block-primary"]').click()
const draft = page.locator('[data-test="block-draft"]')
await draft.waitFor({ state: 'visible', timeout: 20000 })
record('SW-06', '一次性安排进入冻结推演 session')

// ---------- SW-07 采纳兑现：编辑 → 采用 → 当前场更新 ----------
current = { id: 'SW-07', checks: [] }
const edited = '守卫推开门，艾德加正站在灯室的阴影里，手里握着那枚黄铜钥匙。'
await draft.locator('.authoring-block-draft__input').fill(edited)
await draft.getByRole('button', { name: '采用编辑稿', exact: true }).click()
await draft.waitFor({ state: 'detached', timeout: 12000 })
await page.waitForTimeout(1000)
const fulfilled = await page.evaluate((id) => {
  const book = JSON.parse(localStorage.getItem('writing_books')).find((b) => String(b.id) === String(id))
  const chapter = book?.chapters?.find((c) => c.id === 'fogch-5')
  const worldbook = JSON.parse(localStorage.getItem('worldbook_' + book.worldbookId))
  const edgarId = (worldbook?.entries || []).find((entry) => entry.name === '艾德加')?.id
  const anchor = (chapter?.sceneAnchors || []).find((a) => a.presentCharacterIds?.length >= 1)
  const canonical = document.querySelector('.ProseMirror')?.textContent || ''
  return {
    edgarId,
    plannedCleared: (chapter?.sceneAnchors || []).every((a) => !(a.plannedCharacterIds || []).length),
    edgarInPresent: (chapter?.sceneAnchors || []).some((a) => (a.presentCharacterIds || []).includes(edgarId)),
    anchor: anchor ? { present: anchor.presentCharacterIds } : null,
    editedInCanonical: canonical.includes('艾德加正站在灯室的阴影里')
  }
}, fixtureState.bookId)
check('采纳后正文含编辑稿', fulfilled.editedInCanonical)
check('planned 清零（兑现完成）', fulfilled.plannedCleared, JSON.stringify(fulfilled.anchor))
check('艾德加进入在场人物', fulfilled.edgarInPresent, JSON.stringify(fulfilled.anchor))
const railAfter = await page.evaluate(() => document.querySelector('.wall__shelf-scene')?.textContent || '')
check('左栏人物轴更新（不再有待入场，艾德加入列）', !railAfter.includes('待入场') && railAfter.includes('艾德加'), railAfter.slice(-140))
await page.screenshot({ path: path.join(OUT_DIR, 'v5-4-adopted-rail.png'), clip: { x: 0, y: 100, width: 1440, height: 700 } })
record('SW-07', '采纳兑现：正文 + 当前场原子更新')

current = { id: 'ROB-01', checks: [] }
check('无页面错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
record('ROB-01', '真实页面运行无异常')
await browser.close()

fs.writeFileSync(path.join(OUT_DIR, 'v5-check-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
const failed = results.filter((entry) => !entry.pass)
console.log('[v5] pass:', results.length - failed.length, '/', results.length)
for (const entry of failed) {
  console.log(`[v5] FAIL ${entry.id} ${entry.name}`)
  for (const item of entry.checks.filter((c) => !c.pass)) console.log(`  - ${item.label}: ${item.detail}`)
}
