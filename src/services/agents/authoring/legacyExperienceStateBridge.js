export function createLegacyExperienceStateBridge({ insertText, scheduleObservers } = {}) {
  if (typeof insertText !== 'function' || typeof scheduleObservers !== 'function') {
    throw new Error('createLegacyExperienceStateBridge requires insertText and scheduleObservers')
  }
  return Object.freeze({
    async commitNarrativeResult({ text, baseRevision, sourceRefs, memoryProjectId, observerContext = null }) {
      const receipt = await insertText({ text, baseRevision, sourceRefs, observerContext })
      const observerSchedule = await scheduleObservers({
        documentRevision: receipt.revision,
        baseRevision,
        text,
        sourceRefs,
        memoryProjectId,
        ...(observerContext && typeof observerContext === 'object' ? observerContext : {})
      })
      // 正文 receipt 与“观察器是否真正接单”是两个阶段。调用方只有在
      // accepted / duplicate 时才能确认自己的 boundary backlog；Agent 关闭或
      // 调度失败时必须保留 backlog，不能因为正文已落盘就误判已观察。
      return Object.freeze({ ...receipt, observerSchedule: observerSchedule || null })
    }
  })
}
