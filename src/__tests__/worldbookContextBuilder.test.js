import { describe, expect, it } from 'vitest'
import { buildWorldbookContext, describeWorldbookWarning } from '../services/worldbookContextBuilder'

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
        activities: [{ title: '抵达城门' }]
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
})
