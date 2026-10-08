// 本地项目设置与绑定面（轻模块）：设置字段、注册表查询、自动建项目绑定。
// 只依赖 useStorage + fetch，可在 node smoke 中独立加载；payload 组装在 localMirrorService.js（浏览器域）。
import { getItem, setItem, STORAGE_KEYS } from '../composables/useStorage.js'

const SETTINGS_KEY = STORAGE_KEYS.LOCAL_MIRROR_SETTINGS

function normalizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: value.enabled !== false,
    customRoot: typeof value.customRoot === 'string' ? value.customRoot : '',
    defaultCreateRoot: typeof value.defaultCreateRoot === 'string' ? value.defaultCreateRoot : '',
    defaultReadRoot: typeof value.defaultReadRoot === 'string' ? value.defaultReadRoot : ''
  }
}

export function getLocalMirrorSettings() {
  return normalizeSettings(getItem(SETTINGS_KEY, null))
}

/** 「本地项目」设置面板读写。customRoot 仅为兼容保留。 */
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

export async function listLocalProjects() {
  const response = await fetch('/api/localmirror/projects')
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) return []
  return Array.isArray(body.projects) ? body.projects : []
}

/** 改注册表绑定（bookId=null 解绑；磁盘不动）。失败抛错由调用方展示。 */
export async function bindLocalProject(projectId, bookId) {
  const response = await fetch('/api/localmirror/projects/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, bookId })
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) throw Object.assign(new Error(body?.message || 'bind failed'), { status: response.status })
  return body.entry
}

/** 从注册表移除项目条目（磁盘文件夹不动）。 */
export async function removeLocalProject(projectId) {
  const response = await fetch('/api/localmirror/projects/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId })
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) throw Object.assign(new Error(body?.message || 'remove failed'), { status: response.status })
}

/** Windows 原生文件夹选择器：服务端拉起真实系统对话框（同机），返回绝对路径；取消返回 null；不可用抛 NATIVE_PICKER_UNAVAILABLE。 */
export async function pickFolderNative(initial = '', { pollMs = 500, timeoutMs = 10 * 60_000 } = {}) {
  const startResponse = await fetch('/api/localmirror/projects/pick-folder/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initial })
  })
  const startBody = await startResponse.json().catch(() => null)
  if (!startResponse.ok || startBody?.ok !== true) {
    throw Object.assign(new Error(startBody?.message || 'native picker unavailable'), { code: 'NATIVE_PICKER_UNAVAILABLE' })
  }
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollMs))
    if (Date.now() > deadline) throw Object.assign(new Error('native picker timeout'), { code: 'NATIVE_PICKER_TIMEOUT' })
    const resultResponse = await fetch(`/api/localmirror/projects/pick-folder/result?id=${encodeURIComponent(startBody.pickId)}`)
    const result = await resultResponse.json().catch(() => null)
    if (!resultResponse.ok || !result || !result.done) continue
    if (result.failed) throw Object.assign(new Error('native picker failed'), { code: 'NATIVE_PICKER_UNAVAILABLE' })
    if (result.cancelled || !result.path) return null
    return result.path
  }
}
