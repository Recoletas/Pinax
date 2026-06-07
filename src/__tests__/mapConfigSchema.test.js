import { describe, expect, it } from 'vitest'
import { validateMapConfig } from '../services/ai/mapConfigSchema'

describe('validateMapConfig', () => {
  it('超界值返回 warnings', () => {
    const result = validateMapConfig({ plateCount: 99 })
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.includes('plateCount'))).toBe(true)
  })

  it('未知字段会被记录', () => {
    const result = validateMapConfig({ foo: 1 })
    expect(result.ok).toBe(true)
    expect(result.unknownFields).toEqual(['foo'])
  })

  it('非法 style preset 给出 warnings', () => {
    const result = validateMapConfig({ stylePreset: 'fantasy' })
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.includes('stylePreset'))).toBe(true)
  })

  it('非法 layers 对象给出 warnings', () => {
    const result = validateMapConfig({ layers: { fog: true } })
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.includes('layers.fog'))).toBe(true)
  })

  it('新增渲染图层键不会被误判为未知', () => {
    const result = validateMapConfig({
      layers: {
        hillshade: true,
        coastGlow: true,
        landDividers: true,
        borderlands: true,
        factionTexture: false,
      },
    })
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('根节点不是对象时返回 validation 失败', () => {
    const result = validateMapConfig([])
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('root')
  })
})
