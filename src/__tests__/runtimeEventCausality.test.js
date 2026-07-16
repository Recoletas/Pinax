import { describe, expect, it } from 'vitest'
import { buildRuntimeEventCausality, detectRuntimeEventConflicts } from '../services/runtimeEventCausality'

describe('runtimeEventCausality', () => {
  it('builds explicit parent edges and reports missing parents', () => {
    const report = buildRuntimeEventCausality([
      { id: 'evt-root', type: 'turn', ts: 1, payload: { preview: '开始' } },
      { id: 'evt-child', parentId: 'evt-root', type: 'display_event', ts: 2, payload: { placeId: 'place:harbor' } },
      { id: 'evt-orphan', parentId: 'evt-missing', type: 'turn', ts: 3, payload: {} }
    ])

    expect(report.edges).toContainEqual({ from: 'evt-root', to: 'evt-child', kind: 'parent' })
    expect(report.orphanParentIds).toEqual(['evt-missing'])
    expect(report.roots.map((event) => event.id)).toEqual(['evt-root', 'evt-orphan'])
  })

  it('detects a state snapshot divergence on the same branch', () => {
    const events = [
      {
        id: 'evt-a',
        type: 'state_delta',
        branchId: 'main',
        ts: 1,
        payload: { after: { flags: { gateOpen: true } } }
      },
      {
        id: 'evt-b',
        type: 'state_delta',
        branchId: 'main',
        parentId: 'evt-a',
        ts: 2,
        payload: {
          before: { flags: { gateOpen: false } },
          after: { flags: { gateOpen: true } }
        }
      }
    ]

    const conflicts = detectRuntimeEventConflicts(events)

    expect(conflicts).toContainEqual(expect.objectContaining({
      code: 'state-snapshot-divergence',
      eventId: 'evt-b',
      previousEventId: 'evt-a',
      path: 'flags'
    }))
  })

  it('keeps separate branches independent and returns a clean report when consistent', () => {
    const events = [
      {
        id: 'evt-a',
        type: 'state_delta',
        branchId: 'branch-a',
        ts: 1,
        payload: { after: { flags: { gateOpen: true } } }
      },
      {
        id: 'evt-b',
        type: 'state_delta',
        branchId: 'branch-b',
        ts: 2,
        payload: { before: { flags: { gateOpen: false } }, after: { flags: { gateOpen: true } } }
      }
    ]

    const report = buildRuntimeEventCausality(events)

    expect(report.conflicts).toEqual([])
    expect(report.isConsistent).toBe(true)
    expect(report.nodes).toHaveLength(2)
  })
})
