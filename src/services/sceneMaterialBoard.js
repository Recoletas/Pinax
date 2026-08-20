export const SCENE_RELATION_TYPES = [
  'continuation',
  'elaboration',
  'contrast',
  'parallel',
  'consciousness'
]

export function getCanvasCardSourceState(card, assetsById) {
  if (!card?.assetId) return { state: 'untracked', asset: null }
  const asset = getAssetById(assetsById, card.assetId)
  if (!asset || asset.status === 'rejected') return { state: 'detached', asset: null }
  if (asset.status === 'archived') return { state: 'archived', asset }
  return { state: 'linked', asset }
}

export function buildSceneMaterialBoard({ cards = [], outline = [], edges = [], assets = [] } = {}) {
  const safeCards = Array.isArray(cards) ? cards.filter((card) => card?.id) : []
  const safeOutline = Array.isArray(outline) ? outline : []
  const safeEdges = Array.isArray(edges) ? edges : []
  const assetsById = new Map((Array.isArray(assets) ? assets : [])
    .filter((asset) => asset?.id)
    .map((asset) => [asset.id, asset]))
  const cardsById = new Map(safeCards.map((card) => [card.id, card]))
  const sourceStatesByCardId = new Map(safeCards.map((card) => [
    card.id,
    getCanvasCardSourceState(card, assetsById)
  ]))

  let missingOutlineReferences = 0
  const placedCardIds = new Set()
  const beatItems = []
  for (const outlineItem of safeOutline) {
    const card = cardsById.get(outlineItem?.cardId)
    if (!card) {
      missingOutlineReferences += 1
      continue
    }
    if (placedCardIds.has(card.id)) continue
    placedCardIds.add(card.id)
    beatItems.push({
      outlineItem,
      card,
      sequence: beatItems.length + 1,
      sourceState: sourceStatesByCardId.get(card.id)
    })
  }

  const unplacedItems = safeCards
    .filter((card) => !placedCardIds.has(card.id))
    .sort(compareCardsByCreation)
    .map((card) => ({ card, sourceState: sourceStatesByCardId.get(card.id) }))

  const relationItems = safeEdges
    .map((edge) => ({
      edge,
      sourceCard: cardsById.get(edge?.sourceId),
      targetCard: cardsById.get(edge?.targetId)
    }))
    .filter((item) => item.sourceCard && item.targetCard)

  const sourceStates = [...sourceStatesByCardId.values()]
  return {
    beatItems,
    unplacedItems,
    relationItems,
    detachedCount: missingOutlineReferences
      + sourceStates.filter((item) => item.state === 'detached').length,
    archivedCount: sourceStates.filter((item) => item.state === 'archived').length
  }
}

export function addCardToOutline(outline, card) {
  const current = Array.isArray(outline) ? outline : []
  if (!card?.id || current.some((item) => item?.cardId === card.id)) return current
  return [...current, {
    cardId: card.id,
    preview: String(card.content || card.title || '').trim()
  }]
}

export function removeCardFromOutline(outline, cardId) {
  const current = Array.isArray(outline) ? outline : []
  const index = current.findIndex((item) => item?.cardId === cardId)
  if (index < 0) return current
  return current.filter((_item, itemIndex) => itemIndex !== index)
}

export function moveOutlineItem(outline, fromIndex, toIndex) {
  const current = Array.isArray(outline) ? outline : []
  if (!Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= current.length
    || toIndex >= current.length
    || fromIndex === toIndex) return current

  const next = [...current]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export function upsertSceneRelationship(edges, relationship) {
  const current = Array.isArray(edges) ? edges : []
  const sourceId = String(relationship?.sourceId || '').trim()
  const targetId = String(relationship?.targetId || '').trim()
  const type = String(relationship?.type || '').trim()
  if (!sourceId || !targetId || sourceId === targetId || !SCENE_RELATION_TYPES.includes(type)) {
    return current
  }

  const existingIndex = current.findIndex((edge) => (
    (edge?.sourceId === sourceId && edge?.targetId === targetId)
    || (edge?.sourceId === targetId && edge?.targetId === sourceId)
  ))
  if (existingIndex >= 0) {
    if (current[existingIndex].type === type) return current
    return current.map((edge, index) => index === existingIndex ? { ...edge, type } : edge)
  }

  return [...current, {
    id: relationship?.id || `edge_${sourceId}_${targetId}`,
    sourceId,
    targetId,
    type
  }]
}

function getAssetById(assetsById, assetId) {
  if (assetsById instanceof Map) return assetsById.get(assetId) || null
  return assetsById?.[assetId] || null
}

function compareCardsByCreation(left, right) {
  const createdDifference = String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
  if (createdDifference) return createdDifference
  return String(left.id).localeCompare(String(right.id))
}
