// 本地文件镜像（前端预留接口）：把作品的正文/大纲/世界书/构思单向镜像到服务端文档目录。
// - 位置由服务端唯一决定（PINAX_MIRROR_ROOT > <homedir>/Documents/Pinax），前端设置只预留字段不做 UI；
//   customRoot 仅作未来展示用途，不随请求发送（防路径注入）。
// - 自动同步挂 writing_books 订阅（保存链唯一边界），2.5s 去抖；失败静默退避 60s，不打断写作。
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { loadWritingBooks, subscribeWritingBooks } from './writing/writingBooksRepository'
import { readWorldbookSnapshot } from '../stores/worldStore'

const SETTINGS_KEY = STORAGE_KEYS.LOCAL_MIRROR_SETTINGS
const DEBOUNCE_MS = 2500
const FAILURE_BACKOFF_MS = 60_000

function normalizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: value.enabled !== false,
    customRoot: typeof value.customRoot === 'string' ? value.customRoot : ''
  }
}

export function getLocalMirrorSettings() {
  return normalizeSettings(getItem(SETTINGS_KEY, null))
}

/** 预留给未来设置 UI；当前无按钮入口。customRoot 仅展示用，不参与请求。 */
export function setLocalMirrorSettings(patch) {
  const next = { ...getLocalMirrorSettings(), ...(patch && typeof patch === 'object' ? patch : {}) }
  setItem(SETTINGS_KEY, normalizeSettings(next))
  return next
}

export async function getLocalMirrorLocation() {
  const response = await fetch('/api/localmirror/location')
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok !== true) throw Object.assign(new Error(payload?.message || 'mirror location unavailable'), { status: response.status })
  return payload
}

export function buildBookMirrorPayload(book) {
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
    worldbook
  }
}

export async function syncBookLocalMirror(book) {
  const payload = buildBookMirrorPayload(book)
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
    for (const book of books) await syncBookLocalMirror(book)
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
