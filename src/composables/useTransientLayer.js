import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'

const OPEN_EVENT = 'pinax:transient-layer-open'

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
