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

function storedTemperature(value) {
  const number = Number(value)
  return value != null && Number.isFinite(number) && number >= 0 && number <= 2 ? number : null
}

function storedParams(params) {
  if (!params || typeof params !== 'object') return null
  const temperature = storedTemperature(params.temperatureOverride)
  return {
    intent: String(params.intent || ''),
    ...(temperature !== null ? { temperatureOverride: temperature } : {})
  }
}

function storedMessages(messages, projectId) {
  return (Array.isArray(messages) ? messages : []).flatMap((message) => {
    const common = { id: String(message?.id || ''), role: message?.role, createdAt: Number(message?.createdAt) || 0 }
    if (!common.id) return []
    if (message.role === 'user') {
      return [{ ...common, question: String(message.question || ''), intent: String(message.intent || 'whole-book') }]
    }
    if (message.role === 'assistant' && message.kind === 'agent' && message.projectId === projectId) {
      return [{ ...common, kind: 'agent', projectId, chapterId: String(message.chapterId || ''), text: String(message.text || '').slice(0, 24000),
        thinking: String(message.thinking || '').slice(-4000), tools: clone((message.tools || []).slice(0, 30)),
        usage: clone(message.usage || null),
        status: message.status === 'running' ? 'interrupted' : message.status, taskId: String(message.taskId || ''), adopted: Boolean(message.adopted),
        references: clone((message.references || []).filter(item => item.projectId === projectId).slice(0, 12)),
        proposal: clone(message.proposal || null), adoptionReceipt: clone(message.adoptionReceipt || null), beatPlan: clone(message.beatPlan || null), toolResults: clone((message.toolResults || []).slice(0, 12)) }]
    }
    if (message.role !== 'assistant' || !message.answer
      || String(message.answer.projectId || '') !== projectId) return []
    // 快照本体是会话内存 LRU，刷新即失效；键要跟着消息活下来，🔍 才能在刷新后
    // 显示「快照已失效」说明而不是整颗消失。
    return [{ ...common, answer: clone(message.answer), session: storedQuerySession(message.session, projectId),
      promptSnapshotKey: String(message.promptSnapshotKey || ''), params: storedParams(message.params) }]
  })
}

function savedConversation(projectId, record) {
  const request = record.lastRequest
  const requestTemperature = storedTemperature(request?.temperatureOverride)
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    messages: storedMessages(record.messages, projectId),
    activeSessionId: String(record.activeSessionId || ''),
    agentSessions: (Array.isArray(record.agentSessions) ? record.agentSessions : []).filter(session => session.projectId === projectId)
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, 20).map(session => ({
        sessionId: String(session.sessionId || ''), projectId, title: String(session.title || '新对话').slice(0, 80), updatedAt: Number(session.updatedAt) || 0,
        messages: storedMessages(session.messages, projectId).slice(-60), draft: String(session.draft || '').slice(0, 12000),
        selectedIntent: String(session.selectedIntent || 'free'), agentRefs: clone((session.agentRefs || []).slice(0, 8).map(ref => ({ id: String(ref.id), type: String(ref.type), title: String(ref.title || '').slice(0, 120) }))), agentTaskId: String(session.agentTaskId || ''), agentSkills: clone((session.agentSkills || []).slice(0, 3))
      })),
    agentRefs: clone((record.agentRefs || []).slice(0, 8).map(ref => ({ id: String(ref.id), type: String(ref.type), title: String(ref.title || '').slice(0, 120) }))),
    agentTaskId: String(record.agentTaskId || ''),
    agentSkills: clone((record.agentSkills || []).slice(0, 3)),
    selectedIntent: String(record.selectedIntent || 'whole-book'),
    error: String(record.error || ''),
    lastRequest: request && String(request.projectId || '') === projectId
      ? { projectId, question: String(request.question || ''), intent: String(request.intent || 'whole-book'),
        ...(requestTemperature !== null ? { temperatureOverride: requestTemperature } : {}),
        ...(request.via === 'query' ? { via: 'query' } : {}),
        ...(String(request.regenerateOf || '') ? { regenerateOf: String(request.regenerateOf).slice(0, 80) } : {}) }
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
  if (message.kind === 'agent') return message.role === 'assistant' && message.projectId === projectId && typeof message.text === 'string'
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
