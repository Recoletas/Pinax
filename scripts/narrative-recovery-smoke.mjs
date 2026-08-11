import { EventEmitter } from 'node:events'
import { createGenerationAgentStepStreamHandler } from '../server/routes/generationAgent.js'
import {
  parseNarrativeAgentSseEvent,
  reduceNarrativeAgentStreamEvents
} from '../shared/narrativeAgentStreamContract.js'

const requestBody = {
  requestId: 'recovery-smoke',
  provider: {
    id: 'openai',
    baseUrl: 'https://example.test/v1',
    apiKey: 'smoke-key',
    model: 'smoke-model'
  },
  messages: [{ role: 'user', content: '继续当前场景' }],
  tools: [{
    name: 'world_lookup',
    description: 'read-only',
    inputSchema: { type: 'object', additionalProperties: true }
  }],
  options: { maxTokens: 80, timeoutMs: 1000 }
}

class FakeResponse extends EventEmitter {
  constructor() {
    super()
    this.chunks = []
    this.writableEnded = false
    this.destroyed = false
    this.statusCode = 0
  }

  status(code) {
    this.statusCode = code
    return this
  }

  setHeader() {}

  flushHeaders() {}

  write(chunk) {
    if (!this.destroyed) this.chunks.push(String(chunk))
    return true
  }

  end() {
    this.writableEnded = true
  }
}

function fakeRequest() {
  const request = new EventEmitter()
  request.body = requestBody
  return request
}

function eventsFrom(response) {
  return response.chunks
    .map((chunk) => parseNarrativeAgentSseEvent(chunk))
    .filter(Boolean)
}

async function runAbortCase() {
  const request = fakeRequest()
  const response = new FakeResponse()
  let providerAborted = false
  let providerCompleted = false
  const handler = createGenerationAgentStepStreamHandler({
    runner: async (_request, { signal }) => {
      await new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          providerAborted = true
          resolve()
        }, { once: true })
        setTimeout(resolve, 40)
      })
      providerCompleted = true
      return {
        kind: 'final_ready',
        text: '迟到的正文不应提交。',
        calls: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      }
    }
  })
  const pending = handler(request, response)
  await new Promise((resolve) => setTimeout(resolve, 5))
  response.destroyed = true
  response.emit('close')
  await pending
  const events = eventsFrom(response)
  const reduced = reduceNarrativeAgentStreamEvents(events)
  return {
    name: 'response-abort',
    providerAborted,
    providerCompleted,
    eventTypes: events.map((event) => event.type),
    noTerminalText: !events.some((event) => event.type === 'text.delta') && !reduced.text
  }
}

async function runLateResultCase() {
  const request = fakeRequest()
  const response = new FakeResponse()
  let providerAborted = false
  const handler = createGenerationAgentStepStreamHandler({
    runner: async (_request, { signal }) => {
      signal.addEventListener('abort', () => { providerAborted = true }, { once: true })
      await new Promise((resolve) => setTimeout(resolve, 15))
      return {
        kind: 'final_ready',
        text: '连接关闭后的迟到正文。',
        calls: [],
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
      }
    }
  })
  const pending = handler(request, response)
  await new Promise((resolve) => setTimeout(resolve, 3))
  response.destroyed = true
  response.emit('close')
  await pending
  const events = eventsFrom(response)
  return {
    name: 'late-provider-result',
    providerAborted,
    eventTypes: events.map((event) => event.type),
    noLateCommit: !events.some((event) => ['text.delta', 'step.finish'].includes(event.type))
  }
}

async function runTypedErrorCase() {
  const response = new FakeResponse()
  const handler = createGenerationAgentStepStreamHandler({
    runner: async () => {
      throw Object.assign(new Error('受控 provider 超时'), {
        code: 'NARRATIVE_PROVIDER_TIMEOUT',
        retryable: true
      })
    }
  })
  await handler(fakeRequest(), response)
  const events = eventsFrom(response)
  const reduced = reduceNarrativeAgentStreamEvents(events)
  return {
    name: 'typed-error',
    eventTypes: events.map((event) => event.type),
    typedError: events.at(-1)?.type === 'error'
      && events.at(-1)?.code === 'NARRATIVE_PROVIDER_TIMEOUT'
      && reduced.error?.retryable === true,
    ended: response.writableEnded
  }
}

const cases = await Promise.all([
  runAbortCase(),
  runLateResultCase(),
  runTypedErrorCase()
])
const checks = {
  responseAbort: cases[0].providerAborted && cases[0].noTerminalText,
  lateResultDiscarded: cases[1].providerAborted && cases[1].noLateCommit,
  typedErrorVisible: cases[2].typedError && cases[2].ended
}
const report = {
  schemaVersion: 1,
  protocol: 'agent-sse-v1',
  cases,
  checks,
  passed: Object.values(checks).every(Boolean)
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.passed) process.exitCode = 1
