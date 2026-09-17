import { ref } from 'vue'

/**
 * Shared modal state for the mast "设置" popup. Module-scope ref so every
 * caller (AppShell trigger, InputArea hint, WelcomeView onboarding) reads
 * and writes the same value without Pinia ceremony.
 *
 * open(section?) — opens writing, appearance, AI, storage, experience or memory.
 */

const isOpen = ref(false)
const activeSection = ref('ai')

const VALID_SECTIONS = new Set(['writing', 'appearance', 'ai', 'storage', 'experience', 'memory'])

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
