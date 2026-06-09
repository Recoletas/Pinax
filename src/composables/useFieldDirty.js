import { getCurrentInstance, ref, onBeforeUnmount } from 'vue'
import { useWorldStore } from '../stores/worldStore'

// 5 态机：pristine | dirty | saving | saved | error
//  - pristine：无未保存输入，可被外部 store 反向同步
//  - dirty：用户有输入，外部 store 同步应跳过
//  - saving：commit in-flight
//  - saved：commit 成功，2s 后回 pristine
//  - error：commit 失败，保留 dirty + 暴露 error
export function useFieldDirty({ worldbookId, sectionKey, fieldKey, debounceMs = 300, dirtyRegistry = null }) {
  const worldStore = useWorldStore()
  const state = ref('pristine')
  const error = ref(null)
  const key = `${sectionKey}.${fieldKey}`

  let pendingValue = null
  let pendingPrev = null
  let timer = null
  let onCommit = null

  function markDirty(value, prevValue) {
    if (state.value !== 'dirty') {
      state.value = 'dirty'
      dirtyRegistry?.add?.(key)
    }
    pendingValue = value
    pendingPrev = prevValue
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { doSave().catch(() => {}) }, debounceMs)
  }

  async function doSave() {
    if (pendingValue == null) return
    const value = pendingValue
    const prev = pendingPrev
    pendingValue = null
    pendingPrev = null
    if (timer) { clearTimeout(timer); timer = null }

    state.value = 'saving'
    try {
      await worldStore.updateStructuredSetting(worldbookId.value ?? worldbookId, sectionKey, fieldKey, value)
      state.value = 'saved'
      error.value = null
      dirtyRegistry?.delete?.(key)
      onCommit?.({ before: prev, after: value, at: Date.now() })
      setTimeout(() => {
        if (state.value === 'saved') state.value = 'pristine'
      }, 2000)
    } catch (e) {
      state.value = 'error'
      error.value = e?.message || '保存失败'
    }
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null }
    return doSave()
  }

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null }
    pendingValue = null
    pendingPrev = null
  }

  function setOnCommit(fn) { onCommit = fn }

  function markPristine() {
    state.value = 'pristine'
    error.value = null
    dirtyRegistry?.delete?.(key)
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      if (timer) clearTimeout(timer)
      dirtyRegistry?.delete?.(key)
    })
  }

  return { state, error, key, markDirty, flush, cancel, setOnCommit, markPristine }
}
