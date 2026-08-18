# WNB-6A Writing Unit V3 handoff

- Branch: `feature/wnb-6a-writing-unit-v3`
- Worktree: `/home/recoletas/jiuguan/worktrees/pinax-wnb-6a`
- Baseline: `1839d42b44a7a724eb8fe137998561f74fa78b48`
- Foundation commit: `95c4593 feat(writing): add writing unit v3 editor foundation`
- Final feature commit: `c715221 fix(writing): address unit v3 review findings`
- Integration merge: `55c4aac feat(writing): merge writing unit v3 workflow`
- Commit range: `95c4593..c715221`

## Shipped scope

- `WritingDocumentV3 -> writingUnit -> editor node` is canonical; Markdown remains a publication projection.
- Enter creates child nodes inside the current unit; split/merge/move are explicit one-transaction commands.
- Split/move transaction metadata maps every node to its resulting unit; merge reports the actually removed unit so annotation reconciliation follows real identities.
- Annotation, candidate, fragment history, snapshots, and crash recovery resolve through unit/node identity.
- The version inspector renders recent fragment history separately from named snapshots and crash drafts, with node-scoped restore availability.
- Annotation, rewrite, chapter-review, and local quality outputs emit only unit/node targets; legacy block fields are input-only compatibility.
- One committed, current-branch Experience assistant message resolves from `messages[] + turn.assistantMessageIds` and imports atomically as one source-bearing unit.
- Exact source fingerprints dedupe imports; regenerated branch/message sources append new units.
- Writing shows a subtle active-unit edge, context-menu unit operations, and `来自体验` backlink.
- Experience provides an accessible destination dialog and unavailable-source status.
- Mid-node split dispatches exactly once and remains one undo unit; annotation relocation uses the actual split offset and explicitly orphans ranges that cross it.
- Formatting-only edits advance unit revision and refresh Markdown; invalid schema v3 is rejected instead of being silently reconstructed from Markdown.
- Explicit Experience imports enforce a single unique assistant message ID just like inferred imports.
- The destination dialog uses the shared transient-layer lifecycle with initial focus, Tab/Shift+Tab trapping, trigger-focus restoration, and body-scroll locking.

## Changed files

- `src/services/writing/writingUnitExtension.js`
- `src/services/writing/writingDocumentSchema.js`
- `src/composables/useWritingDocument.js`
- `src/composables/useWritingAgent.js`
- `src/components/writing/WritingNotebookEditor.vue`
- `src/services/writing/writingAnnotations.js`
- `shared/writingCandidateContract.js`
- `shared/writingReviewContract.js`, `shared/writingQualityContract.js`
- `src/services/writing/writingCandidates.js`
- `shared/writingBlockHistoryContract.js`
- `shared/writingSnapshotContract.js`
- `src/services/writing/writingSnapshots.js`
- `src/services/writing/writingRecovery.js`
- `src/services/writing/writingExperienceImport.js`
- `src/pages/Writing.vue`, `src/pages/Writing.scoped.css`
- `server/services/advisorTaskService.js`, `server/services/openclawService.js`
- `src/components/experience/NarrativeTurn.vue`, `src/components/GamePanel.vue`, `src/pages/Experience.vue`
- `src/__tests__/integration.test.js`, `src/__tests__/gameStoreSession.test.js`, `src/__tests__/uiControlContract.test.js`
- `src/composables/useTransientLayer.js`
- `scripts/ui-audit.mjs`

## Migration rule

- Read-time v2 migration groups the flat nodes once, preserves every old `blockId` as `nodeId`, and derives deterministic `unit-v2-*` IDs.
- The next normal chapter save persists schema v3; no parallel v2 editor path remains.
- Legacy annotation/history fields are accepted only by compatibility normalizers. Ambiguous annotation relocation becomes `orphaned`.
- Stored v2 snapshots and crash drafts migrate to validated v3 documents before restore.

## Verification

- `npm run verify:full`: PASS — 20 test files / 200 tests, Vite build, diff check, and VitePress build.
- Focused cross-feature contracts: PASS — integration, gameStoreSession, uiControlContract, agentContracts, and worldBookQuickImport (5 files / 57 tests).
- UI audit: PASS — 3 captures, 0 console errors, 0 a11y failures, 0 scenario failures.
- Captures: `/tmp/pinax-wnb-6a-deep-audit-final` at 1440/980/390; each width directly exercised Enter/Shift+Enter/Undo, IME, split/move/merge with Undo, both recovery layers, and the source backlink.
- Visual inspection: PASS — continuous prose, subtle active edge, source action in bounds; desktop side inspector, 980px lower inspector, and 390px single-column editor remain unclipped.
- 119,998-character browser smoke: PASS — 4,000 paragraphs, 1.36s editor readiness, 49ms sampled input, typed text persisted, and the next normal save stored schema v3 (1 unit / 4,000 nodes; 1,921,379-byte `writing_books` payload).
- 119,998-character schema round-trip: PASS — 99ms sampled conversion/projection, exact Markdown preserved.
- Storage/recovery contracts: PASS — snapshots remain capped at 20 per chapter / 3,500,000 storage chars, fragment history at 120 per chapter / 2,000,000 storage chars, and crash drafts remain under their independent key.
- Active-path audit: PASS — no new `blockId` / `blockRevision` object fields are emitted; remaining occurrences are v2 migration or input-compatibility reads.

## Transaction matrix

1. PASS — browser: the audited passage reached 20 child nodes with Enter while the document retained its 2 existing units.
2. PASS — browser: Shift+Enter retained 20 nodes; one Undo plus Enter undos restored the original 12-node fixture.
3. PASS — browser + contract: split produced a new right unit/node, retained left identities, and one Undo restored exact structure at all three widths.
4. PASS — browser + contract: merge retained the earlier unit, persisted a de-duplicated provenance union, and one Undo restored both units.
5. PASS — browser + contract: move changed order only, revisions remained unchanged, and one Undo restored order.
6. PASS — browser + editor contract: composition kept the command menu closed and retained Chinese input at all three widths.
7. PASS — contract: stable-node split/merge follows node identity; ambiguous deletion explicitly orphans.
8. PASS — contract: candidate adoption is node-scoped and unit/node revision staleness rejects the candidate.
9. PASS — contract: committed import appends; exact repeat returns `already-imported`; regenerated branch appends.
10. PASS — browser + UI/route contract: backlink navigates with the exact session/message query; missing source produces non-blocking status.
11. PASS — browser + storage contract: named snapshot and fragment history restored independently; crash draft remains a separate key and layer.
12. PASS — browser + schema smoke: 119,998 characters loaded, accepted and persisted input, saved as v3, and round-tripped without loss.

## Integration notes

- WNB ownership locks were respected apart from integration-owner-approved `server/services/advisorTaskService.js` and `server/services/openclawService.js` changes required to carry node IDs through the prompt/result boundary. No Experience narrative-agent owner files were changed.
- Completion audit removed active editor/rewrite/review/quality `blockId` aliases and retained legacy reads only in migration or compatibility normalizers.
- The integration owner should reconcile the run board's stale `blocked-on-baseline` text and review the shared server prompt/result updates when combining the parallel branches; this worker did not edit the locked board or canonical status docs.
- Common Markdown lists/tasks/fenced code, annotation `targets[]`, and multi-target rewrite are not part of this slice.
- Integration owner should merge the parallel Experience branch, run combined gates, then update canonical project docs.
