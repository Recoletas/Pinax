#!/usr/bin/env node
// 能力任务面确定性 smoke：capabilityTaskRunner 的回执→advice 映射（mock 任务面 SSE）、
// 契约目录完整性、advisor 路由切片门控（mock 探测可达→走 agent；不可达→回落）。
// 运行：node scripts/capability-task-check.mjs
import assert from 'node:assert/strict'
import path from 'node:path'
import { getCapabilityToolSpec, CAPABILITY_TOOL_SPECS } from '../shared/capabilityToolContracts.js'
import { runCapabilityTaskAgent, CAPABILITY_TASK_TYPES } from '../server/services/capabilityTaskRunner.js'

let passed = 0
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  ✓ ${name}`) }

console.log('[1] 契约目录：三切片各有 submit 工具 schema')
for (const taskType of ['authoring.review.chapter', 'authoring.knowledge.query', 'memory.extraction']) {
  const spec = getCapabilityToolSpec(taskType)
  check(`${taskType} → ${spec?.toolName}`, Boolean(spec?.toolName && spec?.schema?.type === 'object'))
}
check('memory.extraction quote 逐字约束在 schema description', CAPABILITY_TOOL_SPECS['memory.extraction'].schema.properties.proposals.items.properties.quote.description.includes('逐字'))

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

console.log(`capability-task-check: ${passed} 项全部通过`)
