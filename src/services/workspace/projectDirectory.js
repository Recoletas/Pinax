import { normalizeWorkspaceResource } from './workspaceViewContract.js'

export const DIRECTORY_PREFIX = 'pinax-project-directory:v1:'
export const DEFAULT_FOLDERS = Object.freeze([
  { id: 'manuscript', name: '书稿', parentId: '', order: 0 },
  { id: 'ideas', name: '构思', parentId: '', order: 1 },
  { id: 'settings', name: '设定', parentId: '', order: 2 },
  { id: 'sources', name: '资料', parentId: '', order: 3 },
  { id: 'assets', name: '素材', parentId: '', order: 4 }
])
export function directoryResourceKey(raw) {
  const ref = normalizeWorkspaceResource(raw)
  if (!ref?.id || !ref.bookId) return ''
  return JSON.stringify([ref.bookId, ref.type, ['entry', 'source'].includes(ref.type) ? ref.worldbookId : '', ref.id])
}
export function createDirectory() {
  return { version: 1, revision: 0, folders: DEFAULT_FOLDERS.map(folder => ({ ...folder })), placements: [], links: [] }
}
export function validateDirectory(value, bookId) {
  if (value?.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.folders) || !Array.isArray(value.placements) || !Array.isArray(value.links)) throw new Error('目录格式无法读取，原记录已保留。')
  const ids = new Set()
  for (const folder of value.folders) {
    if (!folder || typeof folder.id !== 'string' || !folder.id || ids.has(folder.id) || typeof folder.name !== 'string' || !folder.name.trim() || typeof folder.parentId !== 'string' || !Number.isFinite(folder.order)) throw new Error('目录文件夹记录无效，原记录已保留。')
    ids.add(folder.id)
  }
  const byId = new Map(value.folders.map(folder => [folder.id, folder]))
  for (const folder of value.folders) {
    const seen = new Set([folder.id]); let parent = folder.parentId
    while (parent) {
      if (!byId.has(parent) || seen.has(parent)) throw new Error('目录层级无效，原记录已保留。')
      seen.add(parent); parent = byId.get(parent).parentId
    }
  }
  const validKey = key => {
    try { const [book, type, worldbook, id] = JSON.parse(key); return typeof id === 'string' && book === bookId && directoryResourceKey({ bookId: book, type, worldbookId: worldbook, id }) === key } catch { return false }
  }
  const placed = new Set()
  for (const item of value.placements) {
    if (!validKey(item?.key) || placed.has(item.key) || (item.parentId !== '' && !ids.has(item.parentId)) || !Number.isFinite(item.order)) throw new Error('目录资源记录无效，原记录已保留。')
    placed.add(item.key)
  }
  for (const link of value.links) if (!validKey(link?.from) || !validKey(link?.to) || link.from === link.to) throw new Error('目录关联记录无效，原记录已保留。')
  // Whitelist metadata: the directory must never acquire a copy of content.
  return { version: 1, revision: value.revision,
    folders: value.folders.map(({ id, name, parentId, order }) => ({ id, name, parentId, order })),
    placements: value.placements.map(({ key, parentId, order }) => ({ key, parentId, order })),
    links: value.links.map(({ from, to }) => ({ from, to })) }
}
export function readDirectory(bookId) {
  const raw = localStorage.getItem(DIRECTORY_PREFIX + bookId)
  if (raw === null) return createDirectory()
  let value
  try { value = JSON.parse(raw) } catch { throw new Error('目录记录损坏，原数据已保留，可通过备份恢复。') }
  return validateDirectory(value, bookId)
}
export function saveDirectory(bookId, previous, next) {
  const current = readDirectory(bookId)
  if (current.revision !== previous.revision) throw new Error('目录已在另一窗口更新，请刷新目录后重试。')
  const value = validateDirectory({ ...next, revision: current.revision + 1 }, bookId)
  try { localStorage.setItem(DIRECTORY_PREFIX + bookId, JSON.stringify(value)) }
  catch { throw new Error('目录未能保存，请检查浏览器存储空间后重试。原归档位置未改变。') }
  window.dispatchEvent(new CustomEvent('pinax-project-directory-changed', { detail: { bookId } }))
  return value
}
export function directoryRows(directory, resources) {
  const folders = new Map(directory.folders.map(item => [item.id, item]))
  const placements = new Map(directory.placements.map(item => [item.key, item]))
  const rows = directory.folders.map(folder => ({ ...folder, key: `folder:${folder.id}`, folder: true, title: folder.name, icon: 'folder', label: '文件夹' }))
  resources.forEach((item, index) => {
    const key = directoryResourceKey(item.resource)
    if (!key) return
    const placement = placements.get(key)
    const preferred = placement?.parentId ?? item.folder
    rows.push({ ...item, folder: false, key, parentId: folders.has(preferred) ? preferred : '', order: placement?.order ?? index })
  })
  const path = row => {
    const parts = []; let parent = row.parentId
    while (parent && folders.has(parent)) { const folder = folders.get(parent); parts.unshift(folder.name); parent = folder.parentId }
    return parts.join(' / ')
  }
  return rows.map(row => ({ ...row, path: path(row) }))
}
export function moveDirectoryRow(directory, row, parentId, order) {
  const next = JSON.parse(JSON.stringify(directory))
  if (row.folder) {
    const folder = next.folders.find(item => item.id === row.id)
    if (!folder) throw new Error('文件夹已不存在。')
    folder.parentId = parentId; folder.order = order
  } else {
    const placement = { key: row.key, parentId, order }
    const index = next.placements.findIndex(item => item.key === row.key)
    if (index < 0) next.placements.push(placement)
    else next.placements[index] = placement
  }
  return next
}
