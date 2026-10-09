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
  getDocumentScopeKey = () => '',
  getBookWorldbookStatus,
  readLiveSelection,
  resolveTarget = (target) => target,
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
  let pendingStart = null
  let reviewVersion = 0

  function continueRequest(request) {
    return typeof request?.resume === 'function' ? request.resume() : openSceneLaboratory(request)
  }
  function resumeReview(request) {
    const version = reviewVersion
    const scope = recognitionScope()
    skipNextSceneRecognition = true
    void nextTick(() => {
      if (version !== reviewVersion || scope !== recognitionScope()) return
      if (typeof request?.resume === 'function') void prepareRehearsalSceneReview(request)
      else void startRehearsal(request || {})
    })
  }

  function recognitionScope() {
    return JSON.stringify([selectedBookId.value, selectedChapterId.value, selectedBookWorldbookId.value, getDocumentScopeKey()])
  }

  function captureRecognitionTarget(target = null) {
    const source = target || readLiveSelection() || notebookSelection.value || {}
    return Object.freeze({ ...resolveTarget(source) })
  }
  function sceneRecognitionKey(target) {
    return JSON.stringify([selectedBookId.value, selectedChapterId.value, getDocumentScopeKey(),
      target.documentId || '', target.unitId || activeWritingUnitId.value,
      target.nodeId || '', target.cursorLocalOffset ?? '',
      getDocumentRevision(), selectedBookWorldbookId.value,
      boundWorldbook.value?.updatedAt || boundWorldbook.value?.revision || ''])
  }
  function sceneRecognitionNodeText(node) {
    return String(node?.text || '') + (node?.content || []).map(sceneRecognitionNodeText).join('')
  }
  function scanCurrentSceneMentions() {
    return scanSceneMentionsAtTarget(captureRecognitionTarget())
  }
  function scanSceneMentionsAtTarget(target) {
    if (getBookWorldbookStatus()?.status !== 'bound') {
      sceneRecognitionSuggestions.value = []
      return []
    }
    const unitId = String(target.unitId || activeWritingUnitId.value || '')
    const units = writingDocument.value?.content || []
    const index = units.findIndex(unit => String(unit?.attrs?.unitId || '') === unitId)
    const blocks = []
    if (index >= 0) {
      const nodes = units[index]?.content || []
      const nodeIndex = nodes.findIndex(node => String(node?.attrs?.nodeId || '') === String(target.nodeId || ''))
      const visibleNodes = nodeIndex >= 0 ? nodes.slice(0, nodeIndex + 1) : nodes
      for (let offset = visibleNodes.length - 1; offset >= 0; offset -= 1) {
        const node = visibleNodes[offset]
        const fullText = sceneRecognitionNodeText(node)
        const limitedText = offset === nodeIndex
          ? fullText.slice(0, Math.max(0, Number(target.cursorLocalOffset) || 0))
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
  async function prepareRehearsalSceneReview(options = {}) {
    if (skipNextSceneRecognition) {
      skipNextSceneRecognition = false
      // 确认期间作者可能移动光标。接续使用原请求冻结的起点，不重新解析。
      return continueRequest({ ...options, target: options.target || captureRecognitionTarget(), planDirections: false })
    }
    const request = { ...options, target: captureRecognitionTarget(options.target), planDirections: false }
    if (sceneCurationPreviewOpen.value) return { status: 'needs-review' }
    const key = sceneRecognitionKey(request.target)
    if (key !== sceneRecognitionSeenKey) {
      const suggestions = scanSceneMentionsAtTarget(request.target)
      if (suggestions.length && handleSceneEditRequest({ scan: false })) {
        sceneRecognitionSeenKey = key
        sceneRecognitionPending.value = true
        pendingStart = request
        return { status: 'needs-review' }
      }
      sceneRecognitionSeenKey = key
    }
    return continueRequest(request)
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
    const request = pendingStart
    if (resume && !sceneCurationHasUnsavedChanges.value) {
      skipSceneRecognition()
      return true
    }
    if (!handleCurationSave()) return false
    sceneRecognitionPending.value = false
    pendingStart = null
    sceneRecognitionSuggestions.value = []
    if (resume) {
      resumeReview(request)
    }
    return true
  }
  function cancelSceneRecognitionReview({ rememberReview = false } = {}) {
    reviewVersion += 1
    skipNextSceneRecognition = false
    if (!rememberReview && sceneRecognitionPending.value) sceneRecognitionSeenKey = ''
    sceneRecognitionPending.value = false
    pendingStart = null
    sceneRecognitionSuggestions.value = []
    handleCurationCancel()
  }
  function skipSceneRecognition() {
    if (!sceneRecognitionPending.value) return
    const request = pendingStart
    cancelSceneRecognitionReview({ rememberReview: true })
    resumeReview(request)
  }
  // 书/章节/速记文档/世界书绑定切换时清场；sceneRecognitionSeenKey 不在此复位，
  // 与迁移前逐字一致（换作用域才重新扫描）。
  function resetSceneRecognition() {
    reviewVersion += 1
    sceneRecognitionPending.value = false
    sceneRecognitionSuggestions.value = []
    skipNextSceneRecognition = false
    pendingStart = null
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
