import { canonicalJson, fingerprintJson } from '../../../shared/collaboration/canonicalJson.js'
import { validateStableLocator } from '../../../shared/collaboration/contracts.js'
import {
  createAuthoringDirectionProposalBinding,
  createCollaborationPromotionRequest,
  getAuthoringRehearsalSourceArtifacts,
  preflightAuthoringRehearsalPromotion,
  verifyCollaborableArtifactFingerprint
} from './authoringRehearsalBridge.js'
import { CollaborationProtocolClient } from './CollaborationProtocolClient.js'
import { createCollaborationDomainProjection } from './domainProjection.js'
import {
  buildAuthoringRehearsalInviteUrl,
  resolveRendererCollaborationEndpoints
} from './endpoint.js'
import { RemoteWebSocketTransport } from './RemoteWebSocketTransport.js'
import { createWebCryptoCollaborationCodec, generateContentKey } from './webCryptoCodec.js'

const DEFAULT_ENABLED = import.meta.env?.VITE_COLLABORATION_V2_ENABLED === 'true'
const HOST_COMMANDS = new Set([
  'artifact.publish', 'proposal.status', 'generation.request', 'generation.complete',
  'generation.terminate', 'promotion.request', 'promotion.status'
])

const browserSession = typeof sessionStorage === 'undefined'
  ? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  : sessionStorage

function text (value, limit = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function revision (target) {
  return target?.nodeRevision ?? target?.unitRevision ?? target?.documentRevision ?? target?.artifactRevision ?? ''
}

function clone (value) {
  return value == null ? value : structuredClone(value)
}

function failure (reason) {
  return Object.freeze({ ok: false, reason })
}

export function settleAuthoringRehearsalPromotionReceipt ({ current, owner, result } = {}) {
  if (current !== owner || result?.ok !== true) return current
  return Object.freeze({ ...owner, reported: true, pendingReceipt: null })
}

function exactLocatorSet (artifacts) {
  const locators = new Map()
  const add = locator => {
    locators.set(fingerprintJson(locator), locator)
    if (locator.kind == null) {
      const wireNormalized = Object.fromEntries(Object.entries(locator).map(([key, value]) => [key, key.endsWith('Revision') ? String(value) : value]))
      locators.set(fingerprintJson(wireNormalized), Object.freeze(wireNormalized))
    }
  }
  const visit = value => {
    if (!value || typeof value !== 'object') return
    if (validateStableLocator(value).valid) {
      add(value)
      return
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child)
  }
  for (const artifact of artifacts) {
    for (const locator of [artifact.target, ...(artifact.evidenceRefs || [])]) {
      if (!validateStableLocator(locator).valid) throw new TypeError('collaboration-source-locator-invalid')
      add(locator)
    }
    visit(artifact.visiblePayload)
  }
  return Object.freeze([...locators.values()])
}

function encodeProposalBody ({ body, gain, cost }) {
  return canonicalJson({
    kind: 'authoring-rehearsal-proposal-copy',
    body: text(body, 4_000),
    gain: text(gain, 1_800),
    cost: text(cost, 1_800)
  })
}

function decodeProposalBody (value) {
  try {
    const parsed = JSON.parse(value)
    if (parsed?.kind !== 'authoring-rehearsal-proposal-copy'
      || Object.keys(parsed).sort().join(',') !== 'body,cost,gain,kind'
      || !['body', 'gain', 'cost'].every(key => typeof parsed[key] === 'string')) return null
    return parsed
  } catch {
    return null
  }
}

function sourceArtifacts (registry, sourceHandle) {
  const owned = getAuthoringRehearsalSourceArtifacts({ registry, sourceHandle })
  if (!owned?.ok) return owned || failure('collaboration-source-invalid')
  const artifacts = [owned.interventionArtifact, owned.directionSetArtifact, ...(owned.impactGroupArtifacts || [])]
  if (artifacts.some(artifact => !verifyCollaborableArtifactFingerprint(artifact))) return failure('collaboration-source-invalid')
  if (artifacts[0]?.kind !== 'intervention' || artifacts[1]?.kind !== 'direction-set'
    || artifacts.slice(2).some(artifact => artifact.kind !== 'impact-group')
    || artifacts[1].visiblePayload?.interventionArtifactFingerprint !== artifacts[0].fingerprint) {
    return failure('collaboration-source-invalid')
  }
  return Object.freeze({ ok: true, artifacts: Object.freeze(artifacts), directionSetArtifact: artifacts[1] })
}

function publicWireArtifact (value) {
  if (!value?.content) return null
  const keys = [
    'schemaVersion', 'artifactId', 'kind', 'target', 'sourceRevisions', 'evidenceRefs',
    'authority', 'fingerprint', 'baseRevision', 'content', 'expiresAt'
  ]
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
}

function createDisabledController () {
  const state = Object.freeze({
    enabled: false, role: null, connectionState: 'disabled', stale: false,
    error: null, room: null, roomSlug: '', selfMemberId: '', invite: null, members: Object.freeze([]),
    artifacts: Object.freeze({}), proposals: Object.freeze([]), votes: Object.freeze({}),
    generation: Object.freeze({ requests: Object.freeze({}) }), promotions: Object.freeze({}), retention: Object.freeze({})
  })
  const disabled = async () => failure('authoring-collaboration-disabled')
  return Object.freeze({
    state,
    subscribe: () => () => {},
    createHostRoom: disabled,
    joinGuestRoom: disabled,
    proposeDirection: disabled,
    castVote: disabled,
    selectAndGenerate: disabled,
    preparePromotion: disabled,
    reportPromotionStatus: disabled,
    disconnect: () => {},
    destroy: () => {}
  })
}

export function createAuthoringRehearsalRoomController ({
  enabled = DEFAULT_ENABLED,
  registry = null,
  endpointOverride,
  fetchImpl = globalThis.fetch,
  storage = browserSession,
  windowLike = globalThis.window,
  cryptoImpl = globalThis.crypto,
  id = prefix => `${prefix}-${cryptoImpl.randomUUID()}`,
  endpointResolver = resolveRendererCollaborationEndpoints,
  transportFactory = options => new RemoteWebSocketTransport(options),
  protocolClientFactory = options => new CollaborationProtocolClient(options),
  joinTimeoutMs = 10_000,
  timers = globalThis
} = {}) {
  if (!enabled) return createDisabledController()

  const projection = createCollaborationDomainProjection()
  const listeners = new Set()
  const state = {
    enabled: true,
    role: null,
    connectionState: 'idle',
    stale: false,
    error: null,
    room: null,
    roomSlug: '',
    selfMemberId: '',
    invite: null,
    members: [],
    artifacts: {},
    proposals: [],
    votes: {},
    generation: { requests: {} },
    promotions: {},
    retention: {}
  }
  let endpoints = null
  let transport = null
  let client = null
  let codec = null
  let contentKey = ''
  let sourceHandle = null
  let eventQueue = Promise.resolve()
  let destroyed = false
  const generated = new Map()
  const terminalPromotions = new Map()
  const pendingPromotionReports = new Map()

  const notify = () => {
    const snapshot = clone(state)
    for (const listener of listeners) listener(snapshot)
  }
  const fail = reason => {
    state.error = text(reason) || 'collaboration-room-error'
    if (/stale|expired|host-epoch/.test(state.error)) state.stale = true
    notify()
    return failure(state.error)
  }

  function syncRelayState () {
    const relay = projection.state
    state.room = relay.room ? clone(relay.room) : state.room
    state.roomSlug = state.room?.roomSlug || state.roomSlug
    state.members = clone(relay.members || [])
    state.votes = clone(relay.votes || {})
    state.promotions = clone(relay.promotions || {})
    state.retention = clone(relay.retention || {})
    if (relay.retention?.artifactsPurgedAt) {
      state.stale = true
      state.error ||= 'collaboration-content-expired'
    }
  }

  async function hydrateProjection () {
    if (!codec || !state.room?.roomId || !state.room?.shareSessionId) return
    const context = { roomId: state.room.roomId, shareSessionId: state.room.shareSessionId }
    const decodedArtifacts = {}
    for (const [artifactId, relayArtifact] of Object.entries(projection.state.artifacts || {})) {
      const wire = publicWireArtifact(relayArtifact)
      if (!wire) continue
      decodedArtifacts[artifactId] = await codec.decodeArtifact(wire, context)
    }
    const decodedProposals = []
    for (const relayProposal of projection.state.proposals || []) {
      if (!relayProposal?.content) continue
      const proposal = await codec.decodeProposal(relayProposal, context)
      const copy = decodeProposalBody(proposal.body)
      decodedProposals.push({
        ...proposal,
        ...(copy ? { body: copy.body, gain: copy.gain, cost: copy.cost } : {}),
        roomId: relayProposal.roomId,
        actorId: relayProposal.actorId,
        status: relayProposal.status,
        createdAt: relayProposal.createdAt,
        updatedAt: relayProposal.updatedAt
      })
    }
    const requests = {}
    for (const [requestId, relayRequest] of Object.entries(projection.state.generation?.requests || {})) {
      const decoded = { ...relayRequest }
      delete decoded.content
      delete decoded.actionText
      delete decoded.assistantMessage
      const wire = publicWireArtifact(relayRequest.artifact)
      if (wire) decoded.artifact = await codec.decodeArtifact(wire, context)
      else delete decoded.artifact
      requests[requestId] = decoded
    }
    state.artifacts = decodedArtifacts
    state.proposals = decodedProposals
    state.generation = { requests }
    syncRelayState()
    notify()
  }

  function enqueueHydration () {
    eventQueue = eventQueue.then(hydrateProjection).catch(error => { fail(error?.message || 'collaboration-content-invalid') })
    return eventQueue
  }

  async function ensureClient () {
    if (client) return client
    endpoints = await endpointResolver({ windowLike, locationLike: windowLike?.location, endpointOverride })
    transport = transportFactory({ url: endpoints.wsUrl })
    client = protocolClientFactory({
      transport,
      storage,
      clientBuild: import.meta.env?.VITE_APP_BUILD || 'web',
      features: ['ack-v1', 'resume-v1', 'snapshot-recovery-v1']
    })
    client.on('state', value => {
      state.connectionState = value
      if (['expired', 'resume-invalid', 'invite-revoked', 'unauthorized'].includes(value)) state.stale = true
      notify()
    })
    client.on('identity', value => { state.selfMemberId = value.memberId; notify() })
    client.on('snapshot', snapshot => {
      try { projection.applySnapshot(snapshot); syncRelayState(); enqueueHydration() } catch (error) { fail(error.message) }
    })
    client.on('event', event => {
      try { projection.applyEvent(event); syncRelayState(); enqueueHydration() } catch (error) { fail(error.message) }
    })
    client.on('error', value => { fail(value?.code || value?.message || 'collaboration-relay-error') })
    return client
  }

  function waitUntilConnected () {
    if (client?.state === 'connected') return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = timers.setTimeout(() => { off(); reject(new Error('collaboration-join-timeout')) }, joinTimeoutMs)
      const off = client.on('state', value => {
        if (value === 'connected') { timers.clearTimeout(timer); off(); resolve() }
        else if (['expired', 'resume-invalid', 'invite-revoked', 'unauthorized', 'closed'].includes(value)) {
          timers.clearTimeout(timer); off(); reject(new Error(value))
        }
      })
    })
  }

  async function connect (intent) {
    const active = await ensureClient()
    const connected = waitUntilConnected()
    await active.connect(intent)
    await connected
    await eventQueue
  }

  function assertHost () {
    return state.role === 'host'
      && state.room?.hostId === state.selfMemberId
      && Number.isSafeInteger(state.room?.hostEpoch)
      && state.room.hostEpoch > 0
      && client?.state === 'connected'
  }

  async function send (type, payload, options = {}) {
    if (!client || client.state !== 'connected') throw new Error('collaboration-not-connected')
    if (HOST_COMMANDS.has(type) && !assertHost()) throw new Error('collaboration-host-required')
    return client.sendCommand(type, payload, {
      commandId: id('command'),
      ...(HOST_COMMANDS.has(type) ? { hostEpoch: state.room.hostEpoch } : {}),
      ...options
    })
  }

  async function createHostRoom ({ sourceHandle: requestedHandle, roomSlug, displayName, shareBaseUrl } = {}) {
    if (destroyed) return failure('collaboration-controller-destroyed')
    if (typeof fetchImpl !== 'function' || !text(roomSlug) || !text(displayName)) return failure('collaboration-room-input-invalid')
    const owned = sourceArtifacts(registry, requestedHandle)
    if (!owned.ok) return owned
    state.connectionState = 'configuring'; state.error = null; state.stale = false; notify()
    try {
      await ensureClient()
      const artifacts = owned.artifacts
      const targetAllowlist = exactLocatorSet(artifacts)
      const shareSessionId = id('share')
      const manifestFingerprint = fingerprintJson({
        schemaVersion: 1,
        shareSessionId,
        roomKind: 'rehearsal',
        artifacts: artifacts.map(artifact => ({ artifactId: artifact.artifactId, fingerprint: artifact.fingerprint })),
        targetAllowlist
      })
      contentKey = await generateContentKey({ cryptoImpl })
      codec = createWebCryptoCollaborationCodec({ contentKey, cryptoImpl })
      const response = await fetchImpl(`${endpoints.httpBaseUrl}/api/collaboration/rooms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomSlug,
          roomKind: 'rehearsal',
          hostDisplayName: displayName,
          manifestFingerprint,
          shareSessionId,
          encryptionPolicy: 'aes-256-gcm',
          targetAllowlist
        })
      })
      if (!response.ok) throw new Error(`room-create-${response.status}`)
      const created = await response.json()
      if (!created?.room?.roomId || !created?.room?.hostId || !created?.host?.memberId
        || !created?.host?.resumeToken || !created?.invite?.inviteId || !created?.invite?.inviteSecret) {
        throw new Error('room-create-response-invalid')
      }
      const identity = JSON.stringify({ roomId: created.room.roomId, memberId: created.host.memberId, resumeToken: created.host.resumeToken, lastSeq: 0 })
      storage.setItem(`pinax.collaboration.session.${roomSlug}`, identity)
      storage.setItem(`pinax.collaboration.session.${created.room.roomId}`, identity)
      state.role = 'host'; state.room = clone(created.room); state.roomSlug = roomSlug; state.selfMemberId = created.host.memberId
      sourceHandle = requestedHandle
      const base = shareBaseUrl || (windowLike?.location?.protocol === 'file:' ? endpoints.httpBaseUrl : windowLike?.location?.origin)
      state.invite = {
        inviteId: created.invite.inviteId,
        expiresAt: created.invite.expiresAt,
        url: buildAuthoringRehearsalInviteUrl(base, {
          roomSlug,
          inviteId: created.invite.inviteId,
          inviteSecret: created.invite.inviteSecret,
          contentKey
        })
      }
      notify()
      await connect({ roomId: created.room.roomId, roomSlug, displayName })
      for (const artifact of artifacts) {
        const wire = await codec.encodeArtifact(artifact, {
          roomId: created.room.roomId,
          shareSessionId,
          baseRevision: revision(artifact.target)
        })
        await send('artifact.publish', { shareSessionId, manifestFingerprint, artifact: wire })
      }
      return Object.freeze({ ok: true, room: clone(state.room), invite: clone(state.invite), targetAllowlist })
    } catch (error) {
      return fail(error?.ack?.code || error?.message)
    }
  }

  async function joinGuestRoom ({ invite, displayName } = {}) {
    if (destroyed) return failure('collaboration-controller-destroyed')
    if (!invite?.roomSlug || !invite?.inviteId || !invite?.inviteSecret || !invite?.contentKey || !text(displayName)) return failure('collaboration-invite-fields-required')
    state.connectionState = 'configuring'; state.error = null; state.stale = false; state.role = 'reviewer'; state.roomSlug = invite.roomSlug; notify()
    try {
      contentKey = invite.contentKey
      codec = createWebCryptoCollaborationCodec({ contentKey, cryptoImpl })
      await connect({ roomSlug: invite.roomSlug, inviteId: invite.inviteId, inviteSecret: invite.inviteSecret, displayName })
      await eventQueue
      if (state.error) throw new Error(state.error)
      if (!state.room?.roomId || state.room.roomKind !== 'rehearsal') throw new Error('collaboration-room-kind-invalid')
      return Object.freeze({ ok: true, room: clone(state.room) })
    } catch (error) {
      return fail(error?.message)
    }
  }

  async function proposeDirection ({ directionId, body, gain, cost } = {}) {
    if (!['host', 'reviewer'].includes(state.role) || client?.state !== 'connected') return failure('collaboration-member-required')
    const directionArtifact = Object.values(state.artifacts).find(artifact => artifact.kind === 'direction-set')
    const bound = createAuthoringDirectionProposalBinding({ directionSetArtifact: directionArtifact, directionId })
    if (!bound.ok) return bound
    const proposal = {
      id: id('proposal'),
      kind: 'direction',
      target: directionArtifact.target,
      baseRevision: revision(directionArtifact.target),
      evidenceRefs: directionArtifact.evidenceRefs,
      body: encodeProposalBody({
        body: text(body, 4_000) || text(directionArtifact.visiblePayload.directions.find(item => item.directionId === directionId)?.label, 4_000),
        gain,
        cost
      }),
      binding: bound.binding
    }
    try {
      const wire = await codec.encodeProposal(proposal, { roomId: state.room.roomId, shareSessionId: state.room.shareSessionId })
      await send('proposal.create', { proposal: wire })
      return Object.freeze({ ok: true, proposalId: proposal.id })
    } catch (error) {
      return fail(error?.ack?.code || error?.message)
    }
  }

  async function castVote ({ proposalId, value = 'up' } = {}) {
    if (!['host', 'reviewer'].includes(state.role) || !text(proposalId)) return failure('collaboration-member-required')
    try { await send('vote.cast', { proposalId, value }); return Object.freeze({ ok: true }) } catch (error) { return fail(error?.ack?.code || error?.message) }
  }

  async function selectAndGenerate ({ proposalId } = {}) {
    if (!assertHost()) return failure('collaboration-generation-host-required')
    if (generated.has(proposalId)) return generated.get(proposalId)
    const pending = (async () => {
      const proposal = state.proposals.find(item => item.id === proposalId)
      if (!proposal?.binding || proposal.status !== 'open') return failure('collaboration-generation-source-invalid')
      const selected = Object.freeze({ ...proposal, status: 'selected' })
      const requestId = id('generation')
      try {
        await send('proposal.status', { proposalId, status: 'selected' })
        await send('generation.request', {
          requestId,
          proposalId,
          target: proposal.target,
          shareSessionId: state.room.shareSessionId,
          manifestFingerprint: state.room.manifestFingerprint
        })
        const local = await registry.runSelectedProposal({
          actorRole: 'host',
          room: state.room,
          proposal: selected,
          proposalBinding: proposal.binding,
          generationRequestId: requestId,
          sourceHandle
        })
        if (!local.ok) {
          await send('generation.terminate', { requestId, status: local.reason?.includes('stale') ? 'stale' : 'failed', code: local.reason?.includes('stale') ? 'stale-revision' : 'provider-error' })
          return local
        }
        const wire = await codec.encodeArtifact(local.artifact, {
          roomId: state.room.roomId,
          shareSessionId: state.room.shareSessionId,
          baseRevision: revision(local.artifact.target)
        })
        await send('generation.complete', { requestId, proposalId, artifact: wire })
        return Object.freeze({ ok: true, requestId, artifact: local.artifact })
      } catch (error) {
        return fail(error?.ack?.code || error?.message)
      }
    })()
    generated.set(proposalId, pending)
    return pending
  }

  async function preparePromotion ({ proposalId, generationRequestId } = {}) {
    if (!assertHost()) return failure('collaboration-promotion-host-required')
    const proposal = state.proposals.find(item => item.id === proposalId)
    const artifact = state.generation.requests[generationRequestId]?.artifact
    if (!proposal || proposal.status !== 'selected' || !artifact) return failure('collaboration-promotion-source-invalid')
    const selected = Object.freeze({ ...proposal, status: 'selected' })
    const created = await createCollaborationPromotionRequest({
      registry,
      room: state.room,
      proposal: selected,
      proposalBinding: proposal.binding,
      artifact,
      generationRequestId
    })
    if (!created.ok) return created
    const prepared = await preflightAuthoringRehearsalPromotion({
      registry,
      request: created.request,
      room: state.room,
      proposal: selected,
      proposalBinding: proposal.binding,
      artifact
    })
    if (!prepared.ok) return prepared
    try {
      await send('promotion.request', { request: created.request })
      return prepared
    } catch (error) {
      return fail(error?.ack?.code || error?.message)
    }
  }

  async function reportPromotionStatus ({ proposalId, artifactFingerprint, status, receipt } = {}) {
    if (!assertHost()) return failure('collaboration-promotion-host-required')
    const key = `${proposalId}:${artifactFingerprint}`
    if (terminalPromotions.has(key)) return terminalPromotions.get(key)
    if (pendingPromotionReports.has(key)) return pendingPromotionReports.get(key)
    const pending = (async () => {
      try {
        const ack = await send('promotion.status', { proposalId, artifactFingerprint, status, receipt })
        if (ack?.status !== 'accepted') return fail(ack?.code || 'collaboration-promotion-status-not-accepted')
        const accepted = Object.freeze({ ok: true, status })
        terminalPromotions.set(key, accepted)
        return accepted
      } catch (error) {
        return fail(error?.ack?.code || error?.message)
      } finally {
        if (pendingPromotionReports.get(key) === pending) pendingPromotionReports.delete(key)
      }
    })()
    pendingPromotionReports.set(key, pending)
    return pending
  }

  function disconnect () {
    client?.close()
    state.connectionState = 'closed'
    notify()
  }

  function destroy () {
    destroyed = true
    client?.destroy()
    listeners.clear()
    state.connectionState = 'closed'
  }

  return Object.freeze({
    state,
    subscribe (listener) { if (typeof listener !== 'function') throw new TypeError('collaboration-listener-required'); listeners.add(listener); return () => listeners.delete(listener) },
    createHostRoom,
    joinGuestRoom,
    proposeDirection,
    castVote,
    selectAndGenerate,
    preparePromotion,
    reportPromotionStatus,
    disconnect,
    destroy
  })
}
