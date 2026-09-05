import { computed } from 'vue'

export const AUTHORING_EXCEPTION_REASONS = Object.freeze([
  'locked-conflict',
  'identity-ambiguity',
  'destructive-retcon'
])

// 观察器 UI 状态：常规 applied 观察只产生一条 6 秒的安静状态文案；
// 只有 typed exception（锁定冲突 / 身份歧义 / 破坏性回溯）才进入可见列表。
export function useAuthoringObservers({ observations, exceptions, onResolve = null } = {}) {
  const appliedObservations = computed(() => (
    (observations.value || []).filter((item) => item?.status === 'applied')
  ))

  const statusText = computed(() => {
    const count = appliedObservations.value.length
    return count > 0 ? `已更新 ${count} 项派生信息` : ''
  })

  const visibleExceptions = computed(() => (
    (exceptions.value || []).filter((item) => AUTHORING_EXCEPTION_REASONS.includes(item?.reason))
  ))

  function resolveException(exceptionId, action) {
    onResolve?.(exceptionId, action)
  }

  return {
    statusText,
    visibleExceptions,
    resolveException
  }
}
