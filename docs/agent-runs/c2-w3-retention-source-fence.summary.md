# C2-3 retention and source-revision fences

Date: 2026-09-02
Branch: `integration/consolidation-20260823`

## Outcome

- `content.expired` now materializes durable artifact/comment purge timestamps. Command guards also read the SQLite retention policy, so replayed, restarted, and legacy snapshots all reject content that would otherwise be written after the one-shot cleanup.
- After artifact cleanup, artifact publish, proposal creation, generation request/completion/status, and Experience runtime content are closed; after comment cleanup, chat is closed. Low-sensitivity lifecycle commands remain available.
- Optional wire-artifact expiry must be in the future and no later than both the room and artifact-retention deadlines. Omitting it inherits the room retention policy.
- Every relay-visible `WireArtifact.sourceRevisions` key, for both initial publish and generation completion, must be exactly `locator:sha256:<64 hex>` and must identify a locator already present in the room target allowlist. Raw project/path keys and hashes of unshared locators are rejected without exposing revision values or locators in new fields.
- Client domain projection now replays room retention configuration and purge gates consistently with the authoritative materializer.

## Verification

- `smoke:collaboration-rehearsal-contract`: 8/8 passed with Node 20.20.2.
- `smoke:collaboration-foundation`: 33/33 passed with Node 20.20.2.
- `smoke:collaboration-transport`: 43/43 passed with Node 20.20.2.
- `smoke:collaboration-authoring-bridge`: 14/14 passed with Node 20.20.2.
- Scoped ESLint, `node --check`, and `git diff --check`: passed.

Integration-owner status files and the concurrently owned Authoring adapter/bridge changes are excluded from this commit.
