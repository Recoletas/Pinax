import { ASSET_KINDS } from '../narrativeAssets'

const VALID_KINDS = new Set(ASSET_KINDS.map((kind) => kind.value))
const VALID_RELATIONS = new Set(['causes', 'character', 'place', 'time', 'supports'])

function str(value) {
  return String(value ?? '').trim()
}

function assetSnapshot(asset) {
  return {
    id: asset.id,
    title: asset.title,
    content: asset.content,
    kind: asset.kind,
    status: asset.status,
    projectId: asset.projectId ?? null,
    source: asset.source || null,
    sourceRefs: Array.isArray(asset.sourceRefs) ? asset.sourceRefs : []
  }
}

function prepareClassification(action, assetById) {
  const changes = Array.isArray(action?.payload?.changes) ? action.payload.changes : []
  const operations = []
  for (const change of changes.slice(0, 8)) {
    const assetId = str(change?.assetId)
    const kind = str(change?.kind)
    if (!assetById.has(assetId) || !VALID_KINDS.has(kind)) {
      return { ok: false, reason: 'invalid-classification-target' }
    }
    operations.push({ type: 'update', assetId, patch: { kind } })
  }
  return operations.length ? { ok: true, operations } : { ok: false, reason: 'empty-classification' }
}

function prepareSplit(action, assetById) {
  const sourceAssetId = str(action?.payload?.sourceAssetId)
  const source = assetById.get(sourceAssetId)
  const parts = Array.isArray(action?.payload?.parts) ? action.payload.parts : []
  if (!source || parts.length < 2 || parts.length > 4) {
    return { ok: false, reason: 'invalid-split-target' }
  }

  const normalizedParts = parts.map((part) => ({
    title: str(part?.title).slice(0, 80),
    content: str(part?.content),
    kind: str(part?.kind)
  }))
  if (normalizedParts.some((part) => !part.title || !part.content || !VALID_KINDS.has(part.kind))) {
    return { ok: false, reason: 'invalid-split-part' }
  }

  return {
    ok: true,
    operations: [
      ...normalizedParts.map((part) => ({
        type: 'create',
        asset: {
          ...part,
          status: 'inbox',
          projectId: source.projectId ?? null,
          source: { type: 'narrative-asset', id: source.id },
          sourceRefs: [{
            refType: 'narrative-asset',
            refId: source.id,
            projectId: source.projectId ?? null,
            excerpt: source.content
          }]
        }
      })),
      { type: 'update', assetId: source.id, patch: { status: 'archived' } }
    ]
  }
}

function prepareRelations(action, assetById) {
  const links = Array.isArray(action?.payload?.links) ? action.payload.links : []
  const refsByAsset = new Map()
  for (const link of links.slice(0, 12)) {
    const sourceId = str(link?.sourceId)
    const targetId = str(link?.targetId)
    const relation = str(link?.relation)
    if (
      sourceId === targetId
      || !assetById.has(sourceId)
      || !assetById.has(targetId)
      || !VALID_RELATIONS.has(relation)
    ) {
      return { ok: false, reason: 'invalid-relation-target' }
    }
    const source = assetById.get(sourceId)
    const target = assetById.get(targetId)
    const append = (asset, related, relationType) => {
      const refs = refsByAsset.get(asset.id) || [...(asset.sourceRefs || [])]
      if (!refs.some((ref) => ref.refId === related.id)) {
        refs.push({
          refType: 'narrative-asset',
          refId: related.id,
          projectId: related.projectId ?? null,
          excerpt: `[${relationType}] ${str(link.reason)}`.slice(0, 240)
        })
      }
      refsByAsset.set(asset.id, refs)
    }
    append(source, target, relation)
    append(target, source, relation)
  }

  const operations = [...refsByAsset.entries()].map(([assetId, sourceRefs]) => ({
    type: 'update',
    assetId,
    patch: { sourceRefs }
  }))
  return operations.length ? { ok: true, operations } : { ok: false, reason: 'empty-relations' }
}

export function prepareMaterialAgentTransaction(actions, assets, metadata = {}) {
  const list = Array.isArray(actions) ? actions : []
  const assetById = new Map((assets || []).map((asset) => [String(asset.id), asset]))
  if (!list.length || !assetById.size) return { ok: false, reason: 'missing-actions-or-assets' }

  const operations = []
  for (const action of list) {
    let prepared
    if (action?.type === 'material-classification') prepared = prepareClassification(action, assetById)
    else if (action?.type === 'material-split') prepared = prepareSplit(action, assetById)
    else if (action?.type === 'material-relations') prepared = prepareRelations(action, assetById)
    else return { ok: false, reason: 'unsupported-material-action' }
    if (!prepared.ok) return prepared
    operations.push(...prepared.operations)
  }

  const touchedIds = [...new Set(operations.filter((operation) => operation.assetId).map((operation) => operation.assetId))]
  return {
    ok: true,
    operations,
    receipt: {
      type: 'material-agent-transaction',
      resultId: metadata.resultId || null,
      before: touchedIds.map((id) => assetSnapshot(assetById.get(id))).filter(Boolean),
      createdIds: [],
      appliedAt: Date.now()
    }
  }
}

export function describeMaterialAgentAction(action) {
  if (action?.type === 'material-classification') {
    return (action.payload?.changes || []).map((change) => `${change.assetId} → ${change.kind}`)
  }
  if (action?.type === 'material-split') {
    return (action.payload?.parts || []).map((part) => `${part.title} · ${part.kind}`)
  }
  if (action?.type === 'material-relations') {
    return (action.payload?.links || []).map((link) => `${link.sourceId} → ${link.targetId} · ${link.relation}`)
  }
  return []
}
