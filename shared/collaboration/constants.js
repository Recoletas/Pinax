export const COLLABORATION_PROTOCOL_VERSION = 2
export const COLLABORATION_PROTOCOL_MIN = 2

export const ROOM_KINDS = Object.freeze(['experience', 'rehearsal', 'authoring-review'])
export const MEMBER_ROLES = Object.freeze(['host', 'reviewer', 'spectator', 'editor'])
export const PROPOSAL_KINDS = Object.freeze(['comment', 'direction', 'rewrite', 'impact-decision', 'visual-vote'])
export const PROPOSAL_STATUSES = Object.freeze(['open', 'selected', 'rejected', 'withdrawn', 'stale', 'adopted'])
export const ARTIFACT_KINDS = Object.freeze(['intervention', 'direction-set', 'impact-group', 'rehearsal-branch'])
export const ARTIFACT_AUTHORITIES = Object.freeze(['author-frozen', 'derived-established', 'derived-plausible'])
export const SHARE_SCOPE_KINDS = Object.freeze(['current-unit', 'current-scene', 'evidence-answer', 'impact-group', 'rehearsal-branch', 'visual-candidate'])
export const EVIDENCE_LOCATOR_KINDS = Object.freeze([
  'manuscript', 'worldbook-entry', 'outline-node', 'exploration',
  'memory-source', 'history', 'scene'
])
export const GENERATION_TERMINAL_STATUSES = Object.freeze(['failed', 'stale'])
export const GENERATION_TERMINAL_CODES = Object.freeze([
  'provider-error', 'cancelled', 'host-lost', 'stale-revision', 'artifact-invalid'
])
export const PROMOTION_TERMINAL_STATUSES = Object.freeze(['adopted', 'rejected', 'stale'])
export const PROMOTION_RECEIPT_CODES = Object.freeze([
  'adopted', 'rejected', 'cancelled', 'stale-revision', 'artifact-invalid', 'local-preflight-failed'
])

export const CAPABILITIES_BY_ROLE = Object.freeze({
  host: Object.freeze(['room:read', 'comment:create', 'proposal:create', 'proposal:vote', 'proposal:moderate', 'artifact:publish', 'generation:request', 'generation:complete', 'promotion:request', 'promotion:status', 'room:admin']),
  reviewer: Object.freeze(['room:read', 'comment:create', 'proposal:create', 'proposal:vote']),
  spectator: Object.freeze(['room:read']),
  // Reserved by the protocol. C2 does not expose direct project editing.
  editor: Object.freeze(['room:read', 'comment:create', 'proposal:create', 'proposal:vote'])
})

export const COMMAND_CAPABILITIES = Object.freeze({
  'chat.send': 'comment:create',
  'proposal.create': 'proposal:create',
  'proposal.status': 'proposal:moderate',
  'vote.cast': 'proposal:vote',
  'artifact.publish': 'artifact:publish',
  'generation.request': 'generation:request',
  'generation.complete': 'generation:complete',
  'generation.status': 'generation:complete',
  'generation.terminate': 'generation:complete',
  'experience.runtime.patch.accept': 'generation:complete',
  'promotion.request': 'promotion:request',
  'promotion.status': 'promotion:status'
})

export const COLLABORATION_LIMITS = Object.freeze({
  wsMaxPayloadBytes: 64 * 1024,
  maxPayloadBytes: 48 * 1024,
  maxCiphertextBytes: 40 * 1024,
  maxStringLength: 20_000,
  maxBodyLength: 8_000,
  maxArrayLength: 64,
  maxObjectKeys: 64,
  maxDepth: 8,
  maxMembersPerRoom: 6,
  maxActiveRooms: 500,
  maxArtifactsPerRoom: 32,
  maxEventsPerRoom: 2_000,
  defaultRoomTtlMs: 24 * 60 * 60 * 1000,
  defaultInviteTtlMs: 60 * 60 * 1000,
  defaultArtifactTtlMs: 24 * 60 * 60 * 1000,
  defaultCommentTtlMs: 24 * 60 * 60 * 1000,
  disconnectGraceMs: 30_000,
  resumeTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  previousResumeReplayTtlMs: 30_000,
  idempotencyTtlMs: 30 * 24 * 60 * 60 * 1000,
  ratePerIpPerMinute: 120,
  ratePerRoomPerMinute: 300,
  ratePerMemberPerMinute: 90
})

export const LOCATOR_KEYS = Object.freeze([
  'kind',
  'projectFingerprint', 'documentId', 'documentRevision', 'unitId', 'unitRevision',
  'nodeId', 'nodeRevision', 'artifactId', 'artifactRevision', 'startOffset', 'endOffset',
  'sourceRevision', 'chapterId', 'worldbookId', 'entryId', 'memoryId',
  'historyId', 'anchorId'
])

export const EXPERIENCE_RUNTIME_PATHS = Object.freeze([
  'writingCharacter', 'writingTime', 'placeStates', 'characterStates', 'characterRelations',
  'canonicalFacts', 'worldMapState', 'goals', 'encounteredCharacters', 'factionRelations',
  'keyChoices', 'plotJournal', 'activities'
])

export const REJECT_CODES = Object.freeze([
  'invalid-envelope', 'invalid-payload', 'payload-too-large', 'payload-too-deep',
  'unknown-command', 'unauthorized', 'stale-host-epoch', 'stale-revision',
  'not-found', 'conflict', 'expired', 'invite-invalid', 'invite-expired',
  'invite-revoked', 'resume-invalid', 'rate-limited', 'quota-exceeded',
  'upgrade-required', 'feature-unsupported', 'seq-gap', 'nonce-reused'
])
