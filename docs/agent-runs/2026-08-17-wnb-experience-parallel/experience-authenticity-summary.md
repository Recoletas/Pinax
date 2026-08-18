# Experience authenticity MVP handoff

- Branch: `feature/experience-authenticity-hardening`
- Baseline: `71c9d91`
- Feature commit: `8a0c407 feat(experience): anchor narrative voice politics and critic`
- Final hardening commit: `0ca0e70 fix(experience): close authenticity mvp gaps`
- Review-fix commit: `HEAD fix(experience): address authenticity review findings`
- Commit range: `71c9d91..HEAD` (three commits)

## Delivered behavior

- Character worldbook entries store a bounded voice profile: style <= 240 chars, <= 6 unique samples, each <= 240 chars.
- Only the selected scene speaker receives voice data in the Narrative Kernel, with <= 3 samples and a 720-char voice budget.
- Voice survives normal worldbook load/save, generated-entry normalization, formal payload creation, and Pinax/SillyTavern `extensions.pinax_voice` import/export. Non-character entries discard voice fields.
- The advanced character editor explains the current-speaker/first-three behavior. Sample controls stack on narrow screens and continue using existing tokens and breakpoints.
- Character lookup uses the complete worldbook character collection before scene selection, so an explicitly selected character beyond the first 12 entries keeps the correct speaker ID and voice. Final cast membership and fitting remain bounded by the existing scene limits and authoritative 1200-char block budget without collapsing structured members into a summary.
- Political runtime data is projected read-only with canonical IDs. Faction, place-control, and canonical-fact resources have traversable same-domain links; ended character relations are stale.
- `politics_lookup` remains chained behind successful world lookup; `current` respects the caller's bounded `limit` (cursor behavior is unchanged), and `get` / `trace` retain their existing result limits.
- The shadow critic remains detached from visible generation. Metrics persist only bounded allowlisted identifiers/counts, fixed-category flags, scores, variants, outcome/duration, and usage. Raw text, content-derived fingerprints, and caller-supplied extra fields are not persisted.
- Unknown prose-like flags are dropped at parsing and persistence boundaries. Rewrite/replacement/draft-shaped output is invalid.
- Every critic runner, including injected runners, is protected by a scheduler-level timeout race and child abort signal, so queue flush cannot hang on a non-cooperative runner.

## Main file groups

- Voice/editor/import: `narrativeVoiceProfile.js`, `characterCard.js`, `WorldBookEditor.vue`, plus integration-owner accepted deviations in `worldStore.js`, `worldbookQuickImportHelpers.js`, and backup export that are necessary for voice round-trip and backup fidelity.
- Kernel/politics: narrative kernel, resource index, tool contract/registry/orchestrator, `politicsLookup.js`, game store.
- Critic: `narrativeCritic.js`, `narrativeCriticMetrics.js`, storage key, orchestrator.
- Regression coverage: existing `agentContracts.test.js` and `worldBookQuickImport.test.js`; test file/case caps remain unchanged.

## Verification

- Focused: PASS — 2 files, 16 tests.
- `npm run verify:full`: PASS — 20 files, 200 tests; Vite build, diff check, and VitePress build passed.
- `npm run smoke:narrative-recovery`: PASS — response abort, late-result discard, and typed error checks passed.
- `npm run smoke:narrative-production -- --dry-run`: PASS — deterministic 60-item matrix generated.
- Targeted ESLint: new code introduced no observed errors; command remains non-zero because touched legacy files already contain existing test-global, Vue block-order, and unused-variable findings.
- Real-provider matrix: not run — no existing server/provider service was available, and this task must not start or restart one.
- Screenshot UI audit: not run — no existing Vite server was available. Production build and static responsive assertions passed.

## Eight-check disposition

All eight planned behaviors are automated in existing tests: six-sample cap and round-trip; Kernel three-sample cap; non-speaker exclusion; world-before-politics chaining; unrelated-turn tool absence; critic visible-text isolation; and persisted metric privacy. Browser-only visual inspection was unavailable for the reason above.

## Integration notes

- Merge this three-commit range onto the current `main`; do not replay the obsolete earlier summary commit.
- No Writing-owned files were changed. The integration owner accepted the `worldStore.js`, `worldbookQuickImportHelpers.js`, and backup export deviations because they are required to preserve voice through normal persistence, import, and backup round-trips.
- Full tests intentionally emit the existing mocked quota/PDF warnings; they do not fail verification.
