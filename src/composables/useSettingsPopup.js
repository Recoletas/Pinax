import { ref } from 'vue'

/**
 * Shared modal state for the mast "设置" popup. Module-scope ref so every
 * caller (AppShell trigger, InputArea hint, WelcomeView onboarding) reads
 * and writes the same value without Pinia ceremony.
 *
 * open(section?) — opens writing, appearance, AI, storage, experience or memory.
 */

const isOpen = ref(false)
const activeSection = ref('models')
const modelKind = ref('text')
const worldModelBookId = ref('')

const VALID_SECTIONS = new Set(['writing', 'appearance', 'models', 'ai', 'media', 'storage', 'experience', 'memory', 'localproject'])

function open(section = 'models', kind = null) {
  worldModelBookId.value = ''
  if (['text', 'image', 'video'].includes(kind)) modelKind.value = kind
  else if (section === 'ai') modelKind.value = 'text'
  else if (section === 'media') modelKind.value = 'image'
  activeSection.value = ['ai', 'media'].includes(section) ? 'models' : VALID_SECTIONS.has(section) ? section : 'models'
  isOpen.value = true
}

function openWorldModel(bookId) {
  if (!bookId) return
  open('memory')
  worldModelBookId.value = String(bookId)
}

function close() {
  isOpen.value = false
  worldModelBookId.value = ''
}

function toggle(section) {
  if (isOpen.value) {
    close()
  } else {
    open(section)
  }
}

export function useSettingsPopup() {
  return { isOpen, activeSection, modelKind, worldModelBookId, open, openWorldModel, close, toggle }
}
