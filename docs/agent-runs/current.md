# Agent Runs

## Active

| ID | Owner | Worktree | Scope | Status | Output |
| --- | --- | --- | --- | --- | --- |
| UI-R0 | Claude CLI | main read-only | Cross-page visual research + reference decomposition | done | `docs/agent-runs/2026-06-19-ui-redesign-research/UI-R0.report.md` |
| UI-W1 | Claude CLI | main read-only | Writing page radical visual direction | done | `docs/agent-runs/2026-06-19-ui-redesign-research/UI-W1.report.md` |
| UI-N1 | Claude CLI | main read-only | Notes/material page radical visual direction | done | `docs/agent-runs/2026-06-19-ui-redesign-research/UI-N1.report.md` |
| UI-E1 | Claude CLI | main read-only | Experience page radical visual direction | done | `docs/agent-runs/2026-06-19-ui-redesign-research/UI-E1.report.md` |

## Locks

Do not edit code in this round. Workers are research/spec workers only.

Do not touch:
- `src/stores/gameStore.js`
- `src/services/worldbookContextBuilder.js`
- `src/services/generation*`
- `server/`
- `AGENTS.md`
- `docs/STATUS.md`

## Current Constraints

- The user rejected the previous round as "micro-tuning": the next direction must produce visible composition changes, not only smaller text or border tweaks.
- The user specifically called out: Experience had a load regression; Writing still feels unchanged; Notes is only partly accepted and still had redundant top copy.
- Codex synthesis is now written:
  - `docs/superpowers/specs/2026-06-19-workbench-strong-visual-redesign-design.md`
  - `docs/superpowers/plans/2026-06-19-workbench-strong-visual-redesign.md`
- Current baseline screenshots:
  - `docs/agent-runs/2026-06-19-ui-redesign-research/experience-baseline-1280.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/writing-baseline-1280.png`
  - `docs/agent-runs/2026-06-19-ui-redesign-research/notes-baseline-1280.png`
- Existing accepted but incomplete direction: archive/folio material language, restrained paper/olive/gold palette, real character art where available, no generic SaaS hero copy.
- Hard visual workflow: translate vague taste feedback into measurable constraints: position, scale, angle, z-depth, material, content density, and screenshot acceptance.
- Next implementation workers should be `UI-W2`, `UI-N2`, `UI-E2`, and read-only `UI-QA`; do not continue from the old micro-polish briefs.
