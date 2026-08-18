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

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !isOpen.value) return
    event.preventDefault()
    close()
  }

  const stopWatch = watch(isOpen, (open, wasOpen) => {
    if (open) {
      previouslyFocused = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id } }))
      nextTick(() => initialFocus?.()?.focus?.())
      return
    }

    if (!wasOpen) return
    const explicitTarget = returnFocus?.()
      || document.querySelector(`[data-transient-trigger="${id}"]`)
    const target = explicitTarget || previouslyFocused
    previouslyFocused = null
    nextTick(() => {
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    })
  }, { flush: 'post' })

  onMounted(() => {
    window.addEventListener(OPEN_EVENT, handleLayerOpen)
    document.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    stopWatch()
    window.removeEventListener(OPEN_EVENT, handleLayerOpen)
    document.removeEventListener('keydown', handleKeydown)
  })

  return { close }
}
