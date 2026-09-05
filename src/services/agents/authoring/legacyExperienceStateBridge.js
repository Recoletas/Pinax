export function createLegacyExperienceStateBridge({ insertText, scheduleObservers } = {}) {
  if (typeof insertText !== 'function' || typeof scheduleObservers !== 'function') {
    throw new Error('createLegacyExperienceStateBridge requires insertText and scheduleObservers')
  }
  return Object.freeze({
    async commitNarrativeResult({ text, baseRevision, sourceRefs, memoryProjectId }) {
      const receipt = await insertText({ text, baseRevision, sourceRefs })
      scheduleObservers({
        documentRevision: receipt.revision,
        baseRevision,
        text,
        sourceRefs,
        memoryProjectId
      })
      return receipt
    }
  })
}
