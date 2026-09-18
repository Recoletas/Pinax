// Exercise real browser security contexts, not a localhost-only UUID mock.
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { networkInterfaces } from 'node:os'
import { randomUUID } from '../shared/randomId.js'

const native = { randomUUID() { assert.equal(this, native); return 'native-id' } }
assert.equal(randomUUID(native), 'native-id')
const fallback = { getRandomValues(bytes) { assert.equal(this, fallback); bytes.fill(255); return bytes } }
assert.equal(randomUUID(fallback), 'ffffffff-ffff-4fff-bfff-ffffffffffff')
assert.throws(() => randomUUID({}), /Secure random/)

const httpHost = Object.values(networkInterfaces()).flat().find(address => address.family === 'IPv4' && !address.internal)?.address
assert.ok(httpHost, 'A non-loopback IPv4 address is required to verify insecure HTTP')
const server = await createServer({
  server: { host: '0.0.0.0', port: 5247, strictPort: true },
  plugins: [{ name: 'uuid-smoke-page', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (req.url !== '/') return next()
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><title>HTTP UUID regression</title>')
    })
  } }]
})
let browser
try {
  await server.listen()
  const port = server.httpServer.address().port
  browser = await chromium.launch({ args: ['--no-proxy-server'] })
  for (const [host, secure] of [[httpHost, false], ['127.0.0.1', true]]) {
    const context = await browser.newContext()
    const origin = `http://${host}:${port}`
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      return route.continue()
    })
    const page = await context.newPage()
    page.on('requestfailed', request => console.error(request.url(), request.failure()?.errorText))
    page.on('response', response => { if (response.status() >= 400) console.error(response.status(), response.url()) })
    await page.goto(origin)
    const result = await page.evaluate(async () => {
      const { randomUUID } = await import('/shared/randomId.js')
      const { createTaskRequest, validateTaskRequest } = await import('/shared/agentTaskRequestContract.js')
      const { ledgerId } = await import('/src/services/memory/ledger/ledgerContract.js')
      const { createAgentRequestId } = await import('/src/services/agents/agentRequestTrace.js')
      const { CollaborationProtocolClient } = await import('/src/services/collaboration/CollaborationProtocolClient.js')
      const history = await import('/src/services/memory/memoryHistoryStore.js')
      const task = createTaskRequest({ taskId: 'narrative', project: { id: 'http-book', revision: '1' }, target: { type: 'scene', id: 'scene', revision: '1' }, intent: { text: '继续' }, surface: 'experience' })
      const client = new CollaborationProtocolClient({ transport: { on: () => () => {} } })
      const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      const ids = [task.requestId, ledgerId('fact').slice(5), createAgentRequestId(), client.commandId()]
      for (let i = 0; i < 1000; i++) ids.push(randomUUID())
      const item = { id: 'http-memory', scope: 'project', scopeId: 'http-book', status: 'active', content: '港口有灯' }
      const created = history.commitMemorySnapshot([item])
      await history.flushMemoryHistory()
      const updated = history.commitMemorySnapshot([{ ...item, content: '港口的灯已熄灭' }])
      await history.flushMemoryHistory()
      const records = await history.readMemoryHistory({ candidateId: item.id })
      return { secure: isSecureContext, native: typeof crypto.randomUUID, valid: validateTaskRequest(task).valid,
        idsValid: ids.every(id => pattern.test(id)), unique: new Set(ids).size === ids.length,
        created, updated, revisions: records.length, historyIdsValid: records.every(row => pattern.test(row.id)) }
    })
    assert.equal(result.secure, secure)
    assert.equal(result.native, secure ? 'function' : 'undefined')
    for (const key of ['valid', 'idsValid', 'unique', 'created', 'updated', 'historyIdsValid']) assert.equal(result[key], true, `${host}: ${key}`)
    assert.equal(result.revisions, 2)
    await page.reload()
    assert.equal(await page.evaluate(async () => {
      const { readMemoryHistory } = await import('/src/services/memory/memoryHistoryStore.js')
      return (await readMemoryHistory({ candidateId: 'http-memory' })).length
    }), 2)
    console.log(`PASS ${host}: secure=${secure}, native=${result.native}, request/ledger/trace/command IDs and durable memory revisions`)
    await context.close()
  }
} finally {
  await browser?.close()
  await server.close()
}
