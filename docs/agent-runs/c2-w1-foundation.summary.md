# C2-W1 foundation handoff

Implemented C2-0/C2-1 only on `feature/collaboration-v2-foundation` from base `e8b9df1`.

## Commits

- `00c9702 feat(collaboration): add protocol v2 reliability foundation`
- `docs(agents): record collaboration foundation handoff` (this summary)
- `fix(collaboration): harden protocol v2 security boundaries` (security-review follow-up)
- `fix(collaboration): enforce nonce and branch uniqueness` (final delta follow-up)

## Changed files

- `shared/collaboration/{constants,canonicalJson,contracts,fixtures}.js`
- `server/realtime/v2/{materializer,security,commandService}.js`
- `server/realtime/experienceV1Adapter.js`
- `server/repositories/collaboration/{CollaborationRepository,sqliteMigrations,SqliteCollaborationRepository}.js`
- `scripts/collaboration-fault-matrix.mjs`
- `docs/agent-runs/c2-w1-foundation.summary.md`

## Delivered

- Pure protocol-v2 JSON validators, version negotiation, role capabilities, explicit ACK/rejects, stable locators, manifests, proposals, artifacts, promotions, and canonical SHA-256 fingerprints.
- Separate logical client contracts from strict relay wire contracts. Rehearsal/review rooms persist mandatory AES-GCM policy and a frozen target allowlist; Experience alone permits plaintext compatibility.
- SQLite migration/repository for rooms, hashed expiring/revocable invites, rotating hashed resume tokens and leases, durable idempotency, ordered events, snapshots, retention/quota metadata, TTL tombstoning, and transactional deletion receipts.
- Pure event materializer with proposal lifecycle, one current vote/member, frozen actor display identity, generation state, members, host epoch, and replay equivalence.
- 30-second grace, deterministic host succession, monotonic epoch and stale completion/privileged-command fences.
- Selected-proposal/request/completion/promotion binding, canonical request-bound idempotency, host-loss request isolation, and hostless late-join/reconcile election.
- Transactional per-room/share AES-GCM nonce reservations, one effective branch/completion/promotion per proposal, and target/evidence locator authorization.
- Strict bounded schemas for all 13 Experience runtime roots, including nested-key and secret/provider-key rejection.
- Central expired-room denial, invite provenance with transactional member invalidation on revoke, startup/schema/quota fail-closed checks, and complete content TTL tombstoning across encrypted and Experience paths.
- Strict payload bytes/depth/schema/locator/runtime-path controls, rate/quota constants, and `wsMaxPayloadBytes` constant.
- Deterministic AES-GCM fixture that keeps plaintext/content key/invite secret outside the relay projection.
- Narrow Experience-v1 command/event adapter preserving action, narrative, chat, vote, and allowlisted runtime-patch semantics without Vue wiring.

## Verification

- `PATH=/home/recoletas/.nvm/versions/node/v20.20.2/bin:$PATH node scripts/collaboration-fault-matrix.mjs` — exit 0, 27/27.
- `PATH=/home/recoletas/.nvm/versions/node/v20.20.2/bin:$PATH npx eslint shared/collaboration/*.js server/realtime/experienceV1Adapter.js server/realtime/v2/*.js server/repositories/collaboration/*.js scripts/collaboration-fault-matrix.mjs` — exit 0.
- `PATH=/home/recoletas/.nvm/versions/node/v20.20.2/bin:$PATH npm run verify:post` — exit 0; Vite build OK and `git diff --check` clean.
- `verify:full` intentionally deferred to the integration owner; no Vitest files/cases were added, preserving 20/200.

## Risks / next boundary

- C2-2 must wire the v2 service into a WebSocket server using `wsMaxPayloadBytes`; this slice deliberately does not replace v1 handlers.
- Production file-backed repositories must receive a deployment secret pepper; construction fails closed without one.
- Schema v3 uses atomic numbered migrations, rolls back interrupted steps, and rejects newer unknown schemas.
- Encrypted transport/codecs and Authoring/F3 promotion/adoption bridges remain C2-2/C2-3 and are not implemented here.
