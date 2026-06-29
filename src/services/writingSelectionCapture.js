/**
 * writingSelectionCapture — capture a textarea selection from Writing.vue as a
 * narrative asset, then route to Notes.vue for review.
 *
 * Why a dedicated service (and not a one-off in Writing.vue):
 *   - Keeps the two-step write (addNarrativeAsset + source enrichment) in one
 *     place so the schema lives next to the only caller.
 *   - Pure input/output makes it unit-testable without mounting Vue.
 *   - `createNarrativeAsset` (via `addNarrativeAsset`) strips unknown fields
 *     from `source` via `normalizeSource`, so we follow up with
 *     `updateNarrativeAsset` to inject chapterId / selectorOffset /
 *     selectorLength / selectorSnippet. `updateNarrativeAsset` preserves
 *     `source` as-is (no normalization), so this works without touching
 *     narrativeAssets.js.
 */

import { addNarrativeAsset, updateNarrativeAsset } from './narrativeAssets'

const MAX_SNIPPET = 240
const MAX_TITLE = 24
const DEFAULT_KIND = 'inspiration'
const DEFAULT_STATUS = 'inbox'

function cleanSnippet(text, max = MAX_SNIPPET) {
  const collapsed = String(text || '').replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed
}

function safeNonNegativeInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

/**
 * Build the `source` payload that gets stored on the asset. Kept as a pure
 * function so the shape is testable and W4 (Notes.vue reader) can rely on it.
 */
export function buildSelectionSource({ chapterId, offset, length, snippet } = {}) {
  const safeChapterId = String(chapterId || '').trim()
  const safeOffset = safeNonNegativeInt(offset) ?? 0
  const safeLength = Math.max(0, safeNonNegativeInt(length) ?? 0)
  return {
    type: 'chapter',
    id: safeChapterId,
    messageIds: [],
    chapterId: safeChapterId,
    selectorOffset: safeOffset,
    selectorLength: safeLength,
    selectorSnippet: cleanSnippet(snippet)
  }
}

/**
 * Validate inputs and (on success) write a new narrative asset whose `source`
 * captures the chapter selection metadata. Returns a result object that
 * distinguishes failure modes so the caller can show a useful status message.
 */
export function createAssetFromSelection(input = {}) {
  const chapterId = String(input.chapterId || '').trim()
  const content = String(input.content || '').trim()
  const offsetRaw = safeNonNegativeInt(input.offset)
  const lengthRaw = safeNonNegativeInt(input.length)

  if (!chapterId) {
    return { ok: false, reason: 'no-chapter', message: '缺少章节 ID,无法收为素材。' }
  }
  if (!content) {
    return { ok: false, reason: 'no-content', message: '选区内容为空,无法收为素材。' }
  }
  if (offsetRaw === null) {
    return { ok: false, reason: 'bad-offset', message: '选区偏移无效,无法收为素材。' }
  }
  if (lengthRaw === null || lengthRaw <= 0) {
    return { ok: false, reason: 'bad-length', message: '选区长度无效,无法收为素材。' }
  }

  const snippet = String(input.snippet || content)
  const kind = input.kind || DEFAULT_KIND
  const status = input.status || DEFAULT_STATUS
  const projectId = input.projectId ?? null

  try {
    const asset = addNarrativeAsset({
      title: cleanSnippet(snippet, MAX_TITLE) || '未命名素材',
      content,
      kind,
      status,
      projectId,
      source: { type: 'chapter', id: chapterId, messageIds: [] }
    })

    const enrichedSource = buildSelectionSource({
      chapterId,
      offset: offsetRaw,
      length: lengthRaw,
      snippet
    })
    const enriched = updateNarrativeAsset(asset.id, { source: enrichedSource })

    return {
      ok: true,
      assetId: enriched?.id || asset.id,
      asset: enriched || asset,
      source: enrichedSource
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'write-failed',
      message: error?.message || '写入素材失败'
    }
  }
}

/**
 * Parse the back-jump query that Notes.vue sends when the user clicks a source
 * chip. Returns `null` if the query is missing or malformed (caller should
 * silently ignore per the spec).
 */
export function parseSelectionBackJump(query = {}) {
  const chapterId = String(query?.chapterId || '').trim()
  const offset = safeNonNegativeInt(query?.selectorOffset)
  const length = safeNonNegativeInt(query?.selectorLength) ?? 0
  if (!chapterId || offset === null) return null
  return { chapterId, offset, length }
}

/**
 * Parse the insert-back query that Notes.vue sends when the user clicks
 * "把素材插回来源章节". Carries `chapterId` (target chapter) and `insertAssetId`
 * (asset to load via listNarrativeAssets). Returns `null` when either key is
 * missing or blank — caller should silently ignore and clear the query.
 */
export function parseInsertBackQuery(query = {}) {
  const chapterId = String(query?.chapterId || '').trim()
  const insertAssetId = String(query?.insertAssetId || '').trim()
  if (!chapterId || !insertAssetId) return null
  return { chapterId, insertAssetId }
}

/**
 * Resolve the character offset where an asset should be inserted into a
 * chapter. Prefers the asset's recorded `source.selectorOffset` (the spot the
 * user originally captured it from), then falls back to the end of the
 * chapter. Returns a clamped non-negative integer in `[0, chapterText.length]`.
 *
 * Public so the caller can preview the insertion point and report it back in
 * status messages without re-running the resolver.
 */
export function resolveInsertOffset({ chapterText, asset } = {}) {
  const text = String(chapterText || '')
  const max = text.length
  const sourceOffset = safeNonNegativeInt(asset?.source?.selectorOffset)
  if (sourceOffset !== null && sourceOffset <= max) {
    return sourceOffset
  }
  return max
}

/**
 * Pure string splice: insert `insertText` at `offset` in `content`. Returns
 * `{ text, insertStart, insertEnd }` where the new range covers exactly the
 * inserted text. Clamps `offset` to `[0, content.length]`.
 *
 * Kept pure (no Vue, no localStorage) so it is trivially testable.
 */
export function spliceTextAt(content, insertText, offset) {
  const text = String(content || '')
  const ins = String(insertText || '')
  const max = text.length
  const clamped = Math.max(0, Math.min(max, Math.floor(Number(offset) || 0)))
  return {
    text: text.slice(0, clamped) + ins + text.slice(clamped),
    insertStart: clamped,
    insertEnd: clamped + ins.length
  }
}