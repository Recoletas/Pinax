import { defineStore } from 'pinia'

export const DEFAULT_COLOR_SCHEME = 'light'
export const VALID_COLOR_SCHEMES = ['light', 'dark']
export const LS_COLOR = 'app_theme'

// Phase F: 全局 UI 缩放档位 (用户反馈默认 100% 偏大)
// CSS `zoom` 是最干净的方案, Chrome/Safari/Edge 都支持; Firefox 不支持 zoom,
// 用 transform: scale() 兜底 (注意: 两者只能选一个, 不能叠加)。
export const DEFAULT_UI_ZOOM = 0.85
export const VALID_UI_ZOOMS = [1, 0.95, 0.9, 0.85]
export const LS_UI_ZOOM = 'app_ui_zoom'

// 浏览器是否支持 CSS zoom (Chrome/Safari/Edge 支持, Firefox 不支持)
function detectCssZoomSupport() {
  if (typeof document === 'undefined') return false
  try {
    const probe = document.createElement('div')
    probe.style.zoom = '1'
    return probe.style.zoom === '1'
  } catch {
    return false
  }
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    colorScheme: DEFAULT_COLOR_SCHEME,
    uiZoom: DEFAULT_UI_ZOOM,
    initialized: false,
  }),
  actions: {
    initTheme() {
      let storedColorScheme = null
      try {
        storedColorScheme = localStorage.getItem(LS_COLOR)
      } catch {
        storedColorScheme = null
      }
      this.colorScheme = VALID_COLOR_SCHEMES.includes(storedColorScheme) ? storedColorScheme : DEFAULT_COLOR_SCHEME
      // 缩放的 stored 值仍保留（用户手动调过的 85/90/95/100% 会继续生效）。
      let z = null
      try {
        z = localStorage.getItem(LS_UI_ZOOM)
      } catch {
        z = null
      }
      const parsedZoom = Number(z)
      this.uiZoom = VALID_UI_ZOOMS.includes(parsedZoom) ? parsedZoom : DEFAULT_UI_ZOOM
      this.applyToHtml()
      this.initialized = true
    },
    setColorScheme(s) {
      if (!VALID_COLOR_SCHEMES.includes(s)) return
      this.colorScheme = s
      try { localStorage.setItem(LS_COLOR, s) } catch { /* storage disabled — in-memory state still applies */ }
      this.applyToHtml()
    },
    setUiZoom(z) {
      const parsed = Number(z)
      if (!VALID_UI_ZOOMS.includes(parsed)) return
      this.uiZoom = parsed
      try { localStorage.setItem(LS_UI_ZOOM, String(parsed)) } catch { /* storage disabled — in-memory state still applies */ }
      this.applyToHtml()
    },
    // 与 useViewportHeight.syncViewportHeight 同一公式: 布局高度 = 视口高 / zoom,
    // 内容被 zoom 缩放后视觉上仍正好填满视口 (否则底部露出 html 背景白条)。
    syncViewportHeightVar() {
      if (typeof window === 'undefined' || !document?.documentElement) return
      const height = Math.round(window.visualViewport?.height || window.innerHeight || 0)
      if (!height) return
      const layoutHeight = height / this.uiZoom
      document.documentElement.style.setProperty('--app-viewport-height', `${layoutHeight}px`)
      document.documentElement.style.setProperty('--app-viewport-half-height', `${layoutHeight / 2}px`)
    },
    applyToHtml() {
      const html = document.documentElement
      // Compatibility class name; this is the only current product theme.
      html.classList.add('theme-legacy')
      html.classList.remove('theme-dark', 'theme-light')
      html.classList.add(`theme-${this.colorScheme}`)

      // 全局缩放: 二选一, 不能叠加 (zoom + transform 会缩成 0.56 而非 0.85)。
      //
      // 关键修复 (Playwright 实测验证): zoom/transform 只缩放元素本身, 但 CSS 里
      // 所有 `--app-viewport-height: 100vh` (body/#app/AppShell 及 20+ 页面) 的
      // 高度按未缩放坐标系解析 —— zoom 0.85 下它们只渲染 85vh, 视口底部露出
      // html 背景就是我们看到的"白条/空白带"(legacy 下 #f3f3f3, 还带灰阴影接缝)。
      // 给 html 设背景色只是换色, 空白带仍在。真正的修复是把该变量反补偿为
      // `视口高 / zoom` (见 syncViewportHeightVar + useViewportHeight, 后者是
      // 权威写入方, 兼移动端 URL bar 适配)。实测: shell 765px → 900px 填满视口,
      // 灰阴影接缝消失, 幽灵滚动仅 3px。
      const body = document.body
      if (body) {
        const zoom = this.uiZoom
        // 缩放值暴露给 useViewportHeight —— 它才是 --app-viewport-height 的权威
        // 写入方 (要兼容移动端 URL bar 场景), 这里只补一次写, 保证 zoom 切换时
        // 立即生效, 不用等 resize 事件。
        document.documentElement.dataset.uiZoom = String(zoom)
        this.syncViewportHeightVar()
        if (detectCssZoomSupport()) {
          body.style.zoom = String(zoom)
          body.style.transform = ''
          body.style.transformOrigin = ''
          body.style.width = ''
          body.style.minHeight = ''
          // html 背景作兜底: 长页滚到底 / 回弹过滚动时, 露出的 canvas 用主题色
          // 而不是浏览器默认白。用 --bg-primary 保证与最外层兜底色一致。
          html.style.backgroundColor = 'var(--bg-primary)'
        } else {
          const inverse = 1 / zoom
          body.style.zoom = ''
          body.style.transformOrigin = 'top left'
          body.style.transform = `scale(${zoom})`
          body.style.width = `${inverse * 100}%`
          body.style.minHeight = `${inverse * 100}vh`
        }
      }
    },
  },
})
