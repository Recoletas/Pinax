import { describe, it, expect } from 'vitest'
import { getPipeline, getAvailableLayers } from '../services/world-map/engine/renderer-pipeline'

describe('getPipeline', () => {
  it('topographic preset: hillshade 强开启', () => {
    const p = getPipeline('topographic')
    const hillshade = p.find(l => l.name === 'hillshade')
    expect(hillshade).toBeDefined()
    expect(hillshade.enabled).toBe(true)
  })

  it('clean preset: factionTexture 开启，hillshade 弱化/关闭', () => {
    const p = getPipeline('clean')
    const faction = p.find(l => l.name === 'factionTexture')
    expect(faction?.enabled).toBe(true)
    const hillshade = p.find(l => l.name === 'hillshade')
    expect(hillshade?.enabled).toBe(false)
  })

  it('parchment preset: borderlands + factionTexture 都开启', () => {
    const p = getPipeline('parchment')
    expect(p.find(l => l.name === 'borderlands')?.enabled).toBe(true)
    expect(p.find(l => l.name === 'factionTexture')?.enabled).toBe(true)
  })

  it('6 个 preset 都返回非空 pipeline', () => {
    for (const preset of ['topographic', 'parchment', 'watercolor', 'dark', 'clean', 'atlas']) {
      expect(getPipeline(preset).length).toBeGreaterThan(0)
    }
  })
})

describe('getAvailableLayers', () => {
  it('返回所有可用 layer 名', () => {
    const layers = getAvailableLayers()
    expect(layers).toContain('hillshade')
    expect(layers).toContain('volcanoes')
    expect(layers).toContain('borderlands')
    expect(layers).toContain('factionTexture')
  })
})
