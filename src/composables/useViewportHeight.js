import { onBeforeUnmount, onMounted } from 'vue'

const VIEWPORT_HEIGHT_VAR = '--app-viewport-height'
const VIEWPORT_HALF_HEIGHT_VAR = '--app-viewport-half-height'

// UI 全局缩放反补偿 (themeStore.applyToHtml 会把缩放值写到 <html data-ui-zoom>)。
// 内容被 zoom/transform 缩到 zoom×100vh 后, 要让布局高度 ÷zoom 才能在视觉上
// 正好填满视口, 否则底部露出 html 背景白条。
// 这里刻意不 import pinia 的 useThemeStore: 该函数在 resize 等事件回调里被调用,
// 已离开组件 setup 上下文, useStore() 会抛"没有激活的 pinia"。用 DOM 属性读取,
// 零依赖、任何上下文都能用。
function readUiZoom() {
  const raw = document?.documentElement?.getAttribute('data-ui-zoom')
  const zoom = Number(raw)
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
}

function syncViewportHeight() {
  if (typeof window === 'undefined' || !document?.documentElement) return

  const height = Math.round(window.visualViewport?.height || window.innerHeight || 0)
  if (!height) return

  const zoom = readUiZoom()
  const layoutHeight = height / zoom
  document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${layoutHeight}px`)
  document.documentElement.style.setProperty(VIEWPORT_HALF_HEIGHT_VAR, `${layoutHeight / 2}px`)
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
