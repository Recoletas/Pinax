import { detectEncodingFromBytes, SOURCE_ENCODING_CANDIDATES } from './encodingDetector.js'

const MAX_MANUSCRIPT_BYTES = 5 * 1024 * 1024
const MAX_MANUSCRIPT_CHARS = 1_000_000
const MAX_MANUSCRIPT_CHAPTERS = 500

const PLAIN_CHAPTER_HEADING = /^(第.{1,18}[章回卷部篇]|序章|楔子|引子|前言|后记|尾声|终章|番外(?:[一二三四五六七八九十百千0-9]+)?)\s*(.*)$/u
const MARKDOWN_HEADING = /^(#{1,2})[ \t]+(.+?)\s*#*\s*$/u
const DIVIDER = /^\s*(?:---+|\*\s*\*\s*\*)\s*$/u

function normalizeText(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/g, '\n')
}

function filenameStem(filename = '') {
  return String(filename || '')
    .replace(/^.*[\\/]/u, '')
    .replace(/\.(?:txt|md|markdown)$/iu, '')
    .trim()
}

function cleanHeading(value, fallback = '未命名章节') {
  return String(value || '')
    .replace(/^[#\s]+|[#\s]+$/gu, '')
    .trim()
    .slice(0, 120) || fallback
}

function meaningfulBody(lines) {
  const copy = [...lines]
  while (copy.length && (!copy[0].trim() || DIVIDER.test(copy[0]))) copy.shift()
  while (copy.length && (!copy.at(-1).trim() || DIVIDER.test(copy.at(-1)))) copy.pop()
  return copy.join('\n').trim()
}

function collectMarkers(lines) {
  const markdown = []
  const plain = []

  lines.forEach((line, index) => {
    const md = line.match(MARKDOWN_HEADING)
    if (md) {
      markdown.push({ index, level: md[1].length, title: cleanHeading(md[2]) })
      return
    }
    const chapter = line.trim().match(PLAIN_CHAPTER_HEADING)
    if (chapter) plain.push({ index, level: 0, title: cleanHeading(`${chapter[1]}${chapter[2] ? ` ${chapter[2].trim()}` : ''}`) })
  })

  const h1 = markdown.filter((item) => item.level === 1)
  const h2 = markdown.filter((item) => item.level === 2)
  if (h1.length >= 2) return { markers: h1, documentTitle: '', documentHeadingIndex: -1 }
  if (h2.length) {
    const documentHeading = h1.length === 1 && h1[0].index < h2[0].index ? h1[0] : null
    return { markers: h2, documentTitle: documentHeading?.title || '', documentHeadingIndex: documentHeading?.index ?? -1 }
  }
  if (plain.length) return { markers: plain, documentTitle: h1[0]?.title || '', documentHeadingIndex: h1[0]?.index ?? -1 }
  if (h1.length === 1) return { markers: h1, documentTitle: '', documentHeadingIndex: -1 }
  return { markers: [], documentTitle: '', documentHeadingIndex: -1 }
}

function splitByMarkers(lines, markers) {
  if (!markers.length) return []
  const chapters = []
  const preface = meaningfulBody(lines.slice(0, markers[0].index))
  if (preface) chapters.push({ title: '卷首', content: preface })

  markers.forEach((marker, markerIndex) => {
    const nextIndex = markers[markerIndex + 1]?.index ?? lines.length
    chapters.push({
      title: marker.title,
      content: meaningfulBody(lines.slice(marker.index + 1, nextIndex))
    })
  })
  return chapters
}

export function parseManuscriptText({ text, filename = '' } = {}) {
  const normalized = normalizeText(text)
  if (!normalized.trim()) return { ok: false, reason: 'empty', message: '文件里没有可导入的正文。' }
  if (normalized.length > MAX_MANUSCRIPT_CHARS) {
    return { ok: false, reason: 'too-large', message: '正文超过 100 万字符，请拆成多本或多个文件后再导入。' }
  }

  const lines = normalized.split('\n')
  const { markers, documentTitle, documentHeadingIndex } = collectMarkers(lines)
  const chapterLines = documentHeadingIndex >= 0
    ? lines.map((line, index) => index === documentHeadingIndex ? '' : line)
    : lines
  const fallbackTitle = filenameStem(filename) || documentTitle || '导入书稿'
  const autoChapters = splitByMarkers(chapterLines, markers)
  const chapters = autoChapters.length
    ? autoChapters
    : [{ title: '正文', content: meaningfulBody(lines) }]

  if (chapters.length > MAX_MANUSCRIPT_CHAPTERS) {
    return { ok: false, reason: 'too-many-chapters', message: `识别到 ${chapters.length} 章，超过单次导入上限 ${MAX_MANUSCRIPT_CHAPTERS} 章。` }
  }

  return {
    ok: true,
    title: cleanHeading(documentTitle || fallbackTitle, '导入书稿'),
    filename: String(filename || ''),
    text: normalized,
    charCount: normalized.length,
    detected: markers.length > 0,
    chapters
  }
}

export function buildSingleChapterPreview(parsed) {
  if (!parsed?.ok) return []
  return [{ title: '正文', content: String(parsed.text || '').trim() }]
}

export function createImportedWritingBook({ title, chapters, now = () => new Date(), idFactory = null } = {}) {
  const normalizedTitle = cleanHeading(title, '')
  const normalizedChapters = (Array.isArray(chapters) ? chapters : [])
    .map((chapter, index) => ({
      title: cleanHeading(chapter?.title, `第 ${index + 1} 章`),
      content: normalizeText(chapter?.content).trim()
    }))
    .filter((chapter) => chapter.title || chapter.content)

  if (!normalizedTitle) return { ok: false, reason: 'title-required' }
  if (!normalizedChapters.length) return { ok: false, reason: 'chapters-required' }

  const timestamp = now()
  const iso = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString()
  const seed = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
  const nonce = Math.random().toString(36).slice(2, 8)
  const makeId = typeof idFactory === 'function'
    ? idFactory
    : (kind, index = 0) => `${kind}-${seed.toString(36)}-${nonce}-${index + 1}`

  return {
    ok: true,
    book: {
      id: String(makeId('book', 0)),
      title: normalizedTitle,
      description: '由本地 TXT / Markdown 书稿导入',
      worldbookId: '',
      createdAt: iso,
      updatedAt: iso,
      chapters: normalizedChapters.map((chapter, index) => ({
        id: String(makeId('chapter', index)),
        title: chapter.title,
        content: chapter.content,
        contentFormat: 'md',
        outlineItems: [],
        wordCount: chapter.content.replace(/\s/gu, '').length,
        createdAt: iso,
        updatedAt: iso
      }))
    }
  }
}

export function validateManuscriptFile(file) {
  if (!file) return { ok: false, message: '请选择 TXT 或 Markdown 文件。' }
  const name = String(file.name || '')
  if (!/\.(?:txt|md|markdown)$/iu.test(name)) {
    return { ok: false, message: '目前只支持 .txt、.md 和 .markdown 文件。' }
  }
  if (Number(file.size || 0) > MAX_MANUSCRIPT_BYTES) {
    return { ok: false, message: '文件超过 5 MB，请拆分后再导入。' }
  }
  return { ok: true }
}

export function decodeManuscriptBytes(bytes, encoding = 'auto') {
  const source = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes || [])
  if (!source.length) return { ok: false, message: '文件里没有可导入的正文。' }

  if (encoding === 'auto') {
    const detected = detectEncodingFromBytes(source)
    if (!detected.text) return { ok: false, message: detected.warnings[0] || '无法读取文件编码。' }
    return { ok: true, ...detected }
  }

  if (!SOURCE_ENCODING_CANDIDATES.includes(encoding)) {
    return { ok: false, message: '不支持所选文件编码。' }
  }
  try {
    const text = new TextDecoder(encoding, { fatal: true }).decode(source)
    return { ok: true, encoding, confidence: 'manual', text, candidates: [], warnings: [] }
  } catch {
    return { ok: false, message: `无法按 ${encoding} 读取这份文件，请尝试其他编码。` }
  }
}

export const MANUSCRIPT_IMPORT_LIMITS = Object.freeze({
  maxBytes: MAX_MANUSCRIPT_BYTES,
  maxChars: MAX_MANUSCRIPT_CHARS,
  maxChapters: MAX_MANUSCRIPT_CHAPTERS
})
