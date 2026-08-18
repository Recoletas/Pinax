# Experience authenticity MVP handoff

- Branch: `feature/experience-authenticity-hardening`
- Baseline: `71c9d91`
- Feature commit: `8a0c407 feat(experience): anchor narrative voice politics and critic`
- Final hardening commit: `HEAD fix(experience): close authenticity mvp gaps`
- Commit range: `71c9d91..HEAD` (two commits)

## Delivered behavior

- Character worldbook entries store a bounded voice profile: style <= 240 chars, <= 6 unique samples, each <= 240 chars.
- Only the selected scene speaker receives voice data in the Narrative Kernel, with <= 3 samples and a 720-char voice budget.
- Voice survives normal worldbook load/save, generated-entry normalization, formal payload creation, and Pinax/SillyTavern `extensions.pinax_voice` import/export. Non-character entries discard voice fields.
- The advanced character editor explains the current-speaker/first-three behavior. Sample controls stack on narrow screens and continue using existing tokens and breakpoints.
- Cast fitting remains inside the authoritative 1200-char block limit without collapsing structured members into a summary. Eight-member regression coverage preserves every `name -> speakerId` mapping, speaker identity, speaker-only voice, and at least one bounded sample.
- Political runtime data is projected read-only with canonical IDs. Faction, place-control, and canonical-fact resources have traversable same-domain links; ended character relations are stale.
- `politics_lookup` remains chained behind successful world lookup and respects tool result limits.
- The shadow critic remains detached from visible generation. Metrics persist only bounded identifiers, hashes/counts, fixed-category flags, scores, variants, outcome/duration, and usage.
- Unknown prose-like flags are dropped at parsing and persistence boundaries. Rewrite/replacement/draft-shaped output is invalid.
- Every critic runner, including injected runners, is protected by a scheduler-level timeout race and child abort signal, so queue flush cannot hang on a non-cooperative runner.

## Main file groups

- Voice/editor/import: `narrativeVoiceProfile.js`, `characterCard.js`, `worldStore.js`, `worldbookQuickImportHelpers.js`, `WorldBookEditor.vue`, backup export.
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

- Merge this two-commit range onto the current `main`; do not replay the obsolete earlier summary commit.
- No Experience/Writing files outside the approved worldbook editor surface were changed during hardening.
- Full tests intentionally emit the existing mocked quota/PDF warnings; they do not fail verification.
