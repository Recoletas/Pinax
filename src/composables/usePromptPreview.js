import { ref } from 'vue'

// 提示词预览是跨组件单开的抽屉：同一时刻只有一个快照键处于打开态。
// 打开键与消息/草稿上的快照键相等时，对应组件渲染 PromptPreviewPanel。
export const promptPreviewKey = ref('')
let lastTrigger = null

export function openPromptPreview(key) {
  const next = String(key || '')
  if (!next) return
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    lastTrigger = document.activeElement
  }
  promptPreviewKey.value = next
}

export function closePromptPreview() {
  promptPreviewKey.value = ''
  const trigger = lastTrigger
  lastTrigger = null
  if (trigger && trigger.isConnected && typeof trigger.focus === 'function') {
    trigger.focus({ preventScroll: true })
  }
}
