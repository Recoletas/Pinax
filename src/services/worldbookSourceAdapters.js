import {
  buildSourceChunks,
  hashSourceText,
  normalizeSourceArtifact,
  normalizeSourceText
} from './worldbookSourceArchive'

const MAX_SOURCE_BYTES = 20 * 1024 * 1024
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

function validateFile(file, kind, maxBytes) {
  if (!kind) throw adapterError('unsupported-type', `暂不支持导入 ${text(file?.name) || '该文件'}。`)
  const size = Number(file?.size) || 0
  if (size > maxBytes) {
    throw adapterError('too-large', `${text(file?.name) || '文件'}超过 ${Math.floor(maxBytes / 1024 / 1024)}MB 限制。`, { maxBytes })
  }
}

async function readFileText(file) {
  if (typeof file?.text === 'function') return file.text()
  if (typeof file?.arrayBuffer === 'function') {
    return new TextDecoder().decode(await file.arrayBuffer())
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

async function parseTextFile(file, kind, sourceId) {
  const content = normalizeSourceText(await readFileText(file))
  if (!content) throw adapterError('no-extractable-text', `${text(file?.name) || '文件'}没有可提取的文字。`)
  return buildPartsBundle({
    file,
    kind,
    sourceId,
    parts: [{ text: content, locator: { type: 'offset', start: 0, end: content.length } }]
  })
}

async function parsePdfFile(file, sourceId) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  const data = await file.arrayBuffer()
  const document = await pdfjs.getDocument({ data, disableWorker: true }).promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const pageText = normalizeSourceText(textContent.items.map((item) => item.str || '').join(' '))
    if (pageText) {
      pages.push({ text: pageText, locator: { type: 'pdf-page', page: pageNumber } })
    }
  }
  if (!pages.length) throw adapterError('needs-ocr', '该 PDF 没有可直接提取的文字，可能是扫描件，需要 OCR。')
  return buildPartsBundle({ file, kind: 'pdf', sourceId, parts: pages })
}

async function parseDocxFile(file, sourceId) {
  const mammothModule = await import('mammoth')
  const mammoth = mammothModule.default || mammothModule
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
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
  const kind = detectSourceKind(file)
  const maxBytes = Number(options.maxBytes) || MAX_SOURCE_BYTES
  validateFile(file, kind, maxBytes)
  const sourceId = text(options.sourceId) || sourceIdFor(file, kind)
  if (kind === 'text-file' || kind === 'markdown') return parseTextFile(file, kind, sourceId)
  if (kind === 'pdf') return parsePdfFile(file, sourceId)
  if (kind === 'docx') return parseDocxFile(file, sourceId)
  throw adapterError('unsupported-type', `暂不支持导入 ${text(file?.name) || '该文件'}。`)
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
  return Promise.all(list.map(async (file) => {
    try {
      const parsed = await parseSourceFile(file, options)
      return { status: 'ready', fileName: text(file?.name), ...parsed }
    } catch (error) {
      return {
        status: 'error',
        fileName: text(file?.name),
        error: serializeError(error)
      }
    }
  }))
}
