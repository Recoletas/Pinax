import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/generationService', () => ({
  runGenerationTask: vi.fn()
}))

import { runGenerationTask } from '../services/generationService'
import { buildHeuristicContextSummary, compressChatHistory } from '../services/contextCompression'

describe('contextCompression', () => {
  beforeEach(() => {
    vi.mocked(runGenerationTask).mockReset()
  })

  it('builds a structured heuristic summary and preserves recent messages', async () => {
    const history = [
      { role: 'system', content: '你是叙述者。' },
      { role: 'user', content: '我来到旧书店，寻找失踪的地图。' },
      { role: 'assistant', content: '你进入旧书店，发现铜钥匙。老板低声说：“别提‘那件事’。”仍然需要找到地下室线索。' },
      { role: 'user', content: '我询问老板地图碎片的来源。' },
      { role: 'assistant', content: '老板交出地图碎片，承诺带你去后门。' },
      { role: 'user', content: '最近行动一。' },
      { role: 'assistant', content: '最近叙事二。' },
      { role: 'user', content: '最近行动三。' },
      { role: 'assistant', content: '最近叙事四。' }
    ]

    const result = await compressChatHistory(history, {
      keepRecentCount: 4,
      preferLlm: false
    })

    expect(result.compressed).toBe(true)
    expect(result.method).toBe('heuristic')
    expect(result.newHistory).toHaveLength(6)
    expect(result.newHistory[0].content).toBe('你是叙述者。')
    expect(result.newHistory[1].content).toContain('【上下文摘要】')
    expect(result.summary).toContain('【剧情进展】')
    expect(result.summary).toContain('【玩家意图/行动】')
    expect(result.summary).toContain('旧书店')
    expect(result.summary).toContain('铜钥匙')
    expect(result.summary).toContain('地下室线索')
    expect(result.newHistory.slice(-4).map((message) => message.content)).toEqual([
      '最近行动一。',
      '最近叙事二。',
      '最近行动三。',
      '最近叙事四。'
    ])
    expect(runGenerationTask).not.toHaveBeenCalled()
  })

  it('uses LLM compression when API settings are available', async () => {
    vi.mocked(runGenerationTask).mockResolvedValueOnce({
      success: true,
      content: '【剧情进展】\n- 林舟已进入旧书店并取得铜钥匙。\n【未解决线索】\n- 地下室仍未探索。'
    })

    const result = await compressChatHistory([
      { role: 'system', content: '你是叙述者。' },
      { role: 'system', content: '【上下文摘要】【剧情进展】\n- 前情。' },
      { role: 'user', content: '我来到旧书店。' },
      { role: 'assistant', content: '你进入旧书店，获得铜钥匙。' },
      { role: 'user', content: '最近行动一。' },
      { role: 'assistant', content: '最近叙事二。' },
      { role: 'user', content: '最近行动三。' },
      { role: 'assistant', content: '最近叙事四。' }
    ], {
      keepRecentCount: 4,
      settings: {
        baseUrl: 'https://example.test',
        apiKey: 'key',
        model: 'model'
      }
    })

    expect(result.compressed).toBe(true)
    expect(result.method).toBe('llm')
    expect(result.summary).toContain('林舟已进入旧书店')
    expect(result.newHistory[1].content).toContain('地下室仍未探索')
    expect(runGenerationTask).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'context.compress',
      generationOptions: expect.objectContaining({
        max_tokens: 700,
        temperature: 0.1
      })
    }))
  })

  it('exposes the heuristic summary builder for store compatibility', () => {
    const summary = buildHeuristicContextSummary([
      { role: 'user', content: '我准备去码头。' },
      { role: 'assistant', content: '你抵达旧码头，发现银色令牌。' }
    ])

    expect(summary).toContain('旧码头')
    expect(summary).toContain('银色令牌')
  })
})
