// 右侧常驻工作台（AuthoringDock）的本地宽度偏好。
// 归类 'preference'（设备偏好，不入作品备份），容错风格对齐 useStorage.js：失败静默回落。
import { STORAGE_KEYS } from './useStorage.js'

const STORAGE_KEY = STORAGE_KEYS.WRITING_DOCK_PREFERENCES

export const DOCK_WIDTH_MIN = 360
export const DOCK_WIDTH_MAX = 520

// width 0 表示作者从未拖过宽度：CSS 继续用默认 clamp，不把下限强加给没动过的人。
export const DEFAULT_DOCK_PREFERENCES = Object.freeze({ width: 0 })

// 拖拽过程中的严格 clamp：永远落在 [360, 520]，不产生 0 哨兵。
export function clampDockWidth(value) {
  const width = Math.round(Number(value))
  if (!Number.isFinite(width)) return DOCK_WIDTH_MIN
  return Math.min(DOCK_WIDTH_MAX, Math.max(DOCK_WIDTH_MIN, width))
}

export function normalizeDockPreferences(value = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const width = Number(source.width)
  return Object.freeze({
    width: Number.isFinite(width) && width > 0 ? clampDockWidth(width) : DEFAULT_DOCK_PREFERENCES.width
  })
}

export function loadDockPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return normalizeDockPreferences(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizeDockPreferences(null)
  }
}

export function saveDockPreferences(value) {
  try {
    const preferences = normalizeDockPreferences(value)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}
