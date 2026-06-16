---
name: commit-conventions
description: Use when about to create a git commit - enforces no Co-Authored-By footer, conventional-commit format, scoped commits, and finish-and-squash discipline
---

# commit-conventions

Pre-commit guardrail. Run before `git commit` is finalized.

1. Verify the message has **no** `Co-Authored-By:` footer. If present, remove it before committing.
2. Verify format: `<type>(<scope>): <subject>` where `type` is `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `style` / `perf` and `scope` matches an existing subdirectory name (e.g., `world-map`, `engine`, `agents`, `ai`).
3. Verify the change is a **finished handoff** — not a mid-stage checkpoint. If multiple commits are planned for one feature, squash before pushing.
4. 确认 `testing-verification` skill 已在**本 session**跑过（harness 自查 handoff 历史 / 或显式调用）。如果 staged scope 是纯文档 / 纯 spec / 纯非运行时代码（无 vitest 覆盖），可豁免但**必须**在 commit message 末尾加一行 `(skip test:run — <reason>)`。
5. Default 1 commit per feature, max 2. Multiple WIP commits before "finish" violate the convention; squash them.
6. **Soft 警告**（不强制）：如果 `git diff --staged --stat` 显示 ≥ 3 个不相关顶层目录（如同时 `src/` + `docs/` + `agent-skills/`），停下来自问：能否按 concern 拆成多个 commit？本项目最近 50 commit 审计显示 5/50 (10%) 是 mega-completion rollup，多数本可拆。拆不开时记得在 commit body 解释"为何合一"。
