import { describe, expect, it } from 'vitest'
import {
  overlaps,
  overlapsAny,
  padRect,
  placeLabels,
} from '../services/world-map/engine/label-layout'

describe('label-layout: overlaps', () => {
  it('returns true for intersecting rects and false for disjoint rects', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    expect(overlaps(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true)
    expect(overlaps(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(false) // edge-touch is not an overlap
    expect(overlaps(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false)
    expect(overlaps(a, { minX: 0, minY: 10, maxX: 5, maxY: 20 })).toBe(false) // edge-touch
    expect(overlaps(a, a)).toBe(true) // identical self-overlaps
  })

  it('overlapsAny matches first hit and false when empty', () => {
    const a = { minX: 0, minY: 0, maxX: 4, maxY: 4 }
    expect(overlapsAny(a, [])).toBe(false)
    expect(overlapsAny(a, [{ minX: 100, minY: 100, maxX: 110, maxY: 110 }, { minX: 2, minY: 2, maxX: 6, maxY: 6 }])).toBe(true)
    expect(overlapsAny(a, [{ minX: 100, minY: 100, maxX: 110, maxY: 110 }])).toBe(false)
  })

  it('padRect expands symmetrically by pad', () => {
    const r = padRect({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 2)
    expect(r).toEqual({ minX: -2, minY: -2, maxX: 12, maxY: 12 })
  })
})

describe('label-layout: placeLabels priority + collision', () => {
  const slot = (minX, minY, maxX, maxY, x, y) => ({ rect: { minX, minY, maxX, maxY }, x, y })

  it('places the highest-priority item first and reserves its space', () => {
    // Two items whose only candidate rects overlap. High-priority wins, low-priority is skipped.
    const high = {
      key: 'H', priority: 100, force: false,
      candidates: [slot(0, 0, 10, 10, 5, 5)],
    }
    const low = {
      key: 'L', priority: 1, force: false,
      candidates: [slot(5, 5, 15, 15, 10, 10)],
    }
    const placed = placeLabels([low, high]) // input order must not matter
    expect(placed.has('H')).toBe(true)
    expect(placed.has('L')).toBe(false)
  })

  it('uses the first non-colliding candidate before falling back', () => {
    // Low priority placed first reserves a rect; high-priority item then has two
    // candidates — the first collides, the second is free. It must take the second.
    const blocker = {
      key: 'B', priority: 1000, force: false,
      candidates: [slot(0, 0, 10, 10, 5, 5)],
    }
    const chooser = {
      key: 'C', priority: 1, force: false,
      candidates: [
        slot(2, 2, 8, 8, 5, 5), // collides with blocker
        slot(100, 100, 110, 110, 105, 105), // free
      ],
    }
    const placed = placeLabels([blocker, chooser])
    expect(placed.get('C')).toEqual(slot(100, 100, 110, 110, 105, 105))
  })

  it('forces a forced item onto its first candidate even on collision', () => {
    const blocker = {
      key: 'B', priority: 1000, force: false,
      candidates: [slot(0, 0, 10, 10, 5, 5)],
    }
    const forced = {
      key: 'F', priority: 1, force: true,
      candidates: [slot(2, 2, 8, 8, 5, 5)], // overlaps blocker
    }
    const placed = placeLabels([blocker, forced])
    expect(placed.has('F')).toBe(true)
    expect(placed.get('F')).toEqual(slot(2, 2, 8, 8, 5, 5))
  })

  it('skips a non-forced item when all candidates collide', () => {
    const blocker = {
      key: 'B', priority: 1000, force: false,
      candidates: [slot(0, 0, 10, 10, 5, 5)],
    }
    const skipped = {
      key: 'S', priority: 1, force: false,
      candidates: [
        slot(1, 1, 9, 9, 5, 5),
        slot(2, 2, 8, 8, 5, 5),
      ], // both collide with blocker
    }
    const placed = placeLabels([blocker, skipped])
    expect(placed.has('B')).toBe(true)
    expect(placed.has('S')).toBe(false)
  })

  it('treats pre-filled occupied rects as reserved space', () => {
    const item = {
      key: 'X', priority: 99, force: false,
      candidates: [
        slot(0, 0, 10, 10, 5, 5),  // overlaps occupied
        slot(50, 50, 60, 60, 55, 55), // free
      ],
    }
    const placed = placeLabels([item], [{ minX: -2, minY: -2, maxX: 12, maxY: 12 }])
    expect(placed.get('X')).toEqual(slot(50, 50, 60, 60, 55, 55))
  })

  it('handles empty items and empty candidates gracefully', () => {
    expect(placeLabels([], []).size).toBe(0)
    expect(placeLabels([{ key: 'K', priority: 1, force: false, candidates: [] }], []).has('K')).toBe(false)
  })
})
