import { onBeforeUnmount, onMounted } from 'vue'

const VIEWPORT_HEIGHT_VAR = '--app-viewport-height'
const VIEWPORT_HALF_HEIGHT_VAR = '--app-viewport-half-height'

function syncViewportHeight() {
  if (typeof window === 'undefined' || !document?.documentElement) return

  const height = Math.round(window.visualViewport?.height || window.innerHeight || 0)
  if (!height) return

  document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${height}px`)
  document.documentElement.style.setProperty(VIEWPORT_HALF_HEIGHT_VAR, `${Math.round(height / 2)}px`)
}

export function useViewportHeight() {
  onMounted(() => {
    syncViewportHeight()
    window.addEventListener('resize', syncViewportHeight, { passive: true })
    window.addEventListener('orientationchange', syncViewportHeight, { passive: true })
    window.visualViewport?.addEventListener('resize', syncViewportHeight, { passive: true })
    window.visualViewport?.addEventListener('scroll', syncViewportHeight, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncViewportHeight)
    window.removeEventListener('orientationchange', syncViewportHeight)
    window.visualViewport?.removeEventListener('resize', syncViewportHeight)
    window.visualViewport?.removeEventListener('scroll', syncViewportHeight)
  })
}
