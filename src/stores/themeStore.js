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
      html.classList.remove('theme-kao', 'theme-legacy')
      html.classList.add(`theme-${this.variant}`)
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