# 老功能回归发现账 · 2026-10-08（agent-step 空提示词回归 + 思考型上游预算塌陷）

> 交付形态：问题现象 + 证据 + 根因 + 解决思路 + 待裁定。**本轮不改代码**，等安排。
> 背景：验证「新架构（内核统一漏斗）吞掉老架构之后，续写 / AI 讨论 / 体验 / 漫画 / 世界书等老功能是否受影响」。
> 方法：不重写提示词，直接在 Node 里 import 仓库真实服务模块，让真实 `src/services/api.js` 打真实后端与真实模型，再用**功能自己的解析器与校验闸**验收。

## 一、结论先行

1. **有一条真回归，且与新架构直接相关**：`/api/generate/agent-step/stream` 的转发层只读 `message.parts`，把 `message.content` 丢了；而契约又强制消息必须带 `content`。两者叠加的结果是——凡是只写 `content` 的调用方，**发给模型的提示词是空串，全链路不报任何错**，模型拿空提示词瞎答，返回被当成正文用。受影响功能：叙事 shadow 质检、故事试演（rehearsal）。体验主线（`narrativeAgentOrchestrator`）因为消息同时双写 `content` 与 `parts` 而幸免。
2. **批 B 其余失败都不是链路故障，而是当前内核模型不适配**：`openai.dots3-note-prev` 是思考型（笔记/答题）端点，思考 token 计入 `max_tokens`，结构化 JSON 任务在小预算下正文被吃光。同一提示词只抬预算即复现通过（对白选项 900→2400 通过；涌现事件 1000→4000 全闸通过）。
3. **五类传输链路本身全部实测健康**：流式正文、非流式正文、agent-step（双写形态）、结构化回执（任务面）、合同校验都出正确结果；世界书/画布/压缩/编导等批 A 覆盖的文本面 11/13 通过。也就是说"新架构吃掉老功能"这件事，只在第 1 条那一个点上成立。

## 二、问题一：agent-step 转发丢弃 `content`，模型收到空提示词

### 现象

同一条中文创作指令（要求正文首词必须是「矿镇雪夜」），按三种消息写法分别发 `/api/generate/agent-step/stream`：

| 消息写法 | 结果 |
|---|---|
| 只有 `content`（`{role, content}`） | 返回 `The capital of France is Paris.`、`zero zero zero zero`、`To solve this problem, we need to find the l…`（与提示词毫无关系），HTTP 200，`finishReason=stop/length`，不报错 |
| 只有 `parts` | 400 `NARRATIVE_MESSAGE_CONTENT_REQUIRED`（`messages[0] 没有内容或工具调用`） |
| `content` + `parts` 双写 | 命中标记词，正文正常（97 字，`finishReason=stop`） |

即：契约接受、且实际发往模型的，只有第一种会静默变质。

### 证据链（file:line）

- 转发层组装：`server/services/kitModelGateway.js:133-155` — 逐条消息 `const textParts = (message.parts || []).filter(part => part.type === 'text')…`，然后 `content: textParts.join('\n')`。`message.parts` 缺失时该值恒为 `''`，原消息的 `message.content` 从未被读。工具结果同理：`kitModelGateway.js:140-149` 只从 `parts` 里找 `tool-result`，`output` 退化为 `'""'`。
- 契约侧要求：`shared/generationToolContract.js:268`（`content = contentText(raw.content)`）、`:275-281`（`parts` 仅在调用方给了才附上）、`:309-311`（`!message.content && !toolCalls` 直接报 `NARRATIVE_MESSAGE_CONTENT_REQUIRED`）。**所以"只给 parts"进不来，"只给 content"进来后被网关清空。**
- 入口：`server/routes/generate.js:7` → `server/routes/generationAgent.js:43-52`（`runner = runKitFunnelProviderTurn`）。
- 受影响调用方（content-only）：
  - `src/services/agents/narrativeCritic.js:79-127` `criticMessages()` 产出 `[{role:'system',content},{role:'user',content}]`，在 `:142` 交给 `runNarrativeAgentTurn`。
  - `src/services/agents/authoring/authoringRehearsalToolRun.js:66-79` `initialMessages()`，以及 `:186-187` 的格式修复追加轮，均在 `:170`/`:189` 交给 `requestModel`（默认 `runNarrativeAgentTurn`）。
- 幸免的调用方（双写）：`src/services/agents/narrativeAgentOrchestrator.js:95-119` `transcriptPartsToGenerationMessage()` 同时输出 `content`（由 parts 反推）与 `parts`。
- 透传不加工：`src/services/generationService.js:69-92` `runNarrativeAgentTurn` 原样把 `messages` 交给 `sendNarrativeAgentStepStream`（`src/services/api.js:140`）。

### 根因

老架构时代该链路按 provider 协议（openai-chat / anthropic / responses）各自组装消息，`content` 是主字段；直连退役、统一改走 kit 漏斗后（`kitModelGateway.js:129` 注释所述），网关只按 transcript 的 `parts` 形状取文本，而契约保留了「`content` 才是必填」的历史约定。两个形状约定并存却没有一处做转换，凡是新写或沿用 content 形态的调用方都掉进空提示词。

### 解决思路（三层，建议 1+3 必做）

1. **网关兜底（最小修复，一处）**：`kitModelGateway.js:133-155` 取文本时改为「`parts` 有 text 就用 parts，否则回退 `message.content`」；tool 轮的 `output` 同样回退 `message.content`。改完 content-only 与双写两种形态都可用，行为向后兼容。
2. **契约单源化（防复发的根本解）**：`shared/generationToolContract.js:275-281` 在 `normalizeMessage` 里，当调用方没给 `parts` 时用 `content` 合成一个 `{type:'text'}` part，让下游只会看到一种形状。代价是归一化输出体积变大、parts/content 语义要写进注释。
3. **让空提示词变成硬错误（关键护栏）**：目前这类事故**在链路上任何一环都不报错**，只能靠人肉看输出对不对才发现。建议在内核侧 `D:/storyflow-kit/storyharness/src/pinax/modelFunnel.ts` 的 `validateCompleteRequest`（`:116` 起）拒绝「所有 user 轮正文皆空」的 `/v1/pinax/complete` 请求，或在 Pinax 侧 `runKitFunnelProviderTurn` 组装后自检并抛 `NARRATIVE_AGENT_EMPTY_PROMPT`。这样同类回归第一次发生就会响，而不是产出看起来像模型发疯的文本。
4. **可选静态守卫**：加一条脚本级检查，禁止 `runNarrativeAgentTurn` 的调用方传 content-only 消息（当前只有两处，成本很低）。

### 验收口径

- 复放三格矩阵必须变成：content-only ✅ 命中标记词 / parts-only ✅ 仍 400 / 双写 ✅ 不变。
- 叙事 shadow 质检（`runNarrativeCriticShadow`）必须返回 `verdict.pass` 为布尔值而不是 `null`。
- 故事试演走一遍真实 rehearsal：`parseFinal` 一次通过，不触发格式修复轮。
- 新增覆盖按仓库约定放 `scripts/*.mjs`，不占 vitest 预算（`scripts/vitest-budget-reporter.mjs:2` 上限 200 用例，现已满）。

## 三、问题二：思考型上游把预算烧成空正文，错误被折成一句话

### 现象

批 B 里 B3 对白选项、B4 涌现事件、B6 分镜、B8 漫画分页方案四行失败，前端只看到「上游模型返回为空内容」；B2 shadow 质检拿到的是无法解析的返回。直连内核 `/v1/pinax/complete` 复放同一批真实提示词后：

| 行 | 功能自设预算 | 结果 |
|---|---|---|
| B5 冒险正文 | 1200（非 JSON） | ✅ `finishReason=stop`，630 输出 token，正文正常 |
| B0 流式正文 | 500（`/api/chat/stream`） | ✅ 31 帧中文正文 |
| B3 对白选项 | 未声明 → 服务端默认 500（`server/routes/chat.js:134`） | ❌ `finishReason=length`，`outputTokens=900/900`（探针值），正文 0 字 |
| B3 复放 | 2400 | ✅ 解析出 3 个选项 |
| B4 涌现事件 | 1000（`experience/generationEmergence.js:232-236`） | ❌ `length`，`outputTokens=1000/1000`，正文 0 字 |
| B4 复放 | 3000 | ⚠️ 出 576 字但 JSON 被截断，`parseEmergenceEventDraft=null` |
| B4 复放 | 4000 | ✅ 804 字完整 JSON，**placeId / 参与者白名单 / choices≥2 / 状态增量 / title / summary 全部校验闸通过** |
| B6 分镜 | 1400（`experience/generationAdventureTriggers.js:306-310`） | ❌ `length`，正文 0 字 |
| B6 复放 | 3000 | ❌ 仍 `length`，正文 0 字 |
| B8 分页方案 | 流式 3600（`media/comicAdaptationService.js:168-177`） | ❌ 流内 0 字（`runCompleteStream` 只转发 `text_delta`，思考期无帧），抛「分页方案未完整返回」（`:176`） |

### 根因

`dots3-note-prev` 这类推理型端点把思考内容计入输出预算；kit 的 `runComplete`（`D:/storyflow-kit/storyharness/src/pinax/modelFunnel.ts:209-236`）只取 `type==='text'` 的块拼正文，思考块既不进正文也不报错，于是预算耗尽时正文为空。Pinax 侧 `server/routes/chat.js:500-501` 再把「正文为空」一律折成 `UPSTREAM_EMPTY_CONTENT`，`finishReason` 与 `usage` 被丢弃，用户无法区分"模型拒答""模型只思考没写""输入被截断"。另外该端点本身是笔记/答题人格，批 A 的 A0 出现过「我的身份是AI助手，无法扮演任何特定角色」，说明它对创作指令还有第二层不适配。

补充事实（影响排查成本）：`/v1/pinax/complete`、`complete/stream`、agent-step 三条转发链**不写内核 journal**，只有任务面（`/v1/pinax/tasks`，structured/capability）会追加 `D:/storyflow-kit/storyharness/tasks/task-*.jsonl`（`store.ts:57`）。所以上游到底报什么，正文链路上现在查不到痕迹。

### 解决思路（按彻底程度排序，可分层做）

1. **模型适配（最干净）**：把内核指到一个非思考型的创作用模型（`POST http://127.0.0.1:8451/model` 热切即可，无需重启；切换前先在内存快照当前密钥）。这条同时解决拒答人格问题。需要用户提供/确认模型行与密钥。
2. **预算分层（不换模型也能救大部分）——【20261008 裁定已执行：写死预算摒弃】**：原建议按实测值逐功能抬写死预算（对白 2400、涌现 4000）；用户裁定「暂时摒弃写死的预算模块，thinking 是完全不同的计量方式」。**已实施**：涌现/分镜两处调用点写死值删除，chat.js 双处理器（非流式+流式）的 `DEFAULT_MAX_TOKENS=500` 强制缺省撤销——未声明预算的请求不再透传 max_tokens，交内核缺省（4096，实测 dots3 该档出正文，全链活体通过）。分页方案流式链的重新设计建议维持原文。附带建议维持：`dialogueOptions`（`src/services/experience/dialogueOptions.js:25-33`）无预算声明现在落在内核 4096 兜底上，成本口径要说清楚。thinking 计量的正式设计（思考预算与正文预算分列/按端点能力自适应）另立工单。**2026-10-09 本条由过渡态升为终态（用户裁定「完全废弃，暂不加预算，只加一个最大循环次数」）**：废弃面铺满 Pinax 三侧全部调用点（详见第六节 R2 与 `docs/STATUS.md` 首行），跑飞兜底改为请求级轮数闸 `shared/modelLoopGuard.js`（`MAX_MODEL_ROUNDS_PER_REQUEST=3`，超限 `MODEL_ROUND_LIMIT_EXCEEDED`）；截断不再抬预算，同请求补跑一轮。保留的数值只有防超长（输入字符比对 `contextRunBudget`）与防跑飞（`maxModelSteps`、`timeoutMs`），均非输出预算。
3. **错误可见性（无论换不换模型都该做）**：`server/routes/chat.js:500` 按 `finishReason` 与 `usage` 分档报错，例如 `UPSTREAM_REASONING_ONLY`（length + 正文空 + 输出 token 已耗尽）与 `UPSTREAM_EMPTY_CONTENT`（stop + 正文空）分开，`details` 带上 `finishReason/usage/maxTokens`。仓库里已有先例可抄：`server/services/textModelAgentProvider.js:24-41` 就区分了 `truncated / refused / hasReasoning` 三类。
4. **思考开关透传**：`modelFunnel.ts:212-218` 用 `THINKING_BUDGETS[thinking]` 控制预算，当前内核 `cfg.thinking='off'` 时**不下发任何思考参数**，端点按自己的默认走（仍会思考）。若要真正关闭，需要按 provider 下发显式参数（例如 `samplingParams` 逃生舱，`modelFunnel.ts:220` 已有该通道）。这条要按端点逐个验证，不能笼统改。

## 四、附带发现（记账，未定性为 bug）

- **B10 记忆压缩只证明了启发式**：`src/services/api.js:601-614` 是 `llmMemory || heuristic` 的静默兜底，且 `needsLlmMemoryCompaction`（`src/services/memory/memoryCompaction.js:15-34`）对"作者偏好：…"这类带前缀且 ≤72 字的夹具直接判否。所以那行「通过」不代表 LLM 分支可用，需要用能触发 LLM 的夹具重测（夹具要求：无前缀且 source >5 字，或 heuristic 被截断带 `...`，或 general/dialogue 类 >180 字）。**【20261009 复测闭案】**：夹具改 general 类 200 字（无前缀）→ LLM 分支真跑（14s 真实调用，LLM 摘要≠启发式截断，见第五节 B10 行）；另勘误：`hasFactPrefix` 正则集合不含「作者偏好：」，原夹具判否的实际机制是 `compactMemoryText` 提取的「偏好：」前缀。
- **批 A 的 A7/A11 归因要更正**：先前记为「上游 403」，但那条 403 的 journal 时间是 19:43，批 A 跑在 21:24–21:36，且正文链路根本不写 journal——**证据不成立**。最可能是同一个思考烧预算问题，复测方法见本文件第五节的复放工装。**【20261009 复测闭案】**：A7/A11 均已通过（A7 检索词规划 plannedBy=ai 出 3 检索词、A11 出 222 字画面描述）——预算裁定（内核 4096 兜底）后自然恢复，无需额外动作。
- **世界书检索规划（`src/services/worldbook/worldbookResearch.js`）在 src 内除测试外无生产调用方**：目前没有 UI 入口，回归通过与否只影响未来接入。
- **地理面板未覆盖**：`WorldMapPanel.vue:660`、`GeographyPanel.vue:388` 的生成入口在 `.vue` 里，Node 工装加载不到，需要 Playwright UI 级覆盖。
- **生图/生视频真上游本轮未打**：`server/routes/image.js:33` 依赖服务器 `MINIMAX_API_KEY`，缺配置返回 400 `ERR_SERVER_KEY_MISSING`。工装里 B11 默认跳过，需显式 `REGRESS_MEDIA=1` 才花钱。

## 五、合并回归矩阵（批 A + 批 B，功能级）

| 面 | 行 | 功能 | 链路 | 结论 |
|---|---|---|---|---|
| 文本 | A0 | `sendChat` 基线 | `/api/generate` | ✅（人格拒答另计） |
| 文本 | A1 | 正文续写 | `/api/advisor/task` | ✅ |
| 文本 | A2 | AI 讨论·知识问答 | `/api/advisor/task` | ✅ |
| 文本 | A3 | 世界书导入·原文提炼 | `/api/generate` | ✅（首轮工装断言读错字段，已修） |
| 文本 | A4/A5/A6 | 世界书基调/审计/精修 | `/api/generate`、任务面 | ✅ |
| 文本 | A7 | 世界书检索规划 | `/api/generate` | ❓ 真因待复测（见第四节） |
| 文本 | A8/A9 | 画布主题卡/卡片延伸 | `/api/generate` | ✅ |
| 文本 | A10 | 上下文压缩 LLM 摘要 | `/api/generate` | ✅ `method=llm` |
| 文本 | A11 | 插画画面描述整理 | `/api/generate` | ❓ 真因待复测 |
| 文本 | A12 | 专业编导信息 JSON | 任务面 | ✅ |
| 体验 | B1 | agent-step 工具流 | `/api/generate/agent-step/stream` | ❌ 工装用 content-only → **命中问题一**；双写形态 ✅ |
| 体验 | B2 | 叙事 shadow 质检 | 同上 | ❌ 问题一 + 预算 500/超时 12s |
| 体验 | B3 | 对白选项 | `/api/generate` | ❌→✅ 预算（900 空 / 2400 通） |
| 体验 | B4 | 涌现事件具体化 | `/api/generate` | ❌→✅ 预算（1000 空 / 4000 全闸通） |
| 体验 | B5/B6 | 冒险触发正文/分镜 | `/api/generate` | ✅ / ❌ 预算（3000 仍空） |
| 漫画 | B7 | 单页脚本 | `/api/generate` | ✅ 4 格（2 次尝试） |
| 漫画 | B8 | 分页方案 | `/api/chat/stream` | ❌ 流式思考期无正文 |
| 结构化 | B9 | 世界起源草案 | `/api/generate/structured` | ✅ 内核 journal `capabilityResult` 有原文 |
| 记忆 | B10 | 压缩 | `/api/generate` | ❌→✅ 夹具改 general 类 200 字（无前缀）触发 LLM 分支（LLM 摘要≠启发式截断，14s 真实调用；原夹具为 preference 类，设计上跳过 LLM） |
| 媒体 | B11 | 生图真上游 | `/api/media/images` | ⏸ 未开 `REGRESS_MEDIA` |
| UI | — | 地理面板 | — | ⬜ 未覆盖 |

## 六、待裁定

| 编号 | 事项 | 选项 |
|---|---|---|
| R1 | 问题一修复形态 | **已裁定并实施（2026-10-09，随 f4dbbb6 入干）**：三件全做——网关兜底 + 契约单源化 + `NARRATIVE_AGENT_EMPTY_PROMPT` 硬错误护栏；确定性脚本 `scripts/agent-step-message-shape-check.mjs` 18/18，真链路三格矩阵通过 |
| R2 | JSON 任务预算是否抬 | **终态裁定（2026-10-09，用户指令「裁定完全废弃，暂不加预算，只加一个最大循环次数」）**：2026-10-08 的「未声明交内核缺省 4096」是过渡态，现废弃面铺满——Pinax 服务端/`shared/`/浏览器三侧的 `max_tokens`/`maxTokens` 声明全数摘除（含 `narrativeAgentOrchestrator` 的 1600 参数阶梯、桥的 run/resume、世界书与地图/漫画/图片等 12 处调用点），一律交内核缺省；跑飞兜底改为请求级轮数闸 `shared/modelLoopGuard.js`（3 轮，超限 `MODEL_ROUND_LIMIT_EXCEEDED`），截断不再靠抬预算修复而是同请求补跑一轮。thinking 计量正式设计仍另立工单 |
| R3 | 是否换内核模型 | 需要模型行与密钥；换哪些任务面用哪个模型 |
| R4 | 错误可见性分层 | 是否把 `finishReason/usage` 透出到前端错误 |
| R5 | 空提示词护栏落在哪一侧 | Pinax 组装后自检 / kit `validateCompleteRequest` 拒绝（后者更根本但要改 kit 仓） |
| R6 | B10 与 A7/A11 复测 | **已复测（20261009）**：A7/A11 在预算裁定（内核 4096 兜底）后自然恢复通过；B10 需夹具改 general>180 触发 LLM 分支（已验，LLM 摘要≠启发式） |
| R7 | 生图 / 生视频真上游 | 是否开 `REGRESS_MEDIA=1`；生视频默认不打 |
| R8 | 地理面板 UI 级覆盖 | 是否补 Playwright 一行 |

## 七、复现工装（仓库外，不入库）

`C:\Users\Administrator\AppData\Local\pinax-probe\`：

- 矩阵：`feature-regression-matrix.mjs`（批 A 13 行）、`feature-regression-matrix-b.mjs`（批 B 12 行），跑法 `node --import ./regress-register.mjs <矩阵>.mjs`；结果 `feature-regression-matrix{,-b}.result.json`、日志 `regress-a-run1.log` / `regress-b-run1.log`。
- 归因：`regress-b-attrib.mjs`（原始预算复放，读 `finishReason/usage`）、`regress-b-attrib2.mjs`（抬预算复放 + 功能自带解析器验收）、`regress-b-attrib3.mjs`（涌现事件逐校验闸）、`regress-b1-replay.mjs`（content-only 瞎答取证）、`regress-b1-parts.mjs`（三格矩阵取证）。
- 支撑件：`regress-register.mjs` / `regress-hooks.mjs` / `regress-axios-shim.mjs`（让仓库真实服务模块在 Node 里原样可跑）。
- 内核当前模型取证：`curl --noproxy "*" http://127.0.0.1:8451/model`；任务面流水：`D:/storyflow-kit/storyharness/tasks/task-*.jsonl`。

## 八、编排者复核（2026-10-08，双子代理并行 + 亲验核心两点）

**结论：两个问题全部成立，准予入库；以下为复核增量与勘误。**

1. **问题一证据链 8/8 核实**（kitModelGateway 组装/契约三处/两处 content-only 受害者/orchestrator 双写/透传链/入口挂载，行号零漂移或 ±1）。编排者另亲验一条文档未写的补强：网关组装后的滤网 `role !== 'assistant' || content || toolCalls` **只滤 assistant 空消息，user/system 的空提示词直达内核**。
2. **受影响面 +1**：`runNarrativeAgentTurn` 全仓普查发现**第 4 处 content-only 调用方**——`src/services/agents/narrativeTaskQuality.js:30-47` `buildTaskQualityMessages`（经 orchestrator `verifyTask` 的 review 阶段 → decisionRunner），同样拿空提示词；revision 阶段（transcriptToGenerationMessages 双写）幸免。修复方案 1（网关兜底）天然覆盖此处置。
3. **问题二机制链 9/10 核实**，勘误两条：
   - 路径补全：涌现事件与分镜的预算声明在 `src/services/experience/` 子目录，分页方案在 `src/services/media/`（正文表格已就地更正）。
   - **B10 判定链更正**：`hasFactPrefix` 的正则集合是 `对话|地点|物品|决策|剧情|偏好|约束|风格|角色`——**「作者偏好：」不在集合内**；实际判否依赖的是 `compactMemoryText` 对 author-preference 类型提取出的**「偏好：」**前缀（≤72 字判否）。按原文档字面（拿「作者偏好：」去对正则）会得出相反判定，结论凑巧不变但机制表述以本条为准。
   - 补强一条：流式链结束时**不校验空正文**——kit 侧 `finishReason:'empty'`（modelFunnel.ts:259）被忽略、静默 `[DONE]`，与 B8「思考期零帧」同根。
4. **R1–R8 编排者建议**：R1 三件全做（网关兜底最小向后兼容 / 契约单源化防复发 / 空提示词硬错误护栏，护栏先落 Pinax 侧自检、kit validateCompleteRequest 随 kit 仓批次）；R2 按实测值立即抬（对白 2400、涌现 4000、分镜 4000+），换模型后重估；R3 需要你给模型行与密钥，作为质量问题根治另议；R4 做（照 textModelAgentProvider 四档先例）；R5 两边都落（Pinax 自检先行）；R6 做（工装现成）；R7 维持显式开关默认关；R8 随下次 UI 冒烟顺带。

## 九、修复落地与验证（2026-10-09）

**R1 三层 + R4 分档已全部实施并验证**（kit 侧 validateCompleteRequest 护栏按裁定延后，随 kit 仓批次）：

- 网关兜底 / 契约单源化 / 空提示词护栏（`NARRATIVE_AGENT_EMPTY_PROMPT`，retryable:false，护栏证实保护直调 runner 的调用方与未来映射层回归）——`server/services/kitModelGateway.js` + `shared/generationToolContract.js` + `scripts/agent-step-message-shape-check.mjs`（确定性 18/18：content-only 合成+转发体非空 / parts-only 仍 400 / 双写保留 / tool 轮兜底 / 护栏转发前触发）。
- R4 分档实测：`max_tokens:60` + 长指令 → 502 `UPSTREAM_REASONING_ONLY`（details 带 finishReason:length + usage 160/60/220，output 恰为推理烧光）；`UPSTREAM_EMPTY_CONTENT` 代码路径在位（自然构造不可得，未实测）。
- 真链路三格矩阵（3001 全链 SSE）：content-only ✓ 200 出 342 字相关正文（首词命中）；parts-only ✓ 400 契约拒绝（修复二合成只对 content 非空生效，纯 parts 仍拒）；双写 ✓ 200（工装 SSE 解析器丢帧为工装 bug，确定性脚本覆盖）。
- 预算裁定回归实测（内核 4096 兜底）：对白选项 ✓（2112 token，parseDialogueOptions=3）、分镜 ✓（3262 token，6 shots——原 1400/3000 全空，显著改善）、涌现事件出正文 1072 字符但 parseEmergenceEventDraft=null——**schema 合规缺口为遗留记账项**（placeId/choices≥2/changes 硬校验 vs 模型输出，非预算问题，建议提示词强化或带重试复放）。
- 修复后全量：vitest 20/20 文件 **200/200 用例全绿**（含 narrativeAssets 断言同步与此前两处存量红收口）、build 24.84s。

## 十、终态收口（2026-10-09 同日第二批：预算完全废弃 + 轮数闸 + 直连残口）

用户裁定「残留干掉，然后裁定完全废弃，暂不加预算，只加一个最大循环次数」，三件落地（**已实施，确定性门禁组合验证；真实模型链本批未复跑——现网 3001/8451 未重启，本批未获冒烟授权**）：

- **残留**：`server/routes/openclaw.js` 删除、`server/index.js` 撤挂载（该路由绕过 `modelRouting.js` 直调 provider，是 2026-10-08 直连退役后唯一残口）；`openclawService.js` 只留提示卡与 `buildOpenClawUserMessage`，两个引用已移除符号的死函数（网关令牌读取/解析）删除。全仓 `/api/openclaw` grep 零命中。
- **废弃铺满**：`narrativeAgentOrchestrator` 的 `maxTokens=1600` 参数与三处调用档（planning 900 / requestStep / quality review+revision）、桥 `run`/`resume` 及其 d.ts 与 `agentEngine`/`experienceAgentRoute` 转发、`api.js` 记忆压缩 120、图片描述 700、漫画分镜 2400、冒险触发 1200、世界书 research 500 / maintenance 2800–5000 三档 / importGeneration 3400+1800、WorldMap 与 Geography 各 4000 —— 全部不再声明 `max_tokens`，交内核缺省（漏斗 4096 / 任务面 1600；kit `server.ts` 仅在字段有定义时校验 200–8000，**故 kit 侧无需改动**）。桥双副本按 kit `pinax-side` 镜像同步，bridge-sync 2/2。
- **一个闸**：`shared/modelLoopGuard.js`（`MAX_MODEL_ROUNDS_PER_REQUEST = 3`）经 advisor（漏斗与 capability `taskMeta` 共享同一实例）与结构化生成降级环传递；advisor 的能力→漏斗回落里显式上抛 `MODEL_ROUND_LIMIT_EXCEEDED`，防 fail-open 吞掉上限。截断（`RESPONSE_INCOMPLETE`）改为同请求补跑一轮。
- **保留的数值不是预算**：`assertModelCallBudget` 单参化只比对输入字符（防超长）、`maxModelSteps`（模型步数）、各链 `timeoutMs`。
- **非生产残留（如实登记，未动）**：三个直连 tool adapter 的 `|| 1200`（仅 `runToolCallingProviderTurn` 可达，生产零调用方）、连通探测档 180/32/64（Anthropic/Responses 协议必填，不是生成预算）、`GENERATION_AGENT_LIMITS.maxTokens: 8192`（入参校验上限）、未挂载孤儿 `StoryAgentBetaPanel.vue` 的 `/tokens` 控件、`scripts/**` 离线工装。
- **行为变化**：客户端正文链由 1600/2000 → 内核缺省 4096（更宽）；任务面中性但 kit `prompt.ts` 的篇幅话术对 init 回合固定为「约 1600 tokens」；BeatPlan plan 阶段仍是 kit 自己的 900。
- **门禁**：编辑文件 `node --check` 全过；串行 vitest（本机内存约束）**20/20 文件、200/200 用例顶格不破**（并行时 `settingsAgentWorkflows` 一条 5s 超时属 LOG 已记存量环境性 flake，单跑 780ms）；`agentContracts.test.js` 预算断言按合并置换改写（补跑两轮 `max_tokens` 平值透传 / 未声明请求体 `undefined` / `createModelRoundGuard(1)` 抛 `MODEL_ROUND_LIMIT_EXCEEDED`）；`lint:delta` 0 新增 error（4 存量 warning）；`vite build` 29.13s、Authoring chunk 1,360.58 kB ≤ 1,450,000；`architecture:check` / `catalog-sync` 21/21 / `bridge-sync` 2/2 / `git diff --check` 全 exit 0。

