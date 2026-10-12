import express from 'express'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createStoryAgentRouter } from '../server/routes/storyagent.js'
let runs = 0; let stopped = false
const app = express(); app.use(express.json())
app.use('/api/storyagent', createStoryAgentRouter({ fetchImpl: async (_url, options) => {
  runs++
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('event: task.started\ndata: {}\n\n')); options.signal.addEventListener('abort', () => { stopped = true; controller.close() }, { once: true }) } }), { headers: { 'content-type': 'text/event-stream' } })
} }))
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.on('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}/api/storyagent`; const capability = 'a'.repeat(64)
const prefix = `pa_${createHash('sha256').update(capability).digest('hex').slice(0, 24)}_`
let checks = 0
const post = (url, body, token = capability) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pinax-agent-session': token }, body: JSON.stringify(body) })
try {
  assert.equal((await post('/policies', { mode: 'auto', bookId: 'book', sessionId: 'conversation', chapterId: 'chapter' }, '')).status, 403); checks++
  const grant = (await (await post('/policies', { mode: 'review', bookId: 'book', sessionId: 'conversation', chapterId: 'chapter', scope: 'current' })).json()).policy
  assert.equal(grant.mode, 'review'); checks++
  assert.equal((await post('/policies/check', grant, 'b'.repeat(64))).status, 403); checks++
  const body = { taskId: prefix + 'boundary', taskKind: 'assistant', bookId: 'book', mode: 'auto', requestId: 'boundary', resources: { domains: {} }, kernel: { blocks: [{ kind: 'assistant-policy', text: JSON.stringify(grant) }] } }
  assert.equal((await post('/v1/pinax/tasks', { ...body, bookId: 'other' })).status, 403); checks++
  assert.equal((await post('/v1/pinax/tasks', { ...body, kernel: { blocks: [] }, assistantPolicy: { mode: 'auto' } })).status, 403); checks++
  assert.equal(runs, 0); checks++
  const running = await post('/v1/pinax/tasks', body); assert.equal(running.status, 200); checks++
  const reader = running.body.getReader(); await reader.read()
  const next = (await (await post('/policies', { ...grant, mode: 'read', chapterId: 'chapter' })).json()).policy
  for (let i = 0; !stopped && i < 20; i++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(stopped, true); checks++
  assert.equal((await post('/policies/check', grant)).status, 403); checks++
  assert.equal((await post('/policies/check', next)).status, 200); checks++
  await reader.cancel()
  await post('/policies/revoke', next)
  assert.equal((await post('/policies/check', next)).status, 403); checks++
  console.log(`assistant-permission-boundary: ${checks} checks passed`)
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
