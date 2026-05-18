import { ref } from 'vue'

const QUICK_NOTE_KEY = 'prose_quick_note_draft'

export function useQuickNotes() {
  const draft = ref('')

  function loadDraft() {
    draft.value = localStorage.getItem(QUICK_NOTE_KEY) || ''
    return draft.value
  }

  function saveDraft(content) {
    draft.value = content
    localStorage.setItem(QUICK_NOTE_KEY, content)
  }

  function clearDraft() {
    draft.value = ''
    localStorage.removeItem(QUICK_NOTE_KEY)
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