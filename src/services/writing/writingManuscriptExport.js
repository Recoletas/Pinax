import { defaultWritingTitle } from '../../../shared/writingLanguage.js'
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

function renderChapter(chapter, index = 0, language = '') {
  const title = String(chapter?.title || defaultWritingTitle('chapter', language, index + 1)).trim()
  const body = chapterContent(chapter)
  return `# ${title}${body ? `\n\n${body}` : ''}`
}

export function buildChapterManuscriptExport({ book = null, chapter = null } = {}) {
  if (!chapter) throw new Error('请选择要导出的章节')
  const bookName = safeFilename(book?.title, defaultWritingTitle('book', book?.manuscriptLanguage))
  const chapterName = safeFilename(chapter?.title, defaultWritingTitle('chapter', book?.manuscriptLanguage))
  return {
    filename: `${bookName}-${chapterName}.md`,
    mimeType: MARKDOWN_MIME,
    content: `${renderChapter(chapter, 0, book?.manuscriptLanguage)}\n`
  }
}

export function buildBookManuscriptExport({ book = null } = {}) {
  if (!book) throw new Error('请选择要导出的书籍')
  const chapters = Array.isArray(book.chapters) ? book.chapters : []
  const content = chapters.length
    ? chapters.map((chapter, index) => renderChapter(chapter, index, book.manuscriptLanguage)).join('\n\n---\n\n')
    : `# ${String(book.title || defaultWritingTitle('book', book.manuscriptLanguage)).trim()}`
  return {
    filename: `${safeFilename(book.title, defaultWritingTitle('book', book.manuscriptLanguage))}.md`,
    mimeType: MARKDOWN_MIME,
    content: `${content}\n`
  }
}
