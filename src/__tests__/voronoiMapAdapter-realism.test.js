import { describe, it, expect } from 'vitest'
import { parseVoronoiMapConfig } from '../services/ai/voronoiMapAdapter'

describe('parseVoronoiMapConfig - realism', () => {
  it('合法 level 解析', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x', realism: { level: 'azgaar' }
    }))
    expect(cfg.realism.level).toBe('azgaar')
  })

  it('非法 level fallback 到 azgaar', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x', realism: { level: 'invalid' }
    }))
    expect(cfg.realism.level).toBe('azgaar')
  })

  it('realism 缺失时不写入字段', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({ seed: 'x' }))
    expect(cfg.realism).toBeUndefined()
  })
})

describe('parseVoronoiMapConfig - constraints', () => {
  it('mountains 解析', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1, 2, 3], type: 'range' }]
      }
    }))
    expect(cfg.constraints.mountains).toHaveLength(1)
    expect(cfg.constraints.mountains[0].name).toBe('M1')
  })

  it('mountains 过滤无效 cell', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1, 'bad', -1, 5], type: 'range' }]
      }
    }))
    expect(cfg.constraints.mountains[0].cells).toEqual([1, 5])
  })

  it('mountains.type 非法值 fallback 到 range', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1], type: 'volcanoic' }]
      }
    }))
    expect(cfg.constraints.mountains[0].type).toBe('range')
  })
})
