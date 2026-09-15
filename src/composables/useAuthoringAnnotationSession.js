import { computed, nextTick, ref } from 'vue'
import {
  createWritingAnnotation,
  deleteWritingAnnotation,
  updateWritingAnnotationBody
} from '../services/writing/writingAnnotations.js'

/**
 * Authoring 批注的编辑会话 owner。
 *
 * 本层拥有批注草稿、当前项、编辑态和根批注投影；页面只负责提供当前
 * 文档的批注集合、编辑器选区、滚动与定位等宿主能力。
 */
export function useAuthoringAnnotationSession({
  getAnnotations,
  setAnnotations,
  getSelectionContext,
  getScopeId,
  canCreateTarget,
  captureScroll,
  restoreScroll,
  openCommentsInspector,
  setStatus,
  onChanged,
  onBeforeDelete,
  clearDraftNoteRef,
  scheduleLayout,
  focusEditor,
  focusEditField
}) {
  const activeAnnotationId = ref(null)
  const editingAnnotationId = ref(null)
  const annotationEditDraft = ref('')
  const annotationDraft = ref('')
  const annotationComposerOpen = ref(false)
  const annotationComposerContext = ref(null)

  const rootAnnotations = computed(() => {
    const annotations = getAnnotations()
    const ids = new Set(annotations.map((annotation) => annotation.id))
    return annotations.filter((annotation) => (
      annotation.status !== 'resolved'
        && (!annotation.parentId || !ids.has(annotation.parentId))
    ))
  })
  const marginAnnotations = computed(() => rootAnnotations.value)
  const openAnnotationCount = computed(() => rootAnnotations.value.filter(
    (annotation) => annotation.status === 'open'
  ).length)
  const annotationDraftAnchor = computed(() => {
    const context = annotationComposerContext.value
    if (!annotationComposerOpen.value || !context?.block?.nodeId || !context?.range) return null
    return {
      id: 'annotation-draft',
      target: {
        unitId: context.block.unitId,
        unitRevision: context.block.unitRevision,
        nodeId: context.block.nodeId,
        nodeRevision: context.block.nodeRevision,
        start: context.selector?.start || 0,
        end: context.selector?.end || 0
      },
      selector: context.selector,
      range: context.range,
      status: 'open'
    }
  })
  const canCreateAnnotation = computed(() => Boolean(
    annotationDraft.value.trim() && canCreateTarget()
  ))

  function getAnnotationSupplements(annotation) {
    return getAnnotations().filter((item) => item.parentId === annotation?.id)
  }

  function closeAnnotationComposer({ restoreFocus = true } = {}) {
    annotationComposerOpen.value = false
    annotationComposerContext.value = null
    annotationDraft.value = ''
    clearDraftNoteRef?.()
    scheduleLayout?.()
    if (restoreFocus) nextTick(() => focusEditor?.())
  }

  function addAnnotation({ context, body, kind = 'comment' }) {
    if (!context?.block?.nodeId || !context?.selector || !String(body || '').trim()) return null
    const annotation = createWritingAnnotation({
      chapterId: getScopeId(),
      target: {
        unitId: context.block.unitId,
        unitRevision: context.block.unitRevision,
        nodeId: context.block.nodeId,
        nodeRevision: context.block.nodeRevision,
        start: context.selector.start,
        end: context.selector.end
      },
      selector: context.selector,
      range: context.range,
      references: context.worldbookReferences || [],
      body: String(body).trim(),
      kind
    })
    setAnnotations([annotation, ...getAnnotations()])
    activeAnnotationId.value = annotation.id
    return annotation
  }

  function createAnnotationFromSelection() {
    const body = annotationDraft.value.trim()
    const context = annotationComposerContext.value || getSelectionContext()
    if (!context) {
      setStatus?.('请先在正文中选中需要批注的片段')
      return false
    }
    if (!body) return false
    const scrollState = captureScroll?.()
    const annotation = addAnnotation({ context, body })
    if (!annotation) return false
    openCommentsInspector?.()
    setStatus?.('批注已添加')
    onChanged?.()
    nextTick(() => {
      closeAnnotationComposer({ restoreFocus: false })
      restoreScroll?.(scrollState)
    })
    return true
  }

  function startAnnotationEdit(annotation) {
    if (!annotation) return false
    activeAnnotationId.value = annotation.id
    editingAnnotationId.value = annotation.id
    annotationEditDraft.value = annotation.body
    nextTick(() => focusEditField?.())
    return true
  }

  function cancelAnnotationEdit() {
    editingAnnotationId.value = null
    annotationEditDraft.value = ''
  }

  function saveAnnotationEdit(annotation) {
    const body = annotationEditDraft.value.trim()
    if (!annotation?.id || !body) return false
    setAnnotations(updateWritingAnnotationBody(getAnnotations(), annotation.id, body))
    cancelAnnotationEdit()
    setStatus?.('批注已更新')
    onChanged?.()
    return true
  }

  function deleteAnnotation(annotation) {
    if (!annotation?.id) return false
    onBeforeDelete?.(annotation)
    setAnnotations(deleteWritingAnnotation(getAnnotations(), annotation.id))
    if (activeAnnotationId.value === annotation.id) activeAnnotationId.value = null
    if (editingAnnotationId.value === annotation.id) cancelAnnotationEdit()
    setStatus?.('批注已删除')
    onChanged?.()
    return true
  }

  function resetAnnotationSession() {
    activeAnnotationId.value = null
    editingAnnotationId.value = null
    annotationEditDraft.value = ''
    annotationDraft.value = ''
    annotationComposerOpen.value = false
    annotationComposerContext.value = null
  }

  return {
    activeAnnotationId,
    editingAnnotationId,
    annotationEditDraft,
    annotationDraft,
    annotationComposerOpen,
    annotationComposerContext,
    rootAnnotations,
    marginAnnotations,
    openAnnotationCount,
    annotationDraftAnchor,
    canCreateAnnotation,
    getAnnotationSupplements,
    addAnnotation,
    closeAnnotationComposer,
    createAnnotationFromSelection,
    startAnnotationEdit,
    cancelAnnotationEdit,
    saveAnnotationEdit,
    deleteAnnotation,
    resetAnnotationSession
  }
}
