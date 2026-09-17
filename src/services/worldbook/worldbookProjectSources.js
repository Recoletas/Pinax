import { loadWritingBooks, findWritingBook, saveWritingBooksDurable } from '../writing/writingBooksRepository'
import { archiveSourceDocuments } from './worldbookSourceArchive'

// N-A：书级资料归属与绑定服务（NA02/NA05）。
// bookId → book.worldbookId 是项目世界书唯一真源；本模块是把"导入资料"接回
// 设定区的唯一绑定写入点。Authoring 的显式换绑（含锚点迁移确认）仍归写作页，
// 这里只做创建工作区需要的两种安全动作：未绑定建库绑定、已绑定追加来源。

function resolveBook(books, bookId) {
  const id = String(bookId || '').trim()
  if (!id) return { ok: false, reason: 'book-id-required' }
  const book = findWritingBook(books, id)
  if (!book) return { ok: false, reason: 'book-not-found' }
  return { ok: true, book }
}

// 解析当前书上下文：项目模式严格走 book.worldbookId，绝不回退全局 active。
export function resolveBookSourceContext(bookId, books = loadWritingBooks()) {
  const resolved = resolveBook(books, bookId)
  if (!resolved.ok) return resolved
  const worldbookId = String(resolved.book.worldbookId || '').trim()
  return {
    ok: true,
    book: resolved.book,
    worldbookId: worldbookId || null,
    mode: worldbookId ? 'project' : 'unbound'
  }
}

// 未绑定书：建随书资料库并绑定。已绑定书直接返回现库（幂等）。
// 命名沿用写作页既有约定 `${书名}·资料库`。
export async function ensureBookWorldbook({ bookId, worldStore, name = '' } = {}) {
  const context = resolveBookSourceContext(bookId)
  if (!context.ok) return { ok: false, reason: context.reason }
  if (context.mode === 'project') {
    const loaded = await worldStore.loadWorldbookForProject(context.worldbookId)
    if (!loaded) return { ok: false, reason: 'worldbook-missing', book: context.book }
    return { ok: true, book: context.book, worldbookId: context.worldbookId, created: false }
  }
  const created = await worldStore.createWorldbook({
    name: name || `${context.book.title || '未命名书稿'}·资料库`,
    description: `随书资料库：${context.book.title || ''}`
  })
  if (!created?.id) return { ok: false, reason: 'worldbook-create-failed', book: context.book }
  const bound = await bindBookWorldbook({ bookId, worldbookId: created.id })
  if (!bound.ok) {
    // 半成品防护：绑定失败不得留下误指向，也不留下孤儿库（本流程刚建）。
    try { await worldStore.deleteWorldbook(created.id) } catch { /* 补偿尽力而为 */ }
    return { ok: false, reason: bound.reason, book: context.book }
  }
  return { ok: true, book: context.book, worldbookId: created.id, created: true }
}

// 绑定写入：写 book.worldbookId，持久化失败回滚内存并如实报错。
// 已绑定到同一库是幂等成功；绑定到"另一本"必须走 Authoring 显式换绑，这里拒绝。
export async function bindBookWorldbook({ bookId, worldbookId } = {}) {
  const books = loadWritingBooks()
  const resolved = resolveBook(books, bookId)
  if (!resolved.ok) return { ok: false, reason: resolved.reason }
  const targetId = String(worldbookId || '').trim()
  if (!targetId) return { ok: false, reason: 'worldbook-id-required' }
  const currentId = String(resolved.book.worldbookId || '').trim()
  if (currentId && currentId !== targetId) {
    return { ok: false, reason: 'book-already-bound', currentWorldbookId: currentId }
  }
  if (currentId === targetId) return { ok: true, book: resolved.book, rebound: false }
  const nextBooks = books.map(book => book.id === resolved.book.id
    ? { ...book, worldbookId: targetId }
    : book)
  const saved = saveWritingBooksDurable(nextBooks)
  if (!saved || saved.ok === false) {
    return { ok: false, reason: 'binding-persist-failed' }
  }
  return { ok: true, book: resolved.book, rebound: true }
}

// 已绑定书：把一批资料追加进当前资料库。归档失败不写 worldbook；来源按
// sourceId/contentHash 去重，重复追加幂等（同名不同内容是新来源）。
export async function appendSourcesToWorldbook({ worldbookId, documents = [], worldStore } = {}) {
  const id = String(worldbookId || '').trim()
  if (!id) return { ok: false, reason: 'worldbook-id-required' }
  const inputs = (Array.isArray(documents) ? documents : []).filter(Boolean)
  if (!inputs.length) return { ok: true, added: 0, skipped: 0, sources: [] }
  const archived = await archiveSourceDocuments(inputs)
  const existing = await worldStore.loadWorldbookForProject(id)
  if (!existing) return { ok: false, reason: 'worldbook-missing' }
  const existingSources = Array.isArray(existing.sourceDocuments) ? existing.sourceDocuments : []
  const seenIds = new Set(existingSources.map(source => String(source.id)))
  const seenHashes = new Set(existingSources.map(source => String(source.contentHash || '')))
  const merged = [...existingSources]
  let added = 0
  let skipped = 0
  for (const source of archived) {
    // 归档条目按既有世界书形状（id/contentPreview/...）原样入册，仅补充
    // 合同字段 sourceId 与 scope；用纯合同形状会被 normalizeWorldbook 剥离。
    if (!source?.id) continue
    const reference = { ...source, sourceId: source.sourceId || source.id }
    if (seenIds.has(reference.sourceId) || (reference.contentHash && seenHashes.has(reference.contentHash))) {
      skipped += 1
      continue
    }
    reference.scope = { kind: 'worldbook', bookId: null, worldbookId: id }
    seenIds.add(reference.sourceId)
    if (reference.contentHash) seenHashes.add(reference.contentHash)
    merged.push(reference)
    added += 1
  }
  if (!added) return { ok: true, added: 0, skipped, sources: [] }
  // worldStore.updateWorldbook resolves to the updated worldbook itself and
  // throws typed errors on failure (mutation unwrap semantics).
  try {
    const updated = await worldStore.updateWorldbook(id, { sourceDocuments: merged })
    if (!updated?.id) return { ok: false, reason: 'source-attach-failed' }
  } catch (error) {
    return { ok: false, reason: 'source-attach-failed', detail: error?.message || String(error) }
  }
  return { ok: true, added, skipped, sources: archived }
}

// 供创建工作区确认流程使用：确保目标库存在并绑定（未绑定时建库），再追加。
// 失败保证不留下误绑定：绑定失败时新建库会被删除（ensureBookWorldbook 内）。
export async function attachSourcesToBook({ bookId, documents = [], worldStore } = {}) {
  const ensured = await ensureBookWorldbook({ bookId, worldStore })
  if (!ensured.ok) return ensured
  const appended = await appendSourcesToWorldbook({
    worldbookId: ensured.worldbookId,
    documents,
    worldStore
  })
  if (!appended.ok) return { ...appended, book: ensured.book, worldbookId: ensured.worldbookId }
  return { ...appended, book: ensured.book, worldbookId: ensured.worldbookId, created: ensured.created }
}
