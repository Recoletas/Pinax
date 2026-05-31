import { describe, expect, it, vi } from 'vitest'
import {
  buildSettingGenerationMessages,
  buildSettingPromptPreview,
  generateSettingFieldDraft
} from '../services/settingFieldGeneration'

vi.mock('../services/api', () => ({
  getResolvedApiSettings: vi.fn(async () => ({
    baseUrl: 'https://api.example.test',
    apiKey: 'test-key',
    model: 'test-model'
  }))
}))

vi.mock('../services/generationService', () => ({
  runGenerationTask: vi.fn(async () => ({
    success: true,
    content: '力量来自雾潮中残留的旧神姓名。'
  }))
}))

describe('settingFieldGeneration', () => {
  it('builds messages with existing structured context', () => {
    const messages = buildSettingGenerationMessages({
      worldbook: {
        name: '雾港',
        worldDescription: '夜雾会吞噬记忆。',
        structuredSettings: {
          world: { origin: '旧神死后形成雾潮。' },
          story: { theme: '记忆与代价' }
        }
      },
      sectionKey: 'world',
      fieldKey: 'powerSystem',
      userBrief: '偏克制，不要游戏数值感'
    })

    expect(messages[0].role).toBe('system')
    expect(messages[1].content).toContain('目标字段：力量体系')
    expect(messages[1].content).toContain('旧神死后形成雾潮。')
    expect(messages[1].content).toContain('偏克制，不要游戏数值感')
  })

  it('renders a prompt preview for the review panel', () => {
    const preview = buildSettingPromptPreview({
      worldbook: { name: '雾港', structuredSettings: { story: { logline: '书记官追查雾潮。' } } },
      sectionKey: 'story',
      fieldKey: 'coreConflict',
      userBrief: ''
    })

    expect(preview).toContain('目标字段：核心冲突')
    expect(preview).toContain('一句话故事：书记官追查雾潮。')
  })

  it('generates a plain draft string', async () => {
    const result = await generateSettingFieldDraft({
      worldbook: { name: '雾港', structuredSettings: {} },
      sectionKey: 'world',
      fieldKey: 'powerSystem',
      userBrief: ''
    })

    expect(result.ok).toBe(true)
    expect(result.content).toBe('力量来自雾潮中残留的旧神姓名。')
  })
})
