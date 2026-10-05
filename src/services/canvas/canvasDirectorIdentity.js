import { SHOT_TYPES, CAMERA_MOVEMENTS } from '../../types/director.js'
import { findWritingBook, loadWritingBooks } from '../writing/writingBooksRepository.js'

export function resolveDirectorExportTitle({ topic, savedDocument, sourceAssets = [], projectId = null }, books = loadWritingBooks()) {
  const explicitTitle = String(topic || '').trim()
  if (explicitTitle) return explicitTitle
  const savedTitle = (savedDocument?.projectId || null) === projectId
    ? String(savedDocument?.source?.title || '').trim() : ''
  if (savedTitle && !['卡片画布', '未命名', '分镜脚本'].includes(savedTitle)) return savedTitle
  const sourceTitle = sourceAssets.find((asset) => asset && (asset.projectId || null) === projectId && String(asset.title || '').trim())?.title
  return String(sourceTitle || findWritingBook(books, projectId)?.title || '卡片画布').trim()
}

export function createDirectorExportFingerprint(shots, topic, sourceRefs = []) {
  return JSON.stringify({
    // Rebuild versions normalized before the canvas vocabulary was supported.
    vocabulary: [Object.keys(SHOT_TYPES), Object.keys(CAMERA_MOVEMENTS)],
    topic: String(topic || '').trim(),
    sourceRefs: sourceRefs.map((ref) => [
      ref.refType,
      ref.refId,
      ref.projectId || '',
      ref.version || ''
    ]),
    shots: (shots || []).map((shot) => [
      shot.sequence,
      shot.assetId,
      shot.content,
      shot.shotType,
      shot.camera,
      shot.duration,
      shot.dialogue,
      shot.sound,
      shot.transition,
      shot.relationType,
      shot.relationLabel,
      shot.tone,
      shot.emotion,
      JSON.stringify(shot.imageReferences || [])
    ])
  })
}
