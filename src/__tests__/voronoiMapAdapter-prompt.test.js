import { describe, it, expect } from 'vitest'
import { buildVoronoiMapPrompt, mergeNameSeeds, parseVoronoiMapConfig } from '../services/ai/voronoiMapAdapter'

/**
 * Task 13 验证：prompt 模板能正常生成，且含新管线字段说明
 *
 * 当前管线：显式暴露 `heightmapTemplate`（Azgaar 官方模板入口）+
 * `plateCount` + `realism.rivers/coast/tectonics` 子字段
 */
describe('buildVoronoiMapPrompt', () => {
  it('生成基础 prompt 包含 2 条消息', () => {
    const messages = buildVoronoiMapPrompt(null, '', [])
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
  })

  it('system prompt 含 Azgaar 模板与构造字段', () => {
    const messages = buildVoronoiMapPrompt(null, '', [])
    expect(messages[0].content).toContain('heightmapTemplate')
    expect(messages[0].content).toContain('plateCount')
    expect(messages[0].content).toContain('realism')
    expect(messages[0].content).toContain('stylePreset')
    expect(messages[0].content).toContain('plateSpeedFactor')
    expect(messages[0].content).toContain('generateProvinces')
    expect(messages[0].content).toContain('generateRoads')
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

  it('user prompt 接入世界书地图桥接上下文', () => {
    const messages = buildVoronoiMapPrompt(null, '', [], {
      stateNames: ['玄羽国'],
      burgNames: ['云隐村'],
      riverNames: ['赤练河'],
      loreContextBlock: '【世界书关键条目】\n  [location] 云隐村: 北境山村',
      constraints: {
        mountains: [{ name: '北境之脊', cells: [], type: 'ridge' }],
      },
    })
    expect(messages[1].content).toContain('世界书关键条目')
    expect(messages[1].content).toContain('玄羽国')
    expect(messages[1].content).toContain('云隐村')
    expect(messages[1].content).toContain('赤练河')
    expect(messages[1].content).toContain('北境之脊')
  })
})

describe('parseVoronoiMapConfig', () => {
  it('返回显式成功结构并对齐 pointCount 默认值', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({ seed: 'x' }))
    expect(result.ok).toBe(true)
    expect(result.config.pointCount).toBe(6000)
  })

  it('名称列表会去重并过滤空值', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      stateNames: ['玄羽国', ' ', '玄羽国', '白银商会'],
    }))
    expect(result.ok).toBe(true)
    expect(result.config.stateNames).toEqual(['玄羽国', '白银商会'])
  })
})

describe('mergeNameSeeds', () => {
  it('按 primary 优先合并并去重截断', () => {
    expect(mergeNameSeeds(['世界书国', '重复'], ['AI国', '重复'], 3)).toEqual(['世界书国', '重复', 'AI国'])
  })
})
