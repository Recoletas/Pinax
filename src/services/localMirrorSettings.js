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

function sanitizeProjectFolderName(input) {
  return (
    String(input ?? '')
      // 文件名消毒本就要清控制字符——豁免与 server/services/localMirrorService.js 同款
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '') || '未命名项目')
}

/** 配了默认新建位置时，为书自动建项目文件夹并绑定 bookId；冲突/失败静默返回 null（回落文档根镜像）。 */
export async function ensureProjectForBook(book) {
  const { defaultCreateRoot } = getLocalMirrorSettings()
  if (!defaultCreateRoot || !book?.id || !book?.title) return null
  try {
    const response = await fetch('/api/localmirror/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: `${defaultCreateRoot.replace(/[\\/]+$/, '')}/${sanitizeProjectFolderName(book.title)}`,
        name: book.title,
        kind: 'novel',
        bookId: book.id
      })
    })
    const body = await response.json().catch(() => null)
    if (response.ok && body?.ok) return body.entry
    return null
  } catch {
    return null
  }
}
