import { onBeforeUnmount, watch } from 'vue'

// Keep a shared lock counter so multiple overlays can coexist safely.
let lockCount = 0
let savedOverflow = ''
let savedPaddingRight = ''

function getScrollbarWidth() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth)
}

function lockBodyScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const body = document.body
  if (!body) return

  if (lockCount === 0) {
    savedOverflow = body.style.overflow
    savedPaddingRight = body.style.paddingRight

    const scrollbarWidth = getScrollbarWidth()
    if (scrollbarWidth > 0) {
      const computedPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight || '0') || 0
      body.style.paddingRight = `${computedPadding + scrollbarWidth}px`
    }

    body.style.overflow = 'hidden'
  }

  lockCount += 1
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return
  if (lockCount === 0) return

  lockCount -= 1
  if (lockCount > 0) return

  const body = document.body
  if (!body) return

  body.style.overflow = savedOverflow
  body.style.paddingRight = savedPaddingRight
}

export function useBodyScrollLock(shouldLockRef) {
  let isLocked = false

  const stop = watch(
    shouldLockRef,
    (shouldLock) => {
      if (shouldLock && !isLocked) {
        lockBodyScroll()
        isLocked = true
        return
      }

      if (!shouldLock && isLocked) {
        unlockBodyScroll()
        isLocked = false
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stop()
    if (isLocked) {
      unlockBodyScroll()
      isLocked = false
    }
  })
}