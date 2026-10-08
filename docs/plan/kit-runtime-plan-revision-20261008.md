# Kit 运行时架构置换 —— 差距核对与修订版施工 PRD

日期：2026-10-08 · 分支：`main`（HEAD `2953f37`）· 状态：**修订版，未开工**
对应原件：用户下发的《PRD：Pinax Kit 运行时架构落地配套文档》（Plan 1 证路 / Plan 2 铺满 / 交付物 D1–D4）
本文用途：把原 PRD 与仓库现实对齐，给出可驱动施工的修订版；文档交付物 D1–D4 的前置条件见 §5。

> **⚠ 本文 §3.1 / §3.2 / §4 的施工项已被同日后续两份文档取代，以它们为准：**
> - `kit-microservice-forms-20261008.md`（微服务形态调研）改写了本文的 **G1 / G3 / 校正表 / Q1**，并新增 **Q7**（监督权归属）。本文相关段落已就地修订。
> - `kit-runtime-workorders-20261008.md`（方案重梳 + 工单）把本文 **P1-a…P1-f / P2-a…P2-e / R1–R4** 与调研的 **M1–M6** 合并重排成 3 波 15 张工单，并**推翻了本文三处前提**：① P1-e 的「切 kit 通道」在传输层已完成，剩下的是循环归属；② P1-b 的「49 项派生成注册表、断言 49/49 相等」不可行（kit `capability-manifest@1` 的 id pattern 不容点号，实测 0/49 匹配）且没必要（kit 不做能力注册，规格每请求内联传入）；③ R1 的修复成本远低于本文估计（pi-ai 的 `onPayload`/`fetch` 注入点已取证），但紧迫性高于本文估计（`taskKind=capability` 今天就在裸发 system 轮，只靠 fail-open 兜住）。**本文的 §0–§2（差距核对与校正表）与 §5（D1–D4 处置）仍然有效。**

---

## 0. 结论先行

1. **原 PRD 的 Plan 1 / Plan 2 在 `main` 上都没落地**，它描述的是目标态。照它写 D1–D4 会当场撞两条验收：「≥15 项路径/字段抽查零失败」与「退役侧零残留」——因为要退役的东西今天全在生产路径上。
2. **已经落地的是另一种形态**（2026-10-06 P2 / 10-07 P4-A 两笔，均已入 main）：canonical 运行时迁到**兄弟仓** `D:\storyflow-kit\storyharness\src\pinax\`（13 个文件），由 `npm run serve:pinax` 承载 **loopback 8451**；Pinax 侧 `adapters/pinax-adapter` 退役为 stub；`kitModelGateway` 把服务器密钥的文本调用收口成 kit 漏斗，不可达时双层 fail-open 回原生 provider。这套现状**已经写进** `docs/engineering/current-architecture.md:167-173`，且写得是准确的。
3. **原 PRD 有 11 处与仓库现实冲突**（§1 差距表），其中三处是硬阻塞：
   - 「kit runtime 内嵌进 Express 进程」**卡在没有 JS 产物**：`storyharness` 只有 `typecheck/start/serve:pinax/test/verify:pack` 五个 script，**无 build、无 dist、无 bin、无 exports**，全靠 `tsx` 跑 TS。Pinax 是纯 JS 无 TS 构建，直接 import 会在生产运行时炸。
   - 「删 4 套协议适配器 + `textModelAgentProvider`」删不得：`textModelAgentProvider.js`（241 行）是**漏斗失败时的第二层 fail-open**，2026-10-08 早上那次 dots3-note-prev 网关回归（带 system 消息即 400）就是靠它救回来的（`docs/STATUS.md` 当日行有记录）。
   - 「声明 47 项 CapabilityRegistry」：仓库里没有 `CapabilityRegistry` 这个物件，canonical 任务目录实测 **49** 项（`shared/agentCapabilityContract.js:74`），`docs/STATUS.md:113` 仍写 47，属存量漂移。
4. **修订版 Plan 1 的第一步不是切通道，是让 kit 能被 import**（§3 P1-a，属上游 PR）。在那之前，"内嵌"只能停在纸面。
5. **原 PRD 里两处包名/术语错**：kit 的核心包是 `@storyflow/core` 0.1.0（不是 `@miniflow/core`）；「flow 七动词」= `flow_list/run/next/submit/resume/gate/rerun`，实现在 `storyflow-kit/core/src/kernel-run.ts:1,67`，动词总表 27 个分 7 组（`core/src/verbs.ts:102`、`docs/Agent.md:55`）。
6. **建议**：D1–D4 里的 **D1 差额部分现在就能写**（上行协议 / 双通道 / 日志会话层三小节，都有实物），但**「StoryAgent 接入」那节不要改**——现状描述是对的，改了就是写错。D2/D3 等 Plan 1 出口再写，因为「新增一个 capability」的操作步骤会随 CapabilityRegistry 落地而变。

---

## 1. 差距表：原 PRD 断言 vs `main` 实测

| # | 原 PRD 断言 | `main` 实测 | 证据 | 影响 |
|---|---|---|---|---|
| G1 | kit runtime **内嵌进 Pinax Express 进程**，不再是独立 harness、不再走 8421 HTTP | 仍是**独立子进程**。Pinax 消费的那一面是 **8451 任务面**；但 **8421 并非幻觉**——它是 kit 内核 HTTP 面的缺省端口，真实存在且有独立 OpenAPI 契约，只是 Pinax 全仓零引用（8431 协议面同）。原 PRD 是把「内核面」与「Pinax 任务面」混为一谈，不是凭空编端口。**三面全景与活体探针见 `docs/plan/kit-microservice-forms-20261008.md` §1/§3** | `server/services/storyAgentRuntime.js:5,23,41`（`spawn(process.execPath,[tsxCli,serveTs])`）；另 3 处硬编码 endpoint：`server/routes/storyagent.js:6`、`server/services/capabilityTaskRunner.js:7`、`server/services/kitModelGateway.js:5`；8421 实据 `storyflow-kit/core/src/cli.ts:76` + `core/src/http.ts:266`；8431 实据 `storyharness/src/serve.ts:91,1164` | Plan 1 的**形态判断**（内嵌/不走 HTTP）依然错，要重写；但纠偏不能写成"8421 不存在"，否则文档又长一处假口径 |
| G2 | 仓库中 **vendored** 了 storyflow-kit | 全仓 `@earendil` **零命中**，无 `vendor/` 目录；kit 是**兄弟仓**，Pinax 通过路径 spawn | `grep -rn "@earendil" .`（排除 node_modules）= 0；`D:\storyflow-kit\storyharness\src\pinax\`（beatPlan/capabilities.json/config/contract/modelFunnel/prompt/runner/serve/server/store/toolManifest/tools + pinax-side/） | "vendor 转正"这个说法方向反了：现在是**外置**，转正意味着要么真拷进来、要么走 workspace 依赖（§6 Q5） |
| G3 | kit 可被 Pinax 直接 import（内嵌前提） | **缺口只在 storyharness，不在 core；但 core 的产物也不入库**。`core` 已有 `build: tsc -p tsconfig.json` + `bin.miniflow: ./dist/cli.js`，本机 `core/dist/` 递归 64 个 `.js`——**然 `core/.gitignore:1` = `dist/`、`git ls-files core/dist` = 0**，那是本地 build 遗留；字段上还缺 `main`/`exports`/`files`。`storyharness` v0.7.2 则**全无**：`type: module`，deps = `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`，scripts 仅 `typecheck/start/serve:pinax/test/verify:pack`，无 build / 无 dist / 无 bin / 无 exports。而 8451 任务面恰在 storyharness 里。**反向利好**：kit 把 `node_modules` 入库（`git ls-files` 实测 core 6470 / storyharness 11861，含 `tsx` 30 文件），所以"兄弟仓自带 tsx 运行时"是仓库保证而非本机巧合 | `D:\storyflow-kit\core\package.json`（build/bin）、`core\.gitignore:1`、`git ls-files core/dist`=0；`D:\storyflow-kit\storyharness\package.json`；`ls storyharness/dist` = 不存在。逐字段实测见 `docs/plan/kit-microservice-forms-20261008.md` §5.2 | **硬阻塞，但工作量比原估重**：内嵌需给 storyharness 补整棵构建（含 `pinax/` 子树与两个 `@earendil-works` 依赖处理），不是"给 core 补 exports"那么轻。故 P1-a 不应阻塞 Pinax 侧收口（§3） |
| G4 | 声明 **47 项** CapabilityRegistry（对应 agentTaskRegistry 全部 canonical 任务） | 无 `CapabilityRegistry` 物件；canonical 目录实测 **49** 项，6 个 owner：settings 13 / authoring 20 / observer 7 / materials 4 / canvas 3 / storyboard 2。kit 侧只有通用转换器 `manifestToAgentTool()` / `registerCapabilities()` 和一份工具清单 | `shared/agentCapabilityContract.js:74`（`CANONICAL_AGENT_TASKS`，实跑计数 49）；`src/services/agents/agentTaskRegistry.js:4,40`；`storyharness/src/pinax/toolManifest.ts:26,51`；`storyharness/src/pinax/capabilities.json`；`docs/STATUS.md:113`（仍写 47） | 数字要改；注册表要**从共享目录派生**，不能手抄第二份（否则又长一套双副本） |
| G5 | 写一个 **MiniMax provider 插件** | 现状是 config 里的 provider/baseUrl **分支**，不是插件；provider 绑定走 kit `llm.ts` 注册表 | `storyharness/src/pinax/config.ts:78-81`（`builtinMiniMax ? "minimax" : DEFAULTS.provider`、`https://api.minimaxi.com/v1`）；`docs/STATUS.md` 2026-10-06 行「provider 绑定经 kit `llm.ts` 注册表」 | 工作量与位置都要改：是往注册表加条目，不是新写插件 |
| G6 | 接通 **sessions.jsonl + journal + metrics** 落盘（Pinax 侧） | 落盘能力**已在 kit 侧存在**，Pinax 侧零命中：`<projectDir>/<corpus.sessionsDir>/<sid>.jsonl`（首行 `session_start` 带元数据、`SessionEvent` 联合、`TokenUsage` 含 cost、`listSessions` 索引）；任务快照 `task-<taskId>.jsonl`（last-line-wins，5 状态 pending/running/completed/failed/cancelled） | `storyharness/src/sessions.ts:2,98,102,110,116,143`；`storyharness/src/pinax/store.ts:6,48,77,89`；Pinax 侧 `grep -rn "\.jsonl" server/ src/` = 0 | 不是"接通落盘"，是"让 Pinax 的 bookId/会话维度对上 kit 的 projectDir/corpus 布局"；现存的 `adapters/pinax-adapter/tasks-*/`（实测 **82** 个目录）就是这条链的遗留物证 |
| G7 | 密钥模型改为 **per-request providerConfig**（浏览器 key 按请求上行、不落盘） | kit `pinax/*.ts` 里 `providerConfig` **零命中**；Pinax 现状是"服务器密钥配置走漏斗 / 自带 key 直连"的二分，靠哨兵判定 | `grep -rn "providerConfig" storyharness/src/pinax/*.ts` = 0；`server/services/kitModelGateway.js:11-13`（`isServerKeyedTextConfig`、`SENTINEL`） | 这是**新增能力**而非"改密钥模型"；要先定它落在 kit 请求体还是 Pinax 网关层 |
| G8 | Plan 1 出口：**删掉 4 套手写协议适配器 + `textModelAgentProvider`（约 700 行含特例表）** | 4 个适配器都在，`server/services/providers/` 8 文件共 **1795 行**；`textModelAgentProvider.js` **241 行**，被 `server/loadEnv.js`、`server/services/advisorAgentRunner.js`、`src/__tests__/agentContracts.test.js` 引用，且它自己 import 漏斗 → 是 fail-open 第二层 | `server/services/providers/{openAiToolAdapter,openAiResponsesToolAdapter,anthropicToolAdapter,minimaxToolAdapter,structuredOutputAdapter,providerCapabilityResolver,structuredCapabilityResolver,narrativeCapabilityProbe}.js`；`server/services/textModelAgentProvider.js` | **硬阻塞**：删除前必须先根治 kit 侧 system 消息兼容（§3 风险 R1），否则一次上游回归打死全部通道 |
| G9 | Plan 2 出口：删 `narrativeAgentOrchestrator`（1,900 行手写循环） | **仍在**，实测 **1946 行**；STATUS 把 orchestrator retire 记为"待上游 PR 剩余项" | `src/services/agents/narrativeAgentOrchestrator.js`；`docs/STATUS.md` 2026-10-06 行 | 行数基本对得上；但它是 B 链的循环主体，退役顺序必须在三代表切片验证之后 |
| G10 | 桥是 **~1,000 行**（`piNarrativeAgentBridge`） | 实测 **339 行** + 同名 `.d.ts`；`docs/plan/agent-unification-kit-20261006.md` §1.1 记的是 338/119 | `src/services/agents/storyagent/piNarrativeAgentBridge.js`（339 行）、`:296`（`POST /v1/pinax/tasks`） | 只影响工作量估算，不影响架构 |
| G11 | D1 要把「StoryAgent 接入」节改写为**嵌入式库形态** | 该节**已存在且描述准确**：「运行时归属（P2 口径统一）… canonical 在 `storyflow-kit/storyharness/src/pinax/`，由 `npm run serve:pinax` 承载于 loopback 8451；Pinax 侧 adapter 已退役为 stub；`storyAgentRuntime.js` 探测/拉起，不可达时回落原生链」 | `docs/engineering/current-architecture.md:167-173` | 在 G1 未落地前改这节 = 把对的写成错的 |

---

## 2. 名词与数字校正表（写文档/排期时统一用右列）

| 原 PRD 用词 | 校正 | 依据 |
|---|---|---|
| 8421 HTTP 端口 | Pinax 消费的是 **8451** loopback 任务面；**8421 = kit 内核 HTTP 面**（真实存在，Pinax 零引用），另有 **8431 = 协议面**、**30142 = 面板 dev** | `storyAgentRuntime.js:23` 等 4 处；`core/src/cli.ts:76`；`serve.ts:91`；`scripts/ops/README.md:7-13` |
| vendored storyflow-kit | **兄弟仓**（`D:\storyflow-kit`），Pinax 侧 adapter 已是 stub | G2 |
| `@miniflow/core` | **`@storyflow/core` 0.1.0** | `storyflow-kit/core/package.json` |
| 47 项 canonical 任务 | **49 项**（6 owner 分布见 G4） | `shared/agentCapabilityContract.js:74` 实跑 |
| flow 七动词 | `flow_list / run / next / submit / resume / gate / rerun`（总表 27 动词 / 7 组） | `core/src/kernel-run.ts:1,67`、`core/src/verbs.ts:102`、`docs/Agent.md:55` |
| MiniMax provider 插件 | kit `llm.ts` provider 注册表条目 + `pinax/config.ts` 分支 | G5 |
| 约 700 行适配器 + provider | 适配器族 **1795 行** + `textModelAgentProvider` **241 行** | G8 |
| ~1,000 行桥 | **339 行**（+ `.d.ts`） | G10 |

---

## 3. 修订版 Plan 1（证路）

### 3.0 真实起点：今天两条链长这样

- **A 链（agent 回合）**：浏览器 → `server/routes/storyagent.js`（51 行，endpoint 8451）→ kit `pinax/server.ts:103 startServer()` → `pinax/runner.ts:65 createRun()` → `@earendil-works/pi-agent-core` 循环 → SSE 七事件 → 浏览器桥 `piNarrativeAgentBridge.js:296`。任务快照落 `task-<id>.jsonl`（`pinax/store.ts:48`）。
- **B 链（原生文本）**：`server/routes/chat.js`（1340 行）/ `generationAgent.js`（132）/ `services/structuredGenerationRunner.js`（286）/ `routes/advisor.js` → `services/modelRouting.js resolveModelRouting` + `services/kitModelGateway.js`（`forwardComplete:60` / `forwardCompleteStream:82` / `runKitFunnelProviderTurn:131` / `createKitFunnelFetchImpl:202`）→ 漏斗可达走 kit `/v1/pinax/complete[/stream]`；不可达 **fail-open** 回 `textModelAgentProvider.js` → `providers/*Adapter.js` 四选一。
- **批量/能力任务**：`services/capabilityTaskRunner.js` → 任务面 `taskKind=capability`（强制 submit 工具，回执即终态）。

### 3.1 施工项（按依赖排序）

| 编号 | 做什么 | 落点 | 出口判据（可跑） |
|---|---|---|---|
| **P1-a** | **让 kit 可被 import**：`storyharness` 加 build → `dist/` + `exports`/`bin`（上游 PR）；或 Pinax 生产依赖 `tsx` 并显式承担 TS 运行时 | kit 仓 `storyharness/package.json` | `node -e "import('storyharness/dist/pinax/server.js')"` 在 Pinax 的 node 版本下成功；或 `npm ls tsx` 在生产依赖里 |
| **P1-b** | **49 项能力目录派生成注册表**：从 `shared/agentCapabilityContract.js:74` 单一来源生成 manifest，经 `toolManifest.ts:51 registerCapabilities()` 注册；禁止手抄第二份 | Pinax `shared/` + kit `pinax/` | 新增等价测试：注册表 id 集合 === `CANONICAL_AGENT_TASKS` id 集合（49/49），schemaVersion 一致 |
| **P1-c** | **provider 注册表补 MiniMax 条目**（把 `config.ts:78-81` 的分支升格），渠道特例（DeepSeek thinking-off 等）统一在 kit provider 层处理 | kit `storyharness/src/llm.ts` + `pinax/config.ts` | 同一次请求在 minimax / dots 两个 provider 下都出活；特例表在 Pinax 侧引用数归零 |
| **P1-d** | **日志与会话对齐**：Pinax 的 bookId/会话维度映射到 kit 的 `projectDir/corpus.sessionsDir`，落 `<sid>.jsonl` + `task-<id>.jsonl`；顺带清掉 `adapters/pinax-adapter/tasks-*` 82 个遗留目录 | Pinax `storyAgentRuntime.js` 传参 + kit `sessions.ts` | 跑一次真实回合后，能在磁盘上找到该 sid 的 jsonl，且首行是 `session_start`、含 `TokenUsage`；`ls adapters/pinax-adapter \| grep -c '^tasks'` = 0 |
| **P1-e** | **三代表切片切 kit 通道**（原 PRD 的三种调用形态，对应真实文件）：① 助手对话＝`server/routes/chat.js`（单回合 + 工具）② 单发改写＝`server/services/structuredGenerationRunner.js`（结构化输出 + 修复重试）③ 叙事回合＝`piNarrativeAgentBridge.js` + `routes/storyagent.js`（多步工具循环 + BeatPlan + 预算） | 上述三处 | 三条各跑一次真实模型调用并留证（现有冒烟脚本：`scripts/storyagent-{beta,integration,ui}-smoke.mjs`）；未切的业务此时走"原生循环 + kit 传输"属合法态 |
| **P1-f** | **删退役件**：4 个协议适配器 + `textModelAgentProvider`（**前置 R1 已解**） | `server/services/providers/`、`server/services/textModelAgentProvider.js` | 生产引用为 0（`grep -rln` 白名单只剩测试/迁移）；`advisor`/`chat`/`generate` 三条冒烟仍出真实回执；vitest 20 文件 / 200 用例预算内 |

### 3.2 风险

- **R1（最高）**：`textModelAgentProvider` 是当前唯一的上游回归缓冲。2026-10-08 早间事故就是 dots3-note-prev 网关对任何带 system 消息的请求返 400，agent 循环结构性必带 system，漏斗三入口靠 `foldSystemIntoPrompt` 修好，**唯独 kit 进程的 agent 循环不经过它**；当时是 fail-open 回落救的（`provider=text-model` 留痕）。**删它之前必须先在 kit 侧镜像 `foldSystemIntoPrompt`**（`runner.ts` / `modelFunnel.ts`），否则 P1-f 会把一次上游抖动放大成全通道不可用。
- **R2**：内嵌后 8451 若仍被 4 处硬编码引用，会出现"两套真相"。P1-a 落地时要同步把 endpoint 常量收成一处。
- **R3**：`@earendil-works/pi-agent-core` + `pi-ai` 进 Pinax 依赖树 = 供应链面扩大，原 PRD 把审计放 Plan 2，但**内嵌那一刻就已经引进来了**，审计应提前到 P1-a。
- **R4**：行数/测试预算。`Authoring.vue` 实测 **10829/10900 行、121/125 import**（`scripts/architecture/structure-budget-check.mjs:8`），`src/services/` 根层 **16/20**，vitest **198/200**。Plan 1 若要在服务端加派生层，注意别占根层格位。

---

## 4. 修订版 Plan 2（铺满）

| 编号 | 做什么 | 落点 | 出口判据 |
|---|---|---|---|
| P2-a | 同构搬运：authoring 各会话（推演 / 知识问答 / 校对 / 画师 / 干预）、settings 五工作流、observers 派生、体验页循环全部切 kit 通道 | 体验页现存 A/B 接缝在 `src/services/agents/storyagent/experienceAgentRoute.js:5,85-88`（旗标 `pinax_experience_pi_agent_enabled`，`!enabled || args.taskContract` 时回原生环；`:1,:84` 注释明写"严格任务合同仍归原生 review/repair owner"），调用点 `src/services/experience/experienceTurnCoordinator.js:1,291` | 旗标移除后无 B 链分支；每类各一次真实调用留证 |
| P2-b | 批量类进 flow 通道（校对分批 / 设定分区），用七动词 + AND-join + 并发锁 + dry | kit `core/src/kernel-run.ts`（七动词）、`core/src/verbs.ts` | 一次批量任务在 flow 里跑完，dry 模式产出与实跑同构 |
| P2-c | 退役 `narrativeAgentOrchestrator.js`（1946 行）+ narrative 传输族 | `src/services/agents/` | 生产引用 0；合同测试在 20/200 预算内**合并置换**而非新增 |
| P2-d | 依赖转正：`@storyflow/core` / `storyharness` / `@earendil-works/*` 进 Pinax 依赖体系（workspace 依赖 or 真 vendor，见 Q5），供应链审计随做 | `package.json` | `npm ls` 能解析全部 kit 包；审计记录入库 |
| P2-e | 文档收口：此时才执行原 PRD 的 D1–D4（含「嵌入式库形态」改写，前提是 G1 真落地） | `docs/engineering/` | 见 §5 |

两刀之间不留间隔这条**保留**（原 PRD 判断正确：双循环形态长期化会让合同测试各自漂移）。

---

## 5. 文档交付物 D1–D4 的处置

| 件 | 现在能做吗 | 怎么做 |
|---|---|---|
| **D1** 更新 `current-architecture.md` | **部分能** | 「StoryAgent 接入 / 运行时归属」节（`:167-173`）**不要动**，它写的就是现状且准确。可补的差额是三小节：① 上行协议（per-capability knowledge 域 + 冻结 manifest blocks，替代每域 ≤120 项截断）② 双通道（交互回合 pi 直环 + SSE / 批量 flow 七动词）③ 日志会话层（kit `sessions.ts` + `store.ts` 的 JSONL 形态与位置）。§7 后续重构顺序可登记"adapter 已退役为 stub"这一既有事实 |
| **D2** 运行时架构图（新建 ≤120 行） | **能，但画的是现状** | 六要素里，③CapabilityRegistry 与 ⑤provider 插件形态尚未存在，图上只能画成"能力目录（49）→ 契约 → kit 工具清单"与"kit `llm.ts` 注册表 + config 分支"。若按原 PRD 画目标态，必须显式标注"未落地" |
| **D3** 使用说明（新建 ≤150 行） | **不建议现在写** | 四问里第 1 问（怎么写 CapabilityManifest 并注册进 CapabilityRegistry）与第 4 问（per-request providerConfig）都指向尚不存在的物件，写出来就是幻觉文档。第 2、3 问（provider 特例在哪层、JSONL 在哪怎么回放）今天就有实物，可先出半份 |
| **D4** STATUS / known-issues 登记 | **能** | 建议现在就登记一条「文档 PRD 前提核对：Plan 1/2 未落地，11 处口径校正」，避免下一个 session 再照旧口径写。known-issues 补两条真实限制：kit 无 JS 产物（内嵌阻塞）、fail-open 第二层不可先删 |

---

## 6. 待裁定

- **Q1 内嵌形态**（决定 Plan 1 是否成立）：① kit 加 build 出 `dist/` + exports（上游 PR，最干净）② Pinax 生产依赖 `tsx`（最快，但把 TS 运行时带进生产）③ **维持子进程**，只把文档口径改成"独立运行时进程 + loopback 任务面"（零施工，放弃原 PRD 的"内嵌"目标）。~~我倾向 ①，③ 是 fallback。~~
  **2026-10-08 微服务调研后改为倾向 ③，① 降级为独立上游工作项，② 直接排除**（依据三条，全文见 `docs/plan/kit-microservice-forms-20261008.md` §5.3）：(a) ③ 不是放弃目标而是承认已落地的就是微服务形态——Pinax 侧已有探测/复用/spawn/等健康/失败回落/总开关六件套（`storyAgentRuntime.js:22-59`），kit 侧已有声明式 `RuntimeSpec`（`web.ts`）与计划任务守护（`scripts/ops/`）；(b) ① 解的是"生产依赖兄弟仓源码"，但现场证据显示更痛的是 kit 侧守护当前不工作（8421/8431/30142 全 down，`kit-guard` 却每 5 分钟报成功、日志两天多没长）与三套监督器无统一拓扑；(c) ② 付了成本拿不到收益——storyharness 无 `exports`，import 路径仍是深链源码树。
- **Q7 监督权归属**（Q1 选 ③ 后新增）：现存三套互不知情的进程监督器——`web.ts` 进程内一条命令拉全栈、`scripts/ops/kit-guard` 计划任务每 5 分钟巡检、`storyAgentRuntime.js` 宿主侧探测+spawn。收敛成一套，还是**分层**（8451 归 Pinax 监督，8421/8431 归 kit 守护，`web.ts` 保留为 kit 开发态一键起）并把拓扑写进 `docs/engineering/`？我建议分层：宿主才知道自己要不要 agent 能力，且现有 fail-open 正是依赖这个探测结果。
- **Q2 49 项口径**：`docs/STATUS.md:113` 的"47 项"要不要就地改 49，并在 §1 差距表基础上同步 `docs/plan/agent-unification-kit-20261006.md`？
- **Q3 per-request providerConfig 落点**：进 kit 请求体（`TurnRequest`）还是留在 Pinax 网关层（`kitModelGateway`）？这决定"浏览器 key 不落盘"的卫生规则由谁执行。
- **Q4 退役闸**：删 `textModelAgentProvider` 是否以"kit 侧 `foldSystemIntoPrompt` 镜像已修 + 一次上游回归演练通过"为**硬前置**？（我建议是，见 R1）
- **Q5 依赖转正方向**：原 PRD 说"vendored 拷贝变 workspace 依赖"，但现实是**兄弟仓 spawn**、根本没 vendor 过。要真拷进仓库（vendor，CI 简单、更新麻烦）还是走 workspace/path 依赖（更新方便、CI 要能解析兄弟仓）？
- **Q6 文档节奏**：D1 差额 + D4 登记现在就做（我可以当天交付），D2 画现状版并标注未落地项，D3 等 P1-b/P1-c 落地——这个拆分你认吗？

---

## 7. 复核方法（本文每条断言都可自查）

```bash
# G1 进程形态与端口
grep -rn "8451" server/services/storyAgentRuntime.js server/routes/storyagent.js \
  server/services/capabilityTaskRunner.js server/services/kitModelGateway.js

# G2 是否 vendored
grep -rn "@earendil" --include=*.json --include=*.js . | grep -v node_modules   # 期望 0 命中

# G3 kit 有无 JS 产物
node -e "const p=require('D:/storyflow-kit/storyharness/package.json');console.log(p.scripts,p.bin,p.exports)"
ls D:/storyflow-kit/storyharness/dist                                            # 期望不存在

# G4 canonical 任务数
node --input-type=module -e "const {CANONICAL_AGENT_TASKS}=await import('./shared/agentCapabilityContract.js');console.log(CANONICAL_AGENT_TASKS.length)"

# G6 日志落盘在哪一侧
grep -n "jsonl" D:/storyflow-kit/storyharness/src/sessions.ts D:/storyflow-kit/storyharness/src/pinax/store.ts
grep -rn "\.jsonl" server/ src/                                                  # Pinax 侧期望 0 命中

# G8/G9 退役件是否还在
wc -l server/services/providers/*.js server/services/textModelAgentProvider.js \
      src/services/agents/narrativeAgentOrchestrator.js
grep -rln "textModelAgentProvider" server/ src/ scripts/

# R4 预算
node scripts/architecture/structure-budget-check.mjs | head -8
```
