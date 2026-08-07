export const NARRATIVE_GATE_WORLD_ID = 'wb-narrative-gate'
export const NARRATIVE_GATE_SESSION_ID = 'session-narrative-gate'

const scenarioTemplates = Object.freeze([
  {
    id: 'continue-no-lookup',
    category: 'no-tool',
    action: '我停在原地听一听观测舱里的声音，不引入新的地点或人物。',
    canonicalFacts: ['当前地点是生态区观测舱', '玩家角色是陆晨曦']
  },
  {
    id: 'world-character',
    category: 'world',
    action: '我去找褚岩，先确认他对异常信号的判断标准。',
    canonicalFacts: ['褚岩是蓝色空间号舰长', '褚岩只接受有测量记录支持的判断']
  },
  {
    id: 'world-item',
    category: 'world',
    action: '我翻开纸质日记，检查其中关于地球海洋的记录。',
    canonicalFacts: ['纸质日记属于陆晨曦', '日记记录地球文明且纸张已经泛黄']
  },
  {
    id: 'geo-current',
    category: 'geo',
    action: '我确认自己所在舱室，以及从这里能直接前往的区域。',
    canonicalFacts: ['当前地点是生态区观测舱', '生态区观测舱通过 A-17 通道连接舰桥指挥舱']
  },
  {
    id: 'geo-route',
    category: 'geo',
    action: '我规划从生态区观测舱前往导航计算区的路线。',
    canonicalFacts: ['路线经过舰桥指挥舱', '生态区观测舱不能直接到达导航计算区']
  },
  {
    id: 'history-signal',
    category: 'history',
    action: '我追溯三天前首次探测异常信号时发生了什么。',
    canonicalFacts: ['舰载 AI 三天前首次探测到伪装引力波', '导航组随后确认信号不是自然噪声']
  },
  {
    id: 'history-cause',
    category: 'history',
    action: '我核对褚岩下令变轨的原因和之后出现的后果。',
    canonicalFacts: ['褚岩因异常信号和小行星带风险下令变轨', '变轨后观测舱收到同步回波']
  },
  {
    id: 'memory-promise',
    category: 'memory',
    action: '我回想自己答应过褚岩什么，再决定下一步。',
    canonicalFacts: ['陆晨曦答应向褚岩提交完整波形']
  },
  {
    id: 'memory-fatigue',
    category: 'memory',
    action: '我评估自己的疲劳是否正在影响对波形的判断。',
    canonicalFacts: ['陆晨曦已经七天没有合眼']
  },
  {
    id: 'multi-hop',
    category: 'multi-hop',
    action: '我去舰桥找褚岩，把首次信号、变轨命令和最新回波按时间顺序核对。',
    canonicalFacts: ['首次信号早于变轨命令', '最新回波与飞船变轨同步', '褚岩在舰桥指挥舱']
  },
  {
    id: 'empty-result',
    category: 'empty',
    action: '我查找关于“紫月港”的记录；如果没有资料，就明确说没有，不要补造。',
    canonicalFacts: ['现有资料中不存在紫月港'],
    forbiddenFacts: ['紫月港的具体位置', '紫月港的历史', '紫月港的居民']
  },
  {
    id: 'continuity',
    category: 'continuity',
    action: '我继续完成当前目标，只推进确认信号来源这一小步。',
    canonicalFacts: ['当前目标是确认信号来源', '不得替玩家决定未输入的行动']
  }
])

export function buildNarrativeGateScenarioMatrix(count = 60, { includeControlledFailures = true } = {}) {
  const total = Math.max(1, Math.min(120, Number(count) || 60))
  const scenarios = Array.from({ length: total }, (_, index) => {
    const template = scenarioTemplates[index % scenarioTemplates.length]
    const cycle = Math.floor(index / scenarioTemplates.length) + 1
    return {
      ...template,
      runIndex: index,
      cycle,
      runId: `${template.id}-${String(index + 1).padStart(2, '0')}`,
      action: `${template.action}（评测轮次 ${cycle}）`,
      canonicalFacts: [...(template.canonicalFacts || [])],
      forbiddenFacts: [...(template.forbiddenFacts || [])],
      controlledFault: ''
    }
  })
  if (includeControlledFailures && total >= 2) {
    scenarios[total - 2] = {
      ...scenarios[total - 2],
      id: 'controlled-rate-limit',
      category: 'typed-failure',
      action: '受控失败：验证供应商限流后的占位、loading 和错误可见性清理。',
      canonicalFacts: [],
      forbiddenFacts: [],
      controlledFault: 'rate-limit'
    }
    scenarios[total - 1] = {
      ...scenarios[total - 1],
      id: 'controlled-timeout',
      category: 'typed-failure',
      action: '受控失败：验证决策超时后的占位、loading 和错误可见性清理。',
      canonicalFacts: [],
      forbiddenFacts: [],
      controlledFault: 'timeout'
    }
  }
  return scenarios
}

function buildWorldbook() {
  const entries = [
    {
      id: 'entry-captain',
      name: '褚岩',
      type: 'character',
      keys: ['褚岩', '舰长'],
      content: '蓝色空间号舰长，常驻舰桥指挥舱，只接受有测量记录支持的判断。',
      relations: { locations: ['place-bridge'], events: ['history-course-change'] }
    },
    {
      id: 'entry-engineer',
      name: '陆晨曦',
      type: 'character',
      keys: ['陆晨曦', '通讯工程师'],
      content: '28 岁的引力波通讯工程师，已经七天没有合眼。',
      relations: { locations: ['place-observation'], events: ['history-first-signal'] }
    },
    {
      id: 'entry-diary',
      name: '纸质日记',
      type: 'item',
      keys: ['纸质日记', '日记'],
      content: '属于陆晨曦，用于记录地球文明和海洋气味，纸张已经泛黄。'
    },
    {
      id: 'entry-signal',
      name: '伪装引力波',
      type: 'event',
      keys: ['异常信号', '引力波'],
      content: '三天前由舰载 AI 首次探测，经过人工编码并朝蓝色空间号回荡。',
      relations: { events: ['history-first-signal', 'history-signal-review'] }
    },
    {
      id: 'entry-rule',
      name: '玩家控制权',
      type: 'rule',
      keys: ['玩家控制权'],
      content: '不得替玩家声明未输入的行动、选择或心理结论。',
      injection: { mode: 'constant' }
    }
  ]
  return {
    id: NARRATIVE_GATE_WORLD_ID,
    name: '蓝色空间号生产评测',
    description: '用于真实叙事 Agent 发布门槛的合成世界。',
    worldDescription: '蓝色空间号正在远离太阳系，前方是异常小行星带。',
    writingStyle: '中文，克制清晰，以感官细节推动场景。',
    forbidden: '不得替玩家作出决定；没有证据时必须承认资料不足。',
    examples: '',
    updatedAt: 1785312000000,
    settings: { scanDepth: 2, tokenBudget: 4096, recursiveScanning: true },
    entries,
    entriesMap: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
    groups: [],
    geoHistory: {
      mapId: 'map-narrative-gate',
      placeRefs: [
        {
          placeId: 'place-observation',
          siteId: 'site-observation',
          name: '生态区观测舱',
          semanticType: 'room',
          routeIds: ['route-a17']
        },
        {
          placeId: 'place-bridge',
          siteId: 'site-bridge',
          name: '舰桥指挥舱',
          semanticType: 'room',
          routeIds: ['route-a17', 'route-b04']
        },
        {
          placeId: 'place-navigation',
          siteId: 'site-navigation',
          name: '导航计算区',
          semanticType: 'facility',
          routeIds: ['route-b04']
        }
      ],
      routes: [
        {
          id: 'route-a17',
          name: 'A-17 通道',
          fromPlaceId: 'place-observation',
          toPlaceId: 'place-bridge'
        },
        {
          id: 'route-b04',
          name: 'B-04 通道',
          fromPlaceId: 'place-bridge',
          toPlaceId: 'place-navigation'
        }
      ],
      nodes: [
        {
          id: 'history-first-signal',
          title: '首次探测异常信号',
          summary: '舰载 AI 在三天前首次探测到经过伪装的引力波。',
          participants: ['陆晨曦'],
          placeRef: { placeId: 'place-observation', name: '生态区观测舱' },
          entryIds: ['entry-engineer', 'entry-signal']
        },
        {
          id: 'history-signal-review',
          title: '导航组复核信号',
          summary: '导航组确认信号不是自然噪声。',
          participants: ['陆晨曦'],
          sourceNodeId: 'history-first-signal',
          placeRef: { placeId: 'place-navigation', name: '导航计算区' },
          entryIds: ['entry-signal']
        },
        {
          id: 'history-course-change',
          title: '舰长下令变轨',
          summary: '褚岩因异常信号和小行星带风险下令变轨。',
          participants: ['褚岩'],
          sourceNodeId: 'history-signal-review',
          placeRef: { placeId: 'place-bridge', name: '舰桥指挥舱' },
          entryIds: ['entry-captain']
        },
        {
          id: 'history-return-echo',
          title: '变轨后的同步回波',
          summary: '飞船变轨后，观测舱收到与变轨同步的回波。',
          participants: ['陆晨曦', '褚岩'],
          sourceNodeId: 'history-course-change',
          placeRef: { placeId: 'place-observation', name: '生态区观测舱' },
          entryIds: ['entry-signal']
        }
      ],
      playerNodes: []
    }
  }
}

function buildRuntime() {
  const initialMessage = {
    id: 'gate-assistant-0',
    role: 'assistant',
    name: '旁白',
    content: ':::narration\n蓝色空间号正在进行第三次变轨，生态区观测舱只剩设备低鸣。\n:::dialogue|陆晨曦\n“那段信号又回来了。”',
    timestamp: 1785312000000
  }
  return {
    messages: [initialMessage],
    chatHistory: [
      { role: 'system', content: '你是中文小说叙述者。' },
      { role: 'assistant', content: '蓝色空间号正在变轨，异常信号再次出现。' }
    ],
    writingCharacter: {
      name: '陆晨曦',
      gender: '女',
      age: '28',
      traits: ['沉着', '敏锐'],
      mood: 42,
      description: '引力波通讯工程师',
      goal: '确认信号来源'
    },
    writingTime: { eraId: 'custom', eraName: '危机纪元', year: '227', month: '9', day: '15' },
    worldMapState: {
      map: { countries: [] },
      currentCountry: '蓝色空间号',
      currentCity: '生态区',
      currentScene: '生态区观测舱',
      placeId: 'place-observation'
    },
    playerCharacter: { name: '陆晨曦', avatar: '', gender: '女', age: '28' },
    aiCharacter: { name: '旁白', avatar: '' },
    encounteredCharacters: [{ id: 'entry-captain', name: '褚岩', source: 'gate-fixture' }],
    goals: [{ id: 'goal-signal', title: '确认信号来源', status: 'active', source: 'gate-fixture' }],
    keyChoices: [{ id: 'choice-report', label: '答应向褚岩提交完整波形', source: 'gate-fixture' }],
    factionRelations: {},
    plotJournal: [],
    runtimeEvents: [],
    activities: [],
    inventory: [],
    quests: [],
    flags: {},
    historyNode: null,
    narrativeSceneSummary: null
  }
}

export function buildNarrativeGateStorage(apiSettings = null, { nickname = '' } = {}) {
  const worldbook = buildWorldbook()
  const runtime = buildRuntime()
  const session = {
    id: NARRATIVE_GATE_SESSION_ID,
    schemaVersion: 1,
    title: '蓝色空间号生产评测',
    createdAt: 1785312000000,
    updatedAt: 1785312000000,
    worldId: worldbook.id,
    worldbookId: worldbook.id,
    messages: runtime.messages,
    chatHistory: runtime.chatHistory,
    runtimeState: runtime,
    worldState: {
      character: runtime.writingCharacter,
      time: runtime.writingTime,
      worldMap: runtime.worldMapState,
      activities: []
    }
  }
  const memories = [
    {
      id: 'memory-promise',
      status: 'active',
      scope: 'session',
      scopeId: NARRATIVE_GATE_SESSION_ID,
      kind: 'fact',
      content: '陆晨曦答应向褚岩提交完整波形。',
      confidence: 1,
      updatedAt: 1785312000001
    },
    {
      id: 'memory-fatigue',
      status: 'active',
      scope: 'project',
      scopeId: NARRATIVE_GATE_WORLD_ID,
      kind: 'character-fact',
      content: '陆晨曦已经七天没有合眼。',
      confidence: 1,
      updatedAt: 1785312000002
    }
  ]
  const storage = {
    app_theme_variant: 'legacy',
    app_theme: 'light',
    worldbooks_index: [{
      id: worldbook.id,
      name: worldbook.name,
      description: worldbook.description,
      entryCount: worldbook.entries.length,
      updatedAt: worldbook.updatedAt
    }],
    [`worldbook_${worldbook.id}`]: worldbook,
    active_worldbook_id: worldbook.id,
    writing_sessions: [session],
    memory_candidates_v1: memories,
    pinax_narrative_production_metrics_v1: {
      schemaVersion: 1,
      updatedAt: 0,
      events: []
    }
  }
  if (apiSettings) storage.apiSettings = apiSettings
  return {
    storage,
    sessionStorage: nickname ? { 'pinax.online.nickname': nickname } : {}
  }
}

export function summarizeScenarioMatrix(scenarios) {
  const categories = {}
  const controlledFaults = {}
  for (const scenario of scenarios) {
    categories[scenario.category] = (categories[scenario.category] || 0) + 1
    if (scenario.controlledFault) {
      controlledFaults[scenario.controlledFault] = (controlledFaults[scenario.controlledFault] || 0) + 1
    }
  }
  return {
    total: scenarios.length,
    categories,
    controlledFaults,
    qualityReviewRequired: scenarios.filter((scenario) => !scenario.controlledFault).length
  }
}
