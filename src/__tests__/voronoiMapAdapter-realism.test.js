import { describe, it, expect } from 'vitest'
import { parseVoronoiMapConfig } from '../services/ai/voronoiMapAdapter'

describe('parseVoronoiMapConfig - realism（新管线）', () => {
  it('合法 heightmapTemplate 解析', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x', heightmapTemplate: 'pangea',
    }))
    expect(result.ok).toBe(true)
    expect(result.config.heightmapTemplate).toBe('pangea')
  })

  it('合法 plateCount 解析', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x', plateCount: 8,
    }))
    expect(result.ok).toBe(true)
    expect(result.config.plateCount).toBe(8)
  })

  it('plateCount 缺失时取 continentCount alias', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x', continentCount: 4,
    }))
    expect(result.ok).toBe(true)
    expect(result.config.plateCount).toBe(4)
  })

  it('plateCount 越界时 clamp 到 [2, 12]', () => {
    const lo = parseVoronoiMapConfig(JSON.stringify({ seed: 'x', plateCount: -5 }))
    const hi = parseVoronoiMapConfig(JSON.stringify({ seed: 'x', plateCount: 99 }))
    expect(lo.ok).toBe(true)
    expect(hi.ok).toBe(true)
    expect(lo.config.plateCount).toBe(2)
    expect(hi.config.plateCount).toBe(12)
  })

  it('realism 缺失时不写入字段', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({ seed: 'x' }))
    expect(result.ok).toBe(true)
    expect(result.config.realism).toBeUndefined()
  })

  it('旧 level 字段被静默忽略（向后兼容）', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x', realism: { level: 'azgaar' },
    }))
    // 旧存档兼容：只剩 level，无任何子字段 → 整个 realism 被丢弃
    expect(result.ok).toBe(true)
    expect(result.config.realism).toBeUndefined()
  })
})

describe('parseVoronoiMapConfig - constraints', () => {
  it('mountains 解析', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1, 2, 3], type: 'range' }]
      }
    }))
    expect(result.ok).toBe(true)
    expect(result.config.constraints.mountains).toHaveLength(1)
    expect(result.config.constraints.mountains[0].name).toBe('M1')
  })

  it('mountains 过滤无效 cell', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1, 'bad', -1, 5], type: 'range' }]
      }
    }))
    expect(result.ok).toBe(true)
    expect(result.config.constraints.mountains[0].cells).toEqual([1, 5])
  })

  it('mountains.type 非法值 fallback 到 range', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1], type: 'volcanoic' }]
      }
    }))
    expect(result.ok).toBe(true)
    expect(result.config.constraints.mountains[0].type).toBe('range')
  })

  it('非法 JSON 返回 parse 失败结构', () => {
    const result = parseVoronoiMapConfig('{bad json')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('PARSE')
  })

  it('stateNames/burgNames 长度不足时给出 warnings', () => {
    const result = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      stateCount: 4,
      stateNames: ['甲', '乙'],
      burgNames: ['城1', '城2', '城3'],
    }))
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.includes('stateNames'))).toBe(true)
    expect(result.warnings.some(w => w.includes('burgNames'))).toBe(true)
  })
})
