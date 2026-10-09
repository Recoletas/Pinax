import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-runtime-mem-tasks-'))
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', chunk => { raw += chunk }); req.on('end', () => {
    JSON.parse(raw)
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const frame = (delta, finish_reason) => `data: ${JSON.stringify({ id: 'synthetic', object: 'chat.completion.chunk', created: 1, model: 'synthetic', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    res.write(frame({ role: 'assistant', content: '合成任务完成。' }, null))
    setTimeout(() => { res.write(frame({}, 'stop')); res.end('data: [DONE]\n\n') }, 150)
  })
})
mock.listen(0, '127.0.0.1'); await new Promise(resolve => mock.on('listening', resolve))
const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await new Promise(resolve => reservation.on('listening', resolve)); const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve))
const artifact = process.env.PINAX_MEMORY_RUNTIME || '.runtime/storyagent'
const child = spawn(process.execPath, ['--max-old-space-size=128', path.resolve(artifact, 'dist/pinax/serve.js')], { env: { ...process.env, PINAX_ADAPTER_PROVIDER: 'synthetic', PINAX_ADAPTER_MODEL: 'synthetic', PINAX_ADAPTER_API: 'openai-completions', PINAX_ADAPTER_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1`, MINIFLOW_AGENT_KEY: 'synthetic-test-key', PINAX_ADAPTER_PORT: String(port), PINAX_ADAPTER_HOST: '127.0.0.1', PINAX_ADAPTER_TASKS_DIR: temporary, PINAX_ADAPTER_CONFIG: path.join(temporary, 'absent.json') }, stdio: 'ignore' })
const rss = pid => { try { return Number(fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) / 1024 } catch { return 0 } }
let peakRuntime = 0; let peakCombined = 0
const timer = setInterval(() => { const runtime = rss(child.pid); peakRuntime = Math.max(peakRuntime, runtime); peakCombined = Math.max(peakCombined, runtime + rss(process.pid)) }, 25)
try {
  const endpoint = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 100; i++) { try { ready = (await fetch(`${endpoint}/healthz`)).ok } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 100)) }
  assert.ok(ready, 'Cold start on constrained heap')
  const idleRuntimeMiB = rss(child.pid)
  const resources = { revision: 'memory-test', domains: { manuscript: Array.from({ length: 10 }, (_, i) => ({ id: `chapter-${i}`, title: `合成章节${i}`, text: '合成文字。'.repeat(1600) })) } }
  await Promise.all(['a', 'b'].map(async id => {
    const response = await fetch(`${endpoint}/v1/pinax/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: id, taskId: `memory-${id}`, taskKind: 'assistant', bookId: 'synthetic', mode: 'auto', intent: '简短回答。', kernel: { blocks: [] }, resources }) })
    assert.equal(response.status, 200); const result = await response.text(); assert.ok(result.includes('event: task.completed'), 'Concurrent synthetic request completed')
  }))
  console.log(JSON.stringify({ hostMemoryMiB: Math.round(os.totalmem() / 1024 / 1024), node: process.version, concurrentTasks: 2, heapLimitMiB: 128, idleRuntimeMiB: Math.round(idleRuntimeMiB), peakRuntimeMiB: Math.round(peakRuntime), peakCombinedTestProcessesMiB: Math.round(peakCombined), evidence: 'Cold start and two synthetic provider tasks; real model quality verified separately' }))
} finally {
  clearInterval(timer); child.kill('SIGTERM'); await new Promise(resolve => { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve() }, 2000) })
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)); fs.rmSync(temporary, { recursive: true, force: true })
}
