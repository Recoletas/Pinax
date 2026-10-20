const pendingKinds = new Set()
export const MODEL_CONFIG_EVENT = 'pinax:model-configs-changed'
export function writeModelPreference(storage, key, value, kind) {
  const changed = storage.getItem(key) !== value
  storage.setItem(key, value)
  if (changed && typeof window !== 'undefined' && !pendingKinds.has(kind)) {
    pendingKinds.add(kind)
    queueMicrotask(() => { pendingKinds.delete(kind); window.dispatchEvent(new CustomEvent(MODEL_CONFIG_EVENT, { detail: { kind } })) })
  }
}
