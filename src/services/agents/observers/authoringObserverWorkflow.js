import {
  normalizeAuthoringObserverProvenance,
  normalizeAuthoringObserverTarget,
  normalizeObservation
} from './authoringObservationContract'

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
      const routineInputs = []
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
        routineInputs.push(raw)
      }

      const requestTarget = request?.target || {}
      const requestProvenance = request?.intent?.provenance || {}
      const target = normalizeAuthoringObserverTarget({
        ...(requestProvenance.target || {}),
        ...requestTarget,
        projectId: requestProvenance.projectId || requestTarget.projectId,
        documentId: requestProvenance.documentId || requestTarget.documentId || requestTarget.id,
        chapterId: requestProvenance.chapterId || requestTarget.chapterId,
        unitId: requestProvenance.unitId || requestTarget.unitId,
        unitRevision: requestProvenance.unitRevision ?? requestTarget.unitRevision,
        sourceDocumentRevision: requestProvenance.sourceDocumentRevision || requestTarget.sourceDocumentRevision
      })
      const provenance = normalizeAuthoringObserverProvenance({
        ...requestProvenance,
        target
      }, target)
      const routine = routineInputs.map((raw) => normalizeObservation(raw, { provenance, target }))
      const meta = {
        taskId: String(task?.id || ''),
        baseRevision: String(request?.target?.revision || ''),
        target,
        provenance,
        envelope: context.envelope
      }
      let applied = null
      if (routine.length > 0) {
        if (typeof context?.isCurrent === 'function' && !context.isCurrent()) {
          return {
            status: 'stale',
            taskId: String(task?.id || ''),
            effectPolicy: 'derived-state',
            applied: null,
            exceptions: []
          }
        }
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
