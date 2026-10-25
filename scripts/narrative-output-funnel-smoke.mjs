import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { pathToFileURL } from 'node:url'

const directory = process.env.PINAX_RUNTIME_OUTPUT
if (!directory) throw new Error('Set PINAX_RUNTIME_OUTPUT to an isolated candidate runtime.')
const { runComplete, runCompleteStream } = await import(pathToFileURL(path.join(directory, 'dist/pinax/modelFunnel.js')))
const { startServer } = await import(pathToFileURL(path.join(directory, 'dist/pinax/server.js')))
const received = []
const prose = '第四节：他翻开另一本底本，'
const tool = { name: 'web_search', description: '查找参考', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }
let gate = null
let firstChunkAssertions = 0
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
const provider = http.createServer(async (req, res) => {
  let source = ''
  for await (const chunk of req) source += chunk
  const body = JSON.parse(source)
  if (req.url === '/v1/pinax/complete/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ content: prose })}\n\ndata: [DONE]\n\n`)
    return
  }
  received.push(body)
  const marker = JSON.stringify(body.messages)
  const tools = marker.includes('[tools')
  const dropped = marker.includes('[drop]') || marker.includes('[tools-drop]')
  const blocked = marker.includes('[gate]') || marker.includes('[cancel]') || marker.includes('[tools-cancel]')
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  let finish, startTool
  if (req.url.includes('/messages')) {
    const send = (type, payload) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`)
    send('message_start', { message: { id: 'msg-local', type: 'message', role: 'assistant', model: body.model,
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 0 } } })
    send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: prose } })
    send('content_block_stop', { index: 0 })
    startTool = () => {
        send('content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'call_lookup', name: tool.name, input: {} } })
        send('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"参考"}' } })
        send('content_block_stop', { index: 1 })
    }
    finish = () => {
      send('message_delta', { delta: { stop_reason: tools ? 'tool_use' : 'max_tokens', stop_sequence: null }, usage: { output_tokens: 20 } })
      send('message_stop', {})
      res.end()
    }
  } else {
    const send = (delta, reason = null, usage) => res.write(`data: ${JSON.stringify({ id: 'chat-local', object: 'chat.completion.chunk',
      created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: reason }], ...(usage ? { usage } : {}) })}\n\n`)
    send({ role: 'assistant', content: prose })
    startTool = () => send({ tool_calls: [{ index: 0, id: 'call_lookup', type: 'function', function: { name: tool.name, arguments: '{"query":"参考"}' } }] })
    finish = () => {
      send({}, tools ? 'tool_calls' : 'length', { prompt_tokens: 12, completion_tokens: 20, total_tokens: 32 })
      res.end('data: [DONE]\n\n')
    }
  }
  if (tools) startTool()
  if (dropped) { res.end(); return }
  if (blocked) {
    const held = { finished: false, release() { if (held.finished || res.destroyed) return; held.finished = true; finish() } }
    gate = held
    return
  }
  finish()
})
await listen(provider)
const cfgFor = api => ({ provider: 'funnel-local', model: 'local-model', api, thinking: 'medium',
  baseUrl: `http://127.0.0.1:${provider.address().port}/v1`, apiKey: 'local-fixture' })
const requestFor = (marker = '', extras = {}) => ({ messages: [{ role: 'user', content: `按原要求完成正文。${marker}` }], ...extras })
const observeEarly = text => {
  assert.equal(text, prose)
  assert.ok(gate && !gate.finished, 'first text must reach the caller while the provider is waiting to finish')
  firstChunkAssertions++
  gate.release()
}
let runtime
let edge
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pinax-output-funnel-'))
try {
  for (const api of ['openai-completions', 'anthropic-messages']) {
    const cfg = cfgFor(api)
    for (const streaming of [false, true]) {
      for (const maxTokens of [undefined, 1024]) {
        const request = requestFor('', maxTokens ? { maxTokens } : {})
        const chunks = []
        const result = streaming ? await runCompleteStream(cfg, request, text => chunks.push(text)) : await runComplete(cfg, request)
        assert.equal(result.finishReason, 'length', 'a length stop must not become a successful normal stop')
        assert.equal(result.content, prose)
        if (streaming) assert.equal(chunks.join(''), prose)
        const sent = received.at(-1)
        const limit = sent.max_tokens ?? sent.max_completion_tokens
        if (maxTokens) assert.equal(limit, maxTokens)
        else assert.ok(limit > 4096, `model metadata must replace the legacy 4096 fallback (${api})`)
      }
    }
    const request = requestFor('[tools]', { tools: [tool], toolChoice: { type: 'function', function: { name: tool.name } },
      temperature: 0.37, thinking: 'high', responseFormat: 'json_object', maxTokens: 12000 })
    const complete = await runComplete(cfg, request)
    const payload = received.at(-1)
    const streamed = await runCompleteStream(cfg, request, () => {})
    assert.deepEqual(received.at(-1), payload, 'complete and native stream must send identical thinking, toolChoice and sampling options')
    assert.deepEqual(streamed, complete)
    assert.deepEqual(streamed.toolCalls, [{ id: 'call_lookup', name: tool.name, arguments: { query: '参考' } }])
    assert.equal(streamed.finishReason, 'toolUse')
    assert.deepEqual(streamed.usage, { inputTokens: 12, outputTokens: 20, totalTokens: 32 })
    await runCompleteStream(cfg, requestFor('[gate]'), observeEarly)
    await assert.rejects(runCompleteStream(cfg, requestFor('[drop]'), () => {}), error => error.generatedText === prose)
    const controller = new AbortController()
    await assert.rejects(runCompleteStream(cfg, requestFor('[cancel]'), () => controller.abort(), controller.signal), error => error.generatedText === prose)
    for (const marker of ['[tools-drop]', '[tools-cancel]']) {
      const events = []
      const toolController = new AbortController()
      await assert.rejects(runCompleteStream(cfg, requestFor(marker, { tools: [tool] }), () => {}, toolController.signal, event => {
        events.push(event)
        if (marker === '[tools-cancel]') toolController.abort()
      }), error => error.generatedText === '')
      assert.equal(events[0]?.type, 'tool.input.delta', 'tool preface must be identified before an interrupted tool round finishes')
    }
  }
  const adaptive = { ...cfgFor('anthropic-messages'), model: 'MiniMax-M3.1flash' }
  await runComplete(adaptive, requestFor())
  const adaptivePayload = received.at(-1)
  await runCompleteStream(adaptive, requestFor(), () => {})
  assert.deepEqual(received.at(-1), adaptivePayload)
  assert.deepEqual(adaptivePayload.thinking, { type: 'adaptive' }, 'native stream must retain the request model transport adapter')

  runtime = startServer({ ...cfgFor('openai-completions'), host: '127.0.0.1', port: 0, tasksDir: temporary })
  await new Promise(resolve => runtime.once('listening', resolve))
  process.env.PINAX_ADAPTER_ENDPOINT = `http://127.0.0.1:${runtime.address().port}`
  const { runKitFunnelProviderTurn } = await import('../server/services/kitModelGateway.js')
  const { createGenerationAgentStepStreamHandler } = await import('../server/routes/generationAgent.js')
  const app = express()
  app.use(express.json())
  app.post('/stream', createGenerationAgentStepStreamHandler({ runner: runKitFunnelProviderTurn, resolveRouting: async () => ({ mode: 'kernel' }) }))
  edge = http.createServer(app)
  await listen(edge)
  const integrationRequest = marker => ({ schemaVersion: 1, requestId: `funnel-${marker.replace(/\W/g, '')}`,
    provider: { id: 'openai', baseUrl: cfgFor('openai-completions').baseUrl, apiKey: 'fixture', model: 'local-model' },
    messages: requestFor(marker).messages,
    tools: [{ ...tool, inputSchema: tool.parameters }], options: { toolChoice: 'auto', streamEvents: true } })
  const readEvents = async marker => {
    const response = await fetch(`http://127.0.0.1:${edge.address().port}/stream`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(integrationRequest(marker))
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-accel-buffering'), 'no')
    const decoder = new TextDecoder()
    let buffer = ''
    const events = []
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      let boundary
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
        const data = frame.split('\n').find(line => line.startsWith('data:'))
        if (!data) continue
        const event = JSON.parse(data.slice(5))
        events.push(event)
        if (marker.includes('[gate]') && event.type === 'text.delta') observeEarly(event.content)
      }
    }
    return events
  }
  const proseEvents = await readEvents('[gate]')
  assert.equal(proseEvents.filter(event => event.type === 'text.delta').map(event => event.content).join(''), prose, 'Express must not repeat the complete text after incremental delivery')
  assert.equal(proseEvents.at(-1).type, 'step.finish')
  assert.equal(proseEvents.at(-1).finishReason, 'length')
  const toolEvents = await readEvents('[tools]')
  assert.deepEqual(toolEvents.filter(event => event.type === 'tool.input.delta').at(-1).input, { query: '参考' })
  assert.equal(toolEvents.at(-1).status, 'tool_calls')
  const droppedEvents = await readEvents('[drop]')
  assert.equal(droppedEvents.filter(event => event.type === 'text.delta').map(event => event.content).join(''), prose)
  assert.equal(droppedEvents.at(-1).type, 'error')
  assert.equal(droppedEvents.at(-1).retryable, false, 'partial text must not be repeated by an automatic request retry')
  assert.ok(!droppedEvents.some(event => event.type === 'step.finish'))
  const interruptedToolEvents = await readEvents('[tools-drop]')
  assert.ok(interruptedToolEvents.some(event => event.type === 'tool.input.delta'), 'tool start must reach the browser even when no tool result completes')
  assert.equal(interruptedToolEvents.at(-1).type, 'error')
  assert.ok(!interruptedToolEvents.some(event => event.type === 'tool.call' || event.type === 'step.finish'))

  // A legacy [DONE] marker is not proof of a successful model result.
  process.env.PINAX_ADAPTER_ENDPOINT = `http://127.0.0.1:${provider.address().port}`
  const { forwardCompleteStream } = await import('../server/services/kitModelGateway.js?missing-terminal-smoke')
  await assert.rejects(forwardCompleteStream(requestFor(), () => {}, { timeoutMs: null }), error => error.code === 'KIT_STREAM_INCOMPLETE' && error.generatedText === prose)
  assert.equal(firstChunkAssertions, 3)
  console.log(`Output funnel: ${received.length} requests passed; both protocols, native stream parity, tool results, first text before completion, explicit final frame, partial failure and cancellation.`)
} finally {
  if (edge) await close(edge)
  if (runtime) await close(runtime)
  await close(provider)
  await fs.rm(temporary, { recursive: true, force: true })
}
