---
name: worldbook-workflow
description: Use when modifying worldbook, worldbook imports, or context builder code - matches work to the canonical worldbook workflow doc
---

# worldbook-workflow

Workflow guardrail for worldbook subsystem work.

1. **Read first**: `docs/guides/worldbook-workflow.md` — this is the canonical reference for all worldbook work.
2. **Classify the surface** of the change: quick import / advanced editor / SillyTavern import-export / context injection / structured settings. Each surface has its own conventions; do not mix them.
3. **Verify** the affected paths: import preview, conflict handling, active-worldbook selection. If context injection changed, run one generation smoke test.
4. **Three import paths** must remain working: preset import, novel-text import, AI-driven (说明驱动) generation. If any is broken, the change is not done.
5. Update `docs/STATUS.md` when workflow or behavior changed (delegate to `docs-status-handoff`).
