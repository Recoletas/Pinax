import {
  ARTIFACT_AUTHORITIES, ARTIFACT_KINDS, COLLABORATION_LIMITS, COLLABORATION_PROTOCOL_MIN,
  COLLABORATION_PROTOCOL_VERSION, EVIDENCE_LOCATOR_KINDS, LOCATOR_KEYS, MEMBER_ROLES,
  PROPOSAL_KINDS, PROPOSAL_STATUSES, PROMOTION_RECEIPT_CODES,
  PROMOTION_TERMINAL_STATUSES, REJECT_CODES, ROOM_KINDS, SHARE_SCOPE_KINDS
} from './constants.js'
import { fingerprintJson } from './canonicalJson.js'

const setOf = values => new Set(values)
const ROOM_KIND_SET = setOf(ROOM_KINDS)
const ROLE_SET = setOf(MEMBER_ROLES)
const PROPOSAL_KIND_SET = setOf(PROPOSAL_KINDS)
const PROPOSAL_STATUS_SET = setOf(PROPOSAL_STATUSES)
const ARTIFACT_KIND_SET = setOf(ARTIFACT_KINDS)
const AUTHORITY_SET = setOf(ARTIFACT_AUTHORITIES)
const SCOPE_KIND_SET = setOf(SHARE_SCOPE_KINDS)
const REJECT_SET = setOf(REJECT_CODES)
const LOCATOR_KEY_SET = setOf(LOCATOR_KEYS)
const LEGACY_LOCATOR_KEY_SET = setOf([
  'projectFingerprint', 'documentId', 'documentRevision', 'unitId', 'unitRevision',
  'nodeId', 'nodeRevision', 'artifactId', 'artifactRevision', 'startOffset', 'endOffset'
])
const EVIDENCE_LOCATOR_KIND_SET = setOf(EVIDENCE_LOCATOR_KINDS)
const PROMOTION_STATUS_SET = setOf(PROMOTION_TERMINAL_STATUSES)
const PROMOTION_RECEIPT_CODE_SET = setOf(PROMOTION_RECEIPT_CODES)

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const onlyKeys = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key))
const text = (value, max = 160) => typeof value === 'string' && value.length > 0 && value.length <= max
const revision = value => (typeof value === 'string' && value.length > 0 && value.length <= 160) || Number.isSafeInteger(value)
const isoDate = value => text(value, 40) && Number.isFinite(Date.parse(value))
const result = (valid, reason = null, value = null) => valid ? { valid: true, value } : { valid: false, reason }

export function validateStableLocator(locator) {
  if (!object(locator)) return result(false, 'locator-required')
  const keys = Object.keys(locator)
  if (!keys.length || keys.some(key => !LOCATOR_KEY_SET.has(key))) return result(false, 'locator-path-not-allowed')
  if (locator.kind != null) return validateEvidenceLocator(locator)
  if (keys.some(key => !LEGACY_LOCATOR_KEY_SET.has(key))) return result(false, 'locator-path-not-allowed')
  if (!keys.some(key => key.endsWith('Id') || key === 'projectFingerprint')) return result(false, 'locator-identity-required')
  if (!keys.some(key => key.endsWith('Revision'))) return result(false, 'locator-revision-required')
  for (const [key, value] of Object.entries(locator)) {
    if (key.endsWith('Offset')) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) return result(false, 'locator-offset-invalid')
    } else if (key.endsWith('Revision')) {
      if (!revision(value)) return result(false, 'locator-revision-invalid')
    } else if (!text(value, 240)) return result(false, 'locator-value-invalid')
  }
  return result(true, null, locator)
}

function validateEvidenceLocator(locator) {
  if (!EVIDENCE_LOCATOR_KIND_SET.has(locator.kind)) return result(false, 'locator-kind-invalid')
  const common = ['kind', 'projectFingerprint', 'sourceRevision']
  const schemas = {
    manuscript: [...common, 'documentId', 'chapterId', 'unitId', 'nodeId', 'startOffset', 'endOffset'],
    'worldbook-entry': [...common, 'worldbookId', 'entryId'],
    'outline-node': [...common, 'nodeId'],
    exploration: [...common, 'documentId'],
    'memory-source': [...common, 'memoryId'],
    history: [...common, 'historyId'],
    scene: [...common, 'chapterId', 'unitId', 'anchorId']
  }
  const required = {
    manuscript: ['projectFingerprint', 'sourceRevision', 'documentId', 'chapterId'],
    'worldbook-entry': ['projectFingerprint', 'sourceRevision', 'worldbookId', 'entryId'],
    'outline-node': ['projectFingerprint', 'sourceRevision', 'nodeId'],
    exploration: ['projectFingerprint', 'sourceRevision', 'documentId'],
    'memory-source': ['projectFingerprint', 'sourceRevision', 'memoryId'],
    history: ['projectFingerprint', 'sourceRevision', 'historyId'],
    scene: ['projectFingerprint', 'sourceRevision', 'chapterId', 'unitId']
  }
  if (!onlyKeys(locator, schemas[locator.kind]) || required[locator.kind].some(key => !(key in locator))) return result(false, 'locator-shape-invalid')
  if (locator.kind === 'manuscript' && 'nodeId' in locator && !('unitId' in locator)) return result(false, 'locator-shape-invalid')
  if ('endOffset' in locator && !('startOffset' in locator)) return result(false, 'locator-shape-invalid')
  if ('startOffset' in locator && (!Number.isSafeInteger(locator.startOffset) || locator.startOffset < 0 || locator.startOffset > 1_000_000)) return result(false, 'locator-offset-invalid')
  if ('endOffset' in locator && (!Number.isSafeInteger(locator.endOffset) || locator.endOffset < locator.startOffset || locator.endOffset > 1_000_000)) return result(false, 'locator-offset-invalid')
  for (const [key, value] of Object.entries(locator)) {
    if (key === 'kind' || key.endsWith('Offset')) continue
    if (key === 'sourceRevision' ? !revision(value) : !text(value, 160)) return result(false, key === 'sourceRevision' ? 'locator-revision-invalid' : 'locator-value-invalid')
  }
  return result(true, null, locator)
}

function validateSourceRevisions(value) {
  if (!object(value) || Object.keys(value).length > 64) return false
  return Object.entries(value).every(([key, item]) => text(key, 240) && revision(item))
}

function fingerprintMatches(value) {
  if (!object(value) || !text(value.fingerprint, 80)) return false
  const { fingerprint, ...unsigned } = value
  try { return fingerprint === fingerprintJson(unsigned) } catch { return false }
}

export function validateEncryptedContent(value) {
  if (!onlyKeys(value, ['schemaVersion', 'encryption', 'nonceBase64', 'ciphertextBase64', 'authTagBase64'])) return result(false, 'ciphertext-schema-invalid')
  if (value.schemaVersion !== 1 || value.encryption !== 'aes-256-gcm') return result(false, 'ciphertext-algorithm-invalid')
  if (![value.nonceBase64, value.ciphertextBase64, value.authTagBase64].every(item => typeof item === 'string' && item.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(item))) return result(false, 'ciphertext-encoding-invalid')
  const bytes = encoded => Math.floor(encoded.length * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0)
  if (bytes(value.nonceBase64) !== 12 || bytes(value.authTagBase64) !== 16 || bytes(value.ciphertextBase64) > COLLABORATION_LIMITS.maxCiphertextBytes) return result(false, 'ciphertext-size-invalid')
  return result(true, null, value)
}

export function validateWireProposal(value) {
  if (!onlyKeys(value, ['id', 'kind', 'target', 'baseRevision', 'evidenceRefs', 'content'])) return result(false, 'wire-proposal-schema-invalid')
  if (!text(value.id) || !PROPOSAL_KIND_SET.has(value.kind) || !revision(value.baseRevision)) return result(false, 'wire-proposal-invalid')
  if (!validateStableLocator(value.target).valid || !validateEncryptedContent(value.content).valid) return result(false, 'wire-proposal-content-invalid')
  if (value.evidenceRefs && (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.some(ref => !validateStableLocator(ref).valid))) return result(false, 'wire-proposal-evidence-invalid')
  return result(true, null, value)
}

export function validateWireArtifact(value) {
  if (!onlyKeys(value, ['schemaVersion', 'artifactId', 'kind', 'target', 'sourceRevisions', 'evidenceRefs', 'authority', 'fingerprint', 'baseRevision', 'content', 'expiresAt'])) return result(false, 'wire-artifact-schema-invalid')
  if (value.schemaVersion !== 1 || !text(value.artifactId) || !ARTIFACT_KIND_SET.has(value.kind) || !AUTHORITY_SET.has(value.authority)) return result(false, 'wire-artifact-invalid')
  if (!validateStableLocator(value.target).valid || !validateSourceRevisions(value.sourceRevisions) || !revision(value.baseRevision)) return result(false, 'wire-artifact-target-invalid')
  if (!text(value.fingerprint, 80) || !validateEncryptedContent(value.content).valid) return result(false, 'wire-artifact-content-invalid')
  if (value.expiresAt != null && !isoDate(value.expiresAt)) return result(false, 'wire-artifact-expiry-invalid')
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.some(ref => !validateStableLocator(ref).valid)) return result(false, 'wire-artifact-evidence-invalid')
  return result(true, null, value)
}

export function validateCollaborableArtifact(value) {
  if (!object(value) || value.schemaVersion !== 1) return result(false, 'artifact-version-invalid')
  if (!onlyKeys(value, ['schemaVersion', 'artifactId', 'kind', 'target', 'sourceRevisions', 'evidenceRefs', 'visiblePayload', 'authority', 'fingerprint'])) return result(false, 'artifact-schema-invalid')
  if (!text(value.artifactId) || !ARTIFACT_KIND_SET.has(value.kind)) return result(false, 'artifact-identity-invalid')
  const target = validateStableLocator(value.target)
  if (!target.valid || !validateSourceRevisions(value.sourceRevisions)) return result(false, target.reason || 'artifact-revisions-invalid')
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 64 || value.evidenceRefs.some(ref => !validateStableLocator(ref).valid)) return result(false, 'artifact-evidence-invalid')
  if (!AUTHORITY_SET.has(value.authority) || !fingerprintMatches(value)) return result(false, 'artifact-fingerprint-invalid')
  return result(true, null, value)
}

export function validateShareManifest(value) {
  if (!object(value) || value.schemaVersion !== 1 || !text(value.shareSessionId)) return result(false, 'manifest-version-invalid')
  if (!onlyKeys(value, ['schemaVersion', 'shareSessionId', 'roomKind', 'projectFingerprint', 'scope', 'visibleArtifacts', 'redactions', 'expiresAt', 'fingerprint'])) return result(false, 'manifest-schema-invalid')
  if (!['authoring-review', 'rehearsal'].includes(value.roomKind) || !text(value.projectFingerprint, 160)) return result(false, 'manifest-room-invalid')
  if (!object(value.scope) || !SCOPE_KIND_SET.has(value.scope.kind) || !validateSourceRevisions(value.scope.sourceRevisions)) return result(false, 'manifest-scope-invalid')
  if (value.scope.documentRef && !validateStableLocator(value.scope.documentRef).valid) return result(false, 'manifest-document-ref-invalid')
  if (value.scope.unitRefs && (!Array.isArray(value.scope.unitRefs) || value.scope.unitRefs.some(ref => !validateStableLocator(ref).valid))) return result(false, 'manifest-unit-refs-invalid')
  if (!Array.isArray(value.visibleArtifacts) || value.visibleArtifacts.length > COLLABORATION_LIMITS.maxArtifactsPerRoom || value.visibleArtifacts.some(item => !validateCollaborableArtifact(item).valid)) return result(false, 'manifest-artifacts-invalid')
  if (!Array.isArray(value.redactions) || value.redactions.some(item => !text(item, 240)) || !isoDate(value.expiresAt)) return result(false, 'manifest-retention-invalid')
  if (!fingerprintMatches(value)) return result(false, 'manifest-fingerprint-invalid')
  return result(true, null, value)
}

export function validateProposal(value) {
  if (!object(value) || !text(value.id) || !text(value.roomId) || !text(value.actorId)) return result(false, 'proposal-identity-invalid')
  if (!onlyKeys(value, ['id', 'roomId', 'actorId', 'kind', 'target', 'baseRevision', 'body', 'replacementText', 'evidenceRefs', 'status', 'createdAt', 'updatedAt'])) return result(false, 'proposal-schema-invalid')
  if (!PROPOSAL_KIND_SET.has(value.kind) || !PROPOSAL_STATUS_SET.has(value.status)) return result(false, 'proposal-state-invalid')
  if (!validateStableLocator(value.target).valid || !revision(value.baseRevision)) return result(false, 'proposal-target-invalid')
  if (!text(value.body, COLLABORATION_LIMITS.maxBodyLength)) return result(false, 'proposal-body-invalid')
  if (value.replacementText != null && !text(value.replacementText, COLLABORATION_LIMITS.maxBodyLength)) return result(false, 'proposal-replacement-invalid')
  if (value.evidenceRefs && (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 64 || value.evidenceRefs.some(ref => !validateStableLocator(ref).valid))) return result(false, 'proposal-evidence-invalid')
  if (!isoDate(value.createdAt) || !isoDate(value.updatedAt)) return result(false, 'proposal-time-invalid')
  return result(true, null, value)
}

export function validatePromotionRequest(value) {
  if (!object(value) || !['roomId', 'shareSessionId', 'proposalId', 'artifactId', 'artifactFingerprint', 'generationRequestId', 'sourceRevisionFingerprint', 'liveRevisionFingerprint'].every(key => text(value[key], 240))) return result(false, 'promotion-identity-invalid')
  if (!onlyKeys(value, ['roomId', 'shareSessionId', 'proposalId', 'artifactId', 'artifactFingerprint', 'generationRequestId', 'sourceRevisionFingerprint', 'liveRevisionFingerprint', 'hostEpoch', 'liveTargetRevision'])) return result(false, 'promotion-schema-invalid')
  if (!Number.isSafeInteger(value.hostEpoch) || value.hostEpoch < 1 || !revision(value.liveTargetRevision)) return result(false, 'promotion-fence-invalid')
  if (![value.artifactFingerprint, value.sourceRevisionFingerprint, value.liveRevisionFingerprint].every(item => /^sha256:[0-9a-f]{64}$/.test(item))) return result(false, 'promotion-fingerprint-invalid')
  return result(true, null, value)
}

export function validatePromotionReceipt(value) {
  if (!onlyKeys(value, ['code', 'targetCount'])) return result(false, 'promotion-receipt-schema-invalid')
  if (!PROMOTION_RECEIPT_CODE_SET.has(value.code)) return result(false, 'promotion-receipt-code-invalid')
  if (value.targetCount != null && (!Number.isSafeInteger(value.targetCount) || value.targetCount < 0 || value.targetCount > 64)) return result(false, 'promotion-receipt-count-invalid')
  return result(true, null, value)
}

export function validatePromotionStatus(value) {
  if (!onlyKeys(value, ['proposalId', 'artifactFingerprint', 'status', 'receipt'])) return result(false, 'promotion-status-schema-invalid')
  if (!text(value.proposalId, 240) || !/^sha256:[0-9a-f]{64}$/.test(value.artifactFingerprint) || !PROMOTION_STATUS_SET.has(value.status)) return result(false, 'promotion-status-invalid')
  const receipt = validatePromotionReceipt(value.receipt)
  const allowedCodes = value.status === 'adopted'
    ? new Set(['adopted'])
    : value.status === 'stale'
      ? new Set(['stale-revision'])
      : new Set(['rejected', 'cancelled', 'artifact-invalid', 'local-preflight-failed'])
  if (!receipt.valid || !allowedCodes.has(value.receipt.code)) return result(false, 'promotion-status-receipt-invalid')
  return result(true, null, value)
}

export function validateEnvelope(value) {
  if (!object(value) || value.protocolVersion !== COLLABORATION_PROTOCOL_VERSION) return result(false, 'invalid-envelope')
  if (!text(value.type, 120) || !text(value.commandId, 160) || !text(value.roomId, 160)) return result(false, 'invalid-envelope')
  if (!object(value.payload)) return result(false, 'invalid-envelope')
  if (value.hostEpoch != null && (!Number.isSafeInteger(value.hostEpoch) || value.hostEpoch < 1)) return result(false, 'invalid-envelope')
  return result(true, null, value)
}

export function acceptedAck({ commandId, roomId, seq = null, duplicate = false }) {
  return { protocolVersion: 2, type: 'command.ack', status: 'accepted', commandId, roomId, seq, duplicate }
}

export function rejectedAck({ commandId, roomId, code, message = '' }) {
  return { protocolVersion: 2, type: 'command.ack', status: 'rejected', commandId: String(commandId || ''), roomId: String(roomId || ''), code: REJECT_SET.has(code) ? code : 'invalid-payload', message: String(message).slice(0, 240) }
}

export function negotiateProtocol({ protocolVersion, minProtocolVersion = protocolVersion, features = [] } = {}, serverFeatures = []) {
  if (!Number.isSafeInteger(protocolVersion) || protocolVersion < COLLABORATION_PROTOCOL_MIN || minProtocolVersion > COLLABORATION_PROTOCOL_VERSION) {
    return { accepted: false, code: 'upgrade-required', protocolVersion: COLLABORATION_PROTOCOL_VERSION }
  }
  const unsupported = features.filter(feature => !serverFeatures.includes(feature))
  return unsupported.length
    ? { accepted: false, code: 'feature-unsupported', unsupported, protocolVersion: COLLABORATION_PROTOCOL_VERSION }
    : { accepted: true, protocolVersion: COLLABORATION_PROTOCOL_VERSION, features: features.filter(feature => serverFeatures.includes(feature)) }
}

export function validateRoomIdentity({ roomKind, role }) {
  return result(ROOM_KIND_SET.has(roomKind) && ROLE_SET.has(role), 'room-identity-invalid')
}
