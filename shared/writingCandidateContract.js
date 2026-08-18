import { validateWritingReplacement } from './writingReplacementContract.js'

export const WRITING_CANDIDATE_SCHEMA_VERSION = 3
export const MAX_WRITING_CANDIDATES = 3
export const MAX_WRITING_CANDIDATE_PATCHES = 12

function safeString(value, fallback = '') {
  if (value == null) return fallback
  return String(value)
}

function normalizeRange(range) {
  if (!range || typeof range !== 'object') return null
  const start = Number(range.start)
  const end = Number(range.end)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return {
    start: Math.max(0, Math.floor(Math.min(start, end))),
    end: Math.max(0, Math.floor(Math.max(start, end)))
  }
}

function normalizeEditorRange(range) {
  if (!range || typeof range !== 'object') return null
  const from = Number(range.from)
  const to = Number(range.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return {
    from: Math.max(1, Math.floor(Math.min(from, to))),
    to: Math.max(1, Math.floor(Math.max(from, to)))
  }
}

function normalizeLockedSegments(segments) {
  if (!Array.isArray(segments)) return []
  return segments.map((segment) => {
    const text = safeString(segment?.text).trim()
    if (!text) return null
    return {
      text,
      start: Number.isFinite(Number(segment?.start)) ? Math.max(0, Math.floor(Number(segment.start))) : null,
      end: Number.isFinite(Number(segment?.end)) ? Math.max(0, Math.floor(Number(segment.end))) : null
    }
  }).filter(Boolean).slice(0, 12)
}

function isUnchangedWritingText(value, baseText) {
  const source = safeString(baseText).replace(/\r\n/g, '\n').trim()
  if (!source) return false
  return safeString(value).replace(/\r\n/g, '\n').trim() === source
}

function normalizeWritingPatch(raw, fallback = {}) {
  const nodeId = safeString(raw?.nodeId || raw?.blockId || fallback.nodeId || fallback.blockId).trim()
  if (!nodeId) return null
  const replacement = safeString(raw?.replacement ?? raw?.text ?? raw?.content).trim()
  if (!validateWritingReplacement(replacement).valid) return null
  const baseText = raw?.baseText != null ? safeString(raw.baseText) : safeString(fallback.baseText)
  if (!baseText.trim()) return null

  return {
    unitId: safeString(raw?.unitId || fallback.unitId).trim() || null,
    unitRevision: Number.isFinite(Number(raw?.unitRevision))
      ? Number(raw.unitRevision)
      : (Number.isFinite(Number(fallback.unitRevision)) ? Number(fallback.unitRevision) : null),
    nodeId,
    nodeRevision: Number.isFinite(Number(raw?.nodeRevision ?? raw?.blockRevision))
      ? Number(raw.nodeRevision ?? raw.blockRevision)
      : (Number.isFinite(Number(fallback.nodeRevision ?? fallback.blockRevision)) ? Number(fallback.nodeRevision ?? fallback.blockRevision) : null),
    baseText,
    replacement,
    targetRange: normalizeRange(raw?.targetRange || raw?.range || fallback.targetRange),
    editorRange: normalizeEditorRange(raw?.editorRange || fallback.editorRange),
    rationale: safeString(raw?.rationale || raw?.reason),
    lockedSegments: normalizeLockedSegments(raw?.lockedSegments || fallback.lockedSegments)
  }
}

function normalizeWritingPatches(rawPatches, fallback = {}) {
  const source = Array.isArray(rawPatches) ? rawPatches : []
  if (!source.length) return []
  const fallbackNodes = Array.isArray(fallback.nodes)
    ? fallback.nodes
    : (Array.isArray(fallback.blocks) ? fallback.blocks : [])
  const fallbackById = new Map(fallbackNodes.map((node) => [safeString(node?.nodeId || node?.blockId), node]))
  const patches = source.slice(0, MAX_WRITING_CANDIDATE_PATCHES).map((raw) => {
    const nodeId = safeString(raw?.nodeId || raw?.blockId).trim()
    return normalizeWritingPatch(raw, fallbackById.get(nodeId) || {})
  }).filter(Boolean)

  if (patches.length !== source.length || new Set(patches.map((patch) => patch.nodeId)).size !== patches.length) return []
  if (fallbackNodes.length) {
    const expected = fallbackNodes.map((node) => safeString(node?.nodeId || node?.blockId)).filter(Boolean)
    const actual = patches.map((patch) => patch.nodeId)
    if (expected.length !== actual.length || expected.some((nodeId, index) => nodeId !== actual[index])) return []
  }
  return patches
}

function buildMultiNodeCandidate(raw, index, fallback) {
  const patches = normalizeWritingPatches(raw?.patches, fallback)
  if (!patches.length || patches.every((patch) => isUnchangedWritingText(patch.replacement, patch.baseText))) return null
  const text = patches.map((patch) => patch.replacement).join('\n')
  return {
    schemaVersion: WRITING_CANDIDATE_SCHEMA_VERSION,
    id: safeString(raw?.id) || `${safeString(fallback.resultId, 'writing-candidate')}-${index + 1}`,
    label: safeString(raw?.label || raw?.title) || `方案 ${index + 1}`,
    text,
    replacement: text,
    rationale: safeString(raw?.rationale || raw?.reason || raw?.summary),
    patches,
    baseText: patches.map((patch) => patch.baseText).join('\n'),
    targetRange: normalizeRange(raw?.targetRange || fallback.targetRange),
    unitId: null,
    unitRevision: null,
    nodeId: null,
    nodeRevision: null,
    chapterId: safeString(raw?.chapterId || fallback.chapterId) || null,
    documentRevision: Number.isFinite(Number(raw?.documentRevision)) ? Number(raw.documentRevision) : (Number.isFinite(Number(fallback.documentRevision)) ? Number(fallback.documentRevision) : null),
    lockedSegments: normalizeLockedSegments(raw?.lockedSegments || fallback.lockedSegments)
  }
}

export function normalizeWritingCandidates(rawCandidates, fallback = {}) {
  const source = Array.isArray(rawCandidates) ? rawCandidates : []
  const candidates = []
  source.forEach((raw, index) => {
    if (Array.isArray(raw?.patches) || fallback.multiBlock) {
      const candidate = buildMultiNodeCandidate(raw, index, fallback)
      if (!candidate || candidates.some((item) => item.text === candidate.text)) return
      candidates.push(candidate)
      return
    }
    const text = safeString(raw?.replacement ?? raw?.text ?? raw?.content).trim()
    if (!validateWritingReplacement(text).valid || isUnchangedWritingText(text, fallback.baseText)) return
    if (candidates.some((candidate) => candidate.text === text)) return
    candidates.push({
      schemaVersion: WRITING_CANDIDATE_SCHEMA_VERSION,
      id: safeString(raw?.id) || `${safeString(fallback.resultId, 'writing-candidate')}-${index + 1}`,
      label: safeString(raw?.label || raw?.title) || `方案 ${candidates.length + 1}`,
      text,
      replacement: text,
      rationale: safeString(raw?.rationale || raw?.reason || raw?.summary),
      baseText: raw?.baseText != null ? safeString(raw.baseText) : (fallback.baseText || null),
      targetRange: normalizeRange(raw?.targetRange || raw?.range || fallback.targetRange),
      unitId: safeString(raw?.unitId || fallback.unitId) || null,
      unitRevision: Number.isFinite(Number(raw?.unitRevision)) ? Number(raw.unitRevision) : (Number.isFinite(Number(fallback.unitRevision)) ? Number(fallback.unitRevision) : null),
      nodeId: safeString(raw?.nodeId || raw?.blockId || fallback.nodeId || fallback.blockId) || null,
      nodeRevision: Number.isFinite(Number(raw?.nodeRevision ?? raw?.blockRevision)) ? Number(raw.nodeRevision ?? raw.blockRevision) : (Number.isFinite(Number(fallback.nodeRevision ?? fallback.blockRevision)) ? Number(fallback.nodeRevision ?? fallback.blockRevision) : null),
      chapterId: safeString(raw?.chapterId || fallback.chapterId) || null,
      documentRevision: Number.isFinite(Number(raw?.documentRevision)) ? Number(raw.documentRevision) : (Number.isFinite(Number(fallback.documentRevision)) ? Number(fallback.documentRevision) : null),
      lockedSegments: normalizeLockedSegments(raw?.lockedSegments || fallback.lockedSegments)
    })
  })

  if (!candidates.length && Array.isArray(fallback.patches)) {
    const candidate = buildMultiNodeCandidate({ patches: fallback.patches }, 0, fallback)
    if (candidate) candidates.push(candidate)
  }
  if (!candidates.length && fallback.text && validateWritingReplacement(fallback.text).valid && !isUnchangedWritingText(fallback.text, fallback.baseText)) {
    candidates.push({
      schemaVersion: WRITING_CANDIDATE_SCHEMA_VERSION,
      id: `${safeString(fallback.resultId, 'writing-candidate')}-1`,
      label: '模型方案',
      text: safeString(fallback.text).trim(),
      replacement: safeString(fallback.text).trim(),
      rationale: safeString(fallback.rationale),
      baseText: fallback.baseText || null,
      targetRange: normalizeRange(fallback.targetRange),
      unitId: safeString(fallback.unitId) || null,
      unitRevision: Number.isFinite(Number(fallback.unitRevision)) ? Number(fallback.unitRevision) : null,
      nodeId: safeString(fallback.nodeId || fallback.blockId) || null,
      nodeRevision: Number.isFinite(Number(fallback.nodeRevision ?? fallback.blockRevision)) ? Number(fallback.nodeRevision ?? fallback.blockRevision) : null,
      chapterId: safeString(fallback.chapterId) || null,
      documentRevision: Number.isFinite(Number(fallback.documentRevision)) ? Number(fallback.documentRevision) : null,
      lockedSegments: normalizeLockedSegments(fallback.lockedSegments)
    })
  }
  return candidates.slice(0, MAX_WRITING_CANDIDATES)
}

export function buildWritingCandidateDiff(before, after) {
  const source = safeString(before)
  const target = safeString(after)
  let prefix = 0
  while (prefix < source.length && prefix < target.length && source[prefix] === target[prefix]) prefix += 1
  let suffix = 0
  while (suffix < source.length - prefix && suffix < target.length - prefix && source[source.length - 1 - suffix] === target[target.length - 1 - suffix]) suffix += 1
  const sourceMiddleEnd = source.length - suffix
  const targetMiddleEnd = target.length - suffix
  return {
    before: [{ type: 'context', text: source.slice(0, prefix) }, { type: 'remove', text: source.slice(prefix, sourceMiddleEnd) }, { type: 'context', text: source.slice(sourceMiddleEnd) }].filter((part) => part.text),
    after: [{ type: 'context', text: target.slice(0, prefix) }, { type: 'add', text: target.slice(prefix, targetMiddleEnd) }, { type: 'context', text: target.slice(targetMiddleEnd) }].filter((part) => part.text)
  }
}

function currentNodes(current) {
  if (Array.isArray(current?.nodes)) return current.nodes
  if (Array.isArray(current?.blocks)) return current.blocks.map((block) => ({
    ...block,
    nodeId: block.nodeId || block.blockId,
    nodeRevision: block.nodeRevision ?? block.blockRevision
  }))
  if (current?.nodes && typeof current.nodes === 'object') return Object.values(current.nodes)
  if (current?.blocks && typeof current.blocks === 'object') return Object.values(current.blocks)
  return []
}

function staleForPatch(patch, nodes) {
  const node = nodes.find((item) => safeString(item?.nodeId || item?.blockId) === patch.nodeId)
  const unitExists = nodes.some((item) => safeString(item?.unitId) === safeString(patch.unitId))
  if (!unitExists && patch.unitId) return 'unit-missing'
  if (node && patch.unitRevision != null && node.unitRevision != null && Number(patch.unitRevision) !== Number(node.unitRevision)) return 'unit-revision-changed'
  if (!node) return 'node-missing'
  if (patch.nodeRevision != null && node.nodeRevision != null && Number(patch.nodeRevision) !== Number(node.nodeRevision)) return 'node-revision-changed'
  if (patch.baseText != null && node.text != null && String(patch.baseText) !== String(node.text)) return 'target-changed'
  if (patch.lockedSegments?.length && !node.text) return 'locked-segment-changed'
  return ''
}

export function getWritingCandidateStaleReason(candidate, current = {}) {
  if (!candidate) return 'candidate-missing'
  if (candidate.chapterId && current.chapterId && candidate.chapterId !== current.chapterId) return 'chapter-changed'
  const nodes = currentNodes(current)
  if (Array.isArray(candidate.patches)) {
    for (const patch of candidate.patches) {
      const reason = staleForPatch(patch, nodes)
      if (reason) return reason
    }
    return ''
  }
  if (candidate.nodeId || candidate.blockId) {
    return staleForPatch({
      unitId: candidate.unitId,
      unitRevision: candidate.unitRevision,
      nodeId: candidate.nodeId || candidate.blockId,
      nodeRevision: candidate.nodeRevision ?? candidate.blockRevision,
      baseText: candidate.baseText
    }, nodes)
  }
  if (candidate.documentRevision != null && current.documentRevision != null && Number(candidate.documentRevision) !== Number(current.documentRevision)) return 'document-changed'
  return ''
}
