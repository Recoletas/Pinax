// Phase 8：挂起 manifest 只校验实际依赖，不因无关项目编辑误判 stale。

export function reconcileManifestDependencies(manifest, liveRevisions = {}) {
  const issues = []
  for (const [key, expected] of Object.entries(manifest?.dependencies || {})) {
    const actual = liveRevisions?.[key]
    if (actual == null) issues.push({ dependency: key, reason: 'revision-missing', expected })
    else if (String(actual) !== String(expected)) issues.push({ dependency: key, reason: 'revision-changed', expected, actual: String(actual) })
  }
  return issues
}

export function isContextManifestStale(manifest, liveRevisions = {}) {
  return reconcileManifestDependencies(manifest, liveRevisions).length > 0
}
