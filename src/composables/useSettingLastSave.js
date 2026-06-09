import { ref, watch, onBeforeUnmount } from 'vue'

export function useSettingLastSave(saveTrigger) {
  const lastSavedAt = ref(null)
  const displayText = ref('尚未保存')

  function refresh() {
    if (!saveTrigger?.value) {
      lastSavedAt.value = null
      displayText.value = '尚未保存'
      return
    }
    lastSavedAt.value = saveTrigger.value
    displayText.value = formatRelative(saveTrigger.value)
  }

  function tick() {
    if (lastSavedAt.value) displayText.value = formatRelative(lastSavedAt.value)
  }

  refresh()
  const stop = watch(saveTrigger, () => refresh())

  const interval = setInterval(tick, 30000)
  onBeforeUnmount(() => {
    stop()
    clearInterval(interval)
  })

  return { lastSavedAt, displayText, refresh }
}

export function formatRelative(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 5000) return '刚刚'
  if (diff < 60000) return `${Math.floor(diff / 1000)} 秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
