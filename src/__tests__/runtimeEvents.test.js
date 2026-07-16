import { describe, expect, it } from 'vitest'
import {
  RUNTIME_EVENT_LIMIT,
  RUNTIME_EVENT_TYPES,
  STATE_OPS,
  STATE_PATH_ROOTS,
  appendRuntimeEvent,
  applyStateDelta,
  capRuntimeEvents,
  buildStateDeltaPreview,
  createRuntimeEvent,
  normalizeRuntimeEvent,
  rollbackStateDelta,
  validateStateDelta
} from '../services/runtimeEvents'

describe('runtimeEvents', () => {
  it('exports the schema constants and allowlists', () => {
    expect(RUNTIME_EVENT_TYPES).toEqual([
      'turn',
      'state_delta',
      'display_event',
      'hot_choices',
      'branch'
    ])
    expect(STATE_OPS).toEqual(['set', 'merge', 'push', 'pull', 'inc', 'unset'])
    expect(STATE_PATH_ROOTS).toContain('goals')
    expect(STATE_PATH_ROOTS).toContain('inventory')
    expect(STATE_PATH_ROOTS).toContain('quests')
    expect(RUNTIME_EVENT_LIMIT).toBe(200)
  })

  it('creates a v1 envelope on the main branch with generated id and numeric timestamp', () => {
    const event = createRuntimeEvent({
      type: 'turn',
      source: 'user',
      payload: { role: 'user', preview: '先去钟楼' }
    })

    expect(event.v).toBe(1)
    expect(event.type).toBe('turn')
    expect(event.branchId).toBe('main')
    expect(event.source).toBe('user')
    expect(typeof event.id).toBe('string')
    expect(event.id.startsWith('evt_')).toBe(true)
    expect(typeof event.ts).toBe('number')
    expect(Number.isFinite(event.ts)).toBe(true)
    expect(event.ts).toBeGreaterThan(0)
    expect(event.payload).toEqual({ role: 'user', preview: '先去钟楼' })
    expect(event.parentId).toBe('')
  })

  it('falls back to safe defaults for unknown type, source, branch and ts', () => {
    const event = createRuntimeEvent({
      type: 'mystery',
      source: 'rogue',
      branchId: '   ',
      ts: 'not-a-number',
      payload: null
    })

    expect(event.type).toBe('turn')
    expect(event.source).toBe('runtime')
    expect(event.branchId).toBe('main')
    expect(typeof event.ts).toBe('number')
    expect(event.payload).toEqual({})
  })

  it('marks display events as non-contextual by default and preserves explicit contextual flag', () => {
    const defaulted = createRuntimeEvent({ type: 'display_event', payload: { kind: 'inline' } })
    expect(defaulted.type).toBe('display_event')
    expect(defaulted.payload.contextual).toBe(false)
    expect(defaulted.payload.kind).toBe('inline')

    const optedIn = createRuntimeEvent({
      type: 'display_event',
      payload: { kind: 'inline', contextual: true }
    })
    expect(optedIn.payload.contextual).toBe(true)
  })

  it('accepts state-delta ops only when op and path root are in the allowlist', () => {
    expect(validateStateDelta([{ op: 'set', path: 'goals', value: [] }]).valid).toBe(true)
    expect(validateStateDelta([{ op: 'push', path: 'inventory', value: 'sword' }]).valid).toBe(true)
    expect(validateStateDelta([{ op: 'merge', path: 'flags', value: { ok: true } }]).valid).toBe(true)
  })

  it('rejects state-delta ops whose path escapes the allowlist or attempts prototype pollution', () => {
    const polluted = validateStateDelta([{ op: 'set', path: '__proto__.polluted', value: true }])
    expect(polluted.valid).toBe(false)
    expect(polluted.errors[0]).toMatchObject({ index: 0, code: 'invalid-path' })

    const protoRoot = validateStateDelta([{ op: 'set', path: '__proto__', value: true }])
    expect(protoRoot.valid).toBe(false)
    expect(protoRoot.errors[0].code).toBe('invalid-path')

    const unknownOp = validateStateDelta([{ op: 'delete', path: 'goals' }])
    expect(unknownOp.valid).toBe(false)
    expect(unknownOp.errors[0].code).toBe('unknown-op')

    const nestedPath = validateStateDelta([{ op: 'set', path: 'goals.active', value: 'x' }])
    expect(nestedPath.valid).toBe(false)
    expect(nestedPath.errors[0].code).toBe('invalid-path')

    const unknownRoot = validateStateDelta([{ op: 'set', path: 'malicious', value: 1 }])
    expect(unknownRoot.valid).toBe(false)
    expect(unknownRoot.errors[0].code).toBe('invalid-path')
  })

  it('rejects non-array state-delta input with a stable error code', () => {
    const result = validateStateDelta(null)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatchObject({ code: 'not-array' })
  })

  it('normalizes an existing raw event into the v1 envelope shape', () => {
    const event = normalizeRuntimeEvent({
      v: 99,
      type: 'state_delta',
      id: 'evt_test',
      parentId: 'evt_parent',
      branchId: 'alt',
      ts: 12345,
      source: 'system',
      payload: { ops: [{ op: 'set', path: 'goals', value: [] }] }
    })

    expect(event).not.toBeNull()
    expect(event.v).toBe(1)
    expect(event.type).toBe('state_delta')
    expect(event.branchId).toBe('alt')
    expect(event.id).toBe('evt_test')
    expect(event.ts).toBe(12345)
    expect(event.source).toBe('system')
    expect(event.parentId).toBe('evt_parent')
  })

  it('caps events to the configured limit and keeps the latest events', () => {
    const events = Array.from({ length: 205 }, (_, index) => ({
      v: 1,
      type: 'turn',
      id: `evt_${index}`,
      parentId: '',
      branchId: 'main',
      ts: 1000 + index,
      source: 'user',
      payload: { preview: `p-${index}` }
    }))

    const capped = capRuntimeEvents(events)
    expect(capped).toHaveLength(200)
    expect(capped[0].id).toBe('evt_5')
    expect(capped[199].id).toBe('evt_204')

    // Sparse-array form must still respect the cap.
    expect(capRuntimeEvents(Array(205))).toHaveLength(200)

    // Lists at or below the cap are returned untouched (modulo a copy).
    const small = Array.from({ length: 12 }, (_, index) => ({ id: `s_${index}` }))
    const smallCapped = capRuntimeEvents(small)
    expect(smallCapped).toHaveLength(12)
    expect(smallCapped).not.toBe(small)
  })

  it('appendRuntimeEvent appends and caps in a single call', () => {
    const initial = Array.from({ length: 199 }, (_, index) => ({
      id: `pre_${index}`,
      ts: index,
      payload: {}
    }))

    const result = appendRuntimeEvent(initial, {
      type: 'turn',
      source: 'user',
      payload: { preview: 'new' }
    })

    expect(result.events).toHaveLength(200)
    expect(result.events[198]).toMatchObject({ id: 'pre_198' })
    expect(result.events[199].id.startsWith('evt_')).toBe(true)
    expect(result.events[199].payload.preview).toBe('new')
  })

  it('builds a v1 display_event envelope for history-node-init, defaulting contextual=false', () => {
    const event = createRuntimeEvent({
      type: 'display_event',
      source: 'runtime',
      payload: {
        kind: 'history-node-init',
        historyNodeId: 'hn_archive_w4',
        title: '雾税账册追溯',
        mapBinding: { scene: '灯痕码头' },
        priorFactsCount: 1,
        unresolvedHooksCount: 1
      }
    })

    expect(event).toMatchObject({
      v: 1,
      type: 'display_event',
      source: 'runtime',
      branchId: 'main',
      payload: {
        kind: 'history-node-init',
        historyNodeId: 'hn_archive_w4',
        title: '雾税账册追溯',
        mapBinding: { scene: '灯痕码头' },
        priorFactsCount: 1,
        unresolvedHooksCount: 1,
        contextual: false
      }
    })
    expect(event.id.startsWith('evt_')).toBe(true)
  })

  it('preserves explicit contextual=true on history-node-init when caller opts in', () => {
    const event = createRuntimeEvent({
      type: 'display_event',
      source: 'runtime',
      payload: {
        kind: 'history-node-init',
        historyNodeId: 'hn_optin',
        contextual: true
      }
    })

    expect(event.payload.contextual).toBe(true)
  })

  it('appendRuntimeEvent caps to the runtime event limit and returns the new event', () => {
    const seed = Array.from({ length: 3 }, (_, index) => ({
      type: 'display_event',
      source: 'runtime',
      payload: { kind: 'seed', index }
    }))
    const { event, events } = appendRuntimeEvent(seed, {
      type: 'display_event',
      source: 'runtime',
      payload: { kind: 'history-node-init', historyNodeId: 'hn_1' }
    })

    expect(events).toHaveLength(4)
    expect(events[3]).toMatchObject({
      payload: { kind: 'history-node-init', historyNodeId: 'hn_1', contextual: false }
    })
    expect(event).toBe(events[3])
  })

  it('state_delta ops targeting factionRelations / plotJournal / worldMapState are accepted by the allowlist', () => {
    const result = validateStateDelta([
      { op: 'set', path: 'factionRelations', value: { 潮盐行会: -8 } },
      { op: 'push', path: 'plotJournal', value: { summary: 's' } },
      { op: 'merge', path: 'worldMapState', value: { currentScene: '灯痕码头' } }
    ])

    expect(result.valid).toBe(true)
    expect(result.sanitized).toEqual([
      { op: 'set', path: 'factionRelations', value: { 潮盐行会: -8 } },
      { op: 'push', path: 'plotJournal', value: { summary: 's' } },
      { op: 'merge', path: 'worldMapState', value: { currentScene: '灯痕码头' } }
    ])
  })

  it('previews and applies constrained deltas without mutating the source state', () => {
    const state = {
      flags: { ledgerSeen: false },
      factionRelations: { 潮盐行会: -8 },
      worldMapState: { placeId: 'place:old', currentScene: '旧税所' }
    }
    const ops = [
      { op: 'merge', path: 'flags', value: { ledgerSeen: true } },
      { op: 'inc', path: 'factionRelations', value: { 潮盐行会: -4 } },
      { op: 'merge', path: 'worldMapState', value: { currentScene: '账房' } }
    ]

    const preview = buildStateDeltaPreview(state, ops)
    expect(preview.valid).toBe(true)
    expect(preview.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'flags' }),
      expect.objectContaining({ path: 'factionRelations' }),
      expect.objectContaining({ path: 'worldMapState' })
    ]))
    expect(state.flags.ledgerSeen).toBe(false)
    expect(preview.state.factionRelations['潮盐行会']).toBe(-12)
    expect(preview.state.worldMapState.currentScene).toBe('账房')

    const applied = applyStateDelta(state, ops)
    expect(applied.valid).toBe(true)
    expect(applied.inverseOps).toEqual([
      { op: 'set', path: 'flags', value: { ledgerSeen: false } },
      { op: 'set', path: 'factionRelations', value: { 潮盐行会: -8 } },
      { op: 'set', path: 'worldMapState', value: { placeId: 'place:old', currentScene: '旧税所' } }
    ])
  })

  it('rejects unsafe semantic delta values and prevents rollback over later changes', () => {
    expect(validateStateDelta([
      { op: 'set', path: 'worldMapState', value: { map: { countries: [] } } }
    ]).valid).toBe(false)
    expect(validateStateDelta([
      { op: 'inc', path: 'factionRelations', value: { 潮盐行会: 'a lot' } }
    ]).valid).toBe(false)

    const state = { flags: { ledgerSeen: false } }
    const applied = applyStateDelta(state, [{ op: 'merge', path: 'flags', value: { ledgerSeen: true } }])
    expect(applied.valid).toBe(true)
    const laterState = { flags: { ledgerSeen: false, anotherChange: true } }
    const rollback = rollbackStateDelta(laterState, {
      payload: {
        inverseOps: applied.inverseOps,
        after: applied.after
      }
    })
    expect(rollback.valid).toBe(false)
    expect(rollback.code).toBe('rollback-conflict')
    expect(rollback.conflicts).toContain('flags')
  })
})
