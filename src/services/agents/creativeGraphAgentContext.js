const MATERIAL_LIMIT = 8
const MATERIAL_TEXT_LIMIT = 1400
const CANVAS_NEIGHBOR_LIMIT = 8
const CANVAS_TEXT_LIMIT = 1200

function text(value) {
  return String(value ?? '').trim()
}

function clip(value, limit) {
  const normalized = text(value)
  return normalized.length > limit
    ? `${normalized.slice(0, limit)}\n[内容已截断]`
    : normalized
}

export function createContentRevision(value) {
  const source = typeof value === 'string' ? value : JSON.stringify(value ?? {})
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `rev-${(hash >>> 0).toString(36)}-${source.length.toString(36)}`
}

function normalizeMaterial(asset) {
  return {
    id: text(asset?.id),
    title: text(asset?.title) || '无标题素材',
    kind: text(asset?.kind) || 'note',
    status: text(asset?.status) || 'inbox',
    content: clip(asset?.content, MATERIAL_TEXT_LIMIT)
  }
}

export function buildMaterialsAgentContext({ selectedAsset = null, selectedAssets = [] } = {}) {
  const candidates = selectedAssets.length ? selectedAssets : (selectedAsset ? [selectedAsset] : [])
  const seen = new Set()
  const assets = []

  for (const candidate of candidates) {
    const normalized = normalizeMaterial(candidate)
    if (!normalized.id || seen.has(normalized.id)) continue
    seen.add(normalized.id)
    assets.push(normalized)
    if (assets.length >= MATERIAL_LIMIT) break
  }

  return {
    context: {
      policy: 'selected-materials-only',
      assets,
      selectionCount: assets.length,
      omittedSelectionCount: Math.max(0, candidates.length - assets.length)
    },
    assets,
    revision: createContentRevision(assets)
  }
}

function normalizeCard(card) {
  return {
    id: text(card?.id),
    content: clip(card?.content, CANVAS_TEXT_LIMIT),
    x: Number(card?.x) || 0,
    y: Number(card?.y) || 0,
    width: Number(card?.width) || null,
    height: Number(card?.height) || null,
    type: text(card?.type || card?.cardType),
    assetId: text(card?.assetId) || null,
    pileId: text(card?.pileId) || null
  }
}

export function buildCanvasAgentContext({
  selectedCard = null,
  cards = [],
  edges = [],
  viewport = {}
} = {}) {
  if (!selectedCard?.id) {
    return {
      context: {
        policy: 'selected-node-neighborhood-only',
        selectedCardId: null,
        cards: [],
        edges: [],
        viewport: {}
      },
      cards: [],
      edges: [],
      revision: createContentRevision('')
    }
  }

  const selectedId = String(selectedCard.id)
  const neighborIds = []
  const seenNeighbors = new Set()
  for (const edge of edges) {
    const sourceId = String(edge?.sourceId ?? edge?.source ?? '')
    const targetId = String(edge?.targetId ?? edge?.target ?? '')
    const neighborId = sourceId === selectedId
      ? targetId
      : (targetId === selectedId ? sourceId : '')
    if (!neighborId || neighborId === selectedId || seenNeighbors.has(neighborId)) continue
    seenNeighbors.add(neighborId)
    neighborIds.push(neighborId)
    if (neighborIds.length >= CANVAS_NEIGHBOR_LIMIT) break
  }

  const includedIds = new Set([selectedId, ...neighborIds])
  const cardById = new Map(cards.map((card) => [String(card?.id), card]))
  cardById.set(selectedId, selectedCard)
  const includedCards = [selectedId, ...neighborIds]
    .map((id) => cardById.get(id))
    .filter(Boolean)
    .map(normalizeCard)
  const includedEdges = edges
    .filter((edge) => {
      const sourceId = String(edge?.sourceId ?? edge?.source ?? '')
      const targetId = String(edge?.targetId ?? edge?.target ?? '')
      return includedIds.has(sourceId) && includedIds.has(targetId)
    })
    .map((edge) => ({
      sourceId: String(edge?.sourceId ?? edge?.source ?? ''),
      targetId: String(edge?.targetId ?? edge?.target ?? ''),
      type: text(edge?.type)
    }))

  const boundedViewport = {
    zoom: Number(viewport?.zoom) || 1,
    panX: Number(viewport?.panX) || 0,
    panY: Number(viewport?.panY) || 0,
    scrollLeft: Number(viewport?.scrollLeft) || 0,
    scrollTop: Number(viewport?.scrollTop) || 0,
    width: Number(viewport?.width) || 0,
    height: Number(viewport?.height) || 0
  }
  const context = {
    policy: 'selected-node-neighborhood-only',
    selectedCardId: selectedId,
    cards: includedCards,
    edges: includedEdges,
    viewport: boundedViewport,
    omittedNeighborCount: Math.max(0, seenNeighbors.size - neighborIds.length)
  }

  return {
    context,
    cards: includedCards,
    edges: includedEdges,
    revision: createContentRevision({
      selectedCardId: selectedId,
      cards: includedCards,
      edges: includedEdges
    })
  }
}
