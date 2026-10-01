// StoryAgent-beta 接入冒烟：不依赖运行中的适配器，进程内起一个脚本化 SSE 假适配器，
// 校验 src/services/agents/piAgent 桥件的全链路行为（快照构造 / kernel 现拼 / 流式聚合 /
// 契约逐帧校验 / trace 汇总）。vitest 预算已满（20 文件/200 用例），按仓库约定放 scripts/。
// 运行：node scripts/storyagent-beta-smoke.mjs   （exit 0 = 全部通过）
import * as http from 'node:http'
import {
  buildKernelPayload,
  buildResourceSnapshot,
  createPiNarrativeAgentBridge,
} from '../src/services/agents/storyagent/piNarrativeAgentBridge.js'
import {
  applyMention,
  buildKernelBlocks,
  filterMentions,
  mentionAtCursor,
  parseSlashCommand,
  routeAgentIntent,
  slashMatches,
} from '../src/services/agents/storyagent/panelComposer.js'
import { createAgentSessionStore } from '../src/services/agents/storyagent/agentSessionStore.js'
import { createStoryAgentEngine } from '../src/services/agents/storyagent/agentEngine.js'
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
    if (/^event: (task\.|reasoning\.)/m.test(raw)) return null
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
        `event: reasoning.delta\ndata: ${JSON.stringify({ requestId: body.requestId, at: Date.now(), delta: '推演药庐线：先查资料再动笔。' })}\n\n`,
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
  let reasoning = ''
  lastTaskId = 'sab_smoke_1'
  const run = await bridge.run({
    kernel: kernelInput,
    index: { revision: 'wrev_1', byDomain: { world: entries } },
    mode: 'auto',
    intent: '推进药庐线',
    formatInstructions: '若本轮产出叙事正文：纯正文，不要标题。',
    maxTokens: 1200,
    requestId: 'sab_smoke_req',
    taskId: lastTaskId,
    callbacks: {
      onChunk: ({ content }) => { chunks += content },
      onReasoning: ({ content }) => { reasoning += content },
    },
    onStatus: null
  })
  check('流式正文经 onChunk 完整聚合', chunks === '青梧镇的雨下了整夜。药庐的灯还亮着。')
  check('思维链增量经 onReasoning 聚合（reasoning.delta 扩展帧）', reasoning === '推演药庐线：先查资料再动笔。')
  check('trace 携带 reasoningChars', run.trace.reasoningChars === reasoning.length)
  check('finalContent 与 totalCalls 正确', run.ok && run.finalContent === chunks && run.totalCalls === 1)
  check('trace 携带 taskId/status（任务生命周期回传）', run.trace.taskId === lastTaskId && run.trace.status === 'completed')
  check('usage 透传', run.usage.totalTokens === 46)
  check('契约逐帧校验：5/5 契约帧通过，task/reasoning 扩展帧不计入', contractStats.total === 5 && contractStats.ok === 5)

  console.log('[3] healthz')
  const h = await bridge.healthz()
  check('healthz 可达', h?.ok === true)

  console.log('[4] composer 纯逻辑（@ 提及 / / 命令 / kernel 参考 blocks）')
  const mm = mentionAtCursor('雨夜。@沈砚', 7)
  check('@ 在非空白后不触发', mentionAtCursor('abc@沈', 5) === null)
  check('@ 光标判定（token/start，CJK 标点后可触发）', mm?.token === '沈砚' && mm?.start === 3)
  const cEntries = [
    { id: 'c1', title: '沈砚宁', type: '角色', summary: '女医。' },
    { id: 'k1', title: '引路符', type: '物品', summary: '指向安息之地。' },
  ]
  check('@ 候选按标题过滤', filterMentions(cEntries, '沈').length === 1 && filterMentions(cEntries, '').length === 2)
  const chapterCandidate = { id: 'ch_1', title: '第一章', type: '章节', summary: '雨夜药庐，三声轻叩。' }
  check('@ 候选含章节文件且可按类型过滤', filterMentions([...cEntries, chapterCandidate], '第一').length === 1 && filterMentions([...cEntries, chapterCandidate], '', 8).length === 3)
  const am = applyMention('雨夜。@沈砚 出门', 3, 2, '沈砚宁')
  check('@ 补全替换并带尾随空格', am.text === '雨夜。@沈砚宁 出门' && am.caret === '雨夜。@沈砚宁 '.length)
  check('/ 命令解析', parseSlashCommand('/mode continue')?.name === 'mode' && parseSlashCommand('/mode continue')?.args === 'continue' && parseSlashCommand('mode x') === null)
  check('/ 命令前缀过滤含 help', slashMatches('')[0]?.name === 'mode' && slashMatches('to')[0]?.name === 'tokens')
  check('资料管理命令已移出 / 域（refs/unref 归 @ chips）', slashMatches('refs').length === 0 && slashMatches('unref').length === 0)
  check('命令表对齐分工口径：/ 只含动作与配置 8 条', slashMatches('').length === 8)
  const refBlocks = buildKernelBlocks({ sceneText: '药庐雨夜。', firstEntry: cEntries[0], pinnedRefs: [cEntries[1]] })
  check('@ 钉住参考进入 kernel reference block', refBlocks.some((b) => b.kind === 'reference' && b.text.includes('@引路符')))
  const projBlocks = buildKernelBlocks({
    sceneText: '药庐雨夜。',
    project: { bookTitle: '雾港纪事', chapterTitle: '第一章', manuscriptTail: '沈砚宁听见三声轻叩。' },
  })
  check('项目上下文进入 kernel project block（书名/章节/正文尾）', projBlocks.some((b) => b.kind === 'project' && b.text.includes('《雾港纪事》') && b.text.includes('第一章') && b.text.includes('三声轻叩')))
  const skillBlocks = buildKernelBlocks({
    sceneText: '药庐雨夜。',
    skills: [{ id: 'dialogue-polish', label: '对白打磨', instruction: '删减解释性台词，让每句话带潜台词。' }],
  })
  check('已加载技法以 skills 能力块上行（工具装载语义，不经 composer 文本）', skillBlocks.some((b) => b.kind === 'skills' && b.text.includes('【对白打磨】')))
  check('未加载技法时无 skills 块', !buildKernelBlocks({ sceneText: 'x' }).some((b) => b.kind === 'skills'))
  const passthrough = buildKernelPayload({ revision: 'kr', serialization: { blocks: projBlocks } })
  check('预序列化 blocks 被桥件原样透传（含 project/reference）', passthrough.blocks.length === projBlocks.length && passthrough.blocks.some((b) => b.kind === 'project'))

  console.log('[5] 自动路由 routeAgentIntent（真值表）')
  const A = 'agent'
  const D = 'advisor'
  check('六个特定知识意图 → advisor', ['setting', 'foreshadowing', 'calculation', 'clues', 'character', 'free']
    .every((i) => routeAgentIntent({ intent: i, text: '写一段雨夜' }).engine === D))
  check('whole-book + 创作词表 → agent（creation-hint）', routeAgentIntent({ intent: 'whole-book', text: '帮我写一段雨夜开场' }).engine === A)
  check('whole-book + 无信号 → advisor（default-knowledge）', routeAgentIntent({ intent: 'whole-book', text: '这本书讲了什么' }).engine === D)
  check('whole-book + @ 钉住参考 → agent（pinned-refs 优先于文本）', routeAgentIntent({ intent: 'whole-book', text: '这本书讲了什么', hasPinnedRefs: true }).engine === A)
  check('whole-book + 线程已触碰 Agent → agent（agent-thread-active）', routeAgentIntent({ intent: 'whole-book', text: '这本书讲了什么', agentTouched: true }).engine === A)
  check('knowledge 意图优先级最高（即使有 @ 参考）', routeAgentIntent({ intent: 'setting', text: '写一段', hasPinnedRefs: true, agentTouched: true }).engine === D)

  console.log('[6] agentSessionStore（注入 fake storage，round-trip + 裁剪）')
  function createFakeStorage() {
    const map = new Map()
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }
  }
  const store = createAgentSessionStore(createFakeStorage())
  const sessionsFixture = [
    { sessionId: 'sas_a', title: '雨夜线', createdAt: 1, updatedAt: 2, messages: [{ id: 'm1', role: 'user', kind: 'agent', question: '写雨夜', intent: 'agent', createdAt: 1 }, { id: 'm2', role: 'assistant', kind: 'agent', text: '雨声如豆。'.repeat(400), thinking: '思'.repeat(5000), tools: ['world_lookup · search'], agentResult: { ok: true, model: 'm', taskId: 't', status: 'completed', steps: 1, calls: 1, tokens: 9 }, createdAt: 2 }] },
    { sessionId: 'sas_b', title: '备用', createdAt: 3, updatedAt: 4, messages: [] },
  ]
  store.saveAgentSessions('book_1', sessionsFixture, 'sas_a')
  const loaded = store.loadAgentSessions('book_1')
  check('round-trip：两会话 + 活动指针', loaded.sessions.length === 2 && loaded.activeSessionId === 'sas_a')
  check('thinking 持久化裁剪 ≤4000', (loaded.sessions[0].messages[1].thinking || '').length === 4000)
  check('agentResult 完整保留', loaded.sessions[0].messages[1].agentResult?.taskId === 't')
  const capped = Array.from({ length: 70 }, (_, i) => ({ id: `m${i}`, role: 'user', kind: 'agent', question: `q${i}`, createdAt: i }))
  store.saveAgentSessions('book_3', [{ sessionId: 'sas_big', title: '大', createdAt: 1, updatedAt: 1, messages: capped }], 'sas_big')
  const loadedCapped = store.loadAgentSessions('book_3')
  check('单会话消息裁剪 ≤60（保留最新）', loadedCapped.sessions[0].messages.length === 60 && loadedCapped.sessions[0].messages[59].question === 'q69')
  check('书隔离：未写过的书读出空', store.loadAgentSessions('book_2').sessions.length === 0)
  store.deleteAgentSession('book_3', 'sas_big')
  check('deleteAgentSession 生效', store.loadAgentSessions('book_3').sessions.length === 0)

  console.log('[7] agentEngine（fetchImpl 假 SSE：kernel 组装 / 流式 / 归属）')
  const engineCalls = []
  function sseResponse(frames) {
    return new Response(frames.join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const engineBridge = createPiNarrativeAgentBridge({
    endpoint: 'http://engine.test',
    // 与 Authoring.vue 生产接线一致：契约帧过 parser，task/reasoning 扩展帧放行为 null
    parseEvent: (raw) => (/^event: (task\.|reasoning\.)/m.test(raw) ? null : parseNarrativeAgentSseEvent(raw)),
    fetchImpl: async (url, opts) => {
      engineCalls.push({ url: String(url), opts })
      const urlText = String(url)
      if (urlText.endsWith('/cancel')) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (urlText.endsWith('/tasks/list')) return new Response(JSON.stringify({ tasks: [{ taskId: 't9', status: 'completed' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (urlText.endsWith('/v1/pinax/tasks') || urlText.endsWith('/resume')) {
        const body = JSON.parse(opts.body)
        return sseResponse([
          `event: reasoning.delta\ndata: ${JSON.stringify({ requestId: body.requestId, delta: '先看正文再动笔。' })}\n\n`,
          `event: text.delta\ndata: ${JSON.stringify({ schemaVersion: 1, type: 'text.delta', requestId: body.requestId, seq: 1, content: '叩门声停了。' })}\n\n`,
          `event: task.completed\ndata: ${JSON.stringify({ requestId: body.requestId, status: 'completed', taskId: body.taskId, model: 'dots.dots3-note-prev', steps: 1, toolCalls: 0 })}\n\n`,
        ])
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const engine = createStoryAgentEngine({
    bridge: engineBridge,
    projectId: 'book_1',
    resolveContext: () => ({
      bookTitle: '雾港纪事', chapterTitle: '第一章', manuscriptTail: '沈砚宁听见三声轻叩。',
      worldEntries: [{ id: 'c1', title: '沈砚宁', type: '角色', summary: '女医。' }],
      chapterEntries: [chapterCandidate],
    }),
  })
  let engineText = ''
  let engineThinking = ''
  const engineRun = await engine.run({
    text: '写一段雨夜',
    pinnedRefs: [chapterCandidate],
    taskId: 'engtask_1',
    callbacks: { onChunk: ({ content }) => { engineText += content }, onReasoning: ({ content }) => { engineThinking += content } },
  })
  const engineBody = JSON.parse(engineCalls[0].opts.body)
  check('engine kernel 含 project block（书名/正文尾）', engineBody.kernel.blocks.some((b) => b.kind === 'project' && b.text.includes('《雾港纪事》') && b.text.includes('三声轻叩')))
  check('engine kernel 含 reference block（@ 章节）', engineBody.kernel.blocks.some((b) => b.kind === 'reference' && b.text.includes('@第一章')))
  check('engine 资源快照映射 world_lookup', engineBody.resources.domains.world_lookup?.length === 1)
  check('engine 归属 bookId 上行', engineBody.bookId === 'book_1')
  check('engine 流式正文聚合', engineText === '叩门声停了。' && engineRun.finalContent === engineText)
  check('engine 思维链聚合 + trace.reasoningChars', engineThinking === '先看正文再动笔。' && engineRun.trace.reasoningChars === engineThinking.length)
  const engineResume = await engine.resume({ text: '接着写', taskId: 'engtask_1', callbacks: {} })
  check('engine.resume 走 /resume 且携带归属', engineCalls.some((c) => c.url.endsWith('/resume')) && JSON.parse(engineCalls.find((c) => c.url.endsWith('/resume')).opts.body).bookId === 'book_1')
  check('engine.resume trace 补全（status/steps/reasoningChars）', engineResume.trace.status === 'completed' && typeof engineResume.trace.steps === 'number' && typeof engineResume.trace.reasoningChars === 'number')
  await engine.cancel('engtask_1')
  check('engine.cancel 走 /cancel 端点', engineCalls.some((c) => c.url.endsWith('/cancel')))
  check('engine.tasks 走 /tasks/list', await (async () => { await engine.tasks(); return engineCalls.some((c) => c.url.endsWith('/tasks/list')) })())
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
