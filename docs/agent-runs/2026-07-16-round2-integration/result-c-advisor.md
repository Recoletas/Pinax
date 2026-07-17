# R2-C 结果：顾问任务与结果生命周期

## 改动文件
- `src/services/agents/agentResultLifecycle.js`：新增 `DISMISSED` 状态、`markDismissed`、`canDismiss`；`canApply` 拒绝已忽略结果。
- `src/services/agents/index.js`：导出 `markDismissed`、`canDismiss`。
- `src/composables/useAdvisor.js`：重写为 pending→completed/failed 流，pending 由 `createPendingResult` 生成唯一 ID；`applyAdvisorResult(resultId,currentRevision)` 返回结构化 `{ok,reason,status,actions/message}`，可选注入 `sideEffectRunner`，仅其成功才进入 applied；新增 `dismissResult`、`markResultStale`、`acknowledgeResult`；`updateAdvisorResultStatus` 作为兼容 shim 委托生命周期函数；删除 console 假应用。
- `src/components/AdvisorPanel.vue`：结果卡显示 pending/completed/applying/applied/stale/failed/dismissed 七态徽标；summary 走 `marked`+`sanitizeHtml`；展示 suggestions 与 actions（含内容）及不可应用原因；按钮按状态禁用；圆角≤8px、无嵌套卡片；`visibleResults` 放宽使 review 结果也可见。
- `src/__tests__/agentContracts.test.js`：在同一 test body 内合入 `markFailed`/`markDismissed`/`canDismiss` 断言，未新增用例。

## 验证
- `npx vitest run`：24 文件 200 测试全过（用例数未变）。
- `npm run build`：成功。
- eslint：仅遗留组件 `script` 顺序告警（基线已存在），无新增问题。
- `git diff --check`：通过。

## 残余风险
- Writing.vue 仍用本地 `applyAdvisorReplacement` + `updateAdvisorResultStatus` shim，未走新的 `sideEffectRunner` 路径；该页面未注入 runner，需后续迁移才能真正经 runner 应用。
- `applying` 仅 composable 内瞬态写入，Writing.vue 旧流程不触发，实际 UI 多见 completed/applied/stale。