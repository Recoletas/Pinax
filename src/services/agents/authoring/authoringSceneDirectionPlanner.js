// F1-2 production transport for the one-shot direction planner. The input is
// already a frozen laboratory planning request; this adapter only serializes
// its manifest blocks and never exposes tools or repositories.

import { requestAdvisorTask } from '../../advisorTaskService.js'
import { buildContextEnvelope, clipContextEnvelope } from '../agentContextEnvelope.js'

const TASK_ID = 'authoring.scene.directions'
const MAX_CONTEXT_CHARS = 16000

function text(value) {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function envelopeKind(block = {}) {
  const kind = text(block.kind)
  if (kind === 'manuscript-unit') return 'selection'
  if (kind === 'scene-projection' || kind === 'scene-intent') return 'scene'
  if (kind === 'worldbook-entry') return 'worldbook'
  if (kind === 'memory') return 'memory'
  if (kind === 'outline-node') return 'outline'
  if (['exploration-doc', 'narrative-asset', 'author-reference'].includes(kind)) return 'references'
  if (kind.includes('character')) return 'character'
  if (kind.includes('location') || kind.includes('place')) return 'location'
  if (kind.includes('style')) return 'style'
  if (kind.includes('rule')) return 'rules'
  return 'history'
}

function buildPressureBlock(projection = {}) {
  return {
    kind: 'scene',
    priority: 1000,
    content: JSON.stringify({
      availability: projection.availability,
      participants: projection.participants,
      location: projection.location,
      pressureSeeds: projection.pressureSeeds,
      allowedEvidenceRefs: projection.evidence.flatMap((item) => [item.ref, ...list(item.sourceRefs)]),
      allowedEntityRefs: [
        ...projection.participants.map((item) => item.ref),
        ...(projection.location ? [projection.location.ref] : [])
      ]
    }),
    sourceRefs: projection.evidence.flatMap((item) => [item.ref, ...list(item.sourceRefs)])
  }
}

export function buildAuthoringSceneDirectionEnvelope(planningRequest = {}) {
  const manifest = planningRequest.contextManifest || {}
  const target = manifest.target || {}
  const blocks = [
    buildPressureBlock(planningRequest.pressureProjection || {}),
    ...list(manifest.blocks).map((block, index) => ({
      kind: envelopeKind(block),
      priority: 900 - index,
      content: text(block.text),
      sourceRefs: list(block.sourceRefs)
    }))
  ]
  return clipContextEnvelope(buildContextEnvelope({
    surface: 'authoring',
    projectId: target.projectId,
    target: {
      type: 'writing-unit',
      id: target.unitId,
      revision: planningRequest.sessionFingerprint
    },
    blocks,
    budget: { maxChars: MAX_CONTEXT_CHARS }
  }), MAX_CONTEXT_CHARS)
}

export async function planAuthoringSceneDirections(planningRequest, { signal = null } = {}) {
  if (planningRequest?.kind !== 'authoring-scene-direction-planning-request'
    || planningRequest?.toolPolicy?.allowTools !== false
    || planningRequest?.toolPolicy?.toolChoice !== 'none') {
    const error = new Error('invalid scene direction planning request')
    error.code = 'SCENE_DIRECTION_REQUEST_INVALID'
    error.retryable = false
    throw error
  }
  const result = await requestAdvisorTask({
    envelope: buildAuthoringSceneDirectionEnvelope(planningRequest),
    question: planningRequest.instruction || '核对本场压力，并给出二至三个具有真实取舍的因果方向。',
    taskType: TASK_ID,
    scope: 'writing',
    mode: 'direct',
    options: {
      toolChoice: 'none',
      maxOutputChars: planningRequest.outputPolicy?.maxChars || 2400
    },
    signal
  })
  return result.advice
}

export default planAuthoringSceneDirections
