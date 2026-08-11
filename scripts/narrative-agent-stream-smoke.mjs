import { createGenerationAgentStepStreamHandler } from '../server/routes/generationAgent.js'
import {
  parseNarrativeAgentSseEvent,
  reduceNarrativeAgentStreamEvents
} from '../shared/narrativeAgentStreamContract.js'

const requestBody = {
  requestId: 'stream-smoke',
  provider: {
    id: 'openai',
    baseUrl: 'https://example.test/v1',
    apiKey: 'smoke-key',
    model: 'smoke-model'
  },
  messages: [{ role: 'user', content: '核对当前现场' }],
  tools: [{
    name: 'world_lookup',
    description: 'read-only',
    inputSchema: { type: 'object', additionalProperties: true }
  }],
  options: { maxTokens: 80, timeoutMs: 1000 }
}

function createResponse() {
  const chunks = []
  return {
    chunks,
    writableEnded: false,
    destroyed: false,
    statusCode: 0,
    status(code) { this.statusCode = code; return this },
    setHeader() {},
    flushHeaders() {},
    write(chunk) { chunks.push(String(chunk)); return true },
    end() { this.writableEnded = true },
    once() {},
    removeListener() {}
  }
}

async function runCase(label, resultOrError) {
  const response = createResponse()
  const handler = createGenerationAgentStepStreamHandler({
    runner: async () => {
      if (resultOrError instanceof Error) throw resultOrError
      return resultOrError
    }
  })
  await handler({ body: requestBody, once() {}, removeListener() {} }, response)
  const events = response.chunks
    .map((chunk) => parseNarrativeAgentSseEvent(chunk))
    .filter(Boolean)
  return { label, response, events, reduced: reduceNarrativeAgentStreamEvents(events) }
}

const toolCase = await runCase('tool-call', {
  kind: 'tool_calls',
  calls: [{
    id: 'call-smoke',
    name: 'world_lookup',
    arguments: { action: 'search', query: '钟楼', limit: 1 }
  }],
  usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 }
})
const textCase = await runCase('final-text', {
  kind: 'final_ready',
  text: '门外的风铃停了一拍。',
  calls: [],
  usage: { inputTokens: 3, outputTokens: 6, totalTokens: 9 }
})
const errorCase = await runCase('typed-error', Object.assign(
  new Error('受控超时'),
  { code: 'NARRATIVE_PROVIDER_TIMEOUT', retryable: true }
))

const checks = {
  toolSequence: toolCase.events.map((event) => event.type).join(',')
    === 'step.start,tool.input.delta,tool.call,usage,step.finish',
  toolArgumentsReassembled: toolCase.reduced.calls[0]?.arguments?.query === '钟楼',
  textSequence: textCase.events.some((event) => event.type === 'text.delta')
    && textCase.reduced.text === '门外的风铃停了一拍。',
  typedError: errorCase.events.at(-1)?.type === 'error'
    && errorCase.events.at(-1)?.code === 'NARRATIVE_PROVIDER_TIMEOUT'
    && errorCase.reduced.error?.retryable === true
}

const report = {
  schemaVersion: 1,
  protocol: 'agent-sse-v1',
  cases: [toolCase.label, textCase.label, errorCase.label],
  checks,
  passed: Object.values(checks).every(Boolean)
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.passed) process.exitCode = 1
