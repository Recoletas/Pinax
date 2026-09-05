# Unified Authoring Workspace — Handoff Summary

Date: 2026-08-22
Branch: `feature/unified-authoring-workspace`（worktree `/tmp/pinax-unified-authoring-workspace`）
Base: 集成提交 `92fd908`（Foundation + Settings + Authoring Runtime 已合并）
Plan: `docs/superpowers/plans/2026-08-22-unified-authoring-workspace.md`

## What landed

全部 9 个任务按 TDD 执行（failing test → RED → implement → GREEN → commit，逐任务记录）：

1. **Task 1 — canonical 路由**：`git mv Writing.vue → Authoring.vue` + 薄兼容包装；router 新增 `/authoring`（name `authoring`），旧 workbench 子路由 `writing` 与顶级 `/writing` 重定向到 authoring（保留 `name: 'writing'` 作为命名兼容别名）；一级导航合并“体验 / 写作”为单一 `authoring` 活动，联机在创作侧栏保留兼容子项；uiControlContract 源读取切到 Authoring.vue。
2. **Task 2 — 体验历史投影**：新增 `authoringSessionProjection.projectExperienceSession()`，经既有 `appendExperienceTurnToChapter` 合同把已提交助手回合幂等导入章节 writingUnit（指纹去重、不建分支、不导用户指令）。Authoring 打开 `?sessionId=` 链接时执行一次并走正常保存事务。
3. **Task 3 — 命令面**：`AuthoringCommandBar.vue`（6 个光标/选区命令 + 停止）与 `AuthoringTransientNotice.vue`（单行 role=status + 可选撤销，6 秒消失）；命令条紧贴编辑器工具区，720px 以下单行横向滚动。
4. **Task 4 — 事务化插入**：`authoringTextTransaction.js`（revision 绑定的 apply/undo 回执，frozen receipt）+ `useAuthoringTask.js`（busy/error/notice/run/cancel/undoLastRequest/invalidateReceipt），页面经编辑器暴露的 `insertPlainText`/`replaceTextRange` 应用、走 `saveCurrentChapter` 正常持久化；手动编辑使回执失效。execute 经 `requestAdvisorTask` 真实分发 canonical 任务 id。
5. **Task 5 — 上下文说明**：`AuthoringContextInspector.vue` 只接收低敏感 context ledger（kind/status/chars/sourceRefs 标签），复用 useTransientLayer（初始焦点、焦点陷阱、Escape、焦点恢复）+ useBodyScrollLock；页面 `contextLedger` 由章节正文、纲要、续写参考派生。
6. **Task 6 — 异常审阅**：`useAuthoringObservers.js`（常规 applied 只产生安静状态文案，仅 typed exception 可见）+ `AuthoringExceptionReview.vue`（locked-conflict / identity-ambiguity / destructive-retcon 三类，“采用正文派生”对破坏性回溯要求二次确认）；观察状态从 gameStore `getAuthoringObserverEvents()` 刷新。
7. **Task 7 — parity**：parity checklist 测试锁定 7 个能力 id + contextLedger + undoLastRequest；命令条增加辅助组 next-actions / dialogue-options / emergence；ui-audit 新增 authoring 路由与 regular/long/generating/error/stale/context/conflict 状态及 advisor 拦截场景；`docs/agent-runs/2026-08-22-unified-authoring-workspace/parity.md` 记录证据与 pending gates。
8. **Task 8 — documented skip**：前置条件（parity artifact 含截图与用户验收）未满足，未改任何路由；gate 保持 pending。
9. **Task 9 — 发布交接**：verify:full 全过；STATUS / PLAN / LOG / roadmap / known-issues 更新。

## Verification

- Focused per task（RED→GREEN 见各 commit）：
  - Task 1: uiControlContract + integration 27/27（RED：1 failed 缺 authoring 路由）。
  - Task 2: authoringWorkspace + gameStoreSession + integration 40/40（RED：模块不存在）。
  - Task 3: uiControlContract 14/14（RED：缺 AuthoringCommandBar）。
  - Task 4: authoringWorkspace 等 3 文件 41/41 + uiControlContract 14/14（RED：transaction 模块不存在）。
  - Task 5: authoringWorkspace 3/3 → 全套 17/17（RED：inspector 不存在）。
  - Task 6: authoringWorkspace 4/4 → 全套 18/18（RED：composable 不存在）。
  - Task 7: 4 文件 59/59（RED：缺 authoring.next-actions 能力）。
- `npm run smoke:narrative-recovery` → exit 0（passed: true）。
- `npm run smoke:narrative-production -- --dry-run` → exit 0（60 项矩阵完整，含 rate-limit/timeout controlled faults）。
- `npm run verify:full` → exit 0：Vitest 31 files / 512 tests、Vite build OK、`git diff --check` clean、VitePress build OK。
- ESLint 定向检查：Authoring 相关新文件无新增 error（Authoring.vue 的 script/template 顺序与 irregular whitespace 为迁移自 Writing.vue 的既有问题，基线复核确认）。

## Deviations from plan

1. **Task 1**：`import.meta.url` 在 jsdom 测试环境无 file scheme，新契约测试按文件既有惯例改用 `resolve(__dirname, ...)`，断言与计划一致。
2. **Task 1**：旧 `writing` 子路由保留 `name: 'writing'` 作为命名重定向别名——Notes.vue / Experience.vue 有多处 `{ name: 'writing' }` 站内跳转，直接删除会破坏它们；计划文本允许“redirect the old workbench child writing path”。
3. **Task 1**：opening/experience/online-experience 三条路由的 `activityKey` 从 `'experience'` 改为 `'authoring'`（router/index.js 属本任务文件清单），否则导航合并后这三条路由会落到空活动高亮。
4. **Task 2**：`writingExperienceImport.js` 无需改动——既有 schema-v3 导入器已提供指纹幂等、来源引用与 split/merge 兼容，计划中的修改点实际为零差异。
5. **Task 3**：`run/cancel/undo` 先以 no-op stub 接线、Task 4 同分支内立即替换为真实运行时（相邻 commit，无中间发布）。
6. **Task 4**：`WritingNotebookEditor.vue` 未改动——`insertPlainText()` / `replaceTextRange()` 已在 defineExpose 中暴露，计划的修改点已满足。
7. **Task 7**：`conflict` 审计状态只验证“安静默认”（无异常时审阅面不渲染）；向页面注入 typed exception 需要审计钩子或 observer runtime 真实输出，超出 worker 权限，记录于 parity.md。
8. **Task 7**：`src/pages/Experience.vue` 未改动——本任务要求“Preserve the Experience route”，无需变更。
9. **Task 8**：documented skip（见上）。

## External gates（pending）

1. Live browser audit：`UI_AUDIT_ROUTES=authoring,experience UI_AUDIT_WIDTHS=1440,1024,390 UI_AUDIT_STATES=regular,long,generating,error,stale,context,conflict npm run audit:ui` —— 本环境无开发服务且禁止启动服务，未执行。
2. 真实 provider 矩阵（MiniMax / OpenAI-compatible / Anthropic-compatible）——无凭据，未执行。
3. 用户对 parity.md 的验收 → 通过后才可执行 Task 8（offline Experience 下线）。
4. Electron 持久化仍是下一平台阶段，不在本次完成范围。

## Commits

```
5902ef5 feat(authoring): establish unified workspace route
a3fba7c feat(authoring): project experience history into drafts
8e4cddb feat(authoring): add compact AI command surface
513bbc2 feat(authoring): insert AI prose with transient undo
76d6dff feat(authoring): explain activated project context
d78b4be feat(authoring): review exceptional story conflicts
01677f3 test(authoring): prove experience workspace parity
274ff32 docs(authoring): record unified workspace release
```

冻结目录 `shared/agentCapabilityContract.js` 全程未改动；workflow adapters、settings 文件与 gameStore 内部均未触碰（仅按 runtime 既定 API 消费）。
