import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'

const OPEN_EVENT = 'pinax:transient-layer-open'
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

// 已打开层级的栈:嵌套弹层(设置 → 模型选择)按 Esc 时只有栈顶层关闭,
// 不会一次全部关闭。层按打开顺序入栈,关闭/卸载时出栈。
const layerStack = []
// 同一次按键只允许最顶层消费:内层关闭后栈顶变化,外层 handler 不得接力关闭。
const consumedEscapes = new WeakSet()

function pushLayer(id) {
  if (!layerStack.includes(id)) layerStack.push(id)
}

function popLayer(id) {
  const index = layerStack.indexOf(id)
  if (index >= 0) layerStack.splice(index, 1)
}

export function trapFocusWithin(event, container) {
  if (event?.key !== 'Tab' || !(container instanceof HTMLElement)) return false
  const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter((element) => element instanceof HTMLElement && !element.hidden && element.getAttribute('aria-hidden') !== 'true')
  if (!focusable.length) return false

  const first = focusable[0]
  const last = focusable.at(-1)
  const active = document.activeElement
  const target = event.shiftKey
    ? (active === first || !container.contains(active) ? last : null)
    : (active === last || !container.contains(active) ? first : null)
  if (!target) return false
  event.preventDefault()
  target.focus()
  return true
}

export function useTransientLayer({
  id,
  isOpen,
  onClose,
  initialFocus,
  returnFocus,
  exclusive = true
}) {
  let previouslyFocused = null

  function close() {
    if (!isOpen.value) return
    onClose?.()
  }

  function handleLayerOpen(event) {
    if (!exclusive || !isOpen.value || event.detail?.id === id) return
    close()
  }

  // 打开期间挂起一次焦点恢复;close 的 watcher 与卸载钩子谁先到,
  // 都只恢复一次(v-if 弹窗卸载时 isOpen 已是 false,不能用它判断)。
  let focusRestorePending = false

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !isOpen.value) return
    // IME 组合中的 Esc 用于取消候选,不应当作关闭弹层。
    if (event.isComposing || event.keyCode === 229) return
    // 嵌套时只有最上层响应 Esc;且同一次按键只消费一次,
    // 防止内层出栈后外层 handler 在同一事件里接力关闭。
    if (layerStack[layerStack.length - 1] !== id) return
    if (consumedEscapes.has(event)) return
    consumedEscapes.add(event)
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  function restoreFocusAfterClose() {
    focusRestorePending = false
    const explicitTarget = returnFocus?.()
      || document.querySelector(`[data-transient-trigger="${id}"]`)
    const target = explicitTarget || previouslyFocused
    previouslyFocused = null
    nextTick(() => {
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    })
  }

  const stopWatch = watch(isOpen, (open, wasOpen) => {
    if (open) {
      previouslyFocused = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      pushLayer(id)
      focusRestorePending = true
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id } }))
      nextTick(() => initialFocus?.()?.focus?.())
      return
    }

    popLayer(id)
    if (wasOpen !== true) return
    restoreFocusAfterClose()
  }, { flush: 'post', immediate: true })

  onMounted(() => {
    if (isOpen.value) {
      pushLayer(id)
      focusRestorePending = true
    }
    window.addEventListener(OPEN_EVENT, handleLayerOpen)
    document.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    // v-if 挂载的弹窗(如 Welcome 的设置)关闭即卸载,此时 watcher 已停,
    // 挂起的焦点恢复必须在这里补一次。
    const shouldRestore = focusRestorePending
    popLayer(id)
    stopWatch()
    window.removeEventListener(OPEN_EVENT, handleLayerOpen)
    document.removeEventListener('keydown', handleKeydown)
    if (shouldRestore) restoreFocusAfterClose()
  })

  return { close }
}
