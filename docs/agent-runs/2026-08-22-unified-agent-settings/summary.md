# Unified Agent Settings Migration — Handoff Summary

Date: 2026-08-22
Branch: `feature/unified-agent-settings`（worktree `/tmp/pinax-unified-agent-settings`，分叉自 Foundation 合并提交 `5693d52`）
Plan: `docs/superpowers/plans/2026-08-22-unified-agent-settings-migration.md`

## What landed

- **Dispatcher / registry**：`src/services/agents/settings/settingsTaskDispatcher.js` 提供唯一设定任务入口（`createSettingsTaskDispatcher` + 页面便捷工厂 `createSettingsPageDispatcher`），所有请求经 canonical `createTaskRequest` 构造、surface 固定 `settings`；未知任务在任何服务调用前返回 `AGENT_TASK_UNKNOWN`。`settingsWorkflowRegistry.js` 将 12 个 settings owner 的 canonical 任务映射到命名 adapter，并按 6 类 Foundation workflow kind 暴露 engine workflows（接受函数或 `{ run }` 形态的 adapter）。
- **Workflow adapters**：import（source.parse 本地解析 / settings.import.extract AI 提取）、generation（foundation/candidates/field/section/revise 五映射，保留 section 批量 Map 与 baseRevision）、place（extract/fleshout，draft sourceRefs 按 envelope allowlist 过滤）、research（plan 为 ephemeral suggestions、claims 带 sourceRefs 的 setting-draft）、maintenance（review-only：actions 恒为空，仅 suggestions）。错误统一映射 timeout→`AGENT_TIMEOUT`、abort→`AGENT_ABORTED`、stale→`AGENT_TARGET_STALE`、invalid→`AGENT_RESULT_INVALID`。
- **UI rewires（最小机械改线）**：
  - `WorldbookCreationWorkspace.vue`：本地资料解析走 `source.parse`，基础基调走 `settings.foundation.generate`（内部仍调用 `tryAiGenerateFromBrief`）；取消经 AGENT_ABORTED 还原 AbortError 语义，quota/部分失败/stale UI 状态机未动。
  - `StructuredSettingsPanel.vue`：字段、分区、草稿修订三次直接调用改为 dispatcher 任务；pending/partial/error/aborted/stale 状态机、失败字段重试、revision stale 门禁与 `SettingDraftReview` 全部保留。
  - `PlaceCatalog.vue`：地点提取与补全（expand/create 两处）改为 dispatcher 任务；候选仍逐项显式审阅采纳。
- **Service 补强**：`worldbookImportGeneration.tryAiExtractWorldbookJson` 新增 signal 透传；`worldbookResearch.planWorldbookResearchQueries` 接受并透传 signal；`worldbookMaintenance.runWorldbookMaintenance` 原本接收却丢弃的 signal 现已透传到批次间与 `runGenerationTask`。
- **Gate 脚本**：`scripts/structured-settings-gate.mjs --dry-run` 在原三协议 fixture 之上新增确定性 workflow-shape 矩阵（foundation draft、field draft、section partial、cancel→AGENT_ABORTED、place review-draft、sourced claims、maintenance read-only、unknown fails-closed），dry-run 的 `fixtureReady` 现要求 shape 全过。

## Verification（deterministic）

- Focused per task（RED→GREEN 记录见各 commit）：
  - Task 1: settingsAgentWorkflows 4/4。
  - Task 2: settingsAgentWorkflows + worldBookQuickImport 22/22。
  - Task 3: settingsAgentWorkflows + integration + uiControlContract 41/41。
  - Task 4: settingsAgentWorkflows + integration + structuredPlaceFleshOutContract 46/46。
  - Task 5: settingsAgentWorkflows + worldBookQuickImport 37/37。
  - Task 6 gate 集：4 文件 53/53；ownership contract 对迁移前基线源码验证为 RED（panel 曾直接调用 `generateSettingFieldDraft(`），迁移后 GREEN。
- `npm run smoke:structured-settings -- --dry-run` → exit 0，workflow shapes 8/8，fixtureReady true。
- `npm run verify:full` → exit 0（Vitest 29 files / 472 tests、Vite build、`git diff --check`、VitePress build 全过）。注：该 worktree 分叉自测试精简合并前的集成线，用例数高于主 checkout 的 146 门禁基线，属分支基线差异而非回归。

## Deviations from plan

1. **Task 2**：`src/__tests__/worldBookQuickImport.test.js` 未改动——既有 import 测试保持全绿，无新断言需求。`settings.import.extract` 的 adapter 已实现并注册，但创建工作区没有现成的“来源→条目”AI 提取调用点（该链路在未纳入本计划的 legacy helpers 中，且 JSON 导入是确定性的）；为避免制造死代码未新增调用点，AI 链路实际接线的是 foundation 任务（Task 3 文件清单本就包含该页面）。
2. **Task 2/4**：`buildWorldbookImportPreview` 改为依赖注入（默认恒等），使 import/place workflow adapter 保持零重依赖、可被 node gate 直接加载；plan 快照中的内部调用语义不变。
3. **Task 5**：`src/services/worldbookResearchClaims.js` 未改动——纯归一化函数，无 I/O 可透传 cancellation，强行改动只会制造噪音。
4. **Registry 细节**：adapter 同时支持函数与 `{ run }` 对象两种形态（plan 快照的 workflow 均为对象形态）；`createSettingGenerationServices.generateFoundation` 置 null（foundation 服务由创建工作区注入），缺失方法时返回 `AGENT_WORKFLOW_UNAVAILABLE` 而非抛错。

## External gates（未执行，不视为通过）

- MiniMax、OpenAI-compatible、Anthropic-compatible 三类真实渠道的字段/分区 3×3（`smoke:structured-settings` 非 dry-run，需真实凭据）。
- 真实 API 下 revision stale/取消行为复验、真实 quota 场景。
- 设定页 1440/1024/390px live browser audit 迁移后回归截图（当前环境无开发服务）。

## Commits

```
55751a1 feat(settings): add canonical agent dispatcher
5337b9a refactor(settings): route source import workflows
9aab43a refactor(settings): unify structured generation tasks
7891bc9 refactor(settings): unify place generation workflows
35233a8 refactor(settings): unify research and maintenance tasks
fd66337 docs(settings): record agent migration gates
```
