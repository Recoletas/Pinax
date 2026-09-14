/* global process */
/* eslint-disable no-console */
// C02 行为验证:回访作者首要动作继续最近作品,J02 打开预期书/章,空库路径不回归。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5213'
const FIXTURE_DIR = path.resolve(process.env.FIXTURE_DIR || 'tmp/authoring-context-closure')
const OUT_DIR = path.resolve('docs/agent-runs/nightly-20260913/c-ux-20260914/screenshots')
const fixtureStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok, note })
  console.log(`[c02-check] ${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  // 1) 有书回访:继续作品是首要内容,且链接直接指向该书
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_theme', 'light')
  }, fixtureStorage)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
  const continueLink = page.locator('[data-test="welcome-continue-book"]')
  check('continue entry visible on desktop', await continueLink.isVisible())
  const href = await continueLink.getAttribute('href')
  const expectedBookId = await page.evaluate(() => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
      .sort((a, b) => Date.parse(b?.updatedAt || 0) - Date.parse(a?.updatedAt || 0))
    return books[0]?.id || ''
  })
  check('continue link targets most recent book without guide param',
    href.includes(`bookId=${expectedBookId}`) && !href.includes('guide='), href)

  // 2) J02:点继续打开预期书;不新建、不弹新建对话框
  await continueLink.click()
  await page.waitForTimeout(1600)
  const dialogShown = await page.getByRole('dialog', { name: '新建书稿' }).isVisible().catch(() => false)
  check('no new-book dialog on continue', !dialogShown)
  const bookOpened = await page.evaluate((id) => {
    const params = new URLSearchParams(location.search)
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const current = books.find((book) => String(book.id) === String(params.get('bookId') || id))
    return Boolean(current) && Boolean(current?.chapters?.length)
  }, expectedBookId)
  check('authoring opened the expected book', bookOpened)
  await page.screenshot({ path: path.join(OUT_DIR, 'c02-continue-opens-book.png') })

  // 3) 空库不回归:两条主路径仍在
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  const emptyStart = await page.locator('[data-test="welcome-start-authoring"]').isVisible()
  const emptyImport = await page.locator('[data-test="welcome-import-manuscript"]').isVisible()
  check('empty library keeps both primary paths', emptyStart && emptyImport)

  // 4) 390:继续入口在第一屏(视口内可点,无需滚动)
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobile.newPage()
  await mobilePage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await mobilePage.evaluate((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_theme', 'light')
  }, fixtureStorage)
  await mobilePage.reload({ waitUntil: 'domcontentloaded' })
  await mobilePage.waitForTimeout(700)
  const box = await mobilePage.locator('[data-test="welcome-continue-book"]').boundingBox()
  const inFirstScreen = Boolean(box && box.y >= 0 && box.y + box.height <= 844)
  check('390: continue entry inside first screen', inFirstScreen, JSON.stringify(box))
  await mobilePage.screenshot({ path: path.join(OUT_DIR, 'c02-welcome-books-mobile-after.png') })
  await mobile.close()
} catch (error) {
  check('runtime', false, String(error?.message || error).slice(0, 200))
} finally {
  fs.writeFileSync('docs/agent-runs/nightly-20260913/c-ux-20260914/c02-browser-check.json', JSON.stringify({
    schemaVersion: 1, base: BASE, results,
    passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length
  }, null, 2))
  await browser.close()
  process.exitCode = results.some((item) => !item.ok) ? 2 : 0
}
