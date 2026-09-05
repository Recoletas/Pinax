import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { setImmediate } from 'node:timers'
import { canonicalJson } from '../shared/collaboration/canonicalJson.js'
import { SqliteCollaborationRepository } from '../server/repositories/collaboration/SqliteCollaborationRepository.js'
import { CollaborationCommandService } from '../server/realtime/v2/commandService.js'
import {
  createAuthoringRehearsalHostRegistry,
  createAuthoringRehearsalLiveReader
} from '../src/services/collaboration/authoringRehearsalBridge.js'
import {
  createAuthoringRehearsalRoomController,
  settleAuthoringRehearsalPromotionReceipt
} from '../src/services/collaboration/authoringRehearsalRoom.js'
import {
  buildAuthoringRehearsalInviteUrl,
  buildCollaborationInviteUrl,
  parseAuthoringRehearsalInviteUrl,
  parseCollaborationInviteUrl,
  scrubAuthoringRehearsalInviteFragment
} from '../src/services/collaboration/endpoint.js'
import { createAuthoringInterventionRehearsalScope } from '../src/services/agents/authoring/authoringInterventionRehearsal.js'
import {
  createAuthoringInterventionRehearsalRequest,
  normalizeAuthoringInterventionRehearsalDrafts
} from '../src/services/agents/authoring/authoringInterventionRehearsalRun.js'
import { createAuthoringEvidenceEnvelope } from '../src/services/agents/authoring/authoringKnowledgeAnswerContract.js'

let passed = 0
async function check (name, run) {
  await run(); passed += 1; console.log(`ok ${passed} - ${name}`)
}
async function waitFor (predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  throw new Error('matrix-condition-timeout')
}

const target = Object.freeze({
  projectId: 'project-room', documentId: 'chapter-1', chapterId: 'chapter-1', documentRevision: 7,
  unitId: 'unit-1', unitRevision: 5, nodeId: 'node-1', nodeRevision: 3
})
const downstream = Object.freeze({
  documentId: 'chapter-1', chapterId: 'chapter-1', documentRevision: 7,
  unitId: 'unit-2', unitRevision: 2, nodeId: 'node-2', nodeRevision: 4
})
const evidence = Object.freeze([
  { sourceRef: 'node:chapter-1:node-1', projectId: 'project-room', authority: 'manuscript', label: '当前条件', excerpt: '门仍关闭。', revision: '3', locator: { kind: 'manuscript', documentId: 'chapter-1', chapterId: 'chapter-1', unitId: 'unit-1', nodeId: 'node-1' } },
  { sourceRef: 'node:chapter-1:node-2', projectId: 'project-room', authority: 'manuscript', label: '后续结果', excerpt: '守钟人错过约定。', revision: '4', locator: { kind: 'manuscript', documentId: 'chapter-1', chapterId: 'chapter-1', unitId: 'unit-2', nodeId: 'node-2' } }
])
const evidenceEnvelope = createAuthoringEvidenceEnvelope({ projectId: 'project-room', queryIntent: 'foreshadowing', evidence, claims: [] })
const impactGroup = Object.freeze({
  id: 'impact-room', status: 'established', title: '约定', reason: '大纲明确 causes。',
  targetRef: 'node:chapter-1:node-2', evidenceRefs: ['node:chapter-1:node-1', 'node:chapter-1:node-2'], position: downstream,
  relationPath: [{ relation: 'causes', fromRef: 'node:chapter-1:node-1', toRef: 'node:chapter-1:node-2', evidenceRefs: ['node:chapter-1:node-2'] }]
})
const session = Object.freeze({
  schemaVersion: 1, kind: 'authoring-intervention-session', status: 'ready', projectId: 'project-room',
  target, positionFingerprint: 'position-room', fingerprint: 'session-room',
  providerConfig: { apiKey: 'LOCAL_ONLY' },
  intervention: {
    schemaVersion: 1, kind: 'narrative-intervention', id: 'intervention-room', projectId: 'project-room',
    operation: 'change-event', target, subjectRef: 'PRIVATE', before: '门仍关闭。', after: '门提前打开。',
    rationale: '检验后果。', evidenceRefs: ['node:chapter-1:node-1'], evidenceFingerprint: 'evidence-room', positionFingerprint: 'position-room'
  },
  impactGroups: [impactGroup], candidateGroups: [], evidenceEnvelope
})
const scope = createAuthoringInterventionRehearsalScope({ session }).scope

function locatorIdentity (locator) {
  return canonicalJson(Object.fromEntries(Object.entries(locator).filter(([key]) => key !== 'sourceRevision' && !key.endsWith('Revision'))))
}
const targets = new Map()
const evidences = new Map()
const liveReader = createAuthoringRehearsalLiveReader({
  readTarget: locator => structuredClone(targets.get(locatorIdentity(locator)) || null),
  readEvidence: locator => structuredClone(evidences.get(locatorIdentity(locator)) || null)
})
let providerCalls = 0
const registry = createAuthoringRehearsalHostRegistry({
  liveReader,
  runRehearsal: ({ session: sourceSession, selection }) => {
    providerCalls += 1
    const request = createAuthoringInterventionRehearsalRequest({ session: sourceSession, selection }).request
    const drafts = normalizeAuthoringInterventionRehearsalDrafts(request, request.targets.map(item => ({ targetRef: item.targetRef, text: `${item.originalText}（共同排演）` }))).drafts
    return { ok: true, result: Object.freeze({
      schemaVersion: 1, kind: 'authoring-intervention-rehearsal-result', projectId: sourceSession.projectId,
      sessionFingerprint: sourceSession.fingerprint, selectionFingerprint: selection.fingerprint,
      request, reconciliation: { stale: false }, status: 'fresh', adoptable: true, drafts,
      fingerprint: 'room-result'
    }) }
  }
})
const registered = registry.registerSource({ session, scope })
assert.equal(registered.ok, true)
for (const artifact of [registered.interventionArtifact, registered.directionSetArtifact, ...registered.impactGroupArtifacts]) {
  targets.set(locatorIdentity(artifact.target), structuredClone(artifact.target))
  for (const locator of artifact.evidenceRefs) evidences.set(locatorIdentity(locator), structuredClone(locator))
}

class MemoryStorage {
  constructor () { this.data = new Map() }
  getItem (key) { return this.data.get(key) || null }
  setItem (key, value) { this.data.set(key, String(value)) }
  removeItem (key) { this.data.delete(key) }
}

const repo = new SqliteCollaborationRepository({ ephemeral: true, secretPepper: 'room-controller' })
const commands = new CollaborationCommandService({ repository: repo, randomId: (() => { let value = 0; return prefix => `${prefix}-${++value}` })() })
const clients = new Set()
let created = null
let rejectNextPromotionStatus = false
const fakeFetch = async (_url, options) => {
  const body = JSON.parse(options.body)
  const base = repo.createRoom(body)
  created = { ...base, invite: repo.createInvite(base.room.roomId) }
  return { ok: true, status: 201, json: async () => created }
}

class ProtocolHarness {
  constructor () { this.listeners = new Map(); this.state = 'idle'; clients.add(this) }
  on (type, listener) { const set = this.listeners.get(type) || new Set(); set.add(listener); this.listeners.set(type, set); return () => set.delete(listener) }
  emit (type, value) { for (const listener of this.listeners.get(type) || []) listener(value) }
  async connect (intent) {
    let joined
    if (intent.roomId) joined = { room: created.room, member: created.host, resumeToken: created.host.resumeToken, snapshot: repo.getSnapshot(created.room.roomId) }
    else joined = repo.joinWithInvite(intent)
    if (joined.ok === false) { this.state = joined.code; this.emit('state', this.state); return }
    this.roomId = joined.room?.roomId || created.room.roomId
    this.memberId = joined.member.memberId
    this.role = joined.member.role
    this.state = 'connected'
    this.emit('identity', { roomId: this.roomId, memberId: this.memberId })
    this.emit('snapshot', joined.snapshot)
    this.emit('state', 'connected')
    if (joined.event) for (const peer of clients) if (peer !== this && peer.roomId === this.roomId) peer.emit('event', joined.event)
  }
  async sendCommand (type, payload, options) {
    if (type === 'promotion.status' && rejectNextPromotionStatus) {
      rejectNextPromotionStatus = false
      throw Object.assign(new Error('temporary-ack-failure'), {
        ack: { status: 'rejected', code: 'temporary-ack-failure' }
      })
    }
    const result = commands.execute({ protocolVersion: 2, type, commandId: options.commandId, roomId: this.roomId, actorId: this.memberId, payload, ...(options.hostEpoch ? { hostEpoch: options.hostEpoch } : {}) }, { memberId: this.memberId })
    if (result.ack.status !== 'accepted') throw Object.assign(new Error(result.ack.code), { ack: result.ack })
    if (result.event) for (const peer of clients) if (peer.roomId === this.roomId) peer.emit('event', result.event)
    return result.ack
  }
  close () { this.state = 'closed'; this.emit('state', 'closed') }
  destroy () { this.close(); clients.delete(this) }
}

const options = {
  enabled: true,
  endpointResolver: async () => ({ enabled: true, httpBaseUrl: 'https://relay.test', wsUrl: 'wss://relay.test/ws/collaboration' }),
  transportFactory: () => ({}), protocolClientFactory: () => new ProtocolHarness(),
  fetchImpl: fakeFetch, cryptoImpl: webcrypto, windowLike: { location: { protocol: 'https:', origin: 'https://pinax.test' } }
}

await check('feature off is inert and does not resolve endpoints or touch provider', async () => {
  let touched = 0
  const disabled = createAuthoringRehearsalRoomController({ enabled: false, endpointResolver: () => { touched += 1 } })
  assert.equal((await disabled.createHostRoom()).reason, 'authoring-collaboration-disabled')
  assert.equal(touched, 0); assert.equal(providerCalls, 0)
})

await check('new fragment-only authoring URL scrubs while legacy experience URL remains compatible', () => {
  const authoring = buildAuthoringRehearsalInviteUrl('https://pinax.test', { roomSlug: 'room-one', inviteId: 'invite', inviteSecret: 'secret', contentKey: 'key' })
  assert.equal(new URL(authoring).pathname, '/collaboration/review/room-one')
  assert.equal(new URL(authoring).search, '')
  assert.deepEqual(parseAuthoringRehearsalInviteUrl(authoring).roomSlug, 'room-one')
  const history = { state: null, value: '', replaceState (_state, _title, value) { this.value = value } }
  scrubAuthoringRehearsalInviteFragment({ locationLike: { href: authoring, pathname: '/collaboration/review/room-one', search: '' }, historyLike: history })
  assert.equal(history.value, '/collaboration/review/room-one')
  for (const malformed of [
    'https://pinax.test/collaboration/review/room-one#invite=invite&secret=secret',
    'https://pinax.test/not-a-review-route#invite=invite&secret=secret&contentKey=key'
  ]) {
    const invalidHistory = { state: null, value: '', replaceState (_state, _title, value) { this.value = value } }
    const pathname = new URL(malformed).pathname
    assert.throws(() => scrubAuthoringRehearsalInviteFragment({
      locationLike: { href: malformed, pathname, search: '' },
      historyLike: invalidHistory
    }))
    assert.equal(invalidHistory.value, pathname)
  }
  const legacy = buildCollaborationInviteUrl('https://pinax.test', { roomSlug: 'old-room', inviteId: 'old', inviteSecret: 'old-secret', contentKey: 'old-key' })
  assert.equal(parseCollaborationInviteUrl(legacy).roomSlug, 'old-room')
})

const host = createAuthoringRehearsalRoomController({ ...options, registry, storage: new MemoryStorage() })
await check('host creates from registry-owned F3 artifacts and publishes exact complete allowlist', async () => {
  const result = await host.createHostRoom({ sourceHandle: registered.sourceHandle, roomSlug: 'authoring-room', displayName: 'Host' })
  assert.equal(result.ok, true)
  assert.equal(repo.getSnapshot(result.room.roomId).artifacts && Object.keys(repo.getSnapshot(result.room.roomId).artifacts).length, 3)
  const kinds = Object.values(repo.getSnapshot(result.room.roomId).artifacts).map(item => item.kind).sort()
  assert.deepEqual(kinds, ['direction-set', 'impact-group', 'intervention'])
  for (const artifact of [registered.interventionArtifact, registered.directionSetArtifact, ...registered.impactGroupArtifacts]) {
    for (const locator of [artifact.target, ...artifact.evidenceRefs]) assert.ok(result.targetAllowlist.some(item => canonicalJson(item) === canonicalJson(locator)))
  }
  for (const direction of registered.directionSetArtifact.visiblePayload.directions) {
    for (const item of direction.targets) assert.ok(result.targetAllowlist.some(locator => canonicalJson(locator) === canonicalJson(item.locator)))
  }
  assert.equal(providerCalls, 0)
})

const invite = parseAuthoringRehearsalInviteUrl(host.state.invite.url)
const guest = createAuthoringRehearsalRoomController({ ...options, storage: new MemoryStorage() })
await check('guest joins with invite and decrypts artifacts without a registry or provider', async () => {
  const result = await guest.joinGuestRoom({ invite, displayName: 'Reviewer' })
  assert.equal(result.ok, true)
  assert.deepEqual(Object.values(guest.state.artifacts).map(item => item.kind).sort(), ['direction-set', 'impact-group', 'intervention'])
  assert.equal(providerCalls, 0)
  assert.equal(JSON.stringify(repo.getSnapshot(result.room.roomId)).includes('门提前打开'), false)
})

let proposalId
await check('reviewer binds exact direction and votes; member cannot invoke provider', async () => {
  const direction = guest.state.artifacts[registered.directionSetArtifact.artifactId].visiblePayload.directions[0]
  const proposed = await guest.proposeDirection({ directionId: direction.directionId, body: '选择这个方向', gain: '保住约定', cost: '暴露门轴' })
  proposalId = proposed.proposalId
  assert.equal(proposed.ok, true)
  assert.equal((await guest.selectAndGenerate({ proposalId })).reason, 'collaboration-generation-host-required')
  assert.equal(providerCalls, 0)
  assert.equal((await guest.castVote({ proposalId, value: 'up' })).ok, true)
  await waitFor(() => host.state.proposals.length === 1)
  assert.equal(host.state.proposals[0].binding.directionSetArtifactFingerprint, registered.directionSetArtifact.fingerprint)
  assert.equal(host.state.proposals[0].gain, '保住约定')
  assert.equal(host.state.proposals[0].cost, '暴露门轴')
  assert.equal(JSON.stringify(repo.getSnapshot(created.room.roomId)).includes('保住约定'), false)
})

let generation
await check('host selection calls provider once and publishes decryptable branch with allowed preview targets', async () => {
  generation = await host.selectAndGenerate({ proposalId })
  assert.equal(generation.ok, true)
  assert.equal(providerCalls, 1)
  assert.equal(await host.selectAndGenerate({ proposalId }), generation)
  assert.equal(providerCalls, 1)
  await waitFor(() => guest.state.generation.requests[generation.requestId]?.artifact)
  const branch = guest.state.generation.requests[generation.requestId].artifact
  assert.equal(branch.kind, 'rehearsal-branch')
  for (const item of branch.visiblePayload.preview) assert.ok(created.room.targetAllowlist.some(locator => canonicalJson(locator) === canonicalJson(item.target)))
  for (const locator of [branch.target, ...branch.visiblePayload.preview.map(item => item.target)]) targets.set(locatorIdentity(locator), structuredClone(locator))
  for (const locator of branch.evidenceRefs) evidences.set(locatorIdentity(locator), structuredClone(locator))
  const hostProposal = await host.proposeDirection({ directionId: registered.directionSetArtifact.visiblePayload.directions[0].directionId, body: '主持人补充', gain: '补充收益', cost: '补充代价' })
  assert.equal(hostProposal.ok, true)
  assert.equal((await host.castVote({ proposalId: hostProposal.proposalId, value: 'abstain' })).ok, true)
  assert.equal(providerCalls, 1)
})

await check('promotion returns the original local result only and never adopts', async () => {
  const prepared = await host.preparePromotion({ proposalId, generationRequestId: generation.requestId })
  assert.equal(prepared.ok, true)
  assert.equal(prepared.result.kind, 'authoring-intervention-rehearsal-result')
  assert.equal('adoption' in prepared, false)
  assert.equal(repo.getSnapshot(created.room.roomId).promotions[proposalId].status, 'requested')
  const hostHarness = [...clients].find(item => item.memberId === host.state.selfMemberId)
  hostHarness.state = 'closed'
  hostHarness.emit('state', 'closed')
  assert.equal((await host.reportPromotionStatus({ proposalId, artifactFingerprint: generation.artifact.fingerprint, status: 'rejected', receipt: { code: 'cancelled' } })).ok, false)
  hostHarness.state = 'connected'
  hostHarness.emit('state', 'connected')
  rejectNextPromotionStatus = true
  assert.equal((await host.reportPromotionStatus({ proposalId, artifactFingerprint: generation.artifact.fingerprint, status: 'rejected', receipt: { code: 'cancelled' } })).reason, 'temporary-ack-failure')
  const status = await host.reportPromotionStatus({ proposalId, artifactFingerprint: generation.artifact.fingerprint, status: 'rejected', receipt: { code: 'cancelled' } })
  assert.equal(status.ok, true)
  assert.equal(await host.reportPromotionStatus({ proposalId, artifactFingerprint: generation.artifact.fingerprint, status: 'rejected', receipt: { code: 'cancelled' } }), status)
})

await check('late receipt ACK cannot overwrite a newer promotion owner', () => {
  const older = Object.freeze({ proposalId: 'proposal-old', artifactFingerprint: 'artifact-old', pendingReceipt: { code: 'adopted' }, reported: false })
  const newer = Object.freeze({ proposalId: 'proposal-new', artifactFingerprint: 'artifact-new', pendingReceipt: { code: 'adopted' }, reported: false })
  assert.equal(settleAuthoringRehearsalPromotionReceipt({ current: newer, owner: older, result: { ok: true } }), newer)
  const settled = settleAuthoringRehearsalPromotionReceipt({ current: newer, owner: newer, result: { ok: true } })
  assert.equal(settled.reported, true)
  assert.equal(settled.pendingReceipt, null)
})

await check('tamper, stale local state, and absent local record fail closed without extra provider calls', async () => {
  const liveMainKey = locatorIdentity(generation.artifact.target)
  const currentMain = targets.get(liveMainKey)
  targets.set(liveMainKey, { ...currentMain, nodeRevision: 99 })
  assert.equal((await host.preparePromotion({ proposalId, generationRequestId: generation.requestId })).reason, 'collaboration-promotion-stale')
  targets.set(liveMainKey, currentMain)
  const forged = createAuthoringRehearsalRoomController({ ...options, registry, storage: new MemoryStorage() })
  assert.equal((await forged.createHostRoom({ sourceHandle: Object.freeze({}), roomSlug: 'forged-room', displayName: 'Host' })).ok, false)
  assert.equal(providerCalls, 1)
  const wrongInvite = { ...invite, contentKey: invite.contentKey.replace(/^./, invite.contentKey[0] === 'A' ? 'B' : 'A') }
  const tampered = createAuthoringRehearsalRoomController({ ...options, storage: new MemoryStorage() })
  const joined = await tampered.joinGuestRoom({ invite: wrongInvite, displayName: 'Tampered' })
  assert.equal(joined.ok, false)
  assert.equal(providerCalls, 1)
  tampered.destroy(); forged.destroy()
})

host.destroy(); guest.destroy(); repo.close()
console.log(`collaboration authoring room matrix: ${passed}/${passed} checks passed`)
