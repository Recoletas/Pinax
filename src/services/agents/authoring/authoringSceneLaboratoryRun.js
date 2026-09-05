// F1-2: one memory-only laboratory preparation. It freezes one C1 session,
// derives pressure, and permits at most one tool-free structured planning call.

import { buildAuthoringScenePressureProjection } from './authoringScenePressureProjection.js'
import {
  AUTHORING_SCENE_DIRECTION_LIMITS,
  parseAuthoringSceneDirectionSet
} from './authoringSceneDirectionSet.js'
import { reconcileManifestDependencies } from '../context/contextManifestLifecycle.js'

function text(value) {
  return String(value ?? '').trim()
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function fingerprint(prefix, value) {
  const source = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function failure(reason, details = {}) {
  return deepFreeze({ ok: false, reason: text(reason) || 'scene-laboratory-run-failed', ...details })
}

function plannerRequest(session, projection, instruction) {
  return deepFreeze({
    kind: 'authoring-scene-direction-planning-request',
    version: 1,
    sessionFingerprint: projection.sessionFingerprint,
    pressureFingerprint: projection.fingerprint,
    instruction: text(instruction),
    pressureProjection: projection,
    contextManifest: session.manifest,
    toolPolicy: { allowTools: false, toolChoice: 'none' },
    outputPolicy: {
      format: 'json',
      maxChars: AUTHORING_SCENE_DIRECTION_LIMITS.maxOutputChars,
      directionCount: [AUTHORING_SCENE_DIRECTION_LIMITS.min, AUTHORING_SCENE_DIRECTION_LIMITS.max]
    }
  })
}

export function createAuthoringSceneLaboratoryRun({ prepareSession, planDirections } = {}) {
  async function planPrepared({ session, pressureProjection, instruction = '', signal = null, onPhase = null } = {}) {
    if (session?.kind !== 'authoring-run-session' || !Object.isFrozen(session)) {
      return failure('scene-session-not-frozen')
    }
    if (pressureProjection?.kind !== 'authoring-scene-pressure-projection'
      || pressureProjection.sessionFingerprint !== session.manifest?.fingerprint) {
      return failure('scene-pressure-session-mismatch')
    }
    if (typeof planDirections !== 'function') return failure('scene-direction-planner-unavailable', {
      session,
      pressureProjection
    })

    if (typeof onPhase === 'function') onPhase('planning-directions')
    let output
    try {
      output = await planDirections(plannerRequest(
        session,
        pressureProjection,
        instruction
      ), { signal })
    } catch (error) {
      return failure('scene-direction-planning-failed', {
        cause: text(error?.code || error?.name || 'unexpected-error'),
        session,
        pressureProjection
      })
    }
    const raw = output?.structuredOutput ?? output?.output ?? output?.text ?? output
    const parsed = parseAuthoringSceneDirectionSet(raw, pressureProjection)
    if (!parsed.ok) return failure(parsed.reason, {
      ...(parsed.missing ? { missing: parsed.missing } : {}),
      session,
      pressureProjection
    })
    return deepFreeze({
      ok: true,
      run: {
        kind: 'authoring-scene-laboratory-run',
        version: 1,
        phase: 'ready',
        target: session.target,
        runSession: session,
        pressureProjection,
        directionSet: parsed.directionSet,
        selectedDirectionId: '',
        failure: null
      }
    })
  }

  async function prepare({ taskId = 'authoring.advance', request = {}, signal = null, onPhase = null } = {}) {
    if (typeof prepareSession !== 'function') return failure('scene-session-preparer-unavailable')
    if (typeof onPhase === 'function') onPhase('preparing-context')
    let prepared
    try {
      prepared = await prepareSession({ taskId, request })
    } catch (error) {
      return failure('scene-session-prepare-threw', { cause: text(error?.code || error?.name) })
    }
    if (!prepared?.ok || prepared.session?.kind !== 'authoring-run-session') {
      return failure('scene-session-prepare-failed', { cause: text(prepared?.reason) })
    }
    const session = prepared.session
    if (!Object.isFrozen(session)) return failure('scene-session-not-frozen')
    const pressure = buildAuthoringScenePressureProjection(session)
    if (!pressure.ok) return pressure
    const pressureProjection = pressure.projection
    if (pressureProjection.availability !== 'ready') {
      return deepFreeze({
        ok: true,
        run: {
          kind: 'authoring-scene-laboratory-run',
          version: 1,
          phase: pressureProjection.availability === 'conflict' ? 'failed' : 'insufficient',
          target: session.target,
          runSession: session,
          pressureProjection,
          directionSet: null,
          selectedDirectionId: '',
          failure: pressureProjection.availability === 'conflict'
            ? { reason: 'scene-pressure-conflict' }
            : { reason: 'insufficient-evidence' }
        }
      })
    }
    return planPrepared({
      session,
      pressureProjection,
      instruction: request?.intent?.instruction,
      signal,
      onPhase
    })
  }

  async function retryDirections({ session, pressureProjection, instruction = '', signal = null, onPhase = null } = {}) {
    return planPrepared({ session, pressureProjection, instruction, signal, onPhase })
  }

  return Object.freeze({ prepare, retryDirections })
}

export function selectAuthoringSceneLaboratoryDirection(run, directionId) {
  if (run?.kind !== 'authoring-scene-laboratory-run' || !run?.directionSet) {
    return failure('scene-laboratory-run-invalid')
  }
  const id = text(directionId)
  if (!run.directionSet.directions.some((direction) => direction.id === id)) {
    return failure('scene-direction-selection-invalid', { directionId: id })
  }
  return deepFreeze({
    ok: true,
    run: { ...run, phase: 'direction-selected', selectedDirectionId: id }
  })
}

// F1-5: only the selected direction crosses into the prose turn. The other
// alternatives remain UI-only and are deliberately absent from this frozen
// contract, the prompt and the receipt.
export function buildAuthoringSceneLaboratorySelection(run) {
  if (run?.kind !== 'authoring-scene-laboratory-run' || !run?.runSession || !run?.directionSet) {
    return failure('scene-laboratory-run-invalid')
  }
  const direction = run.directionSet.directions.find((item) => item.id === run.selectedDirectionId)
  if (!direction) return failure('scene-direction-selection-missing')
  const selection = {
    kind: 'authoring-scene-direction-selection',
    version: 1,
    id: direction.id,
    title: direction.title,
    action: direction.action,
    immediateGain: direction.immediateGain,
    cost: direction.cost,
    evidenceRefs: [...direction.evidenceRefs],
    entityRefs: [...direction.entityRefs],
    sessionFingerprint: run.runSession.manifest.fingerprint,
    directionSetFingerprint: run.directionSet.fingerprint
  }
  selection.fingerprint = fingerprint('scene-direction-selection', selection)
  return deepFreeze({ ok: true, selection })
}

export async function validateAuthoringSceneLaboratoryRun(run, collectLiveDependencies) {
  const selected = buildAuthoringSceneLaboratorySelection(run)
  if (!selected.ok) return selected
  if (typeof collectLiveDependencies !== 'function') {
    return failure('scene-live-dependency-reader-unavailable')
  }
  let liveDependencies
  try {
    liveDependencies = await collectLiveDependencies(run.runSession)
  } catch (error) {
    return failure('scene-live-dependency-read-failed', {
      cause: text(error?.code || error?.name || 'unexpected-error')
    })
  }
  const dependencyIssues = reconcileManifestDependencies(run.runSession.manifest, liveDependencies)
  if (dependencyIssues.length) {
    return failure('scene-session-stale', { dependencyIssues })
  }
  return deepFreeze({
    ok: true,
    runSession: run.runSession,
    selection: selected.selection
  })
}

export default createAuthoringSceneLaboratoryRun
