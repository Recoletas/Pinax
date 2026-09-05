// 工作台标签 store（计划 Task 2）：只负责视图会话，不是第二套数据真源。
// 纯 store 可在无 router / 无页面环境下表达多书多 surface；
// 路由副作用（push/replace）由 workspaceRouteAdapter 执行，activate/close 返回目标路由。
// 持久化只保存安全导航状态（route + restoreState），不保存正文、ghost 或页面缓存。
import { defineStore } from 'pinia'
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage'
import { loadWritingBooks, subscribeWritingBooks } from '../services/writing/writingBooksRepository'
import {
  WORKSPACE_TAB_SCHEMA_VERSION,
  chooseCloseNeighbor,
  createWorkspaceTab,
  extractRestoreStateFromRoute,
  intentToTabKey,
  resolveRouteIntent,
  resolveTabTitle,
  sanitizePersistedTabs
} from '../services/workspace/workspaceTabContract'

export const WORKSPACE_TABS_FALLBACK_ROUTE = Object.freeze({ name: 'welcome', query: {} })

// 模块级：订阅句柄不需要响应式，也不进入持久化。
let booksUnsubscribe = null
// caret / selection / scroll 只用于一次工作台往返，绝不进入 localStorage。
// Map 保存纯页面对象会迫使 persisted tabs 承担编辑器状态，违反标签 store 的
// 导航职责，因此使用模块级 session ledger，并在消费后立即删除。
const volatileRestoreStateByKey = new Map()

function readPersistedPayload() {
  const raw = getItem(STORAGE_KEYS.WORKSPACE_TABS)
  if (!raw || typeof raw !== 'object') return null
  return raw
}

export const useWorkspaceTabsStore = defineStore('workspaceTabs', {
  state: () => ({
    tabs: [],
    activeTabId: '',
    hydrated: false,
    // quota 失败只提示一次布局无法恢复，不阻止正文工作。
    persistenceNotice: '',
    // 书被外部删除时提示一次，之后清空。
    projectRemovedNotice: '',
    bookIndex: {}
  }),

  getters: {
    activeTab(state) {
      return state.tabs.find((tab) => tab.id === state.activeTabId) || null
    },
    activeTabRoute() {
      return this.activeTab?.route || null
    },
    projectTabCount(state) {
      return state.tabs.filter((tab) => tab.scope === 'project').length
    }
  },

  actions: {
    // —— hydrate：清洗版本、剔除不存在的书、确保当前路由有标签 ——
    hydrate({ route = null } = {}) {
      this.refreshBookIndex()
      const payload = readPersistedPayload()
      const { tabs, activeTabId } = sanitizePersistedTabs(payload, Object.keys(this.bookIndex))
      this.tabs = tabs
      this.activeTabId = activeTabId
      if (route) this.syncFromRoute(route)
      if (!this.activeTabId && this.tabs.length > 0) {
        const latest = [...this.tabs].sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
        this.activeTabId = latest.id
      }
      this.hydrated = true
      this.subscribeToBooks()
      this.persist()
    },

    subscribeToBooks() {
      if (booksUnsubscribe) return
      booksUnsubscribe = subscribeWritingBooks(() => {
        this.refreshBookIndex()
        this.reconcileWithBooks()
      })
    },

    refreshBookIndex() {
      const index = {}
      for (const book of loadWritingBooks()) {
        index[String(book.id)] = {
          id: String(book.id),
          title: book.title,
          worldbookId: book.worldbookId || ''
        }
      }
      this.bookIndex = index
    },

    // 书删除 → 关闭该书全部 surface 标签；重命名/换绑 → 同步标题与世界书快照。
    reconcileWithBooks() {
      const validIds = new Set(Object.keys(this.bookIndex))
      const removedActive = this.tabs.some((tab) => tab.scope === 'project' && !validIds.has(String(tab.projectId)) && tab.id === this.activeTabId)
      this.tabs = this.tabs.filter((tab) => tab.scope !== 'project' || validIds.has(String(tab.projectId)))
      for (const tab of this.tabs) {
        if (tab.scope !== 'project') continue
        const book = this.bookIndex[String(tab.projectId)]
        if (!book) continue
        tab.title = resolveTabTitle({ scope: tab.scope, surface: tab.surface, projectId: tab.projectId }, book.title)
        tab.worldbookId = book.worldbookId || null
      }
      if (!this.tabs.some((tab) => tab.id === this.activeTabId)) {
        const latest = [...this.tabs].sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
        this.activeTabId = latest ? latest.id : ''
      }
      if (removedActive && !this.activeTabId) {
        this.projectRemovedNotice = '项目已不存在，相关标签已关闭'
      }
      this.persist()
    },

    // —— openOrFocus：按 key 去重；已有标签更新定位意图后聚焦 ——
    openOrFocus(intent, { route = null, restoreState = null } = {}) {
      if (!intent || typeof intent !== 'object') return null
      const key = intentToTabKey(intent)
      if (!key) return null
      const book = intent.scope === 'project' ? this.bookIndex[String(intent.projectId)] : null
      const existing = this.tabs.find((tab) => tab.key === key)
      if (existing) {
        existing.worldbookId = intent.worldbookId ? String(intent.worldbookId) : existing.worldbookId
        if (book) existing.title = resolveTabTitle(intent, book.title)
        if (route) existing.route = { ...route }
        if (restoreState) existing.restoreState = { ...existing.restoreState, ...restoreState }
        this.activate(existing.id)
        this.persist()
        return existing
      }
      const tab = createWorkspaceTab(intent, {
        bookTitle: book?.title || '',
        route: route || null,
        restoreState
      })
      if (!tab) return null
      this.tabs.push(tab)
      this.activate(tab.id)
      this.persist()
      return tab
    },

    // —— activate：只切换视图会话焦点，返回目标路由由 adapter push ——
    activate(tabId) {
      const tab = this.tabs.find((item) => item.id === tabId)
      if (!tab) return { ok: false, route: null }
      this.activeTabId = tab.id
      tab.lastActiveAt = Date.now()
      return { ok: true, route: tab.route }
    },

    // 清除焦点但不删标签：项目 surface 无书可解析（如空库直接进 /authoring）时，
    // 上一会话的高亮标签不得继续冒充当前工作区。
    clearActiveTab() {
      if (!this.activeTabId) return
      this.activeTabId = ''
      this.persist()
    },

    // —— syncFromRoute：直接 URL / back / forward / 旧入口都聚焦或创建正确标签 ——
    syncFromRoute(route) {
      const intent = resolveRouteIntent(route)
      if (!intent) {
        // 非标签 surface（欢迎页等）：不产生标签，也不清空已有会话。
        return null
      }
      const restoreState = extractRestoreStateFromRoute(route)
      const tab = this.openOrFocus(intent, { route: { name: route.name, query: { ...route.query } }, restoreState })
      return tab
    },

    // —— updateContext：页面回报标题、当前章、定位与 dirty ——
    updateContext(tabId, patch = {}) {
      const tab = this.tabs.find((item) => item.id === tabId)
      if (!tab) return false
      if (typeof patch.title === 'string' && patch.title.trim()) tab.title = patch.title.trim()
      if ('worldbookId' in patch) tab.worldbookId = patch.worldbookId ? String(patch.worldbookId) : null
      if ('dirty' in patch) tab.dirty = Boolean(patch.dirty)
      if (patch.restoreState && typeof patch.restoreState === 'object') {
        tab.restoreState = { ...tab.restoreState, ...patch.restoreState }
      }
      if (patch.route && typeof patch.route === 'object' && typeof patch.route.name === 'string') {
        tab.route = { ...patch.route }
      }
      this.persist()
      return true
    },

    // —— close：先选确定性邻居，再关闭；最后一页回到欢迎页 ——
    close(tabId) {
      const index = this.tabs.findIndex((tab) => tab.id === tabId)
      if (index === -1) return { ok: false, route: null }
      const closingActive = this.activeTabId === tabId
      const neighbor = chooseCloseNeighbor(this.tabs, tabId)
      this.tabs.splice(index, 1)
      if (!closingActive) {
        this.persist()
        return { ok: true, route: null }
      }
      if (neighbor) {
        const activation = this.activate(neighbor.id)
        this.persist()
        return { ok: true, route: activation.route }
      }
      this.activeTabId = ''
      this.persist()
      return { ok: true, route: { ...WORKSPACE_TABS_FALLBACK_ROUTE } }
    },

    closeProject(projectId) {
      const wanted = String(projectId || '')
      if (!wanted) return { ok: false, route: null }
      const remaining = this.tabs.filter((tab) => !(tab.scope === 'project' && String(tab.projectId) === wanted))
      if (remaining.length === this.tabs.length) return { ok: false, route: null }
      for (const key of volatileRestoreStateByKey.keys()) {
        if (key.startsWith(`project:${wanted}:`)) volatileRestoreStateByKey.delete(key)
      }
      const removedActive = this.tabs.some((tab) => tab.scope === 'project' && String(tab.projectId) === wanted && tab.id === this.activeTabId)
      this.tabs = remaining
      if (removedActive) {
        const latest = [...this.tabs].sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
        if (latest) {
          const activation = this.activate(latest.id)
          this.persist()
          return { ok: true, route: activation.route }
        }
        this.activeTabId = ''
        this.persist()
        return { ok: true, route: { ...WORKSPACE_TABS_FALLBACK_ROUTE } }
      }
      if (!this.tabs.some((tab) => tab.id === this.activeTabId)) this.activeTabId = ''
      this.persist()
      return { ok: true, route: null }
    },

    replaceProjectTitle(projectId, title) {
      const wanted = String(projectId || '')
      let changed = false
      for (const tab of this.tabs) {
        if (tab.scope !== 'project' || String(tab.projectId) !== wanted) continue
        const next = resolveTabTitle({ scope: tab.scope, surface: tab.surface, projectId: tab.projectId }, title)
        if (next !== tab.title) {
          tab.title = next
          changed = true
        }
      }
      if (changed) this.persist()
      return changed
    },

    setVolatileRestoreStateByKey(key, value) {
      const wanted = String(key || '')
      if (!wanted || !value || typeof value !== 'object') return false
      volatileRestoreStateByKey.set(wanted, value)
      return true
    },

    consumeVolatileRestoreStateByKey(key) {
      const wanted = String(key || '')
      if (!wanted || !volatileRestoreStateByKey.has(wanted)) return null
      const value = volatileRestoreStateByKey.get(wanted)
      volatileRestoreStateByKey.delete(wanted)
      return value
    },

    // 页面按标签 key 回报上下文（Authoring 无需知道 tabId）。
    updateContextByKey(key, patch = {}) {
      const tab = this.tabs.find((item) => item.key === key)
      if (!tab) return false
      return this.updateContext(tab.id, patch)
    },

    markDirty(tabId, dirty) {
      return this.updateContext(tabId, { dirty })
    },

    persist() {
      const payload = {
        version: WORKSPACE_TAB_SCHEMA_VERSION,
        tabs: this.tabs,
        activeTabId: this.activeTabId
      }
      const ok = setItem(STORAGE_KEYS.WORKSPACE_TABS, payload)
      this.persistenceNotice = ok ? '' : '本次标签布局无法恢复（存储空间不足）'
      return ok
    }
  }
})
