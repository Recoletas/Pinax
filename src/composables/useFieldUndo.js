import { ref } from 'vue'

// checkpoint-based undo: 在 commit 成功时推 { before, after, at }
// undo() → 返回 before（之前值）
// redo() → 返回 after（之后值）
//
// 200ms throttle + 重复值不推（防止快速打字推一长串）
// 栈 limit = 50（22 字段 × 50 × 100B ≈ 110KB，可忽略）
export function useFieldUndo({ limit = 50, throttleMs = 200 } = {}) {
  const stack = ref([])
  const future = ref([])
  let lastPushAt = 0

  function push({ before, after, at }) {
    const now = Date.now()
    if (now - lastPushAt < throttleMs) return
    if (stack.value.length > 0 && stack.value[stack.value.length - 1].after === after) return
    stack.value.push({ before, after, at: now })
    if (stack.value.length > limit) stack.value.shift()
    future.value = []
    lastPushAt = now
  }

  function undo() {
    const top = stack.value.pop()
    if (!top) return null
    future.value.push(top)
    return top.before
  }

  function redo() {
    const top = future.value.pop()
    if (!top) return null
    stack.value.push(top)
    return top.after
  }

  return { stack, future, push, undo, redo }
}
