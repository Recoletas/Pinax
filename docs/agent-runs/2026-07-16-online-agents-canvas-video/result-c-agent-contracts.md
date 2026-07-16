# Window C Result — Agent Contracts

**状态**: 完成（共享 worktree，未提交）

## 新契约

### 1. agentTaskRegistry (`src/services/agents/agentTaskRegistry.js`)
- 集中登记 27 个 task 定义，覆盖 7 个 surface（worldbook / experience / writing / canvas / storyboard / comic / advisor）
- 5 条 legacy alias：`advisor.fix.selection` → `writing.fix.selection` 等
- API：`getTask(id)`、`getTasksBySurface(surface)`、`validateTaskType(tt)`、`resolveTaskType(tt)`、`isLegacyAlias(tt)`、`getTaskByLegacyAlias(name)`、`registerTask(def)`
- 所有 task 带 `id`、`taskType`、`surfaces`、`intent`、`contextPolicy`、`resultMode`、`capabilities`
- 每个 task id 和 taskType 双索引查找；`registerTask` 校验重复

### 2. agentContextEnvelope (`src/services/agents/agentContextEnvelope.js`)
- `buildContextEnvelope({ surface, projectId, target, blocks, budget })` → 标准化 context 信封
- 14 种 block kind（system / selection / scene / character / location / history / memory / references / style / rules / raw / outline / worldbook / inbox），各有默认 priority
- `addBlock` / `addSystemBlock` / `addSelectionBlock` / `addSceneBlock` / `addRawBlock` 便利方法
- `clipContextEnvelope(envelope, maxChars)`：按 priority 排序，先保留 system/rules/selection 等高优 block，剩余 budget 给中优 block，低优 block 直接 drop。drop 时产出 `dropReport`（含 sourceRefs）
- `toPromptText(envelope)` 串成纯文本

### 3. agentResultLifecycle (`src/services/agents/agentResultLifecycle.js`)
- 5 种 status：`pending` / `completed` / `failed` / `stale` / `applied`
- `createPendingResult(taskType, { baseRevision, target })` → `markCompleted` / `markFailed` / `markStale` / `markApplied` / `acknowledgeApply`
- `canApply(result, currentRevision)`：revision 匹配时返回 true，stale/applied/failed 返回 false
- `isActive`、`needsAcknowledge` 纯判断
- 结果支持 typed `suggestions`（text-patch / outline-item / create-asset / option / review / runtime-event / generation-request）和 `actions`，不再把所有结果压成字符串
- 提取器：`extractTextPatch`、`extractSuggestions`、`extractGenerationRequest`

### 4. legacyAdapter (`src/services/agents/legacyAdapter.js`)
- `adaptLegacyContextToEnvelope({ context, question, scope, taskType, target, options, mode })`：把旧 `{ context, question, ... }` 转成新 envelope
- `adaptLegacyResultToAgentResult(legacyResult, taskType)`：把旧 `{ mode, replacement, issues, action }` 转成新 AgentResult
- `adaptAgentResultToLegacy(agentResult)`：反向，给旧消费者用

## 兼容范围

### 前端
- `src/composables/useAdvisor.js`：所有公开方法（`askAdvisor`、`openAdvisor`、`closeAdvisor`、`clearAdvisorMessages`、`updateAdvisorResultStatus`）签名不变，返回值形状不变。新增 `applyAdvisorResult`、`markResultStale`、`acknowledgeResult` 三个方法供后续使用
- `src/services/advisorTaskService.js`：`requestAdvisorTask`、`requestAdvisorAdvice`、`normalizeAdvisorTaskType` 完全不变，新增 `buildAgentEnvelope(...)` 供新调用方使用
- `ADVISOR_TASK_TYPES` 常量不变

### 服务端
- `server/services/advisorTaskService.js`：`normalizeAdvisorTaskType` 和 `createAdvisorTaskResponse` 不变，新增 `validateAdvisorTaskType(taskType)` 通过 allowlist 校验
- `server/services/openclawService.js`：`serializeContext` 新增 envelope.blocks 处理分支（旧 payload 走原 path），`normalizeTaskType` 走 allowlist
- 新增 `server/services/agentTaskAllowlist.js`：32 个白名单 taskType + 5 条 legacy alias，服务端不信任客户端 task definition

## 未接入模块（设计预留 adapter 接口但不改实现）

| 模块 | 状态 |
|---|---|
| `Writing.vue` | 不修改（任务要求） |
| `Experience.vue` | 不修改 |
| `ProseEssay.vue` | 不修改 |
| `AdvisorPanel.vue` | 不修改 |
| `useCopilot` | 未接入，`buildAgentEnvelope` 可做后续桥接 |
| `useDirector` | 未接入 |
| OpenClaw Gateway | 不修改实现，server `openclawService` 仅加了 envelope 兼容分支 |
| `writingAgentContext.js` | 未修改，`buildAgentEnvelope` 的 adapter path 可调用它作为 block 数据源 |
| `writingAgentReferences.js` | 未修改，同上 |

## 测试结果

```
✓ src/__tests__/agentContracts.test.js (7 tests) — 新增
✓ src/__tests__/advisorTaskService.test.js (3 tests) — 回归通过
✓ src/__tests__/advisorResultApplier.test.js (42 tests) — 回归通过
npm run build — clean (4.28s)
git diff --check — clean
```

新增 7 个 test 覆盖：
1. 任务注册/校验/legacy alias 解析 / 动态注册 / 重复拒绝
2. 预算裁剪优先级（system+selection 保留，低优 drop，dropReport 含 sourceRefs）
3. toPromptText 只渲染非 truncated 的 string-content block
4. 完整生命周期：pending → completed → stale → cannot apply
5. legacy result ↔ agent result 双向 adapter
6. markFailed error 结构新旧兼容

## 建议的下一批页面迁移顺序

1. **Writing.vue**：把 `buildWritingAgentContext()` 的输出转为 envelope blocks，用 `buildAgentEnvelope` 替代手拼 context
2. **Experience.vue**：为 `experience.next-actions` / `experience.emergence` 构建 context envelope
3. **AdvisorPanel.vue**：把现有的 `advisorQuickActions` 替换为 `agentTaskRegistry` 的 surface 枚举 + `getWritingQuickActions` adapter
4. **Storyboard/Comic**：接入 `storyboard.generate` / `comic.adapt` 等 task definition
5. **OpenClaw/copilot/director**：通过 `buildAgentEnvelope` + `adaptAgentResultToLegacy` 桥接现有实现
