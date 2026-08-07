import { ref } from 'vue'

/**
 * Shared modal state for the mast "文档" viewer. Module-scope ref so every
 * caller (AppShell trigger, WelcomeView onboarding, future help buttons)
 * reads and writes the same value without Pinia ceremony.
 *
 * open(chapter?) — open with optional chapter id (default 'README').
 * The DocsViewer fetches /docs/user-manual/manifest.json for the chapter
 * list and /docs/user-manual/<file>.md for the current chapter body.
 *
 * Mutual exclusion with SettingsPopup is wired via useTransientLayer
 * inside DocsViewer.vue (the OPEN_EVENT constant is shared).
 */

const isOpen = ref(false)
const chapter = ref('README')

function open(chapterId = 'README') {
  chapter.value = chapterId || 'README'
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

function toggle(chapterId) {
  if (isOpen.value) {
    close()
  } else {
    open(chapterId)
  }
}

export function useDocsViewer() {
  return { isOpen, chapter, open, close, toggle }
}