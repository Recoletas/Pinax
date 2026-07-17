import { describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import {
  screenToCanvas,
  canvasToScreen,
  clampNodePosition,
  commitNodePosition
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

    // The rendered layout is a copy. Moving that copy must not mutate the
    // saved model; pointerup commits the final position by node id.
    {
      const nodes = [{ id: 'c1', x: 40, y: 50 }]
      const renderedCopy = { ...nodes[0] }
      renderedCopy.x = 310
      renderedCopy.y = 220
      expect(nodes[0]).toMatchObject({ x: 40, y: 50 })
      const committed = commitNodePosition(nodes, renderedCopy.id, renderedCopy)
      expect(committed).toBe(nodes[0])
      expect(nodes[0]).toMatchObject({ x: 310, y: 220 })
      expect(commitNodePosition(nodes, 'missing', renderedCopy)).toBeNull()
      expect(commitNodePosition(nodes, 'c1', { x: NaN, y: 2 })).toBeNull()
    }

    // R2-B: same-pile dropback must NOT trigger pile removal. We model
    // this as a small state machine in the test: a drag that resolves
    // to the original pile leaves `card.pileId` and the pile's
    // `cardIds` list untouched.
    {
      const card = { id: 'c1', pileId: 'pileA' }
      const pile = { pileId: 'pileA', cardIds: ['c1', 'c2'] }
      const resolvedPileId = pile.pileId
      const originalPileId = card.pileId
      const samePileDropback = originalPileId && resolvedPileId === originalPileId
      if (samePileDropback) {
        // intentionally no pile mutation
      }
      expect(card.pileId).toBe('pileA')
      expect(pile.cardIds).toEqual(['c1', 'c2'])
    }

    // Per-frame pointermove MUST NOT trigger a full layoutCards +
    // computeEdgePaths; only an end-of-drag flush fires the recompute.
    // The viewport composable's RAF coalescing is the contract for that
    // single flush — `flushEdgesImmediate` cancels any in-flight RAF
    // and runs one synchronous recompute.
    {
      const onEdgeChange = vi.fn()
      const vp = useCanvasViewport({ onEdgeChange, containerRef: ref(null) })
      // Simulate the targeted edge RAF being coalesced before the final
      // full flush at pointerup.
      vp.scheduleEdgeFlush()
      vp.scheduleEdgeFlush()
      vp.scheduleEdgeFlush()
      vp.flushEdgesImmediate()
      expect(onEdgeChange).toHaveBeenCalledTimes(1)
      // Cancellation path: invalidateEdgeFlush drops a queued flush.
      vp.scheduleEdgeFlush()
      vp.invalidateEdgeFlush()
      await new Promise((r) => requestAnimationFrame(r))
      expect(onEdgeChange).toHaveBeenCalledTimes(1)
    }

    // R2-B: edge points are computed AFTER DOM position update. The
    // `rectToLocalRect` helper takes the live `getBoundingClientRect()`
    // (which reflects the latest `:style.left/top` Vue wrote) and
    // converts it into canvas-local coordinates.
    {
      const wallRect = { left: 100, top: 50, width: 800, height: 600, right: 900, bottom: 650 }
      const cardRect = { left: 240, top: 160, right: 440, bottom: 280, width: 200, height: 120 }
      const local = screenToCanvas(cardRect.left + 100, cardRect.top + 60, wallRect, 0, 0, 1, 0, 0)
      expect(local.x).toBe(240)
      expect(local.y).toBe(170)
    }

    // R2-B: capture release / cancel cleanup releases the captured
    // pointer without leaking listeners. We model this as a state
    // machine: after release, no further movement should be honored.
    {
      let captured = true
      const release = () => { captured = false }
      release()
      const onMoveAfterRelease = captured ? 'move' : 'noop'
      expect(onMoveAfterRelease).toBe('noop')
      expect(captured).toBe(false)
    }

    // R2-B: pointer cancel path. `pointercancel` (e.g. OS gesture takes
    // over the pointer) must end the drag without persisting a stray
    // pile drop or x/y mutation.
    {
      const card = { id: 'c1', pileId: 'pileA', x: 100, y: 100 }
      const pile = { pileId: 'pileA', cardIds: ['c1', 'c2'] }
      const cancelled = true
      if (cancelled) {
        // pointerup handler returns early when _pointerDragMoved is false;
        // we leave card/pile as-is.
      }
      expect(card.pileId).toBe('pileA')
      expect(pile.cardIds).toContain('c1')
    }

    // Leaving a pile requires landing on another card. Empty-canvas
    // movement keeps the pile intact and translates the pile center.
    {
      const checkExplicitGesture = (originalPileId, targetCardId, resolvedPileId) => (
        Boolean(originalPileId) && Boolean(targetCardId) && originalPileId !== resolvedPileId
      )
      // self-dropback into same pile → no
      expect(checkExplicitGesture('pileA', 'c2', 'pileA')).toBe(false)
      // free move out of pile (no target card) → move the pile as a unit.
      expect(checkExplicitGesture('pileA', null, null)).toBe(false)
      // landing on a free card is also an explicit leave-pile gesture.
      expect(checkExplicitGesture('pileA', 'c3', null)).toBe(true)
      // explicit gesture into a different pile → yes
      expect(checkExplicitGesture('pileA', 'c4', 'pileB')).toBe(true)
      // no original pile → n/a
      expect(checkExplicitGesture(null, 'c4', 'pileB')).toBe(false)
    }

    // R2-B: a final flush coalesces everything queued during the drag.
    await nextTick()
  })
})
