import { randomUUID } from 'node:crypto'
import { normalizeAssistantPermission } from '../../shared/assistantPermission.js'
export function createAssistantPolicyStore({ now = Date.now } = {}) {
  const policies = new Map()
  function prune() { for (const [key, value] of policies) if (value.expiresAt <= now()) policies.delete(key) }
  return {
    set(owner, input) {
      prune()
      const normalized = normalizeAssistantPermission(input, input)
      const key = JSON.stringify([owner, normalized.bookId, normalized.sessionId])
      const previous = policies.get(key)
      if (!previous && policies.size >= 1000) throw new Error('policy-capacity')
      const policy = { ...normalized, policyId: previous?.policyId || randomUUID(), revision: (previous?.revision || 0) + 1, expiresAt: now() + 3600000 }
      policies.set(key, policy)
      return { ...policy }
    },
    get(owner, input) {
      prune()
      const policy = policies.get(JSON.stringify([owner, input.bookId, input.sessionId]))
      return policy && policy.policyId === input.policyId && policy.revision === input.revision ? { ...policy } : null
    },
    revoke(owner, input) { policies.delete(JSON.stringify([owner, input.bookId, input.sessionId])) }
  }
}
