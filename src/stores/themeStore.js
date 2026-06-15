import { defineStore } from 'pinia'

export const DEFAULT_VARIANT = 'kao'
export const DEFAULT_COLOR_SCHEME = 'light'
export const VALID_VARIANTS = ['kao', 'legacy']
export const VALID_COLOR_SCHEMES = ['light', 'dark']
export const LS_VARIANT = 'app_theme_variant'
export const LS_COLOR = 'app_theme'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    variant: DEFAULT_VARIANT,
    colorScheme: DEFAULT_COLOR_SCHEME,
    initialized: false,
  }),
  actions: {
    initTheme() {
      // localStorage can throw SecurityError in Safari private mode or with
      // storage disabled. Treat any read failure as "no stored value" so the
      // store falls through to defaults and still applies the theme to <html>.
      let v = null
      let c = null
      try {
        v = localStorage.getItem(LS_VARIANT)
        c = localStorage.getItem(LS_COLOR)
      } catch (_) {
        v = null
        c = null
      }
      this.variant = VALID_VARIANTS.includes(v) ? v : DEFAULT_VARIANT
      this.colorScheme = VALID_COLOR_SCHEMES.includes(c) ? c : DEFAULT_COLOR_SCHEME
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
    applyToHtml() {
      const html = document.documentElement
      html.classList.remove('theme-kao', 'theme-legacy')
      html.classList.add(`theme-${this.variant}`)
      html.classList.remove('theme-dark', 'theme-light')
      html.classList.add(`theme-${this.colorScheme}`)
    },
  },
})
