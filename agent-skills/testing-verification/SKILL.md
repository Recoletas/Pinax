---
name: testing-verification
description: Use when about to claim any code or documentation task done - requires running verification commands and confirming output before making any success claims
---

# testing-verification

Pre-claim guardrail. Evidence before assertions, always.

## Hard test budget

- 核心 Vitest 套件总量不得超过 **20 个测试文件 / 200 个测试用例**。这是仓库总量上限，不是单次命令或默认 include 的上限。
- 禁止用排除目录、改后缀、拆出另一套 Vitest 配置或只跑 focused tests 来绕过计数。实验评测应改为 `scripts/` 下的显式 eval/smoke；重复回归应把断言并入既有用例。
- `verify:full` 的 budget reporter 必须打印 `files <= 20` 与 `tests <= 200`。任一超限，即使所有断言通过也不得声明完成或合并。

1. focused tests 只用于开发反馈；完成前一律执行 `npm run verify:full`，由它同时检查测试预算、全部核心测试、Vite、diff 与 VitePress。
2. 确认 exit code 0 + 贴 summary 一行，格式如 `verify:full: 20/20 files / 200/200 tests / build OK / diff clean / docs OK`。
3. **跳过**（已并入 `verify:full` 的 visual 子步）。
4. State the verification commands and their results in the completion message — paste the exit codes, not a vague "tests pass".
5. If any check fails, do not claim completion. Either fix the failure or report the failure to the user with the exact error.
