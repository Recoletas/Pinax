# Agent 服务统一到 kit 的改造计划（2026-10-06）

> 状态：执行中（2026-10-06 用户确认统一方向并拍板排期）。P0.1 已交付（sync 门禁/d.ts 对齐/残留清理/kit 回退参数化）；P0.2+P1 已交付——契约口径（capability-manifest@1、beat-plan@1 进 kit contracts，adapter fixture+同步门禁+校验测试）与模型口径（kit llm.ts provider 注册表，THINKING_BUDGETS 单源判决 32768，taskBudget 落 executor），adapter 换 vendor 副本并完成 dots 真机验收（首轮+续接各一次 calc 实调）。下一步 P2 任务面进 kit。盘点与排期如下。
> 关联：`docs/agent-runs/pr5-integration-20261005.md`（上游接入回执）、`docs/engineering/current-architecture.md` §4 AI 分层、kit 仓库 `AGENTS.md` / `docs/Agent.md`。

## 0. 结论

1. **pinax-adapter 与 kit/storyharness 是同一个引擎的两套器官**：两边都基于 `@earendil-works/pi-agent-core` + `pi-ai` **0.87.1**（版本完全一致）。统一不是移植，是合并器官、消灭重复。
2. kit 明确缺五样东西，恰好是 pinax-adapter 已验证的强项：**能力清单→工具的运行时转换器**（`toolManifest.ts`，KitOp 字段对齐，头注释自述"kit 缺位补齐"）、**BeatPlan 契约**、**可取消/续接的任务存储**、**单任务预算/配额**、**多具名 provider 接入**（minimax/dots 兼容旗标）。
3. Pinax 侧真正的债不在 agent 链，而在**原生链的重复器官**：两套工具环、两个 turn 编排器、三处后端混挂的助手缝、无门面的散装 provider 引用。统一方向 = 原生链逐步改为 kit 的消费者，而不是再长一套。
4. 因此下一版本（kit 0.11 + Pinax vNext）可以做到：**模型统一**（provider registry 一个配置面，原生链与 agent 链同源）+ **agent 统一**（单一任务面、单一工具环、单一编排入口）。

## 1. 现状盘点

### 1.1 Pinax 侧：A（agent 链）/ B（原生链）双链并存

**A 链（PR #5 已转正的生产链）**：浏览器 → Express `/api/storyagent`（session 哈希任务作用域，`server/routes/storyagent.js` 48 行）→ loopback adapter :8451 → dots3-note-prev。

| 模块 | 位置 | ≈LOC | 职责 |
|---|---|---|---|
| runner | `adapters/pinax-adapter/src/runner.ts` | 379 | pi-agent 循环、SSE 帧、预算中止、强制收敛、BeatPlan 规划轮、dots 兼容旗标 |
| server | `adapters/pinax-adapter/src/server.ts` | 262 | 任务面 HTTP/SSE：run/resume/cancel/status/list/contract/healthz，并发 4 上限 |
| store | `adapters/pinax-adapter/src/store.ts` | 87 | JSONL 任务快照（last-line-wins），bookId 过滤 |
| tools + toolManifest | `src/tools.ts` / `src/toolManifest.ts` | 315/139 | 快照驱动五 lookup + manuscript/notes/outline + calc；KitOp 形清单→AgentTool |
| beatPlan / contract | `src/beatPlan.ts` / `src/contract.ts` | 215/166 | shared 三契约的 TS 镜像 |
| config | `src/config.ts` | 93 | env > `.external/pinax-adapter.json` > 默认；MiniMax 兜底 |
| 浏览器桥 | `src/services/agents/storyagent/piNarrativeAgentBridge.js` + `.d.ts` | 338/119 | SSE 解析、快照构建、生命周期校验、abort→cancel |
| 引擎/接线 | `storyagent/agentEngine.js`、`authoringAgentTurn.js`、`authoringIntegration.js`、`adoptToChapter.js`、`panelComposer.js`、`experienceAgentRoute.js` | ~600 | 助手引擎、回合回调、采纳链、@引用/技法、体验路由旗标 |
| 测试 | adapter `test/*` 24 例 + `scripts/storyagent-{beta,integration,ui}-smoke.mjs` | — | 记账/桥/e2e/工具契约 + 三条冒烟 |

**B 链（原生 MiniMax 链，生产中但器官重复）**：

| 器官 | 位置 | ≈LOC | 备注 |
|---|---|---|---|
| 工具环编排器 | `agents/narrativeAgentOrchestrator.js` | 1946 | 与 runner.ts 平行的循环：证据轮、BeatPlan、critic shadow、回执 |
| 内核+执行器 | `agents/narrativeKernel.js` / `authoring/narrativeKernelExecutor.js` | 697/364 | 上下文块构建/序列化（runner.ts 直接复用其产物） |
| 体验协调器 | `experience/experienceTurnCoordinator.js` | 757 | §291 旗标选 A/B 链，已是两链接缝 |
| 本地工具环 | `agents/narrativeToolRegistry.js` + `tools/*` + `narrativeResourceIndex.js` | ~1300 | 与 adapter `tools.ts` 镜像语义（action/上限维护两份） |
| 资料查询会话 | `authoring/authoringKnowledgeQuerySession.js`(+契约) | ~1750 | 查阅资料的本地证据层 |
| 顾问通道 | `advisorTaskService.js` → `server/routes/advisor.js` → `advisorAgentRunner.js` → `textModelAgentProvider.js` | ~800 | 讨论故事/记忆抽取的模型调用面 |
| 设定生成 | `agents/settings/*` + `server/services/structuredGenerationRunner.js` + `providers/structuredOutputAdapter.js` | ~1200 | B 链结构化产出 |
| provider 适配 | `server/services/providers/*`（minimax/openai/openai-responses/anthropic/能力探测） | ~1700 | **无统一门面**；chat.js 内 3 处重复未配置报错 |
| 共享契约 | `shared/narrativeAgent{Contract,StreamContract}+BeatPlanContract` | ~720 | 被 adapter TS 镜像（三同步） |
| 记忆抽取/观察器 | `memory/extraction/*` + `agents/observers/*` | ~1800 | 顾问通道消费方 |

### 1.2 kit 侧（D:\storyflow-kit，VERSION 0.10.0）

- 四包：`core`（flow@3 内核，HTTP :8421，verbs 单表 + MCP + CLI 三面）、`storyharness`（**pi-agent 运行时 :8431**，executor+chat 双驱）、`adapters`（FS 抽象 d.ts 面）、`panel`（pi-web fork）。`contracts/` 26 份 JSON Schema；`kit/skills.tools.json` 40 工具清单；packs 插件机制（deduce 模式）；全部 JSONL/文件持久化，无 DB。
- **已有的**：pi-agent 执行环、工具环（buildTools + skill 卡）、token 记账（sessions/receipts/telemetry/pricing）、tier 化模型配置（`.external/storyharness.json`）、thinking 预算、SSE 框架、auth、调度锁、pack 门控、doc/openapi `--check` 生成门。
- **缺的**：上节五项（toolManifest 运行时接口、BeatPlan、任务存储、单任务预算、具名 provider）。
- 债：`storyharness/src/executor.ts` 硬编码 storymasterv4 的 python 回退路径；无 CI；`node_modules` 入库（不可乱装依赖——好在 pi-agent 依赖两边同版本，P1/P2 不需要新增）。

### 1.3 关键结论

同一引擎、同版本；kit 有"骨架"（服务/记账/契约/插件），Pinax adapter 有"任务级器官"（清单转换/BeatPlan/任务存储/预算/provider 兼容）。合并方向：**Pinax 的器官长进 kit 的骨架，Pinax 原生链降级为 kit 的消费者**。

## 2. 本次合入经验 → 必须延续的工程约定

来自 PR #4/#5 两轮上游接入（`docs/agent-runs/pr4-integration-20261001.md`、`pr5-integration-20261005.md`）与 kit 维护习惯：

1. **冻结 HEAD + 保留归属**：跨仓贡献以 commit 冻结（`4fea0677`）方式合入，receipt 记录验证矩阵。
2. **验证文化**：Pinax `verify:full`（vitest 20 文件/200 用例预算已满 → 新增测试走 `scripts/` 冒烟或 adapter `node:test`）；kit 侧 `tsc --noEmit` + node:test + 生成器 `--check`。每轮交付必须附真实模型样本或明确声明未跑。
3. **fail-closed 边界**：快照有界（正文每项 ≤8000 字符）、采纳先 durable 保存（失败不发布）、任务按 session 哈希作用域隔离、凭据不进浏览器、healthz 探测不过→回落原生。
4. **契约单向同步纪律**：shared ↔ adapter 镜像"改一处=改两侧"；本计划要把它变成**单源 + 生成**，消灭手工三同步。
5. **诚实状态文档**：现状与未实现并列（kit 的"现状与未实现"表 = 上游的 known-issues），不做假完成。
6. **协作红线**（PR#4 协定）：引擎层可贡献，正文域写入权在上游；采纳永远作者所有；分支流 kit（canonical）→ fork 分支 → 上游 PR → main → server-version。

## 3. 目标架构（vNext）

```
┌─ Pinax 前端 ──────────────────────────────────────────────┐
│ 助手/体验/设定/记忆 UI（现有表面不动）                        │
│   └─ 统一 agent 缝：declared dispatcher（替代三后端混挂）    │
├─ Pinax server ────────────────────────────────────────────┤
│ /api/storyagent（保留，转发目标改为 kit）                    │
│ advisor/structured/… 路由保留，模型调用改走 kit provider API │
└──────────────┬────────────────────────────────────────────┘
               │ loopback HTTP/SSE（现 /v1/pinax/* 契约演进为 kit 任务面）
┌─ kit :8431 storyharness ──────────────────────────────────┐
│ 任务面：task store + cancel/resume + 预算/并发（自 pinax-adapter）│
│ 工具环：buildTools + registerCapabilities(KitOp 清单)        │
│         五 lookup / manuscript / notes / outline / calc /    │
│         submit_beat_plan 全部清单化，双链同源                  │
│ 模型层：provider registry（zai / minimax / dots / openai 兼容）│
│ 记账：usage→sessions/receipts/telemetry                      │
├─ kit :8421 core ──────────────────────────────────────────┤
│ KitOp/module.json（ops 声明源）、contracts/（+beat-plan@1、   │
│ task@1、capability-manifest@1）、SSE 事件族、packs           │
└───────────────────────────────────────────────────────────┘
```

原则：**Pinax 不再自有模型调用与工具实现**；kit 不碰 Pinax 正文域；adapter 目录最终消亡或仅剩配置 shim。

## 4. 分阶段改造

### P0 契约单源化 + 断双副本（1 个工作日粒度）
- 把 `adapters/pinax-adapter/src/toolManifest.ts`、`beatPlan.ts` 的契约部分上移 kit：`contracts/capability-manifest@1`、`contracts/beat-plan@1`（JSON Schema + TS 实现），kit `contracts/README` 版本轴登记。
- 修复已发生的漂移：`src/services/agents/storyagent/pinaxNarrativeAgentBridge.d.ts`（119 行）落后 pinax-side 副本（128 行）——先补齐，再加 `scripts/check-bridge-sync.mjs`（diff 双副本，exit 1）挂入 adapter CI。
- 顺手：清理 adapter 根下 89 个 `tasks-bridge-*/` 残留转录目录（加 .gitignore）。
- 出口：两侧 typecheck/test 全绿；sync-check 上 CI。

### P1 统一模型层（kit 侧，最高杠杆）
- `storyharness/src/llm.ts::makeModels` 扩为 **provider registry**：`zai`（内置）+ `minimax` + `dots`（移植 runner.ts 的兼容旗标：拒 developer 角色、不发送 reasoning_effort、空产出重试）+ 任意 OpenAI 兼容 baseUrl。thinking off/low/medium/high 预算沿用。
- `HarnessConfig` 增加单任务预算字段（maxTokens、maxModelSteps、maxCallsPerTurn、maxToolResultChars、wall-clock、并发上限 4），在 `executor.ts` 看门狗模式上落 enforcement。
- 清理 executor.ts 里 storymasterv4 硬编码回退路径。
- 出口：pinax-adapter 改指向 kit provider 层跑通 dots 真实样本（首次+续接各一次工具调用，对齐 pr5 回执基线）；kit node:test 覆盖 dots/minimax 兼容旗标。

### P2 任务面统一（adapter 器官进 kit）
- store.ts（JSONL 任务快照）+ server.ts（run/resume/cancel/list/session 哈希作用域/并发闸）作为 storyharness 的任务会话层落地；SSE 帧族并入 `core/src/sse.ts` 事件族文档；`narrativeAgentStreamContract` 升级为 kit 契约（版本轴 @2，兼容 @1）。
- 任务 usage 接 sessions.ts 记账（TokenUsage/receipts/telemetry）。
- 挂载方式二选一：serve.ts 端点链直加，或按 deduce 模式做成 **pack**（零 core 改动）。倾向 pack——上游 sync 时冲突面最小。
- Pinax 侧 `PINAX_ADAPTER_ENDPOINT` 指向 kit；`adapters/pinax-adapter` 降级为配置 shim（读 `.external/pinax-adapter.json` → 换算 kit 配置）。
- 出口：adapter 24 例 + 三条 storyagent 冒烟全绿改打 kit 后端；`storyagent-ui-smoke` 14 项交互复跑。

### P3 工具环归一（multi-tools 同源）
- 五 lookup + manuscript/notes/outline + calc + beat_plan 以 `CapabilityManifest` 清单进 kit：静态知识类（calc→kit minitools 确定性壳；skills→skill 卡）与快照查询类（需请求携带快照 envelope）分层。
- Pinax `narrativeToolRegistry`/`tools/*` 与 adapter `tools.ts` 合并为单一实现；`NARRATIVE_TOOL_LIMITS` 单源。
- 出口：同一条工具环被 A/B 两链消费；`agent-tool-guards-eval`/`agents-tool-authz-eval` 复跑绿。

### P4 原生链改造（B 链降级为消费者）
- 助手缝重构：`useAuthoringKnowledgeAssistant` 三后端混挂 → 声明式 dispatcher（单源路由表：写作与修改→agent；讨论故事/查阅资料→kit 顾问面；严格合同→原生验收），路由可观测。
- advisor 通道（`advisorAgentRunner`/`textModelAgentProvider`）与 structured 生成（`structuredGenerationRunner`）的模型调用改走 kit provider API；`server/services/providers/*` 四套适配器逐步收编进 kit registry，chat.js 三处重复报错合一。
- 体验链：`experienceAgentRoute` 旗标默认开（kit 任务面跑推演），严格任务合同仍走原生发布前验收；真实模型矩阵（3×3）通过后，`narrativeAgentOrchestrator` 的工具循环标记 retire（契约保留），critic shadow 保留观测位。
- gameStore 按 current-architecture §7.D 继续减重（`applyBeatPlanToSceneThread` 迁出）。
- 出口：Pinax verify:full 全绿 + 冒烟全绿；known-issues 登记 retired 面。

### P5 vNext 发布
- kit 0.11.0：新契约三件套 + 任务面 + provider registry + 文档（规范-*/交接回执-*、sse-events、openapi `--check`）。
- Pinax vNext：设置页「AI 配置」接 kit provider registry——**模型下拉与 agent 同源**（统一模型的用户可见交付）；`docs/user-manual` 中英文同步；上游 PR 按 P0–P4 切片分别提（每片可独立 revert）。
- 门禁：双仓全套验证 + 真实模型样本 + `storyagent-ui-smoke` 桌面/手机/暗色。

## 5. 风险与红线

| 风险 | 对策 |
|---|---|
| kit `node_modules` 入库，禁 npm install | pi-agent 依赖两边同版本 0.87.1，P1/P2 零新增依赖；确需升级时走 vendor 流程并全量回归 |
| kit 无 CI | P0 至少加 install+typecheck+test 的 Actions（对齐 adapter CI 先例） |
| 上游协作边界：正文域写入权在上游 | 本计划只动 agent/模型/工具面；采纳链保持作者所有；每片独立 PR，上游 Codex 可整体拒绝一片不伤其余 |
| vitest 预算已满 | 新测试全走 scripts/ 冒烟与 kit node:test，不挤预算 |
| dots 契约怪癖（拒 developer 角色/空产出/思维链默认开） | 作为 provider profile 固化进 kit 并配 mock 测试，不再散在 runner.ts |
| 双副本桥漂移复发 | P0 的 sync-check 门禁 + 目标态：桥本体上移 kit，Pinax 侧 import 之 |

## 6. 立即可做（不等排期）

1. 补齐 `.d.ts` 漂移 + bridge sync-check 脚本（P0，半小时级）。
2. 清理 89 个 tasks-bridge 残留 + .gitignore。
3. kit executor.ts storymasterv4 硬编码路径参数化。
4. `chat.js` 三处 MiniMax 未配置报错合一（低风险纯整理）。
