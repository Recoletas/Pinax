import {
  buildSourceChunks,
  normalizeSourceArtifact,
  normalizeSourceText,
  createFileInstanceId,
  hashSourceTextSha256,
  SOURCE_PARSE_SLOW_THRESHOLD_MS
} from './worldbookSourceArchive'
import { detectEncodingFromBytes } from '../writing/encodingDetector'
import { detectChapters, planChaptersFromMarks } from '../writing/chapterDetector'
import { extractEpub } from '../writing/epubAdapter'
import {
  buildReportSectionsFromArtifact,
  normalizeImportReport,
  suggestRecoveryActions
} from '../../../shared/importReportContract'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const DEFAULT_SOURCE_PARSE_TIMEOUT_MS = 60 * 1000
const EXTENSION_KIND = Object.freeze({
  '.txt': 'text-file',
  '.text': 'text-file',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.epub': 'epub'
})

const MIME_KIND = Object.freeze({
  'text/plain': 'text-file',
  'text/markdown': 'markdown',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/epub+zip': 'epub'
})

// 可恢复（报告 failures + suggestedAction）与不可恢复（直接异常）的错误码。
const RECOVERABLE_ERROR_CODES = new Set([
  'unsupported-type', 'too-large', 'parse-timeout', 'needs-ocr', 'encrypted-pdf',
  'pdf-parse-failed', 'docx-parse-failed', 'epub-parse-failed', 'no-extractable-text'
])

function text(value) {
  return String(value ?? '').trim()
}

function extensionOf(file) {
  const name = text(file?.name).toLowerCase()
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index) : ''
}

export function detectSourceKind(file) {
  const mimeKind = MIME_KIND[text(file?.type).toLowerCase()]
  return mimeKind || EXTENSION_KIND[extensionOf(file)] || ''
}

function adapterError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function createAbortError() {
  const error = new Error('文件读取已停止。')
  error.name = 'AbortError'
  error.code = 'cancelled'
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

function createParseTimeoutError(file, timeoutMs) {
  return adapterError(
    'parse-timeout',
    `${text(file?.name) || '文件'}读取超过 ${Math.round(timeoutMs / 1000)} 秒，已停止本次解析。`,
    { timeoutMs }
  )
}

function buildParseMetrics(durationMs, thresholdMs = SOURCE_PARSE_SLOW_THRESHOLD_MS) {
  const normalizedDuration = Math.max(0, Math.round(Number(durationMs) || 0))
  const normalizedThreshold = Math.max(1, Number(thresholdMs) || SOURCE_PARSE_SLOW_THRESHOLD_MS)
  return {
    durationMs: normalizedDuration,
    slow: normalizedDuration >= normalizedThreshold
  }
}

function withParseTimeout(task, file, timeoutMs, signal, abortTask) {
  const duration = Number(timeoutMs)
  if (!Number.isFinite(duration) || duration <= 0) return task
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      callback(value)
    }
    const onAbort = () => {
      abortTask?.()
      finish(reject, createAbortError())
    }
    const timer = setTimeout(() => {
      abortTask?.()
      finish(reject, createParseTimeoutError(file, duration))
    }, duration)
    if (signal) {
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
    }
    Promise.resolve(task).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error)
    )
  })
}

function validateFile(file, kind, maxBytes) {
  if (!kind) throw adapterError('unsupported-type', `暂不支持导入 ${text(file?.name) || '该文件'}。`)
  const size = Number(file?.size) || 0
  if (size > maxBytes) {
    throw adapterError('too-large', `${text(file?.name) || '文件'}超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制。`, { maxBytes })
  }
}

/**
 * 技术点 #1：编码识别取代固定 UTF-8 的 file.text()。
 * 有 arrayBuffer 时走多候选解码 + 乱码评分；只有 text() 的测试替身/旧环境
 * 保持原 UTF-8 路径（encoding 为 null）。
 */
async function readFileTextWithEncoding(file, signal) {
  throwIfAborted(signal)
  if (typeof file?.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer(signal)
    throwIfAborted(signal)
    const bytes = ArrayBuffer.isView(buffer) ? buffer : new Uint8Array(buffer)
    const detection = detectEncodingFromBytes(bytes)
    throwIfAborted(signal)
    return { rawText: detection.text, encoding: detection }
  }
  if (typeof file?.text === 'function') {
    // Native File.text() ignores the optional argument. Passing the signal
    // also lets adapters and test doubles observe the cancellation boundary.
    const content = await file.text(signal)
    throwIfAborted(signal)
    return { rawText: content, encoding: null }
  }
  throw adapterError('read-failed', '浏览器无法读取该文件。')
}

/**
 * 拼接 part 文本并记录每个 part 在全文中的区间，供章节偏移映射。
 */
function joinPartsWithRanges(parts) {
  const cleanParts = parts.filter((part) => String(part?.text ?? '').trim())
  let cursor = 0
  const ranges = cleanParts.map((part, index) => {
    const range = { start: cursor, end: cursor + part.text.length }
    cursor += part.text.length + (index < cleanParts.length - 1 ? 2 : 0) // '\n\n' 分隔符
    return range
  })
  return { cleanParts, content: cleanParts.map((part) => part.text).join('\n\n'), ranges }
}

/**
 * 技术点 #2/#4：章节优先切块 + 内容身份 ID。
 *
 * - artifact.id 默认取 SHA-256 内容哈希（contentHashSha256），显式传入的
 *   sourceId 仍然生效；
 * - 章节在"拼接后全文坐标"上规划一次，chapterId = `${artifactId}:chapter:${ordinal}`；
 * - 单 part（TXT/MD/DOCX）与 EPUB（spine 章节计划）全局切块；PDF 多页保持
 *   per-part 切块并保留 pdf-page locator，章节按页内局部偏移裁剪注入。
 */
function buildPartsBundle({
  file,
  kind,
  sourceId,
  parts,
  warnings = [],
  encoding = null,
  epubMetadata = null,
  fileInstanceId = '',
  chapterPlan = null
}) {
  const { cleanParts, content, ranges } = joinPartsWithRanges(parts)

  // 先做一次轻量归一拿到内容身份；content 不传入避免重复大字符串处理。
  const contentHash = hashSourceTextSha256(content)
  const physicalId = text(sourceId) || contentHash

  const plan = chapterPlan || detectChapters(content)
  const chaptersWithIds = plan.chapters.map((chapter) => ({
    ...chapter,
    chapterId: `${physicalId}:chapter:${chapter.ordinal}`
  }))

  const artifact = normalizeSourceArtifact({
    id: physicalId,
    title: text(file?.name) || '导入资料',
    kind,
    sourceLabel: '本地文件',
    originalLength: content.length,
    normalizedLength: content.length,
    contentHash,
    createdAt: Number(file?.lastModified) || Date.now(),
    file: {
      name: text(file?.name),
      mime: text(file?.type),
      size: Number(file?.size) || 0
    },
    warnings,
    encoding: encoding || undefined,
    epubMetadata: epubMetadata || undefined,
    fileInstanceId,
    chapters: chaptersWithIds,
    chapterWarnings: plan.warnings
  })

  let chunks
  if (cleanParts.length === 1) {
    chunks = buildSourceChunks(cleanParts[0].text, {
      sourceId: physicalId,
      locator: cleanParts[0].locator,
      chapters: chaptersWithIds,
      chapterWarnings: plan.warnings,
      skipChapterDetection: true
    })
  } else if (chapterPlan) {
    chunks = buildSourceChunks(content, {
      sourceId: physicalId,
      chapters: chaptersWithIds,
      chapterWarnings: plan.warnings,
      skipChapterDetection: true
    })
  } else {
    chunks = cleanParts.flatMap((part, index) => {
      const range = ranges[index]
      const localChapters = chaptersWithIds
        .map((chapter) => {
          const start = Math.max(chapter.startOffset, range.start)
          const end = Math.min(chapter.endOffset, range.end)
          return end > start
            ? { ...chapter, startOffset: start - range.start, endOffset: end - range.start }
            : null
        })
        .filter(Boolean)
      return buildSourceChunks(part.text, {
        sourceId: physicalId,
        locator: part.locator,
        chapters: localChapters,
        skipChapterDetection: true
      })
    })
  }

  return {
    artifact: { ...artifact, chunkIds: chunks.map((chunk) => chunk.id) },
    chunks,
    warnings
  }
}

async function parseTextFile(file, kind, sourceId, signal, fileInstanceId) {
  const { rawText, encoding } = await readFileTextWithEncoding(file, signal)
  const content = normalizeSourceText(rawText)
  throwIfAborted(signal)
  if (!content) throw adapterError('no-extractable-text', `${text(file?.name) || '文件'}没有可提取的文字。`)
  return buildPartsBundle({
    file,
    kind,
    sourceId,
    fileInstanceId,
    encoding,
    parts: [{ text: content, locator: { type: 'offset', start: 0, end: content.length } }]
  })
}

async function parsePdfFile(file, sourceId, signal, fileInstanceId) {
  throwIfAborted(signal)
  // The legacy build works in browser WebViews and Node/jsdom environments
  // that do not provide DOMMatrix at module evaluation time.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  throwIfAborted(signal)
  const data = await file.arrayBuffer(signal)
  throwIfAborted(signal)
  const binaryData = ArrayBuffer.isView(data) ? data : new Uint8Array(data)
  let document
  try {
    // pdfjs-dist 6 no longer treats disableWorker as a browser fake-worker
    // switch. Give it the Vite-emitted worker explicitly so PDF extraction
    // works inside the source parser worker and in the main-thread fallback.
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    }
    const loadingTask = pdfjs.getDocument({
      data: binaryData,
      disableWorker: true,
      disableFontFace: true,
      useSystemFonts: false
    })
    const abortDocument = () => {
      try { void loadingTask.destroy() } catch { /* best-effort parser cleanup */ }
    }
    signal?.addEventListener?.('abort', abortDocument, { once: true })
    try {
      document = await loadingTask.promise
    } finally {
      signal?.removeEventListener?.('abort', abortDocument)
    }
    const pages = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      throwIfAborted(signal)
      const page = await document.getPage(pageNumber)
      const textContent = await page.getTextContent()
      throwIfAborted(signal)
      const pageText = normalizeSourceText(textContent.items.map((item) => item.str || '').join(' '))
      if (pageText) {
        pages.push({ text: pageText, locator: { type: 'pdf-page', page: pageNumber } })
      }
    }
    if (!pages.length) throw adapterError('needs-ocr', '该 PDF 没有可直接提取的文字，可能是扫描件，需要 OCR。')
    return buildPartsBundle({ file, kind: 'pdf', sourceId, fileInstanceId, parts: pages })
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'cancelled' || error?.code === 'needs-ocr') throw error
    const encrypted = error?.name === 'PasswordException'
      || /password|encrypted|密码|加密/i.test(String(error?.message || ''))
    throw adapterError(
      encrypted ? 'encrypted-pdf' : 'pdf-parse-failed',
      encrypted
        ? `${text(file?.name) || 'PDF'} 受密码保护，暂时无法读取。请先解除密码后重试。`
        : `${text(file?.name) || 'PDF'} 无法解析，可能已损坏或格式不受支持。`,
      { reason: text(error?.name || error?.message).slice(0, 120) }
    )
  }
}

async function parseDocxFile(file, sourceId, signal, fileInstanceId) {
  throwIfAborted(signal)
  const mammothModule = await import('mammoth')
  const mammoth = mammothModule.default || mammothModule
  // Mammoth's runtime adapter accepts the binary under `buffer`; an
  // ArrayBuffer is valid input for JSZip in both browser and Node/WebView.
  const buffer = await file.arrayBuffer(signal)
  throwIfAborted(signal)
  let result
  try {
    result = await mammoth.extractRawText({ buffer })
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'cancelled') throw error
    throw adapterError('docx-parse-failed', `${text(file?.name) || 'DOCX'} 无法解析，文件可能已损坏或格式不受支持。`, {
      reason: text(error?.name || error?.message).slice(0, 120)
    })
  }
  throwIfAborted(signal)
  const content = normalizeSourceText(result.value)
  if (!content) throw adapterError('no-extractable-text', `${text(file?.name) || 'DOCX'}没有可提取的文字。`)
  const warnings = Array.isArray(result.messages)
    ? result.messages.map((message) => text(message.message)).filter(Boolean)
    : []
  return buildPartsBundle({
    file,
    kind: 'docx',
    sourceId,
    fileInstanceId,
    parts: [{ text: content, locator: { type: 'offset', start: 0, end: content.length } }],
    warnings
  })
}

/**
 * 技术点 #3：EPUB 走 OPF spine 阅读顺序（不按文件名排序），每个 spine 文档
 * 映射为全文坐标上的一个章节（detectionBasis 'opff'）。
 */
async function parseEpubFile(file, sourceId, signal, fileInstanceId) {
  const buffer = await file.arrayBuffer(signal)
  throwIfAborted(signal)
  let extracted
  try {
    extracted = await extractEpub(buffer, signal)
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'cancelled') throw error
    throw adapterError(
      'epub-parse-failed',
      `${text(file?.name) || 'EPUB'} 无法解析，文件可能已损坏或格式不受支持。`,
      { reason: text(error?.name || error?.message).slice(0, 120) }
    )
  }
  throwIfAborted(signal)
  if (!extracted.parts.length) {
    throw adapterError('no-extractable-text', `${text(file?.name) || 'EPUB'}没有可提取的文字。`)
  }
  const marks = extracted.parts.map((part, index) => {
    const mark = { offset: 0, line: extracted.spineTitles[index] || `第 ${index + 1} 节`, kind: 'chinese' }
    return mark
  })
  // 补齐全文坐标：joinPartsWithRanges 使用相同 '\n\n' 分隔规则。
  let cursor = 0
  extracted.parts.forEach((part, index) => {
    marks[index].offset = cursor
    cursor += part.text.length + (index < extracted.parts.length - 1 ? 2 : 0)
  })
  const plan = planChaptersFromMarks(marks, { totalLength: cursor, detectionBasis: 'opff' })
  return buildPartsBundle({
    file,
    kind: 'epub',
    sourceId,
    fileInstanceId,
    parts: extracted.parts,
    warnings: extracted.warnings,
    epubMetadata: extracted.metadata,
    chapterPlan: plan
  })
}

export async function parseSourceFile(file, options = {}) {
  throwIfAborted(options.signal)
  const kind = detectSourceKind(file)
  const maxBytes = Number(options.maxBytes) || MAX_SOURCE_BYTES
  validateFile(file, kind, maxBytes)
  const explicitSourceId = text(options.sourceId)
  // 技术点 #4：fileInstanceId 标识本次上传（UI 临时层）；内容身份由
  // contentHashSha256 承担，改名重传不会改变来源身份。
  const fileInstanceId = text(options.fileInstanceId) || createFileInstanceId()
  const timeoutMs = options.parseTimeoutMs ?? DEFAULT_SOURCE_PARSE_TIMEOUT_MS
  const parseController = typeof AbortController === 'function' && Number(timeoutMs) > 0
    ? new AbortController()
    : null
  const parseSignal = parseController?.signal || options.signal
  let task
  if (kind === 'text-file' || kind === 'markdown') task = parseTextFile(file, kind, explicitSourceId, parseSignal, fileInstanceId)
  else if (kind === 'pdf') task = parsePdfFile(file, explicitSourceId, parseSignal, fileInstanceId)
  else if (kind === 'docx') task = parseDocxFile(file, explicitSourceId, parseSignal, fileInstanceId)
  else if (kind === 'epub') task = parseEpubFile(file, explicitSourceId, parseSignal, fileInstanceId)
  else throw adapterError('unsupported-type', `暂不支持导入 ${text(file?.name) || '该文件'}。`)
  return withParseTimeout(task, file, timeoutMs, options.signal, () => parseController?.abort())
}

function serializeError(error) {
  return {
    code: text(error?.code) || 'parse-failed',
    message: text(error?.message) || '文件解析失败。',
    details: error?.details && typeof error.details === 'object' ? error.details : {}
  }
}

/**
 * 把 chunk 统计直接挂在数组属性上：result.chunks 既保持既有调用方的数组语义
 * （.length、迭代、saveSourceArchiveBundle），又满足 ImportReport 合同的
 * chunks:{total,byChapter,avgChunkSize,warnings} 读取。
 */
function attachChunkStats(chunkList, stats) {
  const arr = Array.isArray(chunkList) ? chunkList : []
  arr.total = stats.total
  arr.byChapter = stats.byChapter
  arr.avgChunkSize = stats.avgChunkSize
  arr.warnings = stats.warnings
  return arr
}

function emptyEncodingSection() {
  return { detected: null, confidence: 'low', candidates: [], warnings: [] }
}

function buildReadyImportReport({ file, parsed, metrics }) {
  const artifact = parsed.artifact
  const sections = buildReportSectionsFromArtifact({
    artifact,
    chunks: parsed.chunks,
    fileInstanceId: artifact.fileInstanceId
  })
  const fileName = text(file?.name)
  const userActions = []
  const failures = []
  const encodingSection = sections.encoding
  if (encodingSection.confidence !== 'high' && encodingSection.detected) {
    const alternative = encodingSection.candidates[1]?.encoding || 'gb18030'
    userActions.push({
      label: `按其他编码重新解析（如 ${alternative}）`,
      command: 'reparse-with-encoding',
      args: { filename: fileName, suggestedEncoding: alternative }
    })
    if (encodingSection.confidence === 'low') {
      failures.push({
        chapterId: null,
        offset: 0,
        reason: encodingSection.warnings[0] || `编码识别置信度低（${encodingSection.detected}）。`,
        recoverable: true,
        suggestedAction: userActions[userActions.length - 1]
      })
    }
  }
  const core = normalizeImportReport({
    encoding: encodingSection,
    chapters: sections.chapters,
    chunks: sections.chunks,
    duplicates: {},
    failures,
    performance: {
      parseMs: metrics.durationMs,
      parseSizeBytes: Number(file?.size) || 0,
      slowFile: metrics.slow
    },
    userActions
  })
  return {
    status: 'ready',
    fileName,
    sourceId: artifact.id,
    fileInstanceId: artifact.fileInstanceId,
    filename: fileName,
    format: artifact.kind,
    size: Number(file?.size) || 0,
    artifact,
    parseMetrics: metrics,
    ...core,
    // 兼容字段放最后：result.chunks 保持数组语义，统计挂在数组属性上。
    chunks: attachChunkStats(parsed.chunks, sections.chunks)
  }
}

function buildErrorImportReport({ file, error, metrics }) {
  const serialized = serializeError(error)
  const recoverable = RECOVERABLE_ERROR_CODES.has(serialized.code)
  const recoveryActions = suggestRecoveryActions(serialized.code)
  const core = normalizeImportReport({
    encoding: emptyEncodingSection(),
    chapters: { total: 0, detected: 0, confidence: 'low', unmatchedRanges: [], warnings: [] },
    chunks: { total: 0, byChapter: 0, avgChunkSize: 0, warnings: [] },
    duplicates: {},
    failures: [{
      chapterId: null,
      offset: 0,
      reason: `${serialized.code}: ${serialized.message}`,
      recoverable,
      suggestedAction: recoveryActions[0] || null
    }],
    performance: {
      parseMs: metrics.durationMs,
      parseSizeBytes: Number(file?.size) || 0,
      slowFile: metrics.slow
    },
    userActions: recoverable ? recoveryActions : []
  })
  return {
    status: 'error',
    fileName: text(file?.name),
    fileInstanceId: null,
    filename: text(file?.name),
    format: detectSourceKind(file),
    size: Number(file?.size) || 0,
    error: serialized,
    parseMetrics: metrics,
    ...core
  }
}

/**
 * 批内重复识别（技术点 #4/#5）：同批先出现的同内容哈希来源记为
 * duplicateOfSourceId；部分重叠用 chunk hash 交集度量。
 */
function attachBatchDuplicates(reports) {
  const seenByHash = new Map()
  const chunkHashSets = reports.map((report) => (
    new Set((Array.isArray(report.chunks) ? report.chunks : []).map((chunk) => chunk.hash).filter(Boolean))
  ))
  for (let index = 0; index < reports.length; index += 1) {
    const report = reports[index]
    if (report.status !== 'ready') continue
    const duplicates = { duplicateOfSourceId: null, partialOverlaps: [] }
    const contentHash = report.artifact?.contentHash
    if (contentHash && seenByHash.has(contentHash)) {
      duplicates.duplicateOfSourceId = seenByHash.get(contentHash)
    } else if (contentHash) {
      seenByHash.set(contentHash, report.sourceId)
    }
    for (let other = 0; other < index; other += 1) {
      if (reports[other].status !== 'ready' || other === index) continue
      let sharedChunks = 0
      for (const hash of chunkHashSets[index]) {
        if (chunkHashSets[other].has(hash)) sharedChunks += 1
      }
      if (sharedChunks > 0) {
        duplicates.partialOverlaps.push({
          sourceId: reports[other].sourceId,
          sharedChunks,
          ratio: chunkHashSets[index].size ? sharedChunks / chunkHashSets[index].size : 0
        })
      }
    }
    report.duplicates = normalizeImportReport({ duplicates }).duplicates
  }
  return reports
}

export async function parseSourceFiles(files = [], options = {}) {
  const list = Array.from(files || [])
  const batchStartedAt = Date.now()
  const results = await Promise.all(list.map(async (file, index) => {
    const fileStartedAt = Date.now()
    let report
    try {
      throwIfAborted(options.signal)
      const parsed = await parseSourceFile(file, options)
      throwIfAborted(options.signal)
      report = buildReadyImportReport({ file, parsed, metrics: buildParseMetrics(Date.now() - fileStartedAt, options.slowParseThresholdMs) })
    } catch (error) {
      if (error?.name === 'AbortError' || options.signal?.aborted) throw createAbortError()
      report = buildErrorImportReport({ file, error, metrics: buildParseMetrics(Date.now() - fileStartedAt, options.slowParseThresholdMs) })
    }
    throwIfAborted(options.signal)
    options.onProgress?.({
      index,
      total: list.length,
      fileName: report.fileName,
      status: report.status,
      error: report.error || null,
      durationMs: report.parseMetrics.durationMs,
      slow: report.parseMetrics.slow
    })
    return report
  }))
  attachBatchDuplicates(results)
  const slowFileIndexes = results
    .map((result, index) => result.parseMetrics?.slow ? index : -1)
    .filter((index) => index >= 0)
  options.onMetrics?.({
    durationMs: Math.max(0, Date.now() - batchStartedAt),
    fileCount: results.length,
    maxFileDurationMs: Math.max(0, ...results.map((result) => Number(result.parseMetrics?.durationMs) || 0)),
    slowFileCount: slowFileIndexes.length,
    slowFileIndexes
  })
  return results
}
