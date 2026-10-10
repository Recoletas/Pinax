import { STORAGE_KEYS } from '../../composables/useStorage.js'
import { createBrowserStorageRepository } from '../storage/browserStorageRepository.js'
import { loadWritingBooks, subscribeWritingBooks } from '../writing/writingBooksRepository.js'
import { PROJECT_SURFACE_ROUTE_NAMES, resolveRouteIntent } from './workspaceTabContract.js'

export const WORKSPACE_RECENT_VERSION = 1
export const WORKSPACE_RECENT_LIMIT = 40
export const WORKSPACE_RECENT_SURFACE_LABELS = Object.freeze({
  authoring: '正文', materials: '灵感素材', canvas: '视频与编导', settings: '设定',
  sources: '资料', map: '世界地图', comics: '漫画制作', entries: '编辑台', documents: '文档'
})

// Only navigation identities and human-assigned titles cross this boundary.
const QUERY_KEYS = Object.freeze(['bookId', 'chapterId', 'explorationId', 'view', 'worldbookId', 'pageId', 'panelId', 'entryId', 'focus', 'mode', 'action'])
const OBJECT_QUERY_KEYS = Object.freeze(['chapterId', 'explorationId', 'pageId', 'panelId', 'entryId', 'focus'])
const OBJECT_KINDS = new Set(['chapter', 'exploration', 'comic-page'])
const text = (value, max = 200) => typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, max) : ''
const identifier = value => {
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  return normalized.length <= 200 ? normalized : ''
}
const copy = value => JSON.parse(JSON.stringify(value))

function routeSurface(route) {
  if (route?.name === 'settings-worldbook-create' && route.query?.bookId && route.query.mode === 'sources' && route.query.action === 'add') return 'sources'
  const intent = resolveRouteIntent(route)
  return intent?.scope === 'project' ? intent.surface : ''
}

function safeRoute(route, bookId, surface) {
  if (!route || typeof route.name !== 'string') return null
  const query = {}
  for (const key of QUERY_KEYS) {
    const raw = route.query?.[key]
    const value = identifier(raw)
    if (raw != null && raw !== '' && !value) return null
    if (value) query[key] = value
  }
  if (query.bookId && query.bookId !== bookId) return null
  query.bookId = bookId
  if (query.view && query.view !== 'assistant') delete query.view
  const candidate = { name: route.name, query }
  if (routeSurface(candidate) !== surface) return null
  return candidate
}

function normalizeLocation(input, lastUsedAt = Date.now()) {
  if (!input || typeof input !== 'object') return null
  const bookId = identifier(input.bookId)
  const surface = text(input.surface, 40)
  if (!bookId || !PROJECT_SURFACE_ROUTE_NAMES[surface]) return null
  const route = safeRoute(input.route, bookId, surface)
  if (!route) return null
  let object = null
  if (input.object != null) {
    const kind = text(input.object.kind, 40)
    const id = identifier(input.object.id)
    if (!OBJECT_KINDS.has(kind) || !id) return null
    const locatorKey = kind === 'chapter' ? 'chapterId' : kind === 'exploration' ? 'explorationId' : 'pageId'
    if ((kind === 'comic-page' ? surface !== 'comics' : surface !== 'authoring') || route.query[locatorKey] !== id) return null
    const panelId = kind === 'comic-page' ? identifier(input.object.panelId) : ''
    if (input.object.panelId && !panelId) return null
    if (String(route.query.panelId || '') !== panelId) return null
    object = { kind, id, title: text(input.object.title, 160), ...(panelId ? { panelId } : {}) }
  } else if (OBJECT_QUERY_KEYS.some(key => route.query[key])) {
    // A route alone cannot attest that a requested object was actually opened.
    return null
  }
  // A comic page is one recent target. Its latest panel remains a locator in
  // route/object, rather than creating an indistinguishable row for each panel.
  const panelKey = object?.kind === 'comic-page' ? '' : object?.panelId || ''
  const key = JSON.stringify([bookId, surface, route.name, route.query.view || '', object?.kind || '', object?.id || '', panelKey, route.query.mode || '', route.query.action || ''])
  const stamp = Number(lastUsedAt)
  if (!Number.isFinite(stamp) || stamp <= 0 || !Number.isFinite(new Date(stamp).getTime()) || stamp > Date.now() + 86400000) return null
  return { key, bookId, surface, route, object, lastUsedAt: stamp, ...(input.unavailableReason ? { unavailableReason: 'object-removed' } : {}) }
}

export function sanitizeWorkspaceRecentHistory(payload) {
  if (!payload || payload.version !== WORKSPACE_RECENT_VERSION || !Array.isArray(payload.entries)) return []
  const entries = new Map()
  for (const raw of payload.entries.slice(0, WORKSPACE_RECENT_LIMIT * 4)) {
    const entry = normalizeLocation(raw, raw?.lastUsedAt)
    if (!entry) continue
    if (!entries.has(entry.key) || entries.get(entry.key).lastUsedAt < entry.lastUsedAt) entries.set(entry.key, entry)
  }
  return [...entries.values()].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, WORKSPACE_RECENT_LIMIT)
}

export function workspaceRecentSurfaceLabel(entry) {
  if (entry.surface === 'authoring' && entry.route.query.view === 'assistant') return '助手'
  if (entry.surface === 'sources' && entry.route.name === 'settings-worldbook-create') return '资料导入'
  return WORKSPACE_RECENT_SURFACE_LABELS[entry.surface] || '工作区'
}

export function createWorkspaceRecentHistory({ repository = null, readBooks = loadWritingBooks, clock = Date.now } = {}) {
  let entries = []
  let persistenceNotice = ''
  let hydrated = false
  let readFailed = false
  const listeners = new Set()
  const storage = () => repository || createBrowserStorageRepository()
  const snapshot = () => ({ entries: copy(entries), persistenceNotice })
  const publish = () => {
    for (const listener of listeners) { try { listener(snapshot()) } catch { /* Navigation remains usable. */ } }
  }
  function legacyTabHistory() {
    let tabs = []
    try {
      const raw = storage().getText(STORAGE_KEYS.WORKSPACE_TABS)
      tabs = raw ? JSON.parse(raw)?.tabs : []
    } catch { return [] }
    const books = readBooks()
    const candidates = []
    for (const tab of Array.isArray(tabs) ? tabs.slice(-WORKSPACE_RECENT_LIMIT * 4) : []) {
      const bookId = identifier(tab.projectId)
      const book = books.find(item => String(item.id) === bookId)
      if (tab.scope !== 'project' || !book || !tab.route) continue
      if (tab.route.query?.bookId && String(tab.route.query.bookId) !== bookId) continue
      const route = { name: tab.route.name, query: { ...tab.route.query, bookId } }
      const surface = routeSurface(route)
      let object = null
      if (route.query.chapterId) {
        const id = identifier(route.query.chapterId)
        object = { kind: 'chapter', id, title: book.chapters?.find(chapter => String(chapter.id) === id)?.title || '' }
      } else if (route.query.pageId) object = { kind: 'comic-page', id: route.query.pageId, title: '', panelId: route.query.panelId || '' }
      const entry = normalizeLocation({ bookId, surface, route, object }, tab.lastActiveAt)
      if (entry) candidates.push(entry)
    }
    return sanitizeWorkspaceRecentHistory({ version: WORKSPACE_RECENT_VERSION, entries: candidates })
  }
  function hydrate() {
    if (hydrated) return snapshot()
    hydrated = true
    let migrated = false
    try {
      const raw = storage().getText(STORAGE_KEYS.WORKSPACE_RECENT)
      entries = raw ? sanitizeWorkspaceRecentHistory(JSON.parse(raw)) : legacyTabHistory()
      migrated = !raw && entries.length > 0
    } catch {
      readFailed = true
      persistenceNotice = '最近工作记录读取失败，本次记录暂留在页面中。'
    }
    const removed = reconcileBooks({ persist: false })
    // One-time migration carries actual tab usage time, never modification time.
    if ((migrated || removed) && !readFailed) persist()
    return snapshot()
  }
  function persist() {
    if (readFailed) { publish(); return false }
    try {
      storage().setJson(STORAGE_KEYS.WORKSPACE_RECENT, { version: WORKSPACE_RECENT_VERSION, entries })
      persistenceNotice = ''
      publish()
      return true
    } catch {
      persistenceNotice = '最近工作记录未能保存，刷新后可能丢失；正文保存不受此提示影响。'
      publish()
      return false
    }
  }
  function reconcileBooks({ persist: shouldPersist = true } = {}) {
    const valid = new Set(readBooks().map(book => String(book.id)))
    const next = entries.filter(entry => valid.has(entry.bookId))
    if (next.length === entries.length) { publish(); return false }
    entries = next
    if (shouldPersist) persist()
    else publish()
    return true
  }
  function record(input) {
    hydrate()
    const entry = normalizeLocation(input, clock())
    if (!entry || !readBooks().some(book => String(book.id) === entry.bookId)) return { ok: false, reason: 'invalid-location', record: null }
    const previousEntries = JSON.stringify(entries)
    const previous = entries.find(item => item.key === entry.key)
    const refiningVisit = entry.object && !entries[0]?.object && entries[0]?.bookId === entry.bookId && entries[0]?.surface === entry.surface && (entries[0]?.route.query.view || '') === (entry.route.query.view || '')
    // Context reports preserve time. A confirmed object can refine the generic
    // visit just recorded by the successful route without losing its use time.
    if (input.mode === 'context' && previous) entry.lastUsedAt = Math.max(previous.lastUsedAt, refiningVisit ? entries[0].lastUsedAt : 0)
    entries = entries.filter(item => item.key !== entry.key && !(entry.object && !item.object && item.bookId === entry.bookId && item.surface === entry.surface && (item.route.query.view || '') === (entry.route.query.view || '')))
    entries.unshift(entry)
    entries = entries.sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, WORKSPACE_RECENT_LIMIT)
    const changed = previousEntries !== JSON.stringify(entries)
    const persisted = changed || persistenceNotice ? persist() : (publish(), true)
    return { ok: true, persisted, record: copy(entry) }
  }
  function invalidate({ bookId, surface, objectId, panelId } = {}) {
    hydrate()
    let changed = false
    entries = entries.map(entry => {
      if (entry.bookId !== String(bookId || '') || entry.surface !== surface || entry.object?.id !== String(objectId || '') || (panelId && entry.object?.panelId !== String(panelId))) return entry
      changed = true
      return { ...entry, unavailableReason: 'object-removed' }
    })
    if (changed) persist()
    return changed
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  return Object.freeze({ hydrate, snapshot, record, invalidate, reconcileBooks, subscribe })
}

let sharedHistory = null
function history() {
  if (!sharedHistory) {
    sharedHistory = createWorkspaceRecentHistory()
    subscribeWritingBooks(() => sharedHistory.reconcileBooks())
  }
  return sharedHistory
}
export const getWorkspaceRecentSnapshot = () => history().hydrate()
export const subscribeWorkspaceRecentHistory = listener => history().subscribe(listener)
export const recordWorkspaceRecentLocation = input => history().record(input)
export const invalidateWorkspaceRecentObject = input => history().invalidate(input)

export function recordWorkspaceRecentRoute(route) {
  const surface = routeSurface(route)
  // Authoring can still reject its owner after the route guard saved. Even an
  // empty manuscript is recorded only by the controller after owner acceptance.
  if (!surface || surface === 'authoring' || route.query?.start || OBJECT_QUERY_KEYS.some(key => route.query?.[key])) return { ok: false, reason: 'page-confirmation-required' }
  return recordWorkspaceRecentLocation({ bookId: route.query?.bookId, surface, route })
}

export function resolveRecentBookId(books = loadWritingBooks()) {
  const valid = new Set(books.map(book => String(book.id)))
  return getWorkspaceRecentSnapshot().entries.find(entry => valid.has(entry.bookId))?.bookId || ''
}

// Resolution reads the owning repository; it never substitutes a different
// chapter/page/panel. Imported content and media payloads are not copied out.
export async function resolveWorkspaceRecentEntry(raw, { books = loadWritingBooks(), comicPages = null } = {}) {
  const entry = normalizeLocation(raw, raw?.lastUsedAt)
  if (!entry) return { available: false, reason: 'invalid-location' }
  const book = books.find(item => String(item.id) === entry.bookId)
  if (!book) return { ...entry, available: false, reason: 'book-removed' }
  const base = { ...entry, bookTitle: text(book.title, 160), surfaceLabel: workspaceRecentSurfaceLabel(entry) }
  if (entry.unavailableReason) return { ...base, available: false, reason: 'object-removed' }
  if (!entry.object) return { ...base, available: true }
  let found = null
  let panelNumber = null
  try {
    if (entry.object.kind === 'chapter') found = book.chapters?.find(chapter => String(chapter.id) === entry.object.id)
    else if (entry.object.kind === 'exploration') {
      const { getExplorationDocument } = await import('../writing/authoringDocumentRepository.js')
      found = getExplorationDocument(entry.bookId, entry.object.id)
    } else if (entry.object.kind === 'comic-page') {
      let pages = comicPages
      if (!pages) {
        const { listComicPages } = await import('../media/comicPageStore.js')
        pages = listComicPages()
      }
      found = pages.find(page => String(page.projectId || '') === entry.bookId && page.id === entry.object.id)
      if (found && entry.object.panelId) {
        const panelIndex = found.panels.findIndex(panel => panel.id === entry.object.panelId)
        if (panelIndex < 0) return { ...base, available: false, reason: 'object-removed' }
        panelNumber = panelIndex + 1
      }
    }
  } catch { return { ...base, available: false, reason: 'lookup-failed' } }
  if (!found) return { ...base, available: false, reason: 'object-removed' }
  return { ...base, available: true, ...(panelNumber ? { panelNumber } : {}), object: { ...entry.object, title: text(found.title, 160) || entry.object.title } }
}

export async function resolveWorkspaceRecentEntries(entries) {
  const books = loadWritingBooks()
  let comicPages = null
  if (entries.some(entry => entry.object?.kind === 'comic-page')) {
    try {
      const { listComicPages } = await import('../media/comicPageStore.js')
      comicPages = listComicPages()
    } catch { /* Individual resolution reports the unavailable lookup. */ }
  }
  return Promise.all(entries.map(entry => resolveWorkspaceRecentEntry(entry, { books, comicPages })))
}
