#!/usr/bin/env node
// agent-step 消息形状确定性检查（2026-10-08 回归回归门禁，零网络零模型）：
// 验证 docs/plan/legacy-feature-regression-findings-20261008.md 问题一的修复——
//   1) content-only 消息经契约归一化 + 网关兜底后，转发体提示词非空（20261008 回归主案）；
//   2) parts-only 消息仍被契约拒绝（NARRATIVE_MESSAGE_CONTENT_REQUIRED，路由映射 400）；
//   3) content+parts 双写（orchestrator 形状，content 由 parts 反推、文本一致）转发体保留文本；
//   4) tool 轮无 tool-result 部件时 output 回退 content；
//   5) 全部 user/system 轮正文为空时，网关抛 NARRATIVE_AGENT_EMPTY_PROMPT（20261008 空提示词护栏）。
// 捕获点在 fetch 层：stub 全局 fetch 抓取发往 kit /v1/pinax/complete 的请求体，随后即返回合成回执。
// 运行：node scripts/agent-step-message-shape-check.mjs
// 指向死端口：模块加载即定端点，stub fetch 使真实网络不可达也无所谓
process.env.PINAX_ADAPTER_ENDPOINT = 'http://127.0.0.1:1'

const results = []
const record = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` —— ${detail}` : ''}`)
}

const captured = []
let fetchCalls = 0
globalThis.fetch = async (url, init) => {
  fetchCalls += 1
  captured.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null })
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, content: 'shape-check-echo', toolCalls: [], finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, model: 'shape-check' })
  }
}

const { runKitFunnelProviderTurn } = await import('../server/services/kitModelGateway.js')
const { validateGenerationAgentTurnRequest } = await import('../shared/generationToolContract.js')
// 路由层仅用于断言 parts-only 的 400 分档（statusForError：含 REQUIRED → 400）
const { createGenerationAgentStepStreamHandler } = await import('../server/routes/generationAgent.js')

const PROVIDER = {
  id: 'shape-check',
  baseUrl: 'https://kernel.invalid/v1',
  apiKey: 'shape-check-key',
  model: 'shape-check-model'
}
const TOOLS = [{
  name: 'world_lookup',
  description: '查询当前世界书条目（形状检查夹具）',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: { type: 'string', enum: ['search', 'get', 'related'] },
      query: { type: 'string' }
    }
  }
}]

console.log('[1] content-only 消息：契约通过 + 契约合成 parts + 转发体提示词非空（20261008 回归主案）')
const contentOnlyMarker = '矿镇雪夜-CONTENTONLY-8721'
const contentOnlyValidation = validateGenerationAgentTurnRequest({
  requestId: 'shape-content-only',
  provider: PROVIDER,
  messages: [{ role: 'user', content: contentOnlyMarker }],
  tools: TOOLS
})
record('content-only 契约校验通过', contentOnlyValidation.valid === true, contentOnlyValidation.error?.code || '')
record('归一化消息合成出 text parts（下游单一形状）', contentOnlyValidation.valid
  && contentOnlyValidation.request.messages[0]?.parts?.[0]?.type === 'text'
  && contentOnlyValidation.request.messages[0].parts[0].text === contentOnlyMarker)
if (contentOnlyValidation.valid) await runKitFunnelProviderTurn(contentOnlyValidation.request)
const contentOnlyBody = captured.at(-1)
record('转发目标为 /v1/pinax/complete', contentOnlyBody?.url.endsWith('/v1/pinax/complete'), contentOnlyBody?.url || 'no fetch')
record('转发体 messages[0].content 非空且含输入标记词', contentOnlyBody?.body?.messages?.[0]?.content?.includes(contentOnlyMarker) === true,
  JSON.stringify(contentOnlyBody?.body?.messages?.[0]?.content || '').slice(0, 80))

console.log('[2] parts-only 消息：契约仍拒绝（NARRATIVE_MESSAGE_CONTENT_REQUIRED）且路由映射 400')
const partsOnlyValidation = validateGenerationAgentTurnRequest({
  requestId: 'shape-parts-only',
  provider: PROVIDER,
  messages: [{ role: 'user', parts: [{ type: 'text', text: '只有 parts 没有内容' }] }],
  tools: TOOLS
})
record('parts-only 契约校验失败', partsOnlyValidation.valid === false)
record('错误码 NARRATIVE_MESSAGE_CONTENT_REQUIRED', partsOnlyValidation.error?.code === 'NARRATIVE_MESSAGE_CONTENT_REQUIRED', partsOnlyValidation.error?.code || '')
{
  const handler = createGenerationAgentStepStreamHandler()
  const response = { code: 0, body: null, status(code) { this.code = code; return this }, json(payload) { this.body = payload; return this } }
  await handler({ body: { requestId: 'shape-parts-only', provider: PROVIDER, messages: [{ role: 'user', parts: [{ type: 'text', text: '只有 parts' }] }], tools: TOOLS } }, response)
  record('路由对该形状返回 HTTP 400', response.code === 400, `actual=${response.code}`)
}
record('parts-only 未发起任何转发', fetchCalls === 1, `fetchCalls=${fetchCalls}`)

console.log('[3] content+parts 双写：转发体保留文本（orchestrator 双写形状，content 由 parts 反推、文本一致，parts 优先）')
const dualMarker = '双写标记词-DUAL-8721'
const dualValidation = validateGenerationAgentTurnRequest({
  requestId: 'shape-dual',
  provider: PROVIDER,
  messages: [{ role: 'user', content: dualMarker, parts: [{ type: 'text', text: dualMarker }] }],
  tools: TOOLS
})
record('双写契约校验通过', dualValidation.valid === true, dualValidation.error?.code || '')
record('归一化消息保留原 parts', dualValidation.valid && dualValidation.request.messages[0]?.parts?.[0]?.text === dualMarker)
if (dualValidation.valid) await runKitFunnelProviderTurn(dualValidation.request)
const dualBody = captured.at(-1)
record('转发体 messages[0].content 含双写文本（content 与 parts 文本一致，均在）',
  dualBody?.body?.messages?.[0]?.content?.includes(dualMarker) === true,
  JSON.stringify(dualBody?.body?.messages?.[0]?.content || '').slice(0, 80))

console.log('[4] tool 轮 content 兜底：无 tool-result 部件时 output 回退 content')
const toolCallId = 'shape-call-1'
const toolValidation = validateGenerationAgentTurnRequest({
  requestId: 'shape-tool-fallback',
  provider: PROVIDER,
  messages: [
    { role: 'user', content: '先查资料再回答-SHAPECHECK-8721' },
    { role: 'assistant', parts: [{ type: 'tool-call', toolCallId, toolName: 'world_lookup', input: { action: 'search', query: '矿镇' } }] },
    // 契约对 tool 消息要求 toolCallId + name（无 parts 形状），content 为工具结果文本
    { role: 'tool', toolCallId, name: 'world_lookup', content: '工具结果文本-TOOLFALLBACK-8721' }
  ],
  tools: TOOLS
})
record('tool 兜底三件套契约校验通过', toolValidation.valid === true, toolValidation.error?.code || '')
if (toolValidation.valid) {
  await runKitFunnelProviderTurn(toolValidation.request)
  const toolBody = captured.at(-1)
  const forwardedTool = toolBody?.body?.messages?.find((message) => message.role === 'tool')
  record('转发体 tool 轮 output 为 content 文本', forwardedTool?.output === '工具结果文本-TOOLFALLBACK-8721',
    JSON.stringify(forwardedTool?.output ?? null).slice(0, 80))
  record('转发体 tool 轮保留 toolCallId/toolName（name 兜底）', forwardedTool?.toolCallId === toolCallId && forwardedTool?.toolName === 'world_lookup')
  const forwardedAssistant = toolBody?.body?.messages?.find((message) => message.role === 'assistant')
  record('assistant 工具轮 toolCalls 照旧进转发体（现状维持）', Array.isArray(forwardedAssistant?.toolCalls)
    && forwardedAssistant.toolCalls[0]?.name === 'world_lookup'
    && forwardedAssistant.toolCalls[0]?.id === toolCallId)
}

console.log('[5] 空提示词护栏：全部 user 轮正文为空 → NARRATIVE_AGENT_EMPTY_PROMPT，拒绝转发')
const callsBeforeGuard = fetchCalls
let guardError = null
try {
  await runKitFunnelProviderTurn({
    messages: [
      { role: 'user', content: '   ', parts: [] },
      { role: 'user', content: '', parts: [] }
    ],
    options: {}
  })
} catch (error) {
  guardError = error
}
record('抛错且 code=NARRATIVE_AGENT_EMPTY_PROMPT', guardError?.code === 'NARRATIVE_AGENT_EMPTY_PROMPT', guardError?.code || guardError?.message || 'no error')
record('retryable=false', guardError?.retryable === false)
record('护栏触发于转发前（fetch 未再被调用）', fetchCalls === callsBeforeGuard, `fetchCalls=${fetchCalls}`)

const failed = results.filter((item) => !item.pass)
console.log('')
console.log(`agent-step-message-shape-check: ${results.length - failed.length}/${results.length} 项通过`)
if (failed.length) {
  console.log(`FAILED: ${failed.map((item) => item.name).join(' | ')}`)
  process.exit(1)
}
process.exit(0)
