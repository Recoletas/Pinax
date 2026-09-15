/* global process */

// B5 会话故障矩阵：覆盖 gameStoreSession.test.js 未触及的保存调度/隔离语义
// （显式 eval，不占核心 vitest 预算）。运行：
//   node scripts/experience-session-fault-matrix.mjs
// 覆盖：快速切会话旧 timer 不串、配额失败内存保留、两 store 实例写手隔离、
// 旧存档往返、恢复投影继续、新调度模块反向接线核查。

import { register } from 'node:module'
import assert from 'node:assert/strict'

register('./lib/arch-node-resolve.mjs', import.meta.url)

// localStorage polyfill（可注入配额失败）
const storageMap = new Map()
let failWrites = false
globalThis.localStorage = {
  getItem: (key) => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, value) => {
    if (failWrites) throw new Error('QuotaExceededError')
    storageMap.set(key, String(value))
  },
  removeItem: (key) => { storageMap.delete(key) },
  clear: () => storageMap.clear()
}
// window/document 最小 polyfill：让 scheduler 的 unload 注册走同一条代码路径，
// 并满足 axios 平台探测（window.location.href）。
globalThis.window = Object.assign(globalThis, {
  location: { href: 'http://localhost/' },
  addEventListener() {}
})
globalThis.document = { hidden: false, addEventListener() {} }
// navigator polyfill：Node 21+ 已有只读 getter 的全局 navigator，不得赋值；
// 仅在完全缺失（旧 Node/受限环境）时以可配置属性补一个受控值。
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'node' }
  })
}

const { createPinia, setActivePinia } = await import('pinia')
const { useGameStore } = await import('../src/stores/gameStore.js')
const { STORAGE_KEYS } = await import('../src/composables/useStorage.js')

const checks = []
function check(name, fn) { checks.push([name, fn]) }

function freshStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return useGameStore()
}

function readPersistedSessions() {
  const raw = storageMap.get(STORAGE_KEYS.WRITING_SESSIONS)
  return raw ? JSON.parse(raw) : null
}

check('旧存档（无 schemaVersion/legacy worldState）加载 → 保存 → 再加载等价', () => {
  storageMap.clear()
  const legacySession = {
    id: 'sess_legacy1',
    title: '旧档',
    createdAt: 1000,
    updatedAt: 1000,
    worldId: 'wb-old',
    messages: [{ role: 'assistant', content: '第一段回应' }],
    chatHistory: [{ role: 'user', content: '你好' }],
    worldState: { character: { name: '林舟' }, time: { day: 2, period: '黄昏' }, worldMap: {}, activities: [] },
    runtimeState: { player: { vitality: 77, maxVitality: 100 }, flags: { metKeeper: true }, writingCharacter: { name: '林舟' } }
  }
  storageMap.set(STORAGE_KEYS.WRITING_SESSIONS, JSON.stringify([legacySession]))
  const store = freshStore()
  store.loadSessions()
  assert.equal(store.loadSession('sess_legacy1').id, 'sess_legacy1')
  assert.equal(store.player.vitality, 77)
  assert.equal(store.writingCharacter.name, '林舟')
  store.messages = [{ role: 'assistant', content: '继续的第二段' }]
  store.saveCurrentSession()
  store.flushSaveSessions()
  // 再加载
  const store2 = freshStore()
  store2.loadSessions()
  const reloaded = store2.loadSession('sess_legacy1')
  assert.equal(reloaded.messages[0].content, '继续的第二段')
  assert.equal(reloaded.schemaVersion, 1)
  assert.equal(reloaded.worldbookId, 'wb-old')
})

check('快速 A/B 切会话：A 的待写 timer 不覆盖 B 的保存', async () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  const a = store.createSession({ title: 'A' })
  store.messages = [{ role: 'assistant', content: 'A 的内容' }]
  store.saveCurrentSession()
  // 去抖写盘尚未 flush（500ms trailing）
  const b = store.createSession({ title: 'B' })
  assert.notEqual(b.id, a.id)
  assert.equal(store.currentSessionId, b.id)
  store.messages = [{ role: 'assistant', content: 'B 的内容' }]
  store.saveCurrentSession()
  store.flushSaveSessions()
  const persisted = readPersistedSessions()
  const aSaved = persisted.find((item) => item.id === a.id)
  const bSaved = persisted.find((item) => item.id === b.id)
  assert.equal(aSaved.messages[0].content, 'A 的内容')
  assert.equal(bSaved.messages[0].content, 'B 的内容')
  // 切回 A 继续读：loadSession 覆盖当前状态且不丢 B
  store.loadSession(a.id)
  assert.deepEqual(store.messages.map((m) => m.content), ['A 的内容'])
  store.flushSaveSessions()
  assert.equal(readPersistedSessions().find((item) => item.id === b.id).messages[0].content, 'B 的内容')
})

check('保存配额失败：内存会话保留，flush 不抛错', () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '配额失败' })
  store.messages = [{ role: 'assistant', content: '必须保留' }]
  store.saveCurrentSession()
  failWrites = true
  try {
    let flushResult = null
    assert.doesNotThrow(() => { flushResult = store.flushSaveSessions() })
    // 三元断言：返回（持久化失败可观测）/ 内存（作者输入保留）/ 持久化（确实未写入）
    assert.equal(flushResult, false, 'flush 应返回失败结果')
    assert.equal(store.sessions[0].messages[0].content, '必须保留')
    assert.equal(store.currentSessionId, store.sessions[0].id)
    assert.equal(readPersistedSessions(), null, '配额失败期间不得写入存储')
    failWrites = false
    store.saveSessions() // 新一次调度（去抖 flush 只执行当时 pending 的那一次）
    flushResult = store.flushSaveSessions()
    assert.equal(flushResult, true, '恢复后写盘应成功')
    assert.equal(readPersistedSessions().length, 1)
  } finally {
    failWrites = false // 断言失败也不得污染后续检查
  }
})

check('两 store 实例写手隔离：各自的去抖句柄互不串数据', () => {
  storageMap.clear()
  const storeA = freshStore()
  storeA.loadSessions()
  storeA.createSession({ title: '实例A' })
  const storeB = freshStore()
  storeB.loadSessions()
  storeB.createSession({ title: '实例B' })
  // 两实例写同一 storage key：last-write-wins；但每个写手只能写自己实例的列表
  storeB.flushSaveSessions()
  let persisted = readPersistedSessions()
  assert.equal(persisted.some((item) => item.title === '实例A'), false, 'B 的写手只写 B 的列表')
  assert.equal(persisted.some((item) => item.title === '实例B'), true)
  storeA.flushSaveSessions()
  persisted = readPersistedSessions()
  assert.equal(persisted.some((item) => item.title === '实例B'), false, 'A 的写手只写 A 的列表')
  assert.equal(persisted.some((item) => item.title === '实例A'), true)
})

check('恢复投影继续：applyRuntimeSnapshot 后继续保存，恢复值持久化', () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '恢复流' })
  store.applyRuntimeSnapshot({
    player: { vitality: 12, maxVitality: 100 },
    flags: { secretSeen: true },
    writingTime: { eraId: 'e1', eraName: '新纪', year: 3, month: 1, day: 1 },
    placeStates: { 'place:old-tax-office': { status: '查封' } }
  })
  assert.equal(store.player.vitality, 12)
  assert.equal(store.flags.secretSeen, true)
  assert.equal(store.adventureTriggerPendingType, null)
  store.saveCurrentSession()
  store.flushSaveSessions()
  const saved = readPersistedSessions()[0]
  assert.equal(saved.runtimeState.player.vitality, 12)
  assert.equal(saved.runtimeState.flags.secretSeen, true)
  // 字段缺失回退：空快照不清空当前玩家状态
  store.player.vitality = 55
  store.applyRuntimeSnapshot({ flags: { other: 1 } })
  assert.equal(store.player.vitality, 55)
})

check('新调度模块反向接线：生产 action 真实经过新 writer，旧实现无残留', async () => {
  const fs = await import('node:fs')
  const storeSrc = fs.readFileSync(new URL('../src/stores/gameStore.js', import.meta.url), 'utf8')
  assert.ok(storeSrc.includes('getSessionListWriter(this,'), 'saveSessions 走新 writer')
  assert.ok(storeSrc.includes('flushSessionListWriter(this,'), 'flushSaveSessions 走新 writer')
  assert.ok(storeSrc.includes('buildCurrentSessionFields('), '会话快照构造来自 scheduler')
  assert.ok(storeSrc.includes('buildRuntimeSnapshot('), '快照构建来自 projection')
  assert.ok(!storeSrc.includes('getSaveSessionsDebouncer'), '旧 debouncer 入口已删除')
  const schedulerSrc = fs.readFileSync(new URL('../src/services/experience/gameSessionScheduler.js', import.meta.url), 'utf8')
  const normalizationSrc = fs.readFileSync(new URL('../src/services/experience/gameSessionNormalization.js', import.meta.url), 'utf8')
  assert.ok(!/this\./.test(normalizationSrc), '纯规范化模块无 store 访问')
  assert.ok(!/\bthis\.(?!sessions)/.test(schedulerSrc.replace(/getSessions: \(\) => this\.sessions/g, '')), 'scheduler 不读 store 其他字段')
  void schedulerSrc; void normalizationSrc
})


check('B7 订阅寿命：重复进出不累积、异常隔离计数、reset 不偷删订阅', async () => {
  const { createAuthoringObserverHub } = await import('../src/services/experience/gameObserverRuntime.js')
  const hub = createAuthoringObserverHub()
  // 注册 → 派发 → 取消：重复进出不累积
  const unsubs = [hub.subscribe(() => {}), hub.subscribe(() => {}), hub.subscribe(() => {})]
  assert.equal(hub.subscriptionCount(), 3)
  unsubs[0]()
  unsubs[1]()
  unsubs[2]()
  assert.equal(hub.subscriptionCount(), 0)
  // 异常隔离：一个监听器抛错不影响其他消费者，且计数可观测
  let goodCalls = 0
  hub.subscribe(() => { throw new Error('listener bug') })
  hub.subscribe(() => { goodCalls += 1 })
  hub.dispatch({ status: 'completed', result: {} })
  assert.equal(goodCalls, 1, '抛错监听器不阻断其他消费者')
  assert.equal(hub.listenerErrorCount(), 1)
  // 非函数订阅返回空退订且不计数
  const noop = hub.subscribe(null)
  assert.equal(typeof noop, 'function')
  assert.equal(hub.subscriptionCount(), 2)
  // reset（clearBuffers）不偷删页面仍持有的订阅
  hub.clearBuffers()
  assert.equal(hub.subscriptionCount(), 2)
  // 非完成状态不进入例外提取
  hub.recordResult({ status: 'failed', result: { exceptions: [{ observationId: 'x', reason: 'r', text: 't' }] } })
  assert.equal(hub.getExceptions().length, 0)
})

check('B7 store 订阅动作委托 hub；失败语义：观察器输出不写正式数据', async () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '订阅流' })
  const seen = []
  const unsubscribe = store.subscribeAuthoringObserverResults((result) => seen.push(result))
  store.applyRuntimeSnapshot({ flags: { a: 1 } })
  store.saveCurrentSession()
  assert.equal(seen.length, 0, '普通保存不派发观察器结果')
  unsubscribe()
  // 正式保存失败与观察器解耦：配额失败时 observe 缓冲照常
  failWrites = true
  store.saveCurrentSession()
  failWrites = false
  assert.equal(store.sessions[0].runtimeState.flags.a, 1)
})


check('B11 分支图：兄弟分支各取己链、跨分支父链可回溯、GC 边界与缺字段旧档', async () => {
  const graph = await import('../src/services/experience/gameBranchTurnGraph.js')
  const records = {
    t1: { id: 't1', status: 'committed', branchId: 'main', committedAt: 100, parentTurnId: null, userMessageIds: ['m1'], assistantMessageIds: ['m2'] },
    // 兄弟：t2/t3 同父 t1，各自分支
    t2: { id: 't2', status: 'committed', branchId: 'branch-a', committedAt: 300, parentTurnId: 't1', userMessageIds: ['m3'], assistantMessageIds: ['m4'], postRuntimeSnapshot: { flags: { v: 'a' } } },
    t3: { id: 't3', status: 'committed', branchId: 'branch-b', committedAt: 200, parentTurnId: 't1', userMessageIds: ['m5'], assistantMessageIds: ['m6'], postRuntimeSnapshot: { flags: { v: 'b' } } },
    // 无主孤立 turn：应被 GC
    t9: { id: 't9', status: 'committed', branchId: 'main', committedAt: 50, parentTurnId: null }
  }
  // 兄弟分支互不串链：A 链 = t2→t1，B 链 = t3→t1
  const chainA = graph.collectBranchTurnChain(records, { branchId: 'branch-a' })
  assert.deepEqual([...chainA].sort(), ['t1', 't2'])
  const chainB = graph.collectBranchTurnChain(records, { branchId: 'branch-b' })
  assert.deepEqual([...chainB].sort(), ['t1', 't3'])
  // 最新回合选择：A 取 t2（更高 committedAt），且要求快照
  assert.equal(graph.latestBranchTurn(records, 'branch-a').id, 't2')
  assert.equal(graph.latestBranchTurn(records, 'branch-b').id, 't3')
  // 可见消息投影：A 链只含自己的消息
  const visibleA = graph.collectVisibleMessageIds(records, chainA)
  assert.deepEqual([...visibleA].sort(), ['m1', 'm2', 'm3', 'm4'])
  // GC：孤立 t9 删除；活动链与游标引用保留；旧存档缺字段（无 branchId/status）不崩
  const kept = graph.gcUnreachableTurns(records, { lastCommittedTurnId: 't2', pendingBranchParentTurnId: null })
  assert.equal(kept.t9, undefined)
  assert.equal(kept.t2, records.t2)
  assert.equal(kept.t1, records.t1)
  const legacy = { x: { id: 'x' } }
  assert.deepEqual(graph.gcUnreachableTurns(legacy, {}), {})
  assert.deepEqual([...graph.collectBranchTurnChain(legacy, { branchId: 'main' })], [])
  // 两次切换后标记一致：A → B → A
  const messages = [
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1', branchId: 'branch-a' },
    { role: 'assistant', content: 'a2', branchId: 'branch-b' },
    { role: 'assistant', content: 'a3' } // 无 branchId 的历史消息视为主线
  ]
  graph.markSupersededMessages(messages, 'branch-a')
  assert.equal(messages[1].superseded, false)
  assert.equal(messages[2].superseded, true)
  graph.markSupersededMessages(messages, 'branch-b')
  graph.markSupersededMessages(messages, 'branch-a')
  assert.equal(messages[1].superseded, false)
  assert.equal(messages[2].superseded, true)
  assert.equal(messages[3].superseded, false)
})


check('B12 状态提取：解析等价、首个匹配、单级失败不中断流水线', async () => {
  const extraction = await import('../src/services/experience/gameStateExtraction.js')
  // 时间解析与原规则等价
  const base = { eraId: 'custom', eraName: '', year: '', month: '', day: 3 }
  assert.deepEqual(
    extraction.parseWritingTimeChange('次日，他们继续赶路。', base),
    { eraId: 'custom', eraName: '', year: '', month: '', day: '4' }
  )
  const dated = extraction.parseWritingTimeChange('大婚定在了1024年6月8日。', base)
  assert.equal(dated.year, '1024')
  assert.equal(dated.month, '6')
  assert.equal(dated.day, '8')
  assert.equal(extraction.parseWritingTimeChange('没有时间线索的一段话。', base), null)
  // 纪年
  const era = extraction.parseWritingTimeChange('天启二年春。', base)
  assert.equal(era.eraName, '天启')
  assert.equal(era.eraId, 'chinese')
  // 地点：第一个匹配 + 后缀清理
  assert.equal(extraction.parseLocationChange('他们来到了旧税所的门前'), '旧税所的门前') // 与原正则一致的贪婪匹配
  assert.equal(extraction.parseLocationChange('他们来到了旧税所，天色已晚'), '旧税所')
  assert.equal(extraction.parseLocationChange('无事发生。'), null)
  assert.deepEqual(
    extraction.parseWritingCharacterChange('我叫林舟，今年19岁。她既惊讶又开心。', { name: 'User', mood: 50 }),
    { name: '林舟', age: '19岁', mood: 56 }
  )
  assert.equal(extraction.parseWritingCharacterChange('只是风吹过长街。', { name: '林舟', mood: 50 }), null)
  assert.deepEqual(extraction.parseActivityEvents('他获得了铜钥匙。随后遇到了守门人，停下脚步。'), [
    { title: '获得了铜钥匙。', type: 'event' },
    { title: '遇到了守门人，', type: 'encounter' }
  ])
  // 流水线隔离：stub 一个阶段抛错，其余阶段仍执行
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '提取流' })
  const originalCharacter = store.extractCharacterChanges.bind(store)
  store.extractCharacterChanges = () => { throw new Error('解析器 bug') }
  assert.doesNotThrow(() => store.extractAndUpdateState('次日，他来到了钟楼广场。'))
  store.extractCharacterChanges = originalCharacter
  assert.equal(store.writingTime.day, '2', '时间阶段仍生效')
  assert.equal(store.worldMapState.currentScene, '钟楼广场', '地点阶段仍生效')
})


check('B11 生产路径：store.switchBranch 切换恢复与 gc 经真实 action', async () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '分支旅程' })
  // 直接构造两个已提交回合的 records + 消息（provider 无关）
  store.messages = [
    { role: 'user', content: '根问题' },
    { role: 'assistant', content: '主线回应', id: 'm-main-a', branchId: 'main' },
    { role: 'assistant', content: 'A 支回应', id: 'm-a-1', branchId: 'branch-a' }
  ]
  store.turnRecords = {
    t1: { id: 't1', status: 'committed', branchId: 'main', committedAt: 100, parentTurnId: null, userMessageIds: [], assistantMessageIds: ['m-main-a'], preRuntimeSnapshot: { flags: {} }, postRuntimeSnapshot: { flags: { at: 'main' } } },
    t2: { id: 't2', status: 'committed', branchId: 'branch-a', committedAt: 200, parentTurnId: 't1', userMessageIds: [], assistantMessageIds: ['m-a-1'], preRuntimeSnapshot: { flags: {} }, postRuntimeSnapshot: { flags: { at: 'branch-a' } } },
    t9: { id: 't9', status: 'committed', branchId: 'main', committedAt: 50, parentTurnId: null }
  }
  store.activeBranchId = 'main'
  store.lastCommittedTurnId = 't1'
  // 切到 A：恢复 A 的快照 + 消息标记 + 游标同步
  store.switchBranch('branch-a')
  assert.equal(store.activeBranchId, 'branch-a')
  assert.equal(store.lastCommittedTurnId, 't2', 'P0-2 游标同步到目标分支最新回合')
  assert.equal(store.flags.at, 'branch-a', 'applyRuntimeSnapshot 恢复 A 快照')
  // 注意：saveCurrentSession 的 normalize 会重建消息对象（既有行为），
  // 断言必须按 id 现查，不能跨持久化边界持有对象引用
  const msgById = (id) => store.messages.find((m) => m.id === id)
  assert.equal(msgById('m-a-1').superseded, false)
  assert.equal(msgById('m-main-a').superseded, true)
  // 切回主线：标记反转
  store.switchBranch('main')
  assert.equal(store.lastCommittedTurnId, 't1')
  assert.equal(msgById('m-main-a').superseded, false)
  assert.equal(msgById('m-a-1').superseded, true)
  // GC 经生产 action：孤立 t9 移除，游标引用的 t1/t2 保留
  store.gcUnreachableTurns()
  assert.equal(store.turnRecords.t9, undefined)
  assert.ok(store.turnRecords.t1 && store.turnRecords.t2)
  // 链投影经生产 getter
  assert.deepEqual([...store.collectBranchTurnChain('branch-a')].sort(), ['t1', 't2'])
  // fresh-store 重载：branch id / turn 游标 / runtime / 消息可见性 / chatHistory 五方一致
  const fresh = freshStore()
  fresh.loadSessions()
  fresh.loadSession(store.currentSessionId)
  assert.equal(fresh.activeBranchId, 'main')
  assert.equal(fresh.lastCommittedTurnId, 't1')
  assert.equal(fresh.messages.find((m) => m.id === 'm-main-a').superseded, false)
  assert.equal(fresh.messages.find((m) => m.id === 'm-a-1').superseded, true)
  assert.ok(fresh.turnRecords.t2, 'turnRecords 随会话持久化')
  const visibleIds = new Set(fresh.messages.filter((m) => !m.superseded).map((m) => m.id))
  const historyContents = fresh.chatHistory.map((m) => m.content)
  for (const message of fresh.messages) {
    if (visibleIds.has(message.id) && message.role === 'user') {
      assert.ok(historyContents.includes(message.content), '可见用户消息进入 chatHistory')
    }
  }
})


check('B12 状态家族：人物/活动/目标/关键选择走生产 action，worldbook 候选保持原 owner', async () => {
  const extractionModule = await import('../src/services/experience/gameStateExtraction.js')
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '轻状态' })
  // 生产 action 路径：目标（含“完成”判定）与关键选择
  store.extractGoalState('当前目标：找回账册。任务完成了。')
  const goal = store.goals[store.goals.length - 1]
  assert.equal(goal.title, '找回账册')
  assert.equal(goal.status, 'completed', '文本含“完成”应判 completed')
  store.extractKeyChoices('你决定前往北方。他答应了全部条件。')
  assert.deepEqual(store.keyChoices.map((item) => item.label), ['你决定前往北方', '答应了全部条件'])
  store.writingCharacter = { name: 'User', mood: 50 }
  store.extractCharacterChanges('我叫林舟，今年19岁。她既惊讶又开心。')
  assert.equal(store.writingCharacter.name, '林舟')
  assert.equal(store.writingCharacter.age, '19岁')
  assert.equal(store.writingCharacter.mood, 56)
  store.extractActivityEvents('他获得了铜钥匙。随后遇到了守门人，停下脚步。')
  assert.deepEqual(store.activities.map(({ title, type }) => ({ title, type })), [
    { title: '获得了铜钥匙。', type: 'event' },
    { title: '遇到了守门人，', type: 'encounter' }
  ])
  // 纯解析等价（涉及 worldbook 候选的提取器保持原 owner，不伪装生产接线）
  const { computeFactionDeltas, filterMentionedNames } = extractionModule
  assert.deepEqual(computeFactionDeltas('潮汐议会向商会施压，商会怀疑林舟', ['潮汐议会', '商会']), [
    { name: '潮汐议会', delta: -8 },
    { name: '商会', delta: -8 }
  ])
  assert.deepEqual(filterMentionedNames('林舟抵达', ['林舟', '老周']), ['林舟'])
})


check('B13 作用域身份：换书取消旧作用域缓冲、保留订阅、同标识幂等', async () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '作用域' })
  store.setAuthoringProjectId('book-a')
  assert.equal(store.resolveAuthoringMemoryProjectId(), 'book-a')
  const unsub = store.subscribeAuthoringObserverResults(() => {})
  // 旧书产生的派生/事件进入缓冲后，换书即失效（页面合同：换书即换作用域）
  store.noteAuthoringTextCommit({ text: '旧书正文', sourceRefs: ['unit:old-1'], revision: 'r1', sessionId: 's1', memoryProjectId: 'book-a' })
  assert.equal(store.getAuthoringMemoryTriggerEvents().length, 1, '换书前触发事件可读')
  store.setAuthoringProjectId('book-b')
  assert.equal(store.resolveAuthoringMemoryProjectId(), 'book-b')
  assert.equal(store.getAuthoringMemoryTriggerEvents().length, 0, '换书清空旧作用域触发缓冲')
  assert.equal(store.getAuthoringDerivedState().length, 0)
  assert.equal(store.getAuthoringObserverEvents().length, 0)
  // 同标识重复设置幂等，不清缓冲
  store.noteAuthoringTextCommit({ text: '新书正文', sourceRefs: ['unit:new-1'], revision: 'r2', sessionId: 's2', memoryProjectId: 'book-b' })
  const before = store.getAuthoringMemoryTriggerEvents().length
  assert.equal(before, 1, '新书提交入缓冲')
  store.setAuthoringProjectId('book-b')
  assert.equal(store.getAuthoringMemoryTriggerEvents().length, before, '同项目重复设置不清缓冲')
  unsub()
})


check('B14 生命周期：冷启动默认、runtime-only reset 保留会话与设置、全局素材哨兵深比较不变', async () => {
  storageMap.clear()
  // 种下四个全局写作素材键的哨兵值：runtime reset 前后必须逐字节不变
  const GLOBAL_SENTINELS = {
    writing_character: JSON.stringify({ name: '哨兵人物', mood: 77 }),
    writing_time: JSON.stringify({ eraId: 's', eraName: '哨兵纪', year: 9, month: 9, day: 9 }),
    writing_worldmap: JSON.stringify({ map: { countries: [] }, currentScene: '哨兵城' }),
    writing_activities: JSON.stringify([{ id: 'act-1' }])
  }
  for (const [key, value] of Object.entries(GLOBAL_SENTINELS)) storageMap.set(key, value)
  // 冷启动：新 store 的默认状态即可开始
  const store = freshStore()
  store.loadSessions()
  assert.equal(store.isPlaying, false)
  assert.equal(store.player.vitality, 100)
  assert.equal(store.messages.length, 0)
  // 旧会话加载 → runtime reset：会话列表与设置保留
  store.createSession({ title: '保留我' })
  store.apiSettings = { provider: 'minimax', apiKey: '', baseUrl: 'x', model: 'm' }
  store.narrativeExpansion = 'expanded'
  store.useAI = false
  store.messages = [{ role: 'assistant', content: '旧内容' }]
  store.flags = { progress: 1 }
  store.saveCurrentSession()
  const sessionsBeforeReset = store.sessions.length
  const currentSessionBeforeReset = store.currentSessionId
  store.resetRuntimeState()
  assert.equal(store.messages.length, 0, '回合内容清空')
  assert.deepEqual(store.flags, {}, '运行时标记清空')
  assert.equal(store.isPlaying, false)
  assert.equal(store.narrativeAgentStatus, null, '生成状态清空')
  // runtime reset 不得触碰全局写作素材：哨兵逐字节深比较
  for (const [key, value] of Object.entries(GLOBAL_SENTINELS)) {
    assert.equal(storageMap.get(key), value, `全局素材 ${key} 不被 runtime reset 改写`)
  }
  // 保留项：会话列表、当前会话、设置、扩展度、AI 开关
  assert.equal(store.sessions.length, sessionsBeforeReset, '会话列表保留')
  assert.equal(store.currentSessionId, currentSessionBeforeReset, '当前会话保留')
  assert.equal(store.apiSettings.provider, 'minimax', 'API 设置保留')
  assert.equal(store.narrativeExpansion, 'expanded')
  assert.equal(store.useAI, false)
  // reset 后旧会话仍可恢复
  const restored = store.loadSession(currentSessionBeforeReset)
  assert.equal(restored.messages[0].content, '旧内容')
  // resetGameState 与 resetRuntimeState 同义（不动会话）
  store.resetGameState()
  assert.equal(store.sessions.length, sessionsBeforeReset)
})


check('B-R1 合同：applyRuntimeSnapshot 只投影内存，不产生中间存档', () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '投影合同' })
  store.flags = { progress: 1 }
  store.commitCurrentSessionNow()
  const before = JSON.stringify(readPersistedSessions())
  // 直接调用投影：内存更新，但绝不自行落盘（外层事务拥有提交点）
  const patch = store.applyRuntimeSnapshot({ flags: { restored: 'yes' } })
  assert.equal(patch.flags.restored, 'yes', '返回投影补丁')
  assert.equal(store.flags.restored, 'yes', '内存已更新')
  assert.equal(JSON.stringify(readPersistedSessions()), before, 'storage 不被中间投影写入（事务原子性）')
  // 外层事务提交后（fresh reload 验证在 B11/undo 旅程中）
  store.commitCurrentSessionNow()
  const saved = readPersistedSessions().find((item) => item.id === store.currentSessionId)
  assert.equal(saved.runtimeState.flags.restored, 'yes', '事务提交点之后恢复结果才耐久化')
})

check('B13 合同一：省略 memoryProjectId 的提交沿用已激活项目，不清缓冲', () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '空id提交' })
  store.setAuthoringProjectId('book-a')
  const result = store.noteAuthoringTextCommit({
    text: '未带项目标识的正文提交',
    sourceRefs: ['unit:x'],
    revision: 'r9',
    sessionId: 's9'
    // 故意不传 memoryProjectId
  })
  assert.equal(result.accepted, true, '提交应被调度接受')
  assert.equal(result.key, 's9', '调度键为 documentId/sessionId')
  assert.equal(store.resolveAuthoringMemoryProjectId(), 'book-a', '项目标识不变')
  const events = store.getAuthoringMemoryTriggerEvents()
  assert.equal(events.length, 1, '提交事件入账且未被清空')
  assert.equal(events[0].projectId, 'book-a', '事件归属已激活项目')
})

check('B13 合同二：显式换项目取消旧作用域缓冲，新项目任务照常接受', () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '显式换书' })
  // hub 是模块级单例，跨检查共享：先经空项目复位缓冲再激活
  store.setAuthoringProjectId('')
  store.setAuthoringProjectId('book-a')
  const r1 = store.noteAuthoringTextCommit({ text: 'A 正文', sourceRefs: ['unit:a'], revision: 'r1', sessionId: 's1', memoryProjectId: 'book-a' })
  assert.equal(r1.accepted, true)
  assert.equal(store.getAuthoringMemoryTriggerEvents().length, 1)
  // 显式换书：旧作用域缓冲清空、待执行派生取消（bridge 内 scheduler.cancelAll）
  store.setAuthoringProjectId('book-b')
  assert.equal(store.getAuthoringMemoryTriggerEvents().length, 0, 'book-a 触发缓冲清空')
  assert.equal(store.resolveAuthoringMemoryProjectId(), 'book-b')
  // book-b 新任务不被旧取消误伤：照常接受并入账
  const r2 = store.noteAuthoringTextCommit({ text: 'B 正文', sourceRefs: ['unit:b'], revision: 'r2', sessionId: 's1', memoryProjectId: 'book-b' })
  assert.equal(r2.accepted, true, 'book-b 新提交照常被调度接受')
  assert.equal(r2.key, 's1')
  const events = store.getAuthoringMemoryTriggerEvents()
  assert.equal(events.length, 1)
  assert.equal(events[0].projectId, 'book-b')
  assert.equal(store.getAuthoringMemoryTriggerEvents().some((e) => e.projectId === 'book-a'), false, '旧项目事件不残留')
})

check('B-R2 undo-extension 旅程：撤销后 fresh reload，segment 与 runtime 同时消失', async () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '撤销续接' })
  const baseMessages = [
    { id: 'm-u', role: 'user', content: '继续' },
    {
      id: 'm-ext', role: 'assistant', content: '第一段\n\n第二段', branchId: 'main',
      segments: [
        { turnId: 't-base', cleanContent: '第一段', blocks: [] },
        { turnId: 't-ext', cleanContent: '第二段', blocks: [] }
      ]
    }
  ]
  store.messages = baseMessages
  store.flags = { extended: true }
  store.player = { vitality: 33, maxVitality: 100 }
  store.turnRecords = {
    't-base': { id: 't-base', status: 'committed', branchId: 'main', committedAt: 100, parentTurnId: null, assistantMessageIds: ['m-ext'], preRuntimeSnapshot: { flags: {} }  },
    't-ext': { id: 't-ext', status: 'committed', branchId: 'main', committedAt: 200, parentTurnId: 't-base', preRuntimeSnapshot: { flags: {}, player: { vitality: 88, maxVitality: 100 } } }
  }
  store.lastCommittedTurnId = 't-ext'
  store.commitCurrentSessionNow()
  // 生产 action（GamePanel 同款调用形态）
  const outcome = await store.executeExperienceAction({ type: 'undo-extension', payload: { messageId: 'm-ext' }, source: 'undo-btn' })
  assert.equal(outcome.ok, true)
  assert.equal(store.messages.find((m) => m.id === 'm-ext').segments.length, 1)
  assert.equal(store.flags.extended, undefined, 'runtime 回到续接前')
  assert.equal(store.player.vitality, 88)
  assert.equal(store.lastCommittedTurnId, 't-base')
  assert.equal(store.turnRecords['t-ext'].status, 'failed')
  // fresh reload：撤销的 segment 与对应 runtime 同时一致
  const fresh = freshStore()
  fresh.loadSessions()
  fresh.loadSession(store.currentSessionId)
  const reloaded = fresh.messages.find((m) => m.id === 'm-ext')
  assert.equal(reloaded.segments.length, 1)
  assert.equal(reloaded.content, '第一段')
  assert.equal(fresh.flags.extended, undefined)
  assert.equal(fresh.player.vitality, 88)
  // failed 回合的快照无恢复价值：normalizeTurnRecords 合同性丢弃
  assert.equal(fresh.turnRecords['t-ext'], undefined)
  assert.ok(fresh.turnRecords['t-base'], '基回合随会话持久化')
})

check('B-R3 重新生成边界：关闭 AI 严格 no-op，失败候选恢复旧分支并耐久保存', async () => {
  storageMap.clear()
  const store = freshStore()
  store.loadSessions()
  store.createSession({ title: '重新生成边界' })
  store.messages = [
    { id: 'm-user', role: 'user', content: '推门' },
    { id: 'm-old', role: 'assistant', content: '门后是旧路', branchId: 'main' }
  ]
  store.turnRecords = {
    't-old': {
      id: 't-old', status: 'committed', branchId: 'main', committedAt: 100,
      parentTurnId: null, userMessageIds: ['m-user'], assistantMessageIds: ['m-old'],
      postRuntimeSnapshot: { flags: { route: 'old' } }
    }
  }
  store.lastCommittedTurnId = 't-old'
  store.flags = { route: 'old' }
  store.commitCurrentSessionNow()

  store.useAI = false
  const before = JSON.stringify(store.$state)
  assert.equal(await store.regenerateFrom(0), false)
  assert.equal(JSON.stringify(store.$state), before, '关闭 AI 时不得创建分支或改 runtime')

  store.useAI = true
  store.generateAIResponse = async () => 'error'
  assert.equal(await store.regenerateFrom(0), true)
  assert.equal(store.activeBranchId, 'main')
  assert.equal(store.flags.route, 'old')
  const fresh = freshStore()
  fresh.loadSessions()
  fresh.loadSession(store.currentSessionId)
  assert.equal(fresh.activeBranchId, 'main', '失败恢复后的旧分支必须已落盘')
  assert.equal(fresh.flags.route, 'old')

  const fs = await import('node:fs')
  const storeSource = fs.readFileSync(new URL('../src/stores/gameStore.js', import.meta.url), 'utf8')
  const coordinatorSource = fs.readFileSync(new URL('../src/services/experience/experienceTurnCoordinator.js', import.meta.url), 'utf8')
  assert.match(storeSource, /generateAIResponse\(options = \{\}\) \{\s+return runExperienceTurn\(this, options\)/)
  assert.match(coordinatorSource, /productionOutcome !== 'success'[\s\S]{0,180}!store\._isRegenerating[\s\S]{0,100}store\.commitCurrentSessionNow\(\)/)
})


check('B14 补丁键集：runtime reset 补丁与基线逐字段清单完全一致（56 项）', async () => {
  const { buildRuntimeResetPatch } = await import('../src/services/experience/gameLifecycleDefaults.js')
  const patch = buildRuntimeResetPatch()
  // 冻结字段清单：迁移时从基线 resetRuntimeState 的 56 个 this.X = 赋值逐项提取
  const BASELINE_FIELDS = ['gameId','messages','chatHistory','time','player','inventory','quests','flags','activities','goals','encounteredCharacters','factionRelations','keyChoices','plotJournal','adventureTriggers','adventureTriggerHistory','adventureTriggerCooldownUntil','emergenceCandidates','emergenceDismissedIds','emergenceDraft','adventureTriggerPendingType','npcRelations','discoveredPlaces','completedQuests','writingCharacter','writingTime','placeStates','characterStates','characterRelations','canonicalFacts','worldMapState','historyNode','isPlaying','activeMechanism','mechanismContext','milestoneEvent','playerCharacter','aiCharacter','dialogueMode','dialogueCharacter','inlineEvents','lastWorldbookContext','lastMemoryContext','lastContextLedger','lastMemoryRecall','lastNarrativeKernel','lastNarrativeContextAudit','lastNarrativeAgentTrace','narrativeAgentStatus','narrativeSceneSummary','sceneThread','isLoading','lastError','quickNoteImportMode','quickNoteSelectedMessageIndexes','runtimeEvents']
  const patchKeys = Object.keys(patch).sort()
  assert.deepEqual(patchKeys, [...BASELINE_FIELDS].sort())
  assert.equal(patchKeys.length, 56)
  // 显式保留清单不得出现在补丁中
  for (const preserved of ['sessions', 'currentSessionId', 'apiSettings', 'narrativeExpansion', 'useAI', 'turnRecords', 'activeBranchId', 'lastCommittedTurnId']) {
    assert.equal(preserved in patch, false, `${preserved} 必须保留`)
  }
})

let failed = 0
for (const [name, fn] of checks) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL - ${name}\n  ${error.message}`)
  }
}
console.log(`\nexperience session fault matrix: ${checks.length - failed}/${checks.length} checks passed`)
if (failed > 0) process.exitCode = 1
