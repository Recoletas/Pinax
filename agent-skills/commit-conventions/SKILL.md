---
name: commit-conventions
description: Use when about to create a git commit - enforces no Co-Authored-By footer, conventional-commit format, scoped commits, and finish-and-squash discipline
---

# commit-conventions

Pre-commit guardrail. Run before `git commit` is finalized.

1. Verify the message has **no** `Co-Authored-By:` footer. If present, remove it before committing.
2. Verify format: `<type>(<scope>): <subject>` where `type` is `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `style` / `perf` and `scope` matches an existing subdirectory name (e.g., `world-map`, `engine`, `agents`, `ai`).
3. Verify the change is a **finished handoff** — not a mid-stage checkpoint. If multiple commits are planned for one feature, squash before pushing.
4. Verify `npm run test:run` passes locally for the staged scope; if it doesn't, do not commit.
5. Default 1 commit per feature, max 2. Multiple WIP commits before "finish" violate the convention; squash them.
