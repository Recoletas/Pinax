# pinax-adapter · StoryFlow harness ↔ Pinax 适配层

把 StoryFlow 的 harness 能力（pi-agent 回合循环 + 工具环 + 任务状态）接到 [Pinax](https://github.com/Recoletas/Pinax) 上，对应 [Issue #3](https://github.com/Recoletas/Pinax/issues/3) 的 Agent 工作流诉求：**持续任务执行、定向检索与追问、任务状态/取消/恢复**。

## 当前接入位置

Pinax 原有推演调用链如下。本 PR 通过独立 beta 面板调用适配器，尚未替换这条链路：

```
experienceTurnCoordinator (Vue 前端)
  └─ runNarrativeAgentGeneration      ← 正式任务级入口，后续接入位置
       └─ runNarrativeAgentLoop        ← 循环/transcript/工具执行/repair/预算 都在 Pinax 侧
            └─ decisionRunner          ← 只是「单步模型 transport」(runNarrativeAgentTurn → SSE → provider)
```

`decisionRunner` 只处理单步模型请求。后续接入正式助手或推演时，应在任务级入口调用此适配器，使 Node 侧管理工具循环和任务状态；正文采用、设定修改与撤销仍由 Pinax 处理。当前 `src/components/authoring/StoryAgentBetaPanel.vue` 是 bridge 的实际调用者。

## 形态

```
Pinax 前端 ──(fetch + SSE)──▶ pinax-adapter (Node, 默认 127.0.0.1:8451)
                                   │
                                   ├─ pi-agent-core Agent 回合循环
                                   ├─ 工具环 = Pinax 五 lookup 的快照桥
                                   ├─ 事件翻译 → Pinax narrativeAgentStreamContract
                                   └─ 任务快照落盘 tasks/task-*.jsonl（状态/取消/恢复）
```

数据一致性：Pinax 的世界书/记忆/地理活在浏览器 stores，Node 侧 fs 看不见。适配器**不猜落盘时机**——每回合由 Pinax 客户端把资源快照随请求上行（`buildResourceSnapshot`），工具桥只读这份快照。

## 运行

需要 Node.js `>=22.19.0 <23`，仓库 `.nvmrc` 指定 `22.22.3`。依赖独立安装在此包中，不随前端根目录安装。

```bash
# 本包位于 Pinax 仓的 adapters/pinax-adapter/，上游运行时文件一律不改（外挂不内嵌）
cd adapters/pinax-adapter && npm ci --ignore-scripts
cp .external/pinax-adapter.json.example .external/pinax-adapter.json   # 填 provider/model/apiKey/baseUrl
npm start            # 默认 http://127.0.0.1:8451
npm run typecheck    # 静态类型检查
npm test             # 手动测试命令；维护者本轮未执行
```

配置优先级：环境变量（`PINAX_ADAPTER_PORT|HOST|TASKS_DIR|PROVIDER|MODEL|BASE_URL|THINKING`、`MINIFLOW_AGENT_KEY`/`ZAI_API_KEY`）> `.external/pinax-adapter.json` > 默认。密钥只进 gitignore 的文件或 env。

## 端点

| 方法 路径 | 作用 |
|---|---|
| `POST /v1/pinax/tasks` | 开跑一个叙事任务，响应即 SSE 流 |
| `POST /v1/pinax/tasks/:id/resume` | 用落盘转录续跑（不是重跑） |
| `POST /v1/pinax/tasks/:id/cancel` | 请求停止运行中任务，返回后端确认状态 |
| `GET /v1/pinax/tasks/:id` | 任务快照（状态/步数/用量/正文字数） |
| `GET /v1/pinax/tasks/list?bookId=...` | 按真实作品 ID 查询近期任务，筛选后取限额 |
| `GET /v1/pinax/contract` | 自探针：回一帧 SSE，供 Pinax 用 `parseNarrativeAgentSseEvent` 验接线 |
| `GET /healthz` | 存活 |

请求体（`src/prompt.ts` `TurnRequest`）：`requestId`、`mode(init\|continue\|auto\|respond)`、`intent`、`formatInstructions`、`maxTokens`、`kernel{revision,blocks[]}`（直接复用 Pinax `serializeKernelWithinTextPartBudget` 产物）、`resources{revision,currentPlaceId,domains{world_lookup\|geo_lookup\|…}}`、`budget{agentTimeoutMs,maxModelSteps,maxCallsPerTurn}`、可选 `taskId` 和作品归属 `bookId`。

Pinax 新任务发送真实作品 ID，世界书绑定另由作品决定，不能将世界书 ID 当成作品 ID。已归属任务恢复时沿用原作品，传入不同作品会被拒绝。同一 taskId 只允许一次在途执行；新建重复 ID 不覆盖原任务。断开 SSE 只停止向页面写帧，后端仍继续；显式停止需调用取消接口并确认终态。

## 事件契约

`src/contract.ts` 是 Pinax `shared/narrativeAgentStreamContract.js` 与 `shared/narrativeAgentContract.js` 的镜像件——事件集 `step.start / tool.input.delta / tool.call / text.delta / step.finish / usage / error`，schemaVersion 1，超限即拒。上游 `parseNarrativeAgentSseEvent` 原样可解析（有往返测试钉住）。

注意：Pinax 的流里**没有 `tool_result` 事件**（工具结果不流向客户端）。方案草图里写的 `delta/tool_call/tool_result/done` 与盘面契约不符，本实现按盘面为准。

任务生命周期另发扩展帧 `task.started` / `task.completed` / `task.failed`（`event:` 名带点，未知事件被上游 parser 安全忽略），携带 `taskId/status/usage/steps/toolCalls`。

## 预算归属

- **Pinax 守语义预算**：请求里的 `budget.*` 与上游 `NARRATIVE_AGENT_RUNTIME_LIMITS` 同源，适配器逐项执行——达 `maxModelSteps` 且仍在调工具 → 收掉工具，下一回合只能成文（镜像 `evidenceExhausted → toolChoice:'none'`）；单轮超 `maxCallsPerRound` 直接 block 并回理由。
- **超时/取消硬落账**：`AbortController` + 竞速门，provider 悬挂时 Promise 不 settle 也能落 `cancelled` 快照（有测试覆盖悬挂场景）。
- 适配器不做质量裁决，只搬运证据与收据。

## Pinax 侧接入（`pinax-side/`）

`pinaxNarrativeAgentBridge.js` 是给 Pinax 的外挂件，返回形状对齐 `runNarrativeAgentGeneration`（`ok/finalContent/trace/usage/toolRounds/totalCalls`），并驱动原有 `callbacks.onChunk/onComplete` 与 `onStatus`：

```js
import { createPiNarrativeAgentBridge } from './piAgent/piNarrativeAgentBridge'
import { parseNarrativeAgentSseEvent } from '../../../shared/narrativeAgentStreamContract'

const piBridge = createPiNarrativeAgentBridge({
  endpoint: import.meta.env.VITE_PI_ADAPTER_URL ?? 'http://127.0.0.1:8451',
  parseEvent: parseNarrativeAgentSseEvent,   // 复用上游 parser，契约漂移立刻现形
})

// 后续接入示例；当前正式推演仍走 Pinax 本体循环
const agentRun = usePiAgent
  ? await piBridge.run({ kernel: narrativeKernel, index: narrativeIndex, registry: narrativeRegistry,
      mode: productionMode, intent: effectiveIntent, formatInstructions, maxTokens, requestId, bookId: selectedBookId.value,
      signal: controller.signal, callbacks, onStatus })
  : await runNarrativeAgentGeneration({ /* 原参数 */ })
```

**必须用 `index`（`getNarrativeResourceIndex` 产物），不是 `registry`**：registry 是执行器闭包，取不出资源；快照要由 index 的 `byDomain` 构造（bridge 已处理）。

## 当前边界

> 来源对照：`vendor/storyflow-kit/` 是 StoryFlow 内核（skkbsgzf/storyflow@88532b15，MIT）的只读快照，
> 供审核者核对预算口径 / 工具环 / 超时取消的镜像声明；运行时不依赖它（只依赖 npm 包），见 [VENDOR.md](./vendor/storyflow-kit/VENDOR.md)。

| 项 | 状态 |
|---|---|
| Node 任务执行与 beta 面板 | 已接入独立验证面板，默认关闭；正式助手与推演尚未接入 |
| 真实模型验证 | 贡献者曾报告真实模型样本；维护者本轮未复验，不能视为全部渠道已验证 |
| BeatPlan 规划轮（`narrative_beat_plan` 工具、Authoring 分镜流） | 未接，仍走 Pinax 本体 |
| critic shadow / evidence validator | 未接（Pinax 侧原有，适配器不复刻） |
| 写入采纳/撤销 | 归 Pinax，适配器只交正文与 trace |
| Issue #3 的「长文资料导入」（分块提取、跨章聚合、证据可溯、增量复用） | 未做——那是世界书提取链路，与本适配层是两条工单 |
| 并发执行 | 同 taskId 互斥；不同任务可以并行，尚无跨任务的总并发限额 |
| 资料查阅 | 使用请求快照；beta 每次最多带 30 条世界书条目，bridge 每条摘要最多 520 字，不提供完整原文/RAG |

## 文件

```
src/contract.ts   Pinax 流契约 + 读工具目录镜像件
src/config.ts     运行配置（env > 文件 > 默认）
src/prompt.ts     上下文注入（kernel.blocks → system prompt）
src/tools.ts      五 lookup 的快照桥（action 枚举/限额/结果信封）
src/runner.ts     pi-agent 回合循环 + 预算守护 + 事件翻译
src/store.ts      任务快照 JSONL（状态/取消/恢复）
src/server.ts     HTTP/SSE 门面
pinax-side/       给 Pinax 的接入件 + 类型面
test/             既有契约、工具桥、端到端流、取消/恢复与 bridge 测试
```

## Beta 面板与当前检查

默认不挂载 beta。访问 `/authoring?storyagent-beta=1` 可开启该浏览器的本地开关；关闭可清除 localStorage 的 `sab_enabled` 后刷新。面板挂载期间，会话、输入和运行状态按作品分别管理；切书不会把旧书输出交给新书，回到旧书可以继续查看或取消其任务。

2026-10-01 维护者将隔离包安装及 `typecheck` 纳入 CI；现有根项目 CI 保留。本轮未新增或手动执行测试，也未部署适配器。修复和检查证据见仓库 `docs/agent-runs/pr4-integration-20261001.md`。
