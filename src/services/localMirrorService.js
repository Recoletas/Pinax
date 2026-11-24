// 本地文件镜像（前端）：payload 组装与自动同步（浏览器域，重模块）。
// - 设置/绑定面（设置字段、注册表、自动建项目）在 localMirrorSettings.js（轻模块，node 可加载）。
// - 自动同步挂 writing_books 订阅（保存链唯一边界），2.5s 去抖；失败静默退避 60s，不打断写作。
import { getItem, STORAGE_KEYS } from '../composables/useStorage.js'
import { getLocalMirrorSettings, listLocalProjects, getMirrorReceipt, updateMirrorReceipt } from './localMirrorSettings.js'
import { getMirrorEpoch } from './storage/mirrorReceiptEpoch.js'
import { loadWritingBooks, subscribeWritingBooks } from './writing/writingBooksRepository.js'
import { readWorldbookSnapshot } from '../stores/worldStore.js'
import { listAllWritingSnapshots } from './writing/writingSnapshots.js'
import { listAllWritingBlockHistory } from './writing/writingBlockHistory.js'
import { listMemoryCandidates } from './memory/memoryCandidates.js'
import { listMediaAssets } from './media/mediaAssetStore.js'
import { readReferencedSourceArtifacts } from './worldbook/worldbookSourceArchive.js'

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

function groupByChapter(rows) {
  const groups = new Map()
  for (const row of rows) {
    const id = String(row.chapterId)
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(row)
  }
  return groups
}

function gatherLogs(book, worldbookId) {
  const logs = { revisions: [], sessions: [], conversations: [], memory: [] }
  try {
    const chapterSnapshots = groupByChapter(listAllWritingSnapshots())
    const chapterHistory = groupByChapter(listAllWritingBlockHistory())
    for (const chapter of book.chapters || []) {
      const chapterId = chapter.id
      const snapshots = (chapterSnapshots.get(String(chapterId)) || []).slice(-CAPS.snapshotsPerChapter).map((snapshot) => ({
        id: snapshot.id,
        label: snapshot.label || '',
        reason: snapshot.reason || '',
        createdAt: snapshot.createdAt || null,
        wordCount: snapshot.wordCount || 0,
        markdown: String(snapshot.markdown ?? '').slice(0, CAPS.revisionMarkdownChars)
      }))
      const blockHistory = (chapterHistory.get(String(chapterId)) || []).slice(-CAPS.blockHistoryPerChapter)
      if (snapshots.length || blockHistory.length) {
        logs.revisions.push({ chapterId, chapterTitle: chapter.title || '', snapshots, blockHistory })
      }
    }
  } catch { return null }
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
  } catch { return null }
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
  } catch { return null }
  try {
    logs.memory = (listMemoryCandidates({ scopeId: book.id }) || []).map((candidate) => ({
      id: candidate.id, status: candidate.status || 'pending', type: candidate.type || '',
      content: String(candidate.content ?? '').slice(0, 4000),
      recordedAt: candidate.recordedAt || candidate.updatedAt || null
    }))
  } catch { return null }
  return logs
}

function archivedPreview(artifact, chunks) {
  let text = ''
  for (const id of artifact.chunkIds || []) {
    text += String(chunks.get(String(id))?.text || '').slice(0, CAPS.artifactChars - text.length)
    if (text.length >= CAPS.artifactChars) break
  }
  return text
}

function gatherMaterials(documents, archive) {
  const artifacts = []
  const included = new Set()
  function include(ref, title, kind, content) {
    if (!content.trim()) return
    artifacts.push({ ref, title, kind: kind || 'reference-text', content })
    included.add(ref)
  }

  for (const document of documents) {
    const text = String(document.content || document.contentPreview || document.preview || '')
    include(document.id || '', document.title || '', document.kind, text.slice(0, CAPS.artifactChars))
    if (artifacts.length === CAPS.artifacts) return { artifacts }
  }

  const byId = new Map(archive.artifacts.map(artifact => [String(artifact.id), artifact]))
  function includeArchive(artifact, title = '') {
    if (!artifact || included.has(String(artifact.id))) return
    include(String(artifact.id), artifact.title || title, artifact.kind, archivedPreview(artifact, archive.chunks))
  }
  for (const document of documents) {
    if (included.has(document.id)) continue
    includeArchive(byId.get(String(document.archiveRef)) || byId.get(String(document.id)), document.title)
    if (artifacts.length === CAPS.artifacts) return { artifacts }
  }
  for (const artifact of archive.artifacts) {
    includeArchive(artifact)
    if (artifacts.length === CAPS.artifacts) break
  }
  return { artifacts }
}

function gatherSourceArchive(archive, documents) {
  const records = Object.fromEntries(archive.artifacts.map(artifact => [String(artifact.id), { meta: artifact, chunks: (artifact.chunkIds || []).map(id => {
    const chunk = archive.chunks.get(String(id))
    if (!chunk) throw new Error('资料原文片段缺失，未执行文件同步。')
    return chunk
  }) }]))
  for (const doc of documents) {
    if (doc.archiveRef && !Object.hasOwn(records, doc.archiveRef)) throw new Error('引用的资料归档缺失，未执行文件同步。')
  }
  return records
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
          entries: JSON.parse(JSON.stringify(Array.isArray(snapshot.entries) ? snapshot.entries : [])),
          sourceDocuments: snapshot.sourceDocuments || []
        }
      }
    }
  } catch { /* 世界书不可读时镜像正文/大纲即可 */ }
  const logs = gatherLogs(book, book.worldbookId)
  const documents = worldbook?.sourceDocuments || []
  const referencedIds = documents.flatMap(doc => [doc.id, doc.archiveRef].filter(Boolean))
  const archive = await readReferencedSourceArtifacts(referencedIds)
  const materials = gatherMaterials(documents, archive)
  const sourceArchive = worldbook ? gatherSourceArchive(archive, worldbook.sourceDocuments) : null
  return {
    book: {
      ...book,
      id: book.id,
      title: book.title || book.name || book.id,
      chapters: (Array.isArray(book.chapters) ? book.chapters : []).map((chapter) => ({
        ...chapter,
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
    ...(worldbook ? { worldbook } : {}),
    ...(logs ? { logs } : {}),
    materials,
    ...(sourceArchive ? { sourceArchive } : {}),
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

export async function syncBookLocalMirror(bookId, { binding, extras } = {}) {
  const id = String(bookId?.id ?? bookId ?? '')
  const project = binding || (await listLocalProjects()).find(entry => String(entry.bookId) === id)
  if (!project || String(project.bookId) !== id) throw new Error('请先为作品绑定本地项目目录')
  const { revision, bookRevision, bookFingerprint, epoch } = getMirrorReceipt(project.projectId, id)
  function checkEpoch() {
    if (getMirrorEpoch(id) !== epoch) throw new Error('书架已从备份恢复，请重新同步。')
  }
  try {
    // Read the canonical book AFTER its acknowledged file revision. A queued
    // caller cannot pair an old page snapshot with another tab's newer receipt.
    if (epoch.startsWith('pending:') && !revision && !bookFingerprint) throw new Error('书架恢复尚未完成，请重新恢复备份或从项目文件读回作品。')
    const book = loadWritingBooks().find(record => String(record.id) === id)
    if (!book) throw new Error('当前作品已不存在，已停止同步')
    const payload = await buildBookMirrorPayload(book)
    if (!payload) throw new Error('无效作品')
    if (extras) Object.assign(payload, await extras())
    checkEpoch()
    payload.baseRevision = revision
    if (Number.isSafeInteger(bookRevision)) payload.bookBaseRevision = bookRevision
    if (bookFingerprint) payload.expectedBookFingerprint = bookFingerprint
    payload.expectedProjectId = project.projectId
    payload.source = 'browser-mirror'
    payload.requestId = `mirror_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const response = await fetch('/api/localmirror/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) {
      throw Object.assign(new Error(body?.message || 'local mirror sync failed'), { status: response.status })
    }
    if (!Number.isSafeInteger(body.revision)) throw new Error('项目服务未返回已写入的修订号，请更新本机服务后核对项目。')
    checkEpoch()
    updateMirrorReceipt(project.projectId, id, { revision: body.revision, bookRevision: null, bookFingerprint: null, message: null }, epoch)
    return body
  } catch (error) {
    updateMirrorReceipt(project.projectId, id, { message: error.message }, epoch)
    throw error
  }
}

let syncTimer = null
let backoffUntil = 0
let installed = false

async function syncAllBooks() {
  if (backoffUntil > Date.now()) return
  try {
    const bindings = await listLocalProjects()
    const books = loadWritingBooks()
    const byBook = new Map(bindings.filter(project => project.bookId).map(project => [String(project.bookId), project]))
    const index = []
    let allSynced = true
    for (const book of books.filter(book => byBook.has(String(book.id)))) {
      let result
      try {
        result = await syncBookLocalMirror(book.id, { binding: byBook.get(String(book.id)) })
      }
      catch { allSynced = false; continue }
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
    if (index.length && allSynced) {
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
