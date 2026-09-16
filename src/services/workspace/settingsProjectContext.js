// 设定页项目上下文合同（联动闭环计划 L1）：纯解析、无 router / store 副作用。
// 真源链：bookId -> book.worldbookId；路由里的 worldbookId 只做一致性核对。
// 页面据此决定加载与文案；本模块不修改 book.worldbookId 或世界书 active 状态。

export const SETTINGS_CONTEXT_SCHEMA_VERSION = 1

function text(value) {
  return String(value ?? '').trim()
}

/**
 * @param {object} input
 * @param {Array<{id:string, worldbookId?:string, title?:string}>} input.books 已加载的书稿列表
 * @param {string} input.bookId 路由/调用方给出的书稿定位（可为空 = 全局模式）
 * @param {string} input.worldbookId 路由快照（仅核对用，可为空）
 * @param {string} [input.fallbackWorldbookId] 全局模式的兜底 active 世界书（仅 mode=global 时使用）
 */
export function resolveSettingsProjectContext({ books = [], bookId = '', worldbookId = '', fallbackWorldbookId = '' } = {}) {
  const wantedBookId = text(bookId)
  const routeWorldbookId = text(worldbookId)
  if (!wantedBookId) {
    // 全局设定管理：显式 worldbookId 优先，否则沿用调用方的 active 兜底。
    const globalWorldbookId = routeWorldbookId || text(fallbackWorldbookId)
    return {
      schemaVersion: SETTINGS_CONTEXT_SCHEMA_VERSION,
      mode: 'global',
      bookId: '',
      worldbookId: globalWorldbookId,
      book: null,
      source: routeWorldbookId ? 'explicit-global' : 'fallback-active',
      status: globalWorldbookId ? 'ready' : 'unbound',
      notice: ''
    }
  }
  const book = books.find((item) => text(item?.id) === wantedBookId) || null
  if (!book) {
    return {
      schemaVersion: SETTINGS_CONTEXT_SCHEMA_VERSION,
      mode: 'project',
      bookId: wantedBookId,
      worldbookId: '',
      book: null,
      source: 'book-binding',
      status: 'missing-book',
      notice: '这本书已不存在。'
    }
  }
  const boundWorldbookId = text(book.worldbookId)
  if (!boundWorldbookId) {
    return {
      schemaVersion: SETTINGS_CONTEXT_SCHEMA_VERSION,
      mode: 'project',
      bookId: wantedBookId,
      worldbookId: '',
      book,
      source: 'book-binding',
      status: 'unbound',
      notice: '这本书还没有关联世界书。'
    }
  }
  const routeMismatch = Boolean(routeWorldbookId) && routeWorldbookId !== boundWorldbookId
  return {
    schemaVersion: SETTINGS_CONTEXT_SCHEMA_VERSION,
    mode: 'project',
    bookId: wantedBookId,
    worldbookId: boundWorldbookId,
    book,
    source: 'book-binding',
    status: routeMismatch ? 'route-mismatch' : 'ready',
    notice: routeMismatch ? '这本书关联的世界书已变化，已按当前关联打开。' : ''
  }
}

/**
 * 世界书内容加载的竞态包装：只认最后一次请求。加载失败/缺失返回 typed 结果，
 * 不回退到其他世界书。loader 由调用方注入（worldStore.loadWorldbookForProject）。
 */
export function createSettingsWorldbookLoader(loader) {
  let sequence = 0
  return async function load(worldbookId) {
    const wanted = text(worldbookId)
    if (!wanted) return { ok: false, reason: 'worldbook-id-required', worldbook: null }
    const ticket = ++sequence
    let loaded = null
    try {
      loaded = await loader(wanted)
    } catch {
      if (ticket !== sequence) return { ok: false, reason: 'superseded', worldbook: null }
      return { ok: false, reason: 'worldbook-load-failed', worldbook: null }
    }
    if (ticket !== sequence) return { ok: false, reason: 'superseded', worldbook: null }
    if (!loaded) return { ok: false, reason: 'missing-worldbook', worldbook: null }
    return { ok: true, reason: '', worldbook: loaded }
  }
}
