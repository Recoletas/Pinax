import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useEditorHistory } from '../composables/useEditorHistory'

function mockTextarea(value = '', selStart = 0, selEnd = 0) {
  const ta = {
    value,
    selectionStart: selStart,
    selectionEnd: selEnd,
    setSelectionRange(start, end) {
      ta.selectionStart = start
      ta.selectionEnd = end
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {}
  }
  return ta
}

describe('useEditorHistory', () => {
  let h

  beforeEach(() => {
    vi.useFakeTimers()
    h = useEditorHistory()
  })

  it('starts with canUndo=false, canRedo=false', () => {
    expect(h.canUndo.value).toBe(false)
    expect(h.canRedo.value).toBe(false)
  })

  it('canUndo stays false after only one commit (no older state)', () => {
    const ta = mockTextarea('hello')
    h.push(ta)
    vi.advanceTimersByTime(600)
    expect(h.canUndo.value).toBe(false)
    expect(h.canRedo.value).toBe(false)
  })

  it('canUndo becomes true after two commits', () => {
    const ta = mockTextarea('one')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'two'
    h.push(ta)
    vi.advanceTimersByTime(600)
    expect(h.canUndo.value).toBe(true)
  })

  it('undo restores previous value after two commits', () => {
    const ta = mockTextarea('one')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'two'
    ta.selectionStart = 2
    ta.selectionEnd = 2
    h.push(ta)
    vi.advanceTimersByTime(600)

    h.undo(ta)
    expect(ta.value).toBe('one')
    expect(ta.selectionStart).toBe(0)
    expect(ta.selectionEnd).toBe(0)
    expect(h.canRedo.value).toBe(true)
  })

  it('redo restores future value after undo', () => {
    const ta = mockTextarea('one')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'two'
    h.push(ta)
    vi.advanceTimersByTime(600)

    h.undo(ta)
    expect(ta.value).toBe('one')

    h.redo(ta)
    expect(ta.value).toBe('two')
    expect(h.canRedo.value).toBe(false)
  })

  it('discards redo stack on new input after undo', () => {
    const ta = mockTextarea('one')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'two'
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'three'
    h.push(ta)
    vi.advanceTimersByTime(600)

    h.undo(ta)
    expect(ta.value).toBe('two')
    expect(h.canRedo.value).toBe(true)

    ta.value = 'four'
    h.push(ta)
    vi.advanceTimersByTime(600)

    expect(h.canRedo.value).toBe(false)
    expect(ta.value).toBe('four')
  })

  it('does not push duplicate values', () => {
    const ta = mockTextarea('one')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'two'
    h.push(ta)
    vi.advanceTimersByTime(600)

    // Push same value again — should be a no-op
    ta.value = 'two'
    h.push(ta)
    vi.advanceTimersByTime(600)

    h.undo(ta)
    // Should go back to 'one', skipping the duplicate 'two'
    expect(ta.value).toBe('one')
  })

  it('clear() empties the stack and resets canUndo/canRedo', () => {
    const ta = mockTextarea('a')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'b'
    h.push(ta)
    vi.advanceTimersByTime(600)
    expect(h.canUndo.value).toBe(true)

    h.clear()
    expect(h.canUndo.value).toBe(false)
    expect(h.canRedo.value).toBe(false)
  })

  it('truncates stack at MAX_STACK (60)', () => {
    const ta = mockTextarea('v0')
    h.push(ta)
    vi.advanceTimersByTime(600)

    for (let i = 1; i <= 65; i++) {
      ta.value = 'v' + i
      h.push(ta)
      vi.advanceTimersByTime(600)
    }

    // Undo as far as we can
    let steps = 0
    while (h.canUndo.value && steps < 70) {
      h.undo(ta)
      steps++
    }

    // MAX_STACK = 60, so max undo steps ≤ 60 (59 entries to travel back + 1 at end)
    expect(steps).toBeLessThanOrEqual(60)
  })

  it('undo/re-do are no-ops when textarea is null', () => {
    // Push first so stack has entries
    const ta = mockTextarea('hello')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'world'
    h.push(ta)
    vi.advanceTimersByTime(600)

    h.undo(null)
    h.redo(null)
    expect(h.canUndo.value).toBe(true) // still true, nothing was consumed
  })

  it('multiple consecutive undo calls restore correct history', () => {
    const ta = mockTextarea('a')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'ab'
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'abc'
    h.push(ta)
    vi.advanceTimersByTime(600)

    h.undo(ta)
    expect(ta.value).toBe('ab')
    h.undo(ta)
    expect(ta.value).toBe('a')
    expect(h.canRedo.value).toBe(true)

    h.redo(ta)
    expect(ta.value).toBe('ab')
    h.redo(ta)
    expect(ta.value).toBe('abc')
    expect(h.canRedo.value).toBe(false)
  })

  it('debounces pushes: rapid keystrokes produce one snapshot', () => {
    const ta = mockTextarea('h')
    h.push(ta)
    vi.advanceTimersByTime(200)
    ta.value = 'he'
    h.push(ta)
    vi.advanceTimersByTime(200)
    ta.value = 'hel'
    h.push(ta)
    vi.advanceTimersByTime(200)
    ta.value = 'hello'
    h.push(ta)
    vi.advanceTimersByTime(600)

    // Rapid typing should produce only 1 committed snapshot
    // After 600ms the timer fires with 'hello'
    // Since this is the first commit, canUndo stays false
    expect(h.canUndo.value).toBe(false)
  })

  it('debounce + second commit: slow typing produces multiple snapshots', () => {
    const ta = mockTextarea('first')
    h.push(ta)
    vi.advanceTimersByTime(600)
    ta.value = 'second'
    h.push(ta)
    vi.advanceTimersByTime(600)

    expect(h.canUndo.value).toBe(true)
    h.undo(ta)
    expect(ta.value).toBe('first')
  })
})
