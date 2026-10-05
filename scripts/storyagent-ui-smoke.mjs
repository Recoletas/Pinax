import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const captureDirectory = process.env.PINAX_AGENT_UI_CAPTURES || await mkdtemp(join(tmpdir(), 'pinax-agent-ui-'))
await mkdir(captureDirectory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await page.addInitScript(() => localStorage.setItem('pinax-device-language', JSON.stringify({ uiLocale: 'zh-CN', assistantLanguage: '' })))
const errors = []
page.on('pageerror', error => errors.push(error.message))
const calls = []
let healthDelay = 0
let fail = false
await page.route('**/api/**', async route => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.pathname === '/api/storyagent/healthz') { if (healthDelay) await new Promise(resolve => setTimeout(resolve, healthDelay)); return route.fulfill({ json: { ok: true } }) }
  if (url.pathname.includes('/api/storyagent/v1/pinax/tasks') && request.method() === 'POST') {
    const body = request.postDataJSON() || {}
    calls.push({ path: url.pathname, body })
    if (url.pathname.endsWith('/cancel')) return route.fulfill({ json: { ok: true, stopped: true, status: 'cancelled', taskId: url.pathname.split('/').at(-2) } })
    const taskId = body.taskId || url.pathname.split('/').at(-2)
    const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    const data = [sse('task.started', { taskId, bookId: body.bookId, status: 'running' }), sse('reasoning.delta', { delta: '核对章节，保持场景衔接。' }),
      sse('tool.call', { schemaVersion: 1, type: 'tool.call', toolName: 'manuscript_search', action: 'search' }),
      sse('text.delta', { schemaVersion: 1, type: 'text.delta', content: '我先看看资料。候选文本。' }),
      fail ? sse('task.failed', { taskId, status: 'failed', error: { message: '模拟失败' } }) : sse('task.completed', { taskId, bookId: body.bookId, status: 'completed', finalText: calls.filter(c => !c.path.endsWith('/cancel')).length === 1 ? '林昭把钥匙放在桌角，潮声停了。' : '她推开门，屋里的灯仍亮着。' })]
    return route.fulfill({ contentType: 'text/event-stream', body: data.join('') })
  }
  return route.fulfill({ json: {} })
})
try {
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5174'}/authoring`, { waitUntil: 'networkidle' })
  await page.locator('.wall__pin-cta', { hasText: /新建书稿|建立第一本书/ }).click()
  await page.fill('.modal input[placeholder="输入书籍名称"]', '雾港旧事')
  await page.click('.modal-footer .btn-primary')
  const firstChapter = page.locator('.wall__pin-cta', { hasText: '建立第一章' }); if (await firstChapter.count()) await firstChapter.click()
  await page.waitForTimeout(500)
  await page.fill('input[aria-label="章节标题"]', '第一章 上元夜')
  const editor = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
  await editor.click()
  await page.keyboard.type('潮水漫过台阶，林昭站在岸边看灯。守卫在门口停下脚步。')
  await page.waitForTimeout(600)
  await page.locator('[data-test="assistant-workspace-entry"]').click()
  await page.locator('.authoring-knowledge__purpose summary').click()
  await page.getByRole('button', { name: '写作与修改', exact: false }).click()
  const input = page.getByRole('textbox', { name: '向助手提问' })
  await input.fill('@第一')
  await page.getByRole('listbox').waitFor()
  await input.press('Enter')
  assert.equal(calls.length, 0, '@ confirmation must not send a task')
  assert.match(await input.inputValue(), /@第一章/)
  await input.fill((await input.inputValue()) + ' 接着写一个动作。')
  await page.getByRole('button', { name: '发送问题', exact: true }).click()
  await page.locator('.authoring-knowledge__answer-text').filter({ hasText: '林昭把钥匙放在桌角，潮声停了。' }).waitFor()
  assert.equal(await page.getByText('我先看看资料。候选文本。', { exact: true }).count(), 0)
  await page.screenshot({ path: join(captureDirectory, 'assistant-desktop.png') })
  await page.getByRole('button', { name: '加入生成时的章节', exact: true }).click()
  await page.getByRole('button', { name: '已加入正文', exact: true }).waitFor()
  const book = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books')).find(b => b.title === '雾港旧事'))
  assert.ok(book.chapters[0].content.includes('林昭把钥匙'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.authoring-knowledge__answer-text').filter({ hasText: '林昭把钥匙放在桌角，潮声停了。' }).waitFor()
  await input.fill('接着推进，不重播刚才的动作。')
  await page.getByRole('button', { name: '发送问题', exact: true }).click()
  await page.locator('.authoring-knowledge__answer-text').filter({ hasText: '她推开门，屋里的灯仍亮着。' }).waitFor()
  assert.ok(calls.some(call => call.path.endsWith('/resume')))
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) { if (key === 'writing_books') throw new DOMException('Synthetic quota', 'QuotaExceededError'); return window.__originalSetItem.call(this, key, value) }
  })
  await page.getByRole('button', { name: '加入生成时的章节', exact: true }).click()
  await page.getByText('当前文稿未能保存，尚未采纳。', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '已加入正文', exact: true }).count(), 1)
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; delete window.__originalSetItem })
  await page.getByRole('button', { name: '加入生成时的章节', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.authoring-knowledge__agent-adopt')].filter(button => button.textContent.includes('已加入正文')).length === 2)
  await page.getByRole('button', { name: '查看问答历史', exact: true }).click()
  await page.getByRole('button', { name: '新对话', exact: true }).click()
  assert.equal(await page.locator('.authoring-knowledge__answer-text').count(), 0)
  await page.locator('.authoring-assistant-workspace__sessions button').filter({ hasText: '@第一章' }).click()
  assert.equal(await page.locator('.authoring-knowledge__answer-text').count(), 2)
  await page.evaluate(() => localStorage.setItem('app_theme', 'dark'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.authoring-knowledge__answer-text').filter({ hasText: '她推开门，屋里的灯仍亮着。' }).waitFor()
  await page.screenshot({ path: join(captureDirectory, 'assistant-dark.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(captureDirectory, 'assistant-mobile.png') })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page horizontal overflow')
  await page.setViewportSize({ width: 1440, height: 1000 })
  healthDelay = 2000
  const beforeCancel = calls.filter(call => !call.path.endsWith('/cancel')).length
  await input.fill('写一个短动作，稍后取消。')
  await page.getByRole('button', { name: '发送问题', exact: true }).click()
  await page.getByRole('button', { name: '停止查询', exact: true }).click()
  await page.waitForTimeout(2200)
  assert.equal(calls.filter(call => !call.path.endsWith('/cancel')).length, beforeCancel)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, tasks: calls.length, checks: ['mention', 'authoritative-final', 'adopt-save', 'refresh', 'real-resume-endpoint', 'desktop', 'dark', 'mobile', 'quota-failure-no-false-adoption', 'retry-adoption', 'new-conversation', 'restore-conversation', 'cancel-during-health', 'no-pageerrors'] }))
} catch (error) { await page.screenshot({ path: join(captureDirectory, 'browser-failure.png') }); console.error(error); console.log('URL', page.url()); console.log((await page.locator('body').innerText()).slice(-3000)); process.exitCode = 1 }
finally { await browser.close(); if (!process.env.PINAX_AGENT_UI_CAPTURES) await rm(captureDirectory, { recursive: true, force: true }) }
