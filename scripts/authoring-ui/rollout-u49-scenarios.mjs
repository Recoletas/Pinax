// U49 六情境完整作者旅程：每情境验证 composer→draft→采用/放弃→正文确认
// 用法：BASE=http://127.0.0.1:5175 node scripts/authoring-ui/rollout-u49-scenarios.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { installDeterministicProviderMock } from './provider-mock.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5175'
const OUT_DIR = path.resolve('tmp/authoring-overnight/u49')
fs.mkdirSync(OUT_DIR, { recursive: true })

// 六种情境定义
const SCENARIOS = [
  { id: 'secret', label: '档案保密与关系压力', instruction: '莉娜发现总册被动过但决定保密，同时维持与艾德加的信任关系。' },
  { id: 'storm', label: '暴雨停电物理约束', instruction: '暴雨导致灯塔停电，守卫必须手动点亮备用灯。' },
  { id: 'plain', label: '无世界书普通稿', instruction: '一个普通人走在回家的路上，思考今天发生的事情。' },
  { id: 'birthday', label: '生日守诺', instruction: '艾德加记起今天是他承诺陪莉娜去灯塔的日子。' },
  { id: 'rescue', label: '合作救援', instruction: '守卫和艾德加合力将被困的渔夫从礁石上救下。' },
  { id: 'dual-reason', label: '同一行动两种理由', instruction: '莉娜决定去灯塔，一是因为好奇，二是因为想确认守卫的安全。' }
]

const results = []
const browser = await chromium.launch()

for (const scenario of SCENARIOS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message.slice(0, 80)))
  // 安装 mock
  await installDeterministicProviderMock(page, { passiveInline: false })
  await page.goto(`${BASE}/authoring`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  // 建书建章
  await page.locator('.wall__pin-cta', { hasText: '建立第一本书' }).click()
  await page.fill('.modal input[placeholder="输入书籍名称"]', 'U49-' + scenario.id)
  await page.click('.modal-footer .btn-primary')
  await page.waitForTimeout(700)
  await page.locator('.wall__pin-cta', { hasText: '建立第一章' }).click()
  await page.waitForTimeout(900)
  const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
  await surface.click()
  await page.keyboard.type(scenario.instruction.slice(0, 30) + '。')
  await page.waitForTimeout(800)
  // 打开 composer
  await page.evaluate(() => { document.querySelector('.writing-unit-gap__action')?.click() })
  await page.locator('[data-test="block-composer"]').waitFor({ state: 'visible', timeout: 4000 }).catch(() => {})
  const composerVisible = await page.evaluate(() => Boolean(document.querySelector('[data-test="block-composer"]')))
  if (!composerVisible) {
    results.push({ id: scenario.id, label: scenario.label, status: 'no-composer' })
    await ctx.close()
    continue
  }
  await page.locator('[data-test="block-composer"] .authoring-block-composer__instruction textarea').fill(scenario.instruction)
  await page.locator('[data-test="block-primary"]').click()
  const draft = page.locator('[data-test="block-draft"]')
  const draftVisible = await draft.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false)
  if (!draftVisible) {
    results.push({ id: scenario.id, label: scenario.label, status: 'no-draft' })
    await ctx.close()
    continue
  }
  // 手改草稿
  await draft.locator('.authoring-block-draft__input').fill('这是' + scenario.label + '的编辑后试稿。')
  await page.waitForTimeout(300)
  // 采用
  await draft.getByRole('button', { name: '采用编辑稿', exact: true }).click()
  await draft.waitFor({ state: 'detached', timeout: 12000 }).catch(() => {})
  await page.waitForTimeout(800)
  // 验证正文
  const canonical = await page.evaluate(() => document.querySelector('.ProseMirror')?.textContent || '')
  const adopted = canonical.includes('编辑后试稿')
  // 撤销
  await page.keyboard.press('ControlOrMeta+z')
  await page.waitForTimeout(400)
  const undoWorked = !(await page.evaluate(() => document.querySelector('.ProseMirror')?.textContent || '').then(t => t.includes('编辑后试稿')))
  // 重做
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await page.waitForTimeout(400)
  const redoWorked = await page.evaluate(() => document.querySelector('.ProseMirror')?.textContent || '').then(t => t.includes('编辑后试稿'))
  results.push({
    id: scenario.id, label: scenario.label,
    adopted, undoWorked, redoWorked,
    errors: errors.slice(0, 2)
  })
  await ctx.close()
}
await browser.close()

// 输出
const pass = results.filter(r => r.adopted && r.undoWorked && r.redoWorked).length
console.log(`\n=== U49 六情境结果 ===`)
for (const r of results) {
  const status = r.adopted ? '✓' : '✗'
  console.log(`${status} ${r.id}: adopted=${r.adopted} undo=${r.undoWorked} redo=${r.redoWorked}`)
}
console.log(`总通过: ${pass}/${results.length}`)
if (pass < results.length) process.exit(1)
