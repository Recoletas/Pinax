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
    const scroll = root.querySelector('.wall__dossier-scroll,.authoring-dual-pane__scroll')
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
      localStorage.setItem('app_theme_variant', 'legacy')
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
      for (const tool of ['characters', 'dual']) {
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
        if (tool === 'dual') {
          const header = page.locator('.authoring-dual-pane__head')
          const titleBox = await header.locator('.authoring-dual-pane__title').boundingBox()
          const actionsBox = await header.locator('.authoring-dual-pane__actions').boundingBox()
          check(`${label} 标题独占操作行上方`, titleBox.y + titleBox.height <= actionsBox.y + 1, { titleBox, actionsBox })
          check(`${label} 已保存不占标题空间`, await header.locator('.authoring-dual-pane__save').count() === 0, null)
          const longTitle = await header.evaluate(element => {
            const title = element.querySelector('strong')
            const original = title.textContent
            title.textContent = '当雾港的最后一盏灯熄灭之后她终于听见了海底的钟声'
            const range = document.createRange()
            range.selectNodeContents(title)
            const bounds = element.querySelector('.authoring-dual-pane__title').getBoundingClientRect()
            const rects = [...range.getClientRects()]
            const visible = rects.every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1)
            title.textContent = original
            return { visible, lines: rects.length }
          })
          check(`${label} 长章名换行完整显示`, longTitle.visible && longTitle.lines >= 2, longTitle)
          if (width <= 720) {
            await header.getByRole('button', { name: '切换副窗内容', exact: true }).click()
            await page.waitForTimeout(100)
            const directoryBox = await page.locator('.authoring-dual-pane__directory').boundingBox()
            const headerBox = await header.boundingBox()
            check(`${label} 移动目录不遮挡标题和操作`, directoryBox.y >= headerBox.y + headerBox.height - 1, { directoryBox, headerBox })
            await header.getByRole('button', { name: '切换副窗内容', exact: true }).click()
          }
        }
        if (tool === 'dual' && width === 1440) {
          const pane = page.locator('.authoring-dual-pane')
          check(`${label} 正文副稿不混入设定空态`, await pane.locator('[data-document-role="dual-worldbook-entry"]').count() === 0, null)
          const content = pane.locator('.authoring-dual-pane__editor')
          const directoryWidth = (await content.boundingBox()).width
          const toggle = pane.getByRole('button', { name: '切换副窗内容', exact: true })
          await toggle.click()
          await page.waitForTimeout(150)
          check(`${label} 收起目录释放副稿宽度`, (await content.boundingBox()).width > directoryWidth + 100, { before: directoryWidth, after: (await content.boundingBox()).width })
          check(`${label} 外宽保持440`, Math.abs((await pane.boundingBox()).width - 440) <= 1, await pane.boundingBox())
          await page.screenshot({ path: path.join(out, `${label}-directory-closed.png`) })
          await pane.locator('.ProseMirror p').nth(3).click()
          await page.keyboard.press('Home')
          await page.keyboard.press('Shift+ArrowRight')
          await page.waitForTimeout(150)
          const dualBefore = await capture(page, '.authoring-dual-pane')
          await page.locator('[data-authoring-tool="characters"]').click()
          await page.getByTitle('关闭角色工作台', { exact: true }).click()
          await page.waitForTimeout(300)
          const dualAfter = await capture(page, '.authoring-dual-pane')
          check(`${label} 临时工具返回保留目录收起`, await pane.locator('.authoring-dual-pane__directory').count() === 0, null)
          check(`${label} 返回副稿恢复选区与滚动`, JSON.stringify(dualBefore.selection) === JSON.stringify(dualAfter.selection) && Math.abs(dualBefore.scroll - dualAfter.scroll) <= 2 && dualAfter.focused, { before: dualBefore.selection, after: dualAfter.selection, scroll: [dualBefore.scroll, dualAfter.scroll] })
        }
        if (tool === 'dual') await page.getByRole('button', { name: '关闭双栏', exact: true }).click()
        else await page.getByTitle('关闭角色工作台', { exact: true }).click()
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
