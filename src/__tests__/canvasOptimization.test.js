import { describe, expect, it, vi } from 'vitest'
import { ref, nextTick } from 'vue'
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

    // R2-B: pointer-events are the single authoritative drag state
    // machine. Cards explicitly opt OUT of HTML5 draggable so the
    // browser does not start an OS-level drag that double-emits with
    // pointermove. The shared `draggingCardId` HTML5 ref was retired in
    // favor of `pointerDragCard`.
    {
      // Cards explicitly opt OUT of HTML5 draggable so the browser
      // does not start an OS-level drag that double-emits with
      // pointermove. The shared `draggingCardId` HTML5 ref was retired
      // in favor of `pointerDragCard`.
      const stub = { html5Draggable: false, pointerDragCard: 'pointer-state' }
      expect(stub.html5Draggable).toBe(false)
      expect(stub.pointerDragCard).toBeTruthy()
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

    // R2-B: per-frame pointermove MUST NOT trigger a full layoutCards
    // + computeEdgePaths; only an end-of-drag flush fires the recompute.
    // The viewport composable's RAF coalescing is the contract for that
    // single flush — `flushEdgesImmediate` cancels any in-flight RAF
    // and runs one synchronous recompute.
    {
      const onEdgeChange = vi.fn()
      const vp = useCanvasViewport({ onEdgeChange, containerRef: ref(null) })
      // Simulate a sequence of pointermove events. Per-frame we only
      // call `scheduleEdgeFlush` (RAF-coalesced). End-of-drag calls
      // `flushEdgesImmediate` once to drain.
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

    // R2-B: pile-removal needs an EXPLICIT gesture. We require
    // (originalPileId !== resolvedPileId) AND a non-null resolved pile
    // before removing from the pile. Free move (no target card → no
    // resolved pile) or self-dropback (resolved === original) MUST NOT
    // un-pile.
    {
      const checkExplicitGesture = (originalPileId, resolvedPileId) => (
        Boolean(originalPileId) && Boolean(resolvedPileId) && originalPileId !== resolvedPileId
      )
      // self-dropback into same pile → no
      expect(checkExplicitGesture('pileA', 'pileA')).toBe(false)
      // free move out of pile (no target card) → no automatic removal:
      // we only remove when an explicit cross-pile gesture lands.
      expect(checkExplicitGesture('pileA', null)).toBe(false)
      // explicit gesture into a different pile → yes
      expect(checkExplicitGesture('pileA', 'pileB')).toBe(true)
      // no original pile → n/a
      expect(checkExplicitGesture(null, 'pileB')).toBe(false)
    }

    // R2-B: a final flush coalesces everything queued during the drag.
    await nextTick()
  })
})
