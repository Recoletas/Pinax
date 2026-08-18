import {
  buildSourceChunks,
  hashSourceText,
  normalizeSourceArtifact,
  normalizeSourceText,
  SOURCE_PARSE_SLOW_THRESHOLD_MS
} from './worldbookSourceArchive'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const DEFAULT_SOURCE_PARSE_TIMEOUT_MS = 60 * 1000
const EXTENSION_KIND = Object.freeze({
  '.txt': 'text-file',
  '.text': 'text-file',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.pdf': 'pdf',
  '.docx': 'docx'
})

const MIME_KIND = Object.freeze({
  'text/plain': 'text-file',
  'text/markdown': 'markdown',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
})

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

function sourceIdFor(file, kind) {
  return `source_${hashSourceText([
    text(file?.name),
    text(file?.type),
    Number(file?.size) || 0,
    Number(file?.lastModified) || 0,
    kind
  ].join(':'))}`
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

async function readFileText(file, signal) {
  throwIfAborted(signal)
  if (typeof file?.text === 'function') {
    // Native File.text() ignores the optional argument. Passing the signal
    // also lets adapters and test doubles observe the cancellation boundary.
    const content = await file.text(signal)
    throwIfAborted(signal)
    return content
  }
  if (typeof file?.arrayBuffer === 'function') {
    const content = new TextDecoder().decode(await file.arrayBuffer(signal))
    throwIfAborted(signal)
    return content
  }
  throw adapterError('read-failed', '浏览器无法读取该文件。')
}

function buildPartsBundle({ file, kind, sourceId, parts, warnings = [] }) {
  const content = parts.map((part) => part.text).filter(Boolean).join('\n\n')
  const artifact = normalizeSourceArtifact({
    id: sourceId,
    title: text(file?.name) || '导入资料',
    kind,
    sourceLabel: '本地文件',
    content,
    originalLength: content.length,
    createdAt: Number(file?.lastModified) || Date.now(),
    file: {
      name: text(file?.name),
      mime: text(file?.type),
      size: Number(file?.size) || 0
    },
    warnings
  })
  const chunks = parts.flatMap((part) => buildSourceChunks(part.text, {
    sourceId,
    locator: part.locator
  }))
  return {
    artifact: { ...artifact, chunkIds: chunks.map((chunk) => chunk.id) },
    chunks,
    warnings
  }
}

async function parseTextFile(file, kind, sourceId, signal) {
  const content = normalizeSourceText(await readFileText(file, signal))
  throwIfAborted(signal)
  if (!content) throw adapterError('no-extractable-text', `${text(file?.name) || '文件'}没有可提取的文字。`)
  return buildPartsBundle({
    file,
    kind,
    sourceId,
    parts: [{ text: content, locator: { type: 'offset', start: 0, end: content.length } }]
  })
}

async function parsePdfFile(file, sourceId, signal) {
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
    return buildPartsBundle({ file, kind: 'pdf', sourceId, parts: pages })
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

async function parseDocxFile(file, sourceId, signal) {
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
    parts: [{ text: content, locator: { type: 'offset', start: 0, end: content.length } }],
    warnings
  })
}

export async function parseSourceFile(file, options = {}) {
  throwIfAborted(options.signal)
  const kind = detectSourceKind(file)
  const maxBytes = Number(options.maxBytes) || MAX_SOURCE_BYTES
  validateFile(file, kind, maxBytes)
  const sourceId = text(options.sourceId) || sourceIdFor(file, kind)
  const timeoutMs = options.parseTimeoutMs ?? DEFAULT_SOURCE_PARSE_TIMEOUT_MS
  const parseController = typeof AbortController === 'function' && Number(timeoutMs) > 0
    ? new AbortController()
    : null
  const parseSignal = parseController?.signal || options.signal
  let task
  if (kind === 'text-file' || kind === 'markdown') task = parseTextFile(file, kind, sourceId, parseSignal)
  else if (kind === 'pdf') task = parsePdfFile(file, sourceId, parseSignal)
  else if (kind === 'docx') task = parseDocxFile(file, sourceId, parseSignal)
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

export async function parseSourceFiles(files = [], options = {}) {
  const list = Array.from(files || [])
  const batchStartedAt = Date.now()
  const results = await Promise.all(list.map(async (file, index) => {
    const fileStartedAt = Date.now()
    let result
    try {
      throwIfAborted(options.signal)
      const parsed = await parseSourceFile(file, options)
      throwIfAborted(options.signal)
      result = { status: 'ready', fileName: text(file?.name), ...parsed }
    } catch (error) {
      if (error?.name === 'AbortError' || options.signal?.aborted) throw createAbortError()
      result = {
        status: 'error',
        fileName: text(file?.name),
        error: serializeError(error)
      }
    }
    result.parseMetrics = buildParseMetrics(Date.now() - fileStartedAt, options.slowParseThresholdMs)
    throwIfAborted(options.signal)
    options.onProgress?.({
      index,
      total: list.length,
      fileName: result.fileName,
      status: result.status,
      error: result.error || null,
      durationMs: result.parseMetrics.durationMs,
      slow: result.parseMetrics.slow
    })
    return result
  }))
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
