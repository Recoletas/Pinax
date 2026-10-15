import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import express from 'express'
import { createStoryAgentRouter } from '../server/routes/storyagent.js'
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-pr6-real-agent-'))
const reserve = createServer(); reserve.listen(0, '127.0.0.1'); await new Promise(resolve => reserve.on('listening', resolve)); const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve))
const envPath = process.env.PINAX_SMOKE_ENV_FILE
if (!envPath) throw new Error('Set PINAX_SMOKE_ENV_FILE to the authorized server environment file')
const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(line => /^MINIMAX_API_KEY=/.test(line))
const key = line?.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '')
assert.ok(key, 'Server MiniMax key is available')
const runtime = spawn(process.execPath, ['.runtime/storyagent/dist/pinax/serve.js'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, MINIFLOW_AGENT_KEY: key, PINAX_ADAPTER_PORT: String(port), PINAX_ADAPTER_HOST: '127.0.0.1', PINAX_ADAPTER_PROVIDER: 'minimax', PINAX_ADAPTER_MODEL: 'MiniMax-M2.7', PINAX_ADAPTER_API: 'anthropic-messages', PINAX_ADAPTER_BASE_URL: 'https://api.minimaxi.com/anthropic', PINAX_ADAPTER_TASKS_DIR: temporary, PINAX_ADAPTER_CONFIG: path.join(temporary, 'absent.json') }, stdio: ['ignore', 'ignore', 'ignore'] })
let server; const samples = []
try {
  const endpoint = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 60; i++) { try { ready = (await fetch(`${endpoint}/healthz`)).ok } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 100)) }
  assert.ok(ready, 'Packaged runtime cold start')
  const app = express(); app.use(express.json({ limit: '2mb' })); app.use('/api/storyagent', createStoryAgentRouter({ endpoint }))
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/storyagent`
  const token = 'a'.repeat(64)
  const { createHash } = await import('node:crypto')
  const prefix = `pa_${createHash('sha256').update(token).digest('hex').slice(0, 24)}_`
  const headers = { 'content-type': 'application/json', 'x-pinax-agent-session': token }
  const resources = { revision: 'synthetic-v1', domains: {
    manuscript: [{ id: 'chapter-a', title: '第一章', text: '甲站在码头，收到了乙递来的钥匙。甲推开门。', sourceRefs: ['chapter:chapter-a'] }],
    world_lookup: [{ id: 'person-a', title: '甲', type: 'character', text: '甲是一名谨慎的船员。', sourceRefs: ['worldbook:person-a'] }],
    outline: [{ id: 'outline-a', title: '相遇', text: '甲与乙在码头见面。' }]
  } }
  const run = async (suffix, intent) => {
    const taskId = prefix + suffix
    const request = { requestId: suffix, taskId, bookId: 'synthetic-book', taskKind: 'assistant', mode: 'auto', intent, formatInstructions: '调用要求的工具，最后简短说明依据。用户要求修改时调用 submit_edit_proposals，不直接修改文件。', kernel: { revision: 'v1', blocks: [] }, resources }
    const started = Date.now()
    const response = await fetch(`${base}/v1/pinax/tasks`, { method: 'POST', headers, body: JSON.stringify(request), signal: AbortSignal.timeout(120000) })
    assert.equal(response.status, 200)
    const raw = await response.text()
    const frames = raw.split(/\r?\n\r?\n/).filter(Boolean).map(frame => {
      const event = frame.match(/^event: (.*)$/m)?.[1]
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
      try { return { event, data: JSON.parse(data) } } catch { return null }
    }).filter(Boolean)
    const final = frames.find(frame => frame.event === 'task.completed')
    const failed = frames.find(frame => frame.event === 'task.failed')
    assert.ok(final, `Real task completed; failure: ${failed?.data?.error?.message || 'missing terminal'}`)
    const tools = frames.filter(frame => frame.event === 'tool.result').map(frame => frame.data)
    samples.push({ suffix, elapsedMs: Date.now() - started, tools: tools.map(tool => ({ name: tool.toolName, result: tool.result })), final: final.data.finalText || '' })
    console.log(JSON.stringify({ task: suffix, elapsedMs: Date.now() - started, toolNames: tools.map(tool => tool.toolName), completed: true }))
    return { tools, frames }
  }
  const lookup = await run('lookup', '请必须先用 manuscript_search 搜索钥匙，再回答谁递来了钥匙，并说出章节。')
  assert.ok(lookup.tools.some(tool => tool.toolName === 'manuscript_search'))
  const edits = await run('edit', '请先读 chapter-a 和 person-a，调用 submit_edit_proposals 一次提交两处修改：chapter-a 的 content 把“甲推开门。”替换为“甲先敲了敲门。”；person-a 的 content 追加“他习惯先确认屋内是否有人。”。不得创建新目标。')
  const submitted = edits.tools.find(tool => tool.toolName === 'submit_edit_proposals')
  assert.ok(submitted, 'Model uses real proposal tool')
  const proposal = JSON.parse(submitted.result.content.filter(block => block.type === 'text').map(block => block.text).join(''))
  assert.ok(proposal.ok && proposal.changes.length === 2)
  // Start a real task and stop it through the guarded cancellation endpoint.
  const taskId = prefix + 'stop'
  const running = await fetch(`${base}/v1/pinax/tasks`, { method: 'POST', headers, body: JSON.stringify({ requestId: 'stop', taskId, bookId: 'synthetic-book', taskKind: 'assistant', mode: 'auto', intent: '检索人物和章节，再写一段很长的故事。', kernel: { blocks: [] }, resources }) })
  assert.equal(running.status, 200)
  const reader = running.body.getReader(); await reader.read()
  const stopped = await (await fetch(`${base}/v1/pinax/tasks/${taskId}/cancel`, { method: 'POST', headers })).json()
  assert.ok(stopped.stopped && ['cancelled', 'completed'].includes(stopped.status))
  await reader.cancel()
  const status = fs.readFileSync(`/proc/${runtime.pid}/status`, 'utf8')
  const rssKiB = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0)
  console.log(JSON.stringify({ stopped: stopped.status, runtimeRssMiB: Math.round(rssKiB / 1024), note: 'Measured RSS; no cgroup 2GB limit asserted' }))
  fs.writeFileSync('/tmp/pinax-pr6-real-agent-results.json', JSON.stringify(samples, null, 2))
  console.log('real-agent: cold start / lookup / two-target proposal / cancellation passed')
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  runtime.kill('SIGTERM'); await new Promise(resolve => { runtime.once('exit', resolve); setTimeout(() => { runtime.kill('SIGKILL'); resolve() }, 2000) })
  fs.rmSync(temporary, { recursive: true, force: true })
}
