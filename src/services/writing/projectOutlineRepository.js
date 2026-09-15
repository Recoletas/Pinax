// 项目级大纲仓库（文本工作台 v3 Phase 3）：
// 大纲只保存简短 intent、层级顺序、少量叙事关系、document/unit/entity refs、
// 章节映射与 adopted/rejected。不得复制探索全文、正文全文或世界书条目。
// 真源：书级 outlineNodes[] / outlineEdges[]。节点允许零章节映射。
import { findWritingBook, loadWritingBooks, saveWritingBooksDurable } from './writingBooksRepository.js'
import { mutationFailure, mutationSuccess } from '../storage/durableMutationResult.js'

export const OUTLINE_SCHEMA_VERSION = 1

export const OUTLINE_NODE_STATUSES = Object.freeze([
  'exploring', 'planned', 'drafted', 'fulfilled', 'parked'
])

export const OUTLINE_EDGE_KINDS = Object.freeze([
  'causes', 'foreshadows', 'alternative', 'parallel'
])

export const EXPLORATION_REF_STATES = Object.freeze([
  'proposed', 'adopted', 'rejected'
])

function stableId(prefix, seed) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function text(value) {
  return String(value ?? '').trim()
}

function unique(values) {
  return [...new Set(values)]
}

export function normalizeOutlineNode(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const id = text(source.id) || stableId('node', `${text(source.title)}:${text(source.intent)}`)
  const chapterRefs = unique((Array.isArray(source.chapterRefs) ? source.chapterRefs : [])
    .map((ref) => text(typeof ref === 'object' ? ref?.chapterId : ref))
    .filter(Boolean))
  const seenExplorations = new Set()
  const explorationRefs = (Array.isArray(source.explorationRefs) ? source.explorationRefs : [])
    .map((ref) => {
      if (typeof ref === 'string') return { documentId: ref, role: 'alternative', state: 'proposed' }
      const documentId = text(ref?.documentId)
      if (!documentId) return null
      return {
        documentId,
        role: text(ref.role) || 'alternative',
        state: EXPLORATION_REF_STATES.includes(ref?.state) ? ref.state : 'proposed'
      }
    })
    .filter(Boolean)
    .filter((ref) => {
      if (seenExplorations.has(ref.documentId)) return false
      seenExplorations.add(ref.documentId)
      return true
    })
  return Object.freeze({
    schemaVersion: OUTLINE_SCHEMA_VERSION,
    id,
    title: text(source.title) || '未命名节点',
    intent: text(source.intent),
    parentId: text(source.parentId) || null,
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0,
    status: OUTLINE_NODE_STATUSES.includes(source.status) ? source.status : 'exploring',
    chapterRefs,
    explorationRefs,
    entityRefs: unique((Array.isArray(source.entityRefs) ? source.entityRefs : []).map((ref) => text(typeof ref === 'object' ? ref?.entityId : ref)).filter(Boolean)),
    unitRefs: (Array.isArray(source.unitRefs) ? source.unitRefs : [])
      .map((ref) => ({ chapterId: text(typeof ref === 'object' ? ref?.chapterId : ref), unitId: text(typeof ref === 'object' ? ref?.unitId : ref) }))
      .filter((ref) => ref.unitId),
    sourceRefs: unique(Array.isArray(source.sourceRefs) ? source.sourceRefs.map(text).filter(Boolean) : []),
    // 迁移来源：旧 chapter.outlineItems 的 item id（幂等迁移依据）。
    migrationSource: text(source.migrationSource),
    revision: Number.isFinite(Number(source.revision)) ? Math.max(0, Number(source.revision)) : 0
  })
}

export function normalizeOutlineEdge(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const fromNodeId = text(source.fromNodeId || source.from)
  const toNodeId = text(source.toNodeId || source.to)
  const kind = OUTLINE_EDGE_KINDS.includes(source.kind) ? source.kind : 'causes'
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return null
  return Object.freeze({
    schemaVersion: OUTLINE_SCHEMA_VERSION,
    id: text(source.id) || stableId('edge', `${kind}:${fromNodeId}:${toNodeId}`),
    kind,
    fromNodeId,
    toNodeId,
    sourceRefs: Array.isArray(source.sourceRefs) ? source.sourceRefs.map(text).filter(Boolean) : []
  })
}

export function normalizeOutlineNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map(normalizeOutlineNode)
}

export function normalizeOutlineEdges(edges) {
  const seen = new Set()
  const result = []
  for (const edge of (Array.isArray(edges) ? edges : []).map(normalizeOutlineEdge)) {
    if (!edge) continue
    const key = `${edge.kind}:${edge.fromNodeId}:${edge.toNodeId}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(edge)
  }
  return result
}

// 确定性指纹：大纲调整（节点/边/映射/状态）即变化，供挂起请求 stale 判定。
export function fingerprintOutline(nodes, edges) {
  const source = [
    ...normalizeOutlineNodes(nodes).map((node) => JSON.stringify(node)),
    ...normalizeOutlineEdges(edges).map((edge) => JSON.stringify(edge))
  ].sort().join('|')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `outline-${(hash >>> 0).toString(36)}`
}

function readBook(bookId) {
  return findWritingBook(loadWritingBooks(), bookId)
}

function writeBook(bookId, mutator) {
  const books = loadWritingBooks()
  const book = findWritingBook(books, bookId)
  if (!book) return mutationFailure('book-missing')
  const rejected = mutator(book)
  if (rejected === false) return mutationFailure('mutator-rejected')
  book.updatedAt = new Date().toISOString()
  const persisted = saveWritingBooksDurable(books)
  return persisted.ok ? mutationSuccess({ revision: persisted.revision }) : persisted
}

export function listOutlineNodes(bookId) {
  const book = readBook(bookId)
  return normalizeOutlineNodes(book?.outlineNodes)
}

export function listOutlineEdges(bookId) {
  const book = readBook(bookId)
  return normalizeOutlineEdges(book?.outlineEdges)
}

export function getOutlineNode(bookId, nodeId) {
  return listOutlineNodes(bookId).find((node) => node.id === String(nodeId || '')) || null
}

export function upsertOutlineNode(bookId, input) {
  const node = normalizeOutlineNode(input)
  const existing = getOutlineNode(bookId, node.id)
  const result = writeBook(bookId, (book) => {
    const nodes = normalizeOutlineNodes(book.outlineNodes)
    const index = nodes.findIndex((item) => item.id === node.id)
    const next = index >= 0
      ? nodes.map((item, i) => (i === index ? { ...node, revision: Number(item.revision || 0) + 1 } : item))
      : [...nodes, node]
    book.outlineNodes = next
  })
  return result.ok
    ? mutationSuccess({ node: getOutlineNode(bookId, node.id), created: !existing, revision: result.revision })
    : result
}

// 边校验：拒绝悬空端点与自环；端点必须同项目。
export function addOutlineEdge(bookId, input) {
  const fromId = text(input?.fromNodeId || input?.from)
  const toId = text(input?.toNodeId || input?.to)
  if (fromId && fromId === toId) return mutationFailure('self-loop')
  const edge = normalizeOutlineEdge(input)
  if (!edge) return mutationFailure('invalid-edge')
  const nodes = listOutlineNodes(bookId)
  const ids = new Set(nodes.map((node) => node.id))
  if (!ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId)) {
    return mutationFailure('dangling-endpoint')
  }
  if (edge.fromNodeId === edge.toNodeId) return mutationFailure('self-loop')
  const edges = listOutlineEdges(bookId)
  if (edges.some((item) => item.id === edge.id)) return mutationSuccess({ edge, deduped: true })
  const result = writeBook(bookId, (book) => {
    book.outlineEdges = [...edges, edge]
  })
  return result.ok ? mutationSuccess({ edge, revision: result.revision }) : result
}

export function removeOutlineEdge(bookId, edgeId) {
  return writeBook(bookId, (book) => {
    book.outlineEdges = normalizeOutlineEdges(book.outlineEdges).filter((edge) => edge.id !== String(edgeId || ''))
  })
}

// 章节删除/重排只更新映射，不删节点。
export function updateChapterMapping(bookId, nodeId, { addChapterId = null, removeChapterId = null } = {}) {
  return writeBook(bookId, (book) => {
    const nodes = normalizeOutlineNodes(book.outlineNodes)
    book.outlineNodes = nodes.map((node) => {
      if (node.id !== String(nodeId || '')) return node
      let chapterRefs = node.chapterRefs.filter((id) => id !== String(removeChapterId || ''))
      if (addChapterId && !chapterRefs.includes(String(addChapterId))) chapterRefs = [...chapterRefs, String(addChapterId)]
      if (chapterRefs.length === node.chapterRefs.length && chapterRefs.every((id, index) => id === node.chapterRefs[index])) return node
      return { ...node, chapterRefs, revision: Number(node.revision || 0) + 1 }
    })
  })
}
