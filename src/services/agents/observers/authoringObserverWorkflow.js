import { normalizeObservation } from './authoringObservationContract'

function exceptionReasonOf(raw) {
  if (raw?.conflictsWith && String(raw.conflictsWith).startsWith('locked:')) return 'locked-conflict'
  if (raw?.destructiveRetcon === true) return 'destructive-retcon'
  if (raw?.ambiguous === true) return 'identity-ambiguity'
  return null
}

export function createAuthoringObserverWorkflow({ derive, applyDerived } = {}) {
  if (typeof derive !== 'function' || typeof applyDerived !== 'function') {
    throw new Error('createAuthoringObserverWorkflow requires derive and applyDerived')
  }
  return Object.freeze({
    async run({ task, request, context }) {
      const derived = await derive({ task, request, envelope: context.envelope })
      const rawObservations = Array.isArray(derived?.observations) ? derived.observations : []
      const routine = []
      const exceptions = []
      for (const raw of rawObservations) {
        const reason = exceptionReasonOf(raw)
        if (reason) {
          exceptions.push({
            observationId: String(raw.id),
            reason,
            text: String(raw.text || ''),
            conflictsWith: raw.conflictsWith ? String(raw.conflictsWith) : null
          })
          continue
        }
        routine.push(normalizeObservation(raw))
      }

      const meta = {
        taskId: String(task?.id || ''),
        baseRevision: String(request?.target?.revision || ''),
        envelope: context.envelope
      }
      let applied = null
      if (routine.length > 0) {
        applied = await applyDerived(routine, meta)
      }
      return {
        status: 'completed',
        taskId: String(task?.id || ''),
        effectPolicy: 'derived-state',
        applied,
        exceptions
      }
    }
  })
}
