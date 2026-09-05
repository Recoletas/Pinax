# Authoring / Experience Parity Evidence — 2026-08-22

Branch: `feature/unified-authoring-workspace`（worktree `/tmp/pinax-unified-authoring-workspace`）
Plan: `docs/superpowers/plans/2026-08-22-unified-authoring-workspace.md` Task 7

## Deterministic gates（已运行，全部通过）

| Gate | 结果 |
|---|---|
| `npm run test:run -- src/__tests__/authoringWorkspace.test.js src/__tests__/uiControlContract.test.js src/__tests__/gameStoreSession.test.js src/__tests__/integration.test.js` | 4 files / 59 tests passed |
| `npm run smoke:narrative-recovery` | exit 0，`passed: true`（abort / late-result / typed-error 全 true） |
| `npm run smoke:narrative-production -- --dry-run` | exit 0，完整 60 项矩阵（含 controlled faults：rate-limit ×1、timeout ×1；typed-failure ×2） |

## Capability parity checklist（确定性测试已断言）

Authoring.vue 现包含以下旧体验能力对应的 canonical 任务入口：

- `authoring.continue` / `authoring.advance` / `authoring.simulate.character` / `authoring.simulate.scene`（命令条主组）
- `authoring.next-actions` / `authoring.dialogue-options` / `authoring.emergence`（命令条辅助组）
- `authoring.insert` / `authoring.rewrite`（光标/选区命令）
- `contextLedger` + `AuthoringContextInspector`（上下文说明，无 raw prompt）
- `undoLastRequest`（请求级撤销回执）

测试锚点：`src/__tests__/authoringWorkspace.test.js` "exposes required Experience capabilities in Authoring before redirect"。

## Audit fixtures（已实现，未实跑）

`scripts/ui-audit.mjs` 新增：

- `authoring` 路由条目（`/authoring`，surfaces `.writing-page`，keyboard targets 含命令条与上下文触发器）。
- 新状态：`generating`、`context`、`conflict`（加入 allowed states 与 `supportsActionState`）。
- `long` fixture：章节追加 120 段确定性长文。
- advisor task 拦截：`generating` 挂起、`stale` 延迟返回、`error` 503。
- 动作场景：generating 断言停止按钮、error/stale 断言瞬时反馈条、context 断言说明层 Escape 关闭、conflict 断言无异常时审阅面保持安静。

计划中的 audit 命令：

```bash
UI_AUDIT_ROUTES=authoring,experience UI_AUDIT_WIDTHS=1440,1024,390 UI_AUDIT_STATES=regular,long,generating,error,stale,context,conflict npm run audit:ui
```

## External gates（未执行，gate 保持 pending）

1. **Live browser audit**：本环境无开发服务且禁止启动服务，上述 audit 命令未运行。1440/1024/390 截图、zero console errors、无横向溢出、键盘安全等断言均未验证。
2. **Real-provider gates**：MiniMax / OpenAI-compatible / Anthropic-compatible 真实渠道矩阵未运行（无凭据）。
3. **User acceptance**：parity 未经集成 owner / 用户验收。

## Route decision

按计划与硬性约束，**Experience 路由原样保留**（`/experience` 未重定向），Task 8 的前置条件（approved parity artifact 含截图与用户验收）未满足——Task 8 记录为 documented skip，gate 保持 pending。

## Notes / deviations

- `src/pages/Experience.vue` 本任务无需改动：路由与联机适配全部保留。
- `conflict` 审计状态目前只能验证"安静默认"方向；注入 typed exception 需要页面级审计钩子或 observer runtime 的真实输出，留待 live gate 阶段补齐。
