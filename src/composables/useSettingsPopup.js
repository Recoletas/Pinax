import { ref } from 'vue'

/**
 * Shared modal state for the mast "设置" popup. Module-scope ref so every
 * caller (AppShell trigger, InputArea hint, WelcomeView onboarding) reads
 * and writes the same value without Pinia ceremony.
 *
 * open(tab?) — open with optional default section: 'appearance' | 'ai' | 'storage'.
 */

const isOpen = ref(false)
const activeSection = ref('appearance')

const VALID_SECTIONS = new Set(['appearance', 'ai', 'storage'])

function open(section = 'appearance') {
  activeSection.value = VALID_SECTIONS.has(section) ? section : 'appearance'
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
