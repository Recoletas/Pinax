import { normalizeAssistantSampling } from './assistantRegenerateOptions.js'
import { normalizeAssistantQuestions } from '../../../../shared/assistantUserInput.js'
import { createBrowserStorageRepository } from '../../storage/browserStorageRepository.js'

export const AUTHORING_ASSISTANT_CONVERSATION_PREFIX = 'authoring_assistant_conversation:'
export const AUTHORING_ASSISTANT_DRAFT_PREFIX = 'authoring_assistant_draft:'
export const ASSISTANT_STOP_MESSAGES = Object.freeze({
  'user-cancelled': '已停止生成，已有文字已保留。',
  'owner-disposed': '工作区已关闭或重新加载，生成中断；已有文字已保留。',
  'project-changed': '已切换作品，生成中断；已有文字已保留。',
  unknown: '上次生成未完成，已有文字已保留；如需继续，请手动重试。'
})
const LEGACY_INTERRUPTION_MESSAGES = new Set([
  '上次查询因离开写作页停止；如需继续，请手动重试。',
  '上次查询因页面关闭中断；如需继续，请手动重试。'
])
const SCHEMA_VERSION = 1
function savedQuestions(input) {
  try { return normalizeAssistantQuestions(input) } catch { return [] }
}

function storedQueue(input) {
  return (Array.isArray(input) ? input : []).slice(0, 8).filter(item => item?.id && typeof item.question === 'string' && item.question.trim()).map(item => ({
    id: String(item.id).slice(0, 100), question: item.question.slice(0, 12000), intent: String(item.intent || 'free'), chapterId: String(item.chapterId || '').slice(0, 120), createdAt: Number(item.createdAt) || 0, status: 'waiting'
  }))
}

function storedCheckpoint(value) {
  return value && typeof value.throughId === 'string' && typeof value.summary === 'string' && value.summary.trim()
    ? { throughId: value.throughId.slice(0, 120), summary: value.summary, createdAt: Number(value.createdAt) || 0 } : null
}

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

function storedMessages(messages, projectId, includeVersions = true) {
  return (Array.isArray(messages) ? messages : []).flatMap((message) => {
    const common = { id: String(message?.id || ''), role: message?.role, createdAt: Number(message?.createdAt) || 0 }
    if (!common.id) return []
    if (message.role === 'user') {
      return [{ ...common, question: String(message.question || ''), intent: String(message.intent || 'whole-book'),
        ...(includeVersions && Array.isArray(message.answerVersions) ? { answerVersionQuestions: message.answerVersions.slice(0, 8).map((_, index) => String(message.answerVersionQuestions?.[index] ?? message.question ?? '').slice(0, 12000)), answerVersions: message.answerVersions.slice(0, 8).map(version => version === null ? null : storedMessages(version, projectId, false)), answerVersionIndex: Math.max(0, Math.min(Math.min(8, message.answerVersions.length) - 1, Number(message.answerVersionIndex) || 0)) } : {}) }]
    }
    if (message.role === 'assistant' && message.kind === 'agent' && message.projectId === projectId) {
      const stopReason = Object.hasOwn(ASSISTANT_STOP_MESSAGES, message.stopReason) ? message.stopReason : message.status === 'running' ? 'unknown' : ''
      return [{ ...common, kind: 'agent', projectId, chapterId: String(message.chapterId || ''), text: [String(message.text || ''), ...(message.status === 'running' ? (message.generatedDrafts || []).map(draft => draft.text) : [])].filter(Boolean).join('\n\n'),
        stopReason, failureReason: String(message.failureReason || (stopReason ? ASSISTANT_STOP_MESSAGES[stopReason] : '')).slice(0, 1000), outcome: String(message.outcome || ''), deliveryMessage: String(message.deliveryMessage || '').slice(0, 12000),
        questions: savedQuestions(message.questions), questionResponse: String(message.questionResponse || '').slice(0, 16000),
        thinking: String(message.thinking || '').slice(-4000), tools: clone((message.tools || []).slice(0, 30)),
        usage: clone(message.usage || null), reaction: ['up', 'down'].includes(message.reaction) ? message.reaction : '', promptSnapshotKey: String(message.promptSnapshotKey || ''), params: normalizeAssistantSampling(message.params), narrativePromptKey: String(message.narrativePromptKey || ''),
        status: message.status === 'running' ? 'interrupted' : message.status, taskId: String(message.taskId || ''), adopted: Boolean(message.adopted),
        references: clone((message.references || []).filter(item => item.projectId === projectId).slice(0, 12)),
        proposal: clone(message.proposal || null), adoptionReceipt: clone(message.adoptionReceipt || null), beatPlan: clone(message.beatPlan || null), generatedDrafts: clone(message.generatedDrafts || []), toolResults: clone(message.toolResults || []) }]
    }
    if (message.role !== 'assistant' || !message.answer
      || String(message.answer.projectId || '') !== projectId) return []
    return [{ ...common, answer: clone(message.answer), session: storedQuerySession(message.session, projectId), reaction: ['up', 'down'].includes(message.reaction) ? message.reaction : '', promptSnapshotKey: String(message.promptSnapshotKey || '') }]
  })
}

function savedConversation(projectId, record) {
  const request = record.lastRequest
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    messages: storedMessages(record.messages, projectId), contextCheckpoint: storedCheckpoint(record.contextCheckpoint), contextCompactedAt: Number(record.contextCompactedAt) || 0, pendingMessages: storedQueue(record.pendingMessages),
    activeSessionId: String(record.activeSessionId || ''),
    agentSessions: (Array.isArray(record.agentSessions) ? record.agentSessions : []).filter(session => session.projectId === projectId)
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).slice(0, 20).map(session => ({
        sessionId: String(session.sessionId || ''), projectId, title: String(session.title || '新对话').slice(0, 80), updatedAt: Number(session.updatedAt) || 0, archived: Boolean(session.archived),
        messages: storedMessages(session.messages, projectId), contextCheckpoint: storedCheckpoint(session.contextCheckpoint), contextCompactedAt: Number(session.contextCompactedAt) || 0, pendingMessages: storedQueue(session.pendingMessages), draft: String(session.draft || '').slice(0, 12000),
        selectedIntent: String(session.selectedIntent || 'free'), agentRefs: clone((session.agentRefs || []).slice(0, 8).map(ref => ({ id: String(ref.id), type: String(ref.type), title: String(ref.title || '').slice(0, 120) }))), agentTaskId: String(session.agentTaskId || ''), agentSkills: clone((session.agentSkills || []))
      })),
    agentRefs: clone((record.agentRefs || []).slice(0, 8).map(ref => ({ id: String(ref.id), type: String(ref.type), title: String(ref.title || '').slice(0, 120) }))),
    agentTaskId: String(record.agentTaskId || ''),
    agentSkills: clone((record.agentSkills || [])),
    selectedIntent: String(record.selectedIntent || 'whole-book'),
    error: String(record.error || ''),
    lastRequest: request && String(request.projectId || '') === projectId
      ? { projectId, question: String(request.question || ''), intent: String(request.intent || 'whole-book'), sampling: normalizeAssistantSampling(request.sampling) }
      : null,
    status: record.busy && !record.compacting ? 'running' : String(record.status || 'idle'),
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

function recoverInterruptionNotice(conversation) {
  if (!conversation || !LEGACY_INTERRUPTION_MESSAGES.has(conversation.error)) return conversation
  conversation.error = ASSISTANT_STOP_MESSAGES.unknown
  // Older abort handlers replaced a known interruption with "cancelled".
  // Repair only that terminal reply, never historical author cancellations.
  const last = conversation.messages.findLast(message => message.kind === 'agent')
  if (['running', 'interrupted'].includes(conversation.status) && last
    && ['cancelled', 'interrupted'].includes(last.status) && !last.stopReason
    && (!last.failureReason || LEGACY_INTERRUPTION_MESSAGES.has(last.failureReason))) {
    for (const message of [last, ...conversation.agentSessions.flatMap(session => session.messages).filter(message => message.id === last.id)]) {
      message.status = 'interrupted'
      message.stopReason = 'unknown'
      message.failureReason = ASSISTANT_STOP_MESSAGES.unknown
      for (const tool of message.tools || []) if (['running', 'cancelled'].includes(tool.status)) tool.status = 'interrupted'
    }
  }
  return conversation
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
      conversation = saved ? recoverInterruptionNotice(savedConversation(projectId, saved)) : null
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
