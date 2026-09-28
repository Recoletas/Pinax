import { nextTick, ref } from 'vue'
import { recognizeAuthoringSceneMentions } from '../services/agents/authoring/authoringSceneRecognition.js'

// 现场识别协调（AT-00）：候选扫描、审阅接续与"跳过本次"标志都在这里，
// 页面只保留状态投影与事件出口。宿主 ref/函数全部按参数注入，
// 本模块不反向依赖 src/pages/**，以免引入 production cycle。
export function useAuthoringSceneRecognition({
  selectedBookId,
  selectedChapterId,
  activeWritingUnitId,
  selectedBookWorldbookId,
  boundWorldbook,
  notebookSelection,
  writingDocument,
  sceneProjection,
  getDocumentRevision,
  getBookWorldbookStatus,
  readLiveSelection,
  sceneCurationPreviewOpen,
  sceneCurationDraft,
  sceneCurationHasUnsavedChanges,
  handleSceneEditRequest,
  handleCurationDraftUpdate,
  handleCurationSave,
  handleCurationCancel,
  openSceneLaboratory,
  startRehearsal
}) {
  const sceneRecognitionSuggestions = ref([])
  const sceneRecognitionPending = ref(false)
  let sceneRecognitionSeenKey = ''
  let skipNextSceneRecognition = false

  function sceneRecognitionKey() {
    return [selectedBookId.value, selectedChapterId.value, activeWritingUnitId.value,
      getDocumentRevision(), selectedBookWorldbookId.value,
      boundWorldbook.value?.updatedAt || boundWorldbook.value?.revision || '']
      .map(String).join('|')
  }
  function sceneRecognitionNodeText(node) {
    return String(node?.text || '') + (node?.content || []).map(sceneRecognitionNodeText).join('')
  }
  function scanCurrentSceneMentions() {
    if (getBookWorldbookStatus()?.status !== 'bound') {
      sceneRecognitionSuggestions.value = []
      return []
    }
    const selection = readLiveSelection() || notebookSelection.value || {}
    const unitId = String(selection.unitId || activeWritingUnitId.value || '')
    const units = writingDocument.value?.content || []
    const index = units.findIndex(unit => String(unit?.attrs?.unitId || '') === unitId)
    const blocks = []
    if (index >= 0) {
      const nodes = units[index]?.content || []
      const nodeIndex = nodes.findIndex(node => String(node?.attrs?.nodeId || '') === String(selection.nodeId || ''))
      const visibleNodes = nodeIndex >= 0 ? nodes.slice(0, nodeIndex + 1) : nodes
      for (let offset = visibleNodes.length - 1; offset >= 0; offset -= 1) {
        const node = visibleNodes[offset]
        const fullText = sceneRecognitionNodeText(node)
        const limitedText = offset === nodeIndex
          ? fullText.slice(0, Math.max(0, Number(selection.cursorLocalOffset) || 0))
          : fullText
        if (limitedText) blocks.push({ text: limitedText.slice(-4000) })
      }
      for (let previous = index - 1; previous >= Math.max(0, index - 2); previous -= 1) {
        blocks.push({ text: (units[previous]?.content || []).map(sceneRecognitionNodeText).join(' ').slice(-2000) })
      }
    }
    sceneRecognitionSuggestions.value = recognizeAuthoringSceneMentions({
      blocks, worldbook: boundWorldbook.value, projection: sceneProjection.value
    })
    return sceneRecognitionSuggestions.value
  }
  async function prepareRehearsalSceneReview() {
    if (skipNextSceneRecognition) {
      skipNextSceneRecognition = false
      return openSceneLaboratory()
    }
    if (sceneCurationPreviewOpen.value) return false
    const key = sceneRecognitionKey()
    if (key !== sceneRecognitionSeenKey) {
      const suggestions = scanCurrentSceneMentions()
      if (suggestions.length && handleSceneEditRequest({ scan: false })) {
        sceneRecognitionSeenKey = key
        sceneRecognitionPending.value = true
        return false
      }
      sceneRecognitionSeenKey = key
    }
    return openSceneLaboratory()
  }
  function acceptSceneRecognitionSuggestion(candidate) {
    const draft = sceneCurationDraft.value
    if (!draft || !sceneRecognitionSuggestions.value.some(item => item.id === candidate?.id && item.kind === candidate?.kind)) return
    if (candidate.kind === 'character') {
      const ids = [...new Set([...(draft.presentCharacterIds || []), candidate.id])]
      if (ids.length > 8) return
      handleCurationDraftUpdate({ ...draft, presentCharacterIds: ids })
    } else if (candidate.kind === 'location') {
      handleCurationDraftUpdate({ ...draft, locationId: candidate.id })
    }
    sceneRecognitionSuggestions.value = sceneRecognitionSuggestions.value.filter(item => item !== candidate)
  }
  function saveSceneRecognitionReview() {
    const resume = sceneRecognitionPending.value
    if (resume && !sceneCurationHasUnsavedChanges.value) {
      skipSceneRecognition()
      return true
    }
    if (!handleCurationSave()) return false
    sceneRecognitionPending.value = false
    sceneRecognitionSuggestions.value = []
    if (resume) {
      skipNextSceneRecognition = true
      void nextTick(() => startRehearsal())
    }
    return true
  }
  function cancelSceneRecognitionReview() {
    sceneRecognitionPending.value = false
    sceneRecognitionSuggestions.value = []
    handleCurationCancel()
  }
  function skipSceneRecognition() {
    if (!sceneRecognitionPending.value) return
    cancelSceneRecognitionReview()
    skipNextSceneRecognition = true
    void nextTick(() => startRehearsal())
  }
  // 书/章节/速记文档/世界书绑定切换时清场；sceneRecognitionSeenKey 不在此复位，
  // 与迁移前逐字一致（换作用域才重新扫描）。
  function resetSceneRecognition() {
    sceneRecognitionPending.value = false
    sceneRecognitionSuggestions.value = []
    skipNextSceneRecognition = false
  }

  return Object.freeze({
    sceneRecognitionSuggestions,
    sceneRecognitionPending,
    scanCurrentSceneMentions,
    prepareRehearsalSceneReview,
    acceptSceneRecognitionSuggestion,
    saveSceneRecognitionReview,
    cancelSceneRecognitionReview,
    skipSceneRecognition,
    resetSceneRecognition
  })
}
