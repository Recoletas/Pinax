import { ref, computed, shallowRef } from 'vue'

/**
 * Real undo/redo stack for textarea editors.
 * document.execCommand('undo'/'redo') doesn't work on textarea elements
 * (it's a contenteditable-only API that has been deprecated anyway).
 *
 * Stack layout: [newest, ..., oldest] (index 0 = current committed state).
 * pointer = 0 means "at latest", pointer++ moves backward in history.
 */

const MAX_STACK = 60
const DEBOUNCE_MS = 500

export function useEditorHistory() {
  const stack = shallowRef([])
  const pointer = ref(0)
  let pushTimer = null
  let lastPushedValue = null

  const canUndo = computed(() => pointer.value < stack.value.length - 1)
  const canRedo = computed(() => pointer.value > 0)

  function snapshot(textarea) {
    if (!textarea) return null
    return {
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd
    }
  }

  function push(textarea) {
    if (!textarea) return
    const snap = snapshot(textarea)
    if (!snap || snap.value === lastPushedValue) return

    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      _commit(textarea)
    }, DEBOUNCE_MS)
  }

  function _commit(textarea) {
    const snap = snapshot(textarea)
    if (!snap || snap.value === lastPushedValue) return

    // Discard redo entries (anything between index 0 and pointer-1)
    if (pointer.value > 0) {
      stack.value = stack.value.slice(pointer.value)
      pointer.value = 0
    }

    stack.value = [snap, ...stack.value]
    if (stack.value.length > MAX_STACK) {
      stack.value = stack.value.slice(0, MAX_STACK)
    }
    lastPushedValue = snap.value
  }

  function flush(textarea) {
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
      _commit(textarea)
    }
  }

  function undo(textarea) {
    if (!canUndo.value || !textarea) return
    flush(textarea)

    pointer.value++
    const snap = stack.value[pointer.value]
    if (!snap) return

    lastPushedValue = snap.value
    textarea.value = snap.value
    textarea.setSelectionRange(snap.selectionStart, snap.selectionEnd)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function redo(textarea) {
    if (!canRedo.value || !textarea) return

    pointer.value--
    const snap = stack.value[pointer.value]
    if (!snap) return

    lastPushedValue = snap.value
    textarea.value = snap.value
    textarea.setSelectionRange(snap.selectionStart, snap.selectionEnd)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function clear() {
    stack.value = []
    pointer.value = 0
    lastPushedValue = null
    if (pushTimer) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
  }

  return {
    canUndo,
    canRedo,
    push,
    flush,
    undo,
    redo,
    clear
  }
}
