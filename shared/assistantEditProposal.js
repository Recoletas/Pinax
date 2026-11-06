import { reserveAssistantCreateIds as reserve } from '@pinax/core/assistantEditProposal'
export { ASSISTANT_EDIT_TOOL, assistantEditSchema, validateAssistantChanges } from '@pinax/core/assistantEditProposal'

function freshAssistantId() {
  if (globalThis.crypto?.randomUUID) return `assistant-${globalThis.crypto.randomUUID()}`
  const parts = globalThis.crypto.getRandomValues(new Uint32Array(4))
  return `assistant-${Array.from(parts, part => part.toString(36)).join('-')}`
}

export function reserveAssistantCreateIds(changes, existing = {}) { return reserve(changes, existing, { idFactory: freshAssistantId }) }
