// 补拍 01：项目资料面板（复用已存会话）
import { chromium } from 'playwright'
import { resolve } from 'node:path'
const outDir = resolve(process.argv[2] || 'docs/screenshots/worldbook-showcase-20261008')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: resolve(outDir, 'tmp-showcase-state.json') })
const page = await ctx.newPage()
await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.getByRole('button', { name: '新建作品' }).first().click()
await page.waitForTimeout(800)
const dlg = page.getByRole('dialog', { name: '项目资料' })
await dlg.getByRole('textbox', { name: '书名' }).fill('雾海孤灯')
await page.waitForTimeout(400)
await page.screenshot({ path: resolve(outDir, '01-project-panel.png') })
console.log('01 captured')
await browser.close()
