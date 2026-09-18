import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const base = process.env.BASE || 'http://127.0.0.1:5218'
const out = '/tmp/pinax-library-sources-polish'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('polish-seeded')) return
    const titles = ['雾港来信', '漫长的告别', '北海岸：一段关于灯塔与归途的故事']
    localStorage.setItem('writing_books', JSON.stringify(titles.map((title, i) => ({ id: `visual-${i}`, title, worldbookId: 'visual-world', createdAt: '2026-09-01', updatedAt: '2026-09-18', chapters: [{ id: `ch-${i}`, title: '第一章', content: '海雾涌上码头。', wordCount: 8 }] }))))
    const sourceDocuments = [
      { id: 'a', title: '雾港地方志 · 港口与旧城区', kind: 'pdf', originalLength: 28400, contentPreview: '旧港建于河口以北。潮汐、渡口与旧城区的道路共同决定了这座城的生活。' },
      { id: 'b', title: '人物访谈：守塔人的来信', kind: 'markdown', originalLength: 3200, contentPreview: '他在灯塔里住了二十年。每逢风暴来临，都会提前把灯点亮。' },
      { id: 'c', title: '十九世纪沿海贸易、航线和港口制度的历史考证与资料摘录（修订版）', kind: 'docx', originalLength: 12600, contentPreview: '航线、港务记录与地方文献的交叉考证。' },
      { id: 'd', title: '开篇场景参考', kind: 'pasted-text', content: '清晨的雾没有散去，第一班渡轮已经抵达码头。' }
    ]
    localStorage.setItem('worldbook_visual-world', JSON.stringify({ id: 'visual-world', name: '雾港资料库', entries: [], sourceDocuments }))
    localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'visual-world', name: '雾港资料库', entryCount: 0 }]))
    localStorage.setItem('polish-seeded', '1')
  })
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 960 })
    await page.goto(base)
    await page.locator('.library-books').waitFor()
    assert.equal(await page.locator('[data-test="welcome-import-manuscript"] svg').count(), 1)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `${out}/home-${width}.png` })
    await page.goto(`${base}/settings/sources?bookId=visual-0`)
    await page.locator('.sources-panel__title').first().waitFor()
    assert.equal(await page.getByRole('button', { name: '添加资料', exact: true }).count(), 1)
    assert.equal(await page.locator('.sources-panel__toggle').count(), 0)
    assert.equal(await page.locator('.sources-panel__item').count(), 4)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: `${out}/sources-${width}.png` })
  }
  await page.getByRole('searchbox', { name: '搜索资料' }).fill('守塔人')
  assert.equal(await page.locator('.sources-panel__item').count(), 1)
  await page.getByRole('searchbox', { name: '搜索资料' }).fill('')
  await page.getByRole('combobox', { name: '按类型筛选' }).selectOption('pdf')
  assert.equal(await page.locator('.sources-panel__item').count(), 1)
  await page.getByRole('combobox', { name: '按类型筛选' }).selectOption('all')
  await page.locator('.sources-panel__title').first().click()
  await page.locator('.sources-panel__preview pre').waitFor()
  await page.screenshot({ path: `${out}/sources-preview-390.png` })
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: '切换夜间模式' }).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${out}/sources-dark.png` })
  await page.goto(base)
  await page.locator('.library-books').waitFor()
  await page.screenshot({ path: `${out}/home-dark.png` })
  assert.deepEqual(errors, [])
  console.log('library-sources-visual: 3 viewports / dark / single action / semantic import icon / search / filter / preview / no page errors: PASS')
} finally { await browser.close() }
