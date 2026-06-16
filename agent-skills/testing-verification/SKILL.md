---
name: testing-verification
description: Use when about to claim any code or documentation task done - requires running verification commands and confirming output before making any success claims
---

# testing-verification

Pre-claim guardrail. Evidence before assertions, always.

1. 按改动范围选 verify 档：纯代码契约 → `npm run verify:contract -- <contract-paths>` 后接 `npm run verify:post`；含文档 / 视觉 → `npm run verify:full`。`npm run verify` 走 full 档。
2. 确认 exit code 0 + 贴该档的 summary 一行（如 `verify:contract: 4 files / 51 tests / build OK / diff clean` 或 `verify:full: 88 files / 625 tests / build OK / diff clean / docs OK / visual OK`）。
3. **跳过**（已并入 `verify:full` 的 visual 子步）。
4. State the verification commands and their results in the completion message — paste the exit codes, not a vague "tests pass".
5. If any check fails, do not claim completion. Either fix the failure or report the failure to the user with the exact error.
