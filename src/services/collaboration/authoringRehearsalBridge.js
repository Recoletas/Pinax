import { canonicalJson, fingerprintJson } from '../../../shared/collaboration/canonicalJson.js'
import {
  validateCollaborableArtifact,
  validatePromotionRequest,
  validateStableLocator
} from '../../../shared/collaboration/contracts.js'
import { toCollaborableArtifact } from '../agents/authoring/authoringCollaborationArtifact.js'
import { selectAuthoringInterventionRehearsalDirection } from '../agents/authoring/authoringInterventionRehearsal.js'
import { createAuthoringInterventionRehearsalRequest } from '../agents/authoring/authoringInterventionRehearsalRun.js'

const REGISTRIES = new WeakSet()
const LIVE_READERS = new WeakMap()

function text (value, limit = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function revision (value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  return text(value, 160)
}

function failure (reason) {
  return Object.freeze({ ok: false, reason })
}

export function resolveAuthoringRehearsalEvidenceAfterReconciliation ({ reconciled, locator, sourceRef } = {}) {
  if (!reconciled?.ok || reconciled.stale || !locator || !sourceRef) return null
  const change = (reconciled.evidenceChanges || []).find(item => String(item.sourceRef || '') === String(sourceRef))
  if (change && !String(change.actual || '')) return null
  return { ...locator, sourceRevision: change ? change.actual : locator.sourceRevision }
}

function deepFreeze (value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.freeze(value)
}

function sameCanonical (left, right) {
  try {
    return canonicalJson(left) === canonicalJson(right)
  } catch {
    return false
  }
}

function exactKeys (value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every(key => keys.includes(key))
}

function validRevisionSet (value, frozen) {
  const keys = Object.keys(frozen || {})
  if (!exactKeys(value, keys)) return false
  return Object.values(value).every(item => (
    (typeof item === 'number' && Number.isSafeInteger(item))
    || (typeof item === 'string' && item.length > 0 && item.length <= 160)
  ))
}

function targetRevision (artifact) {
  return artifact?.target?.nodeRevision
    ?? artifact?.target?.unitRevision
    ?? artifact?.target?.documentRevision
    ?? ''
}

function locatorRevision (locator) {
  return locator?.sourceRevision
    ?? locator?.nodeRevision
    ?? locator?.unitRevision
    ?? locator?.documentRevision
    ?? locator?.artifactRevision
    ?? ''
}

function locatorRevisionFields (locator) {
  return Object.fromEntries(Object.entries(locator || {})
    .filter(([key]) => key === 'sourceRevision' || key.endsWith('Revision'))
    .map(([key, value]) => [key, revision(value)]))
}

function locatorRevisionValue (locator) {
  const fields = locatorRevisionFields(locator)
  const keys = Object.keys(fields)
  if (keys.length === 1 && keys[0] === 'sourceRevision') return fields.sourceRevision
  return keys.length ? fingerprintJson(fields) : ''
}

function locatorIdentity (locator) {
  return Object.fromEntries(Object.entries(locator || {})
    .filter(([key]) => key !== 'sourceRevision' && !key.endsWith('Revision')))
}

function roomIdentity (room) {
  const roomId = text(room?.roomId)
  const shareSessionId = text(room?.shareSessionId)
  const hostEpoch = Number(room?.hostEpoch)
  return roomId && shareSessionId && Number.isSafeInteger(hostEpoch) && hostEpoch > 0
    ? { roomId, shareSessionId, hostEpoch }
    : null
}

function proposalSnapshot (proposal) {
  const id = text(proposal?.id)
  const baseRevision = revision(proposal?.baseRevision)
  if (!id || proposal?.status !== 'selected' || baseRevision === ''
    || !validateStableLocator(proposal?.target).valid) return null
  return deepFreeze(JSON.parse(canonicalJson({ id, status: 'selected', target: proposal.target, baseRevision })))
}

function proposalMatches (proposal, frozen) {
  const current = proposalSnapshot(proposal)
  return Boolean(current && sameCanonical(current, frozen))
}

function proposalKey (room, proposal) {
  const identity = roomIdentity(room)
  const proposalId = text(proposal?.id)
  return identity && proposalId
    ? canonicalJson({ ...identity, proposalId })
    : ''
}

function attemptKey ({ room, proposal, directionSetArtifact, generationRequestId }) {
  const owner = proposalKey(room, proposal)
  const requestId = text(generationRequestId)
  return owner && requestId && verifyCollaborableArtifactFingerprint(directionSetArtifact)
    ? canonicalJson({
        owner,
        artifactId: directionSetArtifact.artifactId,
        artifactFingerprint: directionSetArtifact.fingerprint,
        generationRequestId: requestId
      })
    : ''
}

function resultFromRunner (value) {
  if (value?.ok === true && value.result) return value.result
  return value?.kind === 'authoring-intervention-rehearsal-result' ? value : null
}

function validateDirectionBinding (binding, artifact) {
  if (!exactKeys(binding, ['kind', 'directionId', 'directionSetArtifactFingerprint'])) return null
  if (binding.kind !== 'authoring-rehearsal-direction-proposal'
    || binding.directionSetArtifactFingerprint !== artifact?.fingerprint) return null
  return artifact?.visiblePayload?.directions?.find(item => item?.directionId === binding.directionId) || null
}

function validateGenerationSource ({ room, proposal, proposalBinding, directionSetArtifact, generationRequestId, session, scope }) {
  if (proposal?.status !== 'selected'
    || directionSetArtifact?.kind !== 'direction-set'
    || !verifyCollaborableArtifactFingerprint(directionSetArtifact)
    || !sameCanonical(proposal.target, directionSetArtifact.target)
    || String(proposal.baseRevision) !== String(targetRevision(directionSetArtifact))
    || !text(generationRequestId)
    || !validateDirectionBinding(proposalBinding, directionSetArtifact)) return null
  const rebuilt = toCollaborableArtifact({ kind: 'direction-set', session, scope })
  if (!roomIdentity(room) || !rebuilt.ok || rebuilt.artifact.fingerprint !== directionSetArtifact.fingerprint) return null
  const selected = selectAuthoringInterventionRehearsalDirection(scope, proposalBinding.directionId)
  return selected.ok ? selected.selection : null
}

async function invokeRunner (runner, session, selection) {
  if (typeof runner === 'function') return runner({ session, selection })
  return runner.run({ session, selection })
}

async function readLiveAttestation (liveReader, record) {
  const owners = LIVE_READERS.get(liveReader)
  if (!owners) return null
  const descriptors = new Map()
  const add = (kind, locator) => {
    const key = fingerprintJson(locator)
    const existing = descriptors.get(key)
    if (existing && !sameCanonical(existing.locator, locator)) return false
    if (!existing) descriptors.set(key, { kind, locator })
    return true
  }
  if (!add('target', record.artifact.target)) return null
  for (const item of record.artifact.visiblePayload?.preview || []) {
    if (!add('target', item?.target)) return null
  }
  for (const locator of record.artifact.evidenceRefs || []) {
    if (!add('evidence', locator)) return null
  }
  const revisions = {}
  let mainCurrent = null
  try {
    for (const descriptor of descriptors.values()) {
      const current = descriptor.kind === 'target'
        ? await owners.readTarget(descriptor.locator)
        : await owners.readEvidence(descriptor.locator)
      if (!validateStableLocator(current).valid
        || !sameCanonical(locatorIdentity(current), locatorIdentity(descriptor.locator))) return null
      const frozenFields = locatorRevisionFields(descriptor.locator)
      const currentFields = locatorRevisionFields(current)
      if (!Object.keys(frozenFields).length
        || !sameCanonical(Object.keys(frozenFields).sort(), Object.keys(currentFields).sort())
        || Object.values(currentFields).some(value => value === '')) return null
      revisions[`locator:${fingerprintJson(descriptor.locator)}`] = locatorRevisionValue(current)
      if (sameCanonical(descriptor.locator, record.artifact.target)) mainCurrent = current
    }
  } catch {
    return null
  }
  const liveTargetRevision = revision(locatorRevision(mainCurrent))
  if (!validRevisionSet(revisions, record.artifact.sourceRevisions) || liveTargetRevision === '') return null
  return Object.freeze({
    revisions: Object.freeze(revisions),
    liveTargetRevision,
    fingerprint: fingerprintJson(revisions)
  })
}

export function createAuthoringRehearsalLiveReader ({ readTarget, readEvidence } = {}) {
  if (typeof readTarget !== 'function' || typeof readEvidence !== 'function') {
    throw new TypeError('authoring rehearsal live reader requires target and evidence owners')
  }
  const reader = Object.freeze({})
  LIVE_READERS.set(reader, Object.freeze({ readTarget, readEvidence }))
  return reader
}

export function createAuthoringDirectionProposalBinding ({ directionSetArtifact, directionId } = {}) {
  const normalizedId = text(directionId, 120)
  if (directionSetArtifact?.kind !== 'direction-set'
    || !verifyCollaborableArtifactFingerprint(directionSetArtifact)
    || !directionSetArtifact.visiblePayload?.directions?.some(item => item?.directionId === normalizedId)) {
    return failure('collaboration-direction-proposal-invalid')
  }
  return Object.freeze({
    ok: true,
    binding: Object.freeze({
      kind: 'authoring-rehearsal-direction-proposal',
      directionId: normalizedId,
      directionSetArtifactFingerprint: directionSetArtifact.fingerprint
    })
  })
}

export function createAuthoringRehearsalHostRegistry ({ runRehearsal, liveReader } = {}) {
  if ((typeof runRehearsal !== 'function' && typeof runRehearsal?.run !== 'function')
    || !LIVE_READERS.has(liveReader)) {
    throw new TypeError('authoring rehearsal host registry requires F3 runner and live revision reader')
  }
  const attempts = new Map()
  const proposalOwners = new Map()
  const records = new Map()
  const sources = new WeakMap()

  function registerSource (input = {}) {
    if (!exactKeys(input, ['session', 'scope'])) return failure('collaboration-source-invalid')
    const { session, scope } = input
    const establishedImpactGroups = (Array.isArray(session?.impactGroups) ? session.impactGroups : [])
      .filter(group => group?.status === 'established')
    if (!establishedImpactGroups.length) {
      return Object.freeze({ ok: false, reason: 'collaboration-source-invalid', impactGroupArtifacts: Object.freeze([]) })
    }
    const intervention = toCollaborableArtifact({ kind: 'intervention', session, scope })
    const directions = toCollaborableArtifact({ kind: 'direction-set', session, scope })
    const impacts = establishedImpactGroups
      .map(impactGroup => toCollaborableArtifact({ kind: 'impact-group', session, scope, impactGroup }))
    if (!intervention.ok || !directions.ok
      || impacts.some(item => !item.ok)
      || directions.artifact.visiblePayload?.interventionArtifactFingerprint !== intervention.artifact.fingerprint) {
      return failure('collaboration-source-invalid')
    }
    const impactGroupArtifacts = Object.freeze(impacts.map(item => item.artifact))
    const sourceHandle = Object.freeze({})
    sources.set(sourceHandle, Object.freeze({
      session,
      scope,
      interventionArtifact: intervention.artifact,
      directionSetArtifact: directions.artifact,
      impactGroupArtifacts
    }))
    return Object.freeze({
      ok: true,
      sourceHandle,
      interventionArtifact: intervention.artifact,
      directionSetArtifact: directions.artifact,
      impactGroupArtifacts
    })
  }

  function getSourceArtifacts (sourceHandle) {
    const source = sources.get(sourceHandle)
    if (!source) return failure('collaboration-generation-source-invalid')
    const currentIntervention = toCollaborableArtifact({ kind: 'intervention', session: source.session, scope: source.scope })
    const currentDirections = toCollaborableArtifact({ kind: 'direction-set', session: source.session, scope: source.scope })
    const currentImpacts = (Array.isArray(source.session?.impactGroups) ? source.session.impactGroups : [])
      .filter(group => group?.status === 'established')
      .map(impactGroup => toCollaborableArtifact({ kind: 'impact-group', session: source.session, scope: source.scope, impactGroup }))
    if (!currentIntervention.ok || !currentDirections.ok || currentImpacts.some(item => !item.ok)
      || currentIntervention.artifact.fingerprint !== source.interventionArtifact.fingerprint
      || currentDirections.artifact.fingerprint !== source.directionSetArtifact.fingerprint
      || !sameCanonical(currentImpacts.map(item => item.artifact.fingerprint), source.impactGroupArtifacts.map(item => item.fingerprint))) {
      return failure('collaboration-generation-source-invalid')
    }
    return Object.freeze({
      ok: true,
      interventionArtifact: source.interventionArtifact,
      directionSetArtifact: source.directionSetArtifact,
      impactGroupArtifacts: source.impactGroupArtifacts
    })
  }

  async function runSelectedProposal (input = {}) {
    const allowedKeys = [
      'actorRole', 'room', 'proposal', 'proposalBinding',
      'generationRequestId', 'sourceHandle'
    ]
    if (!exactKeys(input, allowedKeys)) return failure('collaboration-generation-source-invalid')
    const {
      actorRole, room, proposal, proposalBinding,
      generationRequestId, sourceHandle
    } = input
    if (actorRole !== 'host') return failure('collaboration-generation-host-required')
    const source = sources.get(sourceHandle)
    if (!source) return failure('collaboration-generation-source-invalid')
    const { session, scope, directionSetArtifact } = source
    const currentIntervention = toCollaborableArtifact({ kind: 'intervention', session, scope })
    const currentDirections = toCollaborableArtifact({ kind: 'direction-set', session, scope })
    if (!currentIntervention.ok || !currentDirections.ok
      || currentIntervention.artifact.fingerprint !== source.interventionArtifact.fingerprint
      || currentDirections.artifact.fingerprint !== directionSetArtifact.fingerprint) {
      return failure('collaboration-generation-source-invalid')
    }
    const selection = validateGenerationSource({
      room, proposal, proposalBinding, directionSetArtifact,
      generationRequestId, session, scope
    })
    if (!selection) return failure('collaboration-generation-source-invalid')
    const canonicalRequest = createAuthoringInterventionRehearsalRequest({ session, selection })
    if (!canonicalRequest.ok) return failure('collaboration-generation-source-invalid')
    const frozenProposal = proposalSnapshot(proposal)
    const frozenBinding = deepFreeze(JSON.parse(canonicalJson(proposalBinding)))
    if (!frozenProposal) return failure('collaboration-generation-source-invalid')
    const ownerKey = proposalKey(room, proposal)
    const identityKey = attemptKey({ room, proposal, directionSetArtifact, generationRequestId })
    const ownedIdentity = proposalOwners.get(ownerKey)
    if (ownedIdentity && ownedIdentity !== identityKey) {
      return failure('collaboration-generation-already-owned')
    }
    if (attempts.has(identityKey)) return attempts.get(identityKey)
    proposalOwners.set(ownerKey, identityKey)
    const pending = (async () => {
      let runValue
      try {
        runValue = await invokeRunner(runRehearsal, session, selection)
      } catch {
        return failure('collaboration-generation-failed')
      }
      const result = resultFromRunner(runValue)
      if (!result || !sameCanonical(result.request, canonicalRequest.request)) {
        return failure(runValue?.reason || 'collaboration-generation-failed')
      }
      const branch = toCollaborableArtifact({
        kind: 'rehearsal-branch', session, scope, selection, result
      })
      if (!branch.ok) return failure('collaboration-generation-result-invalid')
      const record = Object.freeze({
        room: Object.freeze({ ...roomIdentity(room) }),
        proposal: frozenProposal,
        proposalBinding: frozenBinding,
        directionSetArtifact,
        generationRequestId: text(generationRequestId),
        sourceHandle,
        session,
        scope,
        selection,
        result,
        artifact: branch.artifact
      })
      records.set(identityKey, record)
      return Object.freeze({ ok: true, artifact: branch.artifact, generationRequestId: record.generationRequestId })
    })()
    attempts.set(identityKey, pending)
    return pending
  }

  function recordFor ({ room, proposal, proposalBinding, artifact, generationRequestId }) {
    for (const record of records.values()) {
      if (record.room.roomId === room?.roomId
        && record.room.shareSessionId === room?.shareSessionId
        && record.room.hostEpoch === room?.hostEpoch
        && proposalMatches(proposal, record.proposal)
        && sameCanonical(proposalBinding, record.proposalBinding)
        && verifyCollaborableArtifactFingerprint(artifact)
        && record.artifact.artifactId === artifact.artifactId
        && record.artifact.fingerprint === artifact.fingerprint
        && record.generationRequestId === generationRequestId) return record
    }
    return null
  }

  async function createPromotionRequest ({ room, proposal, proposalBinding, artifact, generationRequestId } = {}) {
    const record = recordFor({ room, proposal, proposalBinding, artifact, generationRequestId })
    if (!record || proposal?.status !== 'selected'
      || !sameCanonical(proposal.target, artifact?.target)
      || String(proposal.baseRevision) !== String(targetRevision(artifact))) {
      return failure('collaboration-promotion-source-invalid')
    }
    const attestation = await readLiveAttestation(liveReader, record)
    if (!attestation
      || !sameCanonical(attestation.revisions, artifact.sourceRevisions)
      || String(attestation.liveTargetRevision) !== String(proposal.baseRevision)) {
      return failure('collaboration-promotion-stale')
    }
    const request = {
      roomId: record.room.roomId,
      shareSessionId: record.room.shareSessionId,
      proposalId: proposal.id,
      artifactId: artifact.artifactId,
      artifactFingerprint: artifact.fingerprint,
      generationRequestId: record.generationRequestId,
      sourceRevisionFingerprint: fingerprintJson(artifact.sourceRevisions),
      liveRevisionFingerprint: attestation.fingerprint,
      hostEpoch: record.room.hostEpoch,
      liveTargetRevision: attestation.liveTargetRevision
    }
    return validatePromotionRequest(request).valid
      ? Object.freeze({ ok: true, request: Object.freeze(request) })
      : failure('collaboration-promotion-request-invalid')
  }

  async function preflightPromotion ({ request, room, proposal, proposalBinding, artifact } = {}) {
    if (!validatePromotionRequest(request).valid) return failure('collaboration-promotion-stale')
    const record = recordFor({
      room,
      proposal,
      proposalBinding,
      artifact,
      generationRequestId: request.generationRequestId
    })
    if (!record
      || proposal?.status !== 'selected'
      || request.roomId !== record.room.roomId
      || request.shareSessionId !== record.room.shareSessionId
      || request.hostEpoch !== record.room.hostEpoch
      || request.proposalId !== proposal.id
      || request.artifactId !== artifact.artifactId
      || request.artifactFingerprint !== artifact.fingerprint
      || request.sourceRevisionFingerprint !== fingerprintJson(artifact.sourceRevisions)
      || String(request.liveTargetRevision) !== String(proposal.baseRevision)
      || !verifyCollaborableArtifactFingerprint(artifact)
      || artifact.kind !== 'rehearsal-branch') return failure('collaboration-promotion-stale')
    const attestation = await readLiveAttestation(liveReader, record)
    if (!attestation
      || request.liveRevisionFingerprint !== attestation.fingerprint
      || !sameCanonical(attestation.revisions, artifact.sourceRevisions)
      || String(attestation.liveTargetRevision) !== String(request.liveTargetRevision)) {
      return failure('collaboration-promotion-stale')
    }
    return Object.freeze({
      ok: true,
      session: record.session,
      scope: record.scope,
      selection: record.selection,
      result: record.result,
      ghostIds: Object.freeze(record.result.drafts.map(draft => draft.id))
    })
  }

  const registry = Object.freeze({ registerSource, getSourceArtifacts, runSelectedProposal, createPromotionRequest, preflightPromotion })
  REGISTRIES.add(registry)
  return registry
}

export function verifyCollaborableArtifactFingerprint (value) {
  if (!validateCollaborableArtifact(value).valid) return false
  const { fingerprint, ...unsigned } = value
  return fingerprintJson(unsigned) === fingerprint
}

export function serializeCollaborableArtifact (value) {
  if (!verifyCollaborableArtifactFingerprint(value)) throw new TypeError('collaborable-artifact-invalid')
  return canonicalJson(value)
}

export function parseCollaborableArtifact (serialized) {
  try {
    const value = JSON.parse(String(serialized))
    return verifyCollaborableArtifactFingerprint(value)
      ? Object.freeze({ ok: true, artifact: deepFreeze(value) })
      : failure('collaborable-artifact-invalid')
  } catch {
    return failure('collaborable-artifact-json-invalid')
  }
}

export async function createCollaborationPromotionRequest ({ registry, ...input } = {}) {
  return REGISTRIES.has(registry)
    ? registry.createPromotionRequest(input)
    : failure('collaboration-promotion-registry-required')
}

export async function preflightAuthoringRehearsalPromotion ({ registry, ...input } = {}) {
  return REGISTRIES.has(registry)
    ? registry.preflightPromotion(input)
    : failure('collaboration-promotion-registry-required')
}

export function getAuthoringRehearsalSourceArtifacts ({ registry, sourceHandle } = {}) {
  return REGISTRIES.has(registry)
    ? registry.getSourceArtifacts(sourceHandle)
    : failure('collaboration-source-registry-required')
}

export { toCollaborableArtifact }
