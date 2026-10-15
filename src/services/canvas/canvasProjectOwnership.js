import { findWritingBook, loadWritingBooks } from '../writing/writingBooksRepository.js'

// Capture only a real, explicitly selected book when creating new material.
// Existing unowned cards must never inherit whichever book is currently open.
export function resolveCanvasCreationProjectId(bookId, books = loadWritingBooks()) {
  return findWritingBook(books, String(bookId || '').trim())?.id || null
}

export function resolveCanvasCardProjectId(card, asset) {
  return (asset ? asset.projectId : card?.projectId) || null
}

export function getDirectorProjectId(sourceRefs = []) {
  const cardOwners = new Set(sourceRefs.filter((ref) => ref?.refType === 'canvas-card').map((ref) => ref.projectId || null))
  const projectIds = [...new Set(sourceRefs.map((ref) => ref?.projectId).filter(Boolean))]
  if (cardOwners.size > 1 || projectIds.length > 1) {
    throw new Error('分镜保存失败：时间轴含有不同作品或未归属的素材，请先保留同一作品的镜头')
  }
  return cardOwners.size === 1 && cardOwners.has(null) ? null : projectIds[0] || null
}
