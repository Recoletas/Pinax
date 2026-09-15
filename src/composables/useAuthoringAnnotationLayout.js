import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveAnnotationLaneLayout } from '../services/writing/writingAnnotations.js'

/** Desktop margin-note geometry and observer lifecycle. */
export function useAuthoringAnnotationLayout({
  annotations,
  draftAnchor,
  activeAnnotationId,
  inspectorOpen,
  inspectorTab,
  getDocumentRevision,
  getEditorRoot,
  getWritingMain,
  getAnchorMetrics
}) {
  const annotationLaneRef = ref(null)
  const annotationLaneLayout = ref({})
  const annotationLaneHeight = ref(240)
  const annotationNoteRefs = new Map()
  let annotationLayoutFrame = 0
  let annotationResizeObserver = null
  let savedLaneScrollTop = 0

  const annotationLaneStyle = computed(() => ({
    '--annotation-lane-height': `${annotationLaneHeight.value}px`
  }))

  function setAnnotationNoteRef(element, annotationId) {
    const previous = annotationNoteRefs.get(annotationId)
    if (previous && previous !== element) annotationResizeObserver?.unobserve(previous)
    if (element) {
      annotationNoteRefs.set(annotationId, element)
      annotationResizeObserver?.observe(element)
    } else {
      annotationNoteRefs.delete(annotationId)
    }
  }

  function getAnnotationNoteStyle(annotation) {
    const position = annotationLaneLayout.value[annotation.id]
    if (!position) return undefined
    const maxOffset = Math.max(0, position.height / 2 - 8)
    const anchorOffset = Math.max(-maxOffset, Math.min(maxOffset, position.anchorOffset))
    return {
      top: `${position.top}px`,
      '--annotation-anchor-offset': `${anchorOffset}px`
    }
  }

  function scheduleAnnotationLayout() {
    if (annotationLayoutFrame) cancelAnimationFrame(annotationLayoutFrame)
    annotationLayoutFrame = requestAnimationFrame(() => {
      annotationLayoutFrame = 0
      nextTick(refreshAnnotationLayout)
    })
  }

  function setupAnnotationResizeObserver() {
    if (annotationResizeObserver || typeof ResizeObserver === 'undefined') return
    const root = getEditorRoot()
    if (!root) return
    annotationResizeObserver = new ResizeObserver(scheduleAnnotationLayout)
    annotationResizeObserver.observe(root)
    const writingMain = getWritingMain()
    if (writingMain) annotationResizeObserver.observe(writingMain)
    annotationNoteRefs.forEach((note) => annotationResizeObserver.observe(note))
  }

  function refreshAnnotationLayout() {
    setupAnnotationResizeObserver()
    if (
      !window.matchMedia?.('(min-width: 981px)').matches
      || !inspectorOpen.value
      || inspectorTab.value !== 'comments'
    ) {
      annotationLaneLayout.value = {}
      annotationLaneHeight.value = 0
      return
    }
    const lane = annotationLaneRef.value
    const root = getEditorRoot()
    if (!lane || !root) return
    const laneRect = lane.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    const laneScale = lane.offsetHeight > 0 ? laneRect.height / lane.offsetHeight : 1
    const safeScale = Number.isFinite(laneScale) && laneScale > 0 ? laneScale : 1
    const layoutAnnotations = draftAnchor.value
      ? [...annotations.value, draftAnchor.value]
      : annotations.value
    const items = layoutAnnotations.map((annotation) => {
      const note = annotationNoteRefs.get(annotation.id)
      const metrics = annotation.status === 'orphaned' ? null : getAnchorMetrics(annotation)
      return {
        id: annotation.id,
        height: note?.offsetHeight || 64,
        desiredCenter: metrics ? (metrics.viewportY - laneRect.top) / safeScale : undefined
      }
    })
    const layout = resolveAnnotationLaneLayout(items, { gap: 14 })
    annotationLaneLayout.value = layout
    const notesBottom = Object.values(layout).reduce(
      (maximum, item) => Math.max(maximum, item.top + item.height),
      0
    )
    annotationLaneHeight.value = Math.max(240, (rootRect.bottom - laneRect.top) / safeScale, notesBottom + 24)
  }

  function captureAnnotationLaneScroll() {
    savedLaneScrollTop = annotationLaneRef.value?.scrollTop ?? 0
  }

  async function restoreAnnotationLaneScroll() {
    await nextTick()
    if (annotationLaneRef.value && savedLaneScrollTop) {
      annotationLaneRef.value.scrollTop = savedLaneScrollTop
    }
  }

  watch(
    [annotations, draftAnchor, activeAnnotationId, inspectorOpen, inspectorTab, () => getDocumentRevision()],
    scheduleAnnotationLayout,
    { deep: true, flush: 'post' }
  )

  onMounted(() => {
    window.addEventListener('resize', scheduleAnnotationLayout)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', scheduleAnnotationLayout)
    annotationResizeObserver?.disconnect()
    if (annotationLayoutFrame) cancelAnimationFrame(annotationLayoutFrame)
  })

  return {
    annotationLaneRef,
    annotationLaneStyle,
    setAnnotationNoteRef,
    getAnnotationNoteStyle,
    refreshAnnotationLayout,
    scheduleAnnotationLayout,
    captureAnnotationLaneScroll,
    restoreAnnotationLaneScroll
  }
}
