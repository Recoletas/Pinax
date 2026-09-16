import { normalizeRuntimeEvent } from './runtimeEvents'

export const RUNTIME_CAUSALITY_VERSION = 3

const REVIEWABLE_CONFLICT_CODES = new Set([
  'state-snapshot-divergence',
  'place-control-conflict',
  'character-state-conflict',
  'kinship-conflict',
  'canonical-fact-conflict',
  'era-transition-conflict',
  'era-time-regression',
  'branch-merge-conflict'
])

function clone(value) {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function text(value) {
  return String(value ?? '').trim()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function compactRef(value) {
  return text(value).slice(0, 120)
}

function eventPathSnapshot(event, field) {
  const value = event?.payload?.[field]
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function snapshotPaths(event) {
  return [...new Set([
    ...Object.keys(eventPathSnapshot(event, 'before')),
    ...Object.keys(eventPathSnapshot(event, 'after'))
  ])]
}

export function buildRuntimeConflictKey(conflict = {}) {
  const source = record(conflict)
  return [
    compactRef(source.eventId),
    text(source.code),
    compactRef(source.path),
    compactRef(source.placeId),
    compactRef(source.characterId),
    compactRef(source.relationId),
    compactRef(source.conflictingRelationId),
    compactRef(source.factId),
    compactRef(source.conflictingFactId),
    compactRef(source.parentId),
    compactRef(source.previousEventId),
    text(source.transition),
    compactRef(source.fromEraId),
    compactRef(source.toEraId),
    compactRef(source.subjectId),
    compactRef(source.predicate),
    (Array.isArray(source.sourceBranchIds) ? source.sourceBranchIds : [])
      .map(compactRef)
      .filter(Boolean)
      .sort()
      .join(',')
  ].join('|')
}

export function canResolveRuntimeConflict(conflict = {}, resolution = {}) {
  const source = record(conflict)
  const review = record(resolution)
  if (!REVIEWABLE_CONFLICT_CODES.has(text(source.code))) return false
  if (compactRef(review.conflictEventId) !== compactRef(source.eventId)) return false
  if (text(review.conflictCode) !== text(source.code)) return false
  if (text(review.conflictKey) !== buildRuntimeConflictKey(source)) return false

  if (source.code !== 'branch-merge-conflict') {
    return text(review.resolution) === 'accept-current'
  }

  const chosenBranchId = compactRef(review.chosenBranchId)
  const compatibleBranchIds = Array.isArray(source.compatibleBranchIds)
    ? source.compatibleBranchIds.map(compactRef).filter(Boolean)
    : []
  return text(review.resolution) === 'choose-branch'
    && compatibleBranchIds.includes(chosenBranchId)
}

function eventOrder(event, index) {
  const ts = Number(event?.ts)
  return Number.isFinite(ts) ? ts : index
}

function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => ({ event: normalizeRuntimeEvent(event), index }))
    .filter(({ event }) => event)
}

function timeCoordinate(value = {}) {
  const source = record(value)
  const year = Number(source.year)
  const month = Number(source.month || 1)
  const day = Number(source.day || 1)
  if (!Number.isFinite(year)) return null
  return (year * 372) + ((Number.isFinite(month) ? month : 1) * 31) + (Number.isFinite(day) ? day : 1)
}

function matchesControlTransfer(transfer, placeId, beforeControllerId, afterControllerId) {
  return compactRef(transfer?.placeId) === placeId
    && compactRef(transfer?.fromControllerId) === beforeControllerId
    && compactRef(transfer?.toControllerId) === afterControllerId
}

function matchesCharacterTransition(transition, characterId, kind) {
  return compactRef(transition?.characterId) === characterId
    && text(transition?.kind) === kind
}

function normalizeRelation(relation = {}) {
  const source = record(relation)
  return {
    subjectId: compactRef(source.subjectId),
    objectId: compactRef(source.objectId),
    kind: text(source.kind).slice(0, 80),
    status: text(source.status || 'confirmed').slice(0, 40)
  }
}

function normalizeFact(fact = {}) {
  const source = record(fact)
  const value = source.value
  return {
    subjectId: compactRef(source.subjectId),
    predicate: compactRef(source.predicate),
    value: (
      value === null
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) ? value : text(value).slice(0, 240),
    status: text(source.status || 'confirmed').slice(0, 40),
    confidence: Number.isFinite(Number(source.confidence))
      ? Math.max(0, Math.min(1, Number(source.confidence)))
      : null
  }
}

function matchesNamedTransition(transition, id, kind) {
  return compactRef(transition?.id) === id
    && text(transition?.kind) === kind
}

export function describeRuntimeStateTransitions(before = {}, after = {}) {
  const previousPlaces = record(before.placeStates)
  const nextPlaces = record(after.placeStates)
  const placeControl = []
  for (const placeId of new Set([...Object.keys(previousPlaces), ...Object.keys(nextPlaces)])) {
    const fromControllerId = compactRef(previousPlaces[placeId]?.controllerId)
    const toControllerId = compactRef(nextPlaces[placeId]?.controllerId)
    if (fromControllerId === toControllerId || (!fromControllerId && !toControllerId)) continue
    placeControl.push({ placeId: compactRef(placeId), fromControllerId, toControllerId })
  }

  const previousCharacters = record(before.characterStates)
  const nextCharacters = record(after.characterStates)
  const characters = []
  for (const characterId of new Set([...Object.keys(previousCharacters), ...Object.keys(nextCharacters)])) {
    const previous = record(previousCharacters[characterId])
    const next = record(nextCharacters[characterId])
    if (previous.alive === false && next.alive === true) {
      characters.push({ characterId: compactRef(characterId), kind: 'revival' })
    }
    if (text(previous.status) !== text(next.status)) {
      characters.push({
        characterId: compactRef(characterId),
        kind: 'status-change',
        fromStatus: text(previous.status).slice(0, 80),
        toStatus: text(next.status).slice(0, 80)
      })
    }
  }

  const previousTime = record(before.writingTime)
  const nextTime = record(after.writingTime)
  const fromEraId = compactRef(previousTime.eraId)
  const toEraId = compactRef(nextTime.eraId)
  const beforeCoordinate = timeCoordinate(previousTime)
  const afterCoordinate = timeCoordinate(nextTime)
  const time = {
    fromEraId,
    toEraId,
    eraChanged: Boolean(fromEraId && toEraId && fromEraId !== toEraId),
    regressed: Boolean(
      (!fromEraId || !toEraId || fromEraId === toEraId)
      && beforeCoordinate != null
      && afterCoordinate != null
      && afterCoordinate < beforeCoordinate
    )
  }
  time.allowEraChange = time.eraChanged
  time.allowRegression = time.regressed

  const previousRelations = record(before.characterRelations)
  const nextRelations = record(after.characterRelations)
  const relationships = []
  for (const relationId of new Set([...Object.keys(previousRelations), ...Object.keys(nextRelations)])) {
    if (!Object.prototype.hasOwnProperty.call(previousRelations, relationId)
      || !Object.prototype.hasOwnProperty.call(nextRelations, relationId)) continue
    const previous = normalizeRelation(previousRelations[relationId])
    const next = normalizeRelation(nextRelations[relationId])
    if (equal(previous, next)) continue
    relationships.push({
      id: compactRef(relationId),
      kind: 'relationship-rewrite',
      before: previous,
      after: next
    })
  }

  const previousFacts = record(before.canonicalFacts)
  const nextFacts = record(after.canonicalFacts)
  const facts = []
  for (const factId of new Set([...Object.keys(previousFacts), ...Object.keys(nextFacts)])) {
    if (!Object.prototype.hasOwnProperty.call(previousFacts, factId)
      || !Object.prototype.hasOwnProperty.call(nextFacts, factId)) continue
    const previous = normalizeFact(previousFacts[factId])
    const next = normalizeFact(nextFacts[factId])
    if (equal(previous, next)) continue
    facts.push({
      id: compactRef(factId),
      kind: 'canonical-fact-rewrite',
      before: previous,
      after: next
    })
  }

  return { placeControl, characters, relationships, facts, time }
}

function detectSemanticTransitionConflicts(event) {
  if (event?.type !== 'state_delta') return []
  const before = eventPathSnapshot(event, 'before')
  const after = eventPathSnapshot(event, 'after')
  const described = describeRuntimeStateTransitions(before, after)
  const approved = record(event?.payload?.transitions)
  const approvedControl = Array.isArray(approved.placeControl) ? approved.placeControl : []
  const approvedCharacters = Array.isArray(approved.characters) ? approved.characters : []
  const approvedRelationships = Array.isArray(approved.relationships) ? approved.relationships : []
  const approvedFacts = Array.isArray(approved.facts) ? approved.facts : []
  const approvedTime = record(approved.time)
  const conflicts = []

  for (const transfer of described.placeControl) {
    if (!transfer.fromControllerId || !transfer.toControllerId) continue
    if (approvedControl.some((item) => matchesControlTransfer(
      item,
      transfer.placeId,
      transfer.fromControllerId,
      transfer.toControllerId
    ))) continue
    conflicts.push({
      code: 'place-control-conflict',
      eventId: event.id,
      placeId: transfer.placeId,
      expectedControllerId: transfer.fromControllerId,
      actualControllerId: transfer.toControllerId,
      message: `地点 ${transfer.placeId} 的控制权变化缺少确认记录`
    })
  }

  for (const transition of described.characters.filter((item) => item.kind === 'revival')) {
    if (approvedCharacters.some((item) => matchesCharacterTransition(item, transition.characterId, 'revival'))) continue
    conflicts.push({
      code: 'character-state-conflict',
      eventId: event.id,
      characterId: transition.characterId,
      transition: 'revival',
      message: `角色 ${transition.characterId} 从死亡恢复，但事件没有复活确认`
    })
  }

  for (const transition of described.relationships) {
    if (approvedRelationships.some((item) => matchesNamedTransition(
      item,
      transition.id,
      'relationship-rewrite'
    ))) continue
    conflicts.push({
      code: 'kinship-conflict',
      eventId: event.id,
      relationId: transition.id,
      message: `亲属关系 ${transition.id} 被改写，但事件没有关系变更确认`
    })
  }

  for (const transition of described.facts) {
    if (approvedFacts.some((item) => matchesNamedTransition(
      item,
      transition.id,
      'canonical-fact-rewrite'
    ))) continue
    conflicts.push({
      code: 'canonical-fact-conflict',
      eventId: event.id,
      factId: transition.id,
      message: `Canonical fact ${transition.id} 被改写，但事件没有事实变更确认`
    })
  }

  const activeRelations = Object.entries(record(after.characterRelations))
    .map(([relationId, relation]) => ({ relationId: compactRef(relationId), ...normalizeRelation(relation) }))
    .filter((relation) => relation.subjectId && relation.objectId && relation.status !== 'ended')
  const relationKinds = new Map()
  for (const relation of activeRelations) {
    if (relation.subjectId === relation.objectId) {
      conflicts.push({
        code: 'kinship-conflict',
        eventId: event.id,
        relationId: relation.relationId,
        message: `亲属关系 ${relation.relationId} 的两端不能是同一角色`
      })
      continue
    }
    const key = `${relation.subjectId}\u0000${relation.objectId}`
    const previous = relationKinds.get(key)
    if (previous && previous.kind !== relation.kind) {
      conflicts.push({
        code: 'kinship-conflict',
        eventId: event.id,
        relationId: relation.relationId,
        conflictingRelationId: previous.relationId,
        message: `角色 ${relation.subjectId} 与 ${relation.objectId} 同时存在互斥亲属关系`
      })
    } else {
      relationKinds.set(key, relation)
    }
  }

  const activeFacts = Object.entries(record(after.canonicalFacts))
    .map(([factId, fact]) => ({ factId: compactRef(factId), ...normalizeFact(fact) }))
    .filter((fact) => fact.subjectId && fact.predicate && fact.status === 'confirmed')
  const factValues = new Map()
  for (const fact of activeFacts) {
    const key = `${fact.subjectId}\u0000${fact.predicate}`
    const previous = factValues.get(key)
    if (previous && !equal(previous.value, fact.value)) {
      conflicts.push({
        code: 'canonical-fact-conflict',
        eventId: event.id,
        factId: fact.factId,
        conflictingFactId: previous.factId,
        subjectId: fact.subjectId,
        predicate: fact.predicate,
        message: `角色或实体 ${fact.subjectId} 的事实 ${fact.predicate} 同时存在互斥值`
      })
    } else {
      factValues.set(key, fact)
    }
  }

  if (described.time.eraChanged && approvedTime.allowEraChange !== true) {
    conflicts.push({
      code: 'era-transition-conflict',
      eventId: event.id,
      fromEraId: described.time.fromEraId,
      toEraId: described.time.toEraId,
      message: `年代从 ${described.time.fromEraId} 切换到 ${described.time.toEraId}，但事件没有年代转换确认`
    })
  }
  if (described.time.regressed && approvedTime.allowRegression !== true) {
    conflicts.push({
      code: 'era-time-regression',
      eventId: event.id,
      eraId: described.time.toEraId || described.time.fromEraId,
      message: '叙事时间早于同年代上一状态，但事件没有时间回退确认'
    })
  }

  return conflicts
}

/**
 * 找出事件链中可以确定的冲突。
 *
 * v1 只比较 state_delta 的 before/after 快照，避免把不同地点的正常剧情
 * 变化误报成冲突。父事件缺失也在这里报告，因为它会让后续历史无法解释。
 */
export function detectRuntimeEventConflicts(events = []) {
  const normalized = normalizeEvents(events)
  const byId = new Map()
  const conflicts = []

  for (const { event } of normalized) {
    if (!event.id) continue
    if (byId.has(event.id)) {
      conflicts.push({
        code: 'duplicate-event-id',
        eventId: event.id,
        message: `事件 ID 重复：${event.id}`
      })
    }
    byId.set(event.id, event)
  }

  for (const { event } of normalized) {
    if (event.parentId && !byId.has(event.parentId)) {
      conflicts.push({
        code: 'orphan-parent',
        eventId: event.id,
        parentId: event.parentId,
        message: `找不到父事件：${event.parentId}`
      })
    }
  }

  const stateEvents = normalized
    .filter(({ event }) => event.type === 'state_delta')
    .sort((left, right) => eventOrder(left.event, left.index) - eventOrder(right.event, right.index))
  const latestByBranchAndPath = new Map()
  const latestByBranch = new Map()

  for (const { event } of stateEvents) {
    const branchId = text(event.branchId) || 'main'
    const before = eventPathSnapshot(event, 'before')
    const after = eventPathSnapshot(event, 'after')
    for (const path of snapshotPaths(event)) {
      const key = `${branchId}\u0000${path}`
      const previous = latestByBranchAndPath.get(key)
      if (previous && Object.prototype.hasOwnProperty.call(before, path)
        && !equal(previous.after, before[path])) {
        conflicts.push({
          code: 'state-snapshot-divergence',
          eventId: event.id,
          previousEventId: previous.eventId,
          branchId,
          path,
          expected: clone(previous.after),
          actual: clone(before[path]),
          message: `状态字段 ${path} 未接上上一事件的结果`
        })
      }
      if (Object.prototype.hasOwnProperty.call(after, path)) {
        latestByBranchAndPath.set(key, {
          eventId: event.id,
          after: clone(after[path])
        })
      }
    }
    const branchMerge = record(event?.payload?.branchMerge)
    const sourceBranchIds = [...new Set(
      (Array.isArray(branchMerge.sourceBranchIds) ? branchMerge.sourceBranchIds : [])
        .map(compactRef)
        .filter(Boolean)
    )]
    if (Object.keys(branchMerge).length > 0) {
      if (sourceBranchIds.length < 2) {
        conflicts.push({
          code: 'branch-merge-invalid',
          eventId: event.id,
          sourceBranchIds,
          message: '分支合并至少需要两个来源分支'
        })
      } else {
        const missingBranchIds = sourceBranchIds.filter((id) => !latestByBranch.has(id))
        if (missingBranchIds.length > 0) {
          conflicts.push({
            code: 'branch-merge-source-missing',
            eventId: event.id,
            sourceBranchIds,
            missingBranchIds,
            message: `分支合并找不到来源：${missingBranchIds.join('、')}`
          })
        }
        const candidatePaths = new Set(sourceBranchIds.flatMap((id) => [
          ...(latestByBranch.get(id)?.keys() || [])
        ]))
        const resolutions = Array.isArray(branchMerge.resolutions) ? branchMerge.resolutions : []
        for (const path of candidatePaths) {
          const branchValues = sourceBranchIds
            .map((id) => ({ branchId: id, value: latestByBranch.get(id)?.get(path)?.after }))
            .filter((item) => item.value !== undefined)
          if (branchValues.length < 2 || branchValues.every((item) => equal(item.value, branchValues[0].value))) continue
          const resolution = resolutions.find((item) => compactRef(item?.path) === path)
          const chosen = branchValues.find((item) => item.branchId === compactRef(resolution?.chosenBranchId))
          const resolved = Boolean(
            chosen
            && Object.prototype.hasOwnProperty.call(after, path)
            && equal(after[path], chosen.value)
          )
          if (!resolved) {
            const compatibleBranchIds = branchValues
              .filter((item) => (
                Object.prototype.hasOwnProperty.call(after, path)
                && equal(after[path], item.value)
              ))
              .map((item) => item.branchId)
            conflicts.push({
              code: 'branch-merge-conflict',
              eventId: event.id,
              branchId,
              sourceBranchIds,
              path,
              sourceBranches: branchValues.map((item) => ({
                branchId: item.branchId,
                eventId: latestByBranch.get(item.branchId)?.get(path)?.eventId || '',
                value: clone(item.value)
              })),
              compatibleBranchIds,
              currentValue: clone(after[path]),
              message: `分支 ${sourceBranchIds.join('、')} 在 ${path} 上存在未审阅差异`
            })
          }
        }
      }
    }
    conflicts.push(...detectSemanticTransitionConflicts(event))
    if (!latestByBranch.has(branchId)) latestByBranch.set(branchId, new Map())
    for (const path of snapshotPaths(event)) {
      if (!Object.prototype.hasOwnProperty.call(after, path)) continue
      latestByBranch.get(branchId).set(path, {
        eventId: event.id,
        after: clone(after[path])
      })
    }
  }

  return conflicts
}

/**
 * Build a small causal graph for the event log.
 *
 * `parent` edges come from the event envelope. `state-continuity` edges are
 * inferred only when two state_delta events touch the same root on a branch;
 * they make downstream stale state visible without changing stored events.
 */
export function buildRuntimeEventCausality(events = []) {
  const normalized = normalizeEvents(events)
  const byId = new Map(normalized.map(({ event }) => [event.id, event]))
  const edges = []
  const edgeKeys = new Set()

  function addEdge(from, to, kind) {
    if (!from || !to || from === to) return
    const key = `${from}\u0000${to}\u0000${kind}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ from, to, kind })
  }

  for (const { event } of normalized) {
    if (event.parentId && byId.has(event.parentId)) addEdge(event.parentId, event.id, 'parent')
  }

  const previousByBranchAndPath = new Map()
  const previousStateByBranch = new Map()
  const orderedStateEvents = normalized
    .filter(({ event }) => event.type === 'state_delta')
    .sort((left, right) => eventOrder(left.event, left.index) - eventOrder(right.event, right.index))

  for (const { event } of orderedStateEvents) {
    const branchId = text(event.branchId) || 'main'
    const branchMerge = record(event?.payload?.branchMerge)
    const sourceBranchIds = [...new Set(
      (Array.isArray(branchMerge.sourceBranchIds) ? branchMerge.sourceBranchIds : [])
        .map(compactRef)
        .filter(Boolean)
    )]
    for (const sourceBranchId of sourceBranchIds) {
      const sourceEvents = [...(previousStateByBranch.get(sourceBranchId)?.values() || [])]
      const latest = sourceEvents.sort((left, right) => right.order - left.order)[0]
      if (latest) addEdge(latest.eventId, event.id, 'branch-merge')
    }
    for (const path of snapshotPaths(event)) {
      const key = `${branchId}\u0000${path}`
      const previous = previousByBranchAndPath.get(key)
      if (previous) addEdge(previous.eventId, event.id, 'state-continuity')
      if (Object.prototype.hasOwnProperty.call(eventPathSnapshot(event, 'after'), path)) {
        previousByBranchAndPath.set(key, { eventId: event.id, order: eventOrder(event, 0) })
      }
    }
    if (!previousStateByBranch.has(branchId)) previousStateByBranch.set(branchId, new Map())
    const branchPaths = previousStateByBranch.get(branchId)
    for (const path of snapshotPaths(event)) {
      if (!Object.prototype.hasOwnProperty.call(eventPathSnapshot(event, 'after'), path)) continue
      branchPaths.set(path, { eventId: event.id, order: eventOrder(event, 0) })
    }
  }

  const roots = normalized
    .filter(({ event }) => !event.parentId || !byId.has(event.parentId))
    .map(({ event }) => event)
  const detectedConflicts = detectRuntimeEventConflicts(events)
  const orderById = new Map(normalized.map(({ event, index }) => [event.id, index]))
  const resolutionsByConflictKey = new Map()
  for (const { event, index } of normalized) {
    if (event.type !== 'display_event' || event.payload?.kind !== 'runtime-conflict-resolution') continue
    const resolution = record(event.payload?.conflictResolution)
    const conflictKey = text(resolution.conflictKey)
    const conflict = detectedConflicts.find((item) => buildRuntimeConflictKey(item) === conflictKey)
    const conflictOrder = orderById.get(conflict?.eventId)
    if (!conflict || conflictOrder == null || index <= conflictOrder) continue
    if (event.parentId !== conflict.eventId || !canResolveRuntimeConflict(conflict, resolution)) continue
    resolutionsByConflictKey.set(conflictKey, {
      eventId: event.id,
      resolution: clone(resolution)
    })
  }
  const children = new Map()
  for (const edge of edges) {
    if (!children.has(edge.from)) children.set(edge.from, [])
    children.get(edge.from).push(edge.to)
  }
  const staleReasons = new Map()
  const rollbackStaleIds = new Set()

  function markStale(eventId, reason) {
    if (!eventId) return
    if (!staleReasons.has(eventId)) staleReasons.set(eventId, new Set())
    staleReasons.get(eventId).add(reason)
  }

  function descendants(rootId, maxOrder = Number.POSITIVE_INFINITY) {
    const found = new Set()
    const queue = [...(children.get(rootId) || [])]
    while (queue.length) {
      const eventId = queue.shift()
      if (found.has(eventId) || (orderById.get(eventId) ?? Number.POSITIVE_INFINITY) > maxOrder) continue
      found.add(eventId)
      queue.push(...(children.get(eventId) || []))
    }
    return found
  }

  for (const { event, index } of normalized) {
    const rollbackOf = compactRef(event?.payload?.rollbackOf)
    if (!rollbackOf) continue
    markStale(rollbackOf, `rollback:${event.id}`)
    rollbackStaleIds.add(rollbackOf)
    for (const eventId of descendants(rollbackOf, index - 1)) {
      markStale(eventId, `rollback:${event.id}`)
      rollbackStaleIds.add(eventId)
    }
  }
  for (const conflict of detectedConflicts) {
    if (resolutionsByConflictKey.has(buildRuntimeConflictKey(conflict))) continue
    if (rollbackStaleIds.has(conflict.eventId)) continue
    markStale(conflict.eventId, `conflict:${conflict.code}`)
    for (const eventId of descendants(conflict.eventId)) {
      markStale(eventId, `upstream-conflict:${conflict.eventId}`)
    }
  }
  const conflicts = detectedConflicts.map((conflict) => ({
    ...conflict,
    conflictKey: buildRuntimeConflictKey(conflict),
    stale: rollbackStaleIds.has(conflict.eventId),
    resolved: resolutionsByConflictKey.has(buildRuntimeConflictKey(conflict)),
    resolvedByEventId: resolutionsByConflictKey.get(buildRuntimeConflictKey(conflict))?.eventId || ''
  }))
  const activeConflicts = conflicts.filter((conflict) => !conflict.stale && !conflict.resolved)
  const resolvedConflicts = conflicts.filter((conflict) => conflict.resolved)
  const resolutionEventIds = [...resolutionsByConflictKey.values()].map((item) => item.eventId)

  return {
    version: RUNTIME_CAUSALITY_VERSION,
    nodes: normalized.map(({ event }) => ({
      id: event.id,
      parentId: event.parentId,
      branchId: event.branchId,
      ts: event.ts,
      type: event.type,
      source: event.source,
      placeId: compactRef(event.payload?.placeId),
      kind: compactRef(event.payload?.kind),
      changedPaths: snapshotPaths(event).slice(0, 12),
      stale: staleReasons.has(event.id),
      staleReasons: [...(staleReasons.get(event.id) || [])]
    })),
    edges,
    roots,
    orphanParentIds: [...new Set(conflicts
      .filter((item) => item.code === 'orphan-parent')
      .map((item) => item.parentId))],
    conflicts,
    activeConflicts,
    resolvedConflicts,
    resolutionEventIds,
    staleEventIds: [...staleReasons.keys()],
    isConsistent: activeConflicts.length === 0
  }
}

export function buildRuntimeCausalityContext(input = {}) {
  const runtimeState = input?.runtimeState || input || {}
  const report = input?.report || buildRuntimeEventCausality(runtimeState.runtimeEvents || [])
  const placeId = compactRef(runtimeState?.worldMapState?.placeId)
  const placeState = record(runtimeState?.placeStates)[placeId] || null
  const characters = Object.entries(record(runtimeState?.characterStates))
    .slice(0, 8)
    .map(([characterId, state]) => ({
      characterId: compactRef(characterId),
      status: text(state?.status).slice(0, 80),
      alive: typeof state?.alive === 'boolean' ? state.alive : null,
      placeId: compactRef(state?.placeId),
      goal: text(state?.goal).slice(0, 120)
    }))
  const recentChanges = report.nodes
    .filter((node) => node.type === 'state_delta')
    .slice(-4)
    .map((node) => ({
      eventId: node.id,
      kind: node.kind,
      placeId: node.placeId,
      changedPaths: node.changedPaths,
      stale: node.stale
    }))
  const conflicts = (report.activeConflicts || report.conflicts.filter((conflict) => !conflict.stale))
    .slice(-6)
    .map((conflict) => ({
    code: conflict.code,
    eventId: compactRef(conflict.eventId),
    placeId: compactRef(conflict.placeId),
    characterId: compactRef(conflict.characterId),
    relationId: compactRef(conflict.relationId),
    conflictingRelationId: compactRef(conflict.conflictingRelationId),
    factId: compactRef(conflict.factId),
    conflictingFactId: compactRef(conflict.conflictingFactId),
    subjectId: compactRef(conflict.subjectId),
    predicate: compactRef(conflict.predicate),
    path: compactRef(conflict.path),
    sourceBranchIds: (Array.isArray(conflict.sourceBranchIds) ? conflict.sourceBranchIds : [])
      .map(compactRef)
      .filter(Boolean)
    }))
  const conflictedRelationIds = new Set(conflicts.flatMap((conflict) => [
    conflict.relationId,
    conflict.conflictingRelationId
  ]).filter(Boolean))
  const conflictedFactIds = new Set(conflicts.flatMap((conflict) => [
    conflict.factId,
    conflict.conflictingFactId
  ]).filter(Boolean))
  const relationships = Object.entries(record(runtimeState?.characterRelations))
    .map(([relationId, relation]) => ({
      relationId: compactRef(relationId),
      ...normalizeRelation(relation)
    }))
    .filter((relation) => (
      relation.relationId
      && relation.subjectId
      && relation.objectId
      && relation.status !== 'ended'
      && !conflictedRelationIds.has(relation.relationId)
    ))
    .slice(0, 8)
  const canonicalFacts = Object.entries(record(runtimeState?.canonicalFacts))
    .map(([factId, fact]) => ({
      factId: compactRef(factId),
      ...normalizeFact(fact)
    }))
    .filter((fact) => (
      fact.factId
      && fact.subjectId
      && fact.predicate
      && fact.status === 'confirmed'
      && !conflictedFactIds.has(fact.factId)
    ))
    .slice(0, 8)
  const sourceEventIds = [...new Set([
    ...recentChanges.map((item) => item.eventId),
    ...conflicts.map((item) => item.eventId),
    ...(report.resolutionEventIds || []).slice(-8),
    ...report.staleEventIds.slice(-8)
  ].filter(Boolean))]

  return {
    version: report.version,
    isConsistent: report.isConsistent,
    currentTime: {
      eraId: compactRef(runtimeState?.writingTime?.eraId),
      eraName: text(runtimeState?.writingTime?.eraName).slice(0, 80),
      year: compactRef(runtimeState?.writingTime?.year),
      month: compactRef(runtimeState?.writingTime?.month),
      day: compactRef(runtimeState?.writingTime?.day)
    },
    currentPlace: placeId
      ? {
          placeId,
          status: text(placeState?.status).slice(0, 80),
          controllerId: compactRef(placeState?.controllerId),
          danger: Number.isFinite(Number(placeState?.danger)) ? Number(placeState.danger) : null
        }
      : null,
    characters,
    relationships,
    canonicalFacts,
    recentChanges,
    conflicts,
    staleEventIds: report.staleEventIds.slice(-12),
    sourceEventIds
  }
}

export default {
  RUNTIME_CAUSALITY_VERSION,
  buildRuntimeConflictKey,
  canResolveRuntimeConflict,
  detectRuntimeEventConflicts,
  describeRuntimeStateTransitions,
  buildRuntimeEventCausality,
  buildRuntimeCausalityContext
}
