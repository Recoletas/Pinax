import { computed, ref, shallowRef } from 'vue'

const INSPECTOR_LABELS = Object.freeze({
  annotations: '批注',
  outline: '大纲',
  characters: '角色',
  worldbook: '设定',
  scene: '现场',
  rehearsal: '推演',
  collaboration: '共同排演',
  ai: '助手',
  history: '历史'
})

// W-B 外壳重构：双栏（dual）整体退役，状态机不再持有 dual 分支；其余
// open/pinned/tab/tool 与 freeze/restore 语义保持不变，驱动源从右轨换成顶栏。
export function useAuthoringInspectorState({
  sceneDetailNotice,
  captureWritingSurface,
  captureAssistantInvocation,
  setAssistantInvocation,
  discardSceneDraft,
  restoreWritingSurface
}) {
  const inspectorBaseView = ref('comments')
  const inspectorDetailState = ref(null)
  const inspectorReturnFocusRef = ref('')
  const inspectorOpen = ref(false)
  const inspectorPinned = ref(false)
  const activeWritingPane = ref('main')
  const activeInspectorTool = ref('annotations')
  const inspectorReturnSurface = shallowRef(null)
  let preparedToolSelection = null

  const inspectorTab = computed({
    get: () => (inspectorDetailState.value ? 'detail' : inspectorBaseView.value),
    set: (value) => {
      if (value !== 'comments' && value !== 'version') return
      if (inspectorDetailState.value?.kind === 'scene-edit') discardSceneDraft?.()
      inspectorDetailState.value = null
      inspectorBaseView.value = value
    }
  })
  const activeInspectorLabel = computed(() => INSPECTOR_LABELS[activeInspectorTool.value] || '批注')

  function freezeWritingSurfaceBeforeToolSelect(tool) {
    const normalizedTool = String(tool || '')
    const previous = inspectorReturnSurface.value
    let next = previous
    const togglingCurrentTool = inspectorOpen.value && normalizedTool === activeInspectorTool.value
    if (normalizedTool === 'ai' && !togglingCurrentTool) {
      setAssistantInvocation?.(captureAssistantInvocation?.() || null)
    }
    if (!normalizedTool || togglingCurrentTool) {
      preparedToolSelection = { tool: normalizedTool, previous, next, createdAt: Date.now() }
      return
    }

    const snapshot = captureWritingSurface?.()
    if (snapshot) {
      if (!inspectorOpen.value) {
        next = Object.freeze({ ...snapshot, previous: null })
      } else if (snapshot.editorFocused) {
        next = Object.freeze({ ...snapshot, previous: previous?.previous || null })
      }
    }
    preparedToolSelection = { tool: normalizedTool, previous, next, createdAt: Date.now() }
  }

  function prepareToolSelection(tool) {
    const normalizedTool = String(tool || '')
    const preparedIsCurrent = preparedToolSelection?.tool === normalizedTool
      && Date.now() - Number(preparedToolSelection?.createdAt || 0) < 1000
    if (!preparedIsCurrent) freezeWritingSurfaceBeforeToolSelect(normalizedTool)
    const prepared = preparedToolSelection
    preparedToolSelection = null
    if (prepared) inspectorReturnSurface.value = prepared.next || null
    return prepared
  }

  function clearInspectorReturnSurface() {
    inspectorReturnSurface.value = null
    preparedToolSelection = null
  }

  function closeWritingInspector(options = {}) {
    const shouldRestoreSurface = options?.restoreSurface !== false
    if (inspectorDetailState.value?.kind === 'scene-edit' && options.preserveSceneDraft !== true) {
      discardSceneDraft?.()
      inspectorDetailState.value = null
    }
    inspectorOpen.value = false
    activeWritingPane.value = 'main'
    const snapshot = inspectorReturnSurface.value
    if (!shouldRestoreSurface) {
      clearInspectorReturnSurface()
      return
    }
    restoreWritingSurface?.(snapshot)
  }

  // Non-toggle entry used by deep links and tool-owned open actions. It keeps
  // close ordering in the inspector owner instead of letting every page helper
  // directly mutate active tool/open/detail refs in a different order.
  function openInspectorTool(tool, options = {}) {
    const normalizedTool = String(tool || '')
    if (!INSPECTOR_LABELS[normalizedTool]) return false
    const previousTool = activeInspectorTool.value
    prepareToolSelection(normalizedTool)
    if (inspectorDetailState.value?.kind === 'scene-edit' && normalizedTool !== 'scene') {
      discardSceneDraft?.()
      inspectorDetailState.value = null
    }
    activeInspectorTool.value = normalizedTool
    inspectorOpen.value = true
    if (options.pinned != null) inspectorPinned.value = Boolean(options.pinned)
    if (options.baseView === 'comments' || options.baseView === 'version') {
      inspectorBaseView.value = options.baseView
    }
    const ownsDetailState = Object.prototype.hasOwnProperty.call(options, 'detailState')
    if (ownsDetailState) {
      inspectorDetailState.value = options.detailState || null
    } else if (normalizedTool !== previousTool || options.baseView) {
      inspectorDetailState.value = null
    }
    return true
  }

  function selectInspectorTool(tool) {
    const normalizedTool = String(tool || '')
    if (!INSPECTOR_LABELS[normalizedTool]) return
    prepareToolSelection(normalizedTool)
    if (inspectorDetailState.value?.kind === 'scene-edit' && normalizedTool !== 'scene') {
      discardSceneDraft?.()
      inspectorDetailState.value = null
    }
    activeInspectorTool.value = normalizedTool
    inspectorOpen.value = true
    if (normalizedTool === 'scene') {
      inspectorDetailState.value = null
      if (sceneDetailNotice) sceneDetailNotice.value = ''
      return
    }
    if (normalizedTool === 'annotations') inspectorTab.value = 'comments'
    if (normalizedTool === 'history') inspectorTab.value = 'version'
  }

  return Object.freeze({
    activeInspectorLabel,
    activeInspectorTool,
    activeWritingPane,
    clearInspectorReturnSurface,
    closeWritingInspector,
    freezeWritingSurfaceBeforeToolSelect,
    inspectorDetailState,
    inspectorOpen,
    inspectorPinned,
    inspectorReturnFocusRef,
    inspectorReturnSurface,
    inspectorTab,
    openInspectorTool,
    selectInspectorTool
  })
}
