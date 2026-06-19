import { computed } from 'vue'
import { useThemeStore } from '../stores/themeStore.js'

export function useTheme() {
  const store = useThemeStore()
  return {
    isDark: computed(() => store.colorScheme === 'dark'),
    toggleTheme() {
      store.setColorScheme(store.colorScheme === 'dark' ? 'light' : 'dark')
    },
    initTheme() {
      store.initTheme()
    },
    isKao: computed(() => store.variant === 'kao'),
    setVariant(v) {
      store.setVariant(v)
    },
  }
}
