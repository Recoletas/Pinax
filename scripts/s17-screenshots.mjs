// UI-S17 screenshot driver (2026-06-27).
// Captures the new 1 屏 WorldBookQuickImport page at 1280×800 in 4 variants:
//   1. settings-s17-worldbook-1280.png — default (kao light)
//   2. settings-s17-worldbook-with-worldbooks-1280.png — my-worldbooks select focused
//   3. settings-s17-worldbook-dark-1280.png — kao dark mode
//   4. settings-s17-worldbook-legacy-1280.png — legacy theme (simplified覆写)
//
// Requires Vite dev server on PORT (default 5173) and Playwright Chromium
// installed (`npx playwright install chromium`).
//
// Usage: PORT=5173 node scripts/s17-screenshots.mjs

import { chromium } from 'playwright'
import { resolve } from 'node:path'

const BASE = `http://127.0.0.1:${process.env.PORT || '5173'}`
const OUT_DIR = resolve(process.cwd(), 'docs/agent-runs/2026-06-27-visual')

async function setTheme(page, variant, colorScheme) {
  await page.evaluate(([v, cs]) => {
    localStorage.setItem('app_theme_variant', v)
    localStorage.setItem('app_theme', cs)
  }, [variant, colorScheme])
}

async function setupWorldbooks(page) {
  await page.evaluate(() => {
    const sample = [
      { id: 's17-wb-1', name: '边境小镇 · 雾潮前夜', entryCount: 12 },
      { id: 's17-wb-2', name: '灯塔档案 · 暮湾', entryCount: 8 },
      { id: 's17-wb-3', name: '废墟灯塔 · 地下储水', entryCount: 15 },
      { id: 's17-wb-4', name: '荒潮城守夜人', entryCount: 6 },
      { id: 's17-wb-5', name: '废城高塔日记', entryCount: 4 },
      { id: 's17-wb-6', name: '旧王城地库', entryCount: 9 }
    ]
    localStorage.setItem('pinax.worldbooks.index', JSON.stringify(sample))
    localStorage.setItem('pinax.worldbooks.active', 's17-wb-1')
  })
}

async function capture() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  // 1. default (kao light)
  await page.goto(`${BASE}/settings/worldbook`, { waitUntil: 'domcontentloaded' })
  await setTheme(page, 'kao', 'light')
  await setupWorldbooks(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.worldbook-hero', { timeout: 8000 })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT_DIR}/settings-s17-worldbook-1280.png`, fullPage: false })
  console.log('captured settings-s17-worldbook-1280.png')

  // 2. my-worldbooks select focused
  await page.goto(`${BASE}/settings/worldbook`, { waitUntil: 'domcontentloaded' })
  await setTheme(page, 'kao', 'light')
  await setupWorldbooks(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.my-worldbooks__select', { timeout: 8000 })
  await page.locator('.my-worldbooks__select').focus()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT_DIR}/settings-s17-worldbook-with-worldbooks-1280.png`, fullPage: false })
  console.log('captured settings-s17-worldbook-with-worldbooks-1280.png')

  // 3. dark mode
  await page.goto(`${BASE}/settings/worldbook`, { waitUntil: 'domcontentloaded' })
  await setTheme(page, 'kao', 'dark')
  await setupWorldbooks(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.worldbook-hero', { timeout: 8000 })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT_DIR}/settings-s17-worldbook-dark-1280.png`, fullPage: false })
  console.log('captured settings-s17-worldbook-dark-1280.png')

  // 4. legacy theme (S17 legacy 主题覆写生效: 无撕角/罗马/章, 白底)
  await page.goto(`${BASE}/settings/worldbook`, { waitUntil: 'domcontentloaded' })
  await setTheme(page, 'legacy', 'light')
  await setupWorldbooks(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.worldbook-hero', { timeout: 8000 })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT_DIR}/settings-s17-worldbook-legacy-1280.png`, fullPage: false })
  console.log('captured settings-s17-worldbook-legacy-1280.png')

  await browser.close()
}

capture().catch((err) => {
  console.error('screenshot failed:', err)
  process.exit(1)
})