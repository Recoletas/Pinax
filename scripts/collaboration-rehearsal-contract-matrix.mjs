import assert from 'node:assert/strict'
import process from 'node:process'
import { CollaborationCommandService } from '../server/realtime/v2/commandService.js'
import { emptyCollaborationSnapshot, materializeCollaborationEvent } from '../server/realtime/v2/materializer.js'
import { fingerprintJson } from '../shared/collaboration/canonicalJson.js'
import {
  validatePromotionRequest,
  validatePromotionStatus,
  validateStableLocator
} from '../shared/collaboration/contracts.js'
import { authoringEvidenceLocatorFixtures, legacyStableLocatorFixtures } from '../shared/collaboration/fixtures.js'
import { createCollaborationDomainProjection } from '../src/services/collaboration/domainProjection.js'

let passed = 0
let failed = 0
function check (name, run) {
  try { run(); passed += 1; process.stdout.write(`✓ ${name}\n`) } catch (error) { failed += 1; process.stderr.write(`✗ ${name}\n${error.stack}\n`) }
}

check('all seven F3 evidence locator shapes round-trip exactly', () => {
  assert.equal(authoringEvidenceLocatorFixtures.length, 7)
  for (const locator of authoringEvidenceLocatorFixtures) {
    const roundTrip = JSON.parse(JSON.stringify(locator))
    assert.deepEqual(validateStableLocator(roundTrip), { valid: true, value: roundTrip })
  }
})

check('typed locators reject unknown, incomplete, and provenance fallback fields', () => {
  const manuscript = authoringEvidenceLocatorFixtures[0]
  assert.equal(validateStableLocator({ ...manuscript, unknown: true }).reason, 'locator-path-not-allowed')
  assert.equal(validateStableLocator({ ...manuscript, unitId: undefined }).valid, false)
  assert.equal(validateStableLocator({ ...manuscript, nodeId: 'node', unitId: undefined }).valid, false)
  assert.equal(validateStableLocator({ ...authoringEvidenceLocatorFixtures[4], sourceRef: 'node:private' }).reason, 'locator-path-not-allowed')
})

check('persisted no-kind C2 locator semantics remain backward compatible', () => {
  for (const locator of legacyStableLocatorFixtures) assert.equal(validateStableLocator(locator).valid, true)
  assert.equal(validateStableLocator({ artifactId: 'x', artifactRevision: 1, unknown: true }).reason, 'locator-path-not-allowed')
  assert.equal(validateStableLocator({ memoryId: 'memory-1', sourceRevision: 'r1' }).reason, 'locator-path-not-allowed')
  assert.equal(validateStableLocator({ chapterId: 'chapter-1', sourceRevision: 'r1' }).reason, 'locator-path-not-allowed')
})

const revisions = Object.freeze({
  'target:chapter-1:unit-2:node-4': 7,
  'target:chapter-2:unit-9:node-3': 11,
  'evidence:worldbook-1:entry-2': 'worldbook-r4'
})
const sourceRevisionFingerprint = fingerprintJson(revisions)
const promotionRequest = Object.freeze({
  roomId: 'room-1',
  shareSessionId: 'share-1',
  proposalId: 'proposal-1',
  artifactId: 'branch-1',
  artifactFingerprint: fingerprintJson({ branch: 1 }),
  generationRequestId: 'generation-1',
  sourceRevisionFingerprint,
  liveRevisionFingerprint: sourceRevisionFingerprint,
  hostEpoch: 2,
  liveTargetRevision: 7
})

check('promotion request binds artifact, generation, and complete multi-source revision set', () => {
  assert.equal(validatePromotionRequest(promotionRequest).valid, true)
  for (const key of ['artifactId', 'generationRequestId', 'sourceRevisionFingerprint', 'liveRevisionFingerprint']) {
    const value = { ...promotionRequest }; delete value[key]
    assert.equal(validatePromotionRequest(value).valid, false, key)
  }
  assert.equal(validatePromotionRequest({ ...promotionRequest, liveRevisionFingerprint: fingerprintJson({ ...revisions, 'target:chapter-2:unit-9:node-3': 12 }) }).valid, true)
  assert.equal(validatePromotionRequest({ ...promotionRequest, unknown: true }).reason, 'promotion-schema-invalid')
})

check('promotion receipt is exact and low-sensitive', () => {
  const adopted = { proposalId: 'proposal-1', artifactFingerprint: promotionRequest.artifactFingerprint, status: 'adopted', receipt: { code: 'adopted', targetCount: 2 } }
  assert.equal(validatePromotionStatus(adopted).valid, true)
  assert.equal(validatePromotionStatus({ ...adopted, receipt: { ...adopted.receipt, targetTitle: '正文标题' } }).valid, false)
  assert.equal(validatePromotionStatus({ ...adopted, receipt: { ...adopted.receipt, ghost: { text: 'leak' } } }).valid, false)
  assert.equal(validatePromotionStatus({ ...adopted, status: 'stale' }).valid, false)
})

function event (seq, type, payload) {
  return { seq, type, payload, actorId: 'host-1', actorDisplayName: 'Host', createdAt: `2030-01-01T00:00:0${seq}.000Z` }
}

check('materializer and client projection expose generation and promotion terminal states', () => {
  const room = { roomId: 'room-1', roomKind: 'rehearsal', hostId: 'host-1', hostEpoch: 2 }
  let snapshot = emptyCollaborationSnapshot(room)
  const events = [
    event(1, 'generation.requested', { requestId: 'generation-1', proposalId: 'proposal-1', hostEpoch: 2 }),
    event(2, 'generation.failed', { requestId: 'generation-1', code: 'provider-error', hostEpoch: 2 }),
    event(3, 'generation.requested', { requestId: 'generation-2', proposalId: 'proposal-2', hostEpoch: 2 }),
    event(4, 'generation.stale', { requestId: 'generation-2', code: 'stale-revision', hostEpoch: 2 }),
    event(5, 'proposal.created', { proposal: { id: 'proposal-3', status: 'selected' } }),
    event(6, 'promotion.requested', { ...promotionRequest, proposalId: 'proposal-3' }),
    event(7, 'promotion.status.changed', { proposalId: 'proposal-3', artifactFingerprint: promotionRequest.artifactFingerprint, status: 'adopted', receipt: { code: 'adopted', targetCount: 2 }, hostEpoch: 2 }),
    event(8, 'generation.requested', { requestId: 'generation-3', proposalId: 'proposal-4', hostEpoch: 2 }),
    event(9, 'generation.completed', { requestId: 'generation-3', proposalId: 'proposal-4', hostEpoch: 2 }),
    event(10, 'generation.stale', { requestId: 'generation-3', code: 'stale-revision', hostEpoch: 2 }),
    event(11, 'artifact.published', { shareSessionId: 'share-1', manifestFingerprint: 'manifest-1', hostEpoch: 2, artifact: { artifactId: 'artifact-initial', kind: 'intervention', authority: 'author-frozen', fingerprint: fingerprintJson({ artifact: 'initial' }), baseRevision: 7, target: { artifactId: 'target', artifactRevision: 7 }, sourceRevisions: { source: 7 }, evidenceRefs: [], content: { ciphertextBase64: 'SENTINEL' } } }),
    event(12, 'content.expired', { comments: false, artifacts: true })
  ]
  for (const item of events) snapshot = materializeCollaborationEvent(snapshot, item)
  assert.equal(snapshot.generation.requests['generation-1'].status, 'failed')
  assert.equal(snapshot.generation.requests['generation-2'].status, 'stale')
  assert.equal(snapshot.promotions['proposal-3'].status, 'adopted')
  assert.equal(snapshot.proposals['proposal-3'].status, 'adopted')
  assert.equal(snapshot.generation.requests['generation-3'].status, 'completed')
  assert.equal(snapshot.artifacts['artifact-initial'].content, undefined)
  assert.equal(snapshot.artifacts['artifact-initial'].contentExpiredAt, events[11].createdAt)

  const projection = createCollaborationDomainProjection()
  projection.applySnapshot(emptyCollaborationSnapshot(room))
  for (const item of events) projection.applyEvent(item)
  assert.equal(projection.state.generation.requests['generation-1'].status, 'failed')
  assert.equal(projection.state.generation.requests['generation-2'].status, 'stale')
  assert.equal(projection.state.promotions['proposal-3'].status, 'adopted')
  assert.equal(projection.state.generation.requests['generation-3'].status, 'completed')
  assert.deepEqual(projection.state.artifacts['artifact-initial'], snapshot.artifacts['artifact-initial'])
})

check('domain projection upgrades legacy snapshots without an artifacts collection', () => {
  const legacy = emptyCollaborationSnapshot({ roomId: 'legacy-room' })
  delete legacy.artifacts
  const projection = createCollaborationDomainProjection()
  projection.applySnapshot(legacy)
  assert.deepEqual(projection.state.artifacts, {})
})

check('host-only terminal commands reject reviewer, unknown fields, and stale fences', () => {
  const target = { artifactId: 'branch-target', artifactRevision: 7 }
  const artifact = {
    schemaVersion: 1,
    artifactId: promotionRequest.artifactId,
    kind: 'rehearsal-branch',
    target,
    sourceRevisions: revisions,
    evidenceRefs: [],
    authority: 'derived-plausible',
    fingerprint: promotionRequest.artifactFingerprint,
    baseRevision: 7,
    content: { schemaVersion: 1, encryption: 'aes-256-gcm', nonceBase64: 'AAAAAAAAAAAAAAAA', ciphertextBase64: '', authTagBase64: 'AAAAAAAAAAAAAAAAAAAAAA==' }
  }
  const snapshot = {
    proposals: { 'proposal-1': { id: 'proposal-1', status: 'selected', baseRevision: 7 } },
    generation: { requests: {
      'generation-1': { requestId: 'generation-1', proposalId: 'proposal-1', status: 'completed', hostEpoch: 2, artifact, artifactFingerprint: promotionRequest.artifactFingerprint },
      'generation-terminal-1': { requestId: 'generation-terminal-1', proposalId: 'proposal-terminal-1', status: 'requested', hostEpoch: 2 },
      'generation-terminal-2': { requestId: 'generation-terminal-2', proposalId: 'proposal-terminal-2', status: 'requested', hostEpoch: 2 }
    } },
    promotions: {}
  }
  const room = { roomId: 'room-1', status: 'active', expiresAt: '2031-01-01T00:00:00.000Z', roomKind: 'rehearsal', hostId: 'host-1', hostEpoch: 2, shareSessionId: 'share-1', targetAllowlist: [target], encryptionPolicy: 'aes-256-gcm' }
  const members = { 'host-1': { memberId: 'host-1', role: 'host' }, 'reviewer-1': { memberId: 'reviewer-1', role: 'reviewer' } }
  let seq = 0
  const acceptedTypes = []
  const repository = {
    getRoom: () => room,
    getMember: (_roomId, memberId) => members[memberId],
    isMemberActive: () => true,
    appendAcceptedEvent: ({ type, payload, guard }) => {
      const rejected = guard(snapshot, room)
      if (rejected) return { rejected }
      seq += 1
      acceptedTypes.push(type)
      if (type === 'promotion.requested') snapshot.promotions[payload.proposalId] = { ...payload, status: 'requested' }
      if (type === 'generation.failed') snapshot.generation.requests[payload.requestId].status = 'failed'
      if (type === 'generation.stale') snapshot.generation.requests[payload.requestId].status = 'stale'
      if (type === 'promotion.status.changed') snapshot.promotions[payload.proposalId] = { ...snapshot.promotions[payload.proposalId], ...payload }
      return { ack: { status: 'accepted', seq } }
    }
  }
  const service = new CollaborationCommandService({ repository, clock: () => Date.parse('2030-01-01T00:00:00.000Z') })
  const envelope = (actorId, type, payload, hostEpoch = 2) => ({ protocolVersion: 2, type, commandId: `${type}-${actorId}-${seq}`, roomId: 'room-1', actorId, hostEpoch, payload })
  assert.equal(service.execute(envelope('reviewer-1', 'generation.terminate', { requestId: 'generation-1', status: 'failed', code: 'provider-error' }), { memberId: 'reviewer-1' }).ack.code, 'unauthorized')
  assert.equal(service.execute(envelope('host-1', 'generation.terminate', { requestId: 'generation-1', status: 'failed', code: 'provider-error', message: 'leak' }), { memberId: 'host-1' }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope('host-1', 'generation.terminate', { requestId: 'generation-terminal-1', status: 'failed', code: 'provider-error' }), { memberId: 'host-1' }).ack.status, 'accepted')
  assert.equal(service.execute(envelope('host-1', 'generation.terminate', { requestId: 'generation-terminal-2', status: 'stale', code: 'stale-revision' }), { memberId: 'host-1' }).ack.status, 'accepted')
  assert.equal(service.execute(envelope('host-1', 'generation.terminate', { requestId: 'generation-terminal-2', status: 'failed', code: 'host-lost' }), { memberId: 'host-1' }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope('host-1', 'promotion.request', { request: { ...promotionRequest, roomId: 'room-other' } }), { memberId: 'host-1' }).ack.code, 'unauthorized')
  assert.equal(service.execute(envelope('host-1', 'promotion.request', { request: { ...promotionRequest, sourceRevisionFingerprint: fingerprintJson({ stale: true }) } }), { memberId: 'host-1' }).ack.code, 'stale-revision')
  const attestedPromotion = { ...promotionRequest, liveRevisionFingerprint: fingerprintJson({ hostLocalRevision: 12 }) }
  assert.equal(service.execute(envelope('host-1', 'promotion.request', { request: attestedPromotion }), { memberId: 'host-1' }).ack.status, 'accepted')
  const status = { proposalId: 'proposal-1', artifactFingerprint: promotionRequest.artifactFingerprint, status: 'rejected', receipt: { code: 'cancelled', targetCount: 2 } }
  assert.equal(service.execute(envelope('reviewer-1', 'promotion.status', status), { memberId: 'reviewer-1' }).ack.code, 'unauthorized')
  assert.equal(service.execute(envelope('host-1', 'promotion.status', { ...status, receipt: { ...status.receipt, text: 'leak' } }), { memberId: 'host-1' }).ack.code, 'invalid-payload')
  snapshot.promotions['proposal-1'].hostEpoch = 1
  assert.equal(service.execute(envelope('host-1', 'promotion.status', status), { memberId: 'host-1' }).ack.code, 'stale-host-epoch')
  snapshot.promotions['proposal-1'].hostEpoch = 2
  assert.equal(service.execute(envelope('host-1', 'promotion.status', status), { memberId: 'host-1' }).ack.status, 'accepted')
  assert.deepEqual(acceptedTypes, ['generation.failed', 'generation.stale', 'promotion.requested', 'promotion.status.changed'])
})

process.stdout.write(`collaboration-rehearsal-contract matrix: ${passed}/${passed + failed} passed\n`)
if (failed) process.exitCode = 1
