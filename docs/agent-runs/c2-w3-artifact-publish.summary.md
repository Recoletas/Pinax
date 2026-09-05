# C2-3 initial artifact publish protocol

Date: 2026-09-02
Branch: `integration/consolidation-20260823`

## Outcome

- Added host-only `artifact.publish` commands and durable `artifact.published` events for the initial encrypted `intervention`, `direction-set`, and `impact-group` artifacts in `rehearsal` and `authoring-review` rooms.
- The relay validates only the exact wire envelope, room share/manifest fences, host epoch, encrypted artifact shape, allowlisted target/evidence locators, nonce uniqueness, artifact id/fingerprint uniqueness, and the 32-artifact room quota. It never decrypts or accepts a logical `visiblePayload`.
- `rehearsal-branch` remains exclusive to the selected-proposal `generation.complete` path.
- Snapshots and client domain projection now expose an `artifacts` map and upgrade older snapshots that omit it.
- Artifact TTL rewrites published events and snapshots to low-sensitivity identity tombstones, removes ciphertext and locator/source content, recalculates retained bytes, and remains deterministic across replay and SQLite restart.

## Verification

- `smoke:collaboration-rehearsal-contract`: 8/8 passed with Node 20.20.2.
- `smoke:collaboration-foundation`: 33/33 passed with Node 20.20.2.
- `smoke:collaboration-transport`: 43/43 passed with Node 20.20.2.
- `smoke:collaboration-authoring-bridge`: 11/11 passed with Node 20.20.2.
- Scoped ESLint, `node --check`, and `git diff --check`: passed.

The integration-owner status files are intentionally excluded from this commit.
