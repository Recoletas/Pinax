import { describe, expect, it } from 'vitest'
import { generateMap } from '@/services/world-map/engine'
import { clamp, inferCanvasHeight } from '@/services/world-map/engine/math'
import {
  hash2D,
  valueNoise2D,
  fbmHash,
  fbmValue,
  smooth01,
  lerp,
  FBM_OCTAVE_ANGLE_DEG
} from '@/services/world-map/engine/noise'

// Phase C 整合回归测试（audit-pass2-plan Phase C4/C5）。
//
// 核心护栏：本次重构是 byte-identical in-place 替换，地图生成结果必须
// 与整合前完全一致（map-seed determinism）。任何 cells.h 特征值变化
// = 跨 hash↔value 类型迁移错误。
//
// baseline 特征值取自整合后的 generateMap({ seed: 'consolidate-baseline', pointCount: 800 })。
// 若本测试失败，说明 noise/math 收敛过程中改变了某个函数的数值行为。

describe('Phase C — math/noise 整合', () => {
  describe('math.ts', () => {
    it('clamp 限制到 [min, max] 区间', () => {
      expect(clamp(-5, 0, 100)).toBe(0)
      expect(clamp(150, 0, 100)).toBe(100)
      expect(clamp(50, 0, 100)).toBe(50)
      // 边界
      expect(clamp(0, 0, 100)).toBe(0)
      expect(clamp(100, 0, 100)).toBe(100)
    })

    it('inferCanvasHeight 在空 cells 上返回 1（避免除零）', () => {
      const emptyCells = { length: 0, p: new Float64Array(0) }
      expect(inferCanvasHeight(emptyCells, 0)).toBe(1)
    })

    it('inferCanvasHeight 返回 cells.p 中 y 的最大值', () => {
      // p 是 [x0,y0,x1,y1,...] 交错数组
      const cells = { length: 2, p: Float64Array.from([10, 20, 30, 55]) }
      expect(inferCanvasHeight(cells, 2)).toBe(55)
    })
  })

  describe('noise.ts — 两种 fbm 变体不可混用', () => {
    it('fbmHash ≠ fbmValue（确认两种变体并存，未错误合并）', () => {
      // 取一个非平凡采样点
      const x = 1.5
      const y = 0.3
      const octaves = 3
      const a = fbmHash(x, y, octaves)
      const b = fbmValue(x, y, octaves)
      // 数学上：hash 变体每层用 hash2D*2-1，value 变体每层用 valueNoise2D
      // 两者的数值序列几乎不可能完全相等（除非 seed 退化）。
      expect(a).not.toBe(b)
      // 都应是有限数
      expect(Number.isFinite(a)).toBe(true)
      expect(Number.isFinite(b)).toBe(true)
    })

    it('hash2D 返回 [0, 1) 区间', () => {
      const v = hash2D(1.7, 2.3)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    })

    it('valueNoise2D 返回 [-1, 1] 区间', () => {
      const v = valueNoise2D(1.7, 2.3)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    })

    it('FBM_OCTAVE_ANGLE_DEG = 37（P0-3 de-banding 常量）', () => {
      expect(FBM_OCTAVE_ANGLE_DEG).toBe(37)
    })

    it('smooth01 / lerp 行为正确', () => {
      expect(smooth01(0)).toBe(0)
      expect(smooth01(1)).toBe(1)
      expect(lerp(0, 10, 0.5)).toBe(5)
    })
  })

  describe('C5 — generateMap seed determinism（零漂移）', () => {
    // baseline：大陆形状优化（岛屿生成 + 海岸破碎化 + 纬度偏移）之后的 cells.h 特征值。
    // 这里仍然锁住同 seed 的 byte-identical；若后续有意调整地貌算法，
    // 必须同步更新指纹并在地图视觉回归中说明原因。
    const BASELINE = {
      length: 800,
      sum: 12806,
      landCount: 283,
      maxH: 79,
      minH: 0,
      landRatio: 0.35375,
      head: [1, 1, 0, 1, 0, 1, 0, 5, 4, 4],
      mid: [0, 0, 0, 1, 11, 10, 8, 10, 10, 51],
      tail: [6, 4, 8, 1, 1, 4, 2, 6, 0, 0]
    }

    it('同 seed 生成结果稳定（两次生成 byte-identical）', () => {
      const a = generateMap({ seed: 'consolidate-baseline', pointCount: 800 })
      const b = generateMap({ seed: 'consolidate-baseline', pointCount: 800 })
      const ha = a.cells.h
      const hb = b.cells.h
      expect(ha.length).toBe(hb.length)
      for (let i = 0; i < ha.length; i++) {
        expect(ha[i]).toBe(hb[i])
      }
    })

    it('cells.h 特征值与 baseline 一致（整合零漂移）', () => {
      const map = generateMap({ seed: 'consolidate-baseline', pointCount: 800 })
      const h = map.cells.h

      let sum = 0
      let landCount = 0
      let maxH = 0
      let minH = 255
      for (let i = 0; i < h.length; i++) {
        sum += h[i]
        if (h[i] >= 20) landCount++
        if (h[i] > maxH) maxH = h[i]
        if (h[i] < minH) minH = h[i]
      }

      expect(h.length).toBe(BASELINE.length)
      expect(sum).toBe(BASELINE.sum)
      expect(landCount).toBe(BASELINE.landCount)
      expect(maxH).toBe(BASELINE.maxH)
      expect(minH).toBe(BASELINE.minH)
      expect(landCount / h.length).toBe(BASELINE.landRatio)
      // 精确指纹：头/中/尾各 10 个 cell
      expect(Array.from(h.slice(0, 10))).toEqual(BASELINE.head)
      expect(Array.from(h.slice(Math.floor(h.length / 2), Math.floor(h.length / 2) + 10))).toEqual(BASELINE.mid)
      expect(Array.from(h.slice(-10))).toEqual(BASELINE.tail)
    })
  })
})
