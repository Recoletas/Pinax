import { ref, watch } from 'vue'

const isDark = ref(false)

export function useTheme() {
  const initTheme = () => {
    const saved = localStorage.getItem('app_theme')
    isDark.value = saved === 'dark'
    applyTheme()
  }

  const toggleTheme = () => {
    isDark.value = !isDark.value
    localStorage.setItem('app_theme', isDark.value ? 'dark' : 'light')
    applyTheme()
  }

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add('theme-dark')
    } else {
      document.documentElement.classList.remove('theme-dark')
    }
  }

  watch(isDark, applyTheme)

  return {
    isDark,
    initTheme,
    toggleTheme
  }
}
