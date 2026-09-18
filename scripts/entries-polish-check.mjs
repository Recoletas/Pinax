import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = process.env.BASE || 'http://127.0.0.1:5218'
const out = '/tmp/pinax-entries-polish'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('entries-polish')) return
    const entries = ['雾港旧城区', '北海岸灯塔', '守塔人林远', '港口通行规则', '渡轮与海上贸易'].map((name, i) => ({ id: `e${i}`, name, type: i === 2 ? 'character' : 'location', content: `${name}位于故事的核心。\n旧港沿河岸展开，石阶在涨潮时淹没在水中。居民习惯在黄昏之前回家。`, keys: [name], keysSecondary: [], injection: { mode: 'selective', group: '雾港', probability: 100, depth: 1, cooldown: 0 }, metadata: {} }))
    localStorage.setItem('worldbook_entries-demo', JSON.stringify({ id: 'entries-demo', name: '雾港设定', entries }))
    localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'entries-demo', name: '雾港设定', entryCount: entries.length }]))
    localStorage.setItem('writing_books', JSON.stringify([{ id: 'entry-book', title: '雾港来信', worldbookId: 'entries-demo', chapters: [] }]))
    localStorage.setItem('entries-polish', '1')
  })
  await page.goto(`${base}/settings/worldbook/advanced?bookId=entry-book`)
  await page.locator('.entry-item').first().waitFor()
  assert.equal(await page.locator('.bulk-tools').count(), 0)
  assert.equal(await page.locator('.injection-panel').getAttribute('open'), null)
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 960 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}`)
    await page.screenshot({ path: `${out}/entries-${width}.png` })
  }
  await page.getByRole('textbox', { name: '搜索条目', exact: true }).fill('灯塔')
  assert.equal(await page.locator('.entry-item').count(), 1)
  await page.getByRole('textbox', { name: '搜索条目', exact: true }).fill('')
  await page.locator('.entry-main').nth(1).focus()
  await page.keyboard.press('Enter')
  assert.match(await page.locator('.entry-editor-heading').innerText(), /灯塔/)
  await page.getByRole('checkbox', { name: '选择 北海岸灯塔', exact: true }).check()
  await page.locator('.bulk-tools').waitFor()
  await page.getByRole('button', { name: '清空选择', exact: true }).click()
  assert.equal(await page.locator('.bulk-tools').count(), 0)
  const content = page.getByPlaceholder('输入条目内容', { exact: true })
  await content.fill('更新后的灯塔资料。每天黄昏点灯。')
  await page.getByRole('button', { name: '保存条目', exact: true }).click()
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldbook_entries-demo')).entries.some(e => e.content.includes('更新后的灯塔资料')))
  await page.reload()
  await page.locator('.entry-main').nth(1).click()
  assert.equal(await content.inputValue(), '更新后的灯塔资料。每天黄昏点灯。')
  await page.locator('.injection-panel summary').click()
  assert.ok(await page.getByText('冷却轮次', { exact: true }).isVisible())
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: '切换夜间模式' }).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${out}/entries-dark-advanced.png` })
  await page.evaluate(() => { document.querySelector('.editor-layout').scrollTop = 0 })
  await page.screenshot({ path: `${out}/entries-dark.png` })
  assert.deepEqual(errors, [])
  console.log('entries-polish: 3 viewports / dark / filter / keyboard / contextual bulk / save + refresh / advanced settings PASS')
} finally { await browser.close() }
