# MCP Server 与专家团方案：代码现状核对

- **状态**：只读核对完成，未改任何代码；结论待作者裁定后再排期。
- **范围**：核对《Pinax MCP 与专家团架构方案》的事实假设与当前 main 实现是否一致，指出开工前必须改的口径。
- **非目标**：不重写产品目标，不评估业务价值，不给出工时承诺。
- **上位**：[Pinax 产品整合与演进主计划](./pinax-integrated-product-roadmap.md)
- **验收方式**：本文件只做核对；实施阶段按第五节的门禁验收。

---

## 结论

方向可行，但**不能按文档原样开工**。文档里有 6 处与当前代码事实不符，其中 3 处会让 Phase 1/2 直接返工（Agent 通路、权限模型、公网安全边界），另外 3 处是重复造已有轮子（专家执行引擎、精简 Kernel、Hook 注册中心）。

真正需要新建的只有三样：

1. **MCP 传输层与工具壳**（薄适配，不承载业务）。
2. **专家配置**（引用既有的 taskType / contextProfile / effectPolicy，而不是新引擎）。
3. **MCP 专用凭据与策略签发**（浏览器 session 无法被外部进程复用）。

其余应复用 `server/routes/advisor.js`、`shared/agentCapabilityContract.js`、`shared/agentContextProfiles.js`、`src/services/agents/narrativeKernel.js` 已有链路。

---

## 一、硬问题（会卡住实现）

### B1 「MCP 调内部模块，不走 HTTP 往返」在当前架构下不成立

Agent 执行不在 Pinax 的 Express 进程里。`/api/storyagent` 只是代理，上游固定为 loopback 的 kit 任务面（默认 8451），见：

- `server/routes/storyagent.js:8-10`：默认端点取 `KIT_TASK_PLANE_ENDPOINT`，且强制 loopback。
- `server/routes/storyagent.js:70`：所有任务用 `fetchImpl` 转发到上游。
- `shared/kitTaskPlane.js:2-3`：kit 任务面 8451 是 Pinax 侧唯一直连的 kit 服务面。
- `server/services/textModelAgentProvider.js:22-25`：文本改写也统一走内核任务面，「直连退役」。
- `src/services/agents/storyagent/agentEngine.js:8, 60`：文档里要复用的 `bridge.run` 是 **renderer 侧**的桥，不是服务端依赖。

**影响**：4 个 Agent Tool 实际上只能二选一——反代 `/api/storyagent` 与 `/api/advisor`，或直连 8451。直连会绕过 policy 校验、并发上限（`storyagent.js:50` 最多 2 个 run）、预算裁剪和 task 前缀隔离，不建议。

**建议**：文档里的「不重复业务逻辑」改成「复用 server 现有代理函数」；MCP 传输层与 Express 同进程挂载，Agent 调用走进程内函数或本机 HTTP，明确写清楚是哪一种。

### B2 `assistantPolicy` 不能「直接复用」为 MCP 权限模型

现有策略是**浏览器会话级、内存态、1 小时过期**的，且身份凭据由浏览器随机生成：

- `server/services/assistantPolicyStore.js:4`：`new Map()`，进程内存储。
- `server/services/assistantPolicyStore.js:12-13`：容量 1000，`expiresAt = now + 3600000`。
- `server/routes/storyagent.js:13`：策略 store 是 router 实例私有的。
- `src/services/agents/storyagent/piNarrativeAgentBridge.js:124-127`：64 位 hex 身份存在浏览器 storage，外部进程读不到。
- `server/routes/storyagent.js:25-26`：服务端只校验「是 64 位 hex」，任何新 token 都会成为新身份。

**影响**：stdio MCP 没有浏览器 session；SSE 远程更不能把这个 token 当认证——它连认证边界都不是。

**建议**：应用内签发 MCP API Key，服务端维护「Key → policy 记录（bookId + scope + mode + TTL）」映射；每次任务前 mint/refresh policy，并把 `assistant-policy` block 注入 kernel。文档删掉「Session Token 复用浏览器 session」。

### B3 公网 SSE + localMirror 工具 = 远程任意路径读写

现有实现明确把任意路径能力限制在本机：

- `server/routes/localMirror.js:15`：open/create/worldbook/book/sources/rules 是「任意路径」能力面，公网一律 403。
- `server/routes/localMirror.js:22-24, 31`：`PINAX_PUBLIC_ORIGINS` 非空时整组拒绝。
- `server/routes/knowledge.js:23`：知识检索同样只在本地开放。
- `server/publicAccessGuard.js:6-25`：公网入站需要 proxy secret + Origin 校验。

**影响**：方案里独立开 3110 端口，不会经过 3001 上的 guard 和上述 local-only 判断。一旦按「公网部署」暴露，等于把作者整个磁盘的读写能力和项目知识库放到网络上。

**建议**：MCP 挂在 3001 同一个 app（nginx 增加 `/mcp` 转发），复用 guard；远程模式只注册 manuscript 作用域工具，localMirror 类工具在 `PINAX_PUBLIC_ORIGINS` 下不注册。

### B4 「专家团」与既有 advisor 管线大面积重叠

当前已经有一套配置化的 Agent 任务体系：

- `server/routes/advisor.js:30, 54, 157`：任务入口、taskType 白名单校验、`runAdvisorAgent` 执行。
- `server/services/advisorAgentRunner.js:40-50`：provider 选择 + 可回落执行。
- `shared/agentCapabilityContract.js:40-77`：每个任务已有 `workflowKind / contextProfile / inputSchema / resultSchema / effectPolicy`。
- `shared/agentContextProfiles.js:1-27`：每个 profile 已有 blocks 白名单与 `maxChars`。
- 另有 `writingSkillEnforcement.js`、`shared/modelLoopGuard.js` 在 advisor 链路上做技能强制和轮次守卫。

再加上方案里的 `expertAgentManager.js` + `toolChainRunner.js` + `hookRegistry.js`，会出现第二套任务类型、第二套预算、第二套权限。

**建议**：专家 = 一条注册表配置，引用既有 `taskType` + `contextProfile` + `effectPolicy`；在 advisor 请求里增加 `expertId`，由注册表解析成上述字段。不新增执行器。串联/并行先不做，等有真实用例。

### B5 `subAgentKernel.js` 与现有 compiler/kernel 重复

- `src/services/agents/narrativeKernel.js:15`：已有 `BLOCK_LIMITS`。
- `src/services/agents/narrativeKernel.js:473-497`：`contextManifest` 已是「唯一 compiled context 输入」。
- `src/services/agents/narrativeKernel.js:681-700`：manifest 存在时 lore/recent/summary 等块由 compiler 决定，kernel 不再自选来源。

**影响**：再写一套 `kernelBuilder.blocks / blockLimits`，两套白名单必然漂移，也违反「manifest 唯一真源」的现有约束。

**建议**：专家配置只写 `contextProfile: 'writing-selection'` 这类既有档位；需要新档位就往 `AGENT_CONTEXT_PROFILES` 加一行，不新建 builder。

### B6 `hookRegistry` 误读了 `runtime-extensions/`

`runtime-extensions/` 不是可热插拔的插件注册表，而是被打补丁注入 pinned kit 运行包的文件：

- `scripts/extend-assistant-runtime.mjs:4-8`：列文件清单，复制到 `dist/pinax`。
- `scripts/extend-assistant-runtime.mjs:9-18`：用锚点字符串 patch `prompt.js` / `runner.js` / `server.js`，锚点变了直接抛错。
- `runtime-extensions/assistantObservability.js:1-3`：自述是扩展 pinned assistant runtime 的提示透传。

**影响**：把静态扩展「升级为 Hook 链」等于改运行包补丁协议，回归面覆盖整个 assistant runtime。

**建议**：Hook 改为在 Pinax 侧订阅任务事件流（`storyagent.js` 已透传 SSE 事件）实现；不动运行包。

---

## 二、规格内矛盾与数字订正

| 文档说法 | 代码/规范事实 | 证据 |
|---|---|---|
| 共 23 个 Tool | 表内实际 21 个（3+3+4+2+4+5） | 方案 1.3 六组表格 |
| SSE 传输 | HTTP+SSE 已在 2025-03-26 版被 Streamable HTTP 取代，2026-07-28 修订进一步移除 initialize 与 session | [MCP Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)、[Streamable HTTP](https://modelcontextprotocol.info/specification/2026-07-28/basic/transports/streamable-http/) |
| 2.4 内置专家「代码内嵌」；2.7 又放 `项目目录/.pinax/experts/built-in/` | 两处互斥，需二选一 | 方案 2.4 / 2.7 |
| Kernel 12 Block | 实际 13 类：rules / local-rules / turn / scene / projection / cast / lore / compiled-context / summary / recent / continuity / note / style | `narrativeKernel.js:603-756` |
| 「20+ HTTP 路由」 | 16 个路由文件，共 67 个 endpoint（仅 localMirror 就 23 个） | 统计 `server/routes/*.js` |
| `pinax_agent_polish` 列在 Agent 组，底层却写 expert-group | 分组与路由归属不一致，工具分组需重划 | 方案 1.3 |
| 服务端引擎放 `src/services/agents/subagent/` | `src/` 是 renderer 代码，会 import 浏览器 storage，server 无法复用 | `piNarrativeAgentBridge.js:3` |
| 项目配置放 `项目目录/.pinax/experts/` | `.pinax/` 目前只放 `project.json` 与 `sync-manifest.json`，新增目录需排除出同步清单与备份 | `localMirrorService.js:478, 719` |

`contextProfile` 与方案里的上下文策略对得上，可直接映射：

- `writing-selection`（rules/style/selection/scene/memory/worldbook，14000 字）≈ 润笔大师。
- `narrative-advisor`（rules/scene/character/worldbook，16000 字）≈ 编剧顾问。
- `observer-quality`（rules/selection/style，10000 字）≈ 资深读者/文风比对。
- `authoring-knowledge`（28000 字）≈ 一致性检查员的上位档。

---

## 三、落地口径（已按作者共识收敛）

作者 2026-10-26 确认三条边界：**只做本地项目路线**、**只改 Agent 相关部分**、**不动前端、不改既有功能**。据此把范围收敛为：

- MCP 只读本地项目文件夹（`.pinax/project.json`），浏览器缓存书一律拒绝。
- 所有改动为新增文件 + 一处路由挂载，不改既有接口行为、不改 `runtime-extensions/`、不新增 canonical task 类型。
- 新增依赖仅 `@modelcontextprotocol/sdk`。

### Phase 1：只读 + 单点写（8 个工具，不是 21 个）

- 传输：stdio（本地）+ Streamable HTTP 挂载到 3001 的 `/mcp`；不新开 3110。
- 工具：`project_list`、`project_open`、`chapter_list`、`chapter_read`、`worldbook_list`、`worldbook_read`、`outline_read`、`knowledge_search`。
- 写操作只做 `chapter_write`，且默认 review：走提案与修订校验，不直接落盘——现有约束明确禁止绕过推演链直写正文（`runtime-extensions/assistantTask.js:14`）。
- 认证：应用内签发 MCP Key，服务端映射到 policy；本地 stdio 用一次性配对码换 Key。

### Phase 2：3 个专家（不是 6 个）

| 专家 | contextProfile | effectPolicy |
|---|---|---|
| 润笔大师 | `writing-selection` | review-draft |
| 编剧顾问 | `narrative-advisor` | review-only |
| 资深读者 | `observer-quality` | review-only |

一致性检查员暂缓：它与现有 observer/critic 职责重叠，且依赖成熟的世界书索引，成本最高、收益最不确定。文风比对、对话质检可先用同一 profile 换提示词验证，不单独建配置。

配置落点先只放应用侧；项目级 `experts/` 作为显式开关后加，避免动作者原稿目录、避免被同步/备份带走。

### Phase 3：MCP 专家工具与可选 Hook

- 只做 `expert_invoke` / `expert_list`；`parallel` 用单专家预算并发即可，`chain` 等真实用例。
- Hook 只做 `onAfterAgentRun` 的可选审阅，默认关闭；通过现有 SSE 事件流订阅实现。

---

## 四、开发排期与执行状态

节奏按「一批一验收」推进；每批只加新文件或一处挂载，批次之间不交叉。

| 批次 | 范围 | 状态 | 交付 / 验收 |
|---|---|---|---|
| 1 | MCP 骨架（stdio + 本机 Streamable HTTP）与 8 个本地只读工具 | **已实施 2026-10-26** | `server/mcp/`、`scripts/mcp-smoke.mjs`、`/mcp` 挂载；smoke 25 项通过 |
| 2 | `pinax_agent_ask`：本地项目上下文 → `/api/advisor` 只读问答 | **已实施 2026-10-26** | `server/mcp/agentAsk.js`、`tools/agentTools.js`；smoke 46 项通过；真服务打穿到既有 advisor 路由 |
| 3 | 专家注册表 + 3 个专家（润笔/编剧/资深读者） | **已实施 2026-10-26** | `server/mcp/experts/registry.js`；纯数据配置、应用数据目录 `experts.json`、内置 3 位；smoke 66 项 |
| 4 | `pinax_expert_list/invoke` + `chapter_write`（仅 review 提案） | **已实施 2026-10-26** | `tools/expertTools.js`、`tools/writeTools.js`、`chapterProposals.js`；12 个工具；smoke 86 项；真服务验证原稿哈希不变 |
| 5 | 验证与状态收口 | **已完成 2026-10-26** | 全门禁逐项通过；文件清单与已知限制见下；`verify:full` 因无 `.git` 只能逐项跑 |

批次 1 已落地的边界：

- 只读：`pinax_project_list`、`pinax_project_open`、`pinax_project_context`、`pinax_chapter_list`、`pinax_chapter_read`、`pinax_worldbook_list`、`pinax_worldbook_read`、`pinax_outline_read`。
- 只服务本地项目文件夹；非项目目录、浏览器缓存 projectId、含 `..` 的路径、公网环境四种情况均返回 typed error。
- `/mcp` 只接受回环连接与 localhost Host，拒绝带 Origin 的浏览器请求；SDK 缺失时返回 503，不影响既有服务启动。

批次 1 验证证据（2026-10-26，本工作副本）：

- `npm run smoke:mcp`：25 项全过；收尾两处健壮性修改（`chapter_read` 接受数字字符串 index、`worldbook_read` 先按 id 精确匹配再按名回退）后复跑仍 25/25，`npx eslint server/mcp scripts/mcp-smoke.mjs` exit 0。
- `npx vitest run`：20/20 文件、200/200 用例。
- `npm run build` exit 0（20.90s）；`npm run docs:build` exit 0（4.67s）。
- `npm run architecture:check` exit 0；`architecture:build-size` exit 0（1,379,978 / 1,450,000 字节）。
- `npm run catalog-sync` 21 项全过；`npm run bridge-sync` 0 失败、2 项因 kit 仓不在场环境性跳过；`npm run lint:delta` 无新增 error。
- `npm run verify:storyagent`：30/30。
- **未跑** `npm run verify:full`：本工作副本没有 `.git`，其 `git diff --check` 子步无法执行。

接入方式（批次 1）：

- stdio：客户端配置 `command: node`、`args: ["<仓库绝对路径>/server/mcp/index.js"]`；默认读 `<server>/.pinax-app` 注册表，可用 `PINAX_APP_DATA` 覆盖。
- 本机 HTTP：先 `npm run server`，再连 `http://127.0.0.1:3001/mcp`（Streamable HTTP，无状态）。
- 两种方式都只接受带 `.pinax/project.json` 的项目文件夹；浏览器缓存项目返回 `ERR_NOT_LOCAL_PROJECT`。

批次 2 已落地的边界：

- `pinax_agent_ask` 只做「装信封 + 调既有 `/api/advisor/task`」：不复制推理链、不新增执行器、不改 advisor 一行。
- 只读任务白名单由 `effectPolicy` 二次校验：`authoring.knowledge.query`（默认）、`authoring.review.chapter`、`authoring.next-actions`。其余任务（含 `authoring.continue` 等直接产文任务）返回 `ERR_ASK_TASK_NOT_ALLOWED`。
- 上下文按任务 `contextProfile` 的块白名单与顺序组装，优先级口径与 `src/services/agents/agentContextResolver.js` 一致（1000 − 顺序 × 10），预算不超过 profile 上限（答疑 28000、批注 24000、下一步 16000）。
- 默认附带约束、大纲与按问题命中的世界书条目；`review.chapter` 未指定章节时默认最后一章，并在回执 `context.warnings` 里写明。profile 不允许的块不硬塞，只记 warning。
- 传输：stdio 轨默认连 `http://127.0.0.1:3001`，可用 `PINAX_SERVER_URL` 覆盖；`/mcp` 轨按监听端口回环调用同一服务。地址必须是回环，否则 `ERR_ADVISOR_TARGET_INVALID`。
- 失败一律 typed error：`ERR_QUESTION_REQUIRED` / `ERR_ADVISOR_REJECTED`（4xx）/ `ERR_ADVISOR_FAILED`（5xx）/ `ERR_ADVISOR_TIMEOUT` / `ERR_ADVISOR_UNAVAILABLE`（服务没起）。
- 不写盘：不落提案、不改稿、不动注册表。

批次 2 验证证据（2026-10-26，本工作副本）：

- `npm run smoke:mcp`：46 项全过（9 个工具；信封块/预算/默认章节/只读拒绝/错误映射；stdio 与 `/mcp` 两条轨）。
- 真服务集成：临时端口 + 临时应用数据起 `server/index.js`，`/mcp` 初始化、9 工具、`pinax_agent_ask` 打穿到真实 advisor 路由（返回「未检测到可用模型」而非连接错误），既有 `/api/localmirror/capabilities` 仍 200。临时数据已清理。
- `npx eslint server/mcp scripts/mcp-smoke.mjs` exit 0；`npm run architecture:check` exit 0；`npx vitest run` 20/20 文件、200/200；`npm run build` exit 0（21.03s）。
- 未做真实模型调用：本工作副本没有 `.env` 与应用数据，无法配置模型；模型质量需作者在本机设置里配好后人工抽查。

批次 3 已落地的边界：

- 专家 = 纯数据配置：`id / name / role / taskType / prompt / context{chapter, includeOutline, worldbookLimit, worldbookNames} / maxChars`。没有 hooks、toolChain、kernelBuilder，配置里出现这些字段一律拒绝并说明「纯数据，不执行代码」。
- 内置 3 位：润笔大师（`authoring.review.chapter`，逐句批注）、编剧顾问（`authoring.next-actions`，压力与下一场戏）、资深读者（`authoring.knowledge.query`，读者视角+原文依据）。taskType 仍过批次 2 的只读白名单与预算上限校验。
- 配置只从应用数据目录读：`<PINAX_APP_DATA 或 server/.pinax-app>/experts.json`，`{ schema: "pinax-experts@1", experts: [...] }`。文件缺失不创建、不写入；不随项目文件夹走，不碰作者稿子目录。
- 合并规则：同 id 覆盖内置、`disabled: true` 停用、新 id 作为扩展加入；解析失败/字段非法只记 warning 并跳过，不影响其余专家。
- 提问合成：模板含 `{question}` 就替换，否则把作者问题附在末尾；空问题只用模板。
- `context.chapter` 三档：`auto`（沿用批次 2 规则）、`last`（强制末章）、`none`（不附正文）；`includeOutline` 与 `worldbookLimit` 直接控制上下文块选择。

专家配置示例（可选，放到应用数据目录）：

```json
{
  "schema": "pinax-experts@1",
  "experts": [
    {
      "id": "my-editor",
      "name": "我的编辑",
      "role": "只挑错别字与病句",
      "taskType": "authoring.review.chapter",
      "prompt": "按我的要求看：{question}",
      "context": { "chapter": "last", "includeOutline": false, "worldbookLimit": 2 },
      "maxChars": 8000
    }
  ]
}
```

批次 3 验证证据（2026-10-26，本工作副本）：

- `npm run smoke:mcp`：66 项全过（新增 20 项：内置 3 位、只读任务、预算上限、无文件不落盘、应用数据路径、自定义/覆盖/停用、非只读与 hooks 拒绝、模板合成三态、选项映射、专家提问打穿 stub advisor 并核对末章与字数）。
- `npx eslint server/mcp scripts/mcp-smoke.mjs` exit 0；`npm run architecture:check` exit 0；`npx vitest run` 20/20 文件、200/200；`npm run build` exit 0（20.94s）。
- 仍未做真实模型调用（无模型配置）；专家产出质量需作者本机实测。

批次 4 已落地的边界：

- 新增 3 个工具，共 12 个：`pinax_expert_list`（默认不给模板，`includePrompt` 才返回）、`pinax_expert_invoke`（按专家配置组合模板与问题，走既有 advisor）、`pinax_chapter_write`（审阅提案）。
- 写权限按作者 2026-10-26 裁定固定为 **review**：只写提案，不提供 auto，也不直接改 `正文/`。
- 提案落在 `<项目>/.pinax/proposals/<时间戳>-ch<序号>-<内容哈希8>.json`，schema `pinax-proposal@1`，含目标章节与修订标记、原文字数、新正文、备注、专家与 requestId 溯源。项目清单、正文、大纲、世界书都不动。
- 幂等与防重：同章节同内容已有提案直接复用（`reused: true`）；提案与原文相同返回 `ERR_PROPOSAL_UNCHANGED`；未给章节引用返回 `ERR_CHAPTER_REQUIRED`；正文上限 20 万字；目录或文件写入失败统一 `ERR_PROPOSAL_WRITE_FAILED`。
- 不生成正文：提案内容完全由调用方提供，MCP 不过模型、不触发推演生成链；正式落稿仍由作者自己完成。
- `pinax_expert_invoke` 不允许覆盖任务类型或字数上限，只能指定章节与超时；未知或已停用专家返回 `ERR_EXPERT_NOT_FOUND`。
- 公网环境（`PINAX_PUBLIC_ORIGINS` 非空）对写提案同样返回 `ERR_MCP_LOCAL_ONLY`。

批次 4 验证证据（2026-10-26，本工作副本）：

- `npm run smoke:mcp`：86 项全过。写提案覆盖生成/复用/原文相同拒绝/缺章节拒绝/公网拒绝/原稿未变/字段溯源；专家覆盖 list 两态、invoke 模板+问题、末章上下文、专家预算、只用模板、未知专家；`/mcp` 轨验证读取本机 experts.json 覆盖与停用。
- 真服务集成：临时端口 + 临时应用数据起 `server/index.js`，12 个工具、`pinax_chapter_write` 落提案且原稿 sha256 前后一致、`pinax_expert_invoke` 打穿到真实 advisor 路由（返回「未检测到可用模型」），既有 localmirror 接口仍 200。临时数据已清理。
- `npx eslint server/mcp scripts/mcp-smoke.mjs` exit 0；`npm run architecture:check` exit 0；`npx vitest run` 20/20 文件、200/200；`npm run build` exit 0（20.77s）。
- 仍未做真实模型调用（无模型配置）；专家意见与提案内容的实际质量需作者本机实测。

批次 5 收口（2026-10-26）：

> 本节的工具数与门禁计数是**批次5 时点**（12 工具 / smoke 86 项）。此后批次6 到 16 工具、批次8 到 **19 工具（v0.5.0）**：新增 `pinax_project_init`/`pinax_rule_write`/`pinax_worldbook_write`/`pinax_chapter_import`，以及 `pinax_project_import`/`pinax_project_index`/`pinax_knowledge_search`。最新矩阵看 [批次8 交付核对](./mcp-batch8-import-index-search-20261026.md) 与 `agent-skills/project-bootstrap/references/mcp-tool-matrix.md`。

文件清单

- 新增 `server/mcp/`：`index.js`（stdio 入口）、`http.js`（本机 Streamable HTTP）、`createMcpServer.js`（12 工具注册）、`localProjects.js`（本地项目解析与章节/世界书/大纲读取）、`agentAsk.js`（信封组装 + advisor 桥）、`chapterProposals.js`（审阅提案）、`experts/registry.js`（专家注册表）、`tools/{project,chapter,worldbook,outline,agent,expert,write}Tools.js`。
- 新增 `scripts/mcp-smoke.mjs`（86 项，含 stdio / `/mcp` / 专家 / 提案 / 错误映射）。
- 改动 `server/index.js`：仅新增一处 `/mcp` 挂载，动态 import，SDK 缺失返回 503。
- 改动 `package.json`：依赖 `@modelcontextprotocol/sdk ^1.32.2`；脚本 `mcp`、`smoke:mcp`。
- 改动 `docs/STATUS.md`、本文件。

门禁矩阵（2026-10-26，本工作副本）

| 命令 | 结果 |
|---|---|
| `npm run smoke:mcp` | 86/86 |
| `npm run verify:contract` | 20/20 文件、200/200 用例 |
| `npm run build` | exit 0（20.77s） |
| `npm run docs:build` | exit 0（4.69s） |
| `npm run architecture:check` | exit 0 |
| `npm run architecture:build-size` | exit 0（1,379,978 / 1,450,000 字节） |
| `npm run catalog-sync` | 21/21 |
| `npm run bridge-sync` | 0 失败、2 项因 kit 仓不在场环境性跳过 |
| `npm run lint:delta` | 无新增 error（warning 5 条不计门禁） |
| `npm run verify:storyagent` | 30/30 |
| `npm run verify:full` | 未跑：本工作副本没有 `.git`，其 `git diff --check` 无法执行；其余组成部分已逐项跑过 |

已知限制（需让作者知道）

1. 本工作副本没有 `.env` 与应用数据，无法配置模型：模型链路只验证到「请求打到既有 advisor 路由 + 错误映射」，尚无真实意见或提案正文产出。
2. 只支持本地项目文件夹（含 `.pinax/project.json`）；浏览器缓存书没有可读目录，一律 `ERR_NOT_LOCAL_PROJECT`。
3. 不提供远程 MCP：公网部署整组禁用，`/mcp` 只收回环、只认 localhost Host、拒绝任何 Origin。
4. 写权限固定 review：提案只落 `.pinax/proposals/`，MCP 不生成正文、不触发推演链；正式落稿仍需作者在应用内完成。若作者不想让项目目录多出隐藏文件夹，不调用 `pinax_chapter_write` 即可。
5. 专家配置只读应用数据目录 `experts.json`，不随项目文件夹走；改内置专家需用同 id 覆盖。
6. 没有前端改造：提案与专家都没有界面入口，目前只能通过 MCP 客户端或文件管理器查看。
7. 新增依赖只有 `@modelcontextprotocol/sdk` 一项；SDK 缺失时 `/mcp` 返回 503，既有服务照常启动。

接入与调用示例

```jsonc
// stdio 客户端
{ "command": "node", "args": ["<仓库绝对路径>/server/mcp/index.js"] }
// 或先 npm run server，再连 http://127.0.0.1:3001/mcp
```

1. `pinax_project_list` → 拿到 `projectId` / `rootPath`。
2. `pinax_project_context` → 看章节、大纲、世界书、约束清单。
3. `pinax_agent_ask { projectPath, question, taskType? }` → 只读问答与来源。
4. `pinax_expert_list` → `pinax_expert_invoke { projectPath, expertId, question? }`。
5. `pinax_chapter_write { projectPath, chapterIndex, content, note? }` → 生成审阅提案，再人工决定是否落稿。

回滚方式：删除 `server/mcp/`、`scripts/mcp-smoke.mjs`、`server/index.js` 中的 `/mcp` 挂载块、`package.json` 的两条脚本与 SDK 依赖即可；所有改动都是新增或单点挂载，不涉及既有逻辑改写。

---

## 五、待作者裁定

1. **MCP 写权限默认档**：已按作者 2026-10-26 裁定固定为 review（只出提案），不提供 auto；批次 4 已按此实施。
2. **远程 MCP**：已按作者 2026-10-26 共识关闭——只做本地路线；远程入口不开放，`/mcp` 只监听回环并拒绝浏览器 Origin。
3. **专家配置放哪**：已按作者 2026-10-26 共识落在应用数据目录（`experts.json`），不随项目文件夹走。
4. **是否接受把专家从「新引擎」降级为「advisor 任务配置」**：已按作者 2026-10-26 共识接受，批次 3 按纯数据配置实施。

---

## 六、验收建议

- 每个 MCP 工具一条契约测试：输入校验、权限拒绝、路径越界、公网禁用四种拒绝路径。
- 专家调用复用 `npm run verify:storyagent` 的两条 smoke，新增一条 expert smoke；不新增独立运行器。
- 不改 `runtime-extensions/` 哈希，`bridge-sync`、`catalog-sync` 必须保持通过。
- 新增依赖仅 `@modelcontextprotocol/sdk` 一项，安装前先确认 npm 源可达。
