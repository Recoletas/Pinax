import { describe, expect, it } from 'vitest'
import { buildWorldbookContext, describeWorldbookWarning } from '../services/worldbookContextBuilder'
import { seedWorldbookPresets } from '../services/seedWorldbookPresets'

describe('worldbookContextBuilder', () => {
  it('builds worldbook context with matched entries and budget report', () => {
    const result = buildWorldbookContext({
      worldbook: {
        name: '测试世界书',
        worldDescription: '世界设定描述',
        writingStyle: '克制',
        forbidden: '禁词',
        examples: '示例文本',
        entries: [
          {
            id: 'e1',
            name: '常驻规则',
            type: 'rule',
            content: '必须遵守',
            keys: ['规则'],
            injection: { mode: 'constant' }
          },
          {
            id: 'e2',
            name: '角色条目',
            type: 'character',
            content: '林舟出现',
            keys: ['林舟'],
            injection: { mode: 'selective', probability: 100 }
          }
        ]
      },
      chatHistory: [{ role: 'user', content: '我看见林舟站在门口' }],
      runtimeState: {
        writingCharacter: { name: '阿离' },
        writingTime: { eraName: '永夜历', year: '12' },
        worldMapState: { currentScene: '城门' },
        activities: [{ title: '抵达城门' }],
        goals: [{ title: '找到林舟' }],
        encounteredCharacters: [{ name: '林舟' }],
        keyChoices: [{ label: '先去城门问守卫' }],
        plotJournal: [{ summary: '阿离抵达城门并开始寻找林舟。' }]
      },
      tokenBudget: 1200,
      scanDepth: 2
    })

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].content).toContain('测试世界书')
    expect(result.messages[0].content).toContain('常驻规则')
    expect(result.messages[0].content).toContain('角色条目')
    expect(result.matchedEntries.map((entry) => entry.id)).toEqual(['e1', 'e2'])
    expect(result.matchedEntries[0].matchReason).toBe('constant')
    expect(result.matchedEntries[1].matchReason).toBe('keyword')
    expect(result.matchedEntries[1].matchedKeysLabel).toBe('林舟')
    expect(result.budgetReport.tokenBudget).toBe(1200)
    expect(result.budgetReport.usedChars).toBeGreaterThan(0)
    expect(result.warnings).toEqual([])
  })

  it('uses lightweight runtime state to help worldbook matching', () => {
    const result = buildWorldbookContext({
      worldbook: {
        name: '边境世界书',
        entries: [
          {
            id: 'goal-entry',
            name: '钟楼任务',
            type: 'quest',
            content: '调查钟楼停摆背后的证据链。',
            keys: ['钟楼证据']
          },
          {
            id: 'character-entry',
            name: '林舟',
            type: 'character',
            content: '林舟知道第一现场的异常。',
            keys: ['林舟']
          }
        ]
      },
      chatHistory: [{ role: 'user', content: '继续。' }],
      runtimeState: {
        goals: [{ title: '拿到钟楼证据' }],
        encounteredCharacters: [{ name: '林舟' }],
        keyChoices: [{ label: '先去钟楼查痕迹' }],
        plotJournal: [{ summary: '主角已经确认要去钟楼拿证据。' }]
      }
    })

    expect(result.matchedEntries.map((entry) => entry.id)).toEqual(['character-entry', 'goal-entry'])
  })

  it('matches entries from rich plot journal fields and faction runtime state', () => {
    const result = buildWorldbookContext({
      worldbook: {
        name: '雾潮暮湾世界书',
        entries: [
          {
            id: 'faction-entry',
            name: '潮盐行会',
            type: 'organization',
            content: '潮盐行会控制着本地夜间盐货流通。',
            keys: ['潮盐行会']
          },
          {
            id: 'location-entry',
            name: '钟楼',
            type: 'location',
            content: '钟楼停摆后，城区开始按雾钟而不是日钟作息。',
            keys: ['钟楼']
          },
          {
            id: 'hook-entry',
            name: '雾税账册',
            type: 'quest',
            content: '账册可能证明有人改写了雾税流向。',
            keys: ['雾税账册']
          }
        ]
      },
      chatHistory: [{ role: 'user', content: '继续。' }],
      runtimeState: {
        factionRelations: {
          潮盐行会: -18
        },
        plotJournal: [{
          summary: '主角刚离开城门。',
          participants: ['林舟'],
          locations: ['钟楼'],
          keyChoices: ['先去钟楼查痕迹'],
          unresolvedHooks: ['雾税账册']
        }]
      }
    })

    expect(result.matchedEntries.map((entry) => entry.id)).toEqual([
      'location-entry',
      'faction-entry',
      'hook-entry'
    ])
  })

  it('orders constant entries before typed keyword matches', () => {
    const result = buildWorldbookContext({
      worldbook: {
        name: '排序世界书',
        entries: [
          { id: 'general', name: '普通', type: 'general', content: '普通内容', keys: ['目标'] },
          { id: 'style', name: '风格', type: 'style', content: '风格内容', keys: ['目标'] },
          { id: 'forbidden', name: '禁忌', type: 'forbidden', content: '禁忌内容', keys: ['目标'] },
          { id: 'constant', name: '常驻', type: 'general', content: '常驻内容', keys: [], injection: { mode: 'constant' } },
          { id: 'rule', name: '规则', type: 'rule', content: '规则内容', keys: ['目标'] }
        ]
      },
      chatHistory: [{ role: 'user', content: '目标出现了' }]
    })

    expect(result.matchedEntries.map((entry) => entry.id)).toEqual([
      'constant',
      'rule',
      'forbidden',
      'style',
      'general'
    ])
  })

  it('returns warnings when nothing matches', () => {
    const result = buildWorldbookContext({
      worldbook: {
        name: '空世界书',
        entries: [{
          id: 'e1',
          name: '普通条目',
          type: 'general',
          content: '无关内容',
          keys: ['无关']
        }]
      },
      chatHistory: [{ role: 'user', content: '完全不相关' }],
      tokenBudget: 500
    })

    expect(result.messages).toHaveLength(0)
    expect(result.matchedEntries).toHaveLength(0)
    expect(result.warnings).toContain('no-matched-entries')
  })

  it('describes warning codes for preview', () => {
    expect(describeWorldbookWarning('no-worldbook')).toContain('世界书')
    expect(describeWorldbookWarning('no-matched-entries')).toContain('命中')
  })

  it('includes concise structured settings before matched entries', () => {
    const result = buildWorldbookContext({
      worldbook: {
        name: '雾港',
        worldDescription: '雾港每夜失去一段记忆。',
        structuredSettings: {
          story: { logline: '书记官追查吞噬姓名的雾。' },
          creativeRules: { consistency: '所有魔法都必须付出记忆代价。' }
        },
        entries: [
          {
            id: 'e1',
            name: '常驻规则',
            type: 'rule',
            content: '必须遵守',
            keys: [],
            injection: { mode: 'constant' }
          }
        ]
      },
      chatHistory: [{ role: 'user', content: '书记官走进雾港。' }],
      runtimeState: {},
      tokenBudget: 2000
    })

    expect(result.messages[0].content).toContain('【结构化设定】')
    expect(result.messages[0].content).toContain('一句话故事：书记官追查吞噬姓名的雾。')
    expect(result.messages[0].content).toContain('一致性规则：所有魔法都必须付出记忆代价。')
  })

  it('injects starter entries for promoted playable seed worlds on narrative init', () => {
    for (const preset of seedWorldbookPresets) {
      const result = buildWorldbookContext({
        worldbook: {
          ...preset,
          worldDescription: `${preset.worldDescription}\n\n开场困境：${preset.openingHook}`,
          entries: preset.entries.map((entry, index) => ({
            id: `${preset.id}-${index}`,
            ...entry
          }))
        },
        chatHistory: [{ role: 'user', content: '开始故事' }],
        includeStarterEntries: true,
        tokenBudget: 3000
      })

      const starterEntries = result.matchedEntries.filter(entry => entry.matchReason === 'starter')
      const starterTypes = new Set(starterEntries.map(entry => entry.type))

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content).toContain(preset.name)
      expect(result.messages[0].content).toContain(preset.openingHook.slice(0, 12))
      expect(starterTypes.has('location')).toBe(true)
      expect(starterTypes.has('organization')).toBe(true)
      expect(starterTypes.has('event')).toBe(true)
      expect(starterTypes.has('quest')).toBe(true)
      expect(starterEntries.length).toBeGreaterThanOrEqual(8)
    }
  })
})
