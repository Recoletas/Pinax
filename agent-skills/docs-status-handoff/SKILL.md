---
name: docs-status-handoff
description: Use when a code change affects documentation, behavior, status, plans, or known issues - keeps docs and multi-session state in sync
---

# docs-status-handoff

Coordination guardrail for handoffs. Run after any behavior-affecting change.

**Pre-action:** read `docs/STATUS.md` to know what's in flight and avoid colliding with other sessions.

**Post-action:**

1. Update `docs/STATUS.md` with the change: move entries between `In flight` / `Recently done` / `Next up` / `Blocked` as appropriate. New work → add to `In flight` before starting; completed work → move to `Recently done` with date, branch, and verification notes.
2. If behavior or known issues changed, also update `docs/PLAN.md` / `docs/LOG.md` / `docs/src/known-issues.md` (whichever is canonical for that fact).
3. If a preference or rule is not mature enough for `AGENTS.md` or formal docs, **suggest** to the user that they record it in `LOCAL.md`. Do not edit `LOCAL.md` unless the user explicitly asks.
4. Remove `Recently done` entries once they are reflected in `docs/LOG.md`, `docs/PLAN.md`, known issues, or commits. Keep at most 10 entries.
