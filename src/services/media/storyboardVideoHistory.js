// Read-only projection of video assets. A shot's display number is not its
// identity: sequence numbers can change when the canvas timeline is reordered.
function id(value) { return value == null ? '' : String(value).trim() }

function versionIds(asset) {
  if (id(asset.generationParams?.storyboardVersionId)) return [id(asset.generationParams.storyboardVersionId)]
  return [...new Set([
    ...(asset.sourceRefs || []).filter((ref) => ref?.refType === 'storyboard-shot').map((ref) => id(ref.refId))
  ].filter(Boolean))]
}

export function storyboardVideoMatchesShot(asset, { projectId = null, document = {}, version = {}, shot = null, shotIndex = 0 } = {}) {
  if (!shot || asset?.kind !== 'video' || asset?.purpose !== 'storyboard-take') return false
  if (id(asset.projectId) !== id(projectId) || !id(document.id)) return false
  const params = asset.generationParams || {}
  const versions = [...(document.versions || []), version].filter((entry) => id(entry?.versionId))
  const knownIds = new Set(versions.map((entry) => id(entry.versionId)))
  const savedIds = versionIds(asset)
  if (params.storyboardDocumentId) {
    if (id(params.storyboardDocumentId) !== id(document.id)) return false
  } else if (!savedIds.some((savedId) => knownIds.has(savedId))) return false

  const savedVersion = versions.find((entry) => savedIds.includes(id(entry.versionId)))
  const savedShot = savedVersion?.shots?.find((entry) => params.shotId
    ? id(entry.shotId || entry.nodeId) === id(params.shotId)
    : Number(entry.sequence) === Number(params.shotSequence))
  const savedNodeId = id(params.nodeId || savedShot?.nodeId)
  const currentNodeId = id(shot.nodeId)
  if (savedNodeId) return Boolean(currentNodeId && savedNodeId === currentNodeId)

  // Old records without a stable node identity are only safe within their
  // exact version. Never attach them to a different version by sequence alone.
  if (!savedIds.includes(id(version.versionId))) return false
  return params.shotId
    ? id(params.shotId) === id(shot.shotId || shot.nodeId)
    : Number(params.shotSequence) === Number(shot.sequence || shotIndex + 1)
}

export function selectStoryboardVideoHistory(assets = [], scope = {}) {
  const seen = new Set()
  return assets.filter((asset) => storyboardVideoMatchesShot(asset, scope))
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
    .filter((asset) => {
      const key = id(asset.generationJobId || asset.id)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((asset) => ({
      ...asset,
      previousVersion: !versionIds(asset).includes(id(scope.version?.versionId))
    }))
}

export function getStoryboardVideoAvailability(asset, now = Date.now()) {
  const url = /^https?:\/\//i.test(asset?.externalUrl || '') ? asset.externalUrl : ''
  const rawExpiry = asset?.generationParams?.externalUrlExpiresAt
  const numericExpiry = typeof rawExpiry === 'number' ? rawExpiry : Number(rawExpiry)
  const expiresAt = rawExpiry
    ? (Number.isFinite(numericExpiry) && numericExpiry > 0
        ? numericExpiry < 1e12 ? numericExpiry * 1000 : numericExpiry
        : Date.parse(rawExpiry))
    : null
  return { url, expiresAt: Number.isFinite(expiresAt) ? expiresAt : null, expired: Number.isFinite(expiresAt) && expiresAt <= now }
}
