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
      const v = localStorage.getItem(LS_VARIANT)
      const c = localStorage.getItem(LS_COLOR)
      this.variant = VALID_VARIANTS.includes(v) ? v : DEFAULT_VARIANT
      this.colorScheme = VALID_COLOR_SCHEMES.includes(c) ? c : DEFAULT_COLOR_SCHEME
      this.applyToHtml()
      this.initialized = true
    },
    setVariant(v) {
      if (!VALID_VARIANTS.includes(v)) return
      this.variant = v
      localStorage.setItem(LS_VARIANT, v)
      this.applyToHtml()
    },
    setColorScheme(s) {
      if (!VALID_COLOR_SCHEMES.includes(s)) return
      this.colorScheme = s
      localStorage.setItem(LS_COLOR, s)
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
