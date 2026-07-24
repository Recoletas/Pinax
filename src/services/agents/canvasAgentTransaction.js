const RELATION_TYPES = new Set(['continuation', 'elaboration', 'contrast', 'parallel', 'consciousness'])
const TRANSITION_TYPES = new Set(['jump_cut', 'dissolve', 'fade', 'contrast_montage', 'cross_cut', 'match_cut'])

function str(value) {
  return String(value ?? '').trim()
}

function snapshotCard(card) {
  return {
    id: card.id,
    x: Number(card.x) || 0,
    y: Number(card.y) || 0,
    pileId: card.pileId || null
  }
}

function edgeSnapshot(edge) {
  return {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    type: edge.type
  }
}

function samePair(edge, sourceId, targetId) {
  return (edge.sourceId === sourceId && edge.targetId === targetId)
    || (edge.sourceId === targetId && edge.targetId === sourceId)
}

function applyLayout(action, nextCards, allowedIds) {
  const moves = Array.isArray(action?.payload?.moves) ? action.payload.moves : []
  if (!moves.length || moves.length > allowedIds.size) return { ok: false, reason: 'invalid-layout-count' }
  const cardById = new Map(nextCards.map((card) => [String(card.id), card]))
  for (const move of moves) {
    const cardId = str(move?.cardId)
    const card = cardById.get(cardId)
    const x = Number(move?.x)
    const y = Number(move?.y)
    if (!allowedIds.has(cardId) || !card || card.pileId || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, reason: 'invalid-layout-target' }
    }
    if (Math.abs(x - Number(card.x || 0)) > 480 || Math.abs(y - Number(card.y || 0)) > 480) {
      return { ok: false, reason: 'layout-move-too-large' }
    }
    card.x = Math.max(40, Math.min(10000, Math.round(x)))
    card.y = Math.max(40, Math.min(10000, Math.round(y)))
  }
  return { ok: true }
}

function applyEdges(action, nextEdges, allowedIds, allowedTypes, idSeed) {
  const changes = Array.isArray(action?.payload?.changes) ? action.payload.changes : []
  if (!changes.length || changes.length > 12) return { ok: false, reason: 'invalid-edge-count' }
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]
    const operation = str(change?.operation)
    const sourceId = str(change?.sourceId)
    const targetId = str(change?.targetId)
    const edgeType = str(change?.edgeType)
    if (
      sourceId === targetId
      || !allowedIds.has(sourceId)
      || !allowedIds.has(targetId)
      || !['upsert', 'remove'].includes(operation)
      || (operation === 'upsert' && !allowedTypes.has(edgeType))
    ) {
      return { ok: false, reason: 'invalid-edge-change' }
    }
    const existingIndex = nextEdges.findIndex((edge) => samePair(edge, sourceId, targetId))
    if (operation === 'remove') {
      if (existingIndex >= 0) nextEdges.splice(existingIndex, 1)
      continue
    }
    if (existingIndex >= 0) {
      nextEdges[existingIndex] = { ...nextEdges[existingIndex], sourceId, targetId, type: edgeType }
    } else {
      nextEdges.push({
        id: `edge_agent_${idSeed}_${index}`,
        sourceId,
        targetId,
        type: edgeType
      })
    }
  }
  return { ok: true }
}

export function prepareCanvasAgentTransaction(actions, cards, edges, options = {}) {
  const list = Array.isArray(actions) ? actions : []
  const allowedIds = new Set((options.allowedCardIds || []).map(String))
  if (!list.length || !allowedIds.size) return { ok: false, reason: 'missing-actions-or-selection' }

  const nextCards = (cards || []).map((card) => ({ ...card }))
  const nextEdges = (edges || []).map((edge) => ({ ...edge }))
  const idSeed = Number(options.now) || Date.now()
  for (const action of list) {
    let result
    if (action?.type === 'canvas-layout') {
      result = applyLayout(action, nextCards, allowedIds)
    } else if (action?.type === 'canvas-relations') {
      result = applyEdges(action, nextEdges, allowedIds, RELATION_TYPES, idSeed)
    } else if (action?.type === 'canvas-transition') {
      result = applyEdges(action, nextEdges, allowedIds, TRANSITION_TYPES, idSeed)
    } else {
      return { ok: false, reason: 'unsupported-canvas-action' }
    }
    if (!result.ok) return result
  }

  return {
    ok: true,
    cards: nextCards,
    edges: nextEdges,
    receipt: {
      type: 'canvas-agent-transaction',
      resultId: options.resultId || null,
      selectedCardId: options.selectedCardId || null,
      allowedCardIds: [...allowedIds],
      beforeCards: (cards || []).filter((card) => allowedIds.has(String(card.id))).map(snapshotCard),
      afterCards: nextCards.filter((card) => allowedIds.has(String(card.id))).map(snapshotCard),
      beforeEdges: (edges || []).map(edgeSnapshot),
      beforeEdgesData: (edges || []).map((edge) => ({ ...edge })),
      afterEdges: nextEdges.map(edgeSnapshot),
      appliedAt: idSeed
    }
  }
}

export function canUndoCanvasAgentTransaction(cards, edges, receipt) {
  if (receipt?.type !== 'canvas-agent-transaction') return false
  const currentCards = (cards || [])
    .filter((card) => receipt.allowedCardIds.includes(String(card.id)))
    .map(snapshotCard)
  const currentEdges = (edges || []).map(edgeSnapshot)
  return JSON.stringify(currentCards) === JSON.stringify(receipt.afterCards)
    && JSON.stringify(currentEdges) === JSON.stringify(receipt.afterEdges)
}

export function restoreCanvasAgentTransaction(cards, receipt) {
  const beforeById = new Map((receipt?.beforeCards || []).map((card) => [String(card.id), card]))
  return (cards || []).map((card) => {
    const before = beforeById.get(String(card.id))
    return before ? { ...card, x: before.x, y: before.y, pileId: before.pileId } : card
  })
}
