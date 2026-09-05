import { getChapterMarkdown } from './writingDocumentSchema.js'

const MARKDOWN_MIME = 'text/markdown;charset=utf-8'

function safeFilename(value, fallback) {
  const normalized = String(value || '')
    .replace(/[\\/:*?"<>|：／？＊＂＜＞｜＼]+/g, '_')
    .replace(/\p{Cc}+/gu, '_')
    .replace(/[.\s]+$/g, '')
    .trim()
    .slice(0, 96)
  return normalized || fallback
}

function chapterContent(chapter) {
  return String(getChapterMarkdown(chapter) || '').trim()
}

function renderChapter(chapter, index = 0) {
  const title = String(chapter?.title || `第 ${index + 1} 章`).trim()
  const body = chapterContent(chapter)
  return `# ${title}${body ? `\n\n${body}` : ''}`
}

export function buildChapterManuscriptExport({ book = null, chapter = null } = {}) {
  if (!chapter) throw new Error('请选择要导出的章节')
  const bookName = safeFilename(book?.title, '未命名作品')
  const chapterName = safeFilename(chapter?.title, '未命名章节')
  return {
    filename: `${bookName}-${chapterName}.md`,
    mimeType: MARKDOWN_MIME,
    content: `${renderChapter(chapter)}\n`
  }
}

export function buildBookManuscriptExport({ book = null } = {}) {
  if (!book) throw new Error('请选择要导出的书籍')
  const chapters = Array.isArray(book.chapters) ? book.chapters : []
  const content = chapters.length
    ? chapters.map((chapter, index) => renderChapter(chapter, index)).join('\n\n---\n\n')
    : `# ${String(book.title || '未命名作品').trim()}`
  return {
    filename: `${safeFilename(book.title, '未命名作品')}.md`,
    mimeType: MARKDOWN_MIME,
    content: `${content}\n`
  }
}
