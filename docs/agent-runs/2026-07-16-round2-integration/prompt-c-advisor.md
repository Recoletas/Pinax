# R2-C - 顾问任务与结果生命周期

## 工作区

- Worktree: `/tmp/pinax-r2-advisor`
- Branch: `round2/advisor-lifecycle`
- Product base: `635a439038a16a3306ab9b30c45c4d3412250957`

先按 [总览](./README.md) 核对 git，再读 `AGENTS.md`、`docs/STATUS.md` 和非空 `LOCAL.md`。不要使用 brainstorming / Superpowers，不启动 dev server。

## 目标

把共享顾问从“聊天 + 永远 pending 的结果 + console 假应用”补成可信的任务与结果生命周期，同时保持现有页面 API 兼容。

## 可修改

- `src/composables/useAdvisor.js`
- `src/components/AdvisorPanel.vue`
- `src/services/advisorTaskService.js`
- `src/services/advisorResultApplier.js`
- `src/services/agents/*`
- `src/__tests__/agentContracts.test.js`，保持单一 test body
- 结果：`docs/agent-runs/2026-07-16-round2-integration/result-c-advisor.md`

禁止修改任何 page、store、canvas、comic、router、server、package 文件、共享状态文档和其他窗口文件。

## 必须完成

1. 真实状态流：请求创建 pending；成功进入 completed；请求失败进入 failed；base revision 改变可进入 stale。
2. 只有注入的 side-effect runner 成功后才能进入 applied；删除当前 console-only 假应用。
3. `applyAdvisorResult` 返回结构化 `{ ok, reason, status, actions/message }`，禁止任意 action 执行与 composable 直接写 store。
4. 支持 dismiss / acknowledge；stale、applied、failed、dismissed 结果不可再次应用。
5. 保留 task alias、legacy adapter、target range、action payload 和当前 `useAdvisor()` 返回 API；新增参数必须可选。
6. `AdvisorPanel` 一致显示 pending/completed/applying/applied/stale/failed/dismissed；不再只显示 replace 模式，至少能显示 summary、suggestions/actions 和不可应用原因。
7. Markdown 继续 sanitize；动作按钮按状态禁用。卡片圆角不超过 8px，不做嵌套卡片，移动宽度稳定。
8. 修正结果 ID、状态和展示数据重复来源，避免 UI status 与 `_agentResult.status` 不一致。

## 验证与交付

- 向现有 `agentContracts.test.js` 单一 test body 合入生命周期断言，不增加 test count。
- 运行该测试、`npm run build`、变更组件 eslint、`git diff --check`。
- 写不超过 400 字结果摘要并创建一个 conventional commit；不含 `Co-Authored-By`。
- 最终只报告 commit hash、结果文件路径和验证状态。
