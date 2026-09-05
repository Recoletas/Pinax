import { canonicalJson, fingerprintJson } from '../../../shared/collaboration/canonicalJson.js'
import { validateCollaborableArtifact } from '../../../shared/collaboration/contracts.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const bytesToBase64 = bytes => {
  if (typeof globalThis.Buffer !== 'undefined') return globalThis.Buffer.from(bytes).toString('base64')
  let value = ''; for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value)
}
const base64ToBytes = value => {
  if (typeof globalThis.Buffer !== 'undefined') return new Uint8Array(globalThis.Buffer.from(value, 'base64'))
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}
const keyBytes = value => base64ToBytes(String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '='))
const DIRECTION_BINDING_KIND = 'authoring-rehearsal-direction-proposal'
const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/

function isValidDirectionBinding (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (Object.keys(value).sort().join(',') !== 'directionId,directionSetArtifactFingerprint,kind') return false
  return value.kind === DIRECTION_BINDING_KIND &&
    typeof value.directionId === 'string' &&
    value.directionId.trim().length > 0 &&
    value.directionId.length <= 120 &&
    SHA256_FINGERPRINT_PATTERN.test(value.directionSetArtifactFingerprint)
}

export function canonicalCollaborationAad ({ roomId, shareSessionId, contentType, target = null, kind = null, fingerprint = null }) {
  return canonicalJson({ schemaVersion: 1, roomId, shareSessionId, contentType, target, kind, fingerprint })
}

export async function generateContentKey ({ cryptoImpl = globalThis.crypto } = {}) {
  const bytes = new Uint8Array(32); cryptoImpl.getRandomValues(bytes)
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createWebCryptoCollaborationCodec ({ contentKey, cryptoImpl = globalThis.crypto } = {}) {
  if (!cryptoImpl?.subtle || keyBytes(contentKey).byteLength !== 32) throw new TypeError('content-key-must-be-256-bit')
  const imported = cryptoImpl.subtle.importKey('raw', keyBytes(contentKey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  async function encrypt (logical, metadata) {
    const key = await imported; const nonce = new Uint8Array(12); cryptoImpl.getRandomValues(nonce)
    const aad = encoder.encode(canonicalCollaborationAad(metadata))
    const sealed = new Uint8Array(await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, encoder.encode(canonicalJson(logical))))
    return { schemaVersion: 1, encryption: 'aes-256-gcm', nonceBase64: bytesToBase64(nonce), ciphertextBase64: bytesToBase64(sealed.slice(0, -16)), authTagBase64: bytesToBase64(sealed.slice(-16)) }
  }
  async function decrypt (wire, metadata) {
    const key = await imported; const ciphertext = base64ToBytes(wire.ciphertextBase64); const tag = base64ToBytes(wire.authTagBase64); const sealed = new Uint8Array(ciphertext.length + tag.length); sealed.set(ciphertext); sealed.set(tag, ciphertext.length)
    const plaintext = await cryptoImpl.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(wire.nonceBase64), additionalData: encoder.encode(canonicalCollaborationAad(metadata)), tagLength: 128 }, key, sealed)
    return JSON.parse(decoder.decode(plaintext))
  }
  async function encodeArtifact (artifact, { roomId, shareSessionId, baseRevision, expiresAt = null }) {
    if (!validateCollaborableArtifact(artifact).valid) throw new TypeError('invalid-collaborable-artifact')
    const metadata = { roomId, shareSessionId, contentType: 'artifact', target: artifact.target, kind: artifact.kind, fingerprint: artifact.fingerprint }
    const content = await encrypt({ visiblePayload: artifact.visiblePayload }, metadata)
    return { schemaVersion: 1, artifactId: artifact.artifactId, kind: artifact.kind, target: artifact.target, sourceRevisions: artifact.sourceRevisions, evidenceRefs: artifact.evidenceRefs, authority: artifact.authority, fingerprint: artifact.fingerprint, baseRevision, content, ...(expiresAt ? { expiresAt } : {}) }
  }
  async function decodeArtifact (wire, { roomId, shareSessionId }) {
    const metadata = { roomId, shareSessionId, contentType: 'artifact', target: wire.target, kind: wire.kind, fingerprint: wire.fingerprint }
    const logical = await decrypt(wire.content, metadata)
    const artifact = { schemaVersion: wire.schemaVersion, artifactId: wire.artifactId, kind: wire.kind, target: wire.target, sourceRevisions: wire.sourceRevisions, evidenceRefs: wire.evidenceRefs, visiblePayload: logical.visiblePayload, authority: wire.authority, fingerprint: wire.fingerprint }
    if (fingerprintJson(Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== 'fingerprint'))) !== artifact.fingerprint || !validateCollaborableArtifact(artifact).valid) throw new Error('artifact-fingerprint-mismatch')
    return artifact
  }
  async function encodeProposal (proposal, context) {
    if (proposal.binding !== undefined && !isValidDirectionBinding(proposal.binding)) throw new TypeError('proposal-binding-schema-invalid')
    const metadata = { ...context, contentType: 'proposal', target: proposal.target, kind: proposal.kind, fingerprint: null }
    const logical = { body: proposal.body, replacementText: proposal.replacementText || null, ...(proposal.binding === undefined ? {} : { binding: proposal.binding }) }
    return { id: proposal.id, kind: proposal.kind, target: proposal.target, baseRevision: proposal.baseRevision, evidenceRefs: proposal.evidenceRefs || [], content: await encrypt(logical, metadata) }
  }
  async function decodeProposal (wire, context) {
    const logical = await decrypt(wire.content, { ...context, contentType: 'proposal', target: wire.target, kind: wire.kind, fingerprint: null })
    if (!logical || typeof logical !== 'object' || Array.isArray(logical) || Object.keys(logical).some(key => !['body', 'replacementText', 'binding'].includes(key)) || typeof logical.body !== 'string' || (logical.replacementText != null && typeof logical.replacementText !== 'string') || (logical.binding !== undefined && !isValidDirectionBinding(logical.binding))) throw new Error('proposal-plaintext-schema-invalid')
    return { id: wire.id, kind: wire.kind, target: wire.target, baseRevision: wire.baseRevision, evidenceRefs: wire.evidenceRefs || [], body: logical.body, replacementText: logical.replacementText || null, ...(logical.binding === undefined ? {} : { binding: logical.binding }) }
  }
  async function encodeComment (comment, context) { return { target: comment.target, content: await encrypt({ body: comment.body }, { ...context, contentType: 'comment', target: comment.target, kind: 'comment', fingerprint: null }) } }
  async function decodeComment (wire, context) { const logical = await decrypt(wire.content, { ...context, contentType: 'comment', target: wire.target, kind: 'comment', fingerprint: null }); if (!logical || typeof logical !== 'object' || Array.isArray(logical) || Object.keys(logical).some(key => key !== 'body') || typeof logical.body !== 'string') throw new Error('comment-plaintext-schema-invalid'); return { target: wire.target, body: logical.body } }
  return Object.freeze({ encrypt, decrypt, encodeArtifact, decodeArtifact, encodeProposal, decodeProposal, encodeComment, decodeComment })
}
