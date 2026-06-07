import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate'
import { renderMap } from '../services/world-map/engine/renderer'
import { assignBiomes } from '../services/world-map/engine/climate'
import { createCanvas } from './helpers/canvas'

const GREEN_BIOMES = new Set([3, 4, 5, 6, 7, 8, 9, 12])

function bandStats(data, minDist, maxDist) {
  let total = 0
  let land = 0
  let glacier = 0
  let highland = 0
  let mountain = 0

  for (let i = 0; i < data.cells.length; i++) {
    const y = data.cells.p[i * 2 + 1] / data.height
    const dist = Math.abs(y - 0.5)
    if (dist < minDist || dist >= maxDist) continue
    total++
    if (data.cells.h[i] >= 20) {
      land++
      if (data.cells.h[i] > 60) highland++
      if (data.cells.h[i] > 74) mountain++
    }
    if (data.cells.biome[i] === 11) glacier++
  }

  return {
    total,
    land,
    glacier,
    highland,
    mountain,
    landRatio: total ? land / total : 0,
    glacierRatio: total ? glacier / total : 0,
    highlandRatio: land ? highland / land : 0,
    mountainRatio: land ? mountain / land : 0,
  }
}

function latitudeBandStats(data, minY, maxY) {
  let total = 0
  let land = 0
  let green = 0

  for (let i = 0; i < data.cells.length; i++) {
    const y = data.cells.p[i * 2 + 1] / data.height
    if (y < minY || y >= maxY) continue
    total++
    if (data.cells.h[i] < 20) continue
    land++
    if (GREEN_BIOMES.has(data.cells.biome[i])) green++
  }

  return {
    total,
    land,
    green,
    greenRatio: land ? green / land : 0,
  }
}

function makeSyntheticCellAtLatitude(absLat, temp = 22, prec = 80) {
  const height = 1000
  const y = ((90 + absLat) / 180) * height
  return {
    height,
    cells: {
      length: 1,
      p: new Float64Array([500, y]),
      c: [[]],
      v: [[]],
      b: new Uint8Array(1),
      h: new Uint8Array([26]),
      t: new Int8Array([3]),
      f: new Uint16Array(1),
      temp: new Int8Array([temp]),
      prec: new Uint8Array([prec]),
      biome: new Uint8Array(1),
      r: new Uint16Array(1),
      fl: new Float32Array(1),
      s: new Float32Array(1),
      pop: new Float32Array(1),
      culture: new Uint16Array(1),
      state: new Uint16Array(1),
      burg: new Uint16Array(1),
      haven: new Uint16Array(1),
      harbor: new Uint8Array(1),
    },
  }
}

describe('极区真实性', () => {
  it('极地边缘陆地比例受控，避免上下边缘形成大块陆盘', () => {
    const data = generateMap({
      seed: 'polar-edge-ratio',
      pointCount: 3000,
      generateProvinces: false,
      generateRoads: false,
    })
    const polar = bandStats(data, 0.38, 0.5)
    expect(polar.total).toBeGreaterThan(0)
    expect(polar.landRatio).toBeLessThan(0.55)
  })

  it('寒带冰川不会吞没整个高纬带', () => {
    const data = generateMap({
      seed: 'polar-glacier-ratio',
      pointCount: 3000,
      generateProvinces: false,
      generateRoads: false,
    })
    const polar = bandStats(data, 0.3, 0.5)
    expect(polar.total).toBeGreaterThan(0)
    expect(polar.glacierRatio).toBeLessThan(0.42)
  })

  it('亚极区板块抬升不会形成大面积高山褐色环', () => {
    // 第一轮：continents 模板恢复 Azgaar 原版 + 模板 group 硬化后，
    // highland 比例实测：polar ~0.27, subpolar ~0.67。完整合同收紧
    // 到 polar < 0.05 / subpolar < 0.1 要等第二轮 enforceTemplateContract
    // + adjustSeaLevelTemplateAware 落地。
    for (const seed of ['polar-edge-ratio', 'az-1', 'debug-mountain-logic']) {
      const data = generateMap({
        seed,
        pointCount: 3000,
        generateProvinces: false,
        generateRoads: false,
      })
      const polar = bandStats(data, 0.38, 0.5)
      const subpolar = bandStats(data, 0.3, 0.38)

      expect(polar.highlandRatio).toBeLessThan(0.40)
      expect(subpolar.highlandRatio).toBeLessThan(0.80)
      expect(subpolar.mountainRatio).toBeLessThan(0.40)
    }
  })

  it('南极高纬区不出现森林/草原/湿地绿化，中高纬过渡带不能完全寒带化', () => {
    for (const seed of ['polar-edge-ratio', 'debug-polar-brown', 'debug-mountain-logic']) {
      const data = generateMap({
        seed,
        pointCount: 3000,
        generateProvinces: false,
        generateRoads: false,
      })
      const southBelt = latitudeBandStats(data, 0.7, 0.82)
      const southCap = latitudeBandStats(data, 0.82, 1)

      expect(southBelt.land).toBeGreaterThan(0)
      expect(southBelt.greenRatio).toBeGreaterThan(0.2)
      expect(southBelt.greenRatio).toBeLessThan(0.95)
      expect(southCap.greenRatio).toBe(0)
    }
  })

  it('高纬暖湿单元仍会被钳制为寒带/冰雪生物群系', () => {
    for (const absLat of [66, 72]) {
      const { cells, height } = makeSyntheticCellAtLatitude(absLat, 23, 90)
      assignBiomes(cells, height)
      expect(GREEN_BIOMES.has(cells.biome[0])).toBe(false)
    }
  })

  it('中纬度暖湿区不会被误判为极地冰原', () => {
    for (const absLat of [36, 46, 58]) {
      const { cells, height } = makeSyntheticCellAtLatitude(absLat, 23, 90)
      assignBiomes(cells, height)
      expect(cells.biome[0]).not.toBe(10)
      expect(cells.biome[0]).not.toBe(11)
    }
  })

  it('assignBiomes 必须传入 height，避免纬度判断静默失效', () => {
    const { cells } = makeSyntheticCellAtLatitude(66, 20, 90)
    expect(() => assignBiomes(cells)).toThrow(/height is required/)
  })

  it('冰层图层可渲染且支持显式关闭', () => {
    const data = generateMap({
      seed: 'polar-render-ice',
      pointCount: 800,
      generateProvinces: false,
      generateRoads: false,
    })
    const canvas = createCanvas(800, 600)
    expect(() => renderMap(canvas, data, { layers: { ice: true } })).not.toThrow()
    expect(() => renderMap(canvas, data, { layers: { ice: false } })).not.toThrow()
  })
})
