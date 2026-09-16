/**
 * 章节结构解析：从纯文本中识别章节边界（port 自 CloudLiu1008/distill-novels
 * prepare_sources.py 的 CHAPTER_RE，扩展卷式标题与 Markdown 前缀），并产出
 * 章节优先切块所需的区间信息。
 *
 * 设计约束：
 * - 章节边界优先于长度边界；
 * - 识别失败的区间不丢，进入 unmatchedRanges（由 chapterContract 计算）；
 * - 只做行首匹配 + 行长上限，避免把句中的"第一章提到……"误判为标题。
 */

import {
  aggregateChapterDetectionConfidence,
  computeUnmatchedRanges,
  normalizeChapterList
} from '../../../shared/chapterContract'

const CN_NUMERAL = '零〇一二三四五六七八九十百千万两0-9０-９'
// 行内空白含全角空格 U+3000（中文网文标题常用）。
const INLINE_SPACE = '[^\\S\\r\\n]'
// 中文章节：第 N 章/节/回/卷/部/篇、序章、楔子、尾声、终章、引子；支持 Markdown 井号前缀。
export const CHINESE_CHAPTER_RE = new RegExp(
  `^${INLINE_SPACE}*(?:#{1,6}${INLINE_SPACE}*)?(?:第[${CN_NUMERAL}]+[章节回卷部篇]|序章|楔子|尾声|终章|引子)(?![${CN_NUMERAL}章节回卷部篇])${INLINE_SPACE}*[^\\s].{0,120}$`
)
// 英文章节：Chapter N / CHAPTER I / Chapter One。行首宽松匹配后由
// isValidEnglishChapterToken 校验编号，避免 "chapter did..." 这类误报。
export const ENGLISH_CHAPTER_RE = new RegExp(
  `^[ \\t]*(?:#{1,6}[ \\t]*)?chapter[ \\t]+(\\S+)(?:[ \\t]+[^\\n]*)?$`,
  'i'
)
const ENGLISH_NUMBERS = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty',
  'seventy', 'eighty', 'ninety', 'hundred'
])

const ROMAN_NUMERAL_RE = /^M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/i

function isRomanNumeral(token) {
  const value = String(token || '')
  return /[ivxlcdm]/i.test(value) && ROMAN_NUMERAL_RE.test(value)
}

export function isValidEnglishChapterToken(token) {
  const value = String(token || '').toLowerCase().replace(/[:.,!；;：]+$/, '')
  if (/^\d{1,4}$/.test(value)) return true
  if (!value) return false
  if (isRomanNumeral(value)) return true
  const words = value.split(/[ -]+/)
  return words.length > 0 && words.length <= 5 && words.every((word) => ENGLISH_NUMBERS.has(word))
}
// 卷式："卷一 标题" / "第一卷 标题"（与"第N章"分开，避免双计）。
export const VOLUME_CHAPTER_RE = new RegExp(
  `^${INLINE_SPACE}*(?:#{1,6}${INLINE_SPACE}*)?(?:卷[${CN_NUMERAL}]+|第[${CN_NUMERAL}]+卷)${INLINE_SPACE}*[^\\s].{0,120}$`
)

const HEADING_MAX_LINE_LENGTH = 140

function text(value) {
  return String(value ?? '')
}

/**
 * 找出所有疑似章节标题行。返回 [{ offset, line, kind }]，kind: chinese | english | volume。
 */
export function findChapterMarks(sourceText) {
  const value = text(sourceText)
  if (!value) return []
  const marks = []
  let lineStart = 0
  while (lineStart <= value.length) {
    let newlineIndex = value.indexOf('\n', lineStart)
    if (newlineIndex < 0) newlineIndex = value.length
    if (newlineIndex - lineStart <= HEADING_MAX_LINE_LENGTH) {
      const line = value.slice(lineStart, newlineIndex).replace(/\r$/, '')
      const trimmedEnd = line.replace(/[ \t]+$/, '')
      // 句末标点（。！？…）结尾的长行几乎不可能是标题。
      const looksLikeSentence = /[。！？…]\s*$/.test(trimmedEnd)
      if (!looksLikeSentence && trimmedEnd.trim()) {
        const englishMatch = trimmedEnd.match(ENGLISH_CHAPTER_RE)
        if (VOLUME_CHAPTER_RE.test(line)) {
          marks.push({ offset: lineStart, line: trimmedEnd.trim(), kind: 'volume' })
        } else if (CHINESE_CHAPTER_RE.test(line)) {
          marks.push({ offset: lineStart, line: trimmedEnd.trim(), kind: 'chinese' })
        } else if (englishMatch && isValidEnglishChapterToken(englishMatch[1])) {
          marks.push({ offset: lineStart, line: trimmedEnd.trim(), kind: 'english' })
        }
      }
    }
    if (newlineIndex >= value.length) break
    lineStart = newlineIndex + 1
  }
  return marks.filter((mark) => mark.offset < value.length)
}

function confidenceForMarkCount(count) {
  if (count >= 5) return 'high'
  if (count >= 3) return 'medium'
  return 'low'
}

/**
 * 解析章节结构。
 *
 * 返回：
 * {
 *   chapters: Chapter[],            // 归一后的章节区间（offset 相对输入文本）
 *   confidence: 'high' | 'medium' | 'low',
 *   unmatchedRanges: [{ start, end }],
 *   warnings: []
 * }
 */
export function detectChapters(sourceText, options = {}) {
  const value = text(sourceText)
  const totalLength = value.length
  const detectionBasis = options.detectionBasis === 'opff' || options.detectionBasis === 'toc' || options.detectionBasis === 'manual'
    ? options.detectionBasis
    : 'regex'
  const warnings = []
  if (options.marks) {
    return planChaptersFromMarks(options.marks, { totalLength, detectionBasis, warnings })
  }
  const marks = findChapterMarks(value)
  return planChaptersFromMarks(marks, { totalLength, detectionBasis, warnings })
}

/**
 * 由标记序列规划章节区间：每章从标题行起点到下一章标题行起点。
 * 首个标题之前的前导内容不属于任何章节 → unmatchedRanges。
 */
export function planChaptersFromMarks(marks, { totalLength = 0, detectionBasis = 'regex', warnings = [] } = {}) {
  const validMarks = (Array.isArray(marks) ? marks : [])
    .filter((mark) => mark && Number.isFinite(Number(mark.offset)))
    .sort((left, right) => left.offset - right.offset)
  if (!validMarks.length) {
    warnings.push('未识别出章节标题，正文将按长度切块。')
    return {
      chapters: [],
      confidence: 'low',
      unmatchedRanges: totalLength > 0 ? [{ start: 0, end: totalLength }] : [],
      warnings
    }
  }

  const rawChapters = validMarks.map((mark, index) => ({
    title: mark.line || mark.title || '',
    ordinal: index + 1,
    startOffset: mark.offset,
    endOffset: index + 1 < validMarks.length ? validMarks[index + 1].offset : totalLength,
    detectionBasis,
    confidence: confidenceForMarkCount(validMarks.length),
    warnings: []
  }))
  const chapters = normalizeChapterList(rawChapters, { detectionBasis })
  if (chapters.length < 3) {
    warnings.push(`仅识别出 ${chapters.length} 个章节标题，置信度受限。`)
  }
  return {
    chapters,
    confidence: aggregateChapterDetectionConfidence(chapters, { totalLength }),
    unmatchedRanges: computeUnmatchedRanges(chapters, totalLength),
    warnings
  }
}
