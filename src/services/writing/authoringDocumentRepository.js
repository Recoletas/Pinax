import { loadWritingBooks, saveWritingBooks } from './writingBooksRepository'

// Authoring 文档仓库（文本工作台 v3 Phase 1）：
// 同一本书的两类文档角色共用 writingDocument schema 与编辑器，
// 正文写回 book.chapters[]，探索写入书级 explorationDocuments[]。
// 薄层：不复制章节加载管线，只提供 handle 语义与探索文档的持久化边界。

export const AUTHORING_DOCUMENT_ROLES = Object.freeze(['exploration', 'manuscript'])

function normalizeBooks(books) {
  return Array.isArray(books) ? books : []
}

function findBook(books, bookId) {
  return normalizeBooks(books).find((book) => String(book?.id) === String(bookId || '')) || null
}

function readBook(bookId) {
  return findBook(loadWritingBooks(), bookId)
}

function mutateBook(bookId, mutator) {
  const books = loadWritingBooks()
  const book = findBook(books, bookId)
  if (!book) return { ok: false, reason: 'book-missing' }
  const result = mutator(book)
  if (result === false) return { ok: false, reason: 'mutator-rejected' }
  if (!saveWritingBooks(books)) return { ok: false, reason: 'persist' }
  return { ok: true, book }
}

function normalizeExplorationDocument(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim()
  if (!id) return null
  return {
    id,
    role: 'exploration',
    title: String(raw.title || '未命名探索').trim() || '未命名探索',
    content: String(raw.content || ''),
    // writingDocument schema v3 由编辑器管线按需同步；这里只保底 content。
    outlineNodeIds: [...new Set(Array.isArray(raw.outlineNodeIds) ? raw.outlineNodeIds.map(String).filter(Boolean) : [])],
    status: ['active', 'adopted', 'parked'].includes(raw.status) ? raw.status : 'active',
    annotations: Array.isArray(raw.annotations) ? raw.annotations : [],
    sourceRefs: [...new Set(Array.isArray(raw.sourceRefs) ? raw.sourceRefs.map(String).filter(Boolean) : [])],
    revision: Number(raw.revision || 0),
    createdAt: raw.createdAt || '1970-01-01T00:00:00.000Z',
    updatedAt: raw.updatedAt || raw.createdAt || '1970-01-01T00:00:00.000Z'
  }
}

// 稳定文档 key：快照/恢复/块历史共用。正文保持旧 chapter key 兼容。
export function authoringDocumentKey(handle) {
  if (!handle) return ''
  if (handle.role === 'manuscript') return `chapter:${handle.chapterId || handle.documentId}`
  return `exploration:${handle.bookId}:${handle.documentId}`
}

export function createDocumentHandle({ bookId, role, documentId, chapterId = null, title = '', revision = 0 }) {
  if (!AUTHORING_DOCUMENT_ROLES.includes(role)) return null
  if (!String(bookId || '').trim()) return null
  if (role === 'manuscript' && !String(chapterId || documentId || '').trim()) return null
  if (role === 'exploration' && !String(documentId || '').trim()) return null
  return Object.freeze({
    bookId: String(bookId),
    role,
    documentId: String(documentId || chapterId || ''),
    chapterId: chapterId ? String(chapterId) : null,
    title: String(title || ''),
    revision: Number(revision || 0)
  })
}

export function listExplorationDocuments(bookId) {
  const book = readBook(bookId)
  const docs = Array.isArray(book?.explorationDocuments) ? book.explorationDocuments : []
  return docs.map(normalizeExplorationDocument).filter(Boolean)
}

export function getExplorationDocument(bookId, documentId) {
  const wanted = String(documentId || '')
  return listExplorationDocuments(bookId).find((doc) => doc.id === wanted) || null
}

export function createExplorationDocument(bookId, { title = '未命名探索', content = '', outlineNodeIds = [], sourceRefs = [] } = {}) {
  const now = new Date().toISOString()
  const doc = normalizeExplorationDocument({
    id: `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    content,
    outlineNodeIds,
    sourceRefs,
    revision: 1,
    createdAt: now,
    updatedAt: now
  })
  if (!doc) return { ok: false, reason: 'invalid-document' }
  const result = mutateBook(bookId, (book) => {
    if (!Array.isArray(book.explorationDocuments)) book.explorationDocuments = []
    book.explorationDocuments.push(doc)
    book.updatedAt = now
  })
  return result.ok ? { ok: true, document: doc } : result
}

export function saveExplorationDocument(bookId, documentId, { title = null, content = null, status = null, outlineNodeIds = null, annotations = null } = {}) {
  const result = mutateBook(bookId, (book) => {
    const docs = Array.isArray(book.explorationDocuments) ? book.explorationDocuments : []
    const doc = docs.find((item) => String(item?.id) === String(documentId))
    if (!doc) return false
    if (typeof title === 'string' && title.trim()) doc.title = title.trim()
    if (typeof content === 'string') doc.content = content
    if (status && ['active', 'adopted', 'parked'].includes(status)) doc.status = status
    if (Array.isArray(outlineNodeIds)) doc.outlineNodeIds = [...new Set(outlineNodeIds.map(String).filter(Boolean))]
    if (Array.isArray(annotations)) doc.annotations = annotations
    doc.revision = Number(doc.revision || 0) + 1
    doc.updatedAt = new Date().toISOString()
    book.updatedAt = doc.updatedAt
  })
  return result.ok ? { ok: true, document: getExplorationDocument(bookId, documentId) } : result
}

// 删除探索文档绝不触碰正文：只从 explorationDocuments 移除，
// 大纲节点上的引用转为悬空（由大纲层提示修复），chapterRefs 不变。
export function deleteExplorationDocument(bookId, documentId) {
  const result = mutateBook(bookId, (book) => {
    const docs = Array.isArray(book.explorationDocuments) ? book.explorationDocuments : []
    const next = docs.filter((item) => String(item?.id) !== String(documentId))
    if (next.length === docs.length) return false
    book.explorationDocuments = next
    book.updatedAt = new Date().toISOString()
  })
  return result.ok ? { ok: true } : result
}

// 位置与 revision 解析（Phase 1）：给定文档与稳定 target，
// 返回该 target 在文档内的确定位置与各级 revision。
// 书级 chapter order / before-at-after 判定归 Phase 3 的 position index，不在这里。
export function resolveAuthoringDocumentPosition({ document = null, unitId = null, nodeId = null } = {}) {
  if (!document || !Array.isArray(document.content)) return null
  const unitIndex = document.content.findIndex((unit) => unit?.attrs?.unitId === String(unitId || ''))
  if (unitIndex < 0) return null
  const unit = document.content[unitIndex]
  const nodeIndex = Array.isArray(unit.content)
    ? unit.content.findIndex((node) => node?.attrs?.nodeId === String(nodeId || ''))
    : -1
  return {
    role: 'document',
    unitIndex,
    unitId: unit.attrs.unitId,
    unitRevision: Number(unit.attrs.unitRevision || 0),
    nodeIndex: nodeIndex >= 0 ? nodeIndex : null,
    nodeId: nodeIndex >= 0 ? String(nodeId) : null,
    nodeRevision: nodeIndex >= 0 ? Number(unit.content[nodeIndex]?.attrs?.nodeRevision || 0) : null,
    documentRevision: Number(document.revision || 0),
    // unit 前的既立文本量（字符），供上下文编译器判断“光标前文”。
    charsBeforeUnit: document.content
      .slice(0, unitIndex)
      .reduce((total, item) => total + (item?.content || []).reduce((sum, node) => {
        const nodeText = (node?.content || []).reduce((text, child) => text + String(child?.text || ''), '')
        return sum + nodeText.length
      }, 0), 0)
  }
}
