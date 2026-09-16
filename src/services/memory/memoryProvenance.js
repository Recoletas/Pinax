import { normalizeStringList } from '../../../shared/memoryContract'

export function memorySourceKey(sourceRef, revision = '') {
  const ref = String(sourceRef || '').trim()
  const rev = String(revision || '').trim()
  return ref ? `${ref}@${rev || 'unknown'}` : ''
}

export function isMemorySourceCurrent(candidate, currentRevisions = {}) {
  const refs = normalizeStringList(candidate?.sourceRefs)
  if (!refs.length) return true
  return refs.every((ref) => {
    const expected = currentRevisions[ref]
    if (expected === undefined || expected === null || expected === '') return true
    const recorded = String(candidate?.sourceRevision || '').trim()
    if (!recorded) return true
    return expected === recorded
  })
}
