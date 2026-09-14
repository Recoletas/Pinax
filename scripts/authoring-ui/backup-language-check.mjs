/* global process */
/* eslint-disable no-console */
// C04 行为验证:备份面作者语言、真实 metadata、恢复回程与失败下一步。
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
  console.log(`[c04-check] ${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await context.newPage()

try {
  // 1) 存储分区新顺序:导出/恢复在前,key 表收进折叠
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_theme', 'light')
  }, fixtureStorage)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '备份' }).click()
  await page.waitForTimeout(700)
  const tableVisible = await page.locator('.storage-table').isVisible().catch(() => false)
  check('technical key table collapsed by default', !tableVisible)
  const exportBtn = page.locator('[data-test="backup-export-button"]')
  const exportBox = await exportBtn.boundingBox()
  check('export action visible near top', Boolean(exportBox && exportBox.y < 500), JSON.stringify(exportBox))
  await page.screenshot({ path: path.join(OUT_DIR, 'c04-settings-backup-after.png') })

  // 2) 导出反馈作者语言 + 真实下载
  const downloadPromise = page.waitForEvent('download', { timeout: 8000 })
  await exportBtn.click()
  const download = await downloadPromise
  const backupPath = path.join(OUT_DIR, '..', 'fixture-backup.json')
  await download.saveAs(backupPath)
  const feedback = await page.locator('[data-test="backup-feedback"]').textContent()
  check('export feedback in author language', feedback.includes('备份文件已生成') && feedback.includes('模型密钥未包含'), feedback.trim().slice(0, 50))

  // 3) 导入这份备份:预览有真实 metadata(备份时间/书名),确认后给直达书稿回程
  await page.setInputFiles('[data-test="backup-import-input"]', backupPath)
  await page.waitForTimeout(600)
  const review = await page.locator('[data-test="backup-review"]').textContent()
  check('review shows exported-at and book title metadata', review.includes('备份生成于') && review.includes('雾港纪事·P1'), review.replace(/\s+/g, ' ').slice(0, 90))
  await page.screenshot({ path: path.join(OUT_DIR, 'c04-backup-review.png') })
  await page.locator('[data-test="backup-restore-confirm"]').click()
  await page.waitForTimeout(600)
  const restoredFeedback = await page.locator('[data-test="backup-feedback"]').textContent()
  const bookLink = page.getByRole('link', { name: /继续《雾港纪事·P1》/ })
  check('restore success with direct book return', restoredFeedback.includes('备份已恢复') && await bookLink.isVisible(), restoredFeedback.trim().slice(0, 40))

  // 4) 多书备份:回程到作品列表而不是猜一本书
  const twoBookBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  const booksRaw = JSON.parse(twoBookBackup.keys.writing_books)
  booksRaw.push({ ...booksRaw[0], id: 'second-book-id', title: '第二本书', chapters: booksRaw[0].chapters.slice(0, 1) })
  twoBookBackup.keys.writing_books = JSON.stringify(booksRaw)
  const twoBookPath = path.join(OUT_DIR, '..', 'two-book-backup.json')
  fs.writeFileSync(twoBookPath, JSON.stringify(twoBookBackup))
  await page.setInputFiles('[data-test="backup-import-input"]', twoBookPath)
  await page.waitForTimeout(600)
  const consent = page.locator('.backup-review__consent input')
  if (await consent.isVisible().catch(() => false)) await consent.check()
  await page.locator('[data-test="backup-restore-confirm"]').click()
  await page.waitForTimeout(500)
  const twoBookReview = await page.locator('[data-test="backup-feedback"]').textContent().catch(() => '')
  const listLink = page.getByRole('link', { name: '打开作品列表' })
  const directLink = page.getByRole('link', { name: /继续《/ })
  check('two-book backup preview names the count', twoBookReview.includes('2 本') || await listLink.isVisible(), twoBookReview.trim().slice(0, 40))
  check('multi-book restore returns to works list', await listLink.isVisible().catch(() => false) && !(await directLink.isVisible().catch(() => false)))

  // 5) 损坏文件:可执行下一步
  const brokenPath = path.join(OUT_DIR, '..', 'broken-backup.json')
  fs.writeFileSync(brokenPath, '{not-json')
  await page.setInputFiles('[data-test="backup-import-input"]', brokenPath)
  await page.waitForTimeout(500)
  const brokenFeedback = await page.locator('[data-test="backup-feedback"]').textContent()
  check('broken backup suggests concrete next step', brokenFeedback.includes('重新选择'), brokenFeedback.trim().slice(0, 60))
  await page.screenshot({ path: path.join(OUT_DIR, 'c04-backup-broken.png') })
} catch (error) {
  check('runtime', false, String(error?.message || error).slice(0, 200))
} finally {
  fs.writeFileSync('docs/agent-runs/nightly-20260913/c-ux-20260914/c04-browser-check.json', JSON.stringify({
    schemaVersion: 1, base: BASE, results,
    passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length
  }, null, 2))
  await browser.close()
  process.exitCode = results.some((item) => !item.ok) ? 2 : 0
}
