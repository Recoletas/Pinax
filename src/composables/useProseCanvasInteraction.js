import { onBeforeUnmount, onMounted } from 'vue'

// Owns cross-cutting cancellation for pointer/link sessions. The mutation and
// geometry adapters remain explicit so this composable never reads page state.
export function useProseCanvasInteraction({ cancelPointerDrag, cancelDraggedEdgeUpdate, stopEdgeDraft }) {
  function reset() {
    cancelPointerDrag()
    cancelDraggedEdgeUpdate()
    stopEdgeDraft()
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') reset()
  }
  onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    reset()
  })
  return { reset, dispose: reset }
}
