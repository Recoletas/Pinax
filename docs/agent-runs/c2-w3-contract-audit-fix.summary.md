# C2-3 contract audit fix-forward

Date: 2026-09-02
Branch: `integration/consolidation-20260823`

## Audit fixes

- Every repository path that increments `hostEpoch` now first appends terminal events for host-owned pending work. Requested generations become `generation.stale`; requested promotions become low-sensitivity `promotion.status.changed` events with `status: stale`. Lease succession is covered across event replay and a real SQLite restart.
- `promotion.status` requires the stored promotion epoch to equal the live room epoch. `promotion.request` additionally binds its payload `roomId` to both the envelope and repository room.
- No-kind protocol-v2 locators retain the permissive validation semantics and exact key set from the parent contract. Typed evidence locators remain strict; typed-only keys without `kind` are rejected.
- Promotion receipts now permit only `code` and optional `targetCount`. Artifact TTL cleanup also rewrites legacy promotion status events and the snapshot so older content-bearing receipt fields do not persist.
- `liveRevisionFingerprint` is explicitly an opaque host-local attestation. The relay validates the frozen `sourceRevisionFingerprint` against the completed artifact; only the local Authoring adapter may compare the attestation with live project revisions.
- Generation terminal status/code combinations are constrained, and client projection now ignores late `generation.stale` events unless the request is still requested, matching the server materializer.

## Verification

- `smoke:collaboration-rehearsal-contract`: 7/7 passed with Node 20.20.2.
- `smoke:collaboration-foundation`: 30/30 passed with Node 20.20.2.
- `smoke:collaboration-transport`: 43/43 passed with Node 20.20.2.
- Scoped ESLint, `node --check`, and `git diff --check`: passed.

The concurrently owned Authoring adapter files and integration-owner status documents are excluded from this commit.
