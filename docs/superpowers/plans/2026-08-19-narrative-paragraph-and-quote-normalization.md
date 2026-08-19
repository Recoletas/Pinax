# Narrative Paragraph and Quote Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Experience narrative paragraphs reliably readable and normalize generated dialogue to `“……”` without rewriting story content.

**Architecture:** Keep the model prompt as the primary contract and extend `narrativePresentation` as a deterministic compatibility boundary. Dialogue-only normalization and splitting remain separate from prose density splitting; existing v5 presentations refresh only when one of those normalizers would materially change their blocks.

**Tech Stack:** Vue 3 service layer, Vitest integration tests, Vite smoke/build verification.

---

### Task 1: Lock the residual cases with failing tests

**Files:**
- Modify: `src/__tests__/integration.test.js:760-1110`
- Test: `src/__tests__/integration.test.js`

- [x] **Step 1: Add prompt and parser expectations**

Add cases asserting that the format prompt contains `台词统一使用中文双引号“”` and does not contain `「」或“”`. Parse a complete `「都有。」` dialogue block and expect `“都有。”`.

- [x] **Step 2: Add long-dialogue expectations**

Parse `:::dialogue|林岫\n「都有。第一封是三年前寄出的。第二封没有落款。第三封上的墨迹还没有干。」` and expect two dialogue blocks, each retaining `speaker: 林岫`, with text `“都有。第一封是三年前寄出的。”` and `“第二封没有落款。第三封上的墨迹还没有干。”`.

- [x] **Step 3: Add long-single-sentence expectations**

Parse a narration longer than 120 CJK characters containing only commas and no sentence terminator. Expect at least two blocks, expect `blocks.map(block => block.text).join('')` to equal the exact source, and assert every block is non-empty.

- [x] **Step 4: Add existing-v5 refresh expectations**

Construct an `ensureNarrativeMessage()` input whose v5 presentation contains `「都有。」` while `content` contains the same structured dialogue. Expect the resulting block text to equal `“都有。”`.

- [x] **Step 5: Run the focused test and confirm RED**

Run: `npm run test:run -- src/__tests__/integration.test.js`

Expected: FAIL because the prompt still permits both quote styles, dialogue blocks are not normalized/split, and comma-only long narration remains one block.

### Task 2: Implement deterministic dialogue normalization

**Files:**
- Modify: `src/services/narrativePresentation.js:10-230`
- Test: `src/__tests__/integration.test.js`

- [x] **Step 1: Tighten the prompt contract**

Replace the permissive quote instruction with a single output rule: outer dialogue uses `“……”`, nested quotation uses `‘……’`, and visible prose must not mix `「」` or `『』`.

- [x] **Step 2: Add complete-wrapper normalization**

Add a helper that trims dialogue text and maps complete outer `「x」`, `『x』`, and `"x"` pairs to `“x”`; normalize nested corner quotes to `‘x’`, and leave already canonical text and non-dialogue prose untouched.

- [x] **Step 3: Split complete long dialogue safely**

For a complete canonical outer `“……”` dialogue, remove the outer pair, run sentence splitting on the interior, and group at one to two sentences when the interior exceeds two sentences or the density threshold. Re-wrap each group with `“……”`; return a single normalized block for short dialogue.

- [x] **Step 4: Route dialogue blocks through the helper**

In structured and legacy parsing, use readable-prose splitting for narration/action/thought and dialogue normalization/splitting for dialogue. Preserve the same speaker, speaker source, registry resolution, and stable block creation path for every generated chunk.

- [x] **Step 5: Run the focused test**

Run: `npm run test:run -- src/__tests__/integration.test.js`

Expected: quote and long-dialogue cases PASS; comma-only long narration still FAILS.

### Task 3: Add conservative fallback boundaries for long single sentences

**Files:**
- Modify: `src/services/narrativePresentation.js:185-270`
- Test: `src/__tests__/integration.test.js`

- [x] **Step 1: Add clause-boundary splitting**

When a readable prose chunk remains above the density threshold as one sentence, locate punctuation outside paired quotes. Prefer `；`/`;`; otherwise choose a `，`/`,` boundary near the 60-120 character target. Preserve every character by concatenating chunks without insertion or deletion.

- [x] **Step 2: Keep protected content intact**

Do not choose punctuation inside `「」`, `『』`, `“”`, or `‘’`. Do not split content below the density threshold, and do not alter explicit model line breaks.

- [x] **Step 3: Extend v5 refresh detection**

Refresh an existing presentation when readable-prose splitting yields multiple chunks, or when dialogue normalization/splitting would change the stored block. Do not bump the global presentation version or reparse unrelated clean v5 messages.

- [x] **Step 4: Run focused tests and confirm GREEN**

Run: `npm run test:run -- src/__tests__/integration.test.js`

Expected: PASS with all narrative presentation regression cases green.

### Task 4: Update handoff documentation and verify the integrated branch

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/LOG.md`
- Modify: `docs/plan/agent-runtime-architecture-research-20260814.md`
- Modify: `docs/superpowers/plans/2026-08-19-narrative-paragraph-and-quote-normalization.md`

- [x] **Step 1: Record the final behavior**

Document canonical dialogue punctuation, long-dialogue splitting, conservative long-clause fallback, selective v5 refresh, and the fact that no browser audit was run without an existing service.

- [x] **Step 2: Run deterministic narrative checks**

Run: `npm run smoke:narrative-recovery`

Expected: exit 0.

Run: `npm run smoke:narrative-production -- --dry-run`

Expected: exit 0 and 60 dry-run items.

- [x] **Step 3: Run full verification**

Run: `npm run verify:full`

Expected: Vitest, Vite build, changed-line checks, and VitePress build all exit 0.

- [x] **Step 4: Review and commit only task files**

Run `git diff --check`, inspect the staged file list, and exclude all user-owned research drafts. Create one conventional implementation commit without a `Co-Authored-By` footer.
