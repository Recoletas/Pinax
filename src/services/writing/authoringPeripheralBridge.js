// 文本工作台 v3 Phase 11：外围模块只向 Authoring 核心提交稳定引用或 exploration/intent。

import { createExplorationDocument, listExplorationDocuments } from './authoringDocumentRepository.js'
import { upsertOutlineNode } from './projectOutlineRepository.js'

function text(value) { return String(value ?? '').trim() }

export function migrateWritingNotesToExplorations(bookId, notes = []) {
  const projectId = text(bookId)
  if (!projectId) return { ok: false, reason: 'book-missing', created: [], skipped: [] }
  const existingRefs = new Set(listExplorationDocuments(projectId)
    .flatMap((doc) => doc.sourceRefs || []))
  const created = []
  const skipped = []
  for (const note of Array.isArray(notes) ? notes : []) {
    const noteId = text(note?.id)
    const content = text(note?.content)
    const ref = noteId ? `writing-note:${noteId}` : ''
    if (!noteId || !content || existingRefs.has(ref)) {
      skipped.push(noteId || 'invalid')
      continue
    }
    const result = createExplorationDocument(projectId, {
      title: text(note.title) || '迁移速记',
      content,
      sourceRefs: [ref]
    })
    if (!result.ok) return { ok: false, reason: result.reason || 'persist', created, skipped }
    created.push(result.document)
    existingRefs.add(ref)
  }
  return { ok: true, created, skipped }
}

export function createExperienceSuggestionExploration(bookId, suggestion = {}) {
  const content = text(suggestion.content)
  if (!content) return { ok: false, reason: 'content-empty' }
  const refs = [
    suggestion.sessionId ? `experience-session:${text(suggestion.sessionId)}` : '',
    suggestion.messageId ? `experience-message:${text(suggestion.messageId)}` : ''
  ].filter(Boolean)
  return createExplorationDocument(bookId, {
    title: text(suggestion.title) || '体验建议',
    content,
    sourceRefs: refs
  })
}

export function createExperienceSceneIntent(bookId, suggestion = {}) {
  const intent = text(suggestion.intent || suggestion.content)
  if (!intent) return { ok: false, reason: 'intent-empty' }
  return upsertOutlineNode(bookId, {
    id: text(suggestion.id),
    title: text(suggestion.title) || '体验场景安排',
    intent,
    status: 'planned',
    entityRefs: Array.isArray(suggestion.entityRefs) ? suggestion.entityRefs : [],
    sourceRefs: [suggestion.sessionId ? `experience-session:${text(suggestion.sessionId)}` : ''].filter(Boolean)
  })
}

export function buildCanvasAuthoringReference(input = {}) {
  const kind = ['outline', 'exploration', 'manuscript', 'asset'].includes(input.kind) ? input.kind : ''
  const id = text(input.id)
  const projectId = text(input.projectId)
  if (!kind || !id || !projectId) return null
  return Object.freeze({ kind, id, projectId, revision: text(input.revision) })
}
