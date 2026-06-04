import { describe, it, expect } from 'vitest'
import { buildVoronoiMapPrompt, parseVoronoiMapConfig } from '../services/ai/voronoiMapAdapter'

/**
 * Task 13 验证：prompt 模板能正常生成，且含新管线字段说明
 *
 * 旧管线：含 `heightmapTemplate` + `realism.level` ("classic"/"azgaar"/"geologic")
 * 新管线：含 `plateCount` + `realism.rivers/coast/tectonics` 子字段，不再列模板
 */
describe('buildVoronoiMapPrompt', () => {
  it('生成基础 prompt 包含 2 条消息', () => {
    const messages = buildVoronoiMapPrompt(null, '', [])
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
  })

  it('system prompt 含新管线字段（plateCount + realism 子字段）', () => {
    const messages = buildVoronoiMapPrompt(null, '', [])
    expect(messages[0].content).toContain('plateCount')
    // 新 realism 子字段（不再列 3 个 level）
    expect(messages[0].content).toContain('realism')
    // 不再含旧 "heightmapTemplate" 模板列表
    expect(messages[0].content).not.toContain('heightmapTemplate')
    // 不再含 3-level realism 标签
    expect(messages[0].content).not.toContain('"geologic"')
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
