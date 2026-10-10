// A1: real browser geometry and return-to-writing checks on isolated fixture data.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const base = process.env.BASE || 'http://127.0.0.1:5173'
const stage = process.env.UX_STAGE || 'after'
const out = path.resolve('/tmp/pinax-ux-a1', stage)
const fixture = path.resolve('tmp/authoring-rollout')
const snapshot = JSON.parse(fs.readFileSync(path.join(fixture, 'fixture-localstorage.json'), 'utf8'))
const state = JSON.parse(fs.readFileSync(path.join(fixture, 'fixture-state.json'), 'utf8'))
const widths = (process.env.UX_WIDTHS || '390,640,641,719,720,721,758,759,760,979,980,981,1024,1179,1180,1181,1440').split(',').map(Number)
fs.mkdirSync(out, { recursive: true })
const results = []
function check(label, pass, detail) {
  results.push({ label, pass: Boolean(pass), detail })
  if (!pass) console.log(`FAIL ${label}: ${JSON.stringify(detail)}`)
}
async function capture(page, selector = '.wall__dossier') {
  return page.evaluate(selector => {
    const root = document.querySelector(selector)
    const scroll = root.querySelector('.wall__dossier-scroll') // W-B 双栏退役：副稿面滚动容器已随功能移除
    const selection = getSelection()
    const locate = node => {
      const element = node?.nodeType === 1 ? node : node?.parentElement
      return { unit: element?.closest('[data-writing-unit]')?.getAttribute('data-unit-id'), text: node?.textContent }
    }
    return {
      width: root.getBoundingClientRect().width,
      scroll: scroll?.scrollTop,
      selection: { anchor: locate(selection?.anchorNode), focus: locate(selection?.focusNode), anchorOffset: selection?.anchorOffset, focusOffset: selection?.focusOffset },
      focused: root.contains(document.activeElement),
      overflow: document.documentElement.scrollWidth > innerWidth,
      text: root.querySelector('.ProseMirror').textContent
    }
  }, selector)
}
const browser = await chromium.launch({ headless: true })
try {
  for (const [width, theme] of [...widths.map(width => [width, 'light']), [390, 'dark'], [1440, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: 'reduce' })
    await context.addInitScript(({ snapshot, theme }) => {
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
      localStorage.setItem('app_theme', theme)
      localStorage.setItem('app_ui_zoom', '1')
    }, { snapshot, theme })
    const page = await context.newPage()
    page.setDefaultTimeout(8000)
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort())
    try {
      await page.goto(`${base}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
      const editor = page.locator('.wall__dossier .ProseMirror').first()
      await editor.waitFor()
      await page.waitForTimeout(250)
      // W-B 双栏退役：工具旅程收敛到顶栏工具组既有工具（characters/outline）。
      for (const tool of ['characters', 'outline']) {
        const label = `${width}-${theme}-${tool}`
        await editor.locator('p').nth(4).click()
        await page.waitForTimeout(150)
        await page.keyboard.press('Home')
        await page.keyboard.press('Shift+ArrowRight')
        await page.keyboard.press('Shift+ArrowRight')
        await page.waitForTimeout(150)
        const before = await capture(page)
        check(`${label} 有真实正文选区`, before.selection.anchorOffset !== before.selection.focusOffset, before.selection)
        if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(out, `${label}-closed.png`) })
        await page.locator(`[data-authoring-tool="${tool}"]`).click()
        await page.waitForTimeout(250)
        const opened = await capture(page)
        check(`${label} 无横向溢出`, !opened.overflow, opened.width)
        if (width <= 1180) check(`${label} 覆盖态保持稿面宽度`, Math.abs(opened.width - before.width) <= 1, { before: before.width, opened: opened.width })
        if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(out, `${label}-opened.png`) })
        // W-B 双栏退役：dual 专属几何/目录/副稿断言随功能移除。
        await page.getByTitle(tool === 'characters' ? '关闭角色工作台' : '关闭大纲工作台', { exact: true }).click()
        await page.waitForTimeout(300)
        const after = await capture(page)
        check(`${label} 关闭恢复选区`, JSON.stringify(before.selection) === JSON.stringify(after.selection), { before: before.selection, after: after.selection })
        check(`${label} 关闭恢复滚动`, Math.abs(after.scroll - before.scroll) <= 2, { before: before.scroll, after: after.scroll })
        check(`${label} 关闭返回正文焦点`, after.focused, after.focused)
        check(`${label} 正文不变`, before.text === after.text, null)
      }
      check(`${width}-${theme} 无页面异常`, errors.length === 0, errors)
    } catch (error) { check(`${width}-${theme} journey`, false, error.message) }
    await context.close()
  }
} finally {
  await browser.close()
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(results, null, 2))
}
const failed = results.filter(result => !result.pass)
console.log(`A1 ${stage}: ${results.length - failed.length}/${results.length} checks; ${failed.length} failures; ${out}`)
process.exitCode = failed.length ? 1 : 0
