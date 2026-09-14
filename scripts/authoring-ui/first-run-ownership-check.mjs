/* global process */
/* eslint-disable no-console */
// C01 行为验证:指引按书归属/关闭持久化/菜单重开/阶段真实推进(浏览器级)。
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://127.0.0.1:5213'
const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok, note })
  console.log(`[c01-check] ${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  // 1) 全新浏览器走欢迎页主动作 → 指引出现
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: '开始写作' }).click()
  const newBookDialog = page.getByRole('dialog', { name: '新建书稿' })
  await newBookDialog.waitFor()
  await newBookDialog.getByPlaceholder('输入书籍名称').fill('指引归属验证')
  await newBookDialog.locator('[data-test="new-book-confirm"]').click()
  await newBookDialog.waitFor({ state: 'hidden' })
  await page.waitForTimeout(1200)
  const stripVisible = await page.locator('[data-test="authoring-first-run-path"]').isVisible()
  check('first-run strip appears after welcome CTA', stripVisible)
  const step1 = await page.locator('[data-test="authoring-first-run-path"]').textContent()
  check('stage 1 is write', step1.includes('先写下眼前发生的一件事'), step1.slice(0, 40))

  // 2) 关闭 → 持久化,带 query 刷新不复发
  const bookId = await page.evaluate(() => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    return books[0]?.id || ''
  })
  await page.getByRole('button', { name: '关闭首次创作指引' }).click()
  await page.waitForTimeout(400)
  const stripGone = !(await page.locator('[data-test="authoring-first-run-path"]').isVisible().catch(() => false))
  check('dismiss hides strip', stripGone)
  const closed = await page.evaluate(() => JSON.parse(localStorage.getItem('authoring_first_run_v1') || '{}').closedBookIds)
  check('dismiss persisted per book', Array.isArray(closed) && closed.includes(bookId), `book=${bookId}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  const stripAfterReload = await page.locator('[data-test="authoring-first-run-path"]').isVisible().catch(() => false)
  check('closed book stays closed after reload', !stripAfterReload)

  // 3) 更多菜单 → 继续创作指引 → 按真实状态重开
  await page.getByRole('button', { name: /更多/ }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('menuitem', { name: '继续创作指引' }).click()
  await page.waitForTimeout(500)
  const stripReopened = await page.locator('[data-test="authoring-first-run-path"]').isVisible()
  check('menu reopens guidance', stripReopened)

  // 4) 正文出现 → 阶段真实推进到人物步
  await page.locator('.wall__main [contenteditable="true"]').first().click()
  await page.keyboard.type('雾从旧港的石阶上漫下来。')
  await page.waitForTimeout(2500)
  const stepText = await page.locator('[data-test="authoring-first-run-path"]').textContent()
  check('stage advances to characters after real text', stepText.includes('记住一个关键人物'), stepText.slice(0, 40))

  // 5) 再走一次 新建书 → 第二本有独立指引,关闭列表只含第一本
  await page.goto(`${BASE}/authoring?start=new&guide=first-run`, { waitUntil: 'domcontentloaded' })
  const secondDialog = page.getByRole('dialog', { name: '新建书稿' })
  await secondDialog.waitFor()
  await secondDialog.getByPlaceholder('输入书籍名称').fill('指引归属验证二')
  await secondDialog.locator('[data-test="new-book-confirm"]').click()
  await secondDialog.waitFor({ state: 'hidden' })
  await page.waitForTimeout(1500)
  const newBookStrip = await page.locator('[data-test="authoring-first-run-path"]').isVisible()
  const closedAfter = await page.evaluate(() => {
    const bookNow = (() => { try { return JSON.parse(localStorage.getItem('writing_books') || '[]').at(-1)?.id || '' } catch { return '' } })()
    return {
      current: bookNow,
      closed: JSON.parse(localStorage.getItem('authoring_first_run_v1') || '{}').closedBookIds || []
    }
  })
  check('second book gets its own guidance', newBookStrip)
  check('per-book isolation: current book not in another book closed list',
    !closedAfter.closed.includes(closedAfter.current), `closed=${JSON.stringify(closedAfter.closed)}`)
} catch (error) {
  check('runtime', false, String(error?.message || error).slice(0, 200))
} finally {
  const fs = await import('node:fs')
  fs.writeFileSync('docs/agent-runs/nightly-20260913/c-ux-20260914/c01-browser-check.json', JSON.stringify({
    schemaVersion: 1, base: BASE, results,
    passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length
  }, null, 2))
  await browser.close()
  process.exitCode = results.some((item) => !item.ok) ? 2 : 0
}
