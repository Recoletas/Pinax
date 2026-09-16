import { chromium } from 'playwright'
import fs from 'node:fs'
import assert from 'node:assert/strict'

const snapshot = JSON.parse(fs.readFileSync('tmp/authoring-context-closure/fixture-localstorage.json', 'utf8'))
const book = JSON.parse(snapshot.writing_books)[0]
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(snapshot => {
    if (sessionStorage.getItem('polish-seeded')) return
    Object.entries(snapshot).forEach(([k, v]) => localStorage.setItem(k, v))
    sessionStorage.setItem('polish-seeded', '1')
  }, snapshot)
  await page.goto(`http://127.0.0.1:5173/settings/structured?bookId=${book.id}`)
  await page.locator('#setting-field-world-origin').fill('旧港坐落在潮汐河口。百年前，一场持续七日的风暴切断了大陆航线，幸存者沿旧灯塔重建城镇。\n如今，城中的档案馆保存着每艘归航船的记录。外海不再平静，失踪已久的商船却带着崭新的船帆回到了港口。')
  await page.locator('#setting-field-world-powerSystem').fill('潮汐决定航道与贸易周期。船长依靠星图、测深绳和代代相传的航海知识判断天气；没有人能凭空改变海流。')
  await page.locator('#setting-field-world-origin').blur()
  if (process.env.PROTOTYPE) {
    await page.addStyleTag({ content: `.structured-settings-panel.is-continuous .section-canvas { padding: 28px 40px!important; } .structured-settings-panel.is-continuous .section-content-heading,.structured-settings-panel.is-continuous .settings-editor-layout { max-width:1100px!important;margin-inline:0!important; } .structured-settings-panel.is-continuous .fields-grid { gap:18px!important; } .structured-settings-panel.is-continuous .fields-grid .setting-field-card { gap:4px!important;padding-bottom:16px!important; } .structured-settings-panel.is-continuous .fields-grid .field-head{margin-bottom:6px!important;} .structured-settings-panel.is-continuous .fields-grid textarea {min-height:60px!important;line-height:1.85!important;}` })
    await page.screenshot({ path: '/tmp/pinax-settings-density-prototype.png' })
  } else {
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.waitForTimeout(350)
      await page.screenshot({ path: `/tmp/pinax-settings-polished-${width}.png` })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert(await page.locator('.section-canvas').evaluate(canvas => {
        const heading = canvas.querySelector('.section-content-heading')
        const rect = canvas.getBoundingClientRect()
        const gap = rect.right - heading.getBoundingClientRect().right
        return gap < 55
      }), `settings must use available width at ${width}`)
    }
    const search = page.getByRole('searchbox', { name: '查找设定' })
    await search.fill('不存在的设定关键词')
    await page.locator('.directory-empty').waitFor()
    await search.fill('主角')
    await page.locator('.field-search-results button').filter({ hasText: '主角' }).click()
    await page.locator('#setting-field-characters-protagonists').waitFor()
    assert(await page.locator('#setting-field-characters-protagonists').evaluate(el => el === document.activeElement))
    await search.fill('')
    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const label of ['角色设定', '创作规则', '故事核心', '世界观']) {
      await page.locator('.section-tabs').getByRole('button', { name: label, exact: true }).click()
      await page.waitForTimeout(150)
      await page.screenshot({ path: `/tmp/pinax-settings-polished-${label}.png` })
    }
    await page.getByRole('button', { name: '补充生成要求', exact: true }).click()
    await page.locator('.brief-bar-wrapper').waitFor()
    await page.getByRole('button', { name: '收起生成要求', exact: true }).click()
    assert.equal(await page.locator('.brief-bar-wrapper').count(), 0)
    await page.evaluate(() => localStorage.setItem('app_theme', 'dark'))
    await page.reload()
    await page.locator('#setting-field-world-origin').waitFor()
    await page.screenshot({ path: '/tmp/pinax-settings-polished-dark.png' })
    assert.deepEqual(errors, [])
    console.log('Settings polish: three widths, search empty/results/cross-section focus, four sections, brief toggle, dark mode; no page errors')
  }
} finally { await browser.close() }
