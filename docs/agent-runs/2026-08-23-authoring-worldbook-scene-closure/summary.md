# Handoff — Authoring Worldbook Scene Closure

- **Base**: `integration/consolidation-20260823` @ `1cad142`（含已批准设计提交 `abb011b`）
- **Final runtime commit**: `5e47305` on `feature/authoring-worldbook-scene-closure`（合计 14 个提交，含本 handoff 文档）
- **Worktree**: `/tmp/pinax-authoring-worldbook-scene-closure`（隔离，未触碰共享 checkout）
- **Plan**: `docs/superpowers/plans/2026-08-23-authoring-worldbook-scene-closure.md`

## Rework after integration review (eb734b8)

用户源码复验发现 4 个闭环缺口与 2 个非功能问题，已在 `fix(authoring): close integration review gaps` 修复：

1. **跨书切换同步**：新增统一 `activateBook(bookId)`（saveCurrentChapter + setAuthoringProjectId + syncBookWorldbook + refreshAssetInbox）；`openBook` / `selectBookChapter` / `openBookAtChapter` 三条换书入口全部收口，直接改 `selectedBookId` 的旁路已消除。回归：authoringSceneRail.test.js 源 pin 断言三个入口都走 activateBook 且不再直接赋值。
2. **Experience 会话解耦**：投影 v2 路径完全不读 `runtimeState.sceneThread`（sceneId 恒 null、无 scene-thread sourceRefs）；页面投影与 kernel runtime state 不再携带 `sceneThread/historyNode`；执行器入口显式剥离这两个键，绝不传给 buildKernel。回归：v2 投影泄漏测试 + 执行器 kernelArgs 无 sceneThread 测试 + 页面源 pin。
3. **检查器世界书关系**：人物详情关系按 v2 `subjectId/objectId` 匹配（保留 v1 姓名匹配兼容）；带 `worldbook-entry:` 来源证据的角色优先使用投影摘要的 goal/mood/voiceBasis，旧 encountered 列表只作回退；Composer 行动者/对象名解析优先走共享投影。回归：源 pin 三项。
4. **persist 失败恢复**：persist 边界改为 `retryable:false`（Composer 只显示“再次保存”，不再同时提供会重复插入正文的“重试”）；待保存回执在内存中保留正文；`retryPersist()` 成功后推进 appliedCount（输入区清空）并把正文交还页面，页面处理器据此补一次观察器调度。回归：composable 测试改断言 appliedCount 1 + retryable false + 正文回传；composer 测试断言 persist 阶段无重试按钮；页面源 pin 断言再次保存处理器不触发回合重发。
5. **非功能样式**：`AuthoringInspectorDetail` 与 `AuthoringSceneCuration` 的虚线 footer 与自建边框按钮删除，动作区收敛为 Writing.global.css 中唯一的 `.writing-page .writing-inspector__actions` 共享定义（文字下划线动作、44px 触控目标）。
6. **文档修正**：本 summary 的最终提交号与提交计数已更正（此前误写 eeb210d/10 提交）。

## R3 transaction closure (5e47305)

第二轮复验发现的三个事务缺口已收口：

1. 换书前先用旧 `bookId` 构造并提交章节 boundary，再保存旧章和切换项目；`selectChapter` 抑制重复记账。删除当前书也只激活下一书一次，不再经过二次 `selectBook/openBook`。
2. 绑定世界书同步改为时序安全 owner：切书瞬间清空旧 `boundWorldbook`，加载期间 `ready() === false` 并暂停下一拍，竞态令牌丢弃迟到结果。
3. persist 再次保存回执保留内存中的有界撤销信息；保存成功后只有在撤销回执真实恢复时才显示可撤销，`undoLastRequest()` 可回到插入前正文。

R3 聚焦验证为 3 文件 / 46 用例；完整验证为 73 文件 / 901 用例。首次完整验证因本机 Node ABI 从 115 变化到 127 导致旧 `better-sqlite3` 二进制无法加载，执行 `npm rebuild better-sqlite3` 后原样重跑通过，未改业务代码规避门禁。

## Implemented tasks

| Task | Commit | Scope |
|---|---|---|
| 1 | `ad087d6` | `authoringExecutionResult` typed 失败归一；useAuthoringTask 每个边界返回 phase/code/retryable + legacy reason 共存；pending-save 回执 + `retryPersist`（只重试 persist）；低敏诊断（仅 taskId/phase/code/retryable/durationMs/requestId，abort 不算 provider 故障）；Composer 改 typed `failure` prop，phase-specific 恢复动作（重试/再次保存）；删除 `composerTurnFailure \|\| authoringTaskError` 与 `composerTurnFailureText()` 遮蔽 |
| 2 | `998f50a` | `authoringProjectWorldbook` 纯函数绑定合同（normalize/status/rebind preview）；worldStore 新增 `loadWorldbookForProject`（缺失 ID 返回 null，绝不回退 active）；新建书弹窗世界书选择行（含“暂不绑定”）；书架绑定一行文字 + 关联/换绑/重新关联动作；换绑影响锚点时 confirm；生成链只读 `boundWorldbook`；backup round-trip 保留 `worldbookId`/`sceneAnchors` |
| 3 | `b97fab2` | `insertAuthoringTurnAfterUnit` 目标感知插入（target-unit-missing/stale 原文档返回）；append 委托为尾单元目标；编辑器桥 `insertAsNewWritingUnit({afterUnitId, expectedUnitRevision})` 插在 `target.pos+nodeSize`；resolveTarget 冻结 targetUnitId/Revision/targetSource；target 缺失/过期映射 phase stale；运行时回归：选区移动不影响冻结目标、目标 revision 变化零写入 stale |
| 4 | `5098687` | `authoringSceneAnchors`（normalize/resolve/upsert/split-merge-delete-move 迁移/fingerprint）；编辑器新增 `deleteWritingUnit` 命令发出 typed delete transition；锚点随 chapter.sceneAnchors 持久化、unit-transition 时迁移并入请求级撤销回执；`commitSceneAnchorDraft` revision 守卫原子保存 |
| 5 | `3e00f5f` | 投影 schema v2：activeUnitId/worldbookId/worldbookStatus/anchorStatus/inheritedSuggestion/missingRefs/projectionFingerprint（含锚点内容）；`authoringWorldbookSceneAdapter` 有界角色/地点/关系索引（关联边不发明情感标签）；观察器摄取保留 text/sourceRefs/unitId/unitRevision/documentRevision/status，过滤移入投影；正常投影不再依赖 Experience sceneThread；观察器失败独立包裹不推翻已成功回合；v1 输入保留兼容路径 |
| 6 | `589fd43` | executor 显式输入合同（projectId/projectionFingerprint 由调用方传入，不内部查 store/route/session）；provider 前上下文门禁：AUTHORING_CONTEXT_MISSING / AUTHORING_WORLDBOOK_MISSING / AUTHORING_FROZEN_CONTEXT_MISSING / AUTHORING_CAST_MEMBER_ABSENT；故意解绑的书以 worldbook:null 继续 |
| 7 | `0201b89` | 导入扩展：confirmWorldbookBinding 才写 book.worldbookId（否则 bindingProposal 不变异）；确认后为首个导入单元建 source:'legacy-import' 场景锚点（只归一化稳定 ID，不含会话正文）；页面导入路径默认不确认只提示；浏览器 bundle 与桌面 converter fixture 测试锁定 worldbookId/sceneAnchors 原样保留（不改名、不从全局状态推断） |
| 8 | `f43cc84` | 左栏改为“当前场”：无逐人行动者/对象按钮与 role pill；单一“调整”动作 emit edit；状态四态标签（当前落笔处/沿用上一章/未关联世界书/世界书已缺失）+ bind 动作；最多四人 + 一条未决事件后收 +N；ui-audit 新增 current-scene/worldbook-unbound/worldbook-missing 确定性状态 |
| 9 | `e290923` | Composer 成为编辑器连续续写坞：行动者/对象选择移入（就地列表 select-actor/select-target）；Zen 收成一行为“下一拍”、聚焦展开、Escape 分层关闭候选→披露→收坞再交还页面 Zen 处理；候选行动作桌面 hover/:focus-within 显现、移动端常显；导演注/半自动/参考摘要保持一个披露面板 |
| 10 | `eeb210d` | `AuthoringSceneCuration` 受控组件（时间→地点→人物布局，props/emits 合同，44px 触控目标）；检查器 detail 增加 scene-edit 临时路由；保存走 `commitSceneAnchorDraft` 单次事务，取消零写入，撤销先校验锚点指纹；换书/章/单元自动关闭过期草稿并恢复基础检查器；`buildSceneCurationCandidates` 全目录查询（查询可命中默认前八之外） |

## Verification evidence

| Command | Result |
|---|---|
| Gate A focused baseline (6 files) | PASS 66 tests |
| `npm run verify:full` (base) | exit 0, 69 files / 811 tests |
| Task-focused matrix after each task | PASS（各任务 RED→GREEN 记录于提交历史） |
| Final full focused matrix (12 files) | PASS 153 tests |
| Rework focused matrix (10 files, post eb734b8) | PASS 128 tests |
| `npm run smoke:narrative-recovery` | `passed: true`, exit 0 |
| `npm run smoke:narrative-production -- --dry-run` | exit 0 |
| `npm run verify:full` (final, post eb734b8) | exit 0, **73 files / 894 tests**, Vite build ✓, git diff --check ✓, VitePress build ✓ |
| R3 focused transaction matrix | PASS 3 files / 46 tests |
| `npm run verify:full` (post 5e47305) | exit 0, **73 files / 901 tests**, Vite build ✓, git diff --check ✓, VitePress build ✓ |
| `npm run test:desktop` | PASS 15 files / 68 tests |

## Not-run gates and reasons

1. **Live browser audit**（Task 8/9/10 Step live screenshots 与 Task 11 Step 5 完整矩阵）：本机 5173 端口确有 dev server，但其服务的源码仍是旧版本（`AuthoringSceneRail.vue` 返回 `本章现场`，非本分支 `当前场`），不满足“服务确实运行目标提交”门禁。按计划约束记录未运行。待用户 dev server 切到本分支后执行：
   ```bash
   UI_AUDIT_ROUTES=authoring \
   UI_AUDIT_STATES=regular,worldbook-unbound,worldbook-missing,generating,provider-error,stale,persist-error,scene-detail,scene-edit,zen \
   UI_AUDIT_WIDTHS=1440,1024,900,390 \
   UI_AUDIT_OUTPUT=/tmp/pinax-authoring-worldbook-scene-final \
   npm run audit:ui
   ```
2. **真实 provider short/long 回合矩阵**（Task 11 Step 6 五用例）：需要真实渠道凭据，当前环境未配置。合同级等价覆盖：executor 门禁测试（missing binding/cast/fingerprint 在 provider 调用前拒绝）、stale/persist 用例在 authoringTurnRuntime/authoringExecutionResult 测试中通过 fake provider 覆盖。
3. **`scene-inherited` live 审计状态**：活动单元由编辑器光标决定，无法在静态 fixture 中确定性控制；组件测试以 `anchorStatus:'inherited'` 断言覆盖（authoringSceneRail.test.js 四态参数化）。

## Remaining gaps

- 桌面 P3 适配（Electron 主进程对 `chapter.sceneAnchors` 的展示/编辑面）不在本计划内；converter/importer 已保证字段透传。
- `/experience` 未退役、未改动；旧体验导入仍可经 URL 触发。
- Zen 下候选列表的 Escape 关闭依赖 composer 上抛 `dismiss-all`；若后续新增第三类浮层需加入分层顺序。

## Acceptance criteria status (spec §14)

| Criterion | Status |
|---|---|
| 书与世界书显式绑定可见 | verified:test（组件/源 pin）+ 待 verified:live |
| 当前场跟随活动 writingUnit | verified:test |
| 下一拍插入冻结目标单元之后 | verified:test |
| 关系/声音/地点来自绑定世界书且不扩 cast | verified:test |
| 观察器数据带来源/revision 进入投影 | verified:test |
| 失败按 phase 可见且可恢复 | verified:test |
| 左栏/续写坞/检查器视觉审查 | not-verified:live（dev server 版本不符） |
| save/reload、stale、legacy import 证据 | verified:test（save/reload 经 backup round-trip + 章节持久化单测；真实浏览器 reload 属 live 门禁） |
| 真实 provider 路径证据 | not-verified:provider（无凭据） |
