import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { renderMap, renderScaleBarLayer } from '../services/world-map/engine/renderer'
import { createCanvas } from './helpers/canvas'

/**
 * Task 12: Phase 3 渲染冒烟测试
 * 验证：在 6 个 preset 下 renderMap 不抛错
 *
 * 注：jsdom 的 canvas ctx 是简化版本，不支持所有 API，但足以验证
 *   - pipeline 解析正确
 *   - 各 draw 函数签名正确
 *   - 不会因为新 layer 而崩溃
 */
describe('renderMap 冒烟', () => {
  for (const preset of ['topographic', 'parchment', 'watercolor', 'dark', 'clean', 'atlas']) {
    it(`${preset} preset 渲染不抛错`, () => {
      const data = generateMap({
        seed: `render-${preset}`,
        pointCount: 500,
      })
      const canvas = createCanvas(800, 600)
      expect(() => renderMap(canvas, data, { stylePreset: preset })).not.toThrow()
    })
  }

  it('meandering realism + parchment preset 渲染不抛错', () => {
    const data = generateMap({
      seed: 'render-meander',
      pointCount: 500,
      realism: { rivers: { style: 'meandering', meanderAmplitude: 4 } },
    })
    const canvas = createCanvas(800, 600)
    expect(() => renderMap(canvas, data, { stylePreset: 'parchment' })).not.toThrow()
  })

  it('opts.layers 覆盖 pipeline：hillshade: false 时不渲染山影', () => {
    const data = generateMap({ seed: 'render-overrides', pointCount: 400 })
    const canvas = createCanvas(800, 600)
    expect(() => renderMap(canvas, data, {
      stylePreset: 'topographic',
      layers: { hillshade: false },
    })).not.toThrow()
  })

  it('scaleBar overlay 单层渲染不抛错，并按 scale 设置尺寸', () => {
    const data = generateMap({ seed: 'render-scale-bar', pointCount: 400 })
    const canvas = createCanvas(1, 1)
    expect(() => renderScaleBarLayer(canvas, data, {
      scale: 2,
      kmPerPixel: 5,
      stylePreset: 'topographic',
    })).not.toThrow()
    expect(canvas.width).toBe(data.width * 2)
    expect(canvas.height).toBe(data.height * 2)
  })

  it('scaleBar overlay 遵守 layers.scaleBar: false', () => {
    const data = generateMap({ seed: 'render-scale-bar-off', pointCount: 400 })
    const canvas = createCanvas(1, 1)
    expect(() => renderScaleBarLayer(canvas, data, {
      scale: 2,
      stylePreset: 'topographic',
      layers: { scaleBar: false },
    })).not.toThrow()
    expect(canvas.width).toBe(data.width * 2)
    expect(canvas.height).toBe(data.height * 2)
  })
})
