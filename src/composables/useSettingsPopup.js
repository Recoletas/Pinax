import { ref } from 'vue'

/**
 * Shared modal state for the mast "设置" popup. Module-scope ref so every
 * caller (AppShell trigger, InputArea hint, WelcomeView onboarding) reads
 * and writes the same value without Pinia ceremony.
 *
 * open(tab?) — open with optional default section: 'ai' | 'storage'.
 * (外观/主题区已按用户要求移除，只有 AI 配置 与 存储。)
 */

const isOpen = ref(false)
const activeSection = ref('ai')

const VALID_SECTIONS = new Set(['ai', 'storage'])

function open(section = 'ai') {
  activeSection.value = VALID_SECTIONS.has(section) ? section : 'ai'
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

function toggle(section) {
  if (isOpen.value) {
    close()
  } else {
    open(section)
  }
}

export function useSettingsPopup() {
  return { isOpen, activeSection, open, close, toggle }
}
