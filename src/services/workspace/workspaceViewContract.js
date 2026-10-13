export const WORKSPACE_VIEW_LIMIT = 32

// Resource identity is independent of a view's position and display title.
export const WORKSPACE_VIEW_TYPES = Object.freeze({
  sources: { title: '资料', icon: 'sources' },
  'settings-editor': { title: '设定', icon: 'worldbook' },
  'comic-editor': { title: '漫画', icon: 'comics' },
  'director-editor': { title: '视频', icon: 'film' },
  'map-editor': { title: '地图', icon: 'map' },
  'entries-editor': { title: '条目', icon: 'list' },
  'game-editor': { title: '跑团', icon: 'adventure' },
  'online-editor': { title: '联机', icon: 'users' },
  'materials-editor': { title: '素材与插画', icon: 'image' },
  source: { title: '来源原文', icon: 'source-file' },
  chapter: { title: '正文参考', icon: 'chapter' },
  exploration: { title: '构思', icon: 'idea' },
  entry: { title: '设定参考', icon: 'worldbook' },
  asset: { title: '素材参考', icon: 'image' },
  comic: { title: '漫画参考', icon: 'comics' },
  video: { title: '镜头视频', icon: 'film' }
})

export const WORKSPACE_MODULE_ROUTES = Object.freeze({ 'comic-editor': 'comics', 'director-editor': 'prose-essay', 'materials-editor': 'materials', 'game-editor': 'experience', 'online-editor': 'online-experience', 'map-editor': 'settings-world-map', 'entries-editor': 'settings-worldbook-advanced' })
export const isWorkspaceModule = type => Object.hasOwn(WORKSPACE_MODULE_ROUTES, type)

const text = value => typeof value === 'string' ? value.trim() : ''
export function normalizeWorkspaceResource(value) {
  if (!value || !WORKSPACE_VIEW_TYPES[value.type]) return null
  const bookId = text(value.bookId)
  const worldbookId = text(value.worldbookId)
  const id = text(value.id)
  if (!bookId && !worldbookId) return null
  if (isWorkspaceModule(value.type) && !bookId) return null
  if (value.type === 'game-editor' && !worldbookId) return null
  if (['chapter', 'exploration'].includes(value.type) && (!bookId || !id)) return null
  if (['asset', 'comic', 'video'].includes(value.type) && (!bookId || !id)) return null
  if (['source', 'entry'].includes(value.type) && !id) return null
  const resource = { type: value.type, bookId, worldbookId, id }
  // Only navigation metadata is persisted. No content, grant or provider keys.
  for (const key of ['contentHash', 'chunkId', 'versionId', 'pageId', 'panelId', 'assetId', 'roomSlug', 'entryId', 'placeId', 'historyNodeId', 'sessionId', 'messageId', 'settingsCategory', 'entryRequestId']) if (text(value[key])) resource[key] = text(value[key])
  if (typeof value.focusEntry === 'boolean') resource.focusEntry = value.focusEntry
  if (['files', 'sources', 'knowledge'].includes(value.sourcesView)) resource.sourcesView = value.sourcesView
  if (['detail', 'table', 'graph'].includes(value.settingsView)) resource.settingsView = value.settingsView
  if (['materials', 'illustration'].includes(value.workspace)) resource.workspace = value.workspace
  if (Number.isFinite(value.start) && value.start >= 0) resource.start = value.start
  if (Number.isFinite(value.end) && value.end >= (resource.start || 0)) resource.end = value.end
  return resource
}

export function workspaceResourceKey(resource) {
  const ref = normalizeWorkspaceResource(resource)
  return ref ? JSON.stringify([ref.type, ref.bookId, isWorkspaceModule(ref.type) || ['chapter', 'exploration', 'asset', 'comic', 'video'].includes(ref.type) ? '' : ref.worldbookId, ref.id, ref.type === 'video' ? ref.versionId || '' : '']) : ''
}

export function normalizeWorkspaceLayout(value, scope) {
  if (value?.version !== 1 || !Array.isArray(value.views)) return null
  const seen = new Set()
  const seenInstances = new Set()
  const views = value.views.slice(0, WORKSPACE_VIEW_LIMIT).flatMap(raw => {
    const resource = normalizeWorkspaceResource(raw?.resource)
    if (!resource || (scope.bookId ? resource.bookId !== scope.bookId : resource.bookId || resource.worldbookId !== scope.worldbookId)) return []
    const key = workspaceResourceKey(resource)
    const id = typeof raw.id === 'string' && raw.id.length <= 4096 && raw.id ? raw.id : key
    if (seen.has(key) || seenInstances.has(id)) return []
    seen.add(key)
    seenInstances.add(id)
    return [{ id, resource, pinned: Boolean(raw.pinned), group: raw.group === 'main' || id === value.mainModuleId || (value.expanded && id === value.activeId) ? 'main' : 'side' }]
  })
  const mainModuleId = views.find(view => view.group === 'main' && view.id === (value.mainModuleId || (value.expanded ? value.activeId : '')))?.id || views.find(view => view.group === 'main')?.id || ''
  const sideActiveId = views.find(view => view.group === 'side' && view.id === (value.sideActiveId || value.activeId))?.id || views.find(view => view.group === 'side')?.id || ''
  return { views, mainModuleId, sideActiveId, activeId: views.some(view => view.id === value.activeId) ? value.activeId : views.at(-1)?.id || '',
    expanded: false, hidden: Boolean(value.hidden), width: Math.min(680, Math.max(320, Number(value.width) || 420)) }
}
