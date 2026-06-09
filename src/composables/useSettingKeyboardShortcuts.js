import { onBeforeUnmount, onMounted, ref } from 'vue'

// 快捷键范围：
//   - `?`           → 切换提示 modal（不在任何输入框内）
//   - Cmd/Ctrl + S  → 立即 flush（任何位置）
//   - Cmd/Ctrl + Shift + Z / Y → 字段级 undo/redo（仅在 data-setting-field-card 内的输入框）
//
// 挂 `keydown` capture phase，确保在 input 的 native 行为前拦截。
export function useSettingKeyboardShortcuts(handlers = {}) {
  const hintsOpen = ref(false)

  function isSettingFieldTarget(el) {
    if (!el || typeof el.closest !== 'function') return false
    return el.closest('[data-setting-field-card]') !== null
  }

  function isPageInputTarget(el) {
    if (!el || typeof el.closest !== 'function') return false
    return el.closest('[data-setting-page-input]') !== null
  }

  function onKeydown(e) {
    const cmd = e.metaKey || e.ctrlKey
    const inSettingField = isSettingFieldTarget(e.target)
    const inPageInput = isPageInputTarget(e.target)

    if (cmd && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      handlers.save?.()
      return
    }

    if (cmd && e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
      if (inSettingField) {
        e.preventDefault()
        handlers.undo?.()
        return
      }
    }
    if (cmd && e.shiftKey && (e.key === 'Y' || e.key === 'y')) {
      if (inSettingField) {
        e.preventDefault()
        handlers.redo?.()
        return
      }
    }

    if (inSettingField || inPageInput) return
    if (e.key === '?' && !cmd && !e.altKey) {
      e.preventDefault()
      hintsOpen.value = !hintsOpen.value
    } else if (e.key === 'Escape' && hintsOpen.value) {
      hintsOpen.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown, { capture: true })
  })
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown, { capture: true })
  })

  return { hintsOpen }
}
