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

## Verification scope

1. 按变更范围选择能证明预期行为的必要检查；focused tests 可以作为有针对性的验证。普通小改、纯文档或样式变更不强制 `npm run verify:full`，不为检查而新增只镜像实现的测试。
2. 涉及广泛核心链路、发布集成或 CI 时，选择适用的完整门禁（如 `npm run verify:full` / `npm run verify:ci`）。测试预算仍是仓库总量上限；检查范围缩小不改变或豁免该预算。
3. 启用已验证且未再改动的产物时，只检查相关服务健康及配置、任务数据保留情况，不机械重跑完整门禁。已有检查通过后，仅在新增改动、失败或未解决疑点需要时补充或重跑。
4. 完成说明列出实际执行的验证命令、结果和 exit code，说明证据范围；未执行的检查不冒充已通过，历史结果不冒充本轮执行，不要求固定测试计数的 summary。
5. If a required check fails, do not claim completion. Either fix the failure or report the failure to the user with the exact error.
