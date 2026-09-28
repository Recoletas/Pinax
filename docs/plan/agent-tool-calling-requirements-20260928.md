# Agent 工具调用实施需求（AT-01 基线核对版）

2026-09-28｜上位计划：[agent-tool-calling-20260927.md](./agent-tool-calling-20260927.md)
本文保留为执行者的**基线与 AT-00 部分实施报告**；下述数字是执行者报告值，不是规划者本轮独立复验结果。2026-09-28 复核后，实际施工以[施工约束与逐包任务卡](./agent-tool-calling-execution-20260928.md)为准，尤其是调用图、WIP 输入包、AT-00 剩余项和验证边界；本报告原始记录留存，不自动视为每项裁定获准。

---

## 0. 结论

基线不是"干净 main 待实施"，而是**四盏红灯 + 两处已有未提交部分实现**。
原顺序 01→02→… 会撞死在第一个碰 `Authoring.vue` 的包。**必须先做 AT-00。**

---

## 1. 硬门禁实测

| 门禁项 | 实测 | 上限 | 判定 |
|---|---:|---:|---|
| `Authoring.vue` 行数 | 11051 | 10900 | 红，超 151 |
| `Authoring.vue` import 数 | 120 | 125 | 绿，余 5 |
| `src/services` 根 JS | 14 | 20 | 绿，余 6 |
| production 依赖环 | 0 | 0 | 绿 |
| production experimental edges | 2 | 0 | 红 |
| Authoring bundle | 1,452,287 B | 1,450,000 B | 红，超 2,287 |
| Vitest 文件 / 用例 | 19/20、199/200 | 20、200 | 红，1 条失败 |

### 1.1 experimental edges=2 是脚本 bug

违规两条均来自 `__tests__`：

```
src\__tests__\integration.test.js      -> ../services/experimental/promptBuilder
src\__tests__\memoryCandidates.test.js -> @/services/experimental/memoryReceipt
```

`structure-budget-check.mjs` 硬编码 `path.includes('/__tests__/')`，Windows 上 `readdirSync` 返回反斜杠 → 测试文件被当 production file。**修路径判断，不动预算数字。**

### 1.2 唯一失败的用例

`uiControlContract.test.js:189` 断言 `@click="revealRehearsalComposer"`。WIP 删了该按钮，但 `revealRehearsalComposer` 的**自动触发在 HEAD 就已存在**（`watch([blockComposer.open, interventionComposer.open], ...)`，工作树与 HEAD 逐字相同）。按钮冗余，**断言过期而非代码回归**。

---

## 2. 未提交改动归属（36 条 = 3 流）

| 流 | 条 | 内容 | 处置 |
|---|---:|---|---|
| W1 文档/本地化/截图 | 26 | README×2、LOG/PLAN/STATUS、user-manual×17、manifest×2、`i18n/en.json`、`DocsPage.vue`、`Authoring.block-native.css`、`public/docs/**` 18 PNG、`agent-runs/**` | 与 AT 无交集，留主工作树 |
| W2 试演重复防护 | 4 | `openclawService.js` 提示词、`authoringRehearsal.js` 新增 `repeatsCommittedPassage`（32 字窗口重叠即 throw）、`authoringRehearsalToolRun.js` 措辞、`shared/authoringRehearsalConsequenceContract.js` | **AT-08 已完成前身**，保留不退回 |
| W3 现场识别 | 6 | **未跟踪新文件** `src/services/agents/authoring/authoringSceneRecognition.js`（37 行）、`Authoring.vue` +182、`AuthoringSceneCuration.vue` +25、`AuthoringInspectorDetail.vue` +8 | **AT-09/10 原型**，逻辑保留 |

`docs/plan/agent-tool-calling-20260927.md` 本身也是未跟踪——上位计划从未提交。

### 2.1 `Authoring.vue` 的 +182 混了三件事

| 子流 | 位置 | 内容 | 归属 |
|---|---|---|---|
| 速记标题可编辑 | 模板 421-441；`wt3RenameDoc` / `cancelExplorationTitleEdit` | 静态 `<strong>` → 可编辑 `<input>`；配套 `WritingNotebookEditor.vue` +72/-55 | 他人工作流，**不碰** |
| 移除冗余推演锚点 | hunk `@@ -621,6 +624,0 @@` | 删 `button.authoring-rehearsal-anchor` | 有意清理，见 §1.2 |
| 现场识别 | 4164-4258，8 函数 + 3 状态 | `sceneRecognitionKey` / `scanCurrentSceneMentions` / `prepareRehearsalSceneReview` 等 | **W3，本期范围** |

### 2.2 W3 现状缺口

已具备：候选结构 `{id, kind, name, excerpt, sourceRef}`、已存在过滤、同名歧义丢弃。
缺：否定/回忆语境（纯字符串匹配，**会误入场**）、缓存键/版本/增量失效（仅最简 `sceneRecognitionSeenKey`）、离场候选、上下文重叠与有界重扫、协调逻辑在页面。

---

## 3. 计划三处修正

| 计划原文 | 实测 | 后果 |
|---|---|---|
| `src/views/Authoring.vue` | `src/pages/Authoring.vue` | 找错文件 |
| `src/composables/authoringKnowledgeQuerySession.js` | `src/services/agents/authoring/authoringKnowledgeQuerySession.js` | 找错文件 |
| "保留入口" `agentExecutionEngine.js` 承担统一分派 | **仅** `settingsTaskDispatcher.js` 用它；助手链路根本不经过 | **最危险**：照此动会走错方向 |

---

## 4. 真实调用图

```
助手  Authoring.vue → useAuthoringKnowledgeAssistant.js
      → services/agents/authoring/authoringKnowledgeQuerySession.js
      → advisorAgentRunner.js → textModelAgentProvider.js
        →（仅工具任务）toolCallingProviderAdapter.js

推演  Authoring.vue → authoringRehearsal.js
      ├─ shared/authoringRehearsalConsequenceContract.js
      └─ authoringRehearsalToolRun.js → narrativeToolRegistry.js

另一条（AT-04 提取对象）
      experienceTurnCoordinator.js → narrativeKernelExecutor.js
      ├─ narrativeAgentOrchestrator.js（1869 行）
      └─ narrativeToolRegistry.js

识别  Authoring.vue（唯一调用方）→ authoringSceneRecognition.js
      UI: Authoring.vue → AuthoringInspectorDetail.vue → AuthoringSceneCuration.vue
```

---

## 5. 裁定

| # | 议题 | 裁定 |
|---|---|---|
| C1 | 36 条未提交改动 | 不提交、不丢弃、不覆盖；W2/W3 以 patch 带入 |
| C2 | 工作树起点 | 从 `6f96c92` 派生，不从脏工作树 |
| C3 | `agentExecutionEngine.js` 是否统一入口 | **否** |
| C4 | experimental edges 红灯 | 修跨平台路径判断，**不改预算数字** |
| C5 | 行数超限 | 先迁出后加功能 |
| C6 | 测试新增 | 合入既有 20 文件，**禁建新文件** |
| C7 | 共享文件 | `Authoring.vue` / `shared/*` / 公共运行器单一 owner 串行改 |
| C8 | 工具设计名 | AT-02 冻结时对齐既有 action，**不新建重叠工具** |
| C9 | §10.2 真实质量门禁 | 列为发布决策项，**不作 AT-02~12 卡口** |
| C10 | 部署 | **本轮不触发** |
| C11 | 失败断言怎么修 | **改断言不恢复按钮**（§1.2）— 唯一涉作者可见界面，判断有误请否决 |
| C12 | 非本期子流 | 原样保留，不重构不回退 |
| C13 | 工作树 | AT-00 不派生，就地修（目的就是让当前树转绿）；AT-02 起再派生 |
| C14 | 谁写实现 | 派 worker，我定稿并逐条复核实测数字 |

---

## 6. 执行顺序

```
AT-00 门禁修复（前置）  修脚本路径 bug + 修过期断言 + 迁出识别逻辑 + 重建
AT-01 基线核对          = 本文件
AT-02 run/工具目录/授权证据边界
AT-03 provider adapters + 能力探测
AT-04 从 orchestrator 提取最小公共循环
AT-05 knowledge session + readers + registry
AT-06 助手补查闭环                          ── M1
AT-07 rehearsal session/path + 状态投影
AT-08 在 W2 基础上做有界多轮核对            ── M2
AT-09 识别服务 + 独立 composable
AT-10 scene curation + 使用入口
AT-11 采用/撤销 owner + 识别失效通知        ── M3
AT-12 持久化 + 取消链
AT-13 验证资产（随包推进）
AT-14 文档/开关/生产适配                    ── M4
```

### AT-00 已执行结果（2026-09-28）

| 项 | 结果 |
|---|---|
| experimental edges | 2 → **0**，Linux/Windows 双验，`limits` 未动 |
| Vitest | **20/20 文件、200/200 用例全绿** |
| eslint（4 个 src 文件） | 0 error / 0 warning |
| 迁出 | 新建 `src/composables/useAuthoringSceneRecognition.js` 149 行；`Authoring.vue` 11051 → 10969 |
| 依赖环 | 0（composable 无 `src/pages/**` 反向依赖） |
| `Authoring.vue` 行数 | 10969 > 10900，**仍超 69** |
| bundle | 1,452,287 > 1,450,000，**仍超 2,287** |

**未解决**：识别逻辑总量仅 100 行（8 函数 96 + 状态 4），全搬 = 11051−100 = 10951，**仍超 51**。要过 10900 必须再从别处迁 ≥69 行（如 `useAuthoringSceneWorkflow` 编排）。**未改预算数字，未擅自扩范围。**

---

## 7. 验收命令

```bash
. "$HOME/.nvm/nvm.sh"
node node_modules/vitest/vitest.mjs run
node scripts/architecture/structure-budget-check.mjs --enforce
npm run build && node scripts/architecture/authoring-build-size-check.mjs
npm run lint:delta && git diff --check
```

每包记录真实数字与退出码。结构预算等既有失败必须单列，不得跳过后宣称全绿。

AT-13 复用既有资产：`agents-tool-authz-eval.mjs`、`agent-tool-guards-eval.mjs`、`authoring-rehearsal-consequence-matrix.mjs`、`narrative-provider-matrix.mjs`、`authoring-journeys-smoke.mjs`、`narrative-release-gate.mjs`、`knowledge-read-model/gate-fault-matrix.mjs`。

---

## 8. 边界与挂账

**做不了、不许声称完成的**：§10.2 真实评测（24 任务 × ≥2 次 × 多 provider，需真实请求与费用）、用户亲自验收的三条旅程、任何生产部署。

**未验证**：`toolCallingProviderAdapter` 自身往返完整性；推理模型 parts 协议字段对 `assistantToolMessage` 的实际影响（计划明令不得提前登记为已复现故障）；`shared/authoringRehearsalConsequenceContract.js` 完整 diff；WIP 中 `Authoring.vue` 零散 hunk（429/971/1047/2472/5463/5658/10104）意图；迁出后**未做浏览器实跑 UI 走查**。
