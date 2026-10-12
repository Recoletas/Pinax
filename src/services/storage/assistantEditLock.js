let localQueue = Promise.resolve()
export function withAssistantEditLock(action) {
  if (globalThis.navigator?.locks?.request) return navigator.locks.request('pinax-assistant-edit', action)
  const pending = localQueue.then(action, action)
  localQueue = pending.catch(() => {})
  return pending
}
