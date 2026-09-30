// StoryAgent-beta 接入冒烟：不依赖运行中的适配器，进程内起一个脚本化 SSE 假适配器，
// 校验 src/services/agents/piAgent 桥件的全链路行为（快照构造 / kernel 现拼 / 流式聚合 /
// 契约逐帧校验 / trace 汇总）。vitest 预算已满（20 文件/200 用例），按仓库约定放 scripts/。
// 运行：node scripts/storyagent-beta-smoke.mjs   （exit 0 = 全部通过）
import * as http from 'node:http'
import {
  buildKernelPayload,
  buildResourceSnapshot,
  createPiNarrativeAgentBridge
} from '../src/services/agents/storyagent/piNarrativeAgentBridge.js'
import { parseNarrativeAgentSseEvent } from '../shared/narrativeAgentStreamContract.js'

const failures = []
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures.push(name)
    console.error(`  ✗ ${name}`)
  }
}

function sse(res, frames) {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const f of frames) res.write(f)
  res.end()
}

const entries = [
  { id: 'c_yanning', title: '沈砚宁', type: '角色', summary: '青梧镇药庐女医。' },
  { id: 'k_talisman', title: '引路符', type: '物品', text: '燃尽后可指向亡者安息之地。' }
]
const kernelInput = {
  revision: 'krev_1',
  scene: { summary: '青梧镇药庐，雨夜。' },
  character: { name: '沈砚宁', profile: '女医，善辨百草。' }
}
const kernel = buildKernelPayload(kernelInput)
const resources = buildResourceSnapshot({ revision: 'wrev_1', byDomain: { world: entries } })

let lastTaskId = ''
const contractStats = { total: 0, ok: 0 }
const bridge = createPiNarrativeAgentBridge({
  endpoint: 'http://127.0.0.1:8471',
  parseEvent: (raw) => {
    if (/^event: task\./m.test(raw)) return null
    const ev = parseNarrativeAgentSseEvent(raw)
    contractStats.total += 1
    if (ev) contractStats.ok += 1
    return ev
  }
})

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, service: 'pinax-adapter', port: 8471 }))
  }
  if (req.method === 'POST' && req.url === '/v1/pinax/tasks') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
      // 请求形状校验：桥件必须产出适配器 validate() 要求的全部字段
      check('请求含 requestId/mode/kernel.blocks/resources.domains', Boolean(
        body.requestId && ['init', 'continue', 'auto', 'respond'].includes(body.mode)
        && Array.isArray(body.kernel?.blocks) && body.kernel.blocks.length > 0
        && body.resources && typeof body.resources.domains === 'object'
      ))
      check('请求携带客户端指定 taskId', body.taskId === lastTaskId)
      check('世界书资料映射为 world_lookup 快照', body.resources.domains.world_lookup?.length === 2)
      sse(res, [
        `event: step.start\ndata: ${JSON.stringify({ schemaVersion: 1, type: 'step.start', requestId: body.requestId, seq: 1, stepIndex: 0, toolChoice: 'auto' })}\n\n`,
        `event: tool.call\ndata: ${JSON.stringify({ schemaVersion: 1, type: 'tool.call', requestId: body.requestId, seq: 2, callId: 'c1', toolName: 'world_lookup', action: 'search' })}\n\n`,
        `event: text.delta\ndata: ${JSON.stringify({ schemaVersion: 1, type: 'text.delta', requestId: body.requestId, seq: 3, content: '青梧镇的雨下了整夜。' })}\n\n`,
        `event: text.delta\ndata: ${JSON.stringify({ schemaVersion: 1, type: 'text.delta', requestId: body.requestId, seq: 4, content: '药庐的灯还亮着。' })}\n\n`,
        `event: usage\ndata: ${JSON.stringify({ schemaVersion: 1, type: 'usage', requestId: body.requestId, seq: 5, usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 } })}\n\n`,
        `event: task.completed\ndata: ${JSON.stringify({ requestId: body.requestId, status: 'completed', taskId: body.taskId, model: 'mock.mock-model', steps: 2, toolCalls: 1 })}\n\n`
      ])
    })
    return
  }
  res.writeHead(404)
  res.end()
})

await new Promise((r) => server.listen(8471, '127.0.0.1', r))
try {
  console.log('[1] buildResourceSnapshot / buildKernelPayload（鸭子类型输入）')
  check('byDomain 普通对象可用，world → world_lookup', resources.domains.world_lookup?.length === 2)
  check('快照条目字段收敛为 id/title/type/summary', resources.domains.world_lookup[0].title === '沈砚宁')
  check('kernel 缺 serialization 时现拼有界块（scene+character）', kernel.blocks.length >= 2)

  console.log('[2] bridge.run 全链路（脚本化 SSE 假适配器）')
  let chunks = ''
  lastTaskId = 'sab_smoke_1'
  const run = await bridge.run({
    kernel: kernelInput,
    index: { revision: 'wrev_1', byDomain: { world: entries } },
    mode: 'auto',
    intent: '推进药庐线',
    formatInstructions: '输出纯叙事正文，不要标题。',
    maxTokens: 1200,
    requestId: 'sab_smoke_req',
    taskId: lastTaskId,
    callbacks: { onChunk: ({ content }) => { chunks += content } },
    onStatus: null
  })
  check('流式正文经 onChunk 完整聚合', chunks === '青梧镇的雨下了整夜。药庐的灯还亮着。')
  check('finalContent 与 totalCalls 正确', run.ok && run.finalContent === chunks && run.totalCalls === 1)
  check('trace 携带 taskId/status（任务生命周期回传）', run.trace.taskId === lastTaskId && run.trace.status === 'completed')
  check('usage 透传', run.usage.totalTokens === 46)
  check('契约逐帧校验：5/5 契约帧通过，task 生命周期帧不计入', contractStats.total === 5 && contractStats.ok === 5)

  console.log('[3] healthz')
  const h = await bridge.healthz()
  check('healthz 可达', h?.ok === true)
} finally {
  server.closeAllConnections?.()
  server.close()
}

if (failures.length) {
  console.error(`\nstoryagent-beta-smoke: ${failures.length} 项失败`)
  process.exitCode = 1
} else {
  console.log('\nstoryagent-beta-smoke: 全部通过')
}
