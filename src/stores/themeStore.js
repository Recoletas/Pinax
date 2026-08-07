import { defineStore } from 'pinia'

// 临时改：默认改为 legacy（用户要求首页只显示经典）— 还原方法：把 'legacy' 改回 'kao'
export const DEFAULT_VARIANT = 'legacy'
export const DEFAULT_COLOR_SCHEME = 'light'
export const VALID_VARIANTS = ['kao', 'legacy']
export const VALID_COLOR_SCHEMES = ['light', 'dark']
export const LS_VARIANT = 'app_theme_variant'
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
  } catch (_) {
    return false
  }
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    variant: DEFAULT_VARIANT,
    colorScheme: DEFAULT_COLOR_SCHEME,
    uiZoom: DEFAULT_UI_ZOOM,
    initialized: false,
  }),
  actions: {
    initTheme() {
      // localStorage can throw SecurityError in Safari private mode or with
      // storage disabled. Treat any read failure as "no stored value" so the
      // store falls through to defaults and still applies the theme to <html>.
      let v = null
      let c = null
      let z = null
      try {
        v = localStorage.getItem(LS_VARIANT)
        c = localStorage.getItem(LS_COLOR)
        z = localStorage.getItem(LS_UI_ZOOM)
      } catch (_) {
        v = null
        c = null
        z = null
      }
      this.variant = VALID_VARIANTS.includes(v) ? v : DEFAULT_VARIANT
      this.colorScheme = VALID_COLOR_SCHEMES.includes(c) ? c : DEFAULT_COLOR_SCHEME
      const parsedZoom = Number(z)
      this.uiZoom = VALID_UI_ZOOMS.includes(parsedZoom) ? parsedZoom : DEFAULT_UI_ZOOM
      this.applyToHtml()
      this.initialized = true
    },
    setVariant(v) {
      if (!VALID_VARIANTS.includes(v)) return
      this.variant = v
      try { localStorage.setItem(LS_VARIANT, v) } catch (_) { /* storage disabled — in-memory state still applies */ }
      this.applyToHtml()
    },
    setColorScheme(s) {
      if (!VALID_COLOR_SCHEMES.includes(s)) return
      this.colorScheme = s
      try { localStorage.setItem(LS_COLOR, s) } catch (_) { /* storage disabled — in-memory state still applies */ }
      this.applyToHtml()
    },
    // Atomic variant + colorScheme update for the 4-radio appearance
    // switcher. A single click should fire exactly one applyToHtml(),
    // one setItem pair, and one Vue reactivity flush — not two of each.
    setAppearance(variant, colorScheme) {
      if (!VALID_VARIANTS.includes(variant)) return
      if (!VALID_COLOR_SCHEMES.includes(colorScheme)) return
      this.variant = variant
      this.colorScheme = colorScheme
      try { localStorage.setItem(LS_VARIANT, variant) } catch (_) { /* storage disabled — in-memory state still applies */ }
      try { localStorage.setItem(LS_COLOR, colorScheme) } catch (_) { /* storage disabled — in-memory state still applies */ }
      this.applyToHtml()
    },
    setUiZoom(z) {
      const parsed = Number(z)
      if (!VALID_UI_ZOOMS.includes(parsed)) return
      this.uiZoom = parsed
      try { localStorage.setItem(LS_UI_ZOOM, String(parsed)) } catch (_) { /* storage disabled — in-memory state still applies */ }
      this.applyToHtml()
    },
    applyToHtml() {
      const html = document.documentElement
      html.classList.remove('theme-kao', 'theme-legacy')
      html.classList.add(`theme-${this.variant}`)
      html.classList.remove('theme-dark', 'theme-light')
      html.classList.add(`theme-${this.colorScheme}`)

      // 全局缩放: 二选一, 不能叠加 (zoom + transform 会缩成 0.56 而非 0.85)。
      // - Chrome/Safari/Edge: CSS zoom 自动调整布局盒, 不需要 width/height 补偿
      //   但 zoom 把 body 缩到 85vh, 下面 15vh 露出 html 背景 → 必须给 html 上背景
      // - Firefox: 走 transform: scale() + width/height 补偿, 避免底部空白
      const body = document.body
      if (body) {
        const zoom = this.uiZoom
        if (detectCssZoomSupport()) {
          body.style.zoom = String(zoom)
          body.style.transform = ''
          body.style.transformOrigin = ''
          body.style.width = ''
          body.style.minHeight = ''
          // 关键: html 默认背景是白色 (浏览器默认), zoom 后 body 缩到 85vh,
          // 下面 15vh 会露出白条。把 html 背景设为主题色解决。
          // 用 --bg-primary 而不是 --bg-secondary, 保证与最外层兜底色一致。
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