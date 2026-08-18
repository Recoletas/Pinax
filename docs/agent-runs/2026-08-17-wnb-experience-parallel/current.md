# WNB / Experience Parallel Run Board

## Baseline gate

- Status: `completed`
- Observed shared-worktree HEAD: `1839d42b44a7a724eb8fe137998561f74fa78b48`
- Required baseline: `1839d42b44a7a724eb8fe137998561f74fa78b48`
- Reason: both workers started from the recorded baseline and their reviewed commit ranges are now merged into the integration branch.

Do not stash, reset, commit, or copy the shared dirty worktree merely to unblock this board. The owner of the existing WIP decides how it becomes a reproducible baseline.

## Workers

| ID | Plan | Branch / worktree | Exclusive scope | Status | Output |
|---|---|---|---|---|---|
| WNB-6A | [Writing Unit V3 plan](../../superpowers/plans/2026-08-17-wnb-6a-writing-unit-v3.md) | `feature/wnb-6a-writing-unit-v3` / `/home/recoletas/jiuguan/worktrees/pinax-wnb-6a` | Writing schema/editor/sidecars/import; Experience collection UI; Writing-owned tests and audit fixture | Completed; merged | `wnb-6a-summary.md` |
| EXP-AUTH | [Experience Authenticity MVP plan](../../superpowers/plans/2026-08-17-experience-authenticity-mvp.md) | `feature/experience-authenticity-hardening` / `/tmp/pinax-experience-authenticity` | Character voice authoring; narrative Kernel/resources/tools/orchestrator/critic; Experience-owned tests | Completed; merged | `experience-authenticity-summary.md` |

## Frozen integration boundary

- Both branches start from the same recorded baseline and remain in separate worktrees.
- WNB owns `Experience.vue`, `GamePanel.vue`, `NarrativeTurn.vue`, `Writing.vue`, `src/components/writing/**`, writing services/contracts, `integration.test.js`, `gameStoreSession.test.js`, `uiControlContract.test.js`, and its Writing audit fixture.
- Experience owns `WorldBookEditor.vue`, `gameStore.js`, character/voice services, narrative Kernel/resource/tool/orchestrator/critic services and contracts, `useStorage.js`, `agentContracts.test.js`, and `worldBookQuickImport.test.js`.
- The cross-branch contract is the existing committed assistant message/turn shape: `message.id`, `message.role`, `message.content`, `message.branchId`, `turnRecord.id`, `turnRecord.status`, and `turnRecord.assistantMessageIds`.
- Neither worker edits `docs/STATUS.md`, `docs/PLAN.md`, `docs/LOG.md`, or the product roadmap. Each writes only its unique summary file.
- Workers do not merge each other. The integration owner combines both completed commit ranges, runs the combined gates from the plans, then updates canonical docs once.

## Integration order

1. Record the approved full baseline SHA and change both worker statuses to `ready`.
2. Run WNB-6A and EXP-AUTH concurrently from that SHA.
3. Review both summary files and verify write-lock compliance.
4. Merge or cherry-pick both scoped commit ranges into a clean integration worktree.
5. Run `npm run verify:full`, WNB UI audit, authenticity deterministic smokes, and the cross-feature import check.
6. Update canonical status/plan/log/roadmap files and record the final integration result here.

## Integration result

- WNB-6A merged commit range: `95c4593..c715221`; integration merge: `55c4aac`.
- Experience authenticity merged commit range: `8a0c407..1ee0b2a`.
- Cross-feature focused verification: PASS — 5 files / 57 tests. The final collection-dialog keyboard contract adds initial focus, focus trapping, focus restoration, and page-scroll locking.
- Final deterministic gates: `smoke:narrative-recovery`, the 60-item `smoke:narrative-production -- --dry-run` matrix, and `npm run verify:full` all pass; full verification remains 20 files / 200 tests with Vite build, diff check, and VitePress build.
- External gates not run: the real MiniMax/OpenAI-compatible/Anthropic-compatible provider matrix and a live 1440/390 browser audit require existing services. The integration owner did not start or restart them.
