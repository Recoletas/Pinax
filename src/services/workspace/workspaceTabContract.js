// 工作台标签合同（计划 Task 2）：纯函数层，无 Vue / router / pinia 依赖。
// 标签是路由与项目上下文的可恢复视图，不是第二套数据真源。
// MVP 粒度：project:{bookId}:{surface} / global:{surface}，同 key 去重聚焦。

export const WORKSPACE_TAB_SCHEMA_VERSION = 1

// project surface -> 完整工作区路由名。设定真源链是 bookId -> book.worldbookId -> worldbook。
export const PROJECT_SURFACE_ROUTE_NAMES = Object.freeze({
  authoring: 'authoring',
  materials: 'materials',
  canvas: 'prose-essay',
  settings: 'settings-structured',
  map: 'settings-world-map',
  comics: 'comics'
})

export const GLOBAL_SURFACE_ROUTE_NAMES = Object.freeze({
  experience: 'experience',
  docs: 'docs',
  'settings-worldbook': 'settings-worldbook',
  'settings-worldbook-create': 'settings-worldbook-create',
  'settings-worldbook-advanced': 'settings-worldbook-advanced',
  'online-experience': 'online-experience'
})

export const SURFACE_LABELS = Object.freeze({
  authoring: '写作',
  materials: '素材',
  canvas: '画布',
  settings: '设定',
  map: '地图',
  comics: '漫画',
  experience: '体验',
  docs: '文档',
  'settings-worldbook': '设定',
  'settings-worldbook-create': '创建世界书',
  'settings-worldbook-advanced': '高级设定',
  'online-experience': '联机'
})

let tabIdSequence = 0

export function createTabId() {
  tabIdSequence += 1
  return `wt_${Date.now().toString(36)}_${tabIdSequence.toString(36)}`
}

export function buildProjectTabKey(projectId, surface) {
  return `project:${String(projectId || '')}:${surface}`
}

export function buildGlobalTabKey(surface) {
  return `global:${surface}`
}

export function parseTabKey(key) {
  if (typeof key !== 'string') return null
  const parts = key.split(':')
  if (parts[0] === 'project' && parts.length === 3 && parts[1] && parts[2]) {
    return { scope: 'project', projectId: parts[1], surface: parts[2] }
  }
  if (parts[0] === 'global' && parts.length === 2 && parts[1]) {
    return { scope: 'global', projectId: null, surface: parts[1] }
  }
  return null
}

// 路由 -> 标签意图：只识别已冻结的 surface 矩阵，未知路由不产生标签。
// project surface 必须带 bookId query（书籍上下文真源）。
export function resolveRouteIntent(route) {
  if (!route || typeof route.name !== 'string') return null
  const name = route.name
  const query = route.query || {}
  const bookId = typeof query.bookId === 'string' && query.bookId ? query.bookId : ''
  for (const [surface, routeName] of Object.entries(PROJECT_SURFACE_ROUTE_NAMES)) {
    if (routeName === name) {
      if (!bookId) return null
      return {
        scope: 'project',
        surface,
        projectId: bookId,
        worldbookId: typeof query.worldbookId === 'string' && query.worldbookId ? query.worldbookId : null
      }
    }
  }
  for (const [surface, routeName] of Object.entries(GLOBAL_SURFACE_ROUTE_NAMES)) {
    if (routeName === name) {
      return { scope: 'global', surface, projectId: null, worldbookId: null }
    }
  }
  return null
}

export function intentToTabKey(intent) {
  if (!intent || typeof intent !== 'object') return ''
  if (intent.scope === 'project') return buildProjectTabKey(intent.projectId, intent.surface)
  if (intent.scope === 'global') return buildGlobalTabKey(intent.surface)
  return ''
}

export function buildDefaultRouteForIntent(intent) {
  if (!intent || typeof intent !== 'object') return null
  const query = {}
  if (intent.scope === 'project') {
    const routeName = PROJECT_SURFACE_ROUTE_NAMES[intent.surface]
    if (!routeName) return null
    query.bookId = intent.projectId
    if (intent.worldbookId) query.worldbookId = intent.worldbookId
    if (intent.chapterId) query.chapterId = intent.chapterId
    if (intent.focus) query.focus = intent.focus
    return { name: routeName, query }
  }
  const routeName = GLOBAL_SURFACE_ROUTE_NAMES[intent.surface]
  if (!routeName) return null
  return { name: routeName, query: {} }
}

// 标题规则：写作标签显示书名；项目子 surface 显示「书名 · 素材/画布/设定」。
export function resolveTabTitle(intent, bookTitle) {
  if (!intent) return '工作区'
  if (intent.scope === 'global') {
    return SURFACE_LABELS[intent.surface] || '工作区'
  }
  const title = String(bookTitle || '').trim() || '未命名项目'
  if (intent.surface === 'authoring') return title
  const label = SURFACE_LABELS[intent.surface]
  return label ? `${title} · ${label}` : title
}

export function createWorkspaceTab(intent, { bookTitle = '', route = null, restoreState = null } = {}) {
  const key = intentToTabKey(intent)
  if (!key) return null
  return {
    id: createTabId(),
    key,
    scope: intent.scope,
    surface: intent.surface,
    projectId: intent.scope === 'project' ? String(intent.projectId) : null,
    worldbookId: intent.worldbookId ? String(intent.worldbookId) : null,
    title: resolveTabTitle(intent, bookTitle),
    route: route || buildDefaultRouteForIntent(intent) || { name: 'welcome', query: {} },
    pinned: false,
    dirty: false,
    lastActiveAt: Date.now(),
    restoreState: restoreState ? { ...restoreState } : {}
  }
}

export function normalizeWorkspaceTab(raw) {
  if (!raw || typeof raw !== 'object') return null
  const parsed = parseTabKey(raw.key)
  if (!parsed) return null
  const route = raw.route && typeof raw.route === 'object' && typeof raw.route.name === 'string'
    ? raw.route
    : null
  if (!route) return null
  const tab = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createTabId(),
    key: raw.key,
    scope: parsed.scope,
    surface: parsed.surface,
    projectId: parsed.scope === 'project' ? parsed.projectId : null,
    worldbookId: typeof raw.worldbookId === 'string' && raw.worldbookId ? raw.worldbookId : null,
    title: String(raw.title || '').trim() || resolveTabTitle(parsed),
    route,
    pinned: Boolean(raw.pinned),
    dirty: Boolean(raw.dirty),
    lastActiveAt: Number(raw.lastActiveAt) || Date.now(),
    restoreState: raw.restoreState && typeof raw.restoreState === 'object' ? { ...raw.restoreState } : {}
  }
  return tab
}

// 持久化清洗：版本不符丢弃重建、书不存在移除、去重保留最新。
export function sanitizePersistedTabs(payload, validProjectIds) {
  if (!payload || typeof payload !== 'object') return { tabs: [], activeTabId: '' }
  if (Number(payload.version) !== WORKSPACE_TAB_SCHEMA_VERSION) return { tabs: [], activeTabId: '' }
  if (!Array.isArray(payload.tabs)) return { tabs: [], activeTabId: '' }
  const valid = new Set(validProjectIds.map(String))
  const byKey = new Map()
  for (const raw of payload.tabs) {
    const tab = normalizeWorkspaceTab(raw)
    if (!tab) continue
    if (tab.scope === 'project' && !valid.has(String(tab.projectId))) continue
    const existing = byKey.get(tab.key)
    if (!existing || tab.lastActiveAt >= existing.lastActiveAt) byKey.set(tab.key, tab)
  }
  const tabs = [...byKey.values()].sort((a, b) => a.lastActiveAt - b.lastActiveAt)
  const activeTabId = tabs.some((tab) => tab.id === payload.activeTabId) ? payload.activeTabId : ''
  return { tabs, activeTabId }
}

// 关闭邻居：确定性选择右侧标签，其次左侧；最后一个标签由调用方回欢迎页。
export function chooseCloseNeighbor(tabs, closingTabId) {
  const index = tabs.findIndex((tab) => tab.id === closingTabId)
  if (index === -1) return null
  if (index + 1 < tabs.length) return tabs[index + 1]
  if (index > 0) return tabs[index - 1]
  return null
}

// 两个路由是否表达同一标签定位（name + 书/章/focus 定位意图）。
export function tabRouteEqualsRoute(tab, route) {
  if (!tab || !route) return false
  if (tab.route.name !== route.name) return false
  const tabQuery = tab.route.query || {}
  const routeQuery = route.query || {}
  const keys = ['bookId', 'chapterId', 'focus', 'worldbookId']
  return keys.every((key) => String(tabQuery[key] || '') === String(routeQuery[key] || ''))
}

export function extractRestoreStateFromRoute(route) {
  const query = route?.query || {}
  const restoreState = {}
  if (typeof query.chapterId === 'string' && query.chapterId) restoreState.chapterId = query.chapterId
  if (typeof query.focus === 'string' && query.focus) restoreState.objectId = query.focus
  return restoreState
}
