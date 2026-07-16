import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  screenToCanvas,
  canvasToScreen,
  clampNodePosition
} from '../services/canvasGeometry'
import { useCanvasViewport } from '../composables/useCanvasViewport'

describe('canvas optimization contracts', () => {
  it('keeps coordinates finite and coalesces edge updates', async () => {
    const rect = { left: 200, top: 100, width: 800, height: 600 }
    // 100 nodes × 200 edges worth of point-pairs is just a loop;
    // the contract is stability, not absolute timing.
    for (let i = 0; i < 100; i++) {
      const sx = 500 + i * 7
      const sy = 300 + i * 3
      const c = screenToCanvas(sx, sy, rect, 50, 30, 2, 100, 80)
      const b = canvasToScreen(c.x, c.y, rect, 2, 100, 80, 50, 30)
      expect(Math.abs(b.x - sx)).toBeLessThan(0.01)
      expect(Math.abs(b.y - sy)).toBeLessThan(0.01)
    }
    const pos = clampNodePosition(NaN, Infinity, -1, NaN, NaN, undefined)
    expect(Number.isFinite(pos.x)).toBe(true)
    expect(Number.isFinite(pos.y)).toBe(true)
    expect(pos.x).toBe(40)
    expect(pos.y).toBe(40)
    const onEdgeChange = vi.fn()
    const vp = useCanvasViewport({ onEdgeChange, containerRef: ref(null) })

    vp.scheduleEdgeFlush()
    vp.scheduleEdgeFlush()
    vp.scheduleEdgeFlush()

    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))

    expect(onEdgeChange).toHaveBeenCalledTimes(1)
  })
})
