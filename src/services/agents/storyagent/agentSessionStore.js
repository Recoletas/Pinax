// StoryAgent 会话持久化（融合 B 路线）：多命名会话随书存储。
// 真源在浏览器侧（文档 §5 红线：适配器转录不能当第二真源；taskId 只作运行数据关联）。
// 存储经 browserStorageRepository（可注入 fake 供测试），键 pinax_agent_sessions_<bookId>。
// 裁剪护栏：thinking ≤4000 字、单会话消息 ≤60、每书会话 ≤20，超限丢最旧。
import { createBrowserStorageRepository } from '../../storage/browserStorageRepository.js'

const KEY_PREFIX = 'pinax_agent_sessions_'
const MAX_MESSAGES_PER_SESSION = 60
const MAX_SESSIONS_PER_BOOK = 20
const THINKING_CAP = 4000
const TEXT_CAP = 12000

function normalizedBookId(bookId) {
  return String(bookId ?? '').trim()
}

function capMessage(message) {
  const base = {
    id: String(message?.id || ''),
    role: message?.role === 'user' || message?.role === 'system' ? message.role : 'assistant',
    kind: 'agent',
    createdAt: Number(message?.createdAt) || Date.now(),
  }
  if (base.role === 'user') return { ...base, question: String(message?.question ?? '').slice(0, 2000), intent: 'agent' }
  if (base.role === 'system') return { ...base, text: String(message?.text ?? '').slice(0, 2000) }
  return {
    ...base,
    text: String(message?.text ?? '').slice(0, TEXT_CAP),
    thinking: String(message?.thinking ?? '').slice(0, THINKING_CAP),
    tools: (Array.isArray(message?.tools) ? message.tools : []).slice(0, 30),
    status: '',
    agentResult: message?.agentResult && typeof message.agentResult === 'object'
      ? { ...message.agentResult }
      : null,
  }
}

function sanitizeSessions(raw) {
  const payload = raw && typeof raw === 'object' ? raw : {}
  const sessions = (Array.isArray(payload.sessions) ? payload.sessions : [])
    .map((s) => ({
      sessionId: String(s?.sessionId || ''),
      title: String(s?.title || '未命名会话').slice(0, 80),
      createdAt: Number(s?.createdAt) || Date.now(),
      updatedAt: Number(s?.updatedAt) || Date.now(),
      messages: (Array.isArray(s?.messages) ? s.messages : []).slice(-MAX_MESSAGES_PER_SESSION).map(capMessage),
    }))
    .filter((s) => s.sessionId)
    .slice(-MAX_SESSIONS_PER_BOOK)
  const activeSessionId = String(payload.activeSessionId || '')
  return {
    sessions,
    activeSessionId: sessions.some((s) => s.sessionId === activeSessionId)
      ? activeSessionId
      : (sessions[sessions.length - 1]?.sessionId || ''),
  }
}

export function createAgentSessionStore(storage = null) {
  const repo = createBrowserStorageRepository(storage || globalThis.localStorage)

  function keyFor(bookId) {
    return `${KEY_PREFIX}${normalizedBookId(bookId)}`
  }

  function loadAgentSessions(bookId) {
    if (!normalizedBookId(bookId)) return { sessions: [], activeSessionId: '' }
    try {
      return sanitizeSessions(repo.getJson(keyFor(bookId), null))
    } catch {
      return { sessions: [], activeSessionId: '' }
    }
  }

  function saveAgentSessions(bookId, sessions, activeSessionId) {
    if (!normalizedBookId(bookId)) return false
    try {
      repo.setJson(keyFor(bookId), sanitizeSessions({ sessions, activeSessionId }))
      return true
    } catch {
      return false
    }
  }

  function deleteAgentSession(bookId, sessionId) {
    const { sessions, activeSessionId } = loadAgentSessions(bookId)
    const next = sessions.filter((s) => s.sessionId !== String(sessionId || ''))
    saveAgentSessions(bookId, next, activeSessionId === sessionId ? (next[next.length - 1]?.sessionId || '') : activeSessionId)
    return true
  }

  return Object.freeze({
    kind: 'storyagent-session-store',
    loadAgentSessions,
    saveAgentSessions,
    deleteAgentSession,
  })
}
