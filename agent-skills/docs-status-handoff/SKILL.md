---
name: docs-status-handoff
description: Use when a code change affects documentation, behavior, status, plans, or known issues - keeps docs and multi-session state in sync
---

# docs-status-handoff

Coordination guardrail for handoffs. Run after any behavior-affecting change.

**Pre-action:** read `docs/STATUS.md` to know what's in flight and avoid colliding with other sessions. The real sections are `当前安排` / `当前事实` / `Recently done` / `Earlier integration history` / `Earlier handoff history` / `Next up` / `Working rules` — update against these, not against section names remembered from elsewhere. If the file's structure has changed again, follow the file, not this skill.

**Post-action:**

1. Update `docs/STATUS.md` by **editing the entry that already owns the fact**, not by prepending a new bullet per change. New work → add one row to `当前安排` (owner/worktree/branch/scope) before starting. Finished work → move or rewrite its entry under `Recently done` with date, branch, and verification notes; prune `Recently done` once the fact lives in LOG/known-issues/commits (keep ≤ 10).
2. A plan that has started executing must no longer say “待执行/待启动” in `当前事实` or `Next up`; rewrite it to what actually happened (started / partial / integrated), or move it out. Conflict between an old bullet and new reality = stale bullet: fix the bullet, don't stack a contradiction on top.
3. Label evidence level explicitly: 计划 / 已实施 / 分线验证 / 组合验证 / 用户确认. Copy real SHA, command, exit code, and counts from the run that produced them — never restate an older round's numbers as this round's.
4. Route facts by lifespan: long-lived truth → `docs/engineering/current-architecture.md` / user docs; process evidence → `docs/LOG.md` / `docs/agent-runs/`; `STATUS.md` keeps only current arrangement, decisions, and next steps. Trimming duplication is not deleting history.
5. If behavior or known issues changed, also update `docs/PLAN.md` / `docs/LOG.md` / `docs/src/known-issues.md` (whichever is canonical for that fact).
6. If a preference or rule is not mature enough for `AGENTS.md` or formal docs, **suggest** to the user that they record it in `LOCAL.md`. Do not edit `LOCAL.md` unless the user explicitly asks.

**Skill maintenance trigger:** after a user correction, an acceptance reversal, or one clear high-risk incident, propose a bounded revision candidate to the relevant skill (trigger condition, action, evidence, exception) instead of writing a postmortem nobody will read. When an incident came from an existing rule simply not being followed, say so and fix execution — do not add a rule. When nothing reusable was learned, state “不需要新规则” and move on.
