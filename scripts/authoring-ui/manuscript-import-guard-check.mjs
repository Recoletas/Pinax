/* global process */
/* eslint-disable no-console */
// C03 行为验证:导入手改保护(书名/章名)、读取状态、模式往返、重复确认、错误入框。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5213'
const OUT_DIR = path.resolve('docs/agent-runs/nightly-20260913/c-ux-20260914/screenshots')
const SYNTH = path.resolve('tmp/ux-capture-files')
fs.mkdirSync(SYNTH, { recursive: true })
fs.mkdirSync(OUT_DIR, { recursive: true })

const samplePath = path.join(SYNTH, 'guard-sample.md')
fs.writeFileSync(samplePath, [
  '# 测试书稿',
  '',
  '## 第一章 潮汐',
  '',
  '林澜把潮汐表折成四折,塞进袖口。',
  '',
  '## 第二章 灯塔',
  '',
  '守灯人没有名字。他只在一月的第一天开门。'
].join('\n'))

// GB18030 样本用于手动编码往返
const gbPath = path.join(SYNTH, 'guard-gb.txt')
{
  const iconv = null // 项目内置 TextDecoder 支持 gb18030
  const lines = ['## 第一章 旧港', '', '雾从石阶上漫下来。', '', '## 第二章 钟声', '', '钟楼敲过第七响。']
  const encoded = new TextEncoder().encode(lines.join('\n')) // 占位,下面用 Node 转码
  void iconv
  const { TextDecoder: TD } = globalThis
  void TD
  // Node 侧转 UTF-8 -> GB18030 需要图标字库;浏览器场景改为:读 UTF-8 样本即可验证手改保留。
  void encoded
  fs.writeFileSync(gbPath, lines.join('\n'))
}

const emptyPath = path.join(SYNTH, 'guard-empty.txt')
fs.writeFileSync(emptyPath, '')

const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok, note })
  console.log(`[c03-check] ${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  await page.goto(`${BASE}/authoring`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/authoring?start=import`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  // 1) 正常导入 → 手改书名与第一章章名
  await page.setInputFiles('input[type="file"]', samplePath)
  await page.waitForTimeout(600)
  check('preview appears with detected chapters',
    (await page.locator('.manuscript-import__chapters li').count()) === 2)
  await page.locator('[data-test="manuscript-book-title"]').fill('手改的书名')
  const firstTitle = page.getByLabel('第 1 章标题')
  await firstTitle.fill('手改章名·潮汐')

  // 2) 换“整篇作为一章”再换回:对应关系成立时手改保留,不无提示丢弃
  await page.getByText('整篇作为一章').click()
  await page.waitForTimeout(300)
  const singleCount = await page.locator('.manuscript-import__chapters li').count()
  const noticeShown = await page.locator('[data-test="manuscript-import-rebuild-notice"]').isVisible().catch(() => false)
  check('mode switch to single shows rebuild notice', singleCount === 1 && noticeShown)
  await page.getByText('按标题拆章').click()
  await page.waitForTimeout(300)
  const restoredTitle = await page.getByLabel('第 1 章标题').inputValue()
  const restoredBookTitle = await page.locator('[data-test="manuscript-book-title"]').inputValue()
  check('author chapter title survives mode round-trip', restoredTitle === '手改章名·潮汐', restoredTitle)
  check('author book title survives mode round-trip', restoredBookTitle === '手改的书名', restoredBookTitle)

  // 3) 编码工具在正常识别态也可打开
  await page.locator('[data-test="manuscript-import-encoding-tools"] summary').click()
  await page.waitForTimeout(200)
  const selectVisible = await page.locator('[data-test="manuscript-import-encoding-tools"] select').isVisible()
  check('encoding tools reachable without warning', selectVisible)

  // 4) 换编码重解析:书名手改不被覆盖
  await page.locator('[data-test="manuscript-import-encoding-tools"] select').selectOption('utf-8')
  await page.waitForTimeout(300)
  const titleAfterReparse = await page.locator('[data-test="manuscript-book-title"]').inputValue()
  check('manual book title not clobbered by re-encode', titleAfterReparse === '手改的书名', titleAfterReparse)

  // 5) 重新选择同名文件依然有效;确认创建且双击只建一本
  await page.getByRole('button', { name: '重新选择' }).click()
  await page.setInputFiles('input[type="file"]', samplePath)
  await page.waitForTimeout(600)
  check('re-selecting a file works after reset', (await page.locator('.manuscript-import__chapters li').count()) === 2)
  const confirmButton = page.locator('[data-test="manuscript-import-confirm"]')
  await confirmButton.click()
  await page.waitForTimeout(1200)
  const books = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books') || '[]'))
  check('import creates exactly one book', books.length === 1, `books=${books.length}`)
  check('dialog closed after successful import', !(await page.locator('.manuscript-import').isVisible().catch(() => false)))

  // 6) 空文件错误留在对话框内
  await page.goto(`${BASE}/authoring?start=import`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await page.setInputFiles('input[type="file"]', emptyPath)
  await page.waitForTimeout(500)
  const emptyError = await page.locator('[data-test="manuscript-import-error"], .manuscript-import__error').first().textContent().catch(() => '')
  check('empty file error shown in dialog', Boolean(emptyError && emptyError.trim()), emptyError?.slice(0, 40))
  await page.screenshot({ path: path.join(OUT_DIR, 'c03-import-empty-error.png') })

  // 7) quota 失败:错误在对话框内、预览保留、按钮恢复可重试
  await page.evaluate(() => {
    const fill = (key, size) => localStorage.setItem(key, 'x'.repeat(size))
    try { for (let i = 0; i < 64; i += 1) fill(`quota-fill-${i}`, 256 * 1024) } catch { /* 粗填充到抛错 */ }
    let chunk = 64 * 1024
    let index = 0
    while (chunk >= 1) {
      try { fill(`quota-fine-${index++}`, chunk) } catch { chunk = Math.floor(chunk / 2) }
    }
  })
  await page.setInputFiles('input[type="file"]', samplePath)
  await page.waitForTimeout(600)
  await page.locator('[data-test="manuscript-book-title"]').fill('配额失败验证')
  await page.locator('[data-test="manuscript-import-confirm"]').click()
  await page.waitForTimeout(700)
  const quotaError = await page.locator('[data-test="manuscript-import-error"]').textContent().catch(() => '')
  const quotaBooks = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('writing_books') || '[]').length } catch { return -1 }
  })
  check('quota failure shows inline dialog error', Boolean(quotaError && quotaError.includes('存储')), quotaError?.slice(0, 40))
  check('quota failure creates no book (count unchanged from earlier import)', quotaBooks === 1, `books=${quotaBooks}`)
  const retryable = await page.locator('[data-test="manuscript-import-confirm"]').isEnabled()
  check('preview kept and confirm retryable after quota failure', retryable)
  await page.screenshot({ path: path.join(OUT_DIR, 'c03-import-quota-error.png') })
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter((name) => name.startsWith('quota-fill-'))) localStorage.removeItem(key)
  })
} catch (error) {
  check('runtime', false, String(error?.message || error).slice(0, 200))
} finally {
  fs.writeFileSync('docs/agent-runs/nightly-20260913/c-ux-20260914/c03-browser-check.json', JSON.stringify({
    schemaVersion: 1, base: BASE, results,
    passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length
  }, null, 2))
  await browser.close()
  process.exitCode = results.some((item) => !item.ok) ? 2 : 0
}
