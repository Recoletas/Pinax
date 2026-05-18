import { ref } from 'vue'
import { getTextItem, removeItem, setTextItem, STORAGE_KEYS } from './useStorage'

export function useQuickNotes(storageKey = STORAGE_KEYS.QUICK_NOTE_DRAFT) {
  const draft = ref('')

  function loadDraft() {
    draft.value = getTextItem(storageKey)
    return draft.value
  }

  function saveDraft(content) {
    draft.value = content
    setTextItem(storageKey, content)
  }

  function clearDraft() {
    draft.value = ''
    removeItem(storageKey)
  }

  async function importFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        const current = draft.value
        draft.value = current ? `${current}\n${text}` : text
        saveDraft(draft.value)
        return text
      }
    } catch (e) {
      console.warn('[useQuickNotes] clipboard read failed:', e)
    }
    return null
  }

  function exportToClipboard() {
    if (!draft.value) return null
    navigator.clipboard.writeText(draft.value).catch(e => {
      console.warn('[useQuickNotes] clipboard write failed:', e)
    })
    return draft.value
  }

  return {
    draft,
    loadDraft,
    saveDraft,
    clearDraft,
    importFromClipboard,
    exportToClipboard
  }
}