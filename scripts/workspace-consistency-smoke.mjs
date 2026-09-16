import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const snapshot = JSON.parse(fs.readFileSync('tmp/authoring-context-closure/fixture-localstorage.json', 'utf8'))
const books = JSON.parse(snapshot.writing_books)
const book = books[0]
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(snapshot => {
    if (sessionStorage.getItem('ui-consistency-seeded')) return
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    sessionStorage.setItem('ui-consistency-seeded', 'yes')
  }, snapshot)
  await page.goto(`http://127.0.0.1:5173/settings/structured?bookId=${book.id}`)
  await page.waitForSelector('.structured-settings-panel')
  assert.equal(await page.locator('.shell-mast').count(), 0)
  assert.equal(await page.locator('.context-kicker').innerText(), '关联资料')
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.screenshot({ path: `/tmp/pinax-settings-unified-${width}.png` })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const origin = page.locator('#setting-field-world-origin')
  await origin.fill('旧港坐落在潮汐河口，城中的档案馆保存着百年的航海记录。')
  await origin.blur()
  await page.waitForFunction(id => {
    const wb = JSON.parse(localStorage.getItem(`worldbook_${id}`) || '{}')
    return JSON.stringify(wb).includes('百年的航海记录')
  }, book.worldbookId)
  for (const label of ['故事核心', '角色设定', '创作规则', '世界观']) {
    await page.locator('.section-tabs').getByRole('button', { name: label, exact: true }).click()
    await page.locator('.section-content-heading h1').filter({ hasText: label }).waitFor()
  }
  await page.reload()
  await origin.waitFor()
  assert.match(await origin.inputValue(), /百年的航海记录/)
  const longText = '旧港坐落在潮汐河口，城中的档案馆保存着百年的航海记录。\n'.repeat(50)
  await origin.fill(longText)
  await origin.blur()
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.waitForTimeout(200)
    assert(await origin.evaluate(el => el.scrollHeight <= el.clientHeight + 2), `long text clipped at ${width}`)
    await page.screenshot({ path: `/tmp/pinax-settings-document-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await origin.waitFor()
  assert.equal(await origin.inputValue(), longText)
  assert(await origin.evaluate(el => el.scrollHeight <= el.clientHeight + 2))
  await origin.hover()
  await page.mouse.wheel(0, 450)
  await page.waitForTimeout(200)
  assert(await page.locator('.settings-body').evaluate(el => el.scrollTop > 0), 'wheel over text scrolls document')
  await page.locator('.field-directory button').first().click()
  assert(await origin.evaluate(el => document.activeElement === el), 'directory owns focus')
  await page.evaluate(() => { localStorage.setItem('app_theme', 'dark') })
  await page.reload()
  await origin.waitFor()
  await page.screenshot({ path: '/tmp/pinax-settings-document-dark.png' })
  await page.evaluate(() => { localStorage.setItem('app_theme', 'light') })
  await page.reload()
  await origin.waitFor()
  await page.getByRole('button', { name: '打开工作区导航' }).click()
  await page.locator('.shell-drawer.open').waitFor()
  await page.getByRole('button', { name: '关闭导航', exact: true }).click()
  await page.goto(`http://127.0.0.1:5173/authoring?bookId=${book.id}`)
  await page.locator('.ProseMirror').first().waitFor()
  assert.equal(await page.locator('.authoring-book-tabs').count(), 0)
  assert.equal(await page.locator('.shell-mast').count(), 0)
  assert.match(await page.locator('.wall__chapter-trigger').innerText(), /章节目录/)
  await page.screenshot({ path: '/tmp/pinax-authoring-unified.png' })
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.locator('.wall__chapter-trigger').click()
  assert.equal(await page.locator('.wall__chapter-trigger').getAttribute('aria-expanded'), 'true')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const route of ['materials', 'comics', 'prose-essay']) {
    await page.goto(`http://127.0.0.1:5173/${route}?bookId=${book.id}`)
    await page.locator('[data-test="workspace-tabs"]').waitFor()
    await page.waitForFunction(() => document.querySelector('.shell-content')?.innerText.trim().length > 20)
    assert.equal(await page.locator('.shell-mast').count(), 0)
    await page.screenshot({ path: `/tmp/pinax-${route}-unified.png` })
    for (const width of [900, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.waitForTimeout(200)
      await page.screenshot({ path: `/tmp/pinax-${route}-unified-${width}.png` })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflow at ${width}`)
      assert(await page.locator('.ws-tab.is-active').evaluate(tab => {
        const viewport = tab.parentElement.getBoundingClientRect()
        const rect = tab.getBoundingClientRect()
        return rect.left >= viewport.left - 2 && rect.right <= viewport.right + 2
      }), `${route} active tab clipped at ${width}`)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  await page.goto('http://127.0.0.1:5173/docs/README')
  await page.locator('.docs-page__content h1').waitFor()
  await page.locator('[data-test="workspace-tabs"]').waitFor()
  assert.match(await page.locator('.ws-tab.is-active').innerText(), /文档/)
  await page.locator('.docs-page__nav-item').nth(1).click()
  await page.waitForTimeout(300)
  const chapterUrl = page.url()
  const tabWidths = await page.locator('.ws-tab').evaluateAll(tabs => tabs.map(tab => tab.getBoundingClientRect().width))
  await page.locator('.ws-tab').filter({ hasText: '首页' }).first().click()
  await page.waitForURL('http://127.0.0.1:5173/')
  await page.locator('.ws-tab').filter({ hasText: '文档' }).first().click()
  await page.waitForURL(chapterUrl)
  assert.deepEqual(await page.locator('.ws-tab').evaluateAll(tabs => tabs.map(tab => tab.getBoundingClientRect().width)), tabWidths, 'switching must not resize tabs')
  assert.equal(await page.locator('[class*="page-route-enter"], [class*="page-layer-enter"]').count(), 0)
  await page.reload()
  await page.locator('.docs-page__content h1').waitFor()
  assert.equal(page.url(), chapterUrl)
  assert.match(await page.locator('.ws-tab.is-active').innerText(), /文档/)
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.waitForTimeout(350)
    await page.screenshot({ path: `/tmp/pinax-docs-tabs-${width}.png` })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }
  assert.deepEqual(errors, [])
  console.log('UI consistency: 3 settings viewports, field persistence, 4 sections, navigation drawer, authoring chapter access, materials/comics/canvas shell OK')
} finally { await browser.close() }
