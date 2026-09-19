/* eslint-disable no-console */
// P00（docs/plan/authoring-block-assistant-image-20260919.md §8）：
// 三域首屏基线截图——正文当前块、助手、生图抽屉；明暗成对；
// 1440/900/390 三档。只读取隔离 context 的 fixture 数据，不写用户浏览器。
// 输出 docs/agent-runs/block-assistant-image-20260919/screenshots/baseline/。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-rollout')
const OUT_DIR = path.resolve('docs/agent-runs/block-assistant-image-20260919/screenshots/baseline')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const baseStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
fs.mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '900', width: 900, height: 900 },
  { name: '390', width: 390, height: 844 }
]

const browser = await chromium.launch()
let failed = 0

for (const viewport of VIEWPORTS) {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 })
    await context.addInitScript(({ snapshot, theme }) => {
      localStorage.clear()
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
      localStorage.setItem('app_ui_zoom', '1')
      localStorage.setItem('app_theme', theme)
    }, { snapshot: baseStorage, theme: scheme })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=fogch-1`, { waitUntil: 'domcontentloaded' })
      await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
      await page.waitForTimeout(900)

      // 1) 正文当前块：点击第 3 段让光标落块，截编辑区。
      await page.locator('.wall__dossier .ProseMirror p').nth(2).click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(OUT_DIR, `p00-block-${viewport.name}-${scheme}.png`) })

      // 2) 助手：右栏打开（390 走同一入口的 sheet）。
      await page.locator('[data-authoring-tool="ai"]').click()
      await page.locator('.authoring-knowledge').waitFor({ state: 'visible', timeout: 10000 })
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(OUT_DIR, `p00-assistant-${viewport.name}-${scheme}.png`) })
      await page.locator('.writing-inspector__icon-btn[title="关闭检查器"]').click()
      await page.waitForTimeout(300)

      // 3) 生图抽屉：桌面工具栏入口；390 收在「更多」菜单里。
      if (viewport.name === '390') {
        await page.getByRole('button', { name: /更多写作操作|工具/ }).first().click()
        await page.locator('[data-test="mobile-illustrator-action"]').click()
      } else {
        await page.locator('[data-test="authoring-illustrator-trigger"]').click()
      }
      await page.waitForTimeout(900)
      await page.screenshot({ path: path.join(OUT_DIR, `p00-illustrator-${viewport.name}-${scheme}.png`) })
      console.log(`OK ${viewport.name}/${scheme} 三域截图完成${errors.length ? `（页面错误 ${errors.length} 条）` : ''}`)
      if (errors.length) failed += 1
    } catch (error) {
      console.log(`FAIL ${viewport.name}/${scheme}: ${error.message.slice(0, 200)}`)
      failed += 1
    } finally {
      await context.close()
    }
  }
}

await browser.close()
if (failed) process.exitCode = 1
console.log(`P00 baseline screenshots: ${failed ? `${failed} 组失败` : '全部完成'} → ${OUT_DIR}`)
