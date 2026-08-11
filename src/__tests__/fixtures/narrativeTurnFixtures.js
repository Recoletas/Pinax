/**
 * 体验页回合事务 fixture（酒馆能力对齐计划 R1）。
 *
 * 纯数据工厂函数，用于构造特定的 gameStore 状态来测试 regenerate / 分支切换。
 * 不依赖 provider——状态字段直接设置，绕过 AI 生成流程。
 * 只保留被测试实际使用的 fixture；新增场景时按需扩展。
 */

/**
 * 构造一个"破坏性 regenerate"场景的初始状态。
 *
 * 场景：4 条消息（u1 → a1 → u2 → a2），其中 a2 的正文触发了 extractAndUpdateState，
 * 把 currentScene 从"城镇入口"改成"酒馆"，writingTime 从第 1 天推进到第 3 天。
 *
 * 测试从 index=1（a1）regenerate 时：
 *   - 旧实现：slice(0,2) 丢掉 u2/a2，但 currentScene 仍为"酒馆"（state 残留）
 *   - R1a 修复后：applyRuntimeSnapshot 回滚到 a1 回合前的快照，currentScene 恢复
 */
export function createDestructiveRegenerateFixture() {
  return {
    messages: [
      {
        id: 'msg_u1',
        role: 'user',
        content: '我走进城镇入口，四处张望。',
        timestamp: 1000
      },
      {
        id: 'msg_a1',
        role: 'assistant',
        name: '叙事',
        content: '你站在城镇入口，石板路向两侧延伸。',
        timestamp: 1001,
        presentation: { v: 3, blocks: [{ kind: 'narration', text: '你站在城镇入口，石板路向两侧延伸。' }] }
      },
      {
        id: 'msg_u2',
        role: 'user',
        content: '我推开酒馆的大门。',
        timestamp: 2000
      },
      {
        id: 'msg_a2',
        role: 'assistant',
        name: '叙事',
        content: '酒馆内烟雾缭绕。时间过去了两天。',
        timestamp: 2001,
        presentation: { v: 3, blocks: [{ kind: 'narration', text: '酒馆内烟雾缭绕。时间过去了两天。' }] }
      }
    ],
    // a2 生成前的 runtime state（a1 提交后的状态）
    preTurnTwoSnapshot: {
      worldMapState: {
        currentCountry: '起始之国',
        currentCity: '晨曦镇',
        currentScene: '城镇入口',
        placeId: 'place_001'
      },
      writingTime: { eraId: 'era_1', eraName: '第一纪', year: 1, month: 1, day: 1 },
      characterStates: {},
      characterRelations: [],
      canonicalFacts: [],
      goals: [],
      keyChoices: [],
      factionRelations: {},
      activities: [],
      encounteredCharacters: [],
      inventory: [],
      quests: [],
      plotJournal: [],
      flags: {},
      runtimeEvents: [
        { v: 1, type: 'turn', id: 'evt_001', parentId: '', branchId: 'main', ts: 1000, source: 'user', payload: { preview: '我走进城镇入口', messageIndex: 0 } },
        { v: 1, type: 'turn', id: 'evt_002', parentId: 'evt_001', branchId: 'main', ts: 1001, source: 'assistant', payload: { preview: '你站在城镇入口', messageIndex: 1 } }
      ]
    },
    // a2 生成后的 runtime state（当前活跃状态——这就是 regenerate 时需要回滚掉的）
    postTurnTwoState: {
      worldMapState: {
        currentCountry: '起始之国',
        currentCity: '晨曦镇',
        currentScene: '酒馆',
        placeId: 'place_001'
      },
      writingTime: { eraId: 'era_1', eraName: '第一纪', year: 1, month: 1, day: 3 },
      characterStates: {},
      characterRelations: [],
      canonicalFacts: [],
      goals: [],
      keyChoices: [],
      factionRelations: {},
      activities: [],
      encounteredCharacters: [],
      inventory: [],
      quests: [],
      plotJournal: [],
      flags: {},
      runtimeEvents: [
        { v: 1, type: 'turn', id: 'evt_001', parentId: '', branchId: 'main', ts: 1000, source: 'user', payload: { preview: '我走进城镇入口', messageIndex: 0 } },
        { v: 1, type: 'turn', id: 'evt_002', parentId: 'evt_001', branchId: 'main', ts: 1001, source: 'assistant', payload: { preview: '你站在城镇入口', messageIndex: 1 } },
        { v: 1, type: 'turn', id: 'evt_003', parentId: 'evt_002', branchId: 'main', ts: 2000, source: 'user', payload: { preview: '我推开酒馆', messageIndex: 2 } },
        { v: 1, type: 'turn', id: 'evt_004', parentId: 'evt_003', branchId: 'main', ts: 2001, source: 'assistant', payload: { preview: '酒馆内烟雾缭绕', messageIndex: 3 } }
      ]
    }
  }
}

// ===== P2-7 验收证据：六类体验 fixture（计划 R0 要求）=====

/**
 * 1. 空会话 —— 无消息、无 runtime 状态，首次生成前。
 */
export function createEmptySessionFixture() {
  return {
    messages: [],
    chatHistory: [],
    worldMapState: { currentCountry: '', currentCity: '', currentScene: '', placeId: '' },
    writingTime: { eraId: '', eraName: '', year: 1, month: 1, day: 1 },
    runtimeEvents: [],
    turnRecords: {},
    activeBranchId: 'main',
  }
}

/**
 * 2. 常规会话 —— 短对话（2 轮），正常状态。
 */
export function createRegularSessionFixture() {
  return {
    messages: [
      { id: 'msg_r_u1', role: 'user', content: '我走进城镇。', timestamp: 1000 },
      { id: 'msg_r_a1', role: 'assistant', content: '晨曦镇的石板路向两侧延伸。', timestamp: 1001 },
      { id: 'msg_r_u2', role: 'user', content: '我去酒馆。', timestamp: 2000 },
      { id: 'msg_r_a2', role: 'assistant', content: '酒馆里炉火正旺。', timestamp: 2001 }
    ],
    worldMapState: { currentCountry: '起始之国', currentCity: '晨曦镇', currentScene: '酒馆', placeId: 'place_001' },
    writingTime: { eraId: 'era_1', eraName: '第一纪', year: 1, month: 1, day: 2 },
    runtimeEvents: [
      { v: 1, type: 'turn', id: 'evt_r1', parentId: '', branchId: 'main', ts: 1000, source: 'user', payload: {} },
      { v: 1, type: 'turn', id: 'evt_r2', parentId: 'evt_r1', branchId: 'main', ts: 1001, source: 'assistant', payload: {} },
      { v: 1, type: 'turn', id: 'evt_r3', parentId: 'evt_r2', branchId: 'main', ts: 2000, source: 'user', payload: {} },
      { v: 1, type: 'turn', id: 'evt_r4', parentId: 'evt_r3', branchId: 'main', ts: 2001, source: 'assistant', payload: {} }
    ],
    activeBranchId: 'main',
  }
}

/**
 * 3. 长会话 —— 40 轮对话，用于性能/滚动基线。
 */
export function createLongSessionFixture(rounds = 40) {
  const messages = []
  const runtimeEvents = []
  let prevEventId = ''
  for (let i = 0; i < rounds; i++) {
    const uid = `msg_l_u${i}`
    const aid = `msg_l_a${i}`
    const ts = 1000 + i * 100
    messages.push({ id: uid, role: 'user', content: `第 ${i + 1} 轮的行动。`, timestamp: ts, branchId: 'main' })
    messages.push({ id: aid, role: 'assistant', content: `第 ${i + 1} 轮的回应，包含一些叙事描述与角色对白。`, timestamp: ts + 1, branchId: 'main' })
    const evtU = { v: 1, type: 'turn', id: `evt_lu${i}`, parentId: prevEventId, branchId: 'main', ts, source: 'user', payload: {} }
    const evtA = { v: 1, type: 'turn', id: `evt_la${i}`, parentId: evtU.id, branchId: 'main', ts: ts + 1, source: 'assistant', payload: {} }
    runtimeEvents.push(evtU, evtA)
    prevEventId = evtA.id
  }
  return {
    messages,
    chatHistory: messages.map((m) => ({ role: m.role, content: m.content })),
    worldMapState: { currentCountry: '长世', currentCity: '', currentScene: '旅途中', placeId: 'place_long' },
    writingTime: { eraId: 'era_1', eraName: '第一纪', year: 1, month: 1, day: rounds },
    runtimeEvents,
    activeBranchId: 'main',
  }
}

/**
 * 4. 工具调用会话 —— 含工具调用结果的 assistant 消息。
 */
export function createToolCallSessionFixture() {
  return {
    messages: [
      { id: 'msg_t_u1', role: 'user', content: '我查阅世界书里关于褚岩的资料。', timestamp: 1000 },
      {
        id: 'msg_t_a1',
        role: 'assistant',
        content: '褚岩是沉稳的军师。',
        timestamp: 1001,
        presentation: { v: 3, blocks: [{ kind: 'narration', text: '褚岩是沉稳的军师。' }] }
      }
    ],
    toolCalls: [
      { callId: 'call_1', name: 'world_lookup', action: 'search', query: '褚岩', ok: true, evidenceRefs: 1 },
      { callId: 'call_2', name: 'memory_lookup', action: 'search', query: '军师', ok: true, evidenceRefs: 0 }
    ],
    worldMapState: { currentCountry: '', currentCity: '', currentScene: '议事厅', placeId: 'place_t' },
    writingTime: { eraId: 'era_1', eraName: '第一纪', year: 1, month: 1, day: 1 },
    runtimeEvents: [
      { v: 1, type: 'turn', id: 'evt_t1', parentId: '', branchId: 'main', ts: 1000, source: 'user', payload: {} },
      { v: 1, type: 'turn', id: 'evt_t2', parentId: 'evt_t1', branchId: 'main', ts: 1001, source: 'assistant', payload: {} }
    ],
    activeBranchId: 'main',
  }
}

/**
 * 5. 流式失败会话 —— 占位消息已 push 但 provider 失败。
 */
export function createStreamingFailureFixture() {
  return {
    messages: [
      { id: 'msg_f_u1', role: 'user', content: '我查看周围环境。', timestamp: 1000 },
      { id: 'msg_f_a1', role: 'assistant', content: '四周是茂密的森林。', timestamp: 1001 }
    ],
    preFailureSnapshot: {
      worldMapState: { currentCountry: '荒野', currentCity: '', currentScene: '森林边缘', placeId: 'place_f' },
      writingTime: { eraId: 'era_1', eraName: '第一纪', year: 1, month: 1, day: 5 },
      runtimeEvents: [
        { v: 1, type: 'turn', id: 'evt_f1', parentId: '', branchId: 'main', ts: 1000, source: 'user', payload: {} },
        { v: 1, type: 'turn', id: 'evt_f2', parentId: 'evt_f1', branchId: 'main', ts: 1001, source: 'assistant', payload: {} }
      ]
    },
    activeBranchId: 'main',
  }
}

/**
 * 6. 联机会话 —— 房主 + 成员，低敏状态与已提交结果。
 */
export function createOnlineSessionFixture() {
  return {
    hostId: 'member-host',
    members: ['member-host', 'member-a', 'member-b'],
    lastSeq: 12,
    events: [
      { id: 'evt_online_1', seq: 10, type: 'narrative.request', actorId: 'member-host', payload: { requestId: 'narrative_on_1', actionText: '我推开城门。' } },
      { id: 'evt_online_2', seq: 11, type: 'narrative.status', actorId: 'member-host', payload: { requestId: 'narrative_on_1', phase: 'streaming' } },
      { id: 'evt_online_3', seq: 12, type: 'narrative.completed', actorId: 'member-host', payload: { requestId: 'narrative_on_1', turnId: 'narrative_on_1', branchId: 'main', assistantMessage: { role: 'assistant', content: '城门缓缓打开。' } } }
    ],
    // 成员应零模型请求；仅房主产生 narrative.request
    memberRequestCounts: { 'member-host': 1, 'member-a': 0, 'member-b': 0 },
    activeBranchId: 'main',
  }
}
