import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useFieldDirty } from '../composables/useFieldDirty'
import { useWorldStore } from '../stores/worldStore'

// stub worldStore.updateStructuredSetting
function stubWorldStore() {
  return {
    updateStructuredSetting: vi.fn().mockResolvedValue(undefined)
  }
}

describe('useFieldDirty', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('初始 state = pristine', () => {
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 100
    })
    expect(dirty.state.value).toBe('pristine')
  })

  it('markDirty 后 state = dirty，dirtyRegistry 加入 key', () => {
    const registry = new Set()
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 100,
      dirtyRegistry: registry
    })
    dirty.markDirty('hello', '')
    expect(dirty.state.value).toBe('dirty')
    expect(registry.has('world.origin')).toBe(true)
  })

  it('debounce — 100ms 后才触发 save', async () => {
    vi.useFakeTimers()
    const worldStore = useWorldStore()
    vi.spyOn(worldStore, 'updateStructuredSetting').mockResolvedValue(undefined)
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 100
    })
    dirty.markDirty('hello', '')
    expect(worldStore.updateStructuredSetting).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(worldStore.updateStructuredSetting).toHaveBeenCalledWith('wb1', 'world', 'origin', 'hello')
  })

  it('save 成功 → state = saved → 2s 后回 pristine', async () => {
    vi.useFakeTimers()
    const worldStore = useWorldStore()
    vi.spyOn(worldStore, 'updateStructuredSetting').mockResolvedValue(undefined)
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 50
    })
    dirty.markDirty('hello', '')
    await vi.advanceTimersByTimeAsync(50)
    expect(dirty.state.value).toBe('saved')
    await vi.advanceTimersByTimeAsync(2000)
    expect(dirty.state.value).toBe('pristine')
  })

  it('save 成功 → onCommit({before, after, at}) 触发', async () => {
    vi.useFakeTimers()
    const worldStore = useWorldStore()
    vi.spyOn(worldStore, 'updateStructuredSetting').mockResolvedValue(undefined)
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 50
    })
    const onCommit = vi.fn()
    dirty.setOnCommit(onCommit)
    dirty.markDirty('hello', 'old')
    await vi.advanceTimersByTimeAsync(50)
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({
      before: 'old',
      after: 'hello'
    }))
  })

  it('save 失败 → state = error，error.value 有 message，保留 dirty 可重试', async () => {
    vi.useFakeTimers()
    const worldStore = useWorldStore()
    vi.spyOn(worldStore, 'updateStructuredSetting').mockRejectedValue(new Error('网络错误'))
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 50
    })
    dirty.markDirty('hello', '')
    await vi.advanceTimersByTimeAsync(50)
    expect(dirty.state.value).toBe('error')
    expect(dirty.error.value).toBe('网络错误')
  })

  it('flush — 立即触发 pending save，不等 debounce', async () => {
    vi.useFakeTimers()
    const worldStore = useWorldStore()
    vi.spyOn(worldStore, 'updateStructuredSetting').mockResolvedValue(undefined)
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 10000
    })
    dirty.markDirty('hello', '')
    await dirty.flush()
    expect(worldStore.updateStructuredSetting).toHaveBeenCalled()
  })

  it('cancel — 撤销 pending，state 保持 dirty', () => {
    vi.useFakeTimers()
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 100
    })
    dirty.markDirty('hello', '')
    expect(dirty.state.value).toBe('dirty')
    dirty.cancel()
    // state 还是 dirty（cancel 不重置 state，只清 pending）
    expect(dirty.state.value).toBe('dirty')
  })

  it('markPristine — 强制设 pristine（外部 store sync 后）', () => {
    const dirty = useFieldDirty({
      worldbookId: 'wb1',
      sectionKey: 'world',
      fieldKey: 'origin',
      debounceMs: 100
    })
    dirty.markDirty('hello', '')
    expect(dirty.state.value).toBe('dirty')
    dirty.markPristine()
    expect(dirty.state.value).toBe('pristine')
  })
})
