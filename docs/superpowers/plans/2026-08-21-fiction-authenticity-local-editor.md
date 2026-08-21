# Fiction Authenticity Local Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, at-most-three-edit fiction authenticity pass to the existing dramaturgy experiment CLI and replay only the two samples already reviewed by the user.

**Architecture:** A focused library builds one editor request, validates a typed patch verdict, applies exact replacements, and rejects new fact leaks or non-local rewrites. The existing CLI gets a separate `edit` command that reads completed runs and writes sidecar JSON/TXT without mutating the frozen 24-attempt experiment.

**Tech Stack:** Node.js ESM, existing MiniMax-compatible provider adapter, Vitest, existing Pinax prose normalizer and relation fixtures.

---

## File map

- Create `scripts/lib/novel-cross-section-authenticity-editor.mjs`: prompt, verdict validation, exact patch application and one-call runner.
- Modify `scripts/novel-cross-section-dramaturgical-ablation.mjs`: opt-in `edit` command and readable sidecar artifacts.
- Modify `src/__tests__/novelCrossSectionDramaturgicalAblation.test.js`: extend existing runner and CLI cases without adding a new test case.
- Modify `docs/STATUS.md` and `docs/LOG.md`: record the real two-sample result and remaining limit.

### Task 1: Typed local editor

- [x] **Step 1: Extend the existing runner test with a failing editor contract**

Import `buildAuthenticityEditorPrompt` and `runAuthenticityEditor`. In the existing Task 3 `it()` block, use a provider returning:

```js
{
  text: JSON.stringify({
    status: 'edited',
    findings: [{
      type: 'repeated-inference',
      sourceText: '这印是伪造的。封印不对，纸也对，墨色也对，唯独印泥——假的。',
      replacementText: '检查官看了眼泛青的印泥，把册子按在石栏上。',
      reason: '线索已经足够，不再重复揭晓'
    }],
    editedText: editedDraft
  })
}
```

Assert one editor call, at most three findings, deterministic edited text, relation material in the request, and unchanged fallback for invalid JSON or a fourth finding.

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run src/__tests__/novelCrossSectionDramaturgicalAblation.test.js -t 'runs each condition once'
```

Expected: FAIL because the authenticity editor module does not exist.

- [x] **Step 3: Implement the minimal editor module**

Expose:

```js
export const AUTHENTICITY_EDITOR_CONTRACT_VERSION = 'cross-section-authenticity-editor.v1'
export const AUTHENTICITY_EDITOR_MAX_FINDINGS = 3
export function buildAuthenticityEditorPrompt({ fixture, draftText }) {}
export async function runAuthenticityEditor({ fixture, draft, provider, runId }) {}
```

The request contains the role contracts, full fixture facts, `serializeMinimalRelationPack()` output, original marker text, the four approved checks, and JSON-only output instructions. A valid edited verdict must have zero to three exact `sourceText -> replacementText` patches; every source occurs exactly once; applying those patches must byte-match `editedText`. Normalize the result and reject any unauthorized fact event not already present in the original draft. Any runtime or validation error returns `{ status: 'failed', originalText, error }` and never substitutes the draft.

- [x] **Step 4: Run GREEN**

Run the same targeted command. Expected: the selected existing test passes.

### Task 2: Explicit CLI edit command

- [x] **Step 1: Extend the existing CLI test with a failing command contract**

Assert parsing and execution of:

```bash
edit --run /tmp/source-run --output /tmp/editor-output \
  --run-ids canal-ledger-minimal-engine-r1,birthday-recorder-minimal-engine-r1
```

The test memory filesystem contains a completed manifest and two successful private runs. Assert exactly two editor calls, no write to `manifest.json` or `private-runs.jsonl`, and creation of `authenticity-edits.json` plus a newline-preserving `authenticity-edits.txt` containing original and edited prose.

- [x] **Step 2: Run RED**

Run:

```bash
npx vitest run src/__tests__/novelCrossSectionDramaturgicalAblation.test.js -t 'offers a small CLI'
```

Expected: FAIL with `CROSS_SECTION_DRAMATURGY_CLI_COMMAND_INVALID` for `edit`.

- [x] **Step 3: Implement the command**

Add `edit` to the CLI flag table with required absolute `--run`, required absolute `--output`, optional `--config`, and required comma-separated `--run-ids`. Resolve each successful run against the canonical fixture list, call `runAuthenticityEditor()`, and write only the two sidecars in the output directory. Reject unknown IDs, duplicate IDs, failed source runs and path aliasing between source and output.

- [x] **Step 4: Run GREEN**

Run the same targeted command. Expected: the selected existing test passes.

### Task 3: Two-sample replay and handoff

- [x] **Step 1: Run focused verification**

```bash
npm run test:run -- src/__tests__/novelCrossSectionDramaturgicalAblation.test.js
node --check scripts/lib/novel-cross-section-authenticity-editor.mjs
node --check scripts/novel-cross-section-dramaturgical-ablation.mjs
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 2: Run only the approved real replay**

```bash
npm run eval:cross-section-dramaturgy -- edit \
  --run /tmp/pinax-cross-section-dramaturgy-ablation/2026-08-20T08-55-14-251Z \
  --output /tmp/pinax-cross-section-authenticity-local-editor-20260821 \
  --run-ids canal-ledger-minimal-engine-r1,birthday-recorder-minimal-engine-r1
```

Inspect the TXT for the exact user-reported artifacts, pronoun continuity, preserved events/choices/endings, and `:::` leakage. Do not request another score sheet.

- [x] **Step 3: Update handoff docs**

Record whether each sample improved, regressed or was rejected by the guardrails. State explicitly that this remains an experiment and does not enter Experience production.

- [x] **Step 4: Final implementation commit**

Stage the editor, CLI, tests, plan progress and handoff docs, then commit once:

```bash
git commit -m "feat(narrative): add bounded authenticity editor"
```

Do not add a `Co-Authored-By` footer.
