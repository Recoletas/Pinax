// C1-1A live dependency collector for AuthoringRunSession.
// It deliberately reuses the same revision builders as candidate discovery so a
// freshly prepared manifest reconciles cleanly, while an edited/deleted source
// becomes changed/missing instead of being masked by a legacy token shape.

import {
  authoringRunReferenceRevision,
  memoryRunRevision,
  memorySourceDependencyKey,
  worldbookRunRevision
} from './authoringRunContextReaders.js'

const OWNED_DEPENDENCY_PREFIXES = Object.freeze([
  'document:',
  'unit:',
  'node:',
  'scene-projection',
  'outline-node:',
  'exploration:',
  'narrative-asset:',
  'worldbook-entry:',
  'memory:',
  'memory-source:',
  'scene-intent:'
])

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value) !== ''
}

function assignRevision(target, key, value) {
  const normalizedKey = text(key)
  const normalizedValue = text(value)
  if (normalizedKey && normalizedValue) target[normalizedKey] = normalizedValue
}

function isCollectorOwnedDependency(key) {
  const dependency = text(key)
  return OWNED_DEPENDENCY_PREFIXES.some((prefix) => dependency.startsWith(prefix))
}

function outlineNodeRevision(node = {}) {
  if (!text(node.id) || !hasValue(node.revision)) return ''
  return `node-r${String(node.revision)}`
}

/**
 * Collect current revisions for a prepared Authoring manifest.
 *
 * `documentRevision` and `memorySourceRevisions` must be computed from current
 * page/repository state. Frozen values from the prepared session must not be
 * passed back as "live" values by the executor.
 */
export function collectAuthoringRunDependencyRevisions({
  document = null,
  documentId = '',
  documentRevision = '',
  sceneProjection = null,
  worldbook = null,
  explorationDocuments = [],
  referenceAssets = [],
  memories = [],
  sceneIntents = [],
  outlineNodes = [],
  sourceRevisions = {},
  memorySourceRevisions = {}
} = {}) {
  const revisions = {}
  for (const [key, value] of Object.entries(sourceRevisions || {})) {
    // These domains must come from the live values below. Accepting a frozen
    // session value here would mask a deleted source and defeat stale checks.
    if (isCollectorOwnedDependency(key)) continue
    assignRevision(revisions, key, value)
  }

  const resolvedDocumentId = text(documentId || document?.documentId || document?.chapterId)
  const resolvedDocumentRevision = text(documentRevision || document?.liveRevision || document?.revision)
  if (resolvedDocumentId && resolvedDocumentRevision) {
    assignRevision(revisions, `document:${resolvedDocumentId}`, resolvedDocumentRevision)
  }
  for (const unit of list(document?.content)) {
    const unitId = text(unit?.attrs?.unitId || unit?.unitId)
    const unitRevision = unit?.attrs?.unitRevision ?? unit?.unitRevision
    if (resolvedDocumentId && unitId && hasValue(unitRevision)) {
      assignRevision(revisions, `unit:${resolvedDocumentId}:${unitId}`, `unit-r${String(unitRevision)}`)
    }
    for (const node of list(unit?.content)) {
      const nodeId = text(node?.attrs?.nodeId || node?.nodeId)
      const nodeRevision = node?.attrs?.nodeRevision ?? node?.attrs?.revision ?? node?.nodeRevision
      if (resolvedDocumentId && nodeId && hasValue(nodeRevision)) {
        assignRevision(revisions, `node:${resolvedDocumentId}:${nodeId}`, `node-r${String(nodeRevision)}`)
      }
    }
  }

  assignRevision(revisions, 'scene-projection', sceneProjection?.projectionFingerprint)

  for (const node of list(outlineNodes)) {
    assignRevision(revisions, `outline-node:${text(node?.id)}`, outlineNodeRevision(node))
  }
  for (const doc of list(explorationDocuments)) {
    assignRevision(
      revisions,
      `exploration:${text(doc?.id)}`,
      authoringRunReferenceRevision('exploration-doc', doc)
    )
  }
  for (const asset of list(referenceAssets)) {
    assignRevision(
      revisions,
      `narrative-asset:${text(asset?.id)}`,
      authoringRunReferenceRevision('narrative-asset', asset)
    )
  }

  const expectedWorldbookId = text(sceneProjection?.worldbookId)
  if (worldbook && expectedWorldbookId && text(worldbook.id) === expectedWorldbookId) {
    for (const entry of list(worldbook.entries)) {
      assignRevision(revisions, `worldbook-entry:${text(entry?.id)}`, worldbookRunRevision(entry))
    }
  }

  for (const memory of list(memories)) {
    assignRevision(revisions, `memory:${text(memory?.id)}`, memoryRunRevision(memory))
  }
  for (const intent of list(sceneIntents)) {
    assignRevision(revisions, `scene-intent:${text(intent?.id)}`, intent?.revision)
  }
  for (const [sourceRef, revision] of Object.entries(memorySourceRevisions || {})) {
    assignRevision(revisions, memorySourceDependencyKey(sourceRef), revision)
  }

  return Object.freeze(revisions)
}

export default collectAuthoringRunDependencyRevisions
