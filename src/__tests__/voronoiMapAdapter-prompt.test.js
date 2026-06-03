import { describe, it, expect } from 'vitest'
import { buildVoronoiMapPrompt, parseVoronoiMapConfig } from '../services/ai/voronoiMapAdapter'

/**
 * Task 13 验证：prompt 模板能正常生成，且含 realism + constraints 字段说明
 */
describe('buildVoronoiMapPrompt', () => {
  it('生成基础 prompt 包含 2 条消息', () => {
    const messages = buildVoronoiMapPrompt(null, '', [])
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
  })

  it('system prompt 含 realism 字段说明', () => {
    const messages = buildVoronoiMapPrompt(null, '', [])
    expect(messages[0].content).toContain('realism')
    expect(messages[0].content).toContain('"azgaar"')
    expect(messages[0].content).toContain('"classic"')
    expect(messages[0].content).toContain('"geologic"')
  })

  it('system prompt 含 constraints 字段说明', () => {
    const messages = buildVoronoiMapPrompt(null, '', [])
    expect(messages[0].content).toContain('constraints')
    expect(messages[0].content).toContain('mountains')
    expect(messages[0].content).toContain('stateSeeds')
  })

  it('空 worldview / overview 也能生成（带默认提示）', () => {
    const messages = buildVoronoiMapPrompt(null, '', [])
    expect(messages[1].content).toContain('中文古风奇幻世界')
  })
})
