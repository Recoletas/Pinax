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
import { createAuthoringAssistantConversationStore } from '../src/services/agents/authoring/authoringAssistantConversationStore.js'
import { createBrowserStorageRepository } from '../src/services/storage/browserStorageRepository.js'
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
    if (/^event: (task\.|reasoning\.|beat\.)/m.test(raw)) return null
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
        `event: beat.plan\ndata: ${JSON.stringify({ requestId: body.requestId, at: Date.now(), plan: { revision: 'bp_smoke1', responseObligation: '回应叩门', causalSteps: ['沈砚宁起身开门'], revealOrChange: '门外站着她的旧识', endCondition: '门开着，两人对视' } })}\n\n`,
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
  const completeChapter = '段落。'.repeat(3200) + '只有章末才有的句子。'
  const fullSnapshot = buildResourceSnapshot({ currentChapterId: 'long-current', byDomain: {
    manuscript: [{ id: 'long-current', text: completeChapter }],
    world: [{ id: 'source-setting', type: 'worldbook', entryType: 'source', text: '参考作品的人物' }]
  } })
  check('当前长章完整快照含章末，声明完整来源', fullSnapshot.domains.manuscript[0].text === completeChapter && fullSnapshot.coverage.manuscript.completeSourceIds.includes('long-current'))
  check('导入来源保持资料类型', fullSnapshot.domains.world_lookup[0].type === 'source')
  const clearedSnapshot = buildResourceSnapshot({ currentChapterId: 'cleared', byDomain: {
    manuscript: [{ id: 'cleared', text: '', content: '已清空的旧稿', summary: '旧稿摘要' }]
  } })
  check('清空当前章不会从旧稿或摘要回填', clearedSnapshot.domains.manuscript[0].text === '' && clearedSnapshot.domains.manuscript[0].summary === '' && clearedSnapshot.domains.manuscript[0].sourceLength === 0)

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
  check('BeatPlan 规划轮（②）：beat.plan 扩展帧 → run.beatPlan 外露', run.beatPlan?.revision === 'bp_smoke1' && run.beatPlan.responseObligation === '回应叩门')
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

  console.log('[6] 统一 conversation store（注入 fake storage，round-trip + 完整历史）')
  function createFakeStorage() {
    const map = new Map()
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }
  }
  const canonicalStore = createAuthoringAssistantConversationStore({ storage: createBrowserStorageRepository(createFakeStorage()) })
  const store = {
    saveAgentSessions(bookId, sessions, activeSessionId) {
      return canonicalStore.saveConversation(bookId, { messages: [], activeSessionId, agentSessions: sessions.map(session => ({ ...session, projectId: bookId, messages: session.messages.map(message => ({ ...message, projectId: bookId, status: message.role === 'assistant' ? 'completed' : '', taskId: message.agentResult?.taskId || '' })) })) }).ok
    },
    loadAgentSessions(bookId) { const record = canonicalStore.load(bookId).conversation; return { sessions: record?.agentSessions || [], activeSessionId: record?.activeSessionId || '' } },
    deleteAgentSession(bookId, sessionId) { const record = canonicalStore.load(bookId).conversation; return canonicalStore.saveConversation(bookId, { ...record, agentSessions: record.agentSessions.filter(session => session.sessionId !== sessionId) }).ok }
  }
  const sessionsFixture = [
    { sessionId: 'sas_a', title: '雨夜线', createdAt: 1, updatedAt: 2, messages: [{ id: 'm1', role: 'user', kind: 'agent', question: '写雨夜', intent: 'agent', createdAt: 1 }, { id: 'm2', role: 'assistant', kind: 'agent', text: '雨声如豆。'.repeat(400), thinking: '思'.repeat(5000), tools: ['world_lookup · search'], agentResult: { ok: true, model: 'm', taskId: 't', status: 'completed', steps: 1, calls: 1, tokens: 9 }, createdAt: 2 }] },
    { sessionId: 'sas_b', title: '备用', createdAt: 3, updatedAt: 4, messages: [] },
  ]
  store.saveAgentSessions('book_1', sessionsFixture, 'sas_a')
  const loaded = store.loadAgentSessions('book_1')
  check('round-trip：两会话 + 活动指针', loaded.sessions.length === 2 && loaded.activeSessionId === 'sas_a')
  check('thinking 持久化裁剪 ≤4000', (loaded.sessions.find(session => session.sessionId === sessionsFixture[0].sessionId).messages[1].thinking || '').length === 4000)
  check('任务 ID 与完成状态保留', loaded.sessions.find(session => session.sessionId === sessionsFixture[0].sessionId).messages[1].taskId === 't' && loaded.sessions.find(session => session.sessionId === sessionsFixture[0].sessionId).messages[1].status === 'completed')
  const fullHistory = Array.from({ length: 70 }, (_, i) => ({ id: `m${i}`, role: 'user', kind: 'agent', question: `q${i}`, createdAt: i }))
  store.saveAgentSessions('book_3', [{ sessionId: 'sas_big', title: '大', createdAt: 1, updatedAt: 1, messages: fullHistory }], 'sas_big')
  const restoredHistory = store.loadAgentSessions('book_3').sessions[0].messages
  check('单会话完整历史保留（含首尾身份和内容）', restoredHistory.length === fullHistory.length
    && restoredHistory[0].id === fullHistory[0].id && restoredHistory[0].question === fullHistory[0].question
    && restoredHistory.at(-1).id === fullHistory.at(-1).id && restoredHistory.at(-1).question === fullHistory.at(-1).question)
  check('书隔离：未写过的书读出空', store.loadAgentSessions('book_2').sessions.length === 0)
  store.deleteAgentSession('book_3', 'sas_big')
  check('deleteAgentSession 生效', store.loadAgentSessions('book_3').sessions.length === 0)

  console.log('[7] agentEngine（fetchImpl 假 SSE：kernel 组装 / 流式 / 归属）')
  const engineCalls = []
  let engineExecutionActive = false
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
      if (urlText.endsWith('/cancel')) { engineExecutionActive = false; return new Response(JSON.stringify({ ok: true, stopped: true, taskId: urlText.split('/').at(-2), status: 'cancelled' }), { status: 200, headers: { 'content-type': 'application/json' } }) }
      if (urlText.includes('/tasks/list?')) return new Response(JSON.stringify({ tasks: [{ taskId: 't9', status: 'completed' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      if (opts.method !== 'POST' && /\/v1\/pinax\/tasks\/[^/]+$/.test(urlText)) return Response.json({ taskId: urlText.split('/').at(-1), bookId: 'book_1', status: engineExecutionActive ? 'running' : 'completed', executionActive: engineExecutionActive })
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
  check('engine kernel 含作品目录与正文上下文', engineBody.kernel.blocks.some(b => b.kind === 'workspace' && b.text.includes('《雾港纪事》') && b.text.includes('/works/book_1')) && engineBody.kernel.blocks.some(b => b.kind === 'manuscript-context' && b.text.includes('三声轻叩')) && !engineBody.kernel.blocks.some(b => b.kind === 'project'))
  check('engine kernel 含 reference block（@ 章节）', engineBody.kernel.blocks.some((b) => b.kind === 'reference' && b.text.includes('@第一章')))
  check('engine 资源快照映射 world_lookup', engineBody.resources.domains.world_lookup?.length === 1)
  check('engine 归属 bookId 上行', engineBody.bookId === 'book_1')
  check('engine 流式正文聚合', engineText === '叩门声停了。' && engineRun.finalContent === engineText)
  check('engine 思维链聚合 + trace.reasoningChars', engineThinking === '先看正文再动笔。' && engineRun.trace.reasoningChars === engineThinking.length)
  const engineResume = await engine.resume({ text: '接着写', taskId: 'engtask_1', callbacks: {} })
  check('engine.resume 走 /resume 且携带归属', engineCalls.some((c) => c.url.endsWith('/resume')) && JSON.parse(engineCalls.find((c) => c.url.endsWith('/resume')).opts.body).bookId === 'book_1')
  check('engine.resume trace 补全（status/steps/reasoningChars）', engineResume.trace.status === 'completed' && typeof engineResume.trace.steps === 'number' && typeof engineResume.trace.reasoningChars === 'number')
  engineExecutionActive = true
  await engine.cancel('engtask_1')
  check('engine.cancel 走 /cancel 端点', engineCalls.some((c) => c.url.endsWith('/cancel')))
  check('engine.tasks 走 /tasks/list', await (async () => { await engine.tasks(); return engineCalls.some((c) => c.url.includes('/tasks/list?')) })())

  console.log('[7a] 实际 HTTP 断流、停止确认与同任务续接竞争')
  const recoveryTasks = new Map()
  const taskRecord = id => {
    if (!recoveryTasks.has(id)) recoveryTasks.set(id, { taskId: id, active: true, status: 'running', creates: 0, resumes: [], cancels: 0, stop: 'immediate' })
    return recoveryTasks.get(id)
  }
  const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
  const recoveryServer = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
    const pieces = req.url.split('/').filter(Boolean)
    const task = taskRecord(body.taskId || pieces[3]), action = pieces[4]
    if (req.method === 'GET') return json(res, 200, { taskId: task.taskId, bookId: 'race-book', status: task.status, executionActive: task.active, interrupted: task.status === 'running' && !task.active })
    if (action === 'cancel') {
      task.cancels++
      if (task.stop === 'fail') return json(res, 409, { ok: false, stopped: false, error: 'task-not-active', status: task.status, taskId: task.taskId })
      if (task.stop === 'deferred') { task.cancelResponse = res; task.cancelArrived?.(); return }
      if (task.stop !== 'false-receipt') { task.active = false; task.status = 'cancelled' }
      return json(res, 200, { ok: true, stopped: true, status: 'cancelled', taskId: task.taskId })
    }
    if (action === 'narrative-result') {
      task.active = false; task.status = 'cancelled'
      return json(res, 409, { ok: false, error: 'generation-request-not-active', taskId: task.taskId })
    }
    if (action === 'resume') {
      task.resumes.push(body)
      if (task.conflict) task.active = true
      if (task.active) return json(res, 409, { error: 'task-already-running', taskId: task.taskId })
      task.status = 'completed'
      return sse(res, [`event: task.completed\ndata: ${JSON.stringify({ taskId: task.taskId, bookId: 'race-book', status: 'completed', finalText: '同一任务续接完成。' })}\n\n`])
    }
    task.creates++; task.stream = res
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`event: task.started\ndata: ${JSON.stringify({ taskId: task.taskId, bookId: 'race-book', status: 'running' })}\n\n`)
    if (task.generationConflict) res.write(`event: narrative.request\ndata: ${JSON.stringify({ bookId: 'race-book', callId: 'draft', nonce: 'nonce', request: {} })}\n\n`)
  })
  await new Promise(resolve => recoveryServer.listen(0, '127.0.0.1', resolve))
  try {
    const recovering = createPiNarrativeAgentBridge({ endpoint: `http://127.0.0.1:${recoveryServer.address().port}` })
    const args = taskId => ({ taskId, bookId: 'race-book', kernel: kernelInput, index: {}, intent: '用户明确要求的本轮续写' })
    const dropRun = taskId => recovering.run({ ...args(taskId), callbacks: { onTask: (_, event) => { if (event === 'task.started') taskRecord(taskId).stream.destroy() } } }).catch(error => error)
    const delayed = taskRecord('stop-and-resume'); delayed.stop = 'deferred'
    const cancelArrived = new Promise(resolve => { delayed.cancelArrived = resolve })
    const dropped = dropRun(delayed.taskId)
    await cancelArrived
    const stopping = recovering.cancel(delayed.taskId)
    const waitingResume = recovering.resume(args(delayed.taskId))
    await new Promise(resolve => setImmediate(resolve))
    check('断流清理与手动停止共用一次取消，确认前不发送续接', delayed.cancels === 1 && delayed.resumes.length === 0)
    delayed.active = false; delayed.status = 'cancelled'
    json(delayed.cancelResponse, 200, { ok: true, stopped: true, status: 'cancelled', taskId: delayed.taskId })
    const [dropError, stopReceipt, continued] = await Promise.all([dropped, stopping, waitingResume])
    check('停止真实落定后沿原任务续聊一次，当前输入与会话未替换', dropError instanceof Error && stopReceipt.stopped && continued.ok && continued.trace.taskId === delayed.taskId && delayed.creates === 1 && delayed.resumes.length === 1 && delayed.resumes[0].intent === args(delayed.taskId).intent)

    const failedStop = taskRecord('unconfirmed-stop'); failedStop.stop = 'fail'
    const unconfirmed = await dropRun(failedStop.taskId)
    const refused = await recovering.resume(args(failedStop.taskId)).catch(error => error)
    check('停止失败不吞，后续续接重新核对且不向仍运行任务重发', unconfirmed.code === 'AGENT_TASK_STOP_UNCONFIRMED' && refused.code === 'AGENT_TASK_STOP_UNCONFIRMED' && refused.executionActive === true && failedStop.resumes.length === 0)
    failedStop.active = false; failedStop.status = 'cancelled'
    const recovered = await recovering.resume(args(failedStop.taskId))
    check('任务后来已停止可据状态恢复，无新建任务或额外取消', recovered.ok && failedStop.creates === 1 && failedStop.resumes.length === 1 && failedStop.cancels === 1)

    const busyTask = taskRecord('normal-active')
    const busyError = await recovering.waitForTaskIdle(busyTask.taskId, { bookId: 'race-book' }).catch(error => error)
    check('未要求取消的正常任务立即报告真实运行状态，不等待或擅自停止', busyError.code === 'task-already-running' && busyError.executionActive === true && busyTask.cancels === 0 && busyTask.resumes.length === 0)
    const actualStop = await recovering.cancel(busyTask.taskId)
    check('已失去本地busy的任务仍可获得真实停止回执', actualStop.stopped && actualStop.cancelled && busyTask.cancels === 1)

    const falseReceipt = taskRecord('false-stop-receipt'); falseReceipt.stop = 'false-receipt'
    const falseStop = await recovering.cancel(falseReceipt.taskId).catch(error => error)
    check('stopped回执不能覆盖executionActive仍为true的事实', falseStop.code === 'AGENT_TASK_STOP_UNCONFIRMED' && falseStop.executionActive === true)

    const generationConflict = taskRecord('generation-conflict'); generationConflict.generationConflict = true
    const generationError = await recovering.run({ ...args(generationConflict.taskId), callbacks: { onNarrativeRequest: async () => ({ text: '已保存的草稿。' }) } }).catch(error => error)
    check('正文回传409按实际错误解释，不冒充任务仍在运行', generationError.code === 'generation-request-not-active' && !generationError.message.includes('仍在运行') && generationConflict.cancels === 0)

    const raced = taskRecord('resume-race'); raced.active = false; raced.status = 'completed'; raced.conflict = true
    const raceError = await recovering.resume(args(raced.taskId)).catch(error => error)
    check('对账后另一owner抢先启动时不自动重试已发送输入或取消对方', raceError.code === 'task-already-running' && raced.resumes.length === 1 && raced.cancels === 0 && raced.creates === 0)
  } finally { recoveryServer.closeAllConnections(); await new Promise(resolve => recoveryServer.close(resolve)) }

  console.log('[7b] toolManifest 转换接口 + calc（P2 起 canonical 在 storyflow-kit）')
  {
    let mod = null
    try { mod = await import('../../storyflow-kit/storyharness/src/pinax/toolManifest.ts') } catch { /* kit 仓不在场——环境性跳过 */ }
    if (!mod) {
      console.log('  （kit 仓不在场，跳过 toolManifest 段）')
    } else {
      const { manifestToAgentTool, safeCalcEval } = mod
      const tool = manifestToAgentTool({
        id: 'calc_evaluate', title: '确定性算术', desc: '复算数值', kind: 'query', knowledge: [],
        execute: async (p) => { try { return JSON.stringify({ ok: true, value: safeCalcEval(String(p.expression)) }) } catch (e) { return JSON.stringify({ ok: false, error: String(e.message || e) }) } },
      })
      check('KitOp 形状清单 → agent 工具（name/描述/knowledge 标注）', tool.name === 'calc_evaluate' && tool.label === '确定性算术' && tool.description.includes('复算数值'))
      const out = JSON.parse((await tool.execute('x', { expression: '1200 * 3 + 450 / 2' })).content[0].text)
      check('calc 复算确定性求值', out.ok === true && out.value === 3825)
      const bad = JSON.parse((await tool.execute('x', { expression: '2 + evil()' })).content[0].text)
      check('白名单外输入拒绝（无 eval）', bad.ok === false)
      const msTool = manifestToAgentTool({ id: 'manuscript_search', title: '正文检索', desc: 'd', knowledge: ['manuscript'], execute: async () => JSON.stringify({ ok: true, hits: [] }) })
      check('知识域标注进工具描述', msTool.description.includes('manuscript'))
    }
  }

  console.log('[7c] 桥快照新域（manuscript/notes/outline）映射')
  {
    const ext = buildResourceSnapshot({ revision: 'rev_ext', byDomain: { world: entries, manuscript: [{ id: 'ch_1', title: '第一章', text: '沈砚宁听见三声轻叩。' }], notes: [{ id: 'n1', title: '速记', text: '伏笔：断线的风筝' }], outline: [{ id: 'o1', title: '第一卷', text: '收束于码头对峙' }] } })
    check('manuscript 域映射为 manuscript 工具数据', ext.domains.manuscript?.length === 1 && ext.domains.manuscript[0].text.includes('轻叩'))
    check('notes/outline 域随快照上行', ext.domains.notes?.length === 1 && ext.domains.outline?.length === 1)
  }

    console.log('[7d] adoptToChapter 采纳链（合成 turn 过 eligibility + 指纹去重）')
  {
    const { adoptStoryAgentTextToChapter } = await import('../src/services/agents/storyagent/adoptToChapter.js')
    const books = [{ id: 'b1', title: '测试书', worldbookId: '', chapters: [{ id: 'c1', title: '第一章', content: '', editorDocument: null }] }]
    const r1 = adoptStoryAgentTextToChapter({ books, bookId: 'b1', chapterId: 'c1', text: '沈砚宁把罗盘揣进围裙，潮水正在回来。', sourceId: 'task_x1' })
    check('首次采纳：ok + unitId + 正文写入章节', r1.ok === true && JSON.stringify(r1.books).includes('罗盘'))
    const r2 = adoptStoryAgentTextToChapter({ books: r1.books, bookId: 'b1', chapterId: 'c1', text: '沈砚宁把罗盘揣进围裙，潮水正在回来。', sourceId: 'task_x1' })
    check('重复采纳：指纹去重 already-imported', r2.ok === false && r2.reason === 'already-imported')
    const r3 = adoptStoryAgentTextToChapter({ books: r1.books, bookId: 'b1', chapterId: 'c1', text: '第二段不同的内容，潮水正在回来。', sourceId: 'task_x2' })
    check('不同来源可再次追加', r3.ok === true)
    check('空文本拒绝', adoptStoryAgentTextToChapter({ books: r1.books, bookId: 'b1', chapterId: 'c1', text: '   ', sourceId: 't' }).ok === false)
  }

    console.log('[8] experienceAgentRoute（体验侧开关路由：映射 + 不可达回落）')
  {
    const { createExperiencePiAgentRoute, experiencePiAgentEnabled } = await import('../src/services/agents/storyagent/experienceAgentRoute.js')
    check('localStorage 缺失环境默认关闭', experiencePiAgentEnabled() === false)
    const deadRoute = createExperiencePiAgentRoute({ endpoint: 'http://127.0.0.1:8499' })
    check('适配器不可达 → run() 返回 null（协调器回落本体循环）', (await deadRoute.run({ kernel: kernelInput, index: { revision: 'w', byDomain: { world: entries } } })) === null)
    const liveRoute = createExperiencePiAgentRoute({ endpoint: 'http://127.0.0.1:8471' })
    lastTaskId = 'sab_route_1'
    const mapped = await liveRoute.run({ kernel: kernelInput, index: { revision: 'wrev_1', byDomain: { world: entries } }, mode: 'auto', intent: '推进', requestId: 'exp_route_1', taskId: lastTaskId })
    if (!(mapped && mapped.finalText === '青梧镇的雨下了整夜。药庐的灯还亮着。' && mapped.trace.taskId === lastTaskId && mapped.usage.totalTokens === 46 && Array.isArray(mapped.finalToolResults))) {
      console.error('[dbg] mapped =', JSON.stringify(mapped)?.slice(0, 400))
    }
    check('返回形状对齐 runNarrativeAgentGeneration 消费面（finalText/trace/usage/finalToolResults）', Boolean(
      mapped && mapped.finalText === '青梧镇的雨下了整夜。药庐的灯还亮着。'
      && mapped.trace.taskId === lastTaskId
      && mapped.usage.totalTokens === 46
      && Array.isArray(mapped.finalToolResults)
    ))
  }
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
