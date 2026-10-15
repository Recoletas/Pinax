import { shallowReactive } from 'vue'

export const WORKSPACE_EXTENSION_PREFERENCES = 'pinax_workspace_extension_preferences_v1'

// Trusted, repository-owned registrations. This registry does not load URLs or
// grant access to tools, models, repositories, or the user's filesystem.
export function createWorkspaceExtensionRegistry(initial = [], persist = () => {}) {
  const views = Object.create(null)
  const renderers = new Map()
  const extensions = shallowReactive(new Map())
  const state = shallowReactive({ disabled: [], revision: 0 })
  function register(definition) {
    if (!definition || !/^[a-z][a-z0-9.-]{0,79}$/.test(definition.id) || !definition.title || !Array.isArray(definition.views) || !definition.views.length || extensions.has(definition.id)) throw new Error('扩展注册信息无效或标识重复。')
    const types = new Set()
    for (const view of definition.views) {
      if (!/^[a-z][a-z0-9-]{0,79}$/.test(view.type) || !view.title || !view.icon || (typeof view.load !== 'function' && typeof view.renderer !== 'string') || views[view.type] || types.has(view.type)) throw new Error('扩展视图无效或类型重复。')
      types.add(view.type)
    }
    const extension = Object.freeze({ ...definition, required: Boolean(definition.required), views: Object.freeze(definition.views.map(view => Object.freeze({ ...view, extensionId: definition.id, load: view.load || (() => { const loader = renderers.get(view.renderer); if (!loader) throw new Error('此视图尚未装配。'); return loader() }) }))) })
    for (const view of extension.views) views[view.type] = view
    extensions.set(extension.id, extension); state.revision++
    return extension
  }
  function bindRenderers(values) {
    const entries = Object.entries(values || {})
    if (entries.some(([, load]) => typeof load !== 'function')) throw new Error('视图组件加载器无效。')
    entries.forEach(([key, load]) => renderers.set(key, load))
  }
  function enabled(id) { return Boolean(extensions.get(id)?.required || extensions.has(id) && !state.disabled.includes(id)) }
  function setEnabled(id, value) {
    const extension = extensions.get(id)
    if (!extension || extension.required && !value) return { ok: false, message: '此扩展是工作台的基础能力。' }
    const next = value ? state.disabled.filter(item => item !== id) : [...new Set([...state.disabled, id])]
    try { persist({ version: 1, disabled: next }) } catch { return { ok: false, message: '扩展偏好未能保存，请重试。' } }
    state.disabled = next; state.revision++
    return { ok: true }
  }
  function restore(value) { state.disabled = value?.version === 1 && Array.isArray(value.disabled) ? value.disabled.filter(id => typeof id === 'string') : []; state.revision++ }
  function getView(type) { void state.revision; return views[type] }
  initial.forEach(register)
  return { views, extensions, state, register, bindRenderers, enabled, setEnabled, restore, getView }
}
const view = (type, title, icon, renderer) => ({ type, title, icon, renderer })
const builtins = [
  { id: 'pinax.core', title: '创作工作台', description: '正文、构思、设定与资料的编辑和查阅。', icon: 'project', required: true, version: '1', views: [
    view('home', '首页', 'library', 'home'),
    view('extensions', '扩展', 'extensions', 'extensions'),
    view('sources', '资料', 'sources', 'sources'),
    view('settings-editor', '设定', 'worldbook', 'settings'),
    view('map-editor', '地图', 'map', 'module'), view('entries-editor', '条目', 'list', 'module'),
    view('game-editor', '跑团', 'adventure', 'module'), view('online-editor', '联机', 'users', 'module'),
    view('source', '来源原文', 'source-file', 'reference'), view('chapter', '正文参考', 'chapter', 'reference'),
    view('exploration', '构思', 'idea', 'reference'), view('entry', '设定参考', 'worldbook', 'reference')
  ] },
  { id: 'pinax.comics', title: '漫画', description: '编排分镜、制作漫画页面，查看已有漫画素材。', icon: 'comics', version: '1', views: [view('comic-editor', '漫画', 'comics', 'module'), view('comic', '漫画参考', 'comics', 'media')] },
  { id: 'pinax.director', title: '视频', description: '组织镜头、编导画布与视频素材。', icon: 'film', version: '1', views: [view('director-editor', '视频', 'film', 'module'), view('video', '镜头视频', 'film', 'media')] },
  { id: 'pinax.materials', title: '素材与插画', description: '整理素材、制作插画并查看图片。', icon: 'image', version: '1', views: [view('materials-editor', '素材与插画', 'image', 'module'), view('asset', '素材参考', 'image', 'media')] }
]
export const workspaceExtensions = createWorkspaceExtensionRegistry(builtins, value => localStorage.setItem(WORKSPACE_EXTENSION_PREFERENCES, JSON.stringify(value)))
try { workspaceExtensions.restore(JSON.parse(localStorage.getItem(WORKSPACE_EXTENSION_PREFERENCES))) } catch { /* Invalid display preferences leave built-ins available. */ }
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === WORKSPACE_EXTENSION_PREFERENCES || event.key === null) {
    try { workspaceExtensions.restore(JSON.parse(localStorage.getItem(WORKSPACE_EXTENSION_PREFERENCES))) } catch { /* Keep the last valid state. */ }
  }
})
