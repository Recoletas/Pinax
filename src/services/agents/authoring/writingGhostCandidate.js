// 文本工作台 v3 Phase 9：inline / 长推演 / exploration 共用的单一 Ghost 生命周期对象。

import { reconcileManifestDependencies } from '../context/contextManifestLifecycle.js'

function value(input) { return String(input ?? '') }

function fingerprint(source) {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function frozenSnapshot(input) {
  if (Array.isArray(input)) return Object.freeze(input.map(frozenSnapshot))
  if (!input || typeof input !== 'object') return input
  return Object.freeze(Object.fromEntries(
    Object.entries(input).map(([key, item]) => [key, frozenSnapshot(item)])
  ))
}

function hasSceneIntentEffect(runSession) {
  return Array.isArray(runSession?.sceneIntents) && runSession.sceneIntents.some((intent) => (
    intent?.mode === 'next-passage'
    && ['add-present-character', 'set-location'].includes(intent?.payload?.adoption)
  ))
}

export function createWritingGhostCandidate({
  kind = 'inline', text = '', target = null, manifest = null, runOutcome = null,
  originRefs = [], sceneDelta = null, outlineDelta = null, runSession = null,
  contextCallReceipts = []
} = {}) {
  const content = value(text).trim()
  if (!content || !target?.projectId || !target?.documentId || !target?.documentRevision) return null
  const normalizedTarget = {
    projectId: value(target.projectId),
    documentId: value(target.documentId),
    role: target.role === 'exploration' ? 'exploration' : 'manuscript',
    chapterId: value(target.chapterId),
    unitId: value(target.unitId),
    unitRevision: value(target.unitRevision),
    nodeId: value(target.nodeId),
    nodeRevision: value(target.nodeRevision),
    caret: Number.isFinite(Number(target.caret)) ? Number(target.caret) : null,
    documentRevision: value(target.documentRevision)
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'writing-ghost-candidate',
    id: `ghost-${fingerprint(JSON.stringify({ kind, content, normalizedTarget, manifest: manifest?.fingerprint }))}`,
    mode: ['inline', 'narrative', 'rewrite'].includes(kind) ? kind : 'inline',
    text: content,
    target: normalizedTarget,
    dependencyRevisions: { ...(manifest?.dependencies || {}) },
    manifestFingerprint: value(manifest?.fingerprint),
    runOutcome: runOutcome || { status: 'completed' },
    runSession: runSession?.kind === 'authoring-run-session' ? runSession : null,
    contextCallReceipts: frozenSnapshot(Array.isArray(contextCallReceipts) ? contextCallReceipts : []),
    originRefs: Array.isArray(originRefs) ? [...originRefs] : [],
    sceneDelta: sceneDelta || null,
    outlineDelta: outlineDelta || null,
    requiresWholeAdoption: Boolean(sceneDelta || outlineDelta || hasSceneIntentEffect(runSession)),
    status: 'pending'
  })
}

export function validateWritingGhostCandidate(candidate, { target = null, liveDependencyRevisions = {} } = {}) {
  if (!candidate || candidate.status !== 'pending') return { ok: false, reason: 'candidate-unavailable' }
  if (candidate.runOutcome?.status === 'stale' || candidate.runOutcome?.adoptable === false) {
    return { ok: false, reason: 'run-stale', dependencyIssues: candidate.runOutcome?.dependencyIssues || [] }
  }
  if (!target) return { ok: false, reason: 'target-missing' }
  for (const key of ['projectId', 'documentId', 'role', 'documentRevision']) {
    if (value(candidate.target?.[key]) !== value(target?.[key])) return { ok: false, reason: `${key}-changed` }
  }
  if (candidate.target.unitId && value(candidate.target.unitId) !== value(target.unitId)) return { ok: false, reason: 'unit-changed' }
  if (candidate.target.unitRevision && value(candidate.target.unitRevision) !== value(target.unitRevision)) return { ok: false, reason: 'unit-revision-changed' }
  if (candidate.target.nodeId && value(candidate.target.nodeId) !== value(target.nodeId)) return { ok: false, reason: 'node-changed' }
  if (candidate.target.nodeRevision && value(candidate.target.nodeRevision) !== value(target.nodeRevision)) return { ok: false, reason: 'node-revision-changed' }
  if (candidate.mode === 'inline' && candidate.target.caret !== Number(target.caret)) return { ok: false, reason: 'caret-changed' }
  const dependencyIssues = reconcileManifestDependencies({ dependencies: candidate.dependencyRevisions }, liveDependencyRevisions)
  return dependencyIssues.length ? { ok: false, reason: 'dependency-stale', dependencyIssues } : { ok: true }
}

export function selectWritingGhostText(candidate, mode = 'all') {
  if (!candidate) return ''
  if (candidate.requiresWholeAdoption || mode === 'all') return candidate.text
  const match = candidate.text.match(/^.*?[。！？!?\n](?:[”」』])?/)
  return match?.[0] || candidate.text
}

export function claimWritingGhostCandidate(current, next) {
  if (!next) return { pending: null, replacedId: current?.id || '' }
  return { pending: next, replacedId: current?.id && current.id !== next.id ? current.id : '' }
}
