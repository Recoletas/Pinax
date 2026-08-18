import { parseNarrativePresentation } from '../narrativePresentation.js'
import {
  getWritingDocumentMarkdown,
  getWritingDocumentPlainText,
  migrateWritingDocumentToV3,
  normalizeWritingOriginRefs,
  validateWritingDocument
} from './writingDocumentSchema.js'

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function asIdSet(values) {
  if (values instanceof Set) return values
  return new Set(Array.isArray(values) ? values.map(String) : [])
}

function resolveExperienceAssistantMessage({ turn, message, messages } = {}) {
  if (message) return message
  const assistantMessageIds = asIdSet(turn?.assistantMessageIds)
  const eligible = (Array.isArray(messages) ? messages : []).filter((candidate) => (
    assistantMessageIds.has(String(candidate?.id || ''))
    && candidate?.role === 'assistant'
    && !candidate?.superseded
    && String(candidate?.content || '').trim()
  ))
  return eligible.length === 1 ? eligible[0] : null
}

export function getWritingOriginFingerprint(originRef) {
  if (!originRef || originRef.type !== 'experience-turn') return ''
  return [
    originRef.type,
    originRef.sessionId,
    originRef.branchId || 'main',
    originRef.turnId,
    originRef.messageId,
    Math.max(1, Number(originRef.sourceRevision || 1))
  ].map((value) => String(value ?? '')).join('\u0000')
}

export function getExperienceTurnImportEligibility(input = {}) {
  const { turn, activeTurnIds } = input
  const message = resolveExperienceAssistantMessage(input)
  const activeIds = asIdSet(activeTurnIds)
  const messageId = String(message?.id || '')
  if (!turn?.id || turn.status !== 'committed' || !messageId) return 'ineligible-turn'
  if (message?.role !== 'assistant' || message.superseded || !String(message.content || '').trim()) return 'ineligible-turn'
  if (!Array.isArray(turn.assistantMessageIds) || !turn.assistantMessageIds.map(String).includes(messageId)) return 'ineligible-turn'
  if (activeIds.size && !activeIds.has(String(turn.id))) return 'ineligible-turn'
  return null
}

function createNode(block, index) {
  const quote = block.kind === 'dialogue' || block.kind === 'thought'
  const text = String(block.text || '').trim()
  return {
    type: quote ? 'quote' : 'paragraph',
    attrs: {
      nodeId: createId(`node-experience-${index + 1}`),
      nodeRevision: 0,
      kind: quote ? 'quote' : 'prose',
      rawMarkdown: null,
      leadingMarkdown: index > 0 ? '\n' : '',
      originalText: null
    },
    content: [{ type: 'text', text }]
  }
}

export function createWritingUnitFromExperienceTurn(input = {}) {
  const { turn } = input
  const message = resolveExperienceAssistantMessage(input)
  const eligibility = getExperienceTurnImportEligibility(input)
  if (eligibility) return { ok: false, reason: eligibility }

  const originRef = normalizeWritingOriginRefs([{
    type: 'experience-turn',
    sessionId: input.sessionId,
    branchId: input.branchId || message.branchId || turn.branchId || 'main',
    turnId: turn.id,
    messageId: message.id,
    worldbookId: input.worldbookId || '',
    sourceRevision: Math.max(1, Number(message.sourceRevision ?? message.revision ?? turn.sourceRevision ?? 1))
  }])[0]
  if (!originRef) return { ok: false, reason: 'ineligible-turn' }

  const presentation = parseNarrativePresentation(message.content, {
    complete: true,
    messageId: message.id
  })
  const blocks = (presentation.blocks || []).filter((block) => (
    ['narration', 'dialogue', 'action', 'thought'].includes(block?.kind)
    && String(block?.text || '').trim()
  ))
  if (!blocks.length) return { ok: false, reason: 'empty-turn' }

  const unit = {
    type: 'writingUnit',
    attrs: {
      unitId: createId('unit-experience'),
      unitRevision: 0,
      kind: 'passage',
      sceneId: null,
      originRefs: [originRef]
    },
    content: blocks.map(createNode)
  }
  return { ok: true, unit, originRef, fingerprint: getWritingOriginFingerprint(originRef) }
}

export function appendExperienceTurnToChapter(input = {}) {
  const created = createWritingUnitFromExperienceTurn(input)
  if (!created.ok) return { ...created, books: input.books }

  const books = clone(Array.isArray(input.books) ? input.books : [])
  const book = books.find((item) => String(item?.id) === String(input.bookId || ''))
  const chapter = book?.chapters?.find((item) => String(item?.id) === String(input.chapterId || ''))
  if (!book || !chapter) return { ok: false, reason: 'destination-missing', books: input.books }

  const document = migrateWritingDocumentToV3(chapter.editorDocument, chapter.content || '')
  if (!validateWritingDocument(document).valid) return { ok: false, reason: 'invalid-document', books: input.books }
  const fingerprints = new Set((document.content || []).flatMap((unit) => (
    (unit.attrs?.originRefs || []).map(getWritingOriginFingerprint).filter(Boolean)
  )))
  if (fingerprints.has(created.fingerprint)) {
    return { ok: false, reason: 'already-imported', books: input.books }
  }

  const now = new Date().toISOString()
  document.content.push(created.unit)
  document.revision = Number(document.revision || 0) + 1
  document.updatedAt = now
  document.meta = { ...(document.meta || {}), importedAt: now }
  chapter.editorDocument = document
  chapter.editorDocumentSchemaVersion = document.schemaVersion
  chapter.content = getWritingDocumentMarkdown(document)
  chapter.contentFormat = 'md'
  chapter.wordCount = getWritingDocumentPlainText(document).replace(/\s/g, '').length
  chapter.updatedAt = now
  book.updatedAt = now

  return { ok: true, books, unitId: created.unit.attrs.unitId, originRef: created.originRef }
}

export function getExperienceOriginRoute(originRef) {
  if (!getWritingOriginFingerprint(originRef)) return null
  return {
    name: 'experience',
    query: { sessionId: String(originRef.sessionId), messageId: String(originRef.messageId) }
  }
}
