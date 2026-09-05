import { withFingerprint } from './canonicalJson.js'

export const stableLocatorFixture = Object.freeze({
  projectFingerprint: 'project:fixture',
  documentId: 'doc-1',
  documentRevision: 7,
  unitId: 'unit-2',
  unitRevision: 3,
  nodeId: 'node-4',
  nodeRevision: 9,
  startOffset: 2,
  endOffset: 18
})

// Persisted protocol-v2 locators predate typed evidence locators. Their permissive
// no-kind semantics remain wire compatible; new F3 adapters must emit typed shapes.
export const legacyStableLocatorFixtures = Object.freeze([
  Object.freeze({ artifactId: 'experience-runtime', artifactRevision: 1 }),
  Object.freeze({ projectFingerprint: 'project:fixture', artifactId: 'legacy-evidence-ref', artifactRevision: 'r2' }),
  Object.freeze({ documentId: 'doc-1', nodeRevision: 2 }),
  Object.freeze({ unitId: 'unit-2', unitRevision: 3, endOffset: 18 })
])

export const authoringEvidenceLocatorFixtures = Object.freeze([
  Object.freeze({ kind: 'manuscript', projectFingerprint: 'project:fixture', sourceRevision: 'manuscript-r7', documentId: 'doc-1', chapterId: 'chapter-1', unitId: 'unit-2', nodeId: 'node-4', startOffset: 2, endOffset: 18 }),
  Object.freeze({ kind: 'worldbook-entry', projectFingerprint: 'project:fixture', sourceRevision: 'worldbook-r4', worldbookId: 'worldbook-1', entryId: 'entry-2' }),
  Object.freeze({ kind: 'outline-node', projectFingerprint: 'project:fixture', sourceRevision: 'outline-r3', nodeId: 'outline-4' }),
  Object.freeze({ kind: 'exploration', projectFingerprint: 'project:fixture', sourceRevision: 'exploration-r2', documentId: 'exploration-1' }),
  Object.freeze({ kind: 'memory-source', projectFingerprint: 'project:fixture', sourceRevision: 'memory-r5', memoryId: 'memory-1' }),
  Object.freeze({ kind: 'history', projectFingerprint: 'project:fixture', sourceRevision: 'history-r8', historyId: 'history-1' }),
  Object.freeze({ kind: 'scene', projectFingerprint: 'project:fixture', sourceRevision: 'scene-r6', chapterId: 'chapter-1', unitId: 'unit-2', anchorId: 'anchor-3' })
])

export const collaborableArtifactFixture = withFingerprint({
  schemaVersion: 1,
  artifactId: 'artifact-intervention-1',
  kind: 'intervention',
  target: stableLocatorFixture,
  sourceRevisions: { 'document:doc-1': 7, 'unit:unit-2': 3, 'node:node-4': 9 },
  evidenceRefs: [{ documentId: 'doc-1', documentRevision: 7, nodeId: 'evidence-1', nodeRevision: 2 }],
  visiblePayload: { title: '敲响红门', premise: '只暴露经过作者冻结的排演条件。' },
  authority: 'author-frozen'
})

export const shareManifestFixture = withFingerprint({
  schemaVersion: 1,
  shareSessionId: 'share-fixture-1',
  roomKind: 'rehearsal',
  projectFingerprint: 'project:fixture',
  scope: {
    kind: 'current-unit',
    documentRef: { documentId: 'doc-1', documentRevision: 7 },
    unitRefs: [{ unitId: 'unit-2', unitRevision: 3 }],
    sourceRevisions: { 'document:doc-1': 7, 'unit:unit-2': 3 }
  },
  visibleArtifacts: [collaborableArtifactFixture],
  redactions: ['provider-config', 'unshared-chapters', 'local-storage-keys'],
  expiresAt: '2030-01-01T00:00:00.000Z'
})

export const wireCompatibilityFixtures = Object.freeze({
  v1Experience: Object.freeze({ type: 'action.propose', commandId: 'v1-command-1', text: '推开门' }),
  currentV2: Object.freeze({ protocolVersion: 2, type: 'proposal.create', commandId: 'v2-command-1', roomId: 'room-1', payload: { proposal: { kind: 'direction', body: '先听门后的脚步。' } } }),
  optionalFutureFields: Object.freeze({ protocolVersion: 2, type: 'chat.send', commandId: 'v2-command-2', roomId: 'room-1', payload: { body: '收到' }, futureTraceHint: { optional: true } }),
  upgradeRequired: Object.freeze({ protocolVersion: 3, minProtocolVersion: 3, clientBuild: 'future', features: ['mandatory-future-semantics'] })
})

// Deterministic AES-256-GCM interoperability vector. contentKey belongs only to the client side.
export const encryptedArtifactFixture = Object.freeze({
  client: Object.freeze({
    inviteSecret: 'invite_fixture_only_for_join_auth',
    contentKeyHex: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
    plaintext: '{"premise":"只暴露经过作者冻结的排演条件。","title":"敲响红门"}'
  }),
  relay: Object.freeze({
    schemaVersion: 1,
    artifactId: 'artifact-encrypted-1',
    kind: 'intervention',
    target: stableLocatorFixture,
    sourceRevisions: { 'document:doc-1': 7, 'unit:unit-2': 3 },
    evidenceRefs: [],
    authority: 'author-frozen',
    fingerprint: collaborableArtifactFixture.fingerprint,
    baseRevision: 3,
    content: Object.freeze({
      schemaVersion: 1,
      encryption: 'aes-256-gcm',
      nonceBase64: 'qrvM3e7/ABEiM0RV',
      ciphertextBase64: 'BoZoLR6fGxJ6uCO/Lxh0ExhxI55YDAbnJ/xSvJxcvI4Oo1SXwXN2DjasaNjYhGCMybxoorINzoW2IIZYrCs5x5OaxTer+k/JfF4hWx6mS0XXHQ==',
      authTagBase64: 'Qs70f872j8Zsrml6smCYww=='
    }),
    expiresAt: '2030-01-01T00:00:00.000Z'
  })
})
