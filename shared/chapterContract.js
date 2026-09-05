/**
 * 章节结构合同：来源正文的章节清单、检测依据与置信度。
 *
 * SourceArtifact.chapters[] 由 chapterDetector 产出，EPUB 路径使用 'opff'
 * 依据（spine 文档边界），TXT/MD/PDF/DOCX 使用 'regex'。'manual' / 'toc'
 * 为后续用户显式修正与目录文件解析预留。
 */

export const CHAPTER_DETECTION_BASIS = Object.freeze(['regex', 'manual', 'opff', 'toc'])
export const CHAPTER_CONFIDENCES = Object.freeze(['high', 'medium', 'low'])

export const CHAPTER_CONTRACT_LIMITS = Object.freeze({
  maxChapters: 4096,
  maxTitleChars: 160,
  maxWarnings: 16
})

function asText(value) {
  return String(value ?? '').trim()
}

export function normalizeChapterConfidence(value) {
  return CHAPTER_CONFIDENCES.includes(value) ? value : 'low'
}

export function normalizeDetectionBasis(value, fallback = 'regex') {
  const basis = asText(value)
  return CHAPTER_DETECTION_BASIS.includes(basis) ? basis : fallback
}

/**
 * 归一单个章节记录。chapterId 由调用方按 5 层 ID 体系注入
 * （`${contentHashSha256}:chapter:${ordinal}`），缺失时回退为 ordinal 基础 id。
 */
export function normalizeChapter(input = {}, index = 0) {
  const ordinalRaw = Number(input.ordinal)
  const ordinal = Number.isFinite(ordinalRaw) && ordinalRaw >= 1
    ? Math.floor(ordinalRaw)
    : index + 1
  const startOffset = Math.max(0, Math.floor(Number(input.startOffset) || 0))
  const endOffsetRaw = Number(input.endOffset)
  const endOffset = Number.isFinite(endOffsetRaw) ? Math.max(startOffset, Math.floor(endOffsetRaw)) : startOffset
  return {
    chapterId: asText(input.chapterId),
    title: asText(input.title).slice(0, CHAPTER_CONTRACT_LIMITS.maxTitleChars),
    ordinal,
    startOffset,
    endOffset,
    detectionBasis: normalizeDetectionBasis(input.detectionBasis),
    confidence: normalizeChapterConfidence(input.confidence),
    warnings: (Array.isArray(input.warnings) ? input.warnings : []).map(asText).filter(Boolean).slice(0, CHAPTER_CONTRACT_LIMITS.maxWarnings)
  }
}

/**
 * 归一章节集合：保证 ordinal 连续递增、区间单调不重叠。
 */
export function normalizeChapterList(chapters = [], options = {}) {
  const basisFallback = normalizeDetectionBasis(options.detectionBasis)
  const sorted = (Array.isArray(chapters) ? chapters : [])
    .map((chapter, index) => normalizeChapter(chapter, index))
    .filter((chapter) => chapter.endOffset > chapter.startOffset || chapter.title)
    .sort((left, right) => left.startOffset - right.startOffset || left.ordinal - right.ordinal)
    .slice(0, CHAPTER_CONTRACT_LIMITS.maxChapters)
  let previousEnd = -1
  return sorted.map((chapter, index) => {
    const startOffset = Math.max(chapter.startOffset, previousEnd < 0 ? 0 : previousEnd)
    const endOffset = Math.max(chapter.endOffset, startOffset)
    previousEnd = endOffset
    return {
      ...chapter,
      detectionBasis: chapter.detectionBasis === 'regex' && basisFallback !== 'regex' && !chapter.chapterId
        ? basisFallback
        : chapter.detectionBasis,
      ordinal: index + 1,
      startOffset,
      endOffset
    }
  })
}

/**
 * 汇总章节整体置信度：任一 low 或覆盖缺口大 → 整体降档。
 */
export function aggregateChapterDetectionConfidence(chapters = [], { totalLength = 0 } = {}) {
  const list = Array.isArray(chapters) ? chapters : []
  if (!list.length) return 'low'
  const hasLow = list.some((chapter) => chapter.confidence === 'low')
  const covered = list.reduce((sum, chapter) => sum + (chapter.endOffset - chapter.startOffset), 0)
  const coverage = totalLength > 0 ? covered / totalLength : 1
  if (!hasLow && coverage >= 0.6) return 'high'
  if (!hasLow || coverage >= 0.3) return 'medium'
  return 'low'
}

/**
 * 未被任何章节覆盖的正文区间（前导内容、章节间隙之外的整段无标题文本等），
 * 用于保证"章节识别失败的区间不丢"。
 */
export function computeUnmatchedRanges(chapters = [], totalLength = 0) {
  const ranges = []
  let cursor = 0
  for (const chapter of Array.isArray(chapters) ? chapters : []) {
    if (chapter.startOffset > cursor) {
      ranges.push({ start: cursor, end: chapter.startOffset })
    }
    cursor = Math.max(cursor, chapter.endOffset)
  }
  if (totalLength > cursor) ranges.push({ start: cursor, end: totalLength })
  return ranges.filter((range) => range.end > range.start)
}
