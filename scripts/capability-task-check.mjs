#!/usr/bin/env node
// 能力任务面确定性 smoke：capabilityTaskRunner 的回执→advice 映射（mock 任务面 SSE）、
// 契约目录完整性、advisor 路由切片门控（mock 探测可达→走 agent；不可达→回落）；
// [5] structured capability fetchImpl（W1-1 试点）——adapter 请求体折成 capability 任务、
// submit 回执按三协议超集合成、任务失败回落漏斗、全链经 runStructuredGeneration 验证 schema 校验。
// 运行：node scripts/capability-task-check.mjs
import assert from 'node:assert/strict'
import path from 'node:path'
import { getCapabilityToolSpec, CAPABILITY_TOOL_SPECS } from '../shared/capabilityToolContracts.js'
import { runCapabilityTaskAgent, CAPABILITY_TASK_TYPES } from '../server/services/capabilityTaskRunner.js'
import { createKitStructuredCapabilityFetchImpl } from '../server/services/kitModelGateway.js'
import { runStructuredGeneration } from '../server/services/structuredGenerationRunner.js'

let passed = 0
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  ✓ ${name}`) }

console.log('[1] 契约目录：全族 spec（P4-A 三件 + P4-B 扩容）')
check('目录规模 ≥ 18', Object.keys(CAPABILITY_TOOL_SPECS).length >= 18)
for (const taskType of ['authoring.review.chapter', 'authoring.knowledge.query', 'memory.extraction', 'authoring.rewrite', 'authoring.complete.inline', 'materials.refine', 'authoring.scene.directions', 'authoring.rehearsal.step', 'authoring.review.selection', 'materials.classify', 'canvas.organize', 'storyboard.review', 'authoring.emergence', 'authoring.next-actions']) {
  const spec = getCapabilityToolSpec(taskType)
  check(`${taskType} → ${spec?.toolName}`, Boolean(spec?.toolName && spec?.schema?.type === 'object'))
}
check('memory.extraction quote 逐字约束在 schema description', CAPABILITY_TOOL_SPECS['memory.extraction'].schema.properties.proposals.items.properties.quote.description.includes('逐字'))
check('review.findings 带 target 精确定位（nodeId/offset/exact）', JSON.stringify(CAPABILITY_TOOL_SPECS['authoring.review.chapter'].schema).includes('startOffset'))
check('rewrite 支持 candidates 多候选', JSON.stringify(CAPABILITY_TOOL_SPECS['authoring.rewrite'].schema).includes('candidates'))
check('typedActions 族 action 类型约束', Array.isArray(CAPABILITY_TOOL_SPECS['storyboard.review'].actionTypes) && CAPABILITY_TOOL_SPECS['storyboard.review'].actionTypes[0] === 'storyboard-shot-patch')
check('emergence 首获能力路径（D7 裁定）：typedActions runtime-candidate', CAPABILITY_TOOL_SPECS['authoring.emergence']?.toolName === 'submit_typed_actions' && CAPABILITY_TOOL_SPECS['authoring.emergence'].actionTypes[0] === 'runtime-candidate')
check('工具侧键全为 canonical（D7 清零死键）', Object.keys(CAPABILITY_TOOL_SPECS).every((id) => !id.startsWith('experience.')))

console.log('[2] runCapabilityTaskAgent：mock 任务面 SSE → 回执序列化为 advice')
let forwarded = null
const sseTask = (completedPayload) => new ReadableStream({
  start(controller) {
    const enc = new TextEncoder()
    controller.enqueue(enc.encode(`event: task.started\ndata: ${JSON.stringify({ status: 'running', taskId: 'pcap_x' })}\n\n`))
    controller.enqueue(enc.encode(`event: task.completed\ndata: ${JSON.stringify(completedPayload)}\n\n`))
    controller.close()
  }
})
globalThis.fetch = async (url, init) => {
  forwarded = { url: String(url), body: JSON.parse(init.body) }
  return { ok: true, status: 200, body: sseTask({ status: 'completed', taskId: forwarded?.body?.taskId || 'pcap_x', model: 'dots.dots3-note-prev', capabilityResult: { findings: [{ kind: 'consistency', severity: 'major', reason: '罗盘状态矛盾' }], summary: '1 处矛盾' } }) }
}
process.env.PINAX_ADAPTER_ENDPOINT = 'http://127.0.0.1:65530'
const run = await runCapabilityTaskAgent({
  taskType: 'authoring.review.chapter',
  taskMeta: { prompt: '任务指令卡+输出协议+上下文' }
})
check('转发到 /v1/pinax/tasks 且 taskKind=capability', forwarded.url.endsWith('/v1/pinax/tasks') && forwarded.body.taskKind === 'capability')
check('submitTool 来自契约目录', forwarded.body.capability.submitTool.name === 'submit_review_findings')
check('回执序列化为 advice JSON（解析回 findings）', JSON.parse(run.advice).findings[0].reason === '罗盘状态矛盾')
check('provider 标识 agent-loop-kit + 模型', run.provider.id === 'agent-loop-kit' && run.provider.model === 'dots.dots3-note-prev')

console.log('[3] 失败路径：任务面 failed 帧 → 抛错（调用方回落漏斗）')
globalThis.fetch = async () => ({ ok: true, status: 200, body: sseTask(undefined) && new ReadableStream({
  start(controller) {
    const enc = new TextEncoder()
    controller.enqueue(enc.encode(`event: task.failed\ndata: ${JSON.stringify({ status: 'failed', error: { code: 'PINAX_ADAPTER_NO_SUBMISSION', message: '未提交', retryable: false } })}\n\n`))
    controller.close()
  }
}) })
let threw = ''
try { await runCapabilityTaskAgent({ taskType: 'authoring.review.chapter', taskMeta: { prompt: 'x' } }) } catch (e) { threw = `${e.code}:${e.retryable}` }
check('NO_SUBMISSION → 抛错且 retryable=false', threw === 'PINAX_ADAPTER_NO_SUBMISSION:false')

console.log('[4] advisor 路由切片清单')
check('三切片在 CAPABILITY_TASK_TYPES', ['authoring.review.chapter', 'authoring.knowledge.query', 'memory.extraction'].every((t) => CAPABILITY_TASK_TYPES.includes(t)))

console.log('[5] structured capability fetchImpl（W1-1 试点）：adapter 请求 → capability 任务 → 协议合成；失败回落漏斗')
const originSchema = { type: 'object', additionalProperties: false, required: ['origin'], properties: { origin: { type: 'string' } } }
const okJson = (payload) => ({ ok: true, status: 200, json: async () => payload })
const taskSse = (payload) => new ReadableStream({
  start(controller) {
    const enc = new TextEncoder()
    controller.enqueue(enc.encode(`event: task.completed\ndata: ${JSON.stringify(payload)}\n\n`))
    controller.close()
  }
})
const anthropicNativeBody = (maxTokens = 1200) => JSON.stringify({
  model: 'MiniMax-Text-01',
  max_tokens: maxTokens,
  temperature: 0.2,
  system: '你是结构化世界书编辑。只返回协议要求的 JSON。',
  messages: [{ role: 'user', content: '【全局硬约束】\n蒸汽与灵石并存的世界起源' }],
  output_config: { format: { type: 'json_schema', schema: originSchema } }
})
const receipt = { origin: '灵石纪始于一场地火' }
let planeRequests = []
const mockPlane = ({ taskPayload, taskStatus = 200 } = {}) => async (url, init = {}) => {
  const href = String(url)
  planeRequests.push({ url: href, body: init.body ? JSON.parse(init.body) : null })
  if (href.endsWith('/model')) return okJson({})
  if (href.endsWith('/v1/pinax/tasks')) {
    if (taskStatus !== 200) return { ok: false, status: taskStatus, json: async () => ({ message: 'task plane down' }) }
    return { ok: true, status: 200, body: taskSse({ status: 'completed', taskId: 'pcap_s1', model: 'dots.dots3-note-prev', capabilityResult: receipt, usage: { inputTokens: 111, outputTokens: 22, totalTokens: 133 } }) }
  }
  return okJson({ ok: true, content: JSON.stringify(taskPayload), toolCalls: [], finishReason: 'stop', usage: { inputTokens: 9, outputTokens: 5, totalTokens: 14 } })
}

const capabilityFetch = createKitStructuredCapabilityFetchImpl()
globalThis.fetch = mockPlane()
const synthesized = await (await capabilityFetch('https://api.minimaxi.com/anthropic/v1/messages', { body: anthropicNativeBody(), signal: new AbortController().signal })).json()
const taskBody = planeRequests.find((request) => request.url.endsWith('/v1/pinax/tasks'))?.body
check('capability 任务携带 taskKind/submitTool/systemPrompt/budget', taskBody?.taskKind === 'capability'
  && taskBody?.capability?.submitTool?.name === 'submit_structured_generation'
  && taskBody?.capability?.submitTool?.parameters?.properties?.origin?.type === 'string'
  && taskBody?.budget?.maxModelSteps === 2 && taskBody?.budget?.agentTimeoutMs === 40000)
check('systemPrompt 含 schema 指令、任务上下文与提交指令', ['JSON Schema', '蒸汽与灵石', 'submit_structured_generation'].every((part) => taskBody?.capability?.systemPrompt.includes(part)))
check('合成响应可被 adapter 的 anthropic 读取面解析', synthesized.content?.[0]?.text === JSON.stringify(receipt) && synthesized.usage?.input_tokens === 111)

planeRequests = []
const forcedBody = JSON.stringify({
  model: 'MiniMax-Text-01',
  max_tokens: 180,
  temperature: 0.2,
  messages: [{ role: 'user', content: '【地点种子】\n灯塔\n必须调用 submit_setting_draft，不能输出自然语言答案。' }],
  tools: [{ name: 'submit_setting_draft', description: '提交结构化设定草稿。', input_schema: originSchema }],
  tool_choice: { type: 'tool', name: 'submit_setting_draft' }
})
const forced = await (await capabilityFetch('https://api.minimaxi.com/anthropic/v1/messages', { body: forcedBody, signal: new AbortController().signal })).json()
const forcedTaskBody = planeRequests.find((request) => request.url.endsWith('/v1/pinax/tasks'))?.body
check('forced-tool 沿用 adapter 工具名且 maxTokens 收口到 ≥200', forcedTaskBody?.capability?.submitTool?.name === 'submit_setting_draft' && forcedTaskBody?.maxTokens === 200)
check('forced-tool 合成 content[0]=tool_use 且 input 即回执', forced.content?.[0]?.type === 'tool_use' && forced.content[0].input?.origin === receipt.origin)

planeRequests = []
globalThis.fetch = mockPlane({ taskStatus: 500, taskPayload: receipt })
const fellBack = await (await capabilityFetch('https://api.minimaxi.com/anthropic/v1/messages', { body: anthropicNativeBody(), signal: new AbortController().signal })).json()
check('capability 启动失败 → 同一请求回落漏斗 /complete 并合成兜底正文', planeRequests.some((request) => request.url.endsWith('/v1/pinax/complete'))
  && fellBack.content?.[0]?.text === JSON.stringify(receipt))

planeRequests = []
globalThis.fetch = mockPlane()
const fullChain = await runStructuredGeneration({
  schemaVersion: 1,
  schemaId: 'setting-field.v1',
  requestId: 'w11-capability-check',
  provider: { id: 'minimax', baseUrl: 'https://api.minimaxi.com/anthropic', apiKey: 'test-key', model: 'MiniMax-Text-01' },
  target: { worldbookId: 'wb', worldbookRevision: 'r1', sectionKey: 'world', fieldKeys: ['origin'] },
  context: { globalConstraints: '蒸汽与灵石并存的世界', userBrief: '生成起源' },
  options: { maxTokens: 240, temperature: 0.2, timeoutMs: 5000 }
}, { fetchImpl: capabilityFetch, cache: new Map() })
check('全链（adapter → capability fetchImpl → schema 校验）产出草稿', fullChain.drafts?.origin === receipt.origin && fullChain.mode === 'native-json-schema')

console.log(`capability-task-check: ${passed} 项全部通过`)
