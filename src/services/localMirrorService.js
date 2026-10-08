// 本地文件镜像（前端）：payload 组装与自动同步（浏览器域，重模块）。
// - 设置/绑定面（设置字段、注册表、自动建项目）在 localMirrorSettings.js（轻模块，node 可加载）。
// - 自动同步挂 writing_books 订阅（保存链唯一边界），2.5s 去抖；失败静默退避 60s，不打断写作。
import { getItem, STORAGE_KEYS } from '../composables/useStorage.js'
import { getLocalMirrorSettings } from './localMirrorSettings.js'
import { loadWritingBooks, subscribeWritingBooks } from './writing/writingBooksRepository.js'
import { readWorldbookSnapshot } from '../stores/worldStore.js'
import { listWritingSnapshots } from './writing/writingSnapshots.js'
import { listWritingBlockHistory } from './writing/writingBlockHistory.js'
import { listMemoryCandidates } from './memory/memoryCandidates.js'
import { listMediaAssets } from './media/mediaAssetStore.js'
import { loadAllSourceArchiveRecords } from './worldbook/worldbookSourceArchive.js'

const DEBOUNCE_MS = 2500
const FAILURE_BACKOFF_MS = 60_000
const CONVERSATION_KEY_PREFIX = 'authoring_assistant_conversation:'
const CAPS = {
  snapshotsPerChapter: 10,
  blockHistoryPerChapter: 20,
  revisionMarkdownChars: 20_000,
  sessions: 20,
  sessionChars: 200_000,
  artifacts: 50,
  artifactChars: 50_000,
  conversationMessages: 60,
  conversationMessageChars: 8_000
}

// 设置/绑定面（getLocalMirrorSettings/setLocalMirrorSettings/listLocalProjects/
// getLocalMirrorLocation）在 localMirrorSettings.js——轻模块单源。

function gatherLogs(book, chapterIds, worldbookId) {
  const logs = { revisions: [], sessions: [], conversations: [], memory: [] }
  try {
    for (const chapterId of chapterIds) {
      const snapshots = (listWritingSnapshots(chapterId) || []).slice(-CAPS.snapshotsPerChapter).map((snapshot) => ({
        id: snapshot.id,
        label: snapshot.label || '',
        reason: snapshot.reason || '',
        createdAt: snapshot.createdAt || null,
        wordCount: snapshot.wordCount || 0,
        markdown: String(snapshot.markdown ?? '').slice(0, CAPS.revisionMarkdownChars)
      }))
      const blockHistory = (listWritingBlockHistory(chapterId) || []).slice(-CAPS.blockHistoryPerChapter)
      if (snapshots.length || blockHistory.length) {
        logs.revisions.push({ chapterId, chapterTitle: book.chapters?.find((chapter) => chapter.id === chapterId)?.title || '', snapshots, blockHistory })
      }
    }
  } catch { /* 修订史读取失败不阻塞镜像 */ }
  try {
    const sessions = getItem(STORAGE_KEYS.WRITING_SESSIONS, [])
    const related = (Array.isArray(sessions) ? sessions : [])
      .filter((session) => session && (session.worldbookId ? session.worldbookId === worldbookId : false))
      .slice(-CAPS.sessions)
    for (const session of related) {
      logs.sessions.push(JSON.parse(JSON.stringify({
        id: session.id, title: session.title || '', createdAt: session.createdAt || null,
        turnCount: Array.isArray(session.turnRecords) ? session.turnRecords.length : 0,
        record: session
      }, (key, value) => (typeof value === 'string' && value.length > CAPS.sessionChars ? value.slice(0, CAPS.sessionChars) : value))))
    }
  } catch { /* 会话读取失败不阻塞镜像 */ }
  try {
    const conversation = getItem(`${CONVERSATION_KEY_PREFIX}${book.id}`, null)
    if (conversation) {
      logs.conversations.push({
        projectId: book.id,
        messages: (Array.isArray(conversation.messages) ? conversation.messages : []).slice(-CAPS.conversationMessages).map((message) => ({
          role: message.role || 'system',
          content: String(message.content ?? '').slice(0, CAPS.conversationMessageChars),
          createdAt: message.createdAt || null
        }))
      })
    }
  } catch { /* 对话读取失败不阻塞镜像 */ }
  try {
    logs.memory = (listMemoryCandidates({ scopeId: book.id }) || []).map((candidate) => ({
      id: candidate.id, status: candidate.status || 'pending', type: candidate.type || '',
      content: String(candidate.content ?? '').slice(0, 4000),
      recordedAt: candidate.recordedAt || candidate.updatedAt || null
    }))
  } catch { /* 记忆台账读取失败不阻塞镜像 */ }
  return logs
}

async function gatherMaterials(worldbook) {
  if (!worldbook) return { artifacts: [] }
  try {
    const wanted = []
    for (const document of Array.isArray(worldbook.sourceDocuments) ? worldbook.sourceDocuments : []) {
      const content = String(document.content || document.contentPreview || document.preview || '')
      wanted.push({ ref: document.id || '', title: document.title || '', kind: document.kind || 'reference-text', content: content.slice(0, CAPS.artifactChars) })
    }
    const inlineIds = new Set(wanted.map((item) => item.ref))
    const archive = await loadAllSourceArchiveRecords()
    const artifactById = new Map((archive.artifacts || []).map((artifact) => [String(artifact.id), artifact]))
    const chunkById = new Map((archive.chunks || []).map((chunk) => [String(chunk.id), chunk]))
    for (const document of Array.isArray(worldbook.sourceDocuments) ? worldbook.sourceDocuments : []) {
      if (wanted.some((item) => item.ref === document.id && item.content)) continue
      const candidates = [document.archiveRef, document.id].map(String)
      const artifact = candidates.map((id) => artifactById.get(id)).find(Boolean)
      if (!artifact) continue
      const content = (Array.isArray(artifact.chunkIds) ? artifact.chunkIds : [])
        .map((chunkId) => chunkById.get(String(chunkId))?.text || '')
        .join('')
      if (content.trim()) wanted.push({ ref: String(artifact.id), title: artifact.title || document.title || '', kind: artifact.kind || 'reference-text', content: content.slice(0, CAPS.artifactChars) })
    }
    for (const artifact of (archive.artifacts || []).slice(0, CAPS.artifacts)) {
      if (wanted.length >= CAPS.artifacts) break
      if (wanted.some((item) => item.ref === String(artifact.id))) continue
      if (inlineIds.has(String(artifact.id))) continue
      const content = (Array.isArray(artifact.chunkIds) ? artifact.chunkIds : []).map((chunkId) => chunkById.get(String(chunkId))?.text || '').join('')
      if (content.trim()) wanted.push({ ref: String(artifact.id), title: artifact.title || '', kind: artifact.kind || 'reference-text', content: content.slice(0, CAPS.artifactChars) })
    }
    return { artifacts: wanted.filter((item) => item.content.trim()).slice(0, CAPS.artifacts) }
  } catch {
    return { artifacts: [] }
  }
}

export async function buildBookMirrorPayload(book) {
  if (!book || typeof book !== 'object') return null
  let worldbook = null
  try {
    if (book.worldbookId) {
      const snapshot = readWorldbookSnapshot(book.worldbookId)
      if (snapshot) {
        worldbook = {
          id: snapshot.id,
          name: snapshot.name || '',
          worldDescription: snapshot.worldDescription || '',
          writingStyle: snapshot.writingStyle || '',
          forbidden: snapshot.forbidden || '',
          groups: Array.isArray(snapshot.groups) ? snapshot.groups : [],
          entries: (Array.isArray(snapshot.entries) ? snapshot.entries : []).map((entry) => ({
            name: entry.name || '',
            type: entry.type || 'general',
            group: entry.injection?.group || '',
            keys: Array.isArray(entry.keys) ? entry.keys : [],
            content: typeof entry.content === 'string' ? entry.content : ''
          }))
        }
      }
    }
  } catch { /* 世界书不可读时镜像正文/大纲即可 */ }
  return {
    book: {
      id: book.id,
      title: book.title || book.name || book.id,
      chapters: (Array.isArray(book.chapters) ? book.chapters : []).map((chapter) => ({
        id: chapter.id,
        title: chapter.title || '未命名章节',
        content: typeof chapter.content === 'string' ? chapter.content : ''
      })),
      outline: {
        nodes: Array.isArray(book.outlineNodes) ? book.outlineNodes : [],
        edges: Array.isArray(book.outlineEdges) ? book.outlineEdges : []
      },
      explorations: (Array.isArray(book.explorationDocuments) ? book.explorationDocuments : []).map((doc) => ({
        id: doc.id,
        title: doc.title || '未命名构思',
        content: typeof doc.content === 'string' ? doc.content : ''
      }))
    },
    worldbook,
    logs: gatherLogs(book, (Array.isArray(book.chapters) ? book.chapters : []).map((chapter) => chapter.id), book.worldbookId),
    materials: await gatherMaterials(worldbook),
    media: (() => {
      try {
        return (listMediaAssets({ projectId: book.id }) || []).map((asset) => ({
          id: asset.id, kind: asset.kind || '', purpose: asset.purpose || '', status: asset.status || '',
          projectId: asset.projectId ?? null, createdAt: asset.createdAt || null,
          prompt: String(asset.promptSnapshot ?? '').slice(0, 600)
        }))
      } catch { return [] }
    })()
  }
}

export async function syncBookLocalMirror(book) {
  const payload = await buildBookMirrorPayload(book)
  if (!payload) return { ok: false, reason: 'invalid-book' }
  const response = await fetch('/api/localmirror/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) {
    throw Object.assign(new Error(body?.message || 'local mirror sync failed'), { status: response.status })
  }
  return body
}

let syncTimer = null
let backoffUntil = 0
let installed = false

async function syncAllBooks() {
  if (backoffUntil > Date.now()) return
  try {
    const books = loadWritingBooks()
    const index = []
    for (const book of books) {
      const result = await syncBookLocalMirror(book)
      index.push({
        id: book.id,
        title: book.title || book.name || book.id,
        chapters: Array.isArray(book.chapters) ? book.chapters.length : 0,
        words: (Array.isArray(book.chapters) ? book.chapters : []).reduce((total, chapter) => total + (Number(chapter.wordCount) || String(chapter.content ?? '').length), 0),
        entries: result?.counts?.entries ?? 0,
        updatedAt: book.updatedAt ?? null,
        dir: result?.dir ?? null
      })
    }
    if (index.length) {
      await fetch('/api/localmirror/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: index })
      })
    }
  } catch {
    // 静默退避：服务端未起/失败时 60s 内不重试不打扰写作；位置可经 /api/localmirror/location 排查
    backoffUntil = Date.now() + FAILURE_BACKOFF_MS
  }
}

/** 保存链挂钩：writing_books 每次成功持久化后去抖同步。幂等；由应用初始化调用一次。 */
export function installLocalMirrorAutoSync({ debounceMs = DEBOUNCE_MS } = {}) {
  if (installed) return () => {}
  installed = true
  subscribeWritingBooks(() => {
    if (!getLocalMirrorSettings().enabled) return
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      syncTimer = null
      void syncAllBooks()
    }, debounceMs)
  })
  return () => {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = null
    installed = false
  }
}
