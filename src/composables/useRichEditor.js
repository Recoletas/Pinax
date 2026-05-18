import { ref, computed } from 'vue'

/**
 * 富文本编辑器工具条操作 composable
 * 封装 execCommand 逻辑，提供查找替换功能
 */
export function useRichEditor(editorRef) {
  const findText = ref('')
  const replaceText = ref('')
  const findResults = ref([])
  const findCurrent = ref(0)
  const hasSelection = ref(false)

  const isSearching = computed(() => findResults.value.length > 0)

  function execCmd(cmd, value = null) {
    if (!editorRef?.value) return
    editorRef.value.focus()
    document.execCommand(cmd, false, value)
  }

  function bold() { execCmd('bold') }
  function italic() { execCmd('italic') }
  function underline() { execCmd('underline') }
  function undo() { execCmd('undo') }
  function redo() { execCmd('redo') }
  function cut() { execCmd('cut') }
  function copy() { execCmd('copy') }
  function paste() { execCmd('paste') }
  function deleteChar() { execCmd('delete') }
  function selectAll() { execCmd('selectAll') }
  function removeFormat() { execCmd('removeFormat') }

  function insertHorizontalRule() {
    execCmd('insertHTML', '<hr>')
  }

  function insertParagraph() {
    execCmd('formatBlock', '<p>')
  }

  function toggleHeading(level) {
    execCmd('formatBlock', `h${level}`)
  }

  function searchFind(text) {
    if (!editorRef?.value) return
    const editor = editorRef.value
    const content = editor.value
    const query = text || findText.value
    if (!query) {
      findResults.value = []
      return
    }
    const results = []
    let idx = 0
    const lower = content.toLowerCase()
    const searchLower = query.toLowerCase()
    let pos = 0
    while ((pos = lower.indexOf(searchLower, pos)) !== -1) {
      results.push({ start: pos, end: pos + query.length, text: content.slice(pos, pos + query.length) })
      pos += 1
      idx++
    }
    findResults.value = results
    findCurrent.value = 0
  }

  function findNext() {
    if (findResults.value.length === 0) {
      searchFind()
    }
    if (findResults.value.length > 0) {
      findCurrent.value = (findCurrent.value + 1) % findResults.value.length
    }
  }

  function replaceOne() {
    if (!editorRef?.value || findResults.value.length === 0) return
    const editor = editorRef.value
    const result = findResults.value[findCurrent.value]
    if (result == null) return
    const content = editor.value
    editor.value = content.slice(0, result.start) + replaceText.value + content.slice(result.end)
    searchFind()
  }

  function replaceAll() {
    if (!editorRef?.value || !findText.value) return
    const editor = editorRef.value
    editor.value = editor.value.split(findText.value).join(replaceText.value)
    findResults.value = []
  }

  function clearSearch() {
    findText.value = ''
    replaceText.value = ''
    findResults.value = []
    findCurrent.value = 0
  }

  function applyFontSize(size) {
    execCmd('fontSize', size)
  }

  function applyFontFamily(font) {
    execCmd('fontName', font)
  }

  function applyHeading(level) {
    execCmd('formatBlock', `h${level}`)
  }

  return {
    findText,
    replaceText,
    findResults,
    findCurrent,
    hasSelection,
    isSearching,
    bold,
    italic,
    underline,
    undo,
    redo,
    cut,
    copy,
    paste,
    deleteChar,
    selectAll,
    removeFormat,
    insertHorizontalRule,
    insertParagraph,
    toggleHeading,
    searchFind,
    findNext,
    replaceOne,
    replaceAll,
    clearSearch,
    applyFontSize,
    applyFontFamily,
    applyHeading
  }
}