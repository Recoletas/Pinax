import { ref } from 'vue'
import { imageBaseWidth } from '../services/notes/illustrationPresentation'

// Pointer capture, selection and the context menu form one transient UI
// session. The page supplies DOM/content adapters; this owner guarantees that
// drag cancellation cannot leave stale selection or transforms behind.
export function useNotesIllustrationInteraction({
  editorRef,
  activateFigure,
  presentationForTarget,
  applyPresentation,
  textOffsetFromPoint,
  currentCaretOffset
}) {
  const imageContextMenu = ref({ show: false, x: 0, y: 0 })
  const illustrationSelected = ref(false)
  const selectedIllustrationTarget = ref(null)
  let drag = null

  function clearFigureState(figure) {
    figure?.classList.remove('is-dragging', 'is-resizing')
    if (figure?.style) figure.style.transform = ''
  }

  function startIllustrationDrag(event) {
    if (event.button !== 0) return
    const figure = event.target.closest?.('[data-narrative-illustration]')
    if (!figure) return
    const target = activateFigure(figure, event.currentTarget)
    const presentation = presentationForTarget(target)
    if (!presentation) return
    event.preventDefault()
    event.stopPropagation()
    const mode = event.target.closest?.('[data-illustration-resize]') ? 'resize' : 'move'
    drag = {
      pointerId: event.pointerId,
      root: event.currentTarget,
      figure,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: figure.getBoundingClientRect().width,
      mode,
      target,
      presentation,
      moved: false
    }
    selectedIllustrationTarget.value = target
    illustrationSelected.value = true
    figure.classList.add('is-selected', mode === 'resize' ? 'is-resizing' : 'is-dragging')
    figure.setPointerCapture?.(event.pointerId)
  }

  function moveIllustrationDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY
    drag.moved ||= Math.hypot(dx, dy) > 3
    if (drag.mode === 'resize') {
      const rootWidth = drag.root.getBoundingClientRect().width || 1
      const basePercent = imageBaseWidth(drag.presentation.wrap)
      const minWidth = rootWidth * basePercent * 0.5 / 100
      const maxWidth = rootWidth * Math.min(100, basePercent * 2) / 100
      drag.figure.style.width = `${Math.min(maxWidth, Math.max(minWidth, drag.startWidth + dx))}px`
      return
    }
    const base = ['behind', 'front'].includes(drag.presentation.wrap) ? 'translate(-50%, -50%) ' : ''
    drag.figure.style.transform = `${base}translate(${dx}px, ${dy}px)`
  }

  function finishIllustrationDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return
    const completed = drag
    drag = null
    completed.figure.releasePointerCapture?.(event.pointerId)
    if (!completed.moved) {
      clearFigureState(completed.figure)
      return
    }

    const rect = completed.root.getBoundingClientRect()
    if (completed.mode === 'resize') {
      const widthPercent = (completed.figure.getBoundingClientRect().width / Math.max(1, rect.width)) * 100
      applyPresentation({ scale: widthPercent / imageBaseWidth(completed.presentation.wrap) }, true, true, completed.target)
      return
    }
    if (['behind', 'front'].includes(completed.presentation.wrap)) {
      applyPresentation({
        positionX: ((event.clientX - rect.left) / rect.width) * 100,
        positionY: ((event.clientY - rect.top) / rect.height) * 100
      }, true, true, completed.target)
      return
    }

    const previousPointerEvents = completed.figure.style.pointerEvents
    completed.figure.style.pointerEvents = 'none'
    const anchorOffset = textOffsetFromPoint(
      completed.root,
      event.clientX,
      event.clientY,
      completed.presentation.anchorOffset
    )
    completed.figure.style.pointerEvents = previousPointerEvents
    const align = ['square', 'tight'].includes(completed.presentation.wrap)
      ? (event.clientX < rect.left + rect.width / 2 ? 'left' : 'right')
      : completed.presentation.align
    applyPresentation({ anchorOffset, align }, true, true, completed.target)
  }

  function cancelIllustrationDrag(event) {
    if (!drag || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return
    clearFigureState(drag.figure)
    drag = null
  }

  function selectIllustrationFromEvent(event) {
    const figure = event.target.closest?.('[data-narrative-illustration]')
    if (!figure) {
      resetSelection()
      return
    }
    event.stopPropagation()
    selectedIllustrationTarget.value = activateFigure(figure)
    illustrationSelected.value = true
    figure.classList.add('is-selected')
  }

  function showEditorContextMenu(event) {
    const figure = event.target.closest?.('[data-narrative-illustration]')
    if (!figure) {
      imageContextMenu.value.show = false
      return
    }
    event.preventDefault()
    event.stopPropagation()
    selectedIllustrationTarget.value = activateFigure(figure)
    illustrationSelected.value = true
    figure.classList.add('is-selected')
    imageContextMenu.value = {
      show: true,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 330))
    }
  }

  function setImageLayout(value) {
    const separator = value.lastIndexOf('-')
    const target = selectedIllustrationTarget.value
    const current = presentationForTarget(target)
    if (!current) return
    const patch = { wrap: value.slice(0, separator), align: value.slice(separator + 1) }
    if (target?.source !== 'embedded') patch.anchorOffset = currentCaretOffset() ?? current.anchorOffset
    applyPresentation(patch, true, true, target)
  }

  function chooseImageLayout(value) {
    setImageLayout(value)
    imageContextMenu.value.show = false
  }

  function resetSelection() {
    cancelIllustrationDrag()
    selectedIllustrationTarget.value = null
    illustrationSelected.value = false
    imageContextMenu.value.show = false
    editorRef.value?.querySelectorAll('[data-narrative-illustration]').forEach((item) => item.classList.remove('is-selected'))
  }

  return {
    imageContextMenu,
    illustrationSelected,
    selectedIllustrationTarget,
    startIllustrationDrag,
    moveIllustrationDrag,
    finishIllustrationDrag,
    cancelIllustrationDrag,
    selectIllustrationFromEvent,
    showEditorContextMenu,
    setImageLayout,
    chooseImageLayout,
    resetSelection
  }
}
