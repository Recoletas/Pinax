/* global process */
/* eslint-disable no-console */
// C05 行为验证:拒写保留输入→导出真实文字→重试退场;刷新后恢复稿入口可达。
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
  console.log(`[c05-check] ${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await context.newPage()

try {
  // 1) 填满存储 → 打开书稿输入 → 自动保存失败 → 自救条出现,输入仍在
  await page.goto(`${BASE}/authoring`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme', 'light')
    const fill = (key, size) => localStorage.setItem(key, 'x'.repeat(size))
    try { for (let i = 0; i < 64; i += 1) fill(`quota-fill-${i}`, 256 * 1024) } catch { /* 粗填 */ }
    let chunk = 64 * 1024
    let index = 0
    while (chunk >= 1) {
      try { fill(`quota-fine-${index++}`, chunk) } catch { chunk = Math.floor(chunk / 2) }
    }
  }, fixtureStorage)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.locator('.wall__main [contenteditable="true"]').first().click()
  await page.keyboard.type('潮水每晚抹去一笔。')
  await page.waitForTimeout(2600)
  const rescue = page.locator('[data-test="save-rescue"]')
  check('rescue bar appears on save failure', await rescue.isVisible().catch(() => false))
  const rescueText = await rescue.textContent().catch(() => '')
  check('failure text keeps ownership with author', rescueText.includes('输入仍保留'), rescueText?.trim().slice(0, 30))
  const editorText = await page.locator('.wall__main [contenteditable="true"]').first().textContent()
  check('typed input still present after failed save', editorText.includes('潮水每晚抹去一笔'))
  await page.screenshot({ path: path.join(OUT_DIR, 'c05-save-rescue-error.png') })

  // 2) 导出当前正文:下载内容含未保存文字
  const downloadPromise = page.waitForEvent('download', { timeout: 8000 })
  await page.locator('[data-test="save-rescue-export"]').click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunkData of stream) chunks.push(chunkData)
  const exported = Buffer.concat(chunks).toString('utf8')
  check('export contains live unsaved text', exported.includes('潮水每晚抹去一笔'), exported.slice(0, 40))

  // 3) 释放空间 → 重试保存 → 成功退场
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('quota-fill-') || key.startsWith('quota-fine-')) localStorage.removeItem(key)
    }
  })
  await page.locator('[data-test="save-rescue-retry"]').click()
  await page.waitForTimeout(1400)
  check('retry saves and rescue exits', !(await rescue.isVisible().catch(() => false)))
  const persisted = await page.evaluate(() => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    return JSON.stringify(books).includes('潮水每晚抹去一笔')
  })
  check('text really persisted after retry', persisted)

  // 4) 刷新后恢复副本入口仍可找到:直接写入一份恢复稿再进章
  const seeded = await page.evaluate(async () => {
    try {
      const { saveWritingRecoveryDraft } = await import('/src/services/writing/writingRecovery.js')
      const { createWritingSnapshot } = await import('/shared/writingSnapshotContract.js')
      const schema = await import('/src/services/writing/writingDocumentSchema.js')
      const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
      const chapterId = books[0]?.chapters?.[0]?.id
      const document = schema.createWritingDocument('这是崩溃前留下的恢复稿正文。')
      const draft = createWritingSnapshot({
        chapterId,
        chapterTitle: '恢复稿验证',
        label: '未保存草稿',
        reason: 'crash-recovery',
        document,
        markdown: schema.getWritingDocumentMarkdown(document),
        annotations: []
      })
      if (!draft) return { ok: false, why: 'draft-null' }
      const result = saveWritingRecoveryDraft(draft)
      return { ok: result.ok, why: result.reason || '' }
    } catch (error) {
      return { ok: false, why: String(error).slice(0, 120) }
    }
  })
  check('recovery draft seeded for refresh test', seeded.ok, seeded.why)
  await page.waitForTimeout(800)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const recoveryRescue = page.locator('[data-test="save-rescue"]')
  check('recovery entry reachable after refresh', await recoveryRescue.isVisible().catch(() => false))
  const recoveryText = await recoveryRescue.textContent().catch(() => '')
  check('recovery variant is neutral, not alarm', recoveryText.includes('恢复稿') && !recoveryText.includes('保存失败'), recoveryText?.trim().slice(0, 30))
  await page.locator('[data-test="save-rescue-recovery"]').click()
  await page.waitForTimeout(900)
  const recoveryPanel = page.locator('.writing-recovery-entry')
  check('history panel shows recovery draft with time/preview', await recoveryPanel.isVisible() && (await recoveryPanel.textContent()).includes('未保存草稿'))
  await page.screenshot({ path: path.join(OUT_DIR, 'c05-recovery-panel.png') })
  await page.getByRole('button', { name: '丢弃' }).click()
  await page.waitForTimeout(600)
  const textAfterDiscard = await page.locator('.wall__main [contenteditable="true"]').first().textContent()
  check('discard leaves current manuscript unchanged', !textAfterDiscard.includes('崩溃前留下的恢复稿'))
} catch (error) {
  check('runtime', false, String(error?.message || error).slice(0, 200))
} finally {
  fs.writeFileSync('docs/agent-runs/nightly-20260913/c-ux-20260914/c05-browser-check.json', JSON.stringify({
    schemaVersion: 1, base: BASE, results,
    passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length
  }, null, 2))
  await browser.close()
  process.exitCode = results.some((item) => !item.ok) ? 2 : 0
}
