import { validateWritingReplacement } from './writingReplacementContract.js'

export const WRITING_CANDIDATE_SCHEMA_VERSION = 2
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
  return segments
    .map((segment) => {
      const text = safeString(segment?.text).trim()
      if (!text) return null
      return {
        text,
        start: Number.isFinite(Number(segment?.start)) ? Math.max(0, Math.floor(Number(segment.start))) : null,
        end: Number.isFinite(Number(segment?.end)) ? Math.max(0, Math.floor(Number(segment.end))) : null
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function isUnchangedWritingText(value, baseText) {
  const source = safeString(baseText).replace(/\r\n/g, '\n').trim()
  if (!source) return false
  return safeString(value).replace(/\r\n/g, '\n').trim() === source
}

function normalizeWritingPatch(raw, fallback = {}) {
  const blockId = safeString(raw?.blockId || fallback.blockId).trim()
  if (!blockId) return null
  const replacement = safeString(raw?.replacement ?? raw?.text ?? raw?.content).trim()
  if (!validateWritingReplacement(replacement).valid) return null
  const baseText = raw?.baseText != null ? safeString(raw.baseText) : safeString(fallback.baseText)
  if (!baseText.trim()) return null

  return {
    blockId,
    blockRevision: Number.isFinite(Number(raw?.blockRevision))
      ? Number(raw.blockRevision)
      : (Number.isFinite(Number(fallback.blockRevision)) ? Number(fallback.blockRevision) : null),
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
  const fallbackBlocks = Array.isArray(fallback.blocks) ? fallback.blocks : []
  const fallbackById = new Map(fallbackBlocks.map((block) => [safeString(block?.blockId), block]))
  const patches = source
    .slice(0, MAX_WRITING_CANDIDATE_PATCHES)
    .map((raw) => {
      const blockId = safeString(raw?.blockId).trim()
      return normalizeWritingPatch(raw, fallbackById.get(blockId) || {})
    })
    .filter(Boolean)

  if (patches.length !== source.length || new Set(patches.map((patch) => patch.blockId)).size !== patches.length) return []
  if (fallbackBlocks.length) {
    const expected = fallbackBlocks.map((block) => safeString(block?.blockId)).filter(Boolean)
    const actual = patches.map((patch) => patch.blockId)
    if (expected.length !== actual.length || expected.some((blockId, index) => blockId !== actual[index])) return []
  }
  return patches
}

function buildMultiBlockCandidate(raw, index, fallback) {
  const patches = normalizeWritingPatches(raw?.patches, fallback)
  if (!patches.length) return null
  if (patches.every((patch) => isUnchangedWritingText(patch.replacement, patch.baseText))) return null
  const text = patches.map((patch) => patch.replacement).join('\n')
  const baseText = patches.map((patch) => patch.baseText).join('\n')
  return {
    schemaVersion: WRITING_CANDIDATE_SCHEMA_VERSION,
    id: safeString(raw?.id) || `${safeString(fallback.resultId, 'writing-candidate')}-${index + 1}`,
    label: safeString(raw?.label || raw?.title) || `方案 ${index + 1}`,
    text,
    replacement: text,
    rationale: safeString(raw?.rationale || raw?.reason || raw?.summary),
    patches,
    baseText,
    targetRange: normalizeRange(raw?.targetRange || fallback.targetRange),
    blockId: null,
    blockRevision: null,
    chapterId: safeString(raw?.chapterId || fallback.chapterId) || null,
    documentRevision: Number.isFinite(Number(raw?.documentRevision))
      ? Number(raw.documentRevision)
      : (Number.isFinite(Number(fallback.documentRevision)) ? Number(fallback.documentRevision) : null),
    lockedSegments: normalizeLockedSegments(raw?.lockedSegments || fallback.lockedSegments)
  }
}

export function normalizeWritingCandidates(rawCandidates, fallback = {}) {
  const source = Array.isArray(rawCandidates) ? rawCandidates : []
  const candidates = []

  source.forEach((raw, index) => {
    if (Array.isArray(raw?.patches) || fallback.multiBlock) {
      const candidate = buildMultiBlockCandidate(raw, index, fallback)
      if (!candidate || candidates.some((item) => item.text === candidate.text)) return
      candidates.push(candidate)
      return
    }
    const text = safeString(raw?.replacement ?? raw?.text ?? raw?.content).trim()
    if (!validateWritingReplacement(text).valid) return
    if (isUnchangedWritingText(text, fallback.baseText)) return
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
      blockId: safeString(raw?.blockId || fallback.blockId) || null,
      blockRevision: Number.isFinite(Number(raw?.blockRevision))
        ? Number(raw.blockRevision)
        : (Number.isFinite(Number(fallback.blockRevision)) ? Number(fallback.blockRevision) : null),
      chapterId: safeString(raw?.chapterId || fallback.chapterId) || null,
      documentRevision: Number.isFinite(Number(raw?.documentRevision))
        ? Number(raw.documentRevision)
        : (Number.isFinite(Number(fallback.documentRevision)) ? Number(fallback.documentRevision) : null),
      lockedSegments: normalizeLockedSegments(raw?.lockedSegments || fallback.lockedSegments)
    })
  })

  if (!candidates.length && Array.isArray(fallback.patches)) {
    const candidate = buildMultiBlockCandidate({ patches: fallback.patches }, 0, fallback)
    if (candidate) candidates.push(candidate)
  }

  if (!candidates.length
    && fallback.text
    && validateWritingReplacement(fallback.text).valid
    && !isUnchangedWritingText(fallback.text, fallback.baseText)) {
    candidates.push({
      schemaVersion: WRITING_CANDIDATE_SCHEMA_VERSION,
      id: `${safeString(fallback.resultId, 'writing-candidate')}-1`,
      label: '模型方案',
      text: safeString(fallback.text).trim(),
      replacement: safeString(fallback.text).trim(),
      rationale: safeString(fallback.rationale),
      baseText: fallback.baseText || null,
      targetRange: normalizeRange(fallback.targetRange),
      blockId: safeString(fallback.blockId) || null,
      blockRevision: Number.isFinite(Number(fallback.blockRevision)) ? Number(fallback.blockRevision) : null,
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
  while (
    suffix < source.length - prefix
    && suffix < target.length - prefix
    && source[source.length - 1 - suffix] === target[target.length - 1 - suffix]
  ) suffix += 1

  const sourceMiddleEnd = source.length - suffix
  const targetMiddleEnd = target.length - suffix
  return {
    before: [
      { type: 'context', text: source.slice(0, prefix) },
      { type: 'remove', text: source.slice(prefix, sourceMiddleEnd) },
      { type: 'context', text: source.slice(sourceMiddleEnd) }
    ].filter((part) => part.text),
    after: [
      { type: 'context', text: target.slice(0, prefix) },
      { type: 'add', text: target.slice(prefix, targetMiddleEnd) },
      { type: 'context', text: target.slice(targetMiddleEnd) }
    ].filter((part) => part.text)
  }
}

export function getWritingCandidateStaleReason(candidate, current = {}) {
  if (!candidate) return 'candidate-missing'
  if (candidate.chapterId && current.chapterId && candidate.chapterId !== current.chapterId) return 'chapter-changed'
  if (candidate.documentRevision != null && current.documentRevision != null
    && Number(candidate.documentRevision) !== Number(current.documentRevision)) return 'document-changed'
  if (Array.isArray(candidate.patches)) {
    const currentBlocks = Array.isArray(current.blocks)
      ? current.blocks
      : current.blocks && typeof current.blocks === 'object'
        ? Object.values(current.blocks)
        : []
    const currentById = new Map(currentBlocks.map((block) => [safeString(block?.blockId), block]))
    for (const patch of candidate.patches) {
      const block = currentById.get(patch.blockId)
      if (!block) return 'block-missing'
      if (patch.blockRevision != null && block.blockRevision != null
        && Number(patch.blockRevision) !== Number(block.blockRevision)) return 'block-changed'
      if (patch.baseText != null && block.text != null
        && String(patch.baseText) !== String(block.text)) return 'target-changed'
    }
    return ''
  }
  if (candidate.blockId && current.blockId && candidate.blockId !== current.blockId) return 'block-changed'
  if (candidate.blockRevision != null && current.blockRevision != null
    && Number(candidate.blockRevision) !== Number(current.blockRevision)) return 'block-changed'
  if (candidate.baseText != null && current.text != null && String(candidate.baseText) !== String(current.text)) return 'target-changed'
  return ''
}
