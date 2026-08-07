import { describe, expect, it } from 'vitest'
import {
  buildRuntimeCausalityContext,
  buildRuntimeEventCausality,
  describeRuntimeStateTransitions,
  detectRuntimeEventConflicts
} from '../services/runtimeEventCausality'

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
      },
      {
        id: 'evt-control',
        type: 'state_delta',
        branchId: 'main',
        parentId: 'evt-b',
        ts: 3,
        payload: {
          before: { placeStates: { harbor: { controllerId: 'guild-a' } } },
          after: { placeStates: { harbor: { controllerId: 'guild-b' } } }
        }
      },
      {
        id: 'evt-revival',
        type: 'state_delta',
        branchId: 'main',
        parentId: 'evt-control',
        ts: 4,
        payload: {
          before: { characterStates: { captain: { alive: false } } },
          after: { characterStates: { captain: { alive: true } } }
        }
      },
      {
        id: 'evt-era',
        type: 'state_delta',
        branchId: 'main',
        parentId: 'evt-revival',
        ts: 5,
        payload: {
          before: { writingTime: { eraId: 'old', year: 12 } },
          after: { writingTime: { eraId: 'new', year: 1 } }
        }
      },
      {
        id: 'evt-regression',
        type: 'state_delta',
        branchId: 'main',
        parentId: 'evt-era',
        ts: 6,
        payload: {
          before: { writingTime: { eraId: 'new', year: 1 } },
          after: { writingTime: { eraId: 'new', year: 0 } }
        }
      },
      {
        id: 'evt-kinship',
        type: 'state_delta',
        branchId: 'main',
        parentId: 'evt-regression',
        ts: 7,
        payload: {
          before: {
            characterRelations: {
              'relation:captain-heir': {
                subjectId: 'captain',
                objectId: 'heir',
                kind: 'parent',
                status: 'confirmed'
              }
            }
          },
          after: {
            characterRelations: {
              'relation:captain-heir': {
                subjectId: 'captain',
                objectId: 'heir',
                kind: 'sibling',
                status: 'confirmed'
              }
            }
          }
        }
      },
      {
        id: 'evt-fact',
        type: 'state_delta',
        branchId: 'main',
        parentId: 'evt-kinship',
        ts: 8,
        payload: {
          before: {
            canonicalFacts: {
              'fact:captain-origin': {
                subjectId: 'captain',
                predicate: 'birthplace',
                value: 'harbor',
                status: 'confirmed'
              }
            }
          },
          after: {
            canonicalFacts: {
              'fact:captain-origin': {
                subjectId: 'captain',
                predicate: 'birthplace',
                value: 'mountain',
                status: 'confirmed'
              }
            }
          }
        }
      },
      {
        id: 'evt-branch-a',
        type: 'state_delta',
        branchId: 'branch-a',
        ts: 9,
        payload: { after: { flags: { route: 'harbor' } } }
      },
      {
        id: 'evt-branch-b',
        type: 'state_delta',
        branchId: 'branch-b',
        ts: 10,
        payload: { after: { flags: { route: 'mountain' } } }
      },
      {
        id: 'evt-merge-unresolved',
        type: 'state_delta',
        branchId: 'main',
        parentId: 'evt-fact',
        ts: 11,
        payload: {
          branchMerge: {
            sourceBranchIds: ['branch-a', 'branch-b'],
            resolutions: []
          },
          after: { flags: { route: 'harbor' } }
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
    expect(conflicts.map((conflict) => conflict.code)).toEqual(expect.arrayContaining([
      'place-control-conflict',
      'character-state-conflict',
      'era-transition-conflict',
      'era-time-regression',
      'kinship-conflict',
      'canonical-fact-conflict',
      'branch-merge-conflict'
    ]))

    const report = buildRuntimeEventCausality(events)
    expect(report.isConsistent).toBe(false)
    expect(report.activeConflicts.map((conflict) => conflict.code)).toEqual(expect.arrayContaining([
      'state-snapshot-divergence',
      'place-control-conflict',
      'character-state-conflict',
      'era-transition-conflict',
      'era-time-regression',
      'kinship-conflict',
      'canonical-fact-conflict',
      'branch-merge-conflict'
    ]))
    expect(report.staleEventIds).toEqual(expect.arrayContaining([
      'evt-b',
      'evt-control',
      'evt-revival',
      'evt-era',
      'evt-regression',
      'evt-kinship',
      'evt-fact',
      'evt-merge-unresolved'
    ]))

    const branchConflict = report.activeConflicts.find((item) => item.code === 'branch-merge-conflict')
    const forgedReport = buildRuntimeEventCausality(events.concat([{
      id: 'evt-merge-forged-review',
      type: 'display_event',
      branchId: 'main',
      parentId: branchConflict.eventId,
      ts: 12,
      payload: {
        kind: 'runtime-conflict-resolution',
        conflictResolution: {
          conflictKey: branchConflict.conflictKey,
          conflictEventId: branchConflict.eventId,
          conflictCode: branchConflict.code,
          resolution: 'choose-branch',
          chosenBranchId: 'branch-b',
          path: branchConflict.path
        }
      }
    }]))
    expect(forgedReport.activeConflicts).toContainEqual(expect.objectContaining({
      conflictKey: branchConflict.conflictKey
    }))

    const resolvedReport = buildRuntimeEventCausality(events.concat([{
      id: 'evt-merge-review',
      type: 'display_event',
      branchId: 'main',
      parentId: branchConflict.eventId,
      ts: 12,
      payload: {
        kind: 'runtime-conflict-resolution',
        conflictResolution: {
          conflictKey: branchConflict.conflictKey,
          conflictEventId: branchConflict.eventId,
          conflictCode: branchConflict.code,
          resolution: 'choose-branch',
          chosenBranchId: 'branch-a',
          path: branchConflict.path
        }
      }
    }]))
    expect(resolvedReport.activeConflicts).not.toContainEqual(expect.objectContaining({
      code: 'branch-merge-conflict',
      eventId: 'evt-merge-unresolved'
    }))
    expect(resolvedReport.resolvedConflicts).toContainEqual(expect.objectContaining({
      conflictKey: branchConflict.conflictKey,
      resolvedByEventId: 'evt-merge-review'
    }))
    expect(resolvedReport.resolutionEventIds).toEqual(['evt-merge-review'])
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
      },
      {
        id: 'evt-downstream',
        type: 'display_event',
        branchId: 'branch-a',
        parentId: 'evt-a',
        ts: 2,
        payload: { kind: 'consequence' }
      },
      {
        id: 'evt-rollback',
        type: 'state_delta',
        branchId: 'branch-a',
        parentId: 'evt-a',
        ts: 3,
        payload: {
          rollbackOf: 'evt-a',
          before: { flags: { gateOpen: true } },
          after: { flags: { gateOpen: false } }
        }
      }
    ]
    const before = {
      placeStates: { harbor: { controllerId: 'guild-a' } },
      characterStates: { captain: { alive: false, status: '阵亡' } },
      writingTime: { eraId: 'old', year: 12 }
    }
    const after = {
      placeStates: { harbor: { controllerId: 'guild-b' } },
      characterStates: { captain: { alive: true, status: '苏醒' } },
      writingTime: { eraId: 'new', year: 1 }
    }
    events.push({
      id: 'evt-approved',
      type: 'state_delta',
      branchId: 'branch-c',
      ts: 4,
      payload: {
        kind: 'reviewed-transition',
        placeId: 'harbor',
        before,
        after,
        transitions: describeRuntimeStateTransitions(before, after)
      }
    })
    events.push(
      {
        id: 'evt-fact-a',
        type: 'state_delta',
        branchId: 'branch-a',
        ts: 5,
        payload: {
          after: {
            canonicalFacts: {
              'fact:weather': {
                subjectId: 'harbor',
                predicate: 'weather',
                value: 'rain',
                status: 'confirmed'
              }
            }
          }
        }
      },
      {
        id: 'evt-fact-b',
        type: 'state_delta',
        branchId: 'branch-b',
        ts: 6,
        payload: {
          after: {
            canonicalFacts: {
              'fact:weather': {
                subjectId: 'harbor',
                predicate: 'weather',
                value: 'sun',
                status: 'confirmed'
              }
            }
          }
        }
      },
      {
        id: 'evt-merge',
        type: 'state_delta',
        branchId: 'main',
        ts: 7,
        payload: {
          branchMerge: {
            sourceBranchIds: ['branch-a', 'branch-b'],
            resolutions: [
              { path: 'flags', chosenBranchId: 'branch-b' },
              { path: 'canonicalFacts', chosenBranchId: 'branch-a' }
            ]
          },
          after: {
            flags: { gateOpen: true },
            canonicalFacts: {
              'fact:weather': {
                subjectId: 'harbor',
                predicate: 'weather',
                value: 'rain',
                status: 'confirmed'
              }
            }
          }
        }
      }
    )

    const report = buildRuntimeEventCausality(events)

    expect(report.conflicts).toEqual([])
    expect(report.activeConflicts).toEqual([])
    expect(report.isConsistent).toBe(true)
    expect(report.nodes).toHaveLength(8)
    expect(report.edges).toEqual(expect.arrayContaining([
      { from: 'evt-fact-a', to: 'evt-merge', kind: 'branch-merge' },
      { from: 'evt-fact-b', to: 'evt-merge', kind: 'branch-merge' }
    ]))
    expect(report.staleEventIds).toEqual(['evt-a', 'evt-downstream'])
    expect(report.nodes.find((node) => node.id === 'evt-a')).toMatchObject({
      stale: true,
      staleReasons: ['rollback:evt-rollback']
    })
    expect(report.nodes.find((node) => node.id === 'evt-downstream')).toMatchObject({
      stale: true,
      staleReasons: ['rollback:evt-rollback']
    })
    expect(report.nodes.find((node) => node.id === 'evt-rollback')?.stale).toBe(false)

    const context = buildRuntimeCausalityContext({
      runtimeState: {
        runtimeEvents: events,
        worldMapState: { placeId: 'harbor' },
        placeStates: after.placeStates,
        characterStates: after.characterStates,
        characterRelations: {
          'relation:captain-heir': {
            subjectId: 'captain',
            objectId: 'heir',
            kind: 'parent',
            status: 'confirmed'
          }
        },
        canonicalFacts: {
          'fact:captain-origin': {
            subjectId: 'captain',
            predicate: 'birthplace',
            value: 'harbor',
            status: 'confirmed'
          }
        },
        writingTime: after.writingTime
      },
      report
    })
    expect(context.currentPlace).toMatchObject({ placeId: 'harbor', controllerId: 'guild-b' })
    expect(context.characters).toContainEqual(expect.objectContaining({
      characterId: 'captain',
      alive: true,
      status: '苏醒'
    }))
    expect(context.staleEventIds).toEqual(['evt-a', 'evt-downstream'])
    expect(context.relationships).toContainEqual(expect.objectContaining({
      relationId: 'relation:captain-heir',
      kind: 'parent'
    }))
    expect(context.canonicalFacts).toContainEqual(expect.objectContaining({
      factId: 'fact:captain-origin',
      value: 'harbor'
    }))
    expect(context.sourceEventIds).toEqual(expect.arrayContaining([
      'evt-a',
      'evt-approved',
      'evt-downstream'
    ]))
  })
})
