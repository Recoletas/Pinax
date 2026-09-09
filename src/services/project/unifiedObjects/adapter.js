/**
 * unifiedObjects/adapter.js — thin read-only adapter for unified creation
 * objects (round-4 K46). Returns logical owner/nativeId/project/container/
 * revision/capabilities plus the ORIGINAL native sourceRef/locator. Content
 * is read on demand from the owning repository via injected readers.
 *
 * Covers exploration, chapter, worldbook-entry (character/location are entry
 * capabilities, not separate entities). No new storage, no authorization,
 * no implicit reads. `latest` and `pinned` read modes are explicit.
 */

const OBJECT_TYPES = Object.freeze(['exploration', 'chapter', 'worldbook-entry'])

const CAPABILITIES = Object.freeze({
  exploration: Object.freeze(['read-text', 'read-revision', 'delete', 'rename']),
  chapter: Object.freeze(['read-text', 'read-revision', 'locate-node', 'edit-text']),
  'worldbook-entry': Object.freeze(['read-text', 'read-revision', 'locate-entry', 'edit-text'])
})

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Adapt a native repository item into a unified object reference.
 * readers: { getExploration(projectId, docId), getChapter(projectId, chapterId),
 *            getWorldbookEntry(projectId, worldbookId, entryId) }
 * Each returns { content, revision, ...nativeFields } or null.
 */
export function createUnifiedObjectAdapter({ readers }) {
  if (!isPlainObject(readers)) return { ok: false, error: 'readers-required' }
  return {
    ok: true,
    adapter: Object.freeze({
      async resolve(objectType, { projectId, nativeId, containerId, mode = 'latest', revision } = {}) {
        if (!OBJECT_TYPES.includes(objectType)) {
          return { ok: false, reason: 'object-type-unsupported' }
        }
        if (typeof projectId !== 'string' || !projectId.trim()) {
          return { ok: false, reason: 'project-id-required' }
        }
        if (typeof nativeId !== 'string' || !nativeId.trim()) {
          return { ok: false, reason: 'native-id-required' }
        }
        if (mode !== 'latest' && mode !== 'pinned') {
          return { ok: false, reason: 'read-mode-invalid' }
        }
        // Readers expose the current version only. Never substitute it for a
        // requested historical revision that the owner cannot provide.
        if (mode === 'pinned' && (revision == null || String(revision).trim() === '')) {
          return { ok: false, reason: 'pinned-revision-required' }
        }
        const matchesRevision = (item) => mode !== 'pinned' ||
          (item.revision != null && String(item.revision) === String(revision))
        try {
          if (objectType === 'exploration') {
            const item = await readers.getExploration(projectId, nativeId)
            if (!item) return { ok: false, reason: 'not-found' }
            if (!matchesRevision(item)) return { ok: false, reason: 'pinned-revision-unavailable' }
            return {
              ok: true,
              object: Object.freeze({
                owner: 'exploration', nativeId, projectId,
                containerId: null,
                revision: String(item.revision ?? ''),
                capabilities: CAPABILITIES.exploration,
                sourceRef: `exploration:${nativeId}`,
                locator: { kind: 'exploration', documentId: nativeId },
                text: typeof item.content === 'string' ? item.content : ''
              })
            }
          }
          if (objectType === 'chapter') {
            const item = await readers.getChapter(projectId, nativeId)
            if (!item) return { ok: false, reason: 'not-found' }
            if (!matchesRevision(item)) return { ok: false, reason: 'pinned-revision-unavailable' }
            return {
              ok: true,
              object: Object.freeze({
                owner: 'chapter', nativeId, projectId,
                containerId: nativeId,
                revision: String(item.revision ?? ''),
                capabilities: CAPABILITIES.chapter,
                sourceRef: `chapter:${nativeId}`,
                locator: { kind: 'chapter', chapterId: nativeId },
                text: typeof item.content === 'string' ? item.content : ''
              })
            }
          }
          // worldbook-entry
          if (typeof containerId !== 'string' || !containerId.trim()) {
            return { ok: false, reason: 'container-id-required' }
          }
          const item = await readers.getWorldbookEntry(projectId, containerId, nativeId)
          if (!item) return { ok: false, reason: 'not-found' }
          if (!matchesRevision(item)) return { ok: false, reason: 'pinned-revision-unavailable' }
          return {
            ok: true,
            object: Object.freeze({
              owner: 'worldbook-entry', nativeId, projectId,
              containerId,
              revision: String(item.revision ?? ''),
              capabilities: CAPABILITIES['worldbook-entry'],
              sourceRef: `worldbook-entry:${nativeId}`,
              locator: { kind: 'worldbook-entry', worldbookId: containerId, entryId: nativeId },
              text: typeof item.content === 'string' ? item.content : ''
            })
          }
        } catch (error) {
          return { ok: false, reason: 'reader-error', detail: error.message }
        }
      }
    })
  }
}
