import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

export function listRelationCanvasCards() {
  const stored = getItem(STORAGE_KEYS.PROSE_CARDS_V1)
  return Array.isArray(stored) ? stored : []
}

function readStoredList(key) {
  const stored = getItem(key)
  return Array.isArray(stored) ? stored : []
}

export function findAssetCanvasCard(assetId) {
  if (!assetId) return null
  return listRelationCanvasCards().find((card) => card.assetId === assetId) || null
}

export function ensureAssetCanvasCard(asset) {
  if (!asset?.id) return null

  const cards = listRelationCanvasCards()
  const existing = cards.find((card) => card.assetId === asset.id)
  if (existing) return existing

  const now = new Date().toISOString()
  const card = {
    id: `card_asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    assetId: asset.id,
    content: String(asset.content || asset.title || '').trim(),
    emotion: 'calm',
    wordCount: countWords(asset.content || ''),
    createdAt: now,
    updatedAt: now,
    pileId: null,
    zone: 'material',
    x: null,
    y: null,
    extraFields: null
  }

  setItem(STORAGE_KEYS.PROSE_CARDS_V1, [...cards, card])
  return card
}

function countWords(text) {
  return String(text || '').replace(/\s/g, '').length
}

export function ensureAssetCanvasCardWithExtra(asset, extraFields) {
  if (!asset?.id) return null

  const card = ensureAssetCanvasCard(asset)
  if (!card) return null

  if (extraFields) {
    const cards = listRelationCanvasCards()
    const idx = cards.findIndex((c) => c.id === card.id)
    if (idx >= 0) {
      cards[idx] = { ...cards[idx], extraFields }
      setItem(STORAGE_KEYS.PROSE_CARDS_V1, cards)
      return cards[idx]
    }
  }
  return card
}

export function deleteAssetCanvasReferences(assetId) {
  const normalizedAssetId = String(assetId || '').trim()
  if (!normalizedAssetId) {
    return {
      removedCards: [],
      removedEdges: 0,
      removedOutlineItems: 0,
      removedTimelineItems: 0,
      dissolvedPiles: 0
    }
  }

  const cards = listRelationCanvasCards()
  const removedCards = cards.filter((card) => card.assetId === normalizedAssetId)
  const removedCardIds = new Set(removedCards.map((card) => card.id).filter(Boolean))
  const timeline = readStoredList(STORAGE_KEYS.PROSE_TIMELINE_V1)

  if (removedCardIds.size === 0) {
    const nextTimeline = timeline.filter((item) => item?.assetId !== normalizedAssetId)
    if (nextTimeline.length !== timeline.length) {
      setItem(STORAGE_KEYS.PROSE_TIMELINE_V1, nextTimeline)
    }

    return {
      removedCards: [],
      removedEdges: 0,
      removedOutlineItems: 0,
      removedTimelineItems: timeline.length - nextTimeline.length,
      dissolvedPiles: 0
    }
  }

  const rawNextCards = cards.filter((card) => !removedCardIds.has(card.id))
  const piles = readStoredList(STORAGE_KEYS.PROSE_PILES_V1)
  const dissolvedPileIds = new Set()
  const nextPiles = []

  piles.forEach((pile) => {
    const cardIds = Array.isArray(pile?.cardIds) ? pile.cardIds : []
    const nextCardIds = cardIds.filter((cardId) => !removedCardIds.has(cardId))
    const wasAffected = nextCardIds.length !== cardIds.length

    if (!wasAffected) {
      nextPiles.push(pile)
      return
    }

    if (nextCardIds.length >= 2) {
      nextPiles.push({ ...pile, cardIds: nextCardIds })
      return
    }

    if (pile?.pileId) {
      dissolvedPileIds.add(pile.pileId)
    }
  })

  const nextCards = rawNextCards.map((card) => (
    dissolvedPileIds.has(card.pileId)
      ? { ...card, pileId: null }
      : card
  ))

  const edges = readStoredList(STORAGE_KEYS.PROSE_EDGES_V1)
  const nextEdges = edges.filter((edge) => (
    !removedCardIds.has(edge?.sourceId) && !removedCardIds.has(edge?.targetId)
  ))

  const outline = readStoredList(STORAGE_KEYS.PROSE_OUTLINE_V1)
  const nextOutline = outline.filter((item) => (
    !removedCardIds.has(item?.cardId) && !dissolvedPileIds.has(item?.pileId)
  ))

  const nextTimeline = timeline.filter((item) => {
    if (item?.assetId === normalizedAssetId) return false
    if (removedCardIds.has(item?.cardId) || removedCardIds.has(item?.focusCardId)) return false
    if (dissolvedPileIds.has(item?.pileId)) return false
    if (Array.isArray(item?.cardIds) && item.cardIds.some((cardId) => removedCardIds.has(cardId))) return false
    return true
  })

  setItem(STORAGE_KEYS.PROSE_CARDS_V1, nextCards)
  setItem(STORAGE_KEYS.PROSE_EDGES_V1, nextEdges)
  setItem(STORAGE_KEYS.PROSE_OUTLINE_V1, nextOutline)
  setItem(STORAGE_KEYS.PROSE_TIMELINE_V1, nextTimeline)
  setItem(STORAGE_KEYS.PROSE_PILES_V1, nextPiles)

  return {
    removedCards,
    removedEdges: edges.length - nextEdges.length,
    removedOutlineItems: outline.length - nextOutline.length,
    removedTimelineItems: timeline.length - nextTimeline.length,
    dissolvedPiles: dissolvedPileIds.size
  }
}
