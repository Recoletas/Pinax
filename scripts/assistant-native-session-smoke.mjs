/**
 * Exercise the built assistant runtime against a local, scripted model provider.
 * No real model credentials or running Pinax services are used.
 *
 * node scripts/assistant-native-session-smoke.mjs [runtime-directory]
 * PINAX_RUNTIME_OUTPUT=.runtime/candidate MOCK_API=anthropic-messages node scripts/assistant-native-session-smoke.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeDirectory = path.resolve(
  process.argv[2] || process.env.PINAX_RUNTIME_OUTPUT || path.join(projectRoot, '.runtime/storyagent'),
)
const api = process.env.MOCK_API || 'openai-completions'
assert.ok(['openai-completions', 'anthropic-messages'].includes(api), `Unsupported MOCK_API: ${api}`)

const { startServer } = await import(pathToFileURL(path.join(runtimeDirectory, 'dist/pinax/server.js')))
const { TaskStore } = await import(pathToFileURL(path.join(runtimeDirectory, 'dist/pinax/store.js')))
const { assistantProviderFailure } = await import(pathToFileURL(path.join(runtimeDirectory, 'dist/pinax/assistantTask.js')))
const tasksDirectory = await mkdtemp(path.join(tmpdir(), 'pinax-native-session-smoke-'))
const responses = []
const requests = []
const providerErrors = []
let summaries = 0
let summaryDelay = 0
let onSummary = null

function openAIResponse(response, next, index) {
  const packet = (delta, finishReason = null) => ({
    id: `chat-${index}`,
    object: 'chat.completion.chunk',
    created: 1,
    model: 'native-smoke',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })
  const write = value => response.write(`data: ${JSON.stringify(value)}\n\n`)
  if (next.tool) {
    write(packet({
      role: 'assistant',
      tool_calls: [{
        index: 0,
        id: `call-${index}`,
        type: 'function',
        function: { name: next.tool, arguments: JSON.stringify(next.args) },
      }],
    }))
    write(packet({}, 'tool_calls'))
  } else {
    write(packet({ role: 'assistant', content: next.text }))
    write(packet({}, 'stop'))
  }
  response.end('data: [DONE]\n\n')
}

function anthropicResponse(response, next, index) {
  const write = (type, data) => {
    response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
  }
  write('message_start', {
    message: {
      id: `msg-${index}`,
      type: 'message',
      role: 'assistant',
      model: 'native-smoke',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  })
  if (next.tool) {
    write('content_block_start', {
      index: 0,
      content_block: { type: 'tool_use', id: `call-${index}`, name: next.tool, input: {} },
    })
    write('content_block_delta', {
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(next.args) },
    })
  } else {
    write('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    write('content_block_delta', { index: 0, delta: { type: 'text_delta', text: next.text } })
  }
  write('content_block_stop', { index: 0 })
  write('message_delta', {
    delta: { stop_reason: next.tool ? 'tool_use' : 'end_turn', stop_sequence: null },
    usage: { output_tokens: 10 },
  })
  write('message_stop', {})
  response.end()
}

const provider = http.createServer(async (request, response) => {
  try {
    let body = ''
    for await (const chunk of request) body += chunk
    const input = JSON.parse(body)
    requests.push(input)
    const isSummary = JSON.stringify(input).includes('context summarization assistant')
    const next = isSummary ? {
      text: '## Goal\n完善人物；已提出人物候选，作者待采用。\n## Progress\n已查阅码头。',
      delay: summaryDelay,
      check: () => onSummary?.(),
    } : responses.shift()
    if (isSummary) summaries += 1
    assert.ok(next, 'Unexpected provider request')
    next.check?.(input)
    if (next.delay) await new Promise(resolve => setTimeout(resolve, next.delay))
    if (response.destroyed) return
    if (next.error) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: next.error } }))
      return
    }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    if (api === 'anthropic-messages') anthropicResponse(response, next, requests.length)
    else openAIResponse(response, next, requests.length)
  } catch (error) {
    providerErrors.push(error.message)
    if (!response.destroyed) {
      response.writeHead(500)
      response.end(JSON.stringify({ error: { message: error.message } }))
    }
  }
})

async function closeServer(server) {
  if (!server) return
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}

async function waitForListening(server) {
  if (server.listening) return
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
}

let runtime
let baseURL
async function openRuntime() {
  runtime = startServer({
    port: 0,
    host: '127.0.0.1',
    tasksDir: tasksDirectory,
    provider: 'smoke',
    model: 'native-smoke',
    api,
    baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
    apiKey: 'mock',
    thinking: 'off',
  })
  await waitForListening(runtime)
  baseURL = `http://127.0.0.1:${runtime.address().port}`
}

function post(route, body) {
  return fetch(`${baseURL}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
}

async function send(route, body) {
  const response = await post(route, body)
  const text = await response.text()
  assert.equal(response.status, 200, text)
  return text
}

const store = new TaskStore(tasksDirectory)
const change = {
  kind: 'worldbook',
  targetId: 'linlan',
  operation: 'create',
  field: 'content',
  before: '',
  after: '林岚管理码头仓库，讨厌隐瞒。',
  title: '林岚',
  reason: '补充人物动机',
  entryType: 'character',
}
const policy = {
  mode: 'review',
  bookId: 'book',
  sessionId: 'conversation',
  scope: 'current',
  chapterIds: ['chapter'],
  worldbook: true,
  outline: true,
}
const resources = {
  revision: 'r1',
  domains: {
    world_lookup: [{ id: 'dock', title: '码头', type: 'location', text: '码头运送药材。' }],
    manuscript: [{ id: 'chapter', title: '码头来客', text: '船靠岸了。' }],
  },
}
let requestSequence = 0
function turn(taskId, text) {
  requestSequence += 1
  return {
    taskId,
    requestId: `req-${requestSequence}`,
    bookId: 'book',
    taskKind: 'assistant',
    mode: 'auto',
    intent: text,
    kernel: { blocks: [{ kind: 'editing-target', text: JSON.stringify({ chapterId: 'chapter' }) }] },
    resources,
    assistantPolicy: policy,
  }
}

function assertChronological(saved) {
  assert.equal(saved.messages[0]?.role, 'user', 'Exported transcript must start with its oldest user message')
  const calls = new Map()
  for (const [index, message] of saved.messages.entries()) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) if (block.type === 'toolCall') calls.set(block.id, index)
    }
    if (message.role === 'toolResult') {
      assert.ok(calls.has(message.toolCallId), `Tool receipt has no earlier call: ${message.toolCallId}`)
      assert.ok(calls.get(message.toolCallId) < index)
    }
  }
  if (saved.delivery?.outcome !== 'needs_input' && saved.messages.at(-1)?.toolName !== 'generate_narrative_draft') {
    assert.equal(saved.messages.at(-1)?.role, 'assistant', 'Latest assistant reply must remain last')
  }
}

function completed(taskId) {
  const saved = store.load(taskId)
  assert.equal(saved.status, 'completed', JSON.stringify(saved.error))
  assertChronological(saved)
  return saved
}

async function waitForStage(stage, operation, description) {
  // If the run fails before the mock request arrives, surface that failure
  // instead of leaving the rendezvous unresolved.
  await Promise.race([
    stage,
    operation.then(() => { throw new Error(`Operation ended before ${description}`) }),
  ])
}

try {
  provider.listen(0, '127.0.0.1')
  await waitForListening(provider)
  await openRuntime()

  // A proposal receipt does not end Pi's tool loop, even with legacy final=true.
  responses.push(
    { tool: 'submit_edit_proposals', args: { changes: [change], final: true } },
    { tool: 'world_lookup', args: { action: 'get', id: 'dock' } },
    { text: '已补充人物动机，并核对码头背景；请在设定中审阅。' },
  )
  const firstStream = await send('/v1/pinax/tasks', turn('native-main', '补充人物并查背景'))
  const first = completed('native-main')
  assert.equal(first.delivery?.outcome, 'proposal')
  assert.equal(first.toolCalls, 2)
  assert.equal(first.proposalChanges.length, 1)
  assert.ok(first.nativeSession?.id)
  assert.ok(firstStream.includes('已补充人物动机'))
  assert.equal(first.finalText, '已补充人物动机，并核对码头背景；请在设定中审阅。')
  assert.equal(responses.length, 0)

  // A final writing tool can end the native turn without another model summary.
  // Outstanding work or accepted steering must still continue normally.
  for (const [id, finishTask, steer] of [['draft-finish', true, false], ['draft-more', false, false], ['draft-steered', true, true]]) {
    const count = requests.length
    responses.push({ tool: 'generate_narrative_draft', args: { targetId: 'chapter', operation: 'append', instruction: '船员上岸。', planning: 'reuse', finishTask } })
    if (!finishTask || steer) responses.push({ text: '已完成后续说明。', ...(steer ? { check: body => assert.ok(JSON.stringify(body).includes('解释人物为何下船')) } : {}) })
    const input = turn(id, '接着写船员上岸')
    input.kernel.blocks.push({ kind: 'assistant-narrative', text: '使用正文工具' })
    const response = await post('/v1/pinax/tasks', input)
    assert.equal(response.status, 200)
    const decoder = new TextDecoder()
    let pending = ''
    for await (const bytes of response.body) {
      pending += decoder.decode(bytes, { stream: true })
      let index
      while ((index = pending.indexOf('\n\n')) !== -1) {
        const frame = pending.slice(0, index); pending = pending.slice(index + 2)
        if (!frame.startsWith('event: narrative.request\n')) continue
        const event = JSON.parse(frame.split('\ndata: ')[1])
        assert.equal(event.request.planning, 'reuse')
        if (steer) assert.equal(JSON.parse(await send(`/v1/pinax/tasks/${id}/steer`, { bookId: 'book', id: 'draft-extra', text: '解释人物为何下船' })).ok, true)
        assert.equal(JSON.parse(await send(`/v1/pinax/tasks/${id}/narrative-result`, { ...event, text: '船员提着行囊走下船。' })).ok, true)
      }
    }
    const finished = completed(id)
    assert.equal(finished.delivery.outcome, 'proposal')
    assert.equal(finished.proposalChanges[0].after, '船员提着行囊走下船。')
    assert.equal(requests.length - count, finishTask && !steer ? 1 : 2)
    const receipt = finished.messages.findLast(message => message.role === 'toolResult' && message.toolName === 'generate_narrative_draft')
    const payload = JSON.parse(receipt.content[0].text)
    assert.equal(payload.text, undefined)
    assert.equal(payload.changes, undefined)
    assert.equal(payload.proposalChanges.length, 1)
  }

  // Ordinary sends retain the native transcript, including prior tool receipts.
  responses.push({
    text: '我记得林岚的修改仍是候选。',
    check: body => {
      assert.ok(JSON.stringify(body).includes('林岚管理码头仓库'))
      assert.ok(body.messages.some(message => message.role === 'tool'
        || Array.isArray(message.content) && message.content.some(block => block.type === 'tool_result')))
    },
  })
  await send('/v1/pinax/tasks/native-main/resume', turn('native-main', '先解释为什么这么改'))
  const resumed = completed('native-main')
  assert.equal(resumed.delivery.outcome, 'answer')
  assert.ok(resumed.messages.length > first.messages.length)

  // Pausing for a question preserves proposals; the answer resumes the same session.
  responses.push(
    { tool: 'submit_edit_proposals', args: { changes: [{ ...change, targetId: 'second' }], final: true } },
    {
      tool: 'request_user_input',
      args: {
        questions: [{
          id: 'direction',
          question: '人物动机保留哪一种？',
          options: [
            { label: '责任感', description: '主动承担责任。' },
            { label: '旧怨', description: '由过去经历推动。' },
          ],
        }],
      },
    },
  )
  await send('/v1/pinax/tasks', turn('native-question', '补人物，然后问我取舍'))
  const waiting = completed('native-question')
  assert.equal(waiting.delivery.outcome, 'needs_input')
  assert.equal(waiting.proposalChanges.length, 1)
  const beforeQuestionAnswer = requests.length
  responses.push({
    text: '按责任感保留人物修改，候选已准备好。',
    check: body => assert.ok(JSON.stringify(body).includes('人物动机保留哪一种')),
  })
  await send('/v1/pinax/tasks/native-question/resume', turn('native-question', '责任感'))
  const answered = completed('native-question')
  assert.equal(answered.delivery.outcome, 'proposal')
  assert.equal(answered.proposalChanges.length, 1)
  assert.equal(requests.length, beforeQuestionAnswer + 1)

  // Accepted author input still reaches the next native turn after a proposal.
  let notifyReadStarted
  const readStarted = new Promise(resolve => { notifyReadStarted = resolve })
  responses.push(
    { tool: 'submit_edit_proposals', args: { changes: [{ ...change, targetId: 'steered' }], final: true } },
    {
      tool: 'world_lookup',
      args: { action: 'get', id: 'dock' },
      delay: 150,
      check: () => notifyReadStarted(),
    },
    { text: '已结合补充继续整理。', check: body => assert.ok(JSON.stringify(body).includes('偏重责任感')) },
  )
  const steeringRun = send('/v1/pinax/tasks', turn('native-steer', '先补人物再查背景'))
  await waitForStage(readStarted, steeringRun, 'the read request')
  const accepted = JSON.parse(await send('/v1/pinax/tasks/native-steer/steer', {
    bookId: 'book', id: 'extra-1', text: '偏重责任感',
  }))
  assert.equal(accepted.ok, true, JSON.stringify(accepted))
  const steeredStream = await steeringRun
  assert.equal(completed('native-steer').proposalChanges.length, 1)
  assert.ok(steeredStream.includes('author_input'))

  // Manual compaction invokes summary generation without adding a normal author turn.
  const beforeCompact = requests.length
  const compacted = JSON.parse(await send('/v1/pinax/tasks/native-main/compact', { bookId: 'book' }))
  assert.equal(compacted.ok, true)
  assert.equal(summaries, 1)
  assert.equal(requests.length - beforeCompact, 1)

  // Reopening the service reads the persisted Pi summary and transcript.
  await closeServer(runtime)
  await openRuntime()
  responses.push({
    text: '重新连接后继续。',
    check: body => assert.ok(JSON.stringify(body).includes('## Goal')),
  })
  await send('/v1/pinax/tasks/native-main/resume', turn('native-main', '重开后继续'))

  // Cancelling compaction settles its owner and leaves the completed task journal intact.
  summaryDelay = 300
  const summaryStarted = new Promise(resolve => { onSummary = resolve })
  const beforeCancel = JSON.stringify(store.load('native-main'))
  const compactPending = post('/v1/pinax/tasks/native-main/compact', { bookId: 'book' })
  await waitForStage(summaryStarted, compactPending, 'the summary request')
  const cancelled = JSON.parse(await send('/v1/pinax/tasks/native-main/cancel', {}))
  assert.equal(cancelled.status, 'cancelled', JSON.stringify(cancelled))
  const interrupted = await compactPending
  assert.equal(interrupted.status, 409)
  await interrupted.text()
  assert.equal(JSON.stringify(store.load('native-main')), beforeCancel)
  summaryDelay = 0
  onSummary = null
  responses.push({ text: '压缩中断后仍可继续。' })
  await send('/v1/pinax/tasks/native-main/resume', turn('native-main', '继续未结束的讨论'))

  completed('native-main')

  // A newer provider failure cannot be hidden by an earlier successful reply.
  responses.push({ error: '401 Unauthorized mock provider' })
  await send('/v1/pinax/tasks/native-main/resume', turn('native-main', '这次模拟认证失败'))
  const failed = store.load('native-main')
  assert.equal(failed.status, 'failed')
  assertChronological(failed)
  assert.equal(failed.messages.at(-1).stopReason, 'error')
  assert.ok(assistantProviderFailure(failed.messages).includes('认证失败'))

  // Conversely, a historical error cannot turn a successful retry into a failure.
  responses.push({ text: '模型恢复后继续。' })
  await send('/v1/pinax/tasks/native-main/resume', turn('native-main', '模型恢复了，继续'))
  const reopened = completed('native-main')
  assert.equal(reopened.finalText, '模型恢复后继续。')
  assert.equal(assistantProviderFailure(reopened.messages), '')
  assert.equal(responses.length, 0)
  assert.deepEqual(providerErrors, [])
  process.stdout.write(`${JSON.stringify({
    ok: true,
    api,
    providerRequests: requests.length,
    summaries,
    proposalContinuedToRead: true,
    normalResume: true,
    waitingProposalRetained: true,
    questionResume: true,
    steerAfterProposal: true,
    manualCompact: true,
    compactCancel: true,
    serverReopen: true,
    chronologicalTranscript: true,
    latestProviderFailure: true,
    messagesCount: reopened.messages.length,
    nativeSession: Boolean(reopened.nativeSession),
    servicesTouched: false,
  })}\n`)
} finally {
  await closeServer(runtime)
  await closeServer(provider)
  await rm(tasksDirectory, { recursive: true, force: true })
}
