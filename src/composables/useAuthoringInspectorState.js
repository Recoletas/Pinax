import { computed, ref, shallowRef } from 'vue'

const INSPECTOR_LABELS = Object.freeze({
  annotations: '批注',
  outline: '大纲',
  characters: '角色',
  worldbook: '设定',
  scene: '现场',
  rehearsal: '推演',
  collaboration: '共同排演',
  materials: '素材',
  ai: '助手',
  history: '历史',
  dual: '双栏'
})

export function useAuthoringInspectorState({
  selectedChapterId,
  chapters,
  dualPaneRef,
  dualTargetChapterId,
  dualTargetExplorationId,
  dualTargetOutlineNodeId,
  dualTargetWorldbookEntryId,
  clearDualQuickWordDocument,
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
  const inspectorDualColumn = computed(() => inspectorOpen.value && activeInspectorTool.value === 'dual')
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
      const leavingDual = inspectorOpen.value && activeInspectorTool.value === 'dual' && normalizedTool !== 'dual'
      if (leavingDual && snapshot.pane === 'dual') {
        next = Object.freeze({ ...snapshot, previous })
      } else if (!inspectorOpen.value) {
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
    if (inspectorDetailState.value?.kind === 'scene-edit') {
      discardSceneDraft?.()
      inspectorDetailState.value = null
    }
    inspectorOpen.value = false
    activeWritingPane.value = 'main'
    clearDualQuickWordDocument?.()
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
    const prepared = prepareToolSelection(normalizedTool)
    if (inspectorOpen.value && activeInspectorTool.value === 'dual' && normalizedTool !== 'dual') {
      if (dualPaneRef.value?.prepareClose?.() === false) {
        inspectorReturnSurface.value = prepared?.previous || inspectorReturnSurface.value?.previous || null
        return false
      }
      activeWritingPane.value = 'main'
    }
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
    const prepared = prepareToolSelection(tool)
    if (tool === 'dual') {
      if (inspectorOpen.value && activeInspectorTool.value === 'dual') {
        if (dualPaneRef.value?.prepareClose?.() === false) {
          inspectorReturnSurface.value = prepared?.previous || inspectorReturnSurface.value
          return
        }
        closeWritingInspector()
        return
      }
      activeInspectorTool.value = 'dual'
      inspectorOpen.value = true
      inspectorPinned.value = true
      if (!dualTargetChapterId.value && !dualTargetExplorationId.value && !dualTargetOutlineNodeId.value && !dualTargetWorldbookEntryId.value) {
        dualTargetChapterId.value = String(selectedChapterId.value || chapters.value[0]?.id || '')
      }
      return
    }
    if (inspectorOpen.value && activeInspectorTool.value === 'dual') {
      if (dualPaneRef.value?.prepareClose?.() === false) {
        inspectorReturnSurface.value = prepared?.previous || inspectorReturnSurface.value?.previous || null
        return
      }
      activeWritingPane.value = 'main'
    }
    if (inspectorDetailState.value?.kind === 'scene-edit' && tool !== 'scene') {
      discardSceneDraft?.()
      inspectorDetailState.value = null
    }
    activeInspectorTool.value = tool
    inspectorOpen.value = true
    if (tool === 'scene') {
      if (inspectorDetailState.value?.kind === 'scene-edit') discardSceneDraft?.()
      inspectorDetailState.value = null
      if (sceneDetailNotice) sceneDetailNotice.value = ''
      return
    }
    if (tool === 'annotations') inspectorTab.value = 'comments'
    if (tool === 'history') inspectorTab.value = 'version'
  }

  return Object.freeze({
    activeInspectorLabel,
    activeInspectorTool,
    activeWritingPane,
    clearInspectorReturnSurface,
    closeWritingInspector,
    freezeWritingSurfaceBeforeToolSelect,
    inspectorDetailState,
    inspectorDualColumn,
    inspectorOpen,
    inspectorPinned,
    inspectorReturnFocusRef,
    inspectorReturnSurface,
    inspectorTab,
    openInspectorTool,
    selectInspectorTool
  })
}
