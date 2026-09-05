# C2-3 contract seam fix-forward

Date: 2026-09-02
Branch: `integration/consolidation-20260823`

## Scope

- Extended the neutral `StableLocator` contract with exact, typed shapes for all seven F3 evidence locator kinds. The network locator preserves reversible identity plus revision; `memory-source` intentionally excludes its optional local provenance `sourceRef`.
- Rejected the former `projectFingerprint + artifactId(sourceRef)` fallback while retaining the established C2 document/unit/node and Experience artifact locator fixtures.
- Strengthened promotion requests to bind room/share/proposal, artifact id and fingerprint, generation request id, the complete frozen source-revision fingerprint, the host-computed live revision fingerprint, host epoch, and target base revision.
- Added host-only, low-sensitivity rehearsal generation terminal commands (`failed` / `stale`) and promotion terminal receipts (`adopted` / `rejected` / `stale`), including server guards, materialization, and client domain projection. These events contain no Ghost text, editor transaction, or Authoring write authority.

## Verification

- `smoke:collaboration-rehearsal-contract`: 7/7 passed (Node 20.20.2).
- `smoke:collaboration-foundation`: 28/28 passed (Node 20.20.2).
- `smoke:collaboration-transport`: 43/43 passed (Node 20.20.2).
- Scoped ESLint and `node --check`: passed after the final source edit.

## Intentional RED handoff

`smoke:collaboration-authoring-bridge` remains 7/9. The two failures are the expected contract-first seam:

1. commit `36912b1` still emits the old six-field promotion request and therefore fails the new exact schema;
2. its preflight still enters the old local adoption preparation path instead of returning the original locally retained rehearsal result to the existing Ghost owner.

The bridge must be fixed forward by the Authoring adapter owner. The shared contract must not be loosened to accept the old request or the `sourceRef -> artifactId` fallback.

`docs/STATUS.md` and `docs/agent-runs/current.md` remain owned by the integration owner and are intentionally excluded from this commit.
