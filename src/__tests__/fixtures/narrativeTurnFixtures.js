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
