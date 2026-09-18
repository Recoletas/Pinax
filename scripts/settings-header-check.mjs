import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
const base = process.env.BASE || 'http://127.0.0.1:5218'
const out = '/tmp/pinax-settings-header'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('header-seeded')) return
    localStorage.setItem('writing_books', JSON.stringify([{ id: 'header-book', title: '雾港来信', worldbookId: 'header-world', chapters: [] }]))
    localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'header-world', name: '雾港设定', entryCount: 1 }]))
    localStorage.setItem('worldbook_header-world', JSON.stringify({ id: 'header-world', name: '雾港设定', entries: [{ id: 'entry', name: '旧港', type: 'location', content: '河口北岸的港口。', keys: ['旧港'], injection: { mode: 'selective' } }], sourceDocuments: [] }))
    localStorage.setItem('header-seeded', '1')
  })
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 960 })
    let reference
    for (const [key, path] of [['structured', 'structured'], ['sources', 'sources'], ['map', 'world-map'], ['advanced', 'worldbook/advanced']]) {
      await page.goto(`${base}/settings/${path}?bookId=header-book`)
      await page.locator('.context-project-name').filter({ hasText: '雾港来信' }).waitFor()
      await page.waitForTimeout(300)
      assert.equal(await page.locator('.settings-workspace-header').count(), 1)
      assert.equal(await page.locator('.context-kicker').innerText(), '当前作品')
      assert.equal(await page.locator(`[data-test="settings-section-tab-${key}"]`).getAttribute('aria-selected'), 'true')
      const boxes = await page.evaluate(() => ['.settings-workspace-header', '.settings-context-bar', '.context-project-name', '.settings-section-nav', '.settings-return-authoring'].map(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect()
        return { x: Math.round(rect.x), y: Math.round(rect.y), height: Math.round(rect.height) }
      }))
      if (!reference) reference = boxes
      else assert.deepEqual(boxes, reference, `header moves at ${width}: ${key}`)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.screenshot({ path: `${out}/${key}-${width}.png` })
    }
  }
  await page.getByRole('button', { name: '切换夜间模式' }).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${out}/advanced-dark-390.png` })
  await page.getByRole('tab', { name: '资料', exact: true }).click()
  await page.waitForURL(/settings\/sources/)
  assert.match(page.url(), /bookId=header-book/)
  await page.getByRole('tab', { name: '地图', exact: true }).click()
  await page.waitForURL(/settings\/world-map/)
  assert.match(page.url(), /bookId=header-book/)
  assert.deepEqual(errors, [])
  console.log('settings-header: four pages × three widths exact geometry / current book / section navigation / dark / no page errors PASS')
} finally { await browser.close() }
