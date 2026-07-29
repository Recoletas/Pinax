import { validateWritingReplacement } from '../../../shared/writingReplacementContract.js'

function normalizeRange(range, length) {
  const start = Number(range?.start)
  const end = Number(range?.end)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const normalized = {
    start: Math.floor(Math.min(start, end)),
    end: Math.floor(Math.max(start, end))
  }
  if (normalized.start < 0 || normalized.end > length) return null
  return normalized
}

function normalizePatch(action, content) {
  if (!action || !['text-patch', 'replace_range'].includes(action.type)) {
    return { ok: false, reason: 'unsupported-action' }
  }
  const range = normalizeRange(action.range || action.targetRange, content.length)
  if (!range) return { ok: false, reason: 'invalid-range' }
  const replacement = String(action.content ?? action.text ?? action.replacement ?? '')
  if (!replacement) return { ok: false, reason: 'empty-replacement' }
  const validation = validateWritingReplacement(replacement)
  if (!validation.valid) return { ok: false, reason: 'invalid-replacement' }
  const baseText = action.baseText == null ? null : String(action.baseText)
  if (baseText != null && content.slice(range.start, range.end) !== baseText) {
    return { ok: false, reason: 'stale-base-text' }
  }
  return { ok: true, range, replacement, baseText }
}

export function buildTextPatchPreview(content, action) {
  const source = String(content || '')
  const patch = normalizePatch(action, source)
  if (!patch.ok) return patch
  return {
    ok: true,
    before: source.slice(patch.range.start, patch.range.end),
    after: patch.replacement,
    range: patch.range
  }
}

export function applyWritingAgentTransaction(content, actions, metadata = {}) {
  const before = String(content || '')
  const list = Array.isArray(actions) ? actions : []
  if (!list.length) return { ok: false, reason: 'no-actions' }

  const patches = []
  for (let index = 0; index < list.length; index += 1) {
    const patch = normalizePatch(list[index], before)
    if (!patch.ok) return { ok: false, reason: patch.reason, actionIndex: index }
    patches.push({ ...patch, actionIndex: index })
  }

  const ordered = patches.slice().sort((a, b) => b.range.start - a.range.start)
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].range.start < ordered[index].range.end) {
      return { ok: false, reason: 'overlapping-ranges' }
    }
  }

  let after = before
  for (const patch of ordered) {
    after = after.slice(0, patch.range.start)
      + patch.replacement
      + after.slice(patch.range.end)
  }

  const finalPatch = patches[patches.length - 1]
  const cursorPos = finalPatch.range.start + finalPatch.replacement.length
  return {
    ok: true,
    content: after,
    cursorPos,
    receipt: {
      type: 'writing-agent-transaction',
      resultId: metadata.resultId || null,
      chapterId: metadata.chapterId || null,
      before,
      after,
      cursorBefore: Number.isFinite(metadata.cursorBefore) ? metadata.cursorBefore : 0,
      cursorAfter: cursorPos,
      appliedAt: Date.now()
    }
  }
}

export function undoWritingAgentTransaction(content, receipt, chapterId = null) {
  if (!receipt || receipt.type !== 'writing-agent-transaction') {
    return { ok: false, reason: 'invalid-receipt' }
  }
  if (chapterId != null && receipt.chapterId != null && chapterId !== receipt.chapterId) {
    return { ok: false, reason: 'chapter-changed' }
  }
  if (String(content || '') !== receipt.after) {
    return { ok: false, reason: 'revision-changed' }
  }
  return {
    ok: true,
    content: receipt.before,
    cursorPos: receipt.cursorBefore
  }
}
