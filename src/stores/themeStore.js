import { defineStore } from 'pinia'

// 临时改：默认改为 legacy（用户要求首页只显示经典）— 还原方法：把 'legacy' 改回 'kao'
export const DEFAULT_VARIANT = 'legacy'
export const DEFAULT_COLOR_SCHEME = 'light'
export const VALID_VARIANTS = ['kao', 'legacy']
export const VALID_COLOR_SCHEMES = ['light', 'dark']
export const LS_VARIANT = 'app_theme_variant'
export const LS_COLOR = 'app_theme'

// Phase F: 全局 UI 缩放档位 (用户反馈默认 100% 偏大, 浏览器 75% 才合适)
// CSS `zoom` 是最干净的方案, Chrome/Safari/Edge 都支持; Firefox 不支持 zoom,
// 通过额外应用 transform: scale() 兜底。
export const DEFAULT_UI_ZOOM = 0.75
export const VALID_UI_ZOOMS = [1, 0.85, 0.75, 0.65]
export const LS_UI_ZOOM = 'app_ui_zoom'

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

      // 全局缩放: Chrome/Safari/Edge 用 zoom (一行解决),
      // Firefox 走 transform: scale() 兜底。
      const body = document.body
      if (body) {
        body.style.zoom = String(this.uiZoom)
        // Firefox 不支持 zoom, 用 transform 兜底。
        // 注: 这里不补偿 width/height, 因为整体 viewport 不会因此滚出;
        // 用户视觉上是 UI 缩小了, 这是我们想要的; 多余空间用背景填充或留空。
        const inverse = 1 / this.uiZoom
        body.style.transformOrigin = 'top left'
        body.style.transform = `scale(${this.uiZoom})`
        body.style.width = `${inverse * 100}%`
        body.style.minHeight = `${inverse * 100}vh`
      }
    },
  },
})