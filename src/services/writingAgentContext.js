// WA-B: writingAgentContext (2026-06-29)
//
// Pure helper for the Writing page's advisor / agent context payload.
// Writing.vue currently spreads ~10 context fields inline inside
// collectWritingContext() + buildAdvisorActionContext() (defensive reads,
// paragraph / cursor window snapshots, chapter outline, reference asset,
// inbox selection). This module centralizes that into one pure builder
// that returns a stable, snapshot-safe JSON envelope, plus a small
// taskType catalog so the agent panel can route by intent instead of
// dumping every request under `advisor.review.chapter`.
//
// Design contract:
//   - Pure: takes all state in as a plain object, returns plain object.
//     No Vue refs, no async, no store mutation, no DOM access.
//   - Stable JSON: keys in fixed order, no `undefined` values (use `null`
//     for missing scalars), no NaN/Infinity leaks (clamped to integers).
//   - Defensive: every input field is optional; missing sources return
//     empty defaults (`''`, `[]`, `null`, `0`), never throw.
//   - No new dependencies. Uses existing chapter-outline + setting-panel
//     helpers for snapshot formatting, but only when input has data.
//   - Backward compatible: useAdvisor() and the existing 5 quick actions
//     (selection / paragraph / thread / chapter / continue) keep working
//     untouched. New taskTypes are additive — Writing.vue can adopt them
//     in a follow-up slice without rewriting askAdvisor flow.
//
// Used by:
//   - Writing.vue (next slice: replace inline collectWritingContext with
//     this helper, swap advisorQuickActions to getWritingQuickActions()).
//   - useAdvisor tests (sanity-check taskType routing via getWritingQuickActions).
//
// Not used by:
//   - Experience.vue, GamePanel.vue (independent advisor paths).
//   - Storyboard / chapter-outline pure builders (already pure, left alone).

const DEFAULT_CONTEXT_LIMITS = Object.freeze({
  paragraphMax: 2000,
  cursorBefore: 520,
  cursorAfter: 240,
  outlineMax: 1600,
  worldbookSummaryMax: 1200,
  referenceAssetMax: 1200,
  inboxSummaryMax: 800,
  inboxItemPreview: 240,
  matchedEntryPreview: 240
})

export const WRITING_AGENT_CONTEXT_SCHEMA_VERSION = 1

export const WRITING_TASK_TYPES = Object.freeze({
  FIX_SELECTION: 'writing.fix.selection',
  FIX_PARAGRAPH: 'writing.fix.paragraph',
  CONTINUE_LIGHT: 'writing.continue.light',
  CLOSE_THREAD: 'writing.close.thread',
  CHAPTER_HEALTH: 'writing.chapter.health',
  GENERATE_FROM_ASSET: 'writing.generate.from-asset',
  EXTRACT_TO_ASSET: 'writing.extract.to-asset'
})

// ---------- internal helpers ----------

function safeStr(value, fallback = '') {
  if (value == null) return fallback
  return String(value)
}

function clampInt(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function clipText(text, limit) {
  const t = safeStr(text).replace(/\r\n/g, '\n')
  if (!limit || t.length <= limit) return { text: t, truncated: false }
  const clipped = t.slice(0, limit)
  const cutAt = Math.max(
    clipped.lastIndexOf('\n\n'),
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？'),
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('.\n')
  )
  const finalText = cutAt > Math.floor(limit * 0.55)
    ? clipped.slice(0, cutAt + 1).trimEnd()
    : clipped.trimEnd()
  return { text: finalText, truncated: true }
}

function buildScope(input) {
  const book = input.book || null
  const chapter = input.chapter || null
  // Word count prefers chapter.wordCount (caller-computed) but falls
  // back to input.wordCount for callers that pass raw counters.
  const wordCountRaw = chapter?.wordCount ?? input.wordCount ?? 0
  return {
    bookId: safeStr(book?.id) || null,
    bookTitle: safeStr(book?.title) || null,
    chapterId: safeStr(chapter?.id) || null,
    chapterTitle: safeStr(chapter?.title) || null,
    wordCount: clampInt(wordCountRaw, 0, 0),
    totalBooks: clampInt(input.totalBooks, 0, 0),
    totalChapters: clampInt(input.totalChapters, 0, 0)
  }
}

function buildSelection(input) {
  const sel = input.selection
  if (!sel || typeof sel !== 'object') {
    return {
      hasSelection: false,
      start: null,
      end: null,
      text: '',
      length: 0
    }
  }
  const start = clampInt(sel.start, 0, 0)
  const end = clampInt(sel.end, start, start)
  const text = safeStr(sel.text)
  return {
    hasSelection: end > start || Boolean(text.trim()),
    start: end > start ? start : null,
    end: end > start ? end : null,
    text,
    length: text.length
  }
}

function buildParagraph(input) {
  const para = input.paragraph
  if (!para || typeof para !== 'object') {
    return {
      hasParagraph: false,
      start: null,
      end: null,
      text: '',
      rawText: '',
      length: 0
    }
  }
  const text = safeStr(para.text)
  return {
    hasParagraph: Boolean(text.trim()),
    start: Number.isFinite(para.start) ? para.start : null,
    end: Number.isFinite(para.end) ? para.end : null,
    text,
    rawText: safeStr(para.rawText),
    length: text.length
  }
}

function buildCursor(input, limits) {
  const content = safeStr(input.editorContent)
  // cursorPosition wins over cursor, then selection.end, then 0.
  const fallback = clampInt(
    input.cursorPosition ?? input.cursor ?? input.selection?.end ?? 0,
    0, 0, content.length
  )
  const pos = clampInt(input.cursorPosition, fallback, 0, content.length)

  const beforeStart = Math.max(0, pos - limits.cursorBefore)
  const beforeRaw = content.slice(beforeStart, pos)
  const afterEnd = Math.min(content.length, pos + limits.cursorAfter)
  const afterRaw = content.slice(pos, afterEnd)

  return {
    position: pos,
    beforeStart,
    before: beforeRaw,
    afterEnd,
    after: afterRaw,
    beforeTruncated: beforeStart > 0,
    afterTruncated: afterEnd < content.length
  }
}

function buildOutline(input, limits) {
  const items = Array.isArray(input.outlineItems) ? input.outlineItems : []
  const normalizedItems = items.map((item) => ({
    id: safeStr(item?.id) || null,
    assetId: safeStr(item?.assetId) || null,
    assetKind: safeStr(item?.assetKind) || null,
    title: safeStr(item?.title),
    content: safeStr(item?.content),
    schemaVersion: Number.isFinite(item?.schemaVersion) ? item.schemaVersion : null,
    sourceType: safeStr(item?.source?.type) || null
  }))

  const body = normalizedItems
    .map((item, index) => `${index + 1}. ${item.title}（${item.assetKind || '素材'}）\n${item.content}`)
    .join('\n\n')
  const clipped = clipText(body, limits.outlineMax)
  return {
    count: normalizedItems.length,
    items: normalizedItems,
    contextText: clipped.text ? `【章节纲要】\n${clipped.text}` : '',
    contextTextTruncated: clipped.truncated
  }
}

function buildReferenceAsset(input, limits) {
  const asset = input.referenceAsset
  if (!asset || typeof asset !== 'object') return null
  const content = safeStr(asset.content)
  const kind = safeStr(asset.kind)
  const kindLabel = safeStr(asset.kindLabel) || (kind || null)
  const sourceType = safeStr(asset?.source?.type) || null
  const preview = clipText(content, limits.referenceAssetMax)

  const parts = []
  if (asset.title) parts.push(`标题：${asset.title}`)
  if (kindLabel) parts.push(`类型：${kindLabel}`)
  if (sourceType) parts.push(`来源：${sourceType}`)
  parts.push('')
  parts.push(preview.text)

  return {
    available: Boolean(content.trim()),
    id: safeStr(asset.id) || null,
    kind: kind || null,
    kindLabel,
    title: safeStr(asset.title) || null,
    sourceType,
    contentPreview: preview.text,
    contentLength: content.length,
    contentTruncated: preview.truncated,
    contextText: parts.filter(Boolean).join('\n')
  }
}

function buildInbox(input, limits) {
  const assets = Array.isArray(input.inboxAssets) ? input.inboxAssets : []
  const selectedIds = Array.isArray(input.selectedInboxIds)
    ? input.selectedInboxIds.map((id) => safeStr(id)).filter(Boolean)
    : []
  const selectedSet = new Set(selectedIds)
  const selectedAssets = assets.filter((a) => selectedSet.has(safeStr(a?.id)))

  const summaryItems = selectedAssets.map((asset) => {
    const content = safeStr(asset?.content)
    const normalized = content.replace(/\s+/g, ' ').trim()
    const preview = clipText(normalized, limits.inboxItemPreview)
    return {
      id: safeStr(asset?.id) || null,
      kind: safeStr(asset?.kind) || null,
      kindLabel: safeStr(asset?.kindLabel) || null,
      title: safeStr(asset?.title) || null,
      contentPreview: preview.text,
      contentLength: content.length,
      contentTruncated: preview.truncated
    }
  })

  const body = summaryItems.map((item, index) => {
    const head = `${index + 1}. ${item.kindLabel || item.kind || '素材'} · ${item.title || '未命名'}`
    return item.contentPreview ? `${head}\n${item.contentPreview}` : head
  }).join('\n\n')
  const clipped = clipText(body, limits.inboxSummaryMax)

  return {
    total: assets.length,
    selectedCount: selectedIds.length,
    selectedIds,
    selectedSummary: summaryItems,
    contextText: clipped.text ? `【已选素材】\n${clipped.text}` : '',
    contextTextTruncated: clipped.truncated
  }
}

function buildWorldbook(input, limits) {
  const wb = input.worldbook
  if (!wb || typeof wb !== 'object') {
    return {
      available: false,
      id: null,
      name: null,
      writingStyle: '',
      forbidden: '',
      examples: '',
      structuredSummary: '',
      matchedEntryCount: 0,
      matchedEntries: [],
      contextText: ''
    }
  }
  const structuredSummary = safeStr(input.worldbookStructuredSummary)
  const matched = Array.isArray(input.matchedEntries) ? input.matchedEntries : []
  const matchedItems = matched.map((entry) => {
    const content = safeStr(entry?.content)
    const preview = clipText(content, limits.matchedEntryPreview)
    return {
      id: safeStr(entry?.id) || null,
      title: safeStr(entry?.title),
      keywordCount: Array.isArray(entry?.keywords) ? entry.keywords.length : 0,
      score: Number.isFinite(entry?.score) ? entry.score : null,
      contentPreview: preview.text,
      contentLength: content.length,
      contentTruncated: preview.truncated
    }
  })

  const sections = []
  if (wb.writingStyle) sections.push(`【世界书文风】\n${wb.writingStyle}`)
  if (wb.forbidden) sections.push(`【世界书禁忌】\n${wb.forbidden}`)
  if (structuredSummary) sections.push(`【结构化设定摘要】\n${structuredSummary}`)
  if (matchedItems.length) {
    const matchedBody = matchedItems.map((item, index) => {
      const scoreTag = item.score != null ? `（score=${item.score}）` : ''
      return `${index + 1}. ${item.title}${scoreTag}\n${item.contentPreview}`
    }).join('\n\n')
    sections.push(`【命中条目】\n${matchedBody}`)
  }
  const contextText = clipText(sections.join('\n\n'), limits.worldbookSummaryMax).text

  return {
    available: true,
    id: safeStr(wb.id) || null,
    name: safeStr(wb.name) || null,
    writingStyle: safeStr(wb.writingStyle),
    forbidden: safeStr(wb.forbidden),
    examples: safeStr(wb.examples),
    structuredSummary,
    matchedEntryCount: matchedItems.length,
    matchedEntries: matchedItems,
    contextText
  }
}

function buildWritingConstraints(input) {
  const cs = (input.writingConstraints && typeof input.writingConstraints === 'object')
    ? input.writingConstraints
    : {}
  const wb = (input.worldbook && typeof input.worldbook === 'object')
    ? input.worldbook
    : {}
  return {
    style: safeStr(cs.style) || null,
    perspective: safeStr(cs.perspective) || null,
    tone: safeStr(cs.tone) || null,
    taboos: safeStr(cs.taboos) || null,
    consistency: safeStr(cs.consistency) || null,
    references: safeStr(cs.references) || null,
    worldbookWritingStyle: safeStr(wb.writingStyle) || null,
    worldbookForbidden: safeStr(wb.forbidden) || null
  }
}

function buildRouting(context) {
  return {
    canFixSelection: context.selection.hasSelection,
    canFixParagraph: context.paragraph.hasParagraph,
    canContinueLight: Boolean(context.scope.chapterId),
    canCloseThread: Boolean(context.scope.chapterId),
    canChapterHealth: Boolean(context.scope.chapterId),
    canGenerateFromAsset: Boolean(context.referenceAsset?.available),
    canExtractToAsset: context.paragraph.hasParagraph || context.selection.hasSelection
  }
}

// ---------- public API ----------

/**
 * Build a stable, JSON-safe envelope describing the Writing page's
 * current editing context. All inputs are optional; missing sources
 * fall back to empty defaults (empty strings, empty arrays, null).
 *
 * The envelope is a plain object — safe to JSON.stringify, serialize to
 * localStorage, or hand to a remote advisor service. The order of keys
 * is fixed so two calls with the same input produce equivalent JSON
 * (within generatedAt / clock differences).
 *
 * @param {object} input State bag. Recognized keys:
 *   - book, chapter: { id, title, wordCount? }
 *   - wordCount, totalBooks, totalChapters: scalar overrides
 *   - editorContent: full chapter markdown (string)
 *   - selection: { start, end, text }
 *   - paragraph: { start, end, text, rawText }
 *   - cursor / cursorPosition: integer
 *   - outlineItems: array of chapter outline items
 *   - referenceAsset: { id, kind, kindLabel?, title, content, source }
 *   - inboxAssets, selectedInboxIds
 *   - worldbook: { id, name, writingStyle, forbidden, examples }
 *   - worldbookStructuredSummary: pre-summarized structured settings
 *   - matchedEntries: array of worldbook entries
 *   - writingConstraints: { style, perspective, tone, taboos, consistency, references }
 * @param {object} [options]
 * @param {object} [options.contextLimits] Override default clip limits.
 * @param {string} [options.now] Override the generatedAt timestamp
 *   (ISO 8601 string). Tests pass a fixed value to make assertions
 *   deterministic; production callers omit it.
 * @returns {object} Stable JSON envelope.
 */
export function buildWritingAgentContext(input = {}, options = {}) {
  const limits = { ...DEFAULT_CONTEXT_LIMITS, ...(options.contextLimits || {}) }

  const scope = buildScope(input)
  const selection = buildSelection(input)
  const paragraph = buildParagraph(input)
  const cursor = buildCursor(input, limits)
  const outline = buildOutline(input, limits)
  const referenceAsset = buildReferenceAsset(input, limits)
  const inbox = buildInbox(input, limits)
  const worldbook = buildWorldbook(input, limits)
  const writingConstraints = buildWritingConstraints(input)

  const partial = {
    schemaVersion: WRITING_AGENT_CONTEXT_SCHEMA_VERSION,
    generatedAt: options.now || new Date().toISOString(),
    scope,
    selection,
    paragraph,
    cursor,
    outline,
    referenceAsset,
    inbox,
    worldbook,
    writingConstraints
  }
  const routing = buildRouting(partial)

  return {
    ...partial,
    routing,
    taskCatalog: { ...WRITING_TASK_TYPES }
  }
}

/**
 * Build the 7-task quick-action catalog for the advisor panel.
 *
 * Each action has an explicit taskType from WRITING_TASK_TYPES, a scope
 * hint (for legacy buildAdvisorActionTarget compatibility), and a
 * disabled flag based on the current context state. Writing.vue's
 * advisor panel can render this list directly; the legacy inline
 * `advisorQuickActions` computed can be replaced with a call to this
 * function in a follow-up slice.
 *
 * The 5 existing actions (FIX_SELECTION / FIX_PARAGRAPH / CONTINUE_LIGHT
 * / CLOSE_THREAD / CHAPTER_HEALTH) keep the same scope strings the
 * existing buildAdvisorActionTarget() already knows about
 * (selection / paragraph / continue / thread / chapter) — adding
 * taskType does not break the legacy target resolver.
 *
 * The 2 new actions (GENERATE_FROM_ASSET / EXTRACT_TO_ASSET) introduce
 * scope strings (`reference-asset`, `paragraph-or-selection`) that the
 * legacy resolver does not yet know about. Writing.vue should handle
 * these as no-op / informational until Window A ships the schema.
 *
 * @param {object} [flags] Current context availability flags.
 * @param {boolean} [flags.hasSelection]
 * @param {boolean} [flags.hasParagraph]
 * @param {boolean} [flags.hasReferenceAsset]
 * @param {boolean} [flags.hasSelectedInboxAssets]
 * @returns {Array<{label:string,question:string,taskType:string,scope:string,disabled:boolean}>}
 */
export function getWritingQuickActions(flags = {}) {
  const hasSelection = Boolean(flags.hasSelection)
  const hasParagraph = Boolean(flags.hasParagraph)
  const hasReferenceAsset = Boolean(flags.hasReferenceAsset)

  return [
    {
      label: '修正选中内容',
      question: '请修正我选中的内容，尽量保持原意和人物语气，不要扩写太多。',
      taskType: WRITING_TASK_TYPES.FIX_SELECTION,
      scope: 'selection',
      disabled: !hasSelection
    },
    {
      label: '修正当前段落',
      question: '请修正当前段落，重点处理语病、重复、节奏和衔接。',
      taskType: WRITING_TASK_TYPES.FIX_PARAGRAPH,
      scope: 'paragraph',
      disabled: !hasParagraph
    },
    {
      label: '轻续一句',
      question: '请给出一句轻量续写建议，保持当前语气，尽量可直接接在光标后。',
      taskType: WRITING_TASK_TYPES.CONTINUE_LIGHT,
      scope: 'continue',
      disabled: false
    },
    {
      label: '收束当前线索',
      question: '请帮我收束当前线索，给出更自然的收线建议，优先考虑当前段落和上下文。',
      taskType: WRITING_TASK_TYPES.CLOSE_THREAD,
      scope: 'thread',
      disabled: false
    },
    {
      label: '章节体检',
      question: '请对当前章节做一次简洁体检，指出节奏、人物和结构的主要问题。',
      taskType: WRITING_TASK_TYPES.CHAPTER_HEALTH,
      scope: 'chapter',
      disabled: false
    },
    {
      label: '从素材生成下一段',
      question: '请根据当前参考素材生成下一段文字，保持当前语气、人物和当前世界书设定。',
      taskType: WRITING_TASK_TYPES.GENERATE_FROM_ASSET,
      scope: 'reference-asset',
      disabled: !hasReferenceAsset
    },
    {
      label: '抽取成素材/纲要建议',
      question: '请把当前段落（无段落则用选中内容）抽取为可复用的素材或章节纲要条目，给出建议。',
      taskType: WRITING_TASK_TYPES.EXTRACT_TO_ASSET,
      scope: 'paragraph-or-selection',
      disabled: !hasParagraph && !hasSelection
    }
  ]
}