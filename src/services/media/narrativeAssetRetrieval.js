import {
  ACTIVE_ASSET_STATUSES,
  listNarrativeAssets,
  normalizeContentRef,
  normalizeSourceRefs
} from './narrativeAssets'

const ACTIVE_STATUS_ORDER = new Map([
  ['accepted', 0],
  ['inbox', 1]
])

export function findAssetsByContentRefs(refs, options = {}) {
  const projectId = options.projectId
  const assets = Array.isArray(options.assets)
    ? options.assets
    : listNarrativeAssets({ status: null })
  const requested = normalizeRequestedRefs(refs, projectId)
  const active = []
  const archived = []
  const seenAssetIds = new Set()

  for (const asset of assets) {
    if (!asset?.id || seenAssetIds.has(asset.id) || !projectMatches(asset, projectId)) continue
    seenAssetIds.add(asset.id)
    if (asset.status === 'rejected') continue

    const sourceRefs = normalizeSourceRefs(asset.sourceRefs, {
      source: asset.source,
      projectId: asset.projectId
    })
    const matchedRefs = requested.filter((requestedRef) => (
      sourceRefs.some((sourceRef) => refsMatch(sourceRef, requestedRef))
    ))
    if (!matchedRefs.length) continue

    const item = {
      asset,
      matchedRefs,
      reasons: [asset.status === 'archived' ? 'archived-exact-ref' : 'exact-ref']
    }
    if (asset.status === 'archived') archived.push(item)
    else if (ACTIVE_ASSET_STATUSES.includes(asset.status)) active.push(item)
  }

  active.sort(compareMatches)
  archived.sort(compareMatches)
  return {
    state: active.length || archived.length ? 'matched' : 'no-exact-match',
    exactMatches: active,
    archivedMatches: archived
  }
}

function normalizeRequestedRefs(refs, projectId) {
  const seen = new Set()
  return (Array.isArray(refs) ? refs : [])
    .map((ref) => normalizeContentRef({
      ...ref,
      projectId: projectId !== undefined ? projectId : ref?.projectId
    }, projectId ?? null))
    .filter(Boolean)
    .filter((ref) => {
      const key = [ref.refType, ref.refId, ref.projectId || '', ref.version ?? ''].join(':')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function projectMatches(asset, projectId) {
  return projectId === undefined || asset.projectId === projectId
}

function refsMatch(sourceRef, requestedRef) {
  return sourceRef.refType === requestedRef.refType
    && sourceRef.refId === requestedRef.refId
    && sourceRef.projectId === requestedRef.projectId
}

function compareMatches(left, right) {
  const statusDifference = (ACTIVE_STATUS_ORDER.get(left.asset.status) ?? 2)
    - (ACTIVE_STATUS_ORDER.get(right.asset.status) ?? 2)
  if (statusDifference) return statusDifference

  const updatedDifference = Number(right.asset.updatedAt || 0) - Number(left.asset.updatedAt || 0)
  if (updatedDifference) return updatedDifference
  return String(left.asset.id).localeCompare(String(right.asset.id))
}
