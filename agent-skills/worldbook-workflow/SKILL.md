---
name: worldbook-workflow
description: Use when modifying worldbook, worldbook imports, or context builder code - matches work to the canonical worldbook workflow doc
---

# worldbook-workflow

Workflow guardrail for worldbook subsystem work.

1. **Read first**: `docs/guides/worldbook-workflow.md` — this is the canonical reference for all worldbook work.
2. **Classify the surface** of the change: quick import (`/experience/worldbook` 普通入口) / advanced editor (`/experience/worldbook/advanced` 高级设置) / SillyTavern import-export. Each surface has its own conventions; do not mix them. 注：`context injection` / `structured settings` 是 guide §4 / §5 内部的子概念，不是独立 surface。
3. **Verify** the affected paths: import preview, conflict handling, active-worldbook selection. If context injection changed, run one generation smoke test.
3.5. **同名冲突策略**（guide §3）：替换 / 重命名 / 同名新建三选一时必须显式选，禁止默认行为；覆盖前显示现有 vs 导入的条目数变化。
4. **Three import paths** must remain working: preset import, novel-text import, AI-driven (说明驱动) generation. If any is broken, the change is not done.
5. Update `docs/STATUS.md` when workflow or behavior changed (delegate to `docs-status-handoff`).
