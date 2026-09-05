import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createDecipheriv, createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { adaptExperienceV1Command } from '../server/realtime/experienceV1Adapter.js'
import { SqliteCollaborationRepository } from '../server/repositories/collaboration/SqliteCollaborationRepository.js'
import { CollaborationCommandService } from '../server/realtime/v2/commandService.js'
import { replayCollaborationEvents } from '../server/realtime/v2/materializer.js'
import { CollaborationRateLimiter } from '../server/realtime/v2/security.js'
import { createCollaborationDomainProjection } from '../src/services/collaboration/domainProjection.js'
import { COLLABORATION_LIMITS } from '../shared/collaboration/constants.js'
import { canonicalJson, fingerprintJson, sha256Hex } from '../shared/collaboration/canonicalJson.js'
import { negotiateProtocol, validateCollaborableArtifact, validateEnvelope, validateShareManifest } from '../shared/collaboration/contracts.js'
import { collaborableArtifactFixture, encryptedArtifactFixture, shareManifestFixture, wireCompatibilityFixtures } from '../shared/collaboration/fixtures.js'

const TARGET = collaborableArtifactFixture.target
const EVIDENCE = collaborableArtifactFixture.evidenceRefs[0]
const CIPHER = encryptedArtifactFixture.relay.content
let cipherSequence = 0
function cipherFor(label = `cipher-${++cipherSequence}`) {
  const nonce = createHash('sha256').update(label).digest().subarray(0, 12).toString('base64')
  return { ...CIPHER, nonceBase64: nonce }
}
function artifactFor(label) {
  return {
    ...encryptedArtifactFixture.relay,
    sourceRevisions: { [`locator:${fingerprintJson(encryptedArtifactFixture.relay.target)}`]: 3 },
    expiresAt: null,
    content: cipherFor(`artifact:${label}`)
  }
}
function publishArtifactFor(label, overrides = {}) {
  const target = overrides.target || encryptedArtifactFixture.relay.target
  const evidenceRefs = overrides.evidenceRefs || []
  return {
    ...artifactFor(`publish:${label}`),
    artifactId: `published-${label}`,
    fingerprint: fingerprintJson({ publishedArtifact: label }),
    expiresAt: null,
    target,
    evidenceRefs,
    sourceRevisions: Object.fromEntries([target, ...evidenceRefs].map((locator, index) => [`locator:${fingerprintJson(locator)}`, `r${index + 1}`])),
    ...overrides
  }
}

let passed = 0
const checks = []
function check(name, run) { checks.push({ name, run }) }

function harness({ filename = ':memory:', start = Date.parse('2026-09-02T00:00:00.000Z'), eventQuota = 2000, roomKind = 'rehearsal', rateLimit = true } = {}) {
  const state = { now: start, id: 0, token: 0 }
  const repo = new SqliteCollaborationRepository({
    ...(filename === ':memory:' ? { ephemeral: true } : { filename }),
    clock: () => state.now,
    randomId: prefix => `${prefix}_${String(++state.id).padStart(4, '0')}`,
    randomToken: () => `secret_${String(++state.token).padStart(4, '0')}_with_enough_entropy_for_fixture`,
    secretPepper: 'fixture-pepper'
  })
  const rateLimiter = new CollaborationRateLimiter({ clock: () => state.now })
  const service = new CollaborationCommandService({ repository: repo, clock: () => state.now, randomId: prefix => `${prefix}_${String(++state.id).padStart(4, '0')}`, rateLimiter: rateLimit ? rateLimiter : null })
  const created = repo.createRoom({ roomSlug: `room-${state.id}`, roomKind, hostDisplayName: 'Host', manifestFingerprint: roomKind === 'experience' ? null : 'manifest-1', shareSessionId: roomKind === 'experience' ? null : 'share-1', targetAllowlist: roomKind === 'experience' ? null : [TARGET, EVIDENCE], ttlMs: 7 * 24 * 60 * 60 * 1000, quota: { events: eventQuota } })
  return { state, repo, service, created }
}

function envelope(created, type, commandId, actorId, payload, hostEpoch = 1) {
  return { protocolVersion: 2, type, commandId, roomId: created.room.roomId, actorId, hostEpoch, payload }
}

function proposalPayload(id = 'proposal-1') {
  return { proposal: { id, kind: 'direction', target: TARGET, baseRevision: 3, content: cipherFor(`proposal:${id}`) } }
}

const chatPayload = () => ({ content: cipherFor(), target: TARGET })

function joinReviewer(repo, created, displayName = 'Reviewer') {
  const invite = repo.createInvite(created.room.roomId)
  const joined = repo.joinWithInvite({ roomSlug: created.room.roomSlug, inviteId: invite.inviteId, inviteSecret: invite.inviteSecret, displayName })
  assert.equal(joined.ok, true)
  return { invite, joined }
}

check('canonical JSON, SHA-256, artifact/manifest round-trip', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(sha256Hex(canonicalJson(collaborableArtifactFixture)), createHash('sha256').update(canonicalJson(collaborableArtifactFixture)).digest('hex'))
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}')
  assert.equal(validateCollaborableArtifact(collaborableArtifactFixture).valid, true)
  assert.equal(validateShareManifest(shareManifestFixture).valid, true)
  const roundTrip = JSON.parse(JSON.stringify(collaborableArtifactFixture))
  assert.equal(roundTrip.fingerprint, collaborableArtifactFixture.fingerprint)
  assert.deepEqual(roundTrip.target, collaborableArtifactFixture.target)
  assert.deepEqual(roundTrip.sourceRevisions, collaborableArtifactFixture.sourceRevisions)
  assert.equal(roundTrip.authority, collaborableArtifactFixture.authority)
  assert.equal(fingerprintJson(Object.fromEntries(Object.entries(roundTrip).filter(([key]) => key !== 'fingerprint'))), roundTrip.fingerprint)
})

check('wire compatibility fixtures negotiate current/future/upgrade and adapt v1', () => {
  assert.equal(validateEnvelope(wireCompatibilityFixtures.currentV2).valid, true)
  assert.equal(validateEnvelope(wireCompatibilityFixtures.optionalFutureFields).valid, true)
  assert.equal(negotiateProtocol(wireCompatibilityFixtures.upgradeRequired).code, 'upgrade-required')
  const adapted = adaptExperienceV1Command(wireCompatibilityFixtures.v1Experience, { roomId: 'room-v1', actorId: 'member-v1', hostEpoch: 4 })
  assert.equal(adapted.ok, true)
  assert.equal(adapted.value.type, 'proposal.create')
  assert.equal(adapted.value.payload.proposal.body, '推开门')
  assert.equal(adaptExperienceV1Command({ type: 'chat.send', text: 'missing id' }, { roomId: 'room-v1' }).code, 'invalid-envelope')
  const { repo, service, created } = harness({ roomKind: 'experience' })
  assert.equal(created.room.encryptionPolicy, 'none')
  assert.deepEqual(created.room.targetAllowlist, [{ artifactId: 'experience-runtime', artifactRevision: 1 }])
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'v1-artifact-publish', created.host.memberId, { shareSessionId: created.room.shareSessionId, manifestFingerprint: created.room.manifestFingerprint, artifact: publishArtifactFor('v1-denied') }), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  const request = adaptExperienceV1Command({ type: 'narrative.request', commandId: 'v1-request', payload: { requestId: 'request-v1', text: '推开门' } }, { roomId: created.room.roomId, actorId: created.host.memberId, manifestFingerprint: created.room.manifestFingerprint, shareSessionId: created.room.shareSessionId })
  assert.equal(service.execute(request.value, { memberId: created.host.memberId }).ack.status, 'accepted')
  const completion = adaptExperienceV1Command({ type: 'narrative.completed', commandId: 'v1-complete', payload: { requestId: 'request-v1', assistantMessage: { role: 'assistant', content: '门开了。' } } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(completion.value, { memberId: created.host.memberId }).ack.status, 'accepted')
  const runtime = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'v1-runtime', payload: { version: 1, paths: ['writingTime'], state: { writingTime: { day: '2' } }, requestId: 'request-v1' } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(runtime.value, { memberId: created.host.memberId }).ack.status, 'accepted')
  const representativeState = {
    writingCharacter: { name: 'User', traits: ['calm'], mood: 50 }, writingTime: { eraId: 'custom', day: '2' },
    worldMapState: { map: { countries: [{ id: 'c1', name: 'C' }] }, currentCountry: 'C', currentCity: '', currentScene: '', placeId: 'p1' },
    placeStates: { p1: { status: 'open', controllerId: 'f1', danger: 10 } }, characterStates: { c1: { status: 'well', alive: true, placeId: 'p1', goal: 'go', mood: 60, knowledgeRefs: [] } },
    characterRelations: { r1: { subjectId: 'c1', objectId: 'c2', kind: 'sibling', status: 'confirmed', sourceRefs: [] } }, canonicalFacts: { f1: { subjectId: 'c1', predicate: 'knows', value: true, status: 'confirmed', confidence: 1, sourceRefs: [] } },
    goals: [{ id: 'g1', title: 'Go', status: 'active', source: 'runtime', updatedAt: 1 }], encounteredCharacters: [{ id: 'c1', name: 'A', gender: '', age: '', traits: [], description: '', goal: '', source: 'runtime', firstSeenAt: 1, lastSeenAt: 1 }],
    factionRelations: { Guild: 10 }, keyChoices: [{ id: 'k1', label: 'Open', source: 'runtime', createdAt: 1 }],
    plotJournal: [{ id: 'j1', chapterId: 'ch1', summary: 'Done', participants: [], locations: [], keyChoices: [], unresolvedHooks: [], sourceMessageIds: [], sourceStartIndex: 0, sourceEndIndex: 1, createdAt: 1 }],
    activities: [{ id: 'a1', title: 'Walk', type: 'event', date: '', placeId: 'p1', createdAt: 1 }]
  }
  const representative = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'v1-runtime-all-roots', payload: { version: 1, paths: Object.keys(representativeState), state: representativeState, requestId: 'request-v1' } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(representative.value, { memberId: created.host.memberId }).ack.status, 'accepted')
  const unsafeRuntime = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'v1-runtime-unsafe', payload: { version: 1, paths: ['providerConfig'], state: { providerConfig: { apiKey: 'secret' } } } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(unsafeRuntime.value, { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  const dangerousState = JSON.parse('{"writingTime":{"constructor":{"apiKey":"secret"}}}')
  const dangerousRuntime = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'v1-runtime-dangerous', payload: { version: 1, paths: ['writingTime'], state: dangerousState, requestId: 'request-v1' } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(dangerousRuntime.value, { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  const duplicatePaths = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'v1-runtime-duplicate-path', payload: { version: 1, paths: ['writingTime', 'writingTime'], state: { writingTime: {} }, requestId: 'request-v1' } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(duplicatePaths.value, { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  const missingRequest = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'v1-runtime-missing-request', payload: { version: 1, paths: ['writingTime'], state: { writingTime: {} } } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(missingRequest.value, { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  const unknownNested = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'v1-runtime-unknown-nested', payload: { version: 1, paths: ['placeStates'], state: { placeStates: { p1: { status: 'ok', providerConfig: 'no' } } }, requestId: 'request-v1' } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(unknownNested.value, { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  const sensitiveRootKey = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'v1-runtime-sensitive-key', payload: { version: 1, paths: ['factionRelations'], state: { factionRelations: { apiKey: 10 } }, requestId: 'request-v1' } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  assert.equal(service.execute(sensitiveRootKey.value, { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  repo.close()
})

check('AES-GCM relay fixture contains neither plaintext nor either client secret', () => {
  const { client, relay } = encryptedArtifactFixture
  const relayJson = JSON.stringify(relay)
  assert.equal(relayJson.includes(client.plaintext), false)
  assert.equal(relayJson.includes(client.contentKeyHex), false)
  assert.equal(relayJson.includes(client.inviteSecret), false)
  assert.notEqual(client.inviteSecret, client.contentKeyHex)
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(client.contentKeyHex, 'hex'), Buffer.from(relay.content.nonceBase64, 'base64'))
  decipher.setAuthTag(Buffer.from(relay.content.authTagBase64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(relay.content.ciphertextBase64, 'base64')), decipher.final()]).toString('utf8')
  assert.equal(plaintext, client.plaintext)
  assert.deepEqual(JSON.parse(plaintext), collaborableArtifactFixture.visiblePayload)
  assert.equal(relay.fingerprint, collaborableArtifactFixture.fingerprint)
})

check('invite hashes, expiry, and revocation do not persist join secrets', () => {
  const { state, repo, created } = harness()
  const revoked = repo.createInvite(created.room.roomId)
  const inviteRow = repo.db.prepare('SELECT secret_hash FROM collaboration_invites WHERE invite_id = ?').get(revoked.inviteId)
  assert.notEqual(inviteRow.secret_hash, revoked.inviteSecret)
  assert.equal(repo.revokeInvite(created.room.roomId, revoked.inviteId).revoked, true)
  assert.equal(repo.joinWithInvite({ roomSlug: created.room.roomSlug, inviteId: revoked.inviteId, inviteSecret: revoked.inviteSecret, displayName: 'A' }).code, 'invite-revoked')
  const expired = repo.createInvite(created.room.roomId, { ttlMs: 10 })
  state.now += 11
  assert.equal(repo.joinWithInvite({ roomSlug: created.room.roomSlug, inviteId: expired.inviteId, inviteSecret: expired.inviteSecret, displayName: 'B' }).code, 'invite-expired')
  repo.close()
})

check('nickname never resumes identity; response-loss retry returns the same rotated token', () => {
  const { repo, created } = harness()
  const first = joinReviewer(repo, created, 'Same Name').joined
  const second = joinReviewer(repo, created, 'Same Name').joined
  assert.notEqual(first.member.memberId, second.member.memberId)
  assert.equal(repo.resumeMember({ roomId: created.room.roomId, memberId: first.member.memberId, resumeToken: 'Same Name' }).code, 'resume-invalid')
  const resumed = repo.resumeMember({ roomId: created.room.roomId, memberId: first.member.memberId, resumeToken: first.resumeToken })
  assert.equal(resumed.ok, true)
  assert.notEqual(resumed.resumeToken, first.resumeToken)
  const replayed = repo.resumeMember({ roomId: created.room.roomId, memberId: first.member.memberId, resumeToken: first.resumeToken })
  assert.equal(replayed.replayed, true)
  assert.equal(replayed.resumeToken, resumed.resumeToken)
  const row = repo.db.prepare('SELECT resume_hash, previous_resume_hash FROM collaboration_members WHERE member_id = ?').get(first.member.memberId)
  assert.notEqual(row.resume_hash, resumed.resumeToken)
  assert.notEqual(row.previous_resume_hash, first.resumeToken)
  repo.close()
})

check('30-second grace preserves host, then deterministic succession increments epoch once', () => {
  const { state, repo, created } = harness()
  const a = joinReviewer(repo, created, 'A').joined
  joinReviewer(repo, created, 'B')
  repo.disconnectMember({ roomId: created.room.roomId, memberId: created.host.memberId })
  state.now += COLLABORATION_LIMITS.disconnectGraceMs - 1
  assert.equal(repo.reconcileLeases(created.room.roomId).hostId, created.host.memberId)
  state.now += 2
  const changed = repo.reconcileLeases(created.room.roomId)
  assert.equal(changed.hostId, a.member.memberId)
  assert.equal(changed.hostEpoch, 2)
  assert.equal(repo.reconcileLeases(created.room.roomId).hostEpoch, 2)
  repo.close()
})

check('host resumes within grace with same identity and no epoch bump', () => {
  const { state, repo, created } = harness()
  repo.disconnectMember({ roomId: created.room.roomId, memberId: created.host.memberId })
  state.now += COLLABORATION_LIMITS.disconnectGraceMs - 1
  const resumed = repo.resumeMember({ roomId: created.room.roomId, memberId: created.host.memberId, resumeToken: created.host.resumeToken })
  assert.equal(resumed.ok, true)
  assert.equal(resumed.member.memberId, created.host.memberId)
  state.now += 2
  const reconciled = repo.reconcileLeases(created.room.roomId)
  assert.equal(reconciled.hostId, created.host.memberId)
  assert.equal(reconciled.hostEpoch, 1)
  repo.close()
})

check('proposal lifecycle and one current vote per member', () => {
  const { repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  const proposal = service.execute(envelope(created, 'proposal.create', 'cmd-proposal', reviewer.memberId, proposalPayload()), { memberId: reviewer.memberId })
  assert.equal(proposal.ack.status, 'accepted')
  service.execute(envelope(created, 'vote.cast', 'cmd-vote-1', reviewer.memberId, { proposalId: 'proposal-1', value: 'up' }), { memberId: reviewer.memberId })
  const duplicateVote = service.execute(envelope(created, 'vote.cast', 'cmd-vote-1', reviewer.memberId, { proposalId: 'proposal-1', value: 'up' }), { memberId: reviewer.memberId })
  assert.equal(duplicateVote.ack.duplicate, true)
  service.execute(envelope(created, 'vote.cast', 'cmd-vote-2', reviewer.memberId, { proposalId: 'proposal-1', value: 'down' }), { memberId: reviewer.memberId })
  assert.equal(Object.keys(repo.getSnapshot(created.room.roomId).votes['proposal-1']).length, 1)
  assert.equal(repo.getSnapshot(created.room.roomId).votes['proposal-1'][reviewer.memberId].value, 'down')
  const selected = service.execute(envelope(created, 'proposal.status', 'cmd-select', created.host.memberId, { proposalId: 'proposal-1', status: 'selected' }), { memberId: created.host.memberId })
  assert.equal(selected.ack.status, 'accepted')
  assert.equal(service.execute(envelope(created, 'proposal.status', 'fabricate-adopted', created.host.memberId, { proposalId: 'proposal-1', status: 'adopted' }), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  const invalid = service.execute(envelope(created, 'proposal.status', 'cmd-reopen', created.host.memberId, { proposalId: 'proposal-1', status: 'open' }), { memberId: created.host.memberId })
  assert.equal(invalid.ack.code, 'conflict')
  repo.close()
})

check('duplicate generation completion is appended exactly once', () => {
  const { repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  service.execute(envelope(created, 'proposal.create', 'completion-proposal', reviewer.memberId, proposalPayload('completion-proposal')), { memberId: reviewer.memberId })
  service.execute(envelope(created, 'proposal.status', 'completion-select', created.host.memberId, { proposalId: 'completion-proposal', status: 'selected' }), { memberId: created.host.memberId })
  service.execute(envelope(created, 'generation.request', 'completion-request', created.host.memberId, { requestId: 'completion-1', proposalId: 'completion-proposal', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
  const payload = { requestId: 'completion-1', proposalId: 'completion-proposal', artifact: artifactFor('completion-1') }
  const command = envelope(created, 'generation.complete', 'completion-command', created.host.memberId, payload)
  const completed = service.execute(command, { memberId: created.host.memberId })
  assert.equal(completed.ack.status, 'accepted', JSON.stringify(completed.ack))
  assert.equal(service.execute(command, { memberId: created.host.memberId }).ack.duplicate, true)
  assert.equal(repo.getEvents(created.room.roomId).filter(event => event.commandId === 'completion-command').length, 1)
  repo.close()
})

check('accepted/rejected ACK and durable duplicate exactly-once survive event retention', () => {
  const { repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  const command = envelope(created, 'proposal.create', 'stable-command', reviewer.memberId, proposalPayload())
  const first = service.execute(command, { memberId: reviewer.memberId })
  const duplicate = service.execute(command, { memberId: reviewer.memberId })
  assert.equal(first.ack.status, 'accepted')
  assert.equal(duplicate.ack.status, 'accepted')
  assert.equal(duplicate.ack.duplicate, true)
  assert.equal(repo.getEvents(created.room.roomId).filter(event => event.commandId === 'stable-command').length, 1)
  repo.pruneEvents(created.room.roomId, first.ack.seq + 1)
  assert.equal(service.execute(command, { memberId: reviewer.memberId }).ack.duplicate, true)
  const rejected = service.execute(envelope(created, 'proposal.status', 'unauthorized-command', reviewer.memberId, { proposalId: 'proposal-1', status: 'selected' }), { memberId: reviewer.memberId })
  assert.equal(rejected.ack.status, 'rejected')
  assert.equal(rejected.ack.code, 'unauthorized')
  repo.close()
})

check('full event replay deep-equals stored snapshot and freezes actor display identity', () => {
  const { repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created, 'Display At Event').joined.member
  service.execute(envelope(created, 'proposal.create', 'replay-proposal', reviewer.memberId, proposalPayload('replay-1')), { memberId: reviewer.memberId })
  service.execute(envelope(created, 'chat.send', 'replay-chat', reviewer.memberId, chatPayload()), { memberId: reviewer.memberId })
  const events = repo.getEvents(created.room.roomId)
  assert.deepEqual(replayCollaborationEvents(events), repo.getSnapshot(created.room.roomId))
  assert.equal(repo.getSnapshot(created.room.roomId).comments.at(-1).actor.displayName, 'Display At Event')
  repo.close()
})

check('1000+ events replay deep-equals materialized snapshot', () => {
  const { repo, service, created } = harness({ eventQuota: 1200, rateLimit: false })
  const reviewer = joinReviewer(repo, created).joined.member
  for (let index = 0; index < 1001; index++) {
    const result = service.execute(envelope(created, 'chat.send', `bulk-${index}`, reviewer.memberId, chatPayload()), { memberId: reviewer.memberId })
    assert.equal(result.ack.status, 'accepted')
  }
  const events = repo.getEvents(created.room.roomId)
  assert.ok(events.length > 1000)
  assert.deepEqual(replayCollaborationEvents(events), repo.getSnapshot(created.room.roomId))
  repo.close()
})

check('restart restores durable room, snapshot, member, and idempotency', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pinax-collaboration-'))
  const filename = join(dir, 'rooms.sqlite')
  try {
    const first = harness({ filename })
    const reviewer = joinReviewer(first.repo, first.created).joined.member
    const command = envelope(first.created, 'proposal.create', 'restart-command', reviewer.memberId, proposalPayload('restart-proposal'))
    const seq = first.service.execute(command, { memberId: reviewer.memberId }).ack.seq
    const roomId = first.created.room.roomId
    first.repo.close()
    const second = new SqliteCollaborationRepository({ filename, clock: () => first.state.now, secretPepper: 'fixture-pepper' })
    assert.equal(second.getRoom(roomId).status, 'active')
    assert.equal(second.getSnapshot(roomId).lastSeq, seq)
    assert.equal(second.getMember(roomId, reviewer.memberId).displayName, 'Reviewer')
    const originalFingerprint = second.db.prepare('SELECT request_fingerprint FROM collaboration_idempotency WHERE room_id = ? AND command_id = ?').get(roomId, 'restart-command').request_fingerprint
    assert.equal(second.appendAcceptedEvent({ roomId, commandId: 'restart-command', requestFingerprint: originalFingerprint, actorId: reviewer.memberId, actorDisplayName: 'Reviewer', type: 'chat.message', payload: { commentId: 'should-not-run', body: 'duplicate' } }).ack.duplicate, true)
    second.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

check('retention gap returns authoritative snapshot and minRetainedSeq', () => {
  const { repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  service.execute(envelope(created, 'proposal.create', 'gap-proposal', reviewer.memberId, proposalPayload('gap-1')), { memberId: reviewer.memberId })
  const last = repo.getSnapshot(created.room.roomId).lastSeq
  repo.pruneEvents(created.room.roomId, last)
  const recovery = repo.getRecovery(created.room.roomId, 1)
  assert.equal(recovery.status, 'snapshot-required')
  assert.equal(recovery.minRetainedSeq, last)
  assert.equal(recovery.snapshot.lastSeq, last + 1)
  assert.equal(repo.getRecovery(created.room.roomId, last - 1).status, 'events')
  repo.close()
})

check('stale host epoch fences privileged commands and late generation completion', () => {
  const { state, repo, service, created } = harness()
  const nextHost = joinReviewer(repo, created, 'Next').joined.member
  service.execute(envelope(created, 'proposal.create', 'host-loss-proposal', nextHost.memberId, proposalPayload('host-loss-proposal')), { memberId: nextHost.memberId })
  service.execute(envelope(created, 'proposal.status', 'host-loss-select', created.host.memberId, { proposalId: 'host-loss-proposal', status: 'selected' }), { memberId: created.host.memberId })
  const requested = service.execute(envelope(created, 'generation.request', 'generation-request', created.host.memberId, { requestId: 'request-1', proposalId: 'host-loss-proposal', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
  assert.equal(requested.ack.status, 'accepted')
  repo.disconnectMember({ roomId: created.room.roomId, memberId: created.host.memberId })
  state.now += COLLABORATION_LIMITS.disconnectGraceMs + 1
  repo.reconcileLeases(created.room.roomId)
  assert.equal(repo.getSnapshot(created.room.roomId).generation.requests['request-1'].status, 'stale')
  const late = service.execute(envelope(created, 'generation.complete', 'late-completion', created.host.memberId, { requestId: 'request-1', proposalId: 'host-loss-proposal', artifact: artifactFor('late-completion') }, 1), { memberId: created.host.memberId })
  assert.equal(late.ack.code, 'unauthorized')
  const newHostLateRequest = service.execute(envelope(created, 'generation.complete', 'new-host-old-request', nextHost.memberId, { requestId: 'request-1', proposalId: 'host-loss-proposal', artifact: artifactFor('new-host-old-request') }, 2), { memberId: nextHost.memberId })
  assert.equal(newHostLateRequest.ack.code, 'conflict')
  repo.close()
})

check('host succession event-stales requested promotions across replay and restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pinax-collaboration-promotion-'))
  const filename = join(dir, 'rooms.sqlite')
  try {
    const first = harness({ filename })
    const { state, repo, service, created } = first
    const nextHost = joinReviewer(repo, created, 'Promotion Successor').joined.member
    service.execute(envelope(created, 'proposal.create', 'promotion-loss-proposal', nextHost.memberId, proposalPayload('promotion-loss')), { memberId: nextHost.memberId })
    service.execute(envelope(created, 'proposal.status', 'promotion-loss-select', created.host.memberId, { proposalId: 'promotion-loss', status: 'selected' }), { memberId: created.host.memberId })
    service.execute(envelope(created, 'generation.request', 'promotion-loss-generation', created.host.memberId, { requestId: 'promotion-loss-generation', proposalId: 'promotion-loss', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
    const artifact = artifactFor('promotion-loss')
    service.execute(envelope(created, 'generation.complete', 'promotion-loss-complete', created.host.memberId, { requestId: 'promotion-loss-generation', proposalId: 'promotion-loss', artifact }), { memberId: created.host.memberId })
    const revisionsFingerprint = fingerprintJson(artifact.sourceRevisions)
    const request = {
      roomId: created.room.roomId,
      shareSessionId: 'share-1',
      proposalId: 'promotion-loss',
      artifactId: artifact.artifactId,
      artifactFingerprint: artifact.fingerprint,
      generationRequestId: 'promotion-loss-generation',
      sourceRevisionFingerprint: revisionsFingerprint,
      liveRevisionFingerprint: fingerprintJson({ hostLocal: 'attested-r7' }),
      hostEpoch: 1,
      liveTargetRevision: 3
    }
    assert.equal(service.execute(envelope(created, 'promotion.request', 'promotion-loss-request', created.host.memberId, { request }), { memberId: created.host.memberId }).ack.status, 'accepted')
    repo.disconnectMember({ roomId: created.room.roomId, memberId: created.host.memberId })
    state.now += COLLABORATION_LIMITS.disconnectGraceMs + 1
    const changed = repo.reconcileLeases(created.room.roomId)
    assert.equal(changed.hostEpoch, 2)
    assert.equal(changed.snapshot.promotions['promotion-loss'].status, 'stale')
    assert.equal(changed.snapshot.proposals['promotion-loss'].status, 'stale')
    const transitionTypes = changed.events.map(event => event.type)
    assert.ok(transitionTypes.indexOf('promotion.status.changed') < transitionTypes.indexOf('room.host.changed'))
    assert.deepEqual(replayCollaborationEvents(repo.getEvents(created.room.roomId)), repo.getSnapshot(created.room.roomId))
    const roomId = created.room.roomId
    repo.close()
    const restarted = new SqliteCollaborationRepository({ filename, clock: () => state.now, secretPepper: 'fixture-pepper' })
    assert.equal(restarted.getSnapshot(roomId).promotions['promotion-loss'].status, 'stale')
    assert.deepEqual(replayCollaborationEvents(restarted.getEvents(roomId)), restarted.getSnapshot(roomId))
    restarted.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

check('role/token/actor spoofing and stale share fences are rejected', () => {
  const { repo, service, created } = harness()
  const spectatorInvite = repo.createInvite(created.room.roomId, { role: 'spectator' })
  const spectator = repo.joinWithInvite({ roomSlug: created.room.roomSlug, inviteId: spectatorInvite.inviteId, inviteSecret: spectatorInvite.inviteSecret, displayName: 'Spectator' }).member
  assert.equal(service.execute(envelope(created, 'proposal.create', 'spectator-write', spectator.memberId, proposalPayload()), { memberId: spectator.memberId }).ack.code, 'unauthorized')
  assert.equal(service.execute(envelope(created, 'chat.send', 'actor-spoof', created.host.memberId, chatPayload()), { memberId: spectator.memberId }).ack.code, 'unauthorized')
  repo.close()
})

check('encrypted rooms reject plaintext, cyclic logical content, and unshared targets', () => {
  const { repo, service, created } = harness()
  assert.equal(created.room.encryptionPolicy, 'aes-256-gcm')
  assert.deepEqual(created.room.targetAllowlist, [TARGET, EVIDENCE])
  const reviewer = joinReviewer(repo, created).joined.member
  assert.equal(service.execute(envelope(created, 'chat.send', 'plaintext-chat', reviewer.memberId, { body: 'leak', target: TARGET }), { memberId: reviewer.memberId }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope(created, 'proposal.create', 'plaintext-proposal', reviewer.memberId, { proposal: { id: 'leak', kind: 'rewrite', target: TARGET, baseRevision: 3, body: 'leak', content: CIPHER } }), { memberId: reviewer.memberId }).ack.code, 'invalid-payload')
  const unknownTarget = { ...TARGET, nodeId: 'unshared-node' }
  assert.equal(service.execute(envelope(created, 'chat.send', 'unknown-target', reviewer.memberId, { content: CIPHER, target: unknownTarget }), { memberId: reviewer.memberId }).ack.code, 'unauthorized')
  const cyclic = { ...collaborableArtifactFixture, fingerprint: 'sha256:bad' }; cyclic.visiblePayload = cyclic
  assert.equal(validateCollaborableArtifact(cyclic).valid, false)
  const allowedEvidence = proposalPayload('allowed-evidence'); allowedEvidence.proposal.evidenceRefs = [EVIDENCE]
  assert.equal(service.execute(envelope(created, 'proposal.create', 'allowed-evidence', reviewer.memberId, allowedEvidence), { memberId: reviewer.memberId }).ack.status, 'accepted')
  const deniedEvidence = proposalPayload('denied-evidence'); deniedEvidence.proposal.evidenceRefs = [{ ...EVIDENCE, nodeId: 'unshared-evidence' }]
  assert.equal(service.execute(envelope(created, 'proposal.create', 'denied-evidence', reviewer.memberId, deniedEvidence), { memberId: reviewer.memberId }).ack.code, 'unauthorized')
  repo.close()
})

check('host-only artifact publish enforces encrypted scope, allowlist, identity, nonce, and quota', () => {
  const { state, repo, service, created } = harness({ rateLimit: false })
  const reviewer = joinReviewer(repo, created).joined.member
  const payloadFor = artifact => ({ shareSessionId: 'share-1', manifestFingerprint: 'manifest-1', artifact })
  const firstArtifact = publishArtifactFor('initial')
  const reviewerPublish = envelope(created, 'artifact.publish', 'artifact-reviewer', reviewer.memberId, payloadFor(firstArtifact))
  assert.equal(service.execute(reviewerPublish, { memberId: reviewer.memberId }).ack.code, 'unauthorized')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-plaintext', created.host.memberId, payloadFor({ ...publishArtifactFor('plaintext'), content: null })), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-outer-field', created.host.memberId, { ...payloadFor(publishArtifactFor('outer-field')), visiblePayload: { leak: true } }), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-inner-field', created.host.memberId, payloadFor({ ...publishArtifactFor('inner-field'), visiblePayload: { leak: true } })), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-branch', created.host.memberId, payloadFor(publishArtifactFor('branch', { kind: 'rehearsal-branch' }))), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-expired-at', created.host.memberId, payloadFor(publishArtifactFor('expired-at', { expiresAt: new Date(state.now).toISOString() }))), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-late-expiry', created.host.memberId, payloadFor(publishArtifactFor('late-expiry', { expiresAt: new Date(state.now + COLLABORATION_LIMITS.defaultArtifactTtlMs + 1).toISOString() }))), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-share', created.host.memberId, { ...payloadFor(publishArtifactFor('share')), shareSessionId: 'wrong' }), { memberId: created.host.memberId }).ack.code, 'stale-revision')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-manifest', created.host.memberId, { ...payloadFor(publishArtifactFor('manifest')), manifestFingerprint: 'wrong' }), { memberId: created.host.memberId }).ack.code, 'stale-revision')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-epoch', created.host.memberId, payloadFor(publishArtifactFor('epoch')), 2), { memberId: created.host.memberId }).ack.code, 'stale-host-epoch')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-target', created.host.memberId, payloadFor(publishArtifactFor('target', { target: { ...TARGET, nodeId: 'unshared-node' } }))), { memberId: created.host.memberId }).ack.code, 'unauthorized')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-evidence', created.host.memberId, payloadFor(publishArtifactFor('evidence', { evidenceRefs: [{ ...EVIDENCE, nodeId: 'unshared-evidence' }] }))), { memberId: created.host.memberId }).ack.code, 'unauthorized')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-raw-revision', created.host.memberId, payloadFor(publishArtifactFor('raw-revision', { sourceRevisions: { 'project:/private/path': 1 } }))), { memberId: created.host.memberId }).ack.code, 'unauthorized')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-unshared-revision', created.host.memberId, payloadFor(publishArtifactFor('unshared-revision', { sourceRevisions: { [`locator:${fingerprintJson({ artifactId: 'unshared', artifactRevision: 1 })}`]: 1 } }))), { memberId: created.host.memberId }).ack.code, 'unauthorized')

  const publish = envelope(created, 'artifact.publish', 'artifact-initial', created.host.memberId, payloadFor(firstArtifact))
  assert.equal(service.execute(publish, { memberId: created.host.memberId }).ack.status, 'accepted')
  assert.equal(service.execute(publish, { memberId: created.host.memberId }).ack.duplicate, true)
  assert.equal(repo.getSnapshot(created.room.roomId).artifacts[firstArtifact.artifactId].content.ciphertextBase64, firstArtifact.content.ciphertextBase64)
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-same-id', created.host.memberId, payloadFor(publishArtifactFor('same-id', { artifactId: firstArtifact.artifactId }))), { memberId: created.host.memberId }).ack.code, 'conflict')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-same-fingerprint', created.host.memberId, payloadFor(publishArtifactFor('same-fingerprint', { fingerprint: firstArtifact.fingerprint }))), { memberId: created.host.memberId }).ack.code, 'conflict')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-nonce-reuse', created.host.memberId, payloadFor(publishArtifactFor('nonce-reuse', { content: firstArtifact.content }))), { memberId: created.host.memberId }).ack.code, 'nonce-reused')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-direction', created.host.memberId, payloadFor(publishArtifactFor('direction', { kind: 'direction-set' }))), { memberId: created.host.memberId }).ack.status, 'accepted')
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-impact', created.host.memberId, payloadFor(publishArtifactFor('impact', { kind: 'impact-group' }))), { memberId: created.host.memberId }).ack.status, 'accepted')
  for (let index = 3; index < COLLABORATION_LIMITS.maxArtifactsPerRoom; index++) {
    const artifact = publishArtifactFor(`quota-${index}`)
    assert.equal(service.execute(envelope(created, 'artifact.publish', `artifact-quota-${index}`, created.host.memberId, payloadFor(artifact)), { memberId: created.host.memberId }).ack.status, 'accepted')
  }
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-quota-over', created.host.memberId, payloadFor(publishArtifactFor('quota-over'))), { memberId: created.host.memberId }).ack.code, 'quota-exceeded')
  assert.deepEqual(replayCollaborationEvents(repo.getEvents(created.room.roomId)), repo.getSnapshot(created.room.roomId))
  repo.close()
})

check('authoring-review rooms accept the same encrypted initial artifact contract', () => {
  const { repo, service, created } = harness({ roomKind: 'authoring-review' })
  const artifact = publishArtifactFor('authoring-review')
  const payload = { shareSessionId: 'share-1', manifestFingerprint: 'manifest-1', artifact }
  assert.equal(service.execute(envelope(created, 'artifact.publish', 'authoring-review-artifact', created.host.memberId, payload), { memberId: created.host.memberId }).ack.status, 'accepted')
  assert.equal(repo.getSnapshot(created.room.roomId).artifacts[artifact.artifactId].kind, 'intervention')
  repo.close()
})

check('published artifact survives restart then TTL becomes a replay-safe low-sensitive tombstone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pinax-collaboration-artifact-'))
  const filename = join(dir, 'rooms.sqlite')
  try {
    const first = harness({ filename })
    const { state, repo, service, created } = first
    const artifact = publishArtifactFor('restart-ttl')
    const payload = { shareSessionId: 'share-1', manifestFingerprint: 'manifest-1', artifact }
    assert.equal(service.execute(envelope(created, 'artifact.publish', 'artifact-restart-ttl', created.host.memberId, payload), { memberId: created.host.memberId }).ack.status, 'accepted')
    const roomId = created.room.roomId
    repo.close()

    const restarted = new SqliteCollaborationRepository({ filename, clock: () => state.now, secretPepper: 'fixture-pepper' })
    assert.equal(restarted.getSnapshot(roomId).artifacts[artifact.artifactId].content.ciphertextBase64, artifact.content.ciphertextBase64)
    assert.deepEqual(replayCollaborationEvents(restarted.getEvents(roomId)), restarted.getSnapshot(roomId))
    const beforeBytes = restarted.db.prepare('SELECT retained_bytes FROM collaboration_retention WHERE room_id = ?').get(roomId).retained_bytes
    state.now += COLLABORATION_LIMITS.defaultArtifactTtlMs + 1
    const purged = restarted.purgeExpiredContent(roomId)
    const tombstone = purged.snapshot.artifacts[artifact.artifactId]
    assert.deepEqual(Object.keys(tombstone).sort(), ['actor', 'artifactId', 'authority', 'baseRevision', 'contentExpiredAt', 'expiresAt', 'fingerprint', 'kind', 'publishedAt'].sort())
    const storedPayloads = restarted.db.prepare('SELECT GROUP_CONCAT(payload_json) AS payloads FROM collaboration_events WHERE room_id = ?').get(roomId).payloads
    assert.equal(storedPayloads.includes(artifact.content.ciphertextBase64), false)
    const afterBytes = restarted.db.prepare('SELECT retained_bytes FROM collaboration_retention WHERE room_id = ?').get(roomId).retained_bytes
    assert.ok(afterBytes < beforeBytes)
    assert.deepEqual(replayCollaborationEvents(restarted.getEvents(roomId)), restarted.getSnapshot(roomId))
    const projection = createCollaborationDomainProjection()
    for (const item of restarted.getEvents(roomId)) projection.applyEvent(item)
    assert.deepEqual(projection.state.artifacts, restarted.getSnapshot(roomId).artifacts)
    assert.deepEqual(projection.state.retention, restarted.getSnapshot(roomId).retention)
    const postPurgeService = new CollaborationCommandService({ repository: restarted, clock: () => state.now })
    const rejectedAfterPurge = [
      envelope(created, 'artifact.publish', 'post-purge-publish', created.host.memberId, { shareSessionId: 'share-1', manifestFingerprint: 'manifest-1', artifact: publishArtifactFor('post-purge') }),
      envelope(created, 'proposal.create', 'post-purge-proposal', created.host.memberId, proposalPayload('post-purge-proposal')),
      envelope(created, 'generation.request', 'post-purge-generation-request', created.host.memberId, { requestId: 'post-purge-request', proposalId: 'post-purge-proposal', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }),
      envelope(created, 'generation.complete', 'post-purge-generation-complete', created.host.memberId, { requestId: 'post-purge-request', proposalId: 'post-purge-proposal', artifact: artifactFor('post-purge-complete') }),
      envelope(created, 'chat.send', 'post-purge-chat', created.host.memberId, chatPayload())
    ]
    for (const command of rejectedAfterPurge) assert.equal(postPurgeService.execute(command, { memberId: created.host.memberId }).ack.code, 'expired', command.type)
    restarted.close()

    const final = new SqliteCollaborationRepository({ filename, clock: () => state.now, secretPepper: 'fixture-pepper' })
    assert.equal(final.getSnapshot(roomId).artifacts[artifact.artifactId].contentExpiredAt, tombstone.contentExpiredAt)
    assert.ok(final.getSnapshot(roomId).retention.artifactsPurgedAt)
    assert.ok(final.getSnapshot(roomId).retention.commentsPurgedAt)
    assert.deepEqual(replayCollaborationEvents(final.getEvents(roomId)), final.getSnapshot(roomId))
    final.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

check('AES-GCM nonce is unique per room/share while identical retry remains idempotent', () => {
  const { repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  const sharedContent = cipherFor('nonce-reuse-fixture')
  const first = envelope(created, 'chat.send', 'nonce-first', reviewer.memberId, { target: TARGET, content: sharedContent })
  assert.equal(service.execute(first, { memberId: reviewer.memberId }).ack.status, 'accepted')
  assert.equal(service.execute(first, { memberId: reviewer.memberId }).ack.duplicate, true)
  const reused = envelope(created, 'chat.send', 'nonce-second', reviewer.memberId, { target: TARGET, content: sharedContent })
  assert.equal(service.execute(reused, { memberId: reviewer.memberId }).ack.code, 'nonce-reused')
  const proposalReuse = proposalPayload('nonce-proposal-reuse'); proposalReuse.proposal.content = sharedContent
  assert.equal(service.execute(envelope(created, 'proposal.create', 'nonce-proposal-reuse', reviewer.memberId, proposalReuse), { memberId: reviewer.memberId }).ack.code, 'nonce-reused')
  service.execute(envelope(created, 'proposal.create', 'nonce-generation-proposal', reviewer.memberId, proposalPayload('nonce-generation')), { memberId: reviewer.memberId })
  service.execute(envelope(created, 'proposal.status', 'nonce-generation-select', created.host.memberId, { proposalId: 'nonce-generation', status: 'selected' }), { memberId: created.host.memberId })
  assert.equal(service.execute(envelope(created, 'generation.request', 'nonce-generation-reuse', created.host.memberId, { requestId: 'nonce-generation-request', proposalId: 'nonce-generation', target: TARGET, content: sharedContent, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId }).ack.code, 'nonce-reused')
  service.execute(envelope(created, 'generation.request', 'nonce-artifact-request', created.host.memberId, { requestId: 'nonce-artifact-request', proposalId: 'nonce-generation', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
  const reusedArtifact = { ...artifactFor('nonce-artifact'), content: sharedContent }
  assert.equal(service.execute(envelope(created, 'generation.complete', 'nonce-artifact-reuse', created.host.memberId, { requestId: 'nonce-artifact-request', proposalId: 'nonce-generation', artifact: reusedArtifact }), { memberId: created.host.memberId }).ack.code, 'nonce-reused')
  assert.equal(repo.db.prepare("SELECT COUNT(*) AS count FROM collaboration_nonces WHERE room_id = ? AND command_id = 'nonce-first'").get(created.room.roomId).count, 1)
  repo.close()
})

check('rehearsal generation and promotion bind selected proposal, artifact, and revision', () => {
  const { state, repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  service.execute(envelope(created, 'proposal.create', 'bound-proposal', reviewer.memberId, proposalPayload('bound-1')), { memberId: reviewer.memberId })
  const openRequest = service.execute(envelope(created, 'generation.request', 'open-request', created.host.memberId, { requestId: 'open-1', proposalId: 'bound-1', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
  assert.equal(openRequest.ack.code, 'conflict')
  service.execute(envelope(created, 'proposal.status', 'bound-select', created.host.memberId, { proposalId: 'bound-1', status: 'selected' }), { memberId: created.host.memberId })
  service.execute(envelope(created, 'generation.request', 'bound-request', created.host.memberId, { requestId: 'bound-request-1', proposalId: 'bound-1', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
  const boundArtifact = { ...artifactFor('bound-1'), evidenceRefs: [EVIDENCE] }
  const expiredBranchArtifact = { ...boundArtifact, expiresAt: new Date(state.now).toISOString(), content: cipherFor('expired-branch-artifact') }
  assert.equal(service.execute(envelope(created, 'generation.complete', 'bound-complete-expired', created.host.memberId, { requestId: 'bound-request-1', proposalId: 'bound-1', artifact: expiredBranchArtifact }), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  const rawRevisionArtifact = { ...boundArtifact, sourceRevisions: { 'project:/private/path': 3 }, content: cipherFor('raw-revision-artifact') }
  assert.equal(service.execute(envelope(created, 'generation.complete', 'bound-complete-raw-revision', created.host.memberId, { requestId: 'bound-request-1', proposalId: 'bound-1', artifact: rawRevisionArtifact }), { memberId: created.host.memberId }).ack.code, 'unauthorized')
  const unallowlistedRevisionArtifact = { ...boundArtifact, sourceRevisions: { [`locator:${fingerprintJson({ artifactId: 'unshared', artifactRevision: 1 })}`]: 3 }, content: cipherFor('unallowlisted-revision-artifact') }
  assert.equal(service.execute(envelope(created, 'generation.complete', 'bound-complete-unallowlisted-revision', created.host.memberId, { requestId: 'bound-request-1', proposalId: 'bound-1', artifact: unallowlistedRevisionArtifact }), { memberId: created.host.memberId }).ack.code, 'unauthorized')
  service.execute(envelope(created, 'generation.complete', 'bound-complete', created.host.memberId, { requestId: 'bound-request-1', proposalId: 'bound-1', artifact: boundArtifact }), { memberId: created.host.memberId })
  assert.equal(repo.getSnapshot(created.room.roomId).generation.requests['bound-request-1'].artifactFingerprint, encryptedArtifactFixture.relay.fingerprint)
  assert.equal(service.execute(envelope(created, 'generation.complete', 'second-completion', created.host.memberId, { requestId: 'bound-request-1', proposalId: 'bound-1', artifact: artifactFor('second-completion') }), { memberId: created.host.memberId }).ack.code, 'conflict')
  const revisionsFingerprint = fingerprintJson(boundArtifact.sourceRevisions)
  const request = {
    roomId: created.room.roomId,
    shareSessionId: 'share-1',
    proposalId: 'bound-1',
    artifactId: boundArtifact.artifactId,
    artifactFingerprint: encryptedArtifactFixture.relay.fingerprint,
    generationRequestId: 'bound-request-1',
    sourceRevisionFingerprint: revisionsFingerprint,
    liveRevisionFingerprint: revisionsFingerprint,
    hostEpoch: 1,
    liveTargetRevision: 3
  }
  assert.equal(service.execute(envelope(created, 'promotion.request', 'bound-promote', created.host.memberId, { request }), { memberId: created.host.memberId }).ack.status, 'accepted')
  const secondRequest = service.execute(envelope(created, 'generation.request', 'second-branch', created.host.memberId, { requestId: 'bound-request-2', proposalId: 'bound-1', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
  assert.equal(secondRequest.ack.code, 'conflict')
  assert.equal(service.execute(envelope(created, 'promotion.request', 'second-promotion', created.host.memberId, { request }), { memberId: created.host.memberId }).ack.code, 'conflict')
  assert.equal(service.execute(envelope(created, 'promotion.request', 'invented-promote', created.host.memberId, { request: { ...request, artifactFingerprint: 'sha256:invented' } }), { memberId: created.host.memberId }).ack.code, 'invalid-payload')
  service.execute(envelope(created, 'proposal.create', 'artifact-evidence-proposal', reviewer.memberId, proposalPayload('artifact-evidence')), { memberId: reviewer.memberId })
  service.execute(envelope(created, 'proposal.status', 'artifact-evidence-select', created.host.memberId, { proposalId: 'artifact-evidence', status: 'selected' }), { memberId: created.host.memberId })
  service.execute(envelope(created, 'generation.request', 'artifact-evidence-request', created.host.memberId, { requestId: 'artifact-evidence-request', proposalId: 'artifact-evidence', target: TARGET, shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
  const unsharedArtifact = { ...artifactFor('unshared-evidence'), evidenceRefs: [{ ...EVIDENCE, nodeId: 'unshared-evidence' }] }
  assert.equal(service.execute(envelope(created, 'generation.complete', 'artifact-unshared-evidence', created.host.memberId, { requestId: 'artifact-evidence-request', proposalId: 'artifact-evidence', artifact: unsharedArtifact }), { memberId: created.host.memberId }).ack.code, 'unauthorized')
  repo.close()
})

check('expired rooms deny invites, resume, snapshot, recovery, events, and commands', () => {
  const { state, repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined
  state.now = Date.parse(created.room.expiresAt) + 1
  assert.throws(() => repo.createInvite(created.room.roomId), /room-expired/)
  assert.equal(repo.resumeMember({ roomId: created.room.roomId, memberId: reviewer.member.memberId, resumeToken: reviewer.resumeToken }).code, 'expired')
  assert.equal(repo.getSnapshot(created.room.roomId).status, 'expired')
  assert.equal(repo.getRecovery(created.room.roomId, 0).status, 'expired')
  assert.equal(repo.getEvents(created.room.roomId).status, 'expired')
  assert.equal(service.execute(envelope(created, 'chat.send', 'expired-command', reviewer.member.memberId, chatPayload()), { memberId: reviewer.member.memberId }).ack.code, 'expired')
  repo.close()
})

check('invite revocation invalidates already joined member commands and resume', () => {
  const { repo, service, created } = harness()
  const { invite, joined } = joinReviewer(repo, created)
  const revoked = repo.revokeInvite(created.room.roomId, invite.inviteId)
  assert.deepEqual(revoked.invalidatedMemberIds, [joined.member.memberId])
  assert.equal(service.execute(envelope(created, 'chat.send', 'revoked-command', joined.member.memberId, chatPayload()), { memberId: joined.member.memberId }).ack.code, 'unauthorized')
  assert.equal(repo.resumeMember({ roomId: created.room.roomId, memberId: joined.member.memberId, resumeToken: joined.resumeToken }).code, 'resume-invalid')
  assert.equal(repo.getSnapshot(created.room.roomId).members[joined.member.memberId].connectionState, 'left')
  repo.close()
})

check('hostless room elects earliest eligible late join and increments epoch', () => {
  const { state, repo, created } = harness()
  const invite = repo.createInvite(created.room.roomId)
  repo.disconnectMember({ roomId: created.room.roomId, memberId: created.host.memberId })
  state.now += COLLABORATION_LIMITS.disconnectGraceMs + 1
  assert.equal(repo.reconcileLeases(created.room.roomId).hostId, null)
  const joined = repo.joinWithInvite({ roomSlug: created.room.roomSlug, inviteId: invite.inviteId, inviteSecret: invite.inviteSecret, displayName: 'Late Host' })
  assert.equal(joined.member.role, 'host')
  assert.equal(joined.room.hostId, joined.member.memberId)
  assert.equal(joined.room.hostEpoch, 3)
  repo.db.prepare('UPDATE collaboration_rooms SET host_id = NULL WHERE room_id = ?').run(created.room.roomId)
  const reconciled = repo.reconcileLeases(created.room.roomId)
  assert.equal(reconciled.hostId, joined.member.memberId)
  assert.equal(reconciled.hostEpoch, 4)
  repo.close()
})

check('idempotency binds command id to canonical actor/type/payload/epoch', () => {
  const { repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  const original = envelope(created, 'proposal.create', 'bound-command-id', reviewer.memberId, proposalPayload('idem-1'))
  assert.equal(service.execute(original, { memberId: reviewer.memberId }).ack.status, 'accepted')
  assert.equal(service.execute(original, { memberId: reviewer.memberId }).ack.duplicate, true)
  const changed = envelope(created, 'proposal.create', 'bound-command-id', reviewer.memberId, proposalPayload('idem-2'))
  assert.equal(service.execute(changed, { memberId: reviewer.memberId }).ack.code, 'conflict')
  assert.equal(service.execute({ ...original, hostEpoch: 2 }, { memberId: reviewer.memberId }).ack.code, 'conflict')
  repo.close()
})

check('repository startup, schema, room policy, and quota inputs fail closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pinax-collaboration-startup-'))
  const filename = join(dir, 'missing-pepper.sqlite')
  try {
    assert.throws(() => new SqliteCollaborationRepository({ filename }), /pepper-required/)
    assert.equal(existsSync(filename), false)
    const db = new Database(':memory:')
    db.exec('CREATE TABLE collaboration_schema(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL); INSERT INTO collaboration_schema VALUES (99, 0)')
    assert.throws(() => new SqliteCollaborationRepository({ db, secretPepper: 'pepper' }), /newer-than-supported/)
    db.close()
    const repo = new SqliteCollaborationRepository({ ephemeral: true, secretPepper: 'pepper' })
    assert.throws(() => repo.createRoom({ roomSlug: 'bad', roomKind: 'rehearsal', hostDisplayName: 'H', manifestFingerprint: 'm', shareSessionId: 's', targetAllowlist: [TARGET], encryptionPolicy: 'none' }), /encryption-policy/)
    assert.throws(() => repo.createRoom({ roomSlug: 'quota-bad', hostDisplayName: 'H', quota: { events: 3 } }), /room-quota/)
    repo.close()
    const interrupted = new Database(':memory:')
    const seeded = new SqliteCollaborationRepository({ db: interrupted, secretPepper: 'pepper' }); seeded.close()
    interrupted.exec('DELETE FROM collaboration_schema WHERE version > 1; DROP TABLE collaboration_nonces; ALTER TABLE collaboration_rooms DROP COLUMN encryption_policy;')
    assert.throws(() => new SqliteCollaborationRepository({ db: interrupted, secretPepper: 'pepper' }), /duplicate column name/)
    assert.equal(interrupted.prepare('SELECT MAX(version) AS version FROM collaboration_schema').get().version, 1)
    assert.equal(interrupted.prepare("SELECT COUNT(*) AS count FROM pragma_table_info('collaboration_rooms') WHERE name = 'encryption_policy'").get().count, 0)
    interrupted.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

check('oversize, over-depth, unknown locator/path, and unknown command are rejected', () => {
  const { repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  const oversize = service.execute(envelope(created, 'chat.send', 'oversize', reviewer.memberId, { body: 'x'.repeat(COLLABORATION_LIMITS.maxPayloadBytes + 1) }), { memberId: reviewer.memberId })
  assert.equal(oversize.ack.code, 'payload-too-large')
  let deep = {}; let cursor = deep
  for (let i = 0; i < COLLABORATION_LIMITS.maxDepth + 2; i++) { cursor.next = {}; cursor = cursor.next }
  assert.equal(service.execute(envelope(created, 'chat.send', 'deep', reviewer.memberId, { body: 'x', target: deep }), { memberId: reviewer.memberId }).ack.code, 'payload-too-deep')
  assert.equal(service.execute(envelope(created, 'chat.send', 'bad-path', reviewer.memberId, { body: 'x', target: { localStorageKey: 'secret' } }), { memberId: reviewer.memberId }).ack.code, 'invalid-payload')
  assert.equal(service.execute(envelope(created, 'project.write', 'unknown', reviewer.memberId, {}), { memberId: reviewer.memberId }).ack.code, 'unknown-command')
  repo.close()
})

check('event quota and explicit/expiry deletion produce durable low-sensitivity receipts', () => {
  const { state, repo, service, created } = harness({ eventQuota: 4 })
  const reviewer = joinReviewer(repo, created).joined.member // three events including room + host
  assert.equal(service.execute(envelope(created, 'proposal.create', 'quota-last', reviewer.memberId, proposalPayload()), { memberId: reviewer.memberId }).ack.status, 'accepted')
  assert.equal(service.execute(envelope(created, 'chat.send', 'quota-over', reviewer.memberId, chatPayload()), { memberId: reviewer.memberId }).ack.code, 'quota-exceeded')
  const receipt = repo.deleteRoom(created.room.roomId, 'explicit')
  assert.equal(repo.getRoom(created.room.roomId), null)
  assert.deepEqual(repo.getDeletionReceipt(receipt.receiptId), receipt)
  const expiring = repo.createRoom({ roomSlug: 'expires', hostDisplayName: 'Host', ttlMs: 1000 })
  state.now += 1001
  const receipts = repo.expireRooms()
  assert.equal(receipts.some(item => item.roomId === expiring.room.roomId && item.reason === 'expired'), true)
  repo.close()
})

check('TTL cleanup scrubs every Experience content path and preserves replay', () => {
  const { state, repo, service, created } = harness({ roomKind: 'experience' })
  const reviewer = joinReviewer(repo, created).joined.member
  const proposal = adaptExperienceV1Command({ type: 'action.propose', commandId: 'ttl-proposal', proposalId: 'ttl-1', text: 'SENTINEL_PROPOSAL' }, { roomId: created.room.roomId, actorId: reviewer.memberId })
  service.execute(proposal.value, { memberId: reviewer.memberId })
  const chat = adaptExperienceV1Command({ type: 'chat.send', commandId: 'ttl-chat', text: 'SENTINEL_CHAT' }, { roomId: created.room.roomId, actorId: reviewer.memberId })
  service.execute(chat.value, { memberId: reviewer.memberId })
  const request = adaptExperienceV1Command({ type: 'narrative.request', commandId: 'ttl-request', payload: { requestId: 'ttl-request-1', text: 'SENTINEL_REQUEST' } }, { roomId: created.room.roomId, actorId: created.host.memberId, manifestFingerprint: created.room.manifestFingerprint, shareSessionId: created.room.shareSessionId })
  service.execute(request.value, { memberId: created.host.memberId })
  service.execute(envelope(created, 'generation.status', 'ttl-status', created.host.memberId, { requestId: 'ttl-request-1', phase: 'streaming', message: 'SENTINEL_STATUS', progress: 0.5 }), { memberId: created.host.memberId })
  const completion = adaptExperienceV1Command({ type: 'narrative.completed', commandId: 'ttl-complete', payload: { requestId: 'ttl-request-1', assistantMessage: { role: 'assistant', content: 'SENTINEL_COMPLETION' } } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  service.execute(completion.value, { memberId: created.host.memberId })
  const runtime = adaptExperienceV1Command({ type: 'runtime.patch.accept', commandId: 'ttl-runtime', payload: { version: 1, paths: ['writingTime'], state: { writingTime: { day: 'SENTINEL_RUNTIME' } }, requestId: 'ttl-request-1' } }, { roomId: created.room.roomId, actorId: created.host.memberId })
  service.execute(runtime.value, { memberId: created.host.memberId })
  const liveProjection = createCollaborationDomainProjection()
  liveProjection.applySnapshot(repo.getSnapshot(created.room.roomId))
  state.now += COLLABORATION_LIMITS.defaultArtifactTtlMs + 1
  const purged = repo.purgeExpiredContent(created.room.roomId)
  liveProjection.applyEvent(purged.event)
  assert.equal(purged.comments, true)
  assert.equal(purged.artifacts, true)
  assert.equal(purged.snapshot.comments.length, 0)
  assert.equal(purged.snapshot.proposals['ttl-1'].body, null)
  assert.equal(purged.snapshot.generation.requests['ttl-request-1'].actionText, null)
  assert.equal(purged.snapshot.generation.requests['ttl-request-1'].progress.message, null)
  assert.equal(purged.snapshot.experienceRuntimePatch, null)
  assert.deepEqual(liveProjection.state.proposals, Object.values(purged.snapshot.proposals))
  assert.deepEqual(liveProjection.state.generation, purged.snapshot.generation)
  assert.deepEqual(liveProjection.state.promotions, purged.snapshot.promotions)
  assert.deepEqual(liveProjection.state.artifacts, purged.snapshot.artifacts)
  assert.deepEqual(liveProjection.state.retention, purged.snapshot.retention)
  assert.equal(liveProjection.state.experienceRuntimePatch, null)
  assert.equal(JSON.stringify(liveProjection.state).includes('SENTINEL_'), false)
  const persisted = repo.db.prepare('SELECT GROUP_CONCAT(payload_json) AS payloads FROM collaboration_events WHERE room_id = ?').get(created.room.roomId).payloads
  for (const sentinel of ['SENTINEL_PROPOSAL', 'SENTINEL_CHAT', 'SENTINEL_REQUEST', 'SENTINEL_STATUS', 'SENTINEL_COMPLETION', 'SENTINEL_RUNTIME']) assert.equal(persisted.includes(sentinel), false)
  assert.deepEqual(replayCollaborationEvents(repo.getEvents(created.room.roomId)), repo.getSnapshot(created.room.roomId))
  assert.equal(repo.purgeExpiredContent(created.room.roomId).event, null)
  repo.close()
})

check('artifact TTL scrubs legacy promotion receipt content and preserves replay', () => {
  const { state, repo, created } = harness()
  const promotion = {
    roomId: created.room.roomId,
    shareSessionId: 'share-1',
    proposalId: 'ttl-promotion',
    artifactId: 'ttl-branch',
    artifactFingerprint: fingerprintJson({ ttl: 'branch' }),
    generationRequestId: 'ttl-generation',
    sourceRevisionFingerprint: fingerprintJson({ source: 1 }),
    liveRevisionFingerprint: fingerprintJson({ live: 1 }),
    hostEpoch: 1,
    liveTargetRevision: 1
  }
  let appended = repo.appendAcceptedEvent({ roomId: created.room.roomId, commandId: 'ttl-promotion-request', requestFingerprint: 'ttl-promotion-request', type: 'promotion.requested', payload: promotion })
  appended = repo.appendAcceptedEvent({
    roomId: created.room.roomId,
    commandId: 'ttl-promotion-status',
    requestFingerprint: 'ttl-promotion-status',
    type: 'promotion.status.changed',
    payload: { proposalId: 'ttl-promotion', artifactFingerprint: promotion.artifactFingerprint, status: 'adopted', receipt: { code: 'adopted', targetTitle: 'SENTINEL_PROMOTION_TITLE', targetCount: 2 }, hostEpoch: 1 }
  })
  assert.equal(appended.ack.status, 'accepted')
  state.now += COLLABORATION_LIMITS.defaultArtifactTtlMs + 1
  const purged = repo.purgeExpiredContent(created.room.roomId)
  assert.deepEqual(purged.snapshot.promotions['ttl-promotion'].receipt, { code: 'adopted', targetCount: 2 })
  const persisted = repo.db.prepare('SELECT GROUP_CONCAT(payload_json) AS payloads FROM collaboration_events WHERE room_id = ?').get(created.room.roomId).payloads
  assert.equal(persisted.includes('SENTINEL_PROMOTION_TITLE'), false)
  assert.deepEqual(replayCollaborationEvents(repo.getEvents(created.room.roomId)), repo.getSnapshot(created.room.roomId))
  repo.close()
})

check('TTL cleanup removes encrypted comment/proposal/artifact ciphertext', () => {
  const { state, repo, service, created } = harness()
  const reviewer = joinReviewer(repo, created).joined.member
  service.execute(envelope(created, 'proposal.create', 'encrypted-ttl-proposal', reviewer.memberId, proposalPayload('encrypted-ttl')), { memberId: reviewer.memberId })
  service.execute(envelope(created, 'chat.send', 'encrypted-ttl-chat', reviewer.memberId, chatPayload()), { memberId: reviewer.memberId })
  service.execute(envelope(created, 'proposal.status', 'encrypted-ttl-select', created.host.memberId, { proposalId: 'encrypted-ttl', status: 'selected' }), { memberId: created.host.memberId })
  service.execute(envelope(created, 'generation.request', 'encrypted-ttl-request', created.host.memberId, { requestId: 'encrypted-ttl-request', proposalId: 'encrypted-ttl', target: TARGET, content: cipherFor('ttl-request-content'), shareSessionId: 'share-1', manifestFingerprint: 'manifest-1' }), { memberId: created.host.memberId })
  service.execute(envelope(created, 'generation.complete', 'encrypted-ttl-complete', created.host.memberId, { requestId: 'encrypted-ttl-request', proposalId: 'encrypted-ttl', artifact: artifactFor('ttl-complete') }), { memberId: created.host.memberId })
  state.now += COLLABORATION_LIMITS.defaultArtifactTtlMs + 1
  repo.purgeExpiredContent(created.room.roomId)
  const persisted = repo.db.prepare('SELECT GROUP_CONCAT(payload_json) AS payloads FROM collaboration_events WHERE room_id = ?').get(created.room.roomId).payloads
  assert.equal(persisted.includes(CIPHER.ciphertextBase64), false)
  assert.deepEqual(replayCollaborationEvents(repo.getEvents(created.room.roomId)), repo.getSnapshot(created.room.roomId))
  repo.close()
})

for (const { name, run } of checks) {
  try {
    await run()
    passed++
    process.stdout.write(`ok ${passed} - ${name}\n`)
  } catch (error) {
    process.stderr.write(`not ok ${passed + 1} - ${name}\n${error.stack}\n`)
    process.exitCode = 1
    break
  }
}

if (!process.exitCode) process.stdout.write(`collaboration fault matrix passed: ${passed}/${checks.length}\n`)
