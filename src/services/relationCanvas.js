import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'

export function listRelationCanvasCards() {
  const stored = getItem(STORAGE_KEYS.PROSE_CARDS_V1)
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
