import { withExclusiveRunLock as runLocked } from '@pinax/core/experience/run/runLock'
export function withExclusiveRunLock(key, fn, options = {}) {
  const lockAdapter = options.lockAdapter || globalThis.navigator?.locks || null
  return runLocked(key, fn, { ...options, lockAdapter })
}
