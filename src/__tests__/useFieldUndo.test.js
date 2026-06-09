import { describe, it, expect, vi } from 'vitest'
import { useFieldUndo } from '../composables/useFieldUndo'

describe('useFieldUndo', () => {
  it('push + undo 回到 before', () => {
    const undo = useFieldUndo()
    undo.push({ before: 'A', after: 'B', at: 1 })
    expect(undo.undo()).toBe('A')
  })

  it('undo + redo 回到 after', () => {
    const undo = useFieldUndo()
    undo.push({ before: 'A', after: 'B', at: 1 })
    undo.undo()
    expect(undo.redo()).toBe('B')
  })

  it('空栈 undo/redo → null', () => {
    const undo = useFieldUndo()
    expect(undo.undo()).toBeNull()
    expect(undo.redo()).toBeNull()
  })

  it('throttle 200ms — 快速连推只推一次', () => {
    const undo = useFieldUndo()
    undo.push({ before: 'A', after: 'B', at: 1 })
    undo.push({ before: 'B', after: 'C', at: 2 })  // < 200ms, skip
    undo.push({ before: 'C', after: 'D', at: 3 })
    expect(undo.stack.value.length).toBe(1)
  })

  it('throttle 跨过 200ms 后允许再推', () => {
    vi.useFakeTimers()
    const undo = useFieldUndo()
    undo.push({ before: 'A', after: 'B', at: Date.now() })
    vi.advanceTimersByTime(250)
    undo.push({ before: 'B', after: 'C', at: Date.now() })
    expect(undo.stack.value.length).toBe(2)
    vi.useRealTimers()
  })

  it('重复 after 值不推', () => {
    const undo = useFieldUndo()
    undo.push({ before: 'A', after: 'B', at: 1 })
    vi.useFakeTimers()
    vi.advanceTimersByTime(250)
    undo.push({ before: 'X', after: 'B', at: Date.now() })  // 重复 after
    vi.useRealTimers()
    expect(undo.stack.value.length).toBe(1)
  })

  it('limit=50 — 推 60 个只保留 50', () => {
    const undo = useFieldUndo({ limit: 50 })
    vi.useFakeTimers()
    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(250)
      undo.push({ before: `b${i}`, after: `a${i}`, at: Date.now() })
    }
    expect(undo.stack.value.length).toBe(50)
    expect(undo.stack.value[0].after).toBe('a10')  // 最早的被 shift
    vi.useRealTimers()
  })

  it('连续 undo 直到空', () => {
    const undo = useFieldUndo()
    vi.useFakeTimers()
    undo.push({ before: 'A', after: 'B', at: 1 })
    vi.advanceTimersByTime(250)
    undo.push({ before: 'B', after: 'C', at: 2 })
    vi.advanceTimersByTime(250)
    undo.push({ before: 'C', after: 'D', at: 3 })
    expect(undo.undo()).toBe('C')
    expect(undo.undo()).toBe('B')
    expect(undo.undo()).toBe('A')
    expect(undo.undo()).toBeNull()
    vi.useRealTimers()
  })

  it('push 清空 future', () => {
    const undo = useFieldUndo()
    vi.useFakeTimers()
    undo.push({ before: 'A', after: 'B', at: 1 })
    undo.undo()  // future = [checkpoint]
    expect(undo.future.value.length).toBe(1)
    vi.advanceTimersByTime(250)
    undo.push({ before: 'B', after: 'C', at: 2 })  // 新 push 应清空 future
    expect(undo.future.value.length).toBe(0)
    vi.useRealTimers()
  })
})
