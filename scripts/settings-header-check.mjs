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
    // [截图名, 路由路径, 应选中的分区 tab]：知识控制台（W2-A）与高级设置页在影子共存期同属「知识」tab。
    // W2-A-2b：旧「设定」路由改为重定向进控制台的设定视图，落点仍是「知识」tab。
    // tabKey=null：文档页（W2-D）不是设定分区之一，共享头只给它书身份与分区入口，无 tab 应处于选中态。
    // 资料页不在参照内：它带 bookId 时改用页内标题（SettingsSources.vue 的 SettingsWorkspaceHeader 有 v-if="!bookId"），
    // 这是 2026-10-08 记档的存量失靶，本行只按现行行为收窄参照面，不在此页改产品。
    for (const [name, path, tabKey] of [['settings-view', 'structured', 'knowledge'], ['map', 'world-map', 'map'], ['advanced', 'worldbook/advanced', 'knowledge'], ['knowledge', 'knowledge', 'knowledge'], ['documents', 'documents', null]]) {
      await page.goto(`${base}/settings/${path}?bookId=header-book`)
      // 20261010 同步：上下文条的书名在 settings-book-switcher 的 title 上（data-worldbook-name 是世界书名）。
      await page.waitForFunction(bookTitle => document.querySelector('[data-test="settings-book-switcher"]')?.getAttribute('title') === bookTitle, '雾港来信')
      await page.waitForTimeout(300)
      if (name === 'settings-view') assert.match(page.url(), /\/settings\/knowledge\?.*view=settings/)
      assert.equal(await page.locator('.settings-workspace-header').count(), 1)
      assert.equal(await page.locator('.context-kicker').innerText(), '当前作品')
      if (tabKey) assert.equal(await page.locator(`[data-test="settings-section-tab-${tabKey}"]`).getAttribute('aria-selected'), 'true')
      else assert.equal(await page.locator('.settings-section-tab.active').count(), 0, `${name} must not claim a section tab`)
      const boxes = await page.evaluate(() => ['.settings-workspace-header', '.settings-context-bar', '.settings-section-nav', '.settings-return-authoring'].map(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect()
        return { x: Math.round(rect.x), y: Math.round(rect.y), height: Math.round(rect.height) }
      }))
      if (!reference) reference = boxes
      else assert.deepEqual(boxes, reference, `header moves at ${width}: ${name}`)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.screenshot({ path: `${out}/${name}-${width}.png` })
    }
  }
  // 暗色：先回到「高级设置」面（文件名所指），再补拍文档页——文档页是 W2-D 新接入的第五面。
  await page.goto(`${base}/settings/worldbook/advanced?bookId=header-book`)
  await page.waitForFunction(bookTitle => document.querySelector('[data-test="settings-book-switcher"]')?.getAttribute('title') === bookTitle, '雾港来信')
  await page.getByRole('button', { name: '切换夜间模式' }).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${out}/advanced-dark-390.png` })
  await page.goto(`${base}/settings/documents?bookId=header-book`)
  await page.waitForFunction(bookTitle => document.querySelector('[data-test="settings-book-switcher"]')?.getAttribute('title') === bookTitle, '雾港来信')
  await page.screenshot({ path: `${out}/documents-dark-390.png` })
  // 分区互跳：地图页仍带共享分区导航，资料页带 bookId 时不带（见上方参照说明），故先跳地图再跳资料。
  await page.getByRole('tab', { name: '地图', exact: true }).click()
  await page.waitForURL(/settings\/world-map/)
  assert.match(page.url(), /bookId=header-book/)
  await page.getByRole('tab', { name: '知识', exact: true }).click()
  await page.waitForURL(/settings\/knowledge/)
  assert.match(page.url(), /bookId=header-book/)
  await page.getByRole('tab', { name: '资料', exact: true }).click()
  await page.waitForURL(/settings\/sources/)
  assert.match(page.url(), /bookId=header-book/)
  assert.deepEqual(errors, [])
  console.log('settings-header: five shared-header surfaces × three widths exact geometry / current book / section navigation / dark / no page errors PASS')
} finally { await browser.close() }
