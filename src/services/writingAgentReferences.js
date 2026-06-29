// WA-D: writingAgentReferences (2026-06-29)
//
// Pure helper for sorting, summarizing, and budget-bounding the reference
// assets + selected inbox + chapter outline that flow into the writing
// agent's prompt. Replaces Writing.vue's getCopilotContext() which
// currently joins `outline + single asset` into one string with no
// budget control (a 5-asset inbox could blow past token limits).
//
// Design contract:
//   - Pure: takes plain object in, returns plain object out.
//   - Stable sort: ties preserve original input order (Array#sort is
//     stable in modern V8 / Chromium / Node).
//   - Token-ish budget: counts characters (CJK-friendly proxy) rather
//     than real tokens. worldbookContextBuilder already uses a real
//     estimateTokens() — this helper stays character-only so the two
//     budgets compose predictably (1 worldbook token ≈ 0.3 chars, see
//     worldbookContextBuilder.js).
//   - Defensive: missing fields → empty defaults, never throw.
//   - No new dependencies. Reuses narrativeAssets helpers
//     (getAssetKindLabel, getAssetSourceDetail) for label formatting.
//
// Used by:
//   - Writing.vue (next slice: replace buildCopilotAssetContext with
//     buildReferenceContext in getCopilotContext()).
//   - useCopilot.buildCopilotMessages() (new `references` parameter).
//   - WA-B writingAgentContext (consumer reads blocks for routing hints).
//
// Not used by:
//   - worldbookContextBuilder (separate concern, untouched).
//   - chapter outline builder (already pure, left alone).

import {
  ACTIVE_ASSET_STATUSES,
  getAssetKindLabel,
  getAssetSourceDetail
} from './narrativeAssets'

export const REFERENCE_SCHEMA_VERSION = 1

// Kind priority for sorting reference assets in the agent prompt.
// Lower number = higher priority. Tied to ASSET_KINDS but adds the two
// missing kinds (worldbook-draft, reference-image) with the lowest
// priority since they're either upstream of context or non-text.
export const REFERENCE_KIND_PRIORITY = Object.freeze({
  'draft-prose': 1,         // directly insertable prose — most useful for copilot
  'event': 2,               // plot drivers
  'character-fact': 3,      // character continuity
  'storyboard-seed': 4,     // scene cues
  'inspiration': 5,         // fragments
  'worldbook-draft': 6,     // upstream pipeline
  'reference-image': 7      // non-text — least useful in prose prompt
})

// Score weights — tuneable but the relative ordering is what callers
// care about. Higher total = more relevant for the current chapter.
export const REFERENCE_RANK_WEIGHTS = Object.freeze({
  chapterSource: 100,   // asset.source.chapterId === currentChapterId
  bookSource: 60,       // asset.projectId === currentBookId (chapter not matched)
  selected: 50,         // asset is in the inbox multi-selection
  statusAccepted: 30,   // status === 'accepted'
  statusInbox: 15,      // status === 'inbox'
  recencyPerDay: 5,     // +5 per day since updatedAt, max +25
  recencyCap: 25,
  kindPriorityMax: 22,  // 22 - kindPriorityIndex (1..7)
  kindPriorityUnit: 3
})

const DEFAULT_REFERENCE_BUDGET = Object.freeze({
  totalChars: 1500,     // combined cap across all blocks + outline
  perAssetChars: 360,   // cap per asset summary block
  outlineChars: 600     // reserved slot for chapter outline
})

function clampInt(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function safeStr(value, fallback = '') {
  if (value == null) return fallback
  return String(value)
}

function isActiveStatus(status) {
  return ACTIVE_ASSET_STATUSES.includes(status)
}

function clipText(text, limit) {
  const t = safeStr(text).replace(/\r\n/g, '\n').trim()
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

function daysSince(ts) {
  if (!ts) return 0
  const n = Number(ts)
  if (!Number.isFinite(n)) return 0
  const ms = Date.now() - n
  if (ms < 0) return 0
  return ms / (1000 * 60 * 60 * 24)
}

// Recency score: NEWER assets get a higher bonus, capped at recencyCap.
// 0 days old → recencyCap; recencyCap/recencyPerDay days old → 0.
// Older assets still receive 0 (the floor), so staleness doesn't push
// them DOWN the ranking — it just stops pushing them up.
function computeRecencyScore(updatedAt) {
  if (!updatedAt) return 0
  const elapsed = Math.floor(daysSince(updatedAt) * REFERENCE_RANK_WEIGHTS.recencyPerDay)
  return Math.max(0, REFERENCE_RANK_WEIGHTS.recencyCap - elapsed)
}

// ---------- ranking ----------

/**
 * Score one asset against the current chapter / book / selection scope.
 * Returns a stable numeric score + the components that fed it.
 * Higher score = more relevant for the current writing prompt.
 */
export function rankAssetForReference(asset = {}, scope = {}) {
  if (!asset || typeof asset !== 'object') {
    return { score: 0, components: {}, reasons: ['empty-asset'] }
  }
  const safeScope = (scope && typeof scope === 'object') ? scope : {}
  const components = {}
  const reasons = []

  const sourceChapterId = safeStr(asset?.source?.chapterId)
  const currentChapterId = safeStr(safeScope.currentChapterId)
  if (sourceChapterId && currentChapterId && sourceChapterId === currentChapterId) {
    components.chapterSource = REFERENCE_RANK_WEIGHTS.chapterSource
    reasons.push('source-chapter-match')
  } else if (currentChapterId && sourceChapterId) {
    // Source chapter exists but for a different chapter — small penalty
    // (-10) so chapter-bound assets win over cross-chapter ones.
    components.chapterSource = -10
    reasons.push('source-chapter-other')
  } else {
    const projectId = safeStr(asset.projectId)
    const currentBookId = safeStr(safeScope.currentBookId)
    if (projectId && currentBookId && projectId === currentBookId) {
      components.bookSource = REFERENCE_RANK_WEIGHTS.bookSource
      reasons.push('project-match')
    }
  }

  if (Array.isArray(safeScope.selectedInboxIds)
      && safeScope.selectedInboxIds.map(String).includes(safeStr(asset.id))) {
    components.selected = REFERENCE_RANK_WEIGHTS.selected
    reasons.push('user-selected')
  }

  const status = safeStr(asset.status)
  if (status === 'accepted') {
    components.statusAccepted = REFERENCE_RANK_WEIGHTS.statusAccepted
    reasons.push('status-accepted')
  } else if (status === 'inbox') {
    components.statusInbox = REFERENCE_RANK_WEIGHTS.statusInbox
    reasons.push('status-inbox')
  } else if (status === 'rejected' || status === 'archived') {
    // Stale — small negative bump, caller can still pick them up but
    // they lose to anything active.
    components.statusPenalty = -15
    reasons.push(`status-${status}`)
  }

  const recency = computeRecencyScore(asset.updatedAt)
  // Always set the recency component (even when 0) so callers can
  // rely on `components.recency` being a number, not undefined.
  components.recency = recency
  if (recency >= REFERENCE_RANK_WEIGHTS.recencyCap) reasons.push('recent-cap')

  const kindKey = safeStr(asset.kind)
  const kindIndex = REFERENCE_KIND_PRIORITY[kindKey]
  if (kindIndex != null) {
    components.kindPriority = REFERENCE_RANK_WEIGHTS.kindPriorityMax
      - (kindIndex - 1) * REFERENCE_RANK_WEIGHTS.kindPriorityUnit
    reasons.push(`kind-${kindKey}`)
  }

  let score = 0
  for (const value of Object.values(components)) score += value
  return { score, components, reasons }
}

/**
 * Stable-sort a list of assets by descending reference score. Ties
 * preserve the original array order. Missing assets are dropped.
 */
export function sortAssetsForReference(assets = [], scope = {}) {
  if (!Array.isArray(assets)) return []
  const ranked = assets
    .filter((asset) => asset && typeof asset === 'object')
    .map((asset, index) => ({
      asset,
      index,
      rank: rankAssetForReference(asset, scope)
    }))
  ranked.sort((a, b) => {
    if (b.rank.score !== a.rank.score) return b.rank.score - a.rank.score
    return a.index - b.index
  })
  return ranked.map((entry) => entry.asset)
}

// ---------- summary blocks ----------

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatTimestamp(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return ''
  try {
    const d = new Date(n)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  } catch {
    return ''
  }
}

/**
 * Render a single asset as a summary block suitable for the agent
 * prompt. Format (multi-line):
 *
 *   [N] 标题：索德
 *   类型：角色
 *   来源：章节 · c-1
 *   更新：2026-06-28
 *
 *   灰墙夜班头目，掌握钥匙来源。
 *
 * Missing fields degrade silently — the block still renders so the
 * downstream prompt doesn't lose the asset's content.
 */
export function buildAssetSummaryBlock(asset = null, options = {}) {
  if (!asset || typeof asset !== 'object') return null

  const {
    contentMaxChars = DEFAULT_REFERENCE_BUDGET.perAssetChars,
    index = null,
    includeSource = true,
    includeKind = true,
    includeTimestamp = true
  } = options

  const title = safeStr(asset.title) || '未命名素材'
  const kind = safeStr(asset.kind)
  // Always resolve the label via getAssetKindLabel so empty / unknown
  // kinds fall back to the generic '素材' label. The previous
  // `kind ? getAssetKindLabel(kind) : ''` produced `kindLabel: ''` and
  // then `'' || null` collapsed to null in the return — losing the
  // human-readable default that callers rely on.
  const kindLabel = getAssetKindLabel(kind)
  const sourceDetail = asset.source ? safeStr(getAssetSourceDetail(asset.source)) : ''
  const updatedAt = Number.isFinite(asset.updatedAt) ? formatTimestamp(asset.updatedAt) : ''

  const content = safeStr(asset.content)
  const preview = clipText(content, contentMaxChars)

  const headerLines = []
  const prefix = index != null ? `[${index + 1}] ` : ''
  headerLines.push(`${prefix}标题：${title}`)
  if (includeKind && kindLabel) headerLines.push(`类型：${kindLabel}`)
  if (includeSource && sourceDetail) headerLines.push(`来源：${sourceDetail}`)
  if (includeTimestamp && updatedAt) headerLines.push(`更新：${updatedAt}`)

  const lines = [headerLines.join('\n')]
  if (preview.text) {
    lines.push('')
    lines.push(preview.text)
  }

  return {
    id: safeStr(asset.id) || null,
    kind: kind || null,
    kindLabel,
    title,
    sourceDetail: sourceDetail || null,
    updatedAt: updatedAt || null,
    contentPreview: preview.text,
    contentLength: content.length,
    contentTruncated: preview.truncated,
    blockText: lines.join('\n')
  }
}

// ---------- composition ----------

function dedupeById(assets) {
  const seen = new Set()
  const out = []
  for (const asset of assets) {
    const id = safeStr(asset?.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(asset)
  }
  return out
}

/**
 * Compose the full reference context block from one or many sources.
 *
 * Inputs:
 *   - referenceAsset: a single asset the user explicitly pinned as the
 *     "续写参考" (legacy single-asset path). Always wins the highest
 *     rank slot, even if it scores lower than a selected inbox asset.
 *   - inboxAssets + selectedInboxIds: the full inbox + the user's
 *     multi-selection. Selected entries are boosted (+50 rank).
 *   - outlineContext: a pre-formatted outline string (output of
 *     buildChapterOutlineContext). Kept in its own reserved slot so
 *     the chapter outline doesn't fight assets for the same budget.
 *   - currentChapterId / currentBookId: scope for source-affinity
 *     scoring. Missing → treated as "no chapter / no book scope".
 *
 * Budget enforcement:
 *   - Outline keeps its reserved slot (default 600 chars).
 *   - Remaining budget goes to ranked asset summary blocks; lowest-
 *     scored assets drop first when the budget runs out.
 *   - The pinned referenceAsset is always included if it has content,
 *     even if it would push the total over budget — callers can detect
 *     `budgetReport.overflowed` and trim elsewhere.
 *
 * Output:
 *   - referenceAsset: the pinned asset as a summary block (or null).
 *   - inboxBlocks: selected inbox entries as summary blocks.
 *   - outlineBlock: the chapter outline text (clipped to its slot).
 *   - contextText: the final prompt block (ordered: outline → pinned →
 *     inbox), separated by blank lines.
 *   - blocks: flat array of all blocks, in prompt order.
 *   - budgetReport: { totalChars, usedChars, remainingChars, overflowed,
 *     assetBlocksIncluded, assetBlocksDropped }.
 */
export function buildReferenceContext(input = {}) {
  const safeInput = (input && typeof input === 'object') ? input : {}
  const {
    referenceAsset = null,
    inboxAssets = [],
    selectedInboxIds = [],
    outlineContext = '',
    currentChapterId = null,
    currentBookId = null,
    budget = {}
  } = safeInput

  const cfg = { ...DEFAULT_REFERENCE_BUDGET, ...budget }
  const scope = {
    currentChapterId: safeStr(currentChapterId) || null,
    currentBookId: safeStr(currentBookId) || null,
    selectedInboxIds: Array.isArray(selectedInboxIds) ? selectedInboxIds : []
  }

  const budgetReport = {
    totalChars: clampInt(cfg.totalChars, 1500, 200),
    usedChars: 0,
    remainingChars: 0,
    overflowed: false,
    assetBlocksIncluded: 0,
    assetBlocksDropped: 0
  }

  // Outline gets its own reserved slot — clipped independently.
  // Caller passes the pre-formatted text (e.g. output of
  // buildChapterOutlineContext which already includes 【章节纲要】).
  // buildReferenceContext does NOT add its own prefix to avoid
  // double-bracketing.
  const outlineClip = clipText(safeStr(outlineContext), cfg.outlineChars)
  const outlineBlock = {
    kind: 'outline',
    title: '章节纲要',
    blockText: outlineClip.text,
    truncated: outlineClip.truncated
  }
  budgetReport.usedChars += outlineBlock.blockText.length
  budgetReport.remainingChars = budgetReport.totalChars - budgetReport.usedChars

  // Build the candidate pool: pinned asset + deduped inbox entries.
  // Inbox entries that match the pinned asset id collapse to the
  // pinned one (so we don't render the same asset twice).
  const inbox = Array.isArray(inboxAssets) ? inboxAssets : []
  const pinnedId = safeStr(referenceAsset?.id)
  const inboxDeduped = dedupeById(inbox).filter((a) => safeStr(a.id) !== pinnedId)
  const rankedInbox = sortAssetsForReference(inboxDeduped, scope)

  // Pin slot — always kept, may overflow budget.
  const pinnedBlock = referenceAsset ? buildAssetSummaryBlock(referenceAsset, {
    contentMaxChars: cfg.perAssetChars,
    index: 0,
    includeSource: true,
    includeKind: true,
    includeTimestamp: true
  }) : null
  const pinnedLength = pinnedBlock?.blockText.length || 0
  budgetReport.usedChars += pinnedLength

  // Asset slot — pin first, then ranked inbox until budget runs out.
  const candidateBlocks = []
  const includedBlocks = []
  const droppedAssets = []

  if (pinnedBlock) {
    candidateBlocks.push({ asset: referenceAsset, block: pinnedBlock })
  }

  let rankIndex = 0
  for (const asset of rankedInbox) {
    const block = buildAssetSummaryBlock(asset, {
      contentMaxChars: cfg.perAssetChars,
      index: candidateBlocks.length,
      includeSource: true,
      includeKind: true,
      includeTimestamp: true
    })
    if (!block) continue
    candidateBlocks.push({ asset, block })
    rankIndex += 1
  }

  const remaining = Math.max(0, budgetReport.remainingChars)
  for (const { asset, block } of candidateBlocks) {
    const blockLen = block.blockText.length
    const isPinned = pinnedBlock && asset === referenceAsset
    if (isPinned) {
      // Pinned always wins — even if it overflows the budget.
      includedBlocks.push({ asset, block })
      budgetReport.assetBlocksIncluded += 1
      continue
    }
    if (budgetReport.usedChars + blockLen > budgetReport.totalChars) {
      droppedAssets.push(asset)
      budgetReport.assetBlocksDropped += 1
      continue
    }
    includedBlocks.push({ asset, block })
    budgetReport.usedChars += blockLen
    budgetReport.assetBlocksIncluded += 1
  }

  // Compose prompt-ordered text: outline → pinned → selected inbox.
  // Empty outline / empty pinned / empty inbox just skip their slot.
  const orderedBlocks = []
  if (outlineBlock.blockText) orderedBlocks.push({ kind: 'outline', blockText: outlineBlock.blockText })

  const pinnedIncluded = includedBlocks.find((entry) => entry.asset === referenceAsset)
  if (pinnedIncluded) {
    orderedBlocks.push({
      kind: 'reference-asset',
      blockText: `【参考素材】\n${pinnedIncluded.block.blockText}`
    })
  }

  const inboxIncluded = includedBlocks.filter((entry) => entry.asset !== referenceAsset)
  if (inboxIncluded.length) {
    const inboxText = inboxIncluded.map((entry) => entry.block.blockText).join('\n\n')
    orderedBlocks.push({ kind: 'inbox-summary', blockText: `【已选素材】\n${inboxText}` })
  }

  const contextText = orderedBlocks.map((b) => b.blockText).filter(Boolean).join('\n\n')

  // Recompute budget from the final contextText so usedChars reflects
  // the actual rendered length (including the 【参考素材】 / 【已选素材】
  // wrapper prefixes and the \n\n separators — these aren't tracked
  // during the greedy fill above).
  budgetReport.usedChars = contextText.length
  budgetReport.remainingChars = budgetReport.totalChars - budgetReport.usedChars
  budgetReport.overflowed = budgetReport.usedChars > budgetReport.totalChars

  return {
    schemaVersion: REFERENCE_SCHEMA_VERSION,
    referenceAsset: pinnedIncluded ? pinnedIncluded.block : null,
    inboxBlocks: inboxIncluded.map((entry) => entry.block),
    outlineBlock,
    droppedAssets: droppedAssets.map((a) => safeStr(a?.id)).filter(Boolean),
    blocks: orderedBlocks,
    contextText,
    budgetReport
  }
}