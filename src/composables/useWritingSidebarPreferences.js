// 侧栏收起偏好（writing_sidebar_preferences_v1）：首页侧栏（W-A，collapsed）
// 与创作台章节树左栏（W-B，writingCollapsed）共用一键、各写各的字段。
// 归类 'preference'（设备偏好），容错风格对齐 useStorage.js：失败静默回落。
// 键注册面与 writing_dock_preferences_v1 同一套：STORAGE_KEYS / storageKeyPolicy / PINAX_BACKUP_KEYS。
// （2026-10-11 W-B：writing_dock_preferences_v1 已随四段 dock 退役删除，本键沿用其注册面惯例。）
import { STORAGE_KEYS } from './useStorage.js'

const STORAGE_KEY = STORAGE_KEYS.WRITING_SIDEBAR_PREFERENCES

// collapsed 缺省 false：侧栏默认展开（W-A 拍定，Obsidian 对齐）。
export const DEFAULT_SIDEBAR_PREFERENCES = Object.freeze({ collapsed: false, writingCollapsed: false })

export function normalizeWritingSidebarPreferences(value = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.freeze({
    collapsed: source.collapsed === true,
    writingCollapsed: source.writingCollapsed === true
  })
}

export function loadWritingSidebarPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return normalizeWritingSidebarPreferences(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizeWritingSidebarPreferences(null)
  }
}

// 合并落盘：调用方只传自己拥有的字段（首页侧栏传 collapsed，创作台传
// writingCollapsed），另一侧字段保留已存值——两侧切换互不覆盖。
export function saveWritingSidebarPreferences(value) {
  try {
    const patch = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const next = normalizeWritingSidebarPreferences({ ...loadWritingSidebarPreferences(), ...patch })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}
