import { createBrowserStorageRepository } from '../../storage/browserStorageRepository.js'

export const AUTHORING_ASSISTANT_CONVERSATION_PREFIX = 'authoring_assistant_conversation:'
export const AUTHORING_ASSISTANT_DRAFT_PREFIX = 'authoring_assistant_draft:'
const SCHEMA_VERSION = 1

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function key(prefix, projectId) {
  return `${prefix}${encodeURIComponent(String(projectId || '').trim())}`
}

// 对账只需来源授权和作品绑定；不保存 provider envelope 或编辑器全文快照。
function storedQuerySession(session, projectId) {
  if (!session || session.kind !== 'authoring-knowledge-query-session'
    || String(session.projectId || '') !== projectId) return null
  return {
    schemaVersion: session.schemaVersion,
    kind: session.kind,
    projectId,
    worldbookId: String(session.worldbookId || ''),
    evidenceEnvelope: {
      sourceAuthorization: clone(session.evidenceEnvelope?.sourceAuthorization || { projectId, sources: [] })
    }
  }
}

function storedMessages(messages, projectId) {
  return (Array.isArray(messages) ? messages : []).flatMap((message) => {
    const common = { id: String(message?.id || ''), role: message?.role, createdAt: Number(message?.createdAt) || 0 }
    if (!common.id) return []
    if (message.role === 'user') {
      return [{ ...common, question: String(message.question || ''), intent: String(message.intent || 'whole-book') }]
    }
    if (message.role !== 'assistant' || !message.answer
      || String(message.answer.projectId || '') !== projectId) return []
    return [{ ...common, answer: clone(message.answer), session: storedQuerySession(message.session, projectId) }]
  })
}

function savedConversation(projectId, record) {
  const request = record.lastRequest
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    messages: storedMessages(record.messages, projectId),
    selectedIntent: String(record.selectedIntent || 'whole-book'),
    error: String(record.error || ''),
    lastRequest: request && String(request.projectId || '') === projectId
      ? { projectId, question: String(request.question || ''), intent: String(request.intent || 'whole-book') }
      : null,
    status: record.busy ? 'running' : String(record.status || 'idle'),
    hasUnread: Boolean(record.hasUnread),
    updatedAt: Date.now()
  }
}

function readJson(storage, storageKey) {
  const raw = storage.getText(storageKey)
  return raw == null ? null : JSON.parse(raw)
}

function validStoredMessage(message, projectId) {
  if (!message || typeof message.id !== 'string') return false
  if (message.role === 'user') return typeof message.question === 'string'
  const answer = message.answer
  return message.role === 'assistant'
    && answer?.kind === 'authoring-knowledge-answer'
    && answer.projectId === projectId
    && typeof answer.answer === 'string'
    && ['claims', 'evidence', 'missingInformation', 'calculations', 'staleSources'].every((field) => Array.isArray(answer[field]))
    && answer.evidence.every((item) => item?.projectId === projectId)
    && (!message.session || message.session.projectId === projectId)
}

export function createAuthoringAssistantConversationStore({ storage = createBrowserStorageRepository() } = {}) {
  function load(projectId) {
    let conversation = null
    let draft = ''
    let conversationReadError = ''
    let draftReadError = ''
    try {
      const saved = readJson(storage, key(AUTHORING_ASSISTANT_CONVERSATION_PREFIX, projectId))
      if (saved && (saved.schemaVersion !== SCHEMA_VERSION || saved.projectId !== projectId)) {
        throw new Error('conversation-scope-invalid')
      }
      if (saved && (!Array.isArray(saved.messages)
        || !saved.messages.every((message) => validStoredMessage(message, projectId)))) {
        throw new Error('conversation-messages-invalid')
      }
      conversation = saved ? savedConversation(projectId, saved) : null
    } catch {
      conversationReadError = '助手对话未能读取，请保留当前内容后检查浏览器存储。'
    }
    try {
      const saved = readJson(storage, key(AUTHORING_ASSISTANT_DRAFT_PREFIX, projectId))
      if (saved && (saved.schemaVersion !== SCHEMA_VERSION || saved.projectId !== projectId)) {
        throw new Error('draft-scope-invalid')
      }
      draft = String(saved?.draft || '')
    } catch {
      draftReadError = '助手输入未能读取，请保留当前内容后检查浏览器存储。'
    }
    const error = [conversationReadError, draftReadError].filter(Boolean).join(' ')
    return { ok: !error, conversation, draft, error, conversationReadError, draftReadError }
  }

  function saveConversation(projectId, record) {
    try {
      storage.setJson(key(AUTHORING_ASSISTANT_CONVERSATION_PREFIX, projectId), savedConversation(projectId, record))
      return { ok: true }
    } catch {
      return { ok: false, error: '助手对话未能保存；当前内容仍在本页，请先复制保留。' }
    }
  }

  function saveDraft(projectId, draft) {
    try {
      storage.setJson(key(AUTHORING_ASSISTANT_DRAFT_PREFIX, projectId), {
        schemaVersion: SCHEMA_VERSION, projectId, draft: String(draft || ''), updatedAt: Date.now()
      })
      return { ok: true }
    } catch {
      return { ok: false, error: '助手输入未能保存；离开页面前请先复制保留。' }
    }
  }

  return Object.freeze({ load, saveConversation, saveDraft })
}
