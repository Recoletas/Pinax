import { ref, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'

/**
 * Pan / zoom / viewport state composable for canvas containers.
 *
 * Provides:
 * - Zoom scale and pan offsets
 * - ResizeObserver on container for canvas dimensions
 * - RAF-batched edge recompute scheduling
 * - Cleanup on unmount
 *
 * The pan/zoom state is currently available for future use; existing
 * ProseEssay scroll-based navigation is unchanged. `onEdgeChange` is
 * the primary integration point today — it coalesces multiple edge-
 * recompute calls into at most one per animation frame.
 *
 * @param {{ onEdgeChange?: () => void, containerRef?: import('vue').Ref<HTMLElement|null> }} options
 */
export function useCanvasViewport(options = {}) {
  const { onEdgeChange = null } = options

  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)
  const containerWidth = ref(0)
  const containerHeight = ref(0)

  let _edgeFlushRaf = null
  let _needsEdgeFlush = false
  let _resizeObserver = null
  let _mounted = true
  let _containerEl = null

  function getContainerEl() {
    if (options.containerRef?.value) return options.containerRef.value
    return _containerEl
  }

  function scheduleEdgeFlush() {
    if (!onEdgeChange) return
    _needsEdgeFlush = true
    if (_edgeFlushRaf == null) {
      _edgeFlushRaf = requestAnimationFrame(() => {
        _edgeFlushRaf = null
        if (_needsEdgeFlush && _mounted) {
          _needsEdgeFlush = false
          try { onEdgeChange() } catch { /* noop */ }
        }
      })
    }
  }

  function flushEdgesImmediate() {
    if (_edgeFlushRaf != null) {
      cancelAnimationFrame(_edgeFlushRaf)
      _edgeFlushRaf = null
    }
    _needsEdgeFlush = false
    if (_mounted && onEdgeChange) {
      try { onEdgeChange() } catch { /* noop */ }
    }
  }

  function invalidateEdgeFlush() {
    _needsEdgeFlush = false
    if (_edgeFlushRaf != null) {
      cancelAnimationFrame(_edgeFlushRaf)
      _edgeFlushRaf = null
    }
  }

  function _connectResizeObserver(el) {
    if (!el) return
    _resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect
        containerWidth.value = Number.isFinite(cr.width) ? Math.max(0, cr.width) : 0
        containerHeight.value = Number.isFinite(cr.height) ? Math.max(0, cr.height) : 0
      }
      scheduleEdgeFlush()
    })
    _resizeObserver.observe(el)
  }

  function _disconnectResizeObserver() {
    if (_resizeObserver) {
      _resizeObserver.disconnect()
      _resizeObserver = null
    }
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      _mounted = true
      _containerEl = getContainerEl()
      if (_containerEl) {
        _connectResizeObserver(_containerEl)
        containerWidth.value = Math.max(0, _containerEl.clientWidth || 0)
        containerHeight.value = Math.max(0, _containerEl.clientHeight || 0)
      }
    })

    onBeforeUnmount(() => {
      _mounted = false
      _disconnectResizeObserver()
      invalidateEdgeFlush()
    })
  }

  return {
    zoom,
    panX,
    panY,
    containerWidth,
    containerHeight,
    scheduleEdgeFlush,
    flushEdgesImmediate,
    invalidateEdgeFlush
  }
}
