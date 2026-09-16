// Experience 速记与对话导入（R-X1）：速记草稿、对话片段选择、素材保存、
// 清空与写盘失败反馈的唯一 owner。依赖由页面注入；不 import 页面，
// 不与其他 Experience composable 互相 import。
import { computed, ref, watch } from 'vue'
import { getTextItem, setTextItem, removeItem, STORAGE_KEYS } from './useStorage'
import { ASSET_KINDS, addNarrativeAssetDurable, getAssetKindLabel } from '../services/narrativeAssets'
import { loadWritingBooks, saveWritingBooksDurable } from '../services/writing/writingBooksRepository'
import { appendExperienceTurnToChapter } from '../services/writing/writingExperienceImport.js'
import { trapFocusWithin, useTransientLayer } from './useTransientLayer'

const QUICK_NOTE_DRAFT_KEY = STORAGE_KEYS.QUICK_NOTE_DRAFT

export function useExperienceQuickCapture({ gameStore, advisorOpen, closeAdvisor, selectedWorldbookId }) {
  const quickNoteOpen = ref(false)
  const quickNoteDraft = ref(getTextItem(QUICK_NOTE_DRAFT_KEY))
  const quickNoteStatus = ref('')
  const quickNoteImportOpen = ref(false)
  const narrativeAssetKind = ref('draft-prose')
  const narrativeAssetKinds = ASSET_KINDS

  function quickNoteWordCount(text) {
    const normalized = String(text || '').trim()
    if (!normalized) return 0
    const chineseChars = (normalized.match(/[一-龥]/g) || []).length
    const englishWords = (normalized.match(/[a-zA-Z]+/g) || []).length
    return chineseChars + englishWords
  }

  const dialogueImportStats = computed(() => {
    const list = (gameStore.messages || []).filter((message) => {
      const role = message.role || message.type || 'assistant'
      return role !== 'system' && String(message.content || '').trim()
    })
    const selected = gameStore.selectedQuickNoteMessages()
    const totalCount = list.length
    const selectedCount = selected.length
    const totalWords = list.reduce((sum, item) => sum + quickNoteWordCount(item.content), 0)
    const selectedWords = selected.reduce((sum, item) => sum + quickNoteWordCount(item), 0)
    return { totalCount, selectedCount, totalWords, selectedWords }
  })

  function persistQuickNoteDraft() {
    setTextItem(QUICK_NOTE_DRAFT_KEY, quickNoteDraft.value)
  }

  function handleQuickNoteInput() {
    persistQuickNoteDraft()
  }

  function toggleQuickNoteImport() {
    if (!dialogueImportStats.value.totalCount) {
      quickNoteStatus.value = '当前没有可导入的对话段'
      return
    }
    quickNoteImportOpen.value = !quickNoteImportOpen.value
    gameStore.setQuickNoteImportMode(quickNoteImportOpen.value)
  }

  function toggleQuickNoteWorkspace() {
    const nextOpen = !quickNoteOpen.value
    if (nextOpen && advisorOpen.value) {
      closeAdvisor()
    }
    quickNoteOpen.value = nextOpen
  }

  function importSelectedDialogueSegments() {
    const picked = gameStore.selectedQuickNoteMessages()
    if (!picked.length) {
      quickNoteStatus.value = '先选对话段再导入'
      return
    }
    const text = picked.join('\n\n')
    quickNoteDraft.value = quickNoteDraft.value ? `${quickNoteDraft.value}\n\n${text}` : text
    persistQuickNoteDraft()
    quickNoteImportOpen.value = false
    gameStore.setQuickNoteImportMode(false)
    quickNoteStatus.value = `已导入 ${picked.length} 段对话`
  }

  function getSelectedDialogueMessageRefs() {
    const pickedIndexes = new Set(gameStore.quickNoteSelectedMessageIndexes || [])
    return (gameStore.messages || [])
      .map((message, index) => ({ message, index }))
      .filter(({ message, index }) => {
        const role = message.role || message.type || 'assistant'
        return pickedIndexes.has(index) && role !== 'system' && String(message.content || '').trim()
      })
  }

  function saveQuickNoteAsAsset() {
    const content = quickNoteDraft.value.trim()
    if (!content) {
      quickNoteStatus.value = '先写点内容再存素材'
      return false
    }

    const persisted = addNarrativeAssetDurable({
      content,
      kind: narrativeAssetKind.value,
      projectId: gameStore.worldId || null,
      source: {
        type: 'experience-session',
        id: gameStore.currentSessionId || '',
        messageIds: []
      },
      sourceRefs: gameStore.getCurrentCreativeSourceRefs([])
    })

    if (!persisted.ok) {
      quickNoteStatus.value = '素材保存失败，草稿已保留'
      return false
    }
    const asset = persisted.asset
    clearQuickNoteDraft()
    quickNoteStatus.value = `已存入素材：${getAssetKindLabel(asset.kind)}`
    return true
  }

  function saveSelectedDialogueSegmentsAsAsset() {
    const refs = getSelectedDialogueMessageRefs()
    if (!refs.length) {
      quickNoteStatus.value = '先选对话段再存素材'
      return false
    }

    const content = refs.map(({ message }) => String(message.content || '').trim()).join('\n\n')
    const persisted = addNarrativeAssetDurable({
      content,
      kind: narrativeAssetKind.value,
      projectId: gameStore.worldId || null,
      source: {
        type: 'experience-session',
        id: gameStore.currentSessionId || '',
        messageIds: refs.map(({ message, index }) => message.id || `message_${index}`)
      },
      sourceRefs: gameStore.getCurrentCreativeSourceRefs(
        refs.map(({ message, index }) => message.id || `message_${index}`)
      )
    })

    if (!persisted.ok) {
      quickNoteStatus.value = '素材保存失败，已选对话保持不变'
      return false
    }
    const asset = persisted.asset
    quickNoteImportOpen.value = false
    gameStore.setQuickNoteImportMode(false)
    quickNoteStatus.value = `已存入素材：${getAssetKindLabel(asset.kind)}`
    return true
  }

  function clearQuickNoteDraft() {
    quickNoteDraft.value = ''
    removeItem(QUICK_NOTE_DRAFT_KEY)
  }

  function closeQuickNote() {
    quickNoteOpen.value = false
  }

  function closeQuickNoteImport() {
    quickNoteImportOpen.value = false
  }

  watch(quickNoteOpen, (open) => {
    if (!open) {
      quickNoteImportOpen.value = false
      gameStore.setQuickNoteImportMode(false)
    }
  })

  watch(advisorOpen, (open) => {
    if (!open) return
    quickNoteOpen.value = false
    quickNoteImportOpen.value = false
    gameStore.setQuickNoteImportMode(false)
  })

  // ── 收进写作书对话框（R-X1：与速记同属素材收集域）──
  const writingCollectOpen = ref(false)
  const writingCollectDialogRef = ref(null)
  const writingCollectCloseRef = ref(null)
  const writingCollectMessage = ref(null)
  const writingCollectTurn = ref(null)
  const writingCollectBooks = ref([])
  const writingCollectBookId = ref('')
  const writingCollectChapterId = ref('')
  const writingCollectStatus = ref('')
  const writingCollectSucceeded = ref(false)
  const writingCollectChapters = computed(() => (
    writingCollectBooks.value.find((book) => String(book.id) === String(writingCollectBookId.value))?.chapters || []
  ))

  function selectFirstWritingChapter() {
    writingCollectChapterId.value = writingCollectChapters.value[0]?.id || ''
  }

  function openWritingCollectDialog({ message, turn }) {
    writingCollectMessage.value = message
    writingCollectTurn.value = turn
    writingCollectBooks.value = loadWritingBooks()
    writingCollectBookId.value = writingCollectBooks.value[0]?.id || ''
    selectFirstWritingChapter()
    writingCollectStatus.value = ''
    writingCollectSucceeded.value = false
    writingCollectOpen.value = true
  }

  function closeWritingCollectDialog() {
    writingCollectOpen.value = false
    writingCollectMessage.value = null
    writingCollectTurn.value = null
    writingCollectBooks.value = []
    writingCollectBookId.value = ''
    writingCollectChapterId.value = ''
    writingCollectStatus.value = ''
    writingCollectSucceeded.value = false
  }

  function trapWritingCollectFocus(event) {
    trapFocusWithin(event, writingCollectDialogRef.value)
  }

  useTransientLayer({
    id: 'experience-writing-collect',
    isOpen: writingCollectOpen,
    onClose: closeWritingCollectDialog,
    initialFocus: () => writingCollectCloseRef.value
  })

  function confirmWritingCollect() {
    const books = loadWritingBooks()
    const result = appendExperienceTurnToChapter({
      books,
      bookId: writingCollectBookId.value,
      chapterId: writingCollectChapterId.value,
      sessionId: gameStore.currentSessionId,
      branchId: writingCollectMessage.value?.branchId || writingCollectTurn.value?.branchId || gameStore.activeBranchId || 'main',
      worldbookId: selectedWorldbookId.value || gameStore.worldId || '',
      activeTurnIds: gameStore.currentBranchTurnIds(),
      turn: writingCollectTurn.value,
      message: writingCollectMessage.value
    })
    if (!result.ok) {
      writingCollectStatus.value = result.reason === 'already-imported' ? '这段体验已经收进稿件。' : '写入失败，原稿件未改变'
      return
    }
    if (!saveWritingBooksDurable(result.books).ok) {
      writingCollectStatus.value = '写入失败，原稿件未改变'
      return
    }
    writingCollectBooks.value = result.books
    const book = result.books.find((item) => String(item.id) === String(writingCollectBookId.value))
    const chapter = book?.chapters?.find((item) => String(item.id) === String(writingCollectChapterId.value))
    writingCollectStatus.value = `已收进「${book?.title || book?.name || '未命名作品'} / ${chapter?.title || chapter?.name || '未命名章节'}」`
    writingCollectSucceeded.value = true
  }

  return {
    quickNoteOpen,
    quickNoteDraft,
    quickNoteStatus,
    quickNoteImportOpen,
    narrativeAssetKind,
    narrativeAssetKinds,
    dialogueImportStats,
    handleQuickNoteInput,
    toggleQuickNoteImport,
    toggleQuickNoteWorkspace,
    importSelectedDialogueSegments,
    saveQuickNoteAsAsset,
    saveSelectedDialogueSegmentsAsAsset,
    clearQuickNoteDraft,
    writingCollectOpen, writingCollectDialogRef, writingCollectCloseRef,
    writingCollectMessage, writingCollectTurn, writingCollectBooks,
    writingCollectBookId, writingCollectChapterId, writingCollectStatus,
    writingCollectSucceeded, writingCollectChapters,
    openWritingCollectDialog, closeWritingCollectDialog,
    trapWritingCollectFocus, confirmWritingCollect,
    closeQuickNote,
    closeQuickNoteImport,
    isQuickNoteOpen: () => quickNoteOpen.value
  }
}
