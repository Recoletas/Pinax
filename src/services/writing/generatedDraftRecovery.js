import { createGeneratedDraftRecovery } from '@pinax/core/usecases/generatedDraftRecovery'
export const { saveGeneratedDraft, readGeneratedDraft, clearGeneratedDraft } = createGeneratedDraftRecovery({ storage: {
  getText: key => globalThis.localStorage.getItem(key),
  setText: (key, value) => globalThis.localStorage.setItem(key, value),
  remove: key => globalThis.localStorage.removeItem(key)
} })
