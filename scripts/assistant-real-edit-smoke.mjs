// Uses only a synthetic browser book. Never operates the user's running services or task journals.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import express from 'express'
import { chromium } from 'playwright'
import { createStoryAgentRouter } from '../server/routes/storyagent.js'
const artifact = process.env.PINAX_SMOKE_RUNTIME || '/tmp/pinax-assistant-runtime-final'
const pid = process.env.PINAX_SMOKE_RUNTIME_PID
if (!pid || !/^\d+$/.test(pid)) throw new Error('Set PINAX_SMOKE_RUNTIME_PID to the authorized runtime process; no credentials are printed.')
const env = Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
assert.ok(env.MINIFLOW_AGENT_KEY || env.ZAI_API_KEY)
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-real-edit-'))
const reservation = createServer().listen(0, '127.0.0.1'); await new Promise(resolve => reservation.on('listening', resolve)); const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve))
const runtime = spawn(process.execPath, [path.resolve(artifact, 'dist/pinax/serve.js')], { env: { ...env, PINAX_ADAPTER_TASKS_DIR: temporary, PINAX_ADAPTER_PORT: String(port), PINAX_ADAPTER_HOST: '127.0.0.1', PINAX_ADAPTER_CONFIG: path.join(temporary, 'absent.json') }, stdio: 'ignore' })
let browser; let server
const tools = []; let checks = 0
try {
  const endpoint = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 80; i++) { try { ready = (await (await fetch(endpoint + '/healthz')).json()).assistantProtocolVersion === 2 } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 100)) }
  assert.ok(ready); checks++
  const app = express(); app.use(express.json({ limit: '2mb' })); app.use('/api/storyagent', createStoryAgentRouter({ endpoint })); app.use('/api', (_req, res) => res.json({ ok: true, projects: [], data: [] })); app.use(express.static('dist')); app.use((_req, res) => res.sendFile(path.resolve('dist/index.html')))
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve))
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('writing_books', JSON.stringify([{ id: 'real-edit-book', title: '合成验收书', worldbookId: 'real-edit-world', chapters: [{ id: 'real-edit-chapter', title: '第一章', content: '甲是码头的守夜人。夜里，乙交给他一把生锈的钥匙，说仓库里有人留下了一个箱子。甲推开门。' }] }]))
    localStorage.setItem('worldbook_real-edit-world', JSON.stringify({ id: 'real-edit-world', name: '合成资料', entries: [{ id: 'real-edit-person', name: '甲', type: 'character', content: '甲是一个谨慎的守夜人，不会贸然冒险。' }], sourceDocuments: [] }))
    localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'real-edit-world', name: '合成资料' }]))
    localStorage.setItem('pinax-device-language', JSON.stringify({ uiLocale: 'zh-CN', assistantLanguage: '' }))
  })
  await page.goto(`http://127.0.0.1:${server.address().port}/authoring?bookId=real-edit-book&chapterId=real-edit-chapter&view=assistant`)
  const input = page.locator('textarea[aria-label="向助手提问"]:visible').first()
  await input.waitFor({ timeout: 20000 })
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content)
  const send = async text => {
    await input.fill(text); await input.press('Enter')
    await page.getByRole('button', { name: '停止查询', exact: true }).waitFor({ timeout: 10000 })
    await page.getByRole('button', { name: '停止查询', exact: true }).waitFor({ state: 'hidden', timeout: 180000 })
    const alert = await page.locator('.authoring-knowledge__error:visible').allTextContents()
    if (alert.length) console.log('Delivery diagnostics', await page.evaluate(() => JSON.parse(localStorage.getItem('authoring_assistant_conversation:real-edit-book')).messages.at(-1)?.tools))
    assert.deepEqual(alert, [], 'Natural request completed without a delivery error'); checks++; console.log('Natural request delivered:', text)
  }
  await send('这个开头后面可以怎么写？给我两个发展方向，先讨论，不改正文。')
  assert.equal(await page.getByRole('button', { name: '查看修改建议', exact: true }).count(), 0); checks++
  const discussion = await page.locator('.authoring-knowledge__answer-text:visible').last().innerText()
  assert.ok(discussion.length > 120, 'Full discussion survives completion, rather than being replaced by a receipt'); checks++
  await send('你来试试第1条线，接着当前正文写三段。')
  await page.locator('.assistant-inline-edit:visible').first().waitFor(); checks++
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content), before); checks++
  await page.locator('.assistant-inline-edit:visible').first().waitFor(); checks++
  const review = page.locator('[data-test="assistant-edit-review"]:visible').first()
  await review.getByRole('button', { name: '采用这组修改', exact: true }).click()
  await page.waitForFunction(original => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content !== original, before); checks++
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content)
  assert.ok(after.startsWith(before)); checks++
  await review.getByRole('button', { name: '撤销这次修改', exact: true }).click()
  await page.waitForFunction(original => JSON.parse(localStorage.getItem('writing_books'))[0].chapters[0].content.trimEnd() === original.trimEnd(), before); checks++
  assert.deepEqual(errors, []); checks++
  tools.push(...await page.evaluate(() => JSON.parse(localStorage.getItem('authoring_assistant_conversation:real-edit-book')).messages.flatMap(message => (message.toolResults || []).map(tool => tool.toolName))))
  assert.ok(tools.includes('submit_edit_proposals')); assert.ok(tools.includes('complete_assistant_task')); checks += 2
  console.log(JSON.stringify({ checks, naturalConversation: true, manuscriptChangedOnlyAfterAcceptance: true, undoRestored: true, tools }))
} finally {
  await browser?.close()
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  runtime.kill(); await new Promise(resolve => { runtime.once('exit', resolve); setTimeout(() => { runtime.kill('SIGKILL'); resolve() }, 1500).unref() })
  if (process.env.PINAX_SMOKE_DIAGNOSTICS === '1') for (const file of fs.readdirSync(temporary).filter(name => name.endsWith('.jsonl'))) {
    const records = fs.readFileSync(path.join(temporary, file), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    const record = records.at(-1)
    console.log('Diagnostics', JSON.stringify({ status: record.status, steps: record.steps, calls: record.toolCalls, messages: (record.messages || []).slice(-18).map(message => ({ role: message.role, stopReason: message.stopReason, tool: message.toolName, failed: message.isError, calls: (Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'toolCall').map(block => ({ name: block.name, keys: Object.keys(block.arguments || {}) })), error: message.role === 'toolResult' ? (() => { const text = String(message.content?.[0]?.text || ''); try { return JSON.parse(text).error } catch { return message.isError ? text.split('\n')[0].slice(0, 180) : undefined } })() : undefined })) }))
  }
  fs.rmSync(temporary, { recursive: true, force: true })
}
