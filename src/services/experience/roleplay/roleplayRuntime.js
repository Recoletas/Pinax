// Branch gameplay only. Pending actions, receipts and archive outbox are
// session audit data and must survive branch switching without duplication.
const FIELDS = ['scenario', 'scenarioRun', 'resources', 'hostPlan', 'companion', 'actor']
const clone = value => JSON.parse(JSON.stringify(value ?? null))

export function captureRoleplayRuntime(state) {
  return state ? Object.fromEntries(FIELDS.map(key => [key, clone(state[key])])) : null
}

export function restoreRoleplayRuntime(runtime, state) {
  // Legacy snapshots predate this projection; no invented historical state.
  if (runtime === undefined || !state) return state ?? null
  return { ...state, ...Object.fromEntries(FIELDS.map(key => [key, clone(runtime?.[key])])) }
}
