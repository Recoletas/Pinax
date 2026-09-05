/**
 * 可解释导入报告合同。
 *
 * parseSourceFiles 的结果从"二态 ready/error"升级为结构化 ImportReport：
 * 编码 / 章节 / 切块 / 重复 / 失败 / 性能六类信息 + 结构化用户动作。
 * 为兼容既有调用方（创建工作区、Worker、快速导入），报告同时保留
 * status / fileName / error / artifact / chunks / parseMetrics 字段（超集）。
 */

export const IMPORT_REPORT_SCHEMA_VERSION = 1
export const IMPORT_REPORT_CONFIDENCES = Object.freeze(['high', 'medium', 'low'])
export const IMPORT_REPORT_STATUSES = Object.freeze(['ready', 'error'])

export const IMPORT_USER_ACTION_COMMANDS = Object.freeze([
  'reparse-with-encoding',
  'retry-parse',
  'convert-and-reupload',
  'split-file',
  'run-ocr',
  'remove-password',
  'reupload'
])

function asText(value) {
  return String(value ?? '').trim()
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeUserAction(action) {
  if (!action || typeof action !== 'object') return null
  const command = asText(action.command)
  if (!IMPORT_USER_ACTION_COMMANDS.includes(command)) return null
  return {
    label: asText(action.label) || '重试',
    command,
    args: action.args && typeof action.args === 'object' && !Array.isArray(action.args)
      ? { ...action.args }
      : {}
  }
}

/**
 * 失败 → 建议动作映射：可恢复失败给出 suggestedAction，不可恢复直接抛异常
 * （由调用方的 try/catch 归一）。
 */
export function suggestRecoveryActions(errorCode) {
  switch (asText(errorCode)) {
    case 'unsupported-type':
      return [{
        label: '转换为 TXT/EPUB 后重新上传',
        command: 'convert-and-reupload',
        args: { supportedFormats: ['txt', 'md', 'epub', 'pdf', 'docx'] }
      }]
    case 'too-large':
      return [{
        label: '拆分文件后重新上传',
        command: 'split-file',
        args: { maxBytes: 20 * 1024 * 1024 }
      }]
    case 'parse-timeout':
      return [{ label: '重试解析', command: 'retry-parse', args: {} }]
    case 'needs-ocr':
      return [{ label: '先做 OCR 再上传', command: 'run-ocr', args: {} }]
    case 'encrypted-pdf':
      return [{ label: '解除密码后重新上传', command: 'remove-password', args: {} }]
    default:
      return [{ label: '重新上传该文件', command: 'reupload', args: {} }]
  }
}

function normalizeEncodingSection(input) {
  const source = input && typeof input === 'object' ? input : {}
  const candidates = (Array.isArray(source.candidates) ? source.candidates : [])
    .map((candidate) => ({
      encoding: asText(candidate?.encoding),
      score: finiteNumber(candidate?.score),
      strict: Boolean(candidate?.strict),
      replacementRate: finiteNumber(candidate?.replacementRate)
    }))
    .filter((candidate) => candidate.encoding)
    .slice(0, 8)
  return {
    detected: asText(source.detected) || null,
    confidence: IMPORT_REPORT_CONFIDENCES.includes(source.confidence) ? source.confidence : 'low',
    candidates,
    warnings: (Array.isArray(source.warnings) ? source.warnings : []).map(asText).filter(Boolean).slice(0, 16)
  }
}

function normalizeChaptersSection(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    total: Math.max(0, Math.floor(finiteNumber(source.total))),
    detected: Math.max(0, Math.floor(finiteNumber(source.detected))),
    confidence: IMPORT_REPORT_CONFIDENCES.includes(source.confidence) ? source.confidence : 'low',
    unmatchedRanges: (Array.isArray(source.unmatchedRanges) ? source.unmatchedRanges : [])
      .map((range) => ({
        start: Math.max(0, Math.floor(finiteNumber(range?.start))),
        end: Math.max(0, Math.floor(finiteNumber(range?.end)))
      }))
      .filter((range) => range.end > range.start)
      .slice(0, 64),
    warnings: (Array.isArray(source.warnings) ? source.warnings : []).map(asText).filter(Boolean).slice(0, 16)
  }
}

function normalizeChunksSection(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    total: Math.max(0, Math.floor(finiteNumber(source.total))),
    byChapter: Math.max(0, Math.floor(finiteNumber(source.byChapter))),
    avgChunkSize: Math.max(0, Math.round(finiteNumber(source.avgChunkSize))),
    warnings: (Array.isArray(source.warnings) ? source.warnings : []).map(asText).filter(Boolean).slice(0, 16)
  }
}

function normalizeDuplicatesSection(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    duplicateOfSourceId: asText(source.duplicateOfSourceId) || null,
    partialOverlaps: (Array.isArray(source.partialOverlaps) ? source.partialOverlaps : [])
      .map((overlap) => ({
        sourceId: asText(overlap?.sourceId),
        sharedChunks: Math.max(0, Math.floor(finiteNumber(overlap?.sharedChunks))),
        ratio: Math.min(1, Math.max(0, finiteNumber(overlap?.ratio)))
      }))
      .filter((overlap) => overlap.sourceId && overlap.sharedChunks > 0)
      .slice(0, 32)
  }
}

function normalizeFailures(input) {
  return (Array.isArray(input) ? input : [])
    .map((failure, index) => ({
      chapterId: asText(failure?.chapterId) || null,
      offset: Math.max(0, Math.floor(finiteNumber(failure?.offset))),
      reason: asText(failure?.reason) || '未知失败原因。',
      recoverable: failure?.recoverable !== false,
      suggestedAction: normalizeUserAction(failure?.suggestedAction) || null,
      order: index
    }))
    .map(({ order: _order, ...failure }) => failure)
    .slice(0, 64)
}

function normalizePerformance(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    parseMs: Math.max(0, Math.round(finiteNumber(source.parseMs))),
    parseSizeBytes: Math.max(0, Math.floor(finiteNumber(source.parseSizeBytes))),
    slowFile: Boolean(source.slowFile),
    memoryPeakMb: Number.isFinite(Number(source.memoryPeakMb))
      ? Math.max(0, Number(source.memoryPeakMb))
      : null
  }
}

/**
 * 归一 ImportReport。兼容字段（status/fileName/error/artifact/chunks/
 * parseMetrics/fileInstanceId/sourceId 等）原样透传由调用方附加；
 * 这里只负责报告专有结构的形状与边界。
 */
export function normalizeImportReport(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const userActions = (Array.isArray(source.userActions) ? source.userActions : [])
    .map(normalizeUserAction)
    .filter(Boolean)
    .slice(0, 8)
  return {
    schemaVersion: IMPORT_REPORT_SCHEMA_VERSION,
    encoding: normalizeEncodingSection(source.encoding),
    chapters: normalizeChaptersSection(source.chapters),
    chunks: normalizeChunksSection(source.chunks),
    duplicates: normalizeDuplicatesSection(source.duplicates),
    failures: normalizeFailures(source.failures),
    performance: normalizePerformance(source.performance),
    userActions
  }
}

/**
 * 从归一 artifact 汇总章节/切块报告分区。
 */
export function buildReportSectionsFromArtifact({ artifact, chunks = [], fileInstanceId = '' } = {}) {
  const chaptersList = Array.isArray(artifact?.chapters) ? artifact.chapters : []
  const chunkList = Array.isArray(chunks) ? chunks : []
  const byChapter = chunkList.filter((chunk) => chunk?.chapterId).length
  return {
    chapters: {
      total: chaptersList.length,
      detected: chaptersList.length,
      confidence: artifact?.chapterDetectionConfidence || 'low',
      unmatchedRanges: Array.isArray(artifact?.unmatchedRanges) ? artifact.unmatchedRanges : [],
      warnings: Array.isArray(artifact?.chapterWarnings) ? artifact.chapterWarnings : []
    },
    chunks: {
      total: chunkList.length,
      byChapter,
      avgChunkSize: chunkList.length
        ? Math.round(chunkList.reduce((sum, chunk) => sum + (Number(chunk?.charCount) || 0), 0) / chunkList.length)
        : 0,
      warnings: chunkList.length ? [] : ['没有产出任何正文片段。']
    },
    encoding: artifact?.encoding || { detected: null, confidence: 'low', candidates: [], warnings: [] },
    fileInstanceId: asText(fileInstanceId) || asText(artifact?.fileInstanceId) || null
  }
}
