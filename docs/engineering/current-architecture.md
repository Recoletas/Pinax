# Pinax 当前架构与代码边界

> 这是“当前代码实际上怎样运行”的工程真源，不是愿景图。路由清单以
> `src/router/index.js` 为准，阶段状态以 `docs/STATUS.md` 为准，产品路线以
> `docs/PLAN.md` 为准。

## 1. 一句话结构

Pinax 目前是一个 **Vue 单页工作台 + 本地优先浏览器数据 + 可选 Express AI/媒体代理 + 可选 Electron/协作适配器**：

```text
Vue route/page
  → page components / composables（交互会话）
  → domain services（合同、投影、事务、生成编排）
  → repository / Pinia owner（持久数据或跨页状态）
  → localStorage / IndexedDB / Electron bridge

AI request
  → evidence/session freeze
  → generationService / narrative orchestrator
  → src/services/api.js
  → Express route
  → configured provider
  → validate/reconcile
  → editable Ghost
  → explicit author adoption
```

核心原则不是“AI 自动改稿”，而是：资料有明确来源、生成先进入临时会话、正式数据只在作者确认后由唯一 owner 写入。

## 2. 运行时入口

| 层 | 当前入口 | 职责 |
| --- | --- | --- |
| Web bootstrap | `src/main.js` | 安装 Pinia/router、加载全局样式、安装 workspace route adapter |
| App root | `src/App.vue` | 主题/视口、全局通知、桌面项目门禁、router-view |
| Shell | `src/layouts/AppShell.vue` | 一级导航、工作台标签、侧栏和页面容器；不拥有稿件数据 |
| Router | `src/router/index.js` | 唯一页面注册表；旧 URL 只做显式 redirect |
| Server | `server/index.js` | Express、静态站点、AI/媒体/API 路由、WebSocket |
| Desktop | `electron/` | Electron host、项目目录/SQLite/IPC 与旧数据迁移 |
| Shared contracts | `shared/` | 前后端共同使用的 schema、限制与验证；不得依赖 Vue/DOM |

当前主要页面：

- `/authoring`：唯一正式写作工作台。
- `/experience`：保留的互动体验兼容面，不是写作前置。
- `/settings/structured`、`/settings/world-map`、`/settings/worldbook/advanced`：绑定世界书的设定面。
- `/materials`：素材与媒体。
- `/prose-essay`、`/comics`：画布和漫画实验面。
- `/opening`、`/writing` 等旧入口：只重定向，不再各维护一套页面。

## 3. 数据所有权

| 数据 | 唯一写入边界 / owner | 当前持久化 | 说明 |
| --- | --- | --- | --- |
| 书稿、章节、writing units | `src/services/writing/writingBooksRepository.js`；编辑事务由 Notebook/Authoring 发起 | `localStorage.writing_books` | 页面不得另造第二份长期书稿 store |
| 世界书、条目、结构化设定 | `src/stores/worldStore.js` 的 durable mutation owner | `worldbook_*` + index keys | 项目模式必须由 bookId 解析绑定 worldbookId；本体/索引/active 指针失败时回滚 |
| 工作台标签 | `src/stores/workspaceTabsStore.js` + `workspaceRouteAdapter` | 安全导航快照 | URL 是导航真源；selection/scroll 只存内存 ledger |
| 当前场、推演、干预 | `src/services/agents/authoring/` 中的 session/projection/transaction | 正式现场有限持久化；Ghost/session 多为内存 | provider 前后都要核对 revision |
| 素材 | `src/services/media/narrativeAssets.js` | localStorage | AI 输出先是候选，不直接成为正文/世界事实 |
| 模型渠道配置与选中 | `src/services/textProviderConfigStore.js` / `src/services/media/{image,video}ProviderConfigStore.js` | `localStorage.text_model_configs` + `image_model_configs` / `video_model_configs` 及各自 `*_selected` | 文本、图片、视频三条链各自独立；选中键是唯一真源，设置页与生成面都读写它，页面不得另造回落 |
| 来源文档、媒体二进制 | `src/services/worldbook/worldbookSourceArchive.js` / `src/services/media/mediaAssetStore.js` | IndexedDB | 轻量 JSON 不含二进制；完整工作区 ZIP 会连同来源归档和已落盘媒体导出 |
| 体验运行时 | `src/stores/gameStore.js` | localStorage | 兼容能力；不能反向成为 Authoring 的稿件真源 |
| 地图 | `src/stores/geographyStore.js` + `src/services/world-map/` | localStorage / worldbook projection | 地图生成事实与作者确认的世界事实分开 |
| UI 主题与排版 | `themeStore` / `writingTypographyStore` | localStorage | 当前只有一套 Pinax 视觉，保留亮暗与缩放 |

浏览器写入必须通过现有 repository/store。`src/composables/useStorage.js` 是兼容底层，不应成为新业务模块直接设计 schema 的理由。桌面适配通过 `src/services/storage/` 和 Electron bridge 逐步接管，不能在页面里判断文件系统路径。

持久化结果的共享形状由 `src/services/storage/durableMutationResult.js` 提供：成功和失败都显式返回 `{ ok, reason, retryable }`，各域只附加自己的 payload。书稿、写作快照/恢复/块历史、素材、世界书与散文画布整包保存均使用该合同。世界书 legacy payload/异常 API 仅是 durable owner 上的兼容包装；散文画布的七类键由一个 repository 原子提交。

## 4. AI 与推演边界

生成链分成四层：

1. **证据层**：从当前书、章、单元、现场、世界书和显式参考建立有限 envelope/manifest。
2. **会话层**：冻结身份与 revision，保存本轮意图；取消、切书或资料变化可使其 stale。
3. **运行层**：`generationService.js` 负责普通/流式生成入口，`services/agents/` 负责工具调用和 transcript 编排，`api.js` 只做传输适配。
4. **采用层**：模型结果先成为可编辑 Ghost；正式稿件、现场、后果和记忆分别由自己的事务 owner 写入。

禁止的捷径：

- 页面直接拼整本世界书并发给 provider。
- 模型响应直接改正文、设定或历史。
- 用显示文本、数组序号或当前 active store 猜项目/人物/走法身份。
- 在 UI component 内再实现一套 API retry、storage schema 或 revision 规则。

## 5. 目录放置规则

| 新代码是什么 | 放置位置 |
| --- | --- |
| 路由级编排 | `src/pages/`；页面只组合，不新增大段纯算法 |
| 多页面共用 UI | `src/components/<domain>/` |
| 单页复杂交互状态 | `src/composables/`，名称以 `use...` 开头 |
| 可纯测的业务合同/投影/事务 | `src/services/<domain>/` |
| 跨前后端 schema/limits | `shared/` |
| 跨页持久状态 | 已有 Pinia store 或 repository；新增前先证明没有 owner |
| Provider 密钥、代理、媒体处理 | `server/`，不得进入前端构建变量 |
| 一次性迁移兼容 | `src/services/migration/`，写清删除条件 |
| 浏览器旅程/故障矩阵 | `scripts/`；不反向成为生产依赖 |

不要继续往 `src/services/` 根目录增加无归属文件。若改动一个现有根文件，优先确认它属于 writing、worldbook、media、agents、workspace、storage 或 migration 中哪一域；移动必须单独成片并保持 import-only diff。

## 6. 当前结构健康度

静态生产 import 图（2026-09-16）没有发现循环依赖。结构预算由 `scripts/architecture/structure-budget-check.mjs` 在 CI 中强制执行：

| 热点 | 当前规模 | 判断 |
| --- | ---: | --- |
| `Authoring.vue` | 10,832 行 / 111 imports | 历史恢复、插画 host、知识 reader 和共同排演 controller 已迁出；页面保留编辑器 DOM 与路由级装配 |
| `Notes.vue` | 1,530 行 / 18 imports | 编辑工作区是真实组件边界；插画 workspace 统一现有交互 owner 的清理与生命周期 |
| `Experience.vue` | 3,547 行 / 21 imports | auto advance、Codex、session、quick capture 会话均有独立 owner |
| `ProseEssay.vue` | 2,785 行 / 18 imports | pointer/edge 会话与导演导出交接分别由 composable 管理 |
| `gameStore.js` | 1,636 行 / 29 imports | 涌现、冒险触发、分支事务、观察器和机制投影下沉到 experience coordinator/workflow |
| `src/services/` 根层 | 14 个 JS 文件 | memory/writing/worldbook/media/canvas/experience 已归域；旧根路径零引用 |

本轮已经删除生产图完全不可达的旧 Writing wrapper、旧 Settings modal、旧 SidePanel、Kao/folio 残壳、旧 Authoring reference picker 和无人消费的体验素材 summarizer。仍只被测试引用的旧纯合同不在本轮硬删：它们需要先判断是迁移合同、未来能力还是废弃测试，不能用“没有页面 import”一刀切。

## 7. 后续重构顺序

### A. Authoring 按 owner 拆编排，不拆视觉（最高优先）

每次只抽一个边界，页面模板与用户行为保持不变：

1. ✅ `useAuthoringWorkspaceNavigation`：书/章/标签/设定出程与 selection/scroll 回程已在 2026-09-14 抽为唯一 owner；页面只注入书稿 refs、选择动作和滚动适配器。
2. ✅ `useAuthoringPersistence`：正文/标题 autosave、beforeunload/pagehide/visibilitychange、路由离场门禁、恢复副本 timer、保存反馈和失败自救已在 2026-09-14 收为唯一 owner；正式章节/探索文档事务仍由既有 repository 边界执行。
3. ✅ `useAuthoringInspectorState`：工具 rail 选择、检查器开关/固定、基础/详情页、双栏嵌套返回栈与焦点快照已在 2026-09-14 收为唯一状态 owner；页面仍作为编辑器 DOM/source 恢复适配器。
4. ✅ `useAuthoringSceneWorkflow`：当前场的可取消草稿、基线/dirty、人物地点搜索与候选、失效引用、作用域失效、scene-anchor 保存/回滚/撤销/恢复继承已收口；页面构造初始草稿并注入章节持久化适配器。
5. ✅ `useAuthoringRehearsalWorkflow`：普通推演的确定起点、正文试稿生成、作用域复核与稳定路线归属已从页面收口；既有 `useAuthoringRehearsal` 继续单独拥有路线状态机，页面只提供现场与 Ghost 适配器。
6. ✅ `useAuthoringInterventionState`：干预 session、证据/候选投影、审核计数、Ghost 批次资格、双栏归属和重置不变量已归为单一状态 owner。
7. ✅ `useAuthoringInterventionWorkflow`：prepare/rehearse/retry、资料变化 reconcile、取消令牌与迟到响应门禁已成为同一个生命周期 owner；页面只注入 session runner、Ghost 定位和关闭适配器。
8. ✅ `useAuthoringCharacterIfWorkflow`：A/B 行动规划、模型配置快照、独立分支草稿、切支/重试、依赖复核与 stale 全部归为一个会话 owner；不再借用普通场景实验室的请求版本。
9. ✅ `useAuthoringSceneLaboratoryWorkflow`：现场压力投影、prepare/retry/select/confirm、请求取消和正文 Ghost 交接已经整体迁出页面。
10. ✅ `useAuthoringBlockWorkflow`：composer/preview/draft/failure、请求世代、打开/关闭/恢复、turn 合同与执行、observer 失败隔离、留作构思和 adoption 互斥已成为单一 owner；页面仅提供当前书稿、世界书同步、Task runtime、编辑器焦点和通知适配器。
11. ✅ `useAuthoringGhostAdoptionWorkflow`：单组 Ghost 从 stale 与依赖复核、保护点、编辑器写入、scene/outline delta、失败回滚、保存重试回执，到 observer、Character IF 消费、撤销和采用回响，已成为一个原子协调器；页面只提供 editor/repository 适配。
12. ✅ `useAuthoringReviewWorkflow`：校对来源冻结、分批模型调用、取消/进度、live source reconcile、单项/批量采用、保护点、忽略和撤销已归入同一会话 owner。
13. ✅ `useAuthoringSearchWorkflow`：搜索来源冻结、四域检索、跨章定位/返回、replace plan、批量保护与全书原子持久化已成为一个会话 owner；页面只适配编辑器选择、保护快照与提交后刷新。
14. ✅ `useInlineWritingAgentHost` + `useAuthoringReferenceSource`：停驻触发、请求身份、IME/光标路由、取消/迟到响应、参考 scope、候选失效与采用接缝已迁出；页面只转发编辑器语义事件并提供事务 hooks。
15. ✅ `useAuthoringRewriteWorkflow` + `useAuthoringAnnotationSession`：改写请求代次/取消/候选/失效/采用状态，以及批注草稿、根项投影、创建/编辑/删除和作用域重置均已有唯一 owner。页面只注入批注集合、选区、滚动和正文提交适配；切章会同步清除旧 composer 上下文。
16. ✅ `useAuthoringAnnotationSelection` + `useAuthoringAnnotationLayout`：选区冻结、跨节点 range/selector、writing node descriptor 进入无状态 selection adapter；边注 lane 测量、ResizeObserver、窗口 resize、滚动恢复和卸载清理由 DOM layout owner 负责。切书、切章、进入/离开构思统一走 `resetAnnotationWorkspaceScope`，不会跨文档保留 composer 或改写候选；ProseMirror 实例和长期 annotations 仍只由页面/repository 提供。
17. ✅ durable mutation result：书稿、历史、素材、世界书与散文画布已有可判定结果。世界书本体先写而索引失败时恢复本体、索引、active 快照；旧 API 只做兼容解包，不再形成第二条写路径。
18. ✅ `useAuthoringBookActivation`：首载 query、旧章保存/boundary、换书作用域清理、世界书同步和首章选择成为一个事务 owner；章节内容 hydration 仍由编辑器 adapter 负责。
19. ✅ inspector open ordering：深链接、双栏、现场、推演、批注、设定和共同排演统一经 `openInspectorTool`；离开双栏先 `prepareClose`，离开现场草稿先 discard，不再由各 open helper 自行排列关闭语句。
20. ✅ 历史与恢复：`AuthoringHistoryPanel` 持有完整可见交互，`useAuthoringHistoryWorkflow` 持有加载、快照、恢复计划、偏好与状态；autosave/recovery timer 仍只属于 persistence owner。
21. ✅ 插画、知识与共同排演：`useAuthoringIllustrator` 持有冻结来源、生成回执、素材/正文采用和焦点恢复；`authoringKnowledgeReaderHost` 纯组装 reader/facade；`useAuthoringCollaborationWorkflow` 持有 feature gate、订阅、房间动作、迟到回执与 dispose。
每片要求：减少页面自有状态/过渡逻辑与总行数，不以新增一个显式 composable import 伪装成退步；不得新增第二套 reactive snapshot；既有浏览器 Gate 保持同等行为覆盖。

### B. 根层 services 归域（完成并受预算约束）

memory、writing、worldbook、media、canvas 与 Experience 服务已完成纯路径归域，根层 JS 从计划基线 42 个降至 14 个；生产相对 import 图保持 0 cycle，production 对 experimental 保持 0 边。生命周期清单见 `src/services/README.md`。

### C. 兼容/试验合同设退出条件（v1 完成）

目录和清单已经区分 `production / migration / experimental / compatibility / retire`。旧 playable intent 进入 migration，旧 prompt builder 与未接线 memory receipt 进入 experimental；零消费者 `markdownWrap` 已删除。正式代码不得 import experimental。

### D. Experience 与 gameStore 隔离（turn owner 完成）

停止向 `/experience` 增加 Authoring 功能。会话规范化/调度、history/runtime projection、branch graph、observer、journal、状态解析以及完整 turn coordinator 均位于 `src/services/experience/`；store 只保留状态与应用 action。是否保留、插件化或退役 Experience 是产品决策，不再是核心架构阻塞项；真实存档迁移与用户验收前不删兼容数据。

## 8. 变更检查表

- 我改的是 UI 状态、业务事实，还是持久数据？owner 是否唯一？
- 页面是否只调用 service/composable，而没有新建 schema/retry/revision 规则？
- 模型输出是否仍先成为候选，且采用前重新核对来源？
- 新 service 是否进入正确 domain，而不是继续堆到根目录？
- 兼容代码是否写明入口、数据范围和删除条件？
- 是否跑了与改动对应的 focused Gate，最后再跑 `npm run verify:full`？

## StoryAgent 接入（2026-10-05；2026-10-06 P2 起运行时迁入 storyflow-kit）

正式入口是既有助手的“写作与修改”，全屏/侧栏复用 per-book composable 和 `authoring_assistant_conversation:` 真源。`authoringIntegration` 同步冻结当前作品的正文/已绑定世界书/构思/大纲快照；bridge 经 `/api/storyagent` 转到 loopback。任务 ID 的浏览器 capability 命名空间不与作品 ID 混用。作者采用由 Authoring 保存保护版本、durable 写回后发布，并通知既有现场观察，agent 运行时没有直接写权限。

体验开关只路由没有严格任务合同的回合；严格任务继续由原生 loop 的发布前验收处理。资料查阅、审稿、轻量推演仍保留各自 owner。快照查询不等于资料原件/RAG 接入。

**运行时归属（P2 口径统一）**：pi-agent 任务面（agent 循环、工具环、BeatPlan、任务存储、SSE 服务面、provider 绑定经 kit `llm.ts` 注册表）canonical 在 `storyflow-kit/storyharness/src/pinax/`，由 `npm run serve:pinax` 承载于 loopback 8451；Pinax 侧 `adapters/pinax-adapter` 已退役为 stub（其 `.external` 配置仍是凭据源，经 env 传给 kit 进程）。`server/services/storyAgentRuntime.js` 探测/拉起该服务面，不可达时 agent 路由回落原生链。契约与工具清单的 canonical 在 kit `contracts/`（capability-manifest@1、beat-plan@1）；桥双副本纪律见 `scripts/check-bridge-sync.mjs`（Pinax 浏览器桥 ⇄ kit pinax-side）。浏览器原生工具环仍在 Pinax（浏览器域），由契约等价测试对齐。

**循环归属试点范围（W1-1，2026-10-08）**：**单发结构化生成**（世界书字段生成）的回合循环已切至 kit 任务面 capability 路径——`structuredGenerationRunner.js` 在 kernel 路由下注入 `createKitStructuredCapabilityFetchImpl()`，请求折成 `taskKind=capability` 任务（Schema 进强制提交工具，回执即终态），任务不可达/失败时同请求回落 kit 漏斗（`/v1/pinax/complete`，双层 fail-open）。**助手对话（`chat.js`）与 agent-step（`generationAgent.js`）仍走 Pinax 侧循环**，kit 漏斗在其链路中只承担传输。**「同仓两种循环归属」是过渡期的合法中间态，不是全切完成**；试点出口与 ①②b 的切换另行裁定。

**文本直连退役（2026-10-08，用户裁定）**：文本链不再有直连通路——`server/services/modelRouting.js` 只有 `kernel`（探测 kit `/model`）/`none` 两态，`none` 统一报「未检测到可用模型」；讨论/审校/设定/agent-step/正文生成与结构化生成四条生产链无条件经 kit 任务面（`generationAgent.js` 的多回合循环仍归 Pinax）。用户在设置页选中的模型即全局模型：「选中即热切内核」（`ApiSettingsPanel` → `POST /api/storyagent/model` → kit `/model`；公网部署 403）；用户 key 仅剩设置页探测（`/models`、`/test`）用途，浏览器不接触内容生成密钥。**协议轴（2026-10-08）**：内核按 `api` 选传输——`openai-completions`（缺省）或 `anthropic-messages`（pi-ai 自带传输，鉴权走 `x-api-key`、系统提示在顶层 `params.system`）。设置页选中 Anthropic 预设（baseUrl 不带 `/v1`）或 baseUrl 命中 `/anthropic`、`api.anthropic.com` 时热切带 `api:'anthropic-messages'`；该线不消费 `options.samplingParams`，故 `response_format` 被忽略，结构化靠折进 user 轮的显式 Schema 指令兜底。media 链（image/video）不受影响，仍用服务器 `MINIMAX_API_KEY`。

**输出预算完全废弃（2026-10-09，用户裁定「暂不加预算，只加一个最大循环次数」）**：Pinax 侧不再声明任何单次调用的输出 token 预算——服务端/共享层/浏览器链的 `max_tokens`（含 `maxTokens`）声明全部摘除，请求体不带该字段即交内核缺省（kit `modelFunnel.ts` 缺省 4096；任务面 `runner.ts` 缺省 1600；`server.ts` 只在字段有定义时校验 200–8000）。保留的数值不是预算而是**防超长与防跑飞**两类：上下文窗校验 `assertModelCallBudget` 只按已记录真实用量比对输入字符（`contextRunBudget`）、`NARRATIVE_AGENT_RUNTIME_LIMITS.maxModelSteps` 与结构化 `budget.maxModelSteps`（模型步数）、各链 `timeoutMs`。**跑飞兜底为请求级模型轮数闸**：`shared/modelLoopGuard.js` 的 `MAX_MODEL_ROUNDS_PER_REQUEST = 3`，以 `roundGuard` 随 advisor（`taskMeta` 与漏斗共享同一实例）与结构化生成/能力任务传递，超限抛 `MODEL_ROUND_LIMIT_EXCEEDED`（`retryable:false`，且 advisor 的能力→漏斗回落必须原样上抛、不得被 fail-open 吞掉）。截断（`RESPONSE_INCOMPLETE`）不再靠抬预算修复，改为同请求补跑一轮、失控由轮数闸兜底。例外保留：连接探测（180/32/64 token）与 Anthropic/Responses 协议必填字段的探测声明不是生成预算；`GENERATION_AGENT_LIMITS.maxTokens: 8192` 是入参校验上限不是声明值。

**OpenClaw 僵尸直连摘除（2026-10-09）**：`server/routes/openclaw.js` 删除、`server/index.js` 撤挂载（该路由绕过 `modelRouting.js` 直调 provider，是直连退役后唯一残口），`openclawService.js` 只保留提示卡与 `buildOpenClawUserMessage`，其读取网关令牌的两个死函数（引用已移除的 `join/homedir/existsSync/readFileSync` 与 `OPENCLAW_GATEWAY_TOKEN`）一并删除。全仓 `/api/openclaw` 引用 grep 零命中。

## 运行时监督拓扑（2026-10-08 实测定档）

全栈三个 loopback 服务面的监督责任按「谁知道这个能力要不要」分层：

- **8451（kit 任务面：pi-agent / BeatPlan / 能力任务）归 Pinax 宿主监督**。`server/services/storyAgentRuntime.js` 负责探测与拉起：`:13` `/healthz` 探针；`:23` 总开关（`PINAX_STORYAGENT_ENABLED=0` 直接返回 null）；`:33` 已在跑则短路；`:44` 未跑则 spawn（node + tsx 起 `pinax/serve.ts`）并轮询等健康（`:54`）；`:64` 拉起点写日志，`:66` 返回句柄供关停。不可达时 agent 路由回落原生链——宿主才知道自己要不要 agent 能力，这个 fail-open 依赖的正是这份探测结果。
- **8421（core 内核 HTTP 面）与 8431（kit 协议面）归 kit 守护监督**。守护件在 `storyflow-kit/scripts/ops/`（`kit-guard.bat` + `kit-guard.vbs`，经 Windows 计划任务 `kit-guard` 每 5 分钟 HTTP 健康巡检）。**该守护当前失效**，登记见 [known-issues](../src/known-issues.md)；修复前 8421/8431 无人拉起，需要时手工启动。
- **`kit/storyharness/src/web.ts` 是 kit 开发态一键起**（`:41-42` 声明式 `RuntimeSpec`；`:49` 读 `<ws>/.storyharness.json`；`:60-61` 未声明时回落 v4 缺省内核命令）。两仓均不存在 `.storyharness.json`（2026-10-08 实测），故该路径当前全走缺省；它不参与 Pinax 生产链路的监督。

一个反证性现场证据：2026-10-08 实测时 8451 是全栈唯一活着的服务面，而它恰好是唯一由宿主自己 spawn 并轮询健康的那个。

## 8451 任务落盘与日志维度（W1-4）

8451 的日志维度是**任务，不是会话**；`bookId` 是快照里的过滤字段，不是目录分区键。落盘位置 `<tasksDir>/task-<taskId>.jsonl`（`storyflow-kit/storyharness/src/pinax/store.ts:41-48` 与文件名解析 `:77`）；`bookId` 定义在 `:24`，仅在 `list(limit, {bookId})` 过滤时使用（`:74-82`）。

帧结构（`src/pinax/server.ts`）：首帧由提交路径落盘（`:118`），携带 `status: "running"` 与全零 `usage`（`:242-245`）；终态帧由 `settled` 落盘（`:132-135`），即 `{...final, taskId, bookId, createdAt}`。**`usage.{inputTokens,outputTokens,totalTokens}` 在每帧顶层，但只有终态行（如 `completed`）的值才真实**——首帧为占位全零。样例：`tasks/task-pa_e63a7cf2a7558e1ad04d9d3f_final1.jsonl` 末帧 `completed`，usage 1899/114/2013，steps 2、toolCalls 1。

不引入 kit 的 `sessions.ts` 会话维度（`src/sessions.ts:2` 自述位置依赖 `projectDir` + `CorpusLayout`）：8451 任务面的全部路径从 `pkgRoot()` 解析、不读工作区环境变量（`src/pinax/config.ts:68-74`），引入会话维度等于把 `STORYHARNESS_WORKSPACE` 环境变量坑（kit `AGENTS.md:61`：本机该变量指向 storymasterv4，漏 set 会静默落到 v4）引进 Pinax 链路。当前不引进是更安全的选择。
