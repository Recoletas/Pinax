# 受控项目记忆系统实施 handoff（返工版）

- **日期：** 2026-08-22（同日完成首轮评审返工）
- **分支：** `feature/controlled-project-memory`（基线 5791cc8，含共享 checkout WIP；返工在 r2 分支 `feature/controlled-project-memory-r2`）
- **计划：** `docs/superpowers/plans/2026-08-22-controlled-project-memory-system.md`
- **设计：** `docs/superpowers/specs/2026-08-22-controlled-project-memory-design.md`

## 首轮验收不通过项与返工结果

| # | 阻断 | 返工 |
|---|---|---|
| 8 | 分支不自包含：Authoring.vue 引用未提交的 writingTypographyStore，干净 worktree 构建失败（verify:full exit 1） | 已提交 `src/stores/writingTypographyStore.js` 与其合同测试；干净 checkout 构建恢复 |
| 2 | 项目标识不一致：召回用 selectedBookId，写入用 active worldbook ID | gameStore 新增 `authoringActiveProjectId` 真源：页面 openBook 时 `setAuthoringProjectId(bookId)`；`rememberAuthoringSelection({projectId})`、observer runner 的 memoryTarget、prose-commit 触发事件全部统一到书 ID（回退 worldbook） |
| 1 | 未接入 Authoring 主链路：页面 memory reader 仍读 gameStore.memories；reader 只读 intent.query 而生产请求是 intent.instruction | 页面 facade 的 memory reader 替换为 `createProjectMemoryReader`（list=受控候选 owner，context 提供书 ID/session/currentRevisions）；reader 查询改为 `intent.instruction || intent.query`，选区文本兜底 |
| 3 | 四类触发边界未接写作页；derive 只记录事件不产候选 | `noteAuthoringTextCommit()`（AI 插入与手工保存经 saveCurrentChapter 统一触发，持久化成功后才调度）；`noteAuthoringBoundary()`（selectChapter 切章时对上一章去重派生一次）；撤销经 `handleAuthoringProseUndo` 使事务来源记忆 stale；trigger derive 现在真正调度 observer scheduler → runner → 候选 owner |
| 4 | 合并/替换原地改写、非原子 | 重写为 `commitSupersedeTransaction` 单次 setItem：新 active revision 带 `supersedes[]`，原候选+冲突项统一 stale 并写 `metadata.supersededBy` |
| 5 | schema 无闭环：存量 v1 不迁移；pending 可无 sourceRevision 升 durable active；确认未显式升级 authority | `listMemoryCandidates()` 读时迁移 v1→v2 并写回；durable derived/imported active 必须有 sourceRefs+sourceRevision（MEMORY_SOURCE_REQUIRED）；`confirmMemoryCandidate` 显式升级 authority=accepted，project/session 记忆缺 ref/revision 拒绝升级 |
| 6 | ledger 非真实可解释：score 未透传；excluded 审计块显示为已采用 | resolver 透传 score/id/included/reason/recallAudit；共享 ledger part 增加 `entryId/included/score/recallAudit`，`included:false` 状态标为 excluded；Inspector 显示排除原因计数与五维评分分项 |
| 7 | UI 缺口：只查 pending 看不到 stale 来源失效；supersede 事件无按钮；置顶降权不影响评分 | 审阅面板纳入 stale-source 记忆；新增"合并冲突项/替换冲突项"按钮并接到 append-only repository API；retrieval importance 优先读 `importanceOverride` |

## 验证证据（r2 worktree 实测）

- 全量 Vitest：33 文件 / 549 用例全绿。
- Focused（wiring/workspace/ui/facade/contracts/workflows）：90/90 通过。
- `npm run smoke:narrative-recovery`：passed=true。
- `npm run smoke:narrative-production -- --dry-run`：exit 0（60 项 fixture）。
- `npm run verify:full`：exit 0（Vitest + Vite build + git diff --check + VitePress build），干净 worktree 可复现。

## 第二轮验收闭环（r2 分支追加提交）

| # | 问题 | 修复 |
|---|---|---|
| 1 | “记住选区”把 revision 拼进 sourceRef 且未传 sourceRevision，确认必然失败 | `rememberExplicitly`/`rememberAuthoringSelection` 增加 `sourceRevision`；页面改为 `sourceRefs: [chapter:<id>]` + `sourceRevision: 当前文档指纹`，确认可通过 durable 来源约束 |
| 2 | accepted 项目记忆被无条件豁免来源失效 | `invalidateMemoryBySource` 只豁免 `global-author + derivedBy==='explicit'`；带章节来源的 accepted 记忆 revision 变化同样 stale |
| 3 | 关闭 Agent 未关闭写作页记忆派生 | 页面 `toggleAgentRuntime` 同步 `setAuthoringMemoryAgentEnabled`；`noteAuthoringTextCommit` 与 bridge 调度路径均加 agent-off 门禁（显式“记住”不受影响） |
| 4 | 合并/替换绕过来源约束且存储失败仍报成功 | 事务前置同款 provenance 检查（缺 ref/revision 返回 `missing-source-provenance`）；检查 `setItem` 返回值，失败返回 `storage-failed` 不发事件 |
| 次 | 切章 boundary 被随后的 prose-commit 同 key 取消 | boundary 使用独立调度键 `<session>:boundary:<scopeKey>`；回归测试验证派生真正执行并入候选 |

## 第三轮收尾（r2 分支追加提交）

| # | 问题 | 修复 |
|---|---|---|
| 1 | Agent 初始关闭状态未同步（仅点击开关才同步） | 页面改为 `watch(copilotEnabled, …, { immediate: true })` 统一同步 `setAuthoringMemoryAgentEnabled`；点击开关路径保留 |
| 2 | boundary 独立键无法被 reset 清理，旧任务可能跨会话执行 | scheduler 新增 `cancelAll()`；`resetAuthoringObserverRuntime()` 改为取消全部待执行任务 |
| 次 | storage-failed 缺真实回归 | 新增 `Storage.prototype.setItem` 抛错回归：replace 返回 `{success:false, reason:'storage-failed'}`、不发事件、存量数据不变 |

新增回归测试：boundary 重置后零执行、显式记住→确认闭环（前轮）、Agent off/on 门禁（前轮）、storage-failed。

## 提交说明

- 首轮 10 个提交（9 feat + 1 docs）；本轮返工为独立 fix/docs 提交。合并时按整分支 squash 或按序合并均可。

## 外部门禁（如实记录）

- **Live browser audit：未运行。** 本机 vite/server 进程服务的是共享 checkout 旧代码，不代表本分支产物；1440/1024/390 与 200% zoom 记为 not run。
- **真实 provider 3×3 矩阵：未运行。** 本轮未使用检测到的 MINIMAX_API_KEY 消耗配额；六项行为验收留待具备凭据与可用构建的环境执行。

## 已知限制

- 记忆检索为纯 lexical（term overlap + bigram Dice + entity ID 命中），中文长查询依赖实体命中路径补足相关度；无 embedding 属设计取舍。
- 手工保存触发的 prose-commit 以整章文本为界（观察器自身按句截断），尚未做精确 changed-range diff。
- Authoring 记忆审阅面板直接读写 localStorage owner；桌面 SQLite 阶段需经同一 facade 替换 reader。
