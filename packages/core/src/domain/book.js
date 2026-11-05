import { normalizeChapterRecord } from './chapter.js'

function text(value) {
  return String(value ?? '').trim()
}

/**
 * 作品（书）的 Core 规范形状。旧数据 title 缺失时回退 legacy `name`（只读兼容，不删原字段）。
 * 章节按 ChapterStore 的形状归一化；未知字段原样保留给宿主继续用。空标题合法，显示文案归 Host。
 */
export function normalizeBookRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = text(raw.id)
  if (!id) return null
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map((chapter) => normalizeChapterRecord(chapter, { bookId: id }))
    .filter(Boolean)
  return {
    ...raw,
    id,
    title: text(raw.title ?? raw.name),
    description: typeof raw.description === 'string' ? raw.description : '',
    worldbookId: text(raw.worldbookId),
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null,
    chapters
  }
}

export function createBookRecord({
  id,
  title,
  description = '',
  worldbookId = '',
  manuscriptLanguage = '',
  now = new Date().toISOString(),
  extra = {}
} = {}) {
  const normalizedId = text(id)
  if (!normalizedId) return null
  const record = {
    ...extra,
    id: normalizedId,
    title: text(title),
    description: typeof description === 'string' ? description.trim() : '',
    worldbookId: text(worldbookId),
    createdAt: now,
    updatedAt: now,
    chapters: []
  }
  const language = text(manuscriptLanguage)
  if (language) record.manuscriptLanguage = language
  return record
}

export function bookSummary(book) {
  return {
    id: book.id,
    title: book.title,
    chapterCount: Array.isArray(book.chapters) ? book.chapters.length : 0,
    updatedAt: book.updatedAt ?? null
  }
}
