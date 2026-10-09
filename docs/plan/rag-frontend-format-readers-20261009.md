# RAG 前端化 + 格式阅读展示：任务排期（2026-10-09 · v2）

> **用户指令（2026-10-09 原文）**：「关于前端，我有一个明确的要求是，RAG 置于前端，替代已有的世界书，这个事儿需要提上日程，然后尽快兼容，大纲，以及剧本等格式在 pinax 上阅读展示，基于这个，给我一个任务排期，背景写详细一点。」
>
> **口径纠偏（同日第二指令，原文）**：「这里面很多东西可以在 kit 里找答案，特别是 rag，以及剧本，不用二次开发」——v2 据此后：W1-A 从「前端重实现检索」改为「接 kit 现成检索面」；剧本格式从「自创 md 轻约定」改为「跟随 kit 短剧流产物格式」；背景补 kit 现成能力清单。
>
> 本文是排期与背景账：结论速览（§0）、背景与现状审计（§1）、口径与非目标（§2）、排期（§3）、约束与风险（§4）、待裁定（§5）、进一步改造方向（§6，展望账非承诺）。Pinax 侧证据为 2026-10-09 对 main（HEAD `9a3e257`）的实测；kit 侧证据为同日对 `D:\storyflow-kit\` 的实测。相对路径中 `kit/` = `D:\storyflow-kit\`（兄弟仓，非 vendored），其余 = 本仓。
>
> 状态：**排期文档 v2 已落盘，未开工、未提交**；等待用户对 §5 的裁定与逐波点头。

---

## 0. 结论速览

两条线、六个波次，按「快赢先行、主体居中、退役收口」排：

| 波次 | 线 | 内容 | 规模 | 依赖 |
|---|---|---|---|---|
| **W1**（并行） | B | 文档阅读器 v1：大纲 + 剧本在 Pinax 内可读（只读；**剧本按 kit 格式渲染**） | M | 无 |
| **W1**（并行） | A | RAG 接线：Pinax 接 kit `worldbook_search` + `kb_search/kb_read`（同源代理 + 检索面板） | M | kit 8431/8421 可达（前置件见 §3.2） |
| **W2** | A | 知识控制台 v1：统一「知识」面（检索/图谱/条目三视图；**对齐 kit「知识」页两栏形态**） | L | W1-A |
| **W3**（并行） | A | 多维表格视图（横纵归并，单元格编辑回写） | M | W2；场景待裁 |
| **W3**（并行） | B | 格式注册表 + 第二格式组（分镜脚本 JSON 只读等） | M | W1-B |
| **W4** | A | 旧世界书 UI 退役与迁移（设定页归并、tab 收编、词表切换） | M | W2/W3 用户验收 |

**四个关键事实**（决定排期形状）：

1. **RAG 检索的五脏俱全在 kit，不在 Pinax**。检索打分 + 一跳关系扩展的唯一实现是 kit 内核动词 `worldbook_search`（`kit/core/src/kernel-view.ts:235-295`），已从 CLI/HTTP/MCP 三面同源暴露；面向面板的现成接入面是 8431 协议面的 `POST /api/kernel-verb` 白名单代理（`kit/storyharness/src/serve.ts:354-380`，白名单含 `worldbook_search/kb_search/kb_read` :369），且自带 `location` 参数——自定义文件夹经 junction 挂进 kit `projects/`、内核零改动（:358-368）。**Pinax 全仓对 8421/8431 零引用**（`docs/plan/kit-microservice-forms-20261008.md:19` 实测）。所谓「RAG 置于前端」的施工 = Pinax 服务端加同源代理接这条现成面（浏览器经隧道访问，无法直连 loopback，必须走服务端代理），**不是**在前端重写检索。
2. **「世界书 → 知识」的产品形态，kit 官方 panel 已有定案**：世界书与 RAG 合并为「知识」一页，内部两栏——本书设定（世界书）/ 写作方法论（knowledge 语料）（`kit/docs/设计-官方panel-demo形态-20261002.md:23`）；演示脚本即「切『世界书』搜『豹子头』→ 词条卡 + 一跳关系 | GraphHyperRAG」（:14）。Pinax 的「替代」直接对齐这个 IA。
3. **「世界书」UI 入口严重分散**：6 条路由 + 顶栏 4 个页签 + `WorldBookEditor` 7 个 tab + 旧设定页，是本轮「替代」要收编的对象；「替代」不搬数据、不换存储，只换前端面与词汇。
4. **剧本格式 canonical 在 kit，Pinax 不需要发明任何约定**。短剧流 v1.2（`kit/flows/screenplay/flow.json`：选题报告 → 剧本 IR → 分镜剧本）与各产物格式块（`kit/skills/script-forge.md:27-47` 正常剧本格式：场景头/△ 动作/台词/卡点；`kit/skills/scene-breakdown.md:17-25` 分镜格式：第X集 · 分镜 N）即阅读器的渲染对象；且 kit 项目与 Pinax 项目可用**同一个文件夹**（junction 机制），互通底座现成。大纲侧 Pinax 自有双格式（`大纲.md + outline.json`）已入主干——阅读器一半是现成件。

---

## 1. 背景

### 1.1 这条排期从哪来

近两轮对话里，用户先给出了产品未来的三层架构（表现层七格式 / 叙事内核 / 文本资料 + RAG 知识层）与本地化演进方向：一个项目允许多个故事类型（小说、剧本、游戏、漫画），同一故事用不同前端呈现，中间由 agent 工具转换、后续沉淀为工作流；前端策略是「适配 1–2 个核心，其余把本地兼容做好」；并预判世界书大概率要用 HTML + 可交互图谱做前端、条目管理要用多维表格做横纵归并、其余文档走 md 与原生读写。

随后用户收窄出两条**已点名、要排期**的事项：

1. **RAG 知识层置于前端，替代已有的世界书 UI**——「提上日程」；
2. **大纲、剧本等格式尽快在 Pinax 内可阅读展示**——「尽快兼容」。

同日第二指令给这两条定了施工口径：**「很多东西可以在 kit 里找答案，特别是 rag，以及剧本，不用二次开发」**——即：能力以 kit 现成件为准接入，Pinax 不并行重写（RAG 检索、剧本格式均在 kit 有真身，见 §1.2/§1.4）。

其余方向（格式间 agent 转换器、正本格式裁定、工作流编排、自我进化闭环的实现）**不在本排期承诺范围**，只在与 W1/W2 自然衔接处留接口（见 §3.7 观察位）。

### 1.2 现状审计：知识侧（RAG 的数据与检索）

**数据与图谱（Pinax 侧已入主干）**

- 图谱契约 `buildWorldbookGraphFile`：`shared/worldbookFileContract.js:735`（format=worldbook-graph@1 在 :807；与 kit `build_index` 同构注释在 :698）。server 端由 `server/services/localMirrorService.js:390` 包装、`mirrorBook`（:556）落盘 `世界书/graph.json`（:590），同步入口 `POST /api/localmirror/sync`（`server/routes/localMirror.js:201,203`）。前端不拉 graph.json，由 `src/services/worldbook/entryBrowserModel.js:325 buildGraph` 用同一函数现场合成（`UnifiedEntryBrowser.vue:101`）。
- kit 侧 RAG 索引器：`kit/tools/worldbook_index.py build_index`（文件头声明 GraphHyperRAG，worldbook-graph@1）。

**检索（kit 有全套现成件；Pinax 零接线）**

kit 侧（唯一实现，本文修订的落点）：

- 检索与扩展：`kit/core/src/kernel-view.ts:212 loadWorldbookGraph`（读项目 `世界书/graph.json`）、`:235 worldbookSearch`（打分口径 :247-259：标题等值 +20 / 标题含 +12 / tag +6 / 摘要 +4 / CJK 双字 bigram ≤+4；**一跳关系扩展** :265-282 沿图边 weight 降序取前 3）；返回形状 :283-295——`{query, cat, graph:{format,built_at,entries,relations}, hits:[{id,title,cat,status,path,summary,score,relations[]}], expansion:[{id,title,cat,via,weight,from}]}`。
- 三面同源：动词声明 `kit/core/src/verbs.ts:507-525`（worldbook_search）；MCP 面 `kit/core/src/mcp.ts:381`；8421 内核 HTTP 面 `POST /api/v1/verbs/{verb}`（`kit/contracts/http-openapi-v1.json` paths 含 `worldbook_search`/`kb_search`/`kb_read`）。
- **面向面板的接入面（8431）**：`POST /api/kernel-verb`（`kit/storyharness/src/serve.ts:25` 头部注释与 :354-380 实现）——白名单 `flow_init/run/next/effect/kb_search/kb_read/worldbook_search`（:369），请求体 `{verb, args}`，`?trim=1` 剥大文本；且带 **`location` 扩展（:358-368，D-E）**：传自定义文件夹绝对路径 → `mklink /J` 把 `projects/<pid>` junction 到该文件夹（pid 正则 `^[A-Za-z][A-Za-z0-9_-]{1,39}$`，:362），**内核零改动照跑**；退役回执明写「世界书/RAG 走 /api/kernel-verb 的 worldbook_search、kb_search、kb_read」（:1062）。
- 知识卡检索（写作方法论栏）：`kit/core/src/verbs.ts:482-505`（`kb_search` 对 knowledge 语料 95+ 张方法论卡打分排序、`kb_read` 读卡正文）；kit 语料编译产物 `kit/hypergraph.rag.json`（format storyflow-hypergraph@1，entries=115 / relations=5998）。
- kit 官方 panel 的形态答案：`kit/docs/设计-官方panel-demo形态-20261002.md:14,23,56`（知识页两栏制；面板侧已规划「新增 router 分支 → /api/kernel-verb worldbook_search / kb_search / kb_read」）。

Pinax 侧（接线现状）：

- 本地即时轨已落地：`src/services/worldbook/entryBrowserModel.js:171-229`，打分口径与 kit 同款（:184；bigram 切分 :175-176）；UI 入口 `src/components/worldbook/BrowserSearchBar.vue:7,19-22`。**这是「前端本地实现」的唯一存量**——缺一跳扩展；W1-A 后其定位见 §5-7。
- 接线为零：8451 任务面桥（`server/services/storyAgentRuntime.js:28`）未挂载检索组件；`8421/8431 在 Pinax 全仓零引用`（`docs/plan/kit-microservice-forms-20261008.md:19` 实测）；其 M5 待裁定原文：「若右侧工作台要 flow 编排，优先走 8431 代理（它有鉴权）」（:237）。
- 既有代理先例（W1-A 照抄的形制）：浏览器只经 guarded `/api/storyagent` 同源代理访问 8451（`server/services/storyAgentRuntime.js:4` 注释；路由 `server/routes/storyagent.js:9` 带 loopback 校验）；端口单源 `shared/kitTaskPlane.js:1-4`。
- 8431 的运行前提：8431 进程持有的是 `KernelClient`（`kit/storyharness/src/kernel.ts:39-49`，verb 走 HTTP 到 `${base}/api/verbs/${name}`）——**内核 8421 必须陪跑**；且工作区必须显式钉（`kit/storyharness/src/config.ts:47-49` env `STORYHARNESS_WORKSPACE` 优先；kit `scripts/ops/README.md:37` 记有「漏 set 会静默落到 storymasterv4」的坑）；本机当前 8421/8431 均 down、kit 守护失效有案（`docs/plan/kit-microservice-forms-20261008.md:145-173`，2026-10-08 实测）。

**注入与分档（已入主干）**

- `src/services/worldbook/worldbookContextBuilder.js`：tier 三档 core/support/background（:24-29），缺省按 kind 推导 `kindTierOf`（rule→core；character/location/organization→support；其余→background，:36-38），entry.tier 恒优先；裁剪规则 :694-703（core 不裁、support 单条上限=预算×50%、background 低预算垫底）。消费方：`generationAdventureTriggers.js`、`generationEmergence.js`、`narrativeKernel.js:8`。

**存储与编辑写链（已入主干）**

- 编辑真源仍是 localStorage（`src/services/worldbook/worldStore.js:50-51`），文件双写控制器：「文件真源优先 + localStorage 缓存回落 + 首载迁移」（:249），读时文件优先（:509-513）。
- 文件读写仓库 `src/services/worldbook/worldbookFileRepository.js`：`GET /api/localmirror/worldbook`（:223）、`POST /api/localmirror/sync` 幂等全量（:5-6）；不可达即回落（:526）。

**既有产品设想与本指令同向**

- kit 文档已把世界书与 RAG 合并为「知识」页：`kit/docs/设计-官方panel-demo形态-20261002.md:14,23`；「世界书=GraphHyperRAG 动词组」：`kit/docs/Agent.md:55,77`。
- 不引入外部检索设施是既定口径：`docs/engineering/memory-utopia-alignment-20260917.md:20`（不引入服务端 embedding / 图数据库）。

### 1.3 现状审计：世界书 UI 入口与「替代」候选清单

**入口盘点（2026-10-09 实测）**

- 独立路由 6 条（均 `activityKey:'worldbook'`）：`src/router/index.js:63`（快速导入 `settings/worldbook`）、`:73`（创建工作区 `.../create`）、`:89`（高级设置 `.../advanced`）、`:98`（设定 `settings/structured`）、`:107`（资料 `settings/sources`）、`:116`（地图 `settings/world-map`）。
- 顶栏 4 页签（设定/资料/地图/条目）：`src/components/workbench/SettingsSectionNav.vue:33-36`。
- `src/pages/WorldBookEditor.vue`（4671 行）7 个 tab（:1094-1099 起）：总览 / 条目管理 / 章回结算 / 基础设定 / 联网调研 / 导入导出 / 分组管理；「总览」tab 内嵌统一条目浏览器（:62；点选跳条目管理 :1060）。
- 其他：创作台右 dock `AuthoringWorldbookPanel.vue:28`（关联世界书）；`LibrarySidebar.vue:25`（助手入口）。

**统一条目浏览器与图谱（现状能力）**

- `src/components/worldbook/UnifiedEntryBrowser.vue`（280 行）：只读壳，**cards/graph 两视图** + EntryWiki 详情覆盖层（:49-54、:76-90）。
- `GraphCanvas.vue:47-48`：零依赖 Canvas2D——节点拖拽 / 平移 / 滚轮缩放 / 双击复位 / 图例高亮 / hover 邻域淡化；Shift+拖拽建边仅 emit（:375-381），无写操作（:57）。
- 编辑三件套（写链已有）：`EntryMdEditor` / `EntryProfileEditor` / `EntryLinksEditor`；建边属性 `RelationEdgeDialog`。

**「替代」候选动作表**

| 现有面 | 现状 | 候选动作 |
|---|---|---|
| `WorldBookEditor` 总览 tab | 统一浏览器只读壳 | **升级为控制台原型**（W2 落点；检索框接 kit） |
| 条目管理 / 基础设定 / 分组管理 tab | 旧编辑面 | 收编为控制台内视图（W2/W4） |
| 顶栏「设定」页 `StructuredSettings.vue`（346 行） | 仍是旧 `StructuredSettings*`，含 `PlaceCatalog`（`StructuredSettingsPanel.vue:201`） | 归并（方式见 §5-2） |
| 资料 `SettingsSources.vue:15` + `WorldbookSourcesPanel.vue` | IndexedDB 源文档面板 | 改造为「知识来源」视图（W3） |
| `WorldbookResearchPanel.vue:14-15` | 联网调研、不写回 | 并入检索轨（W2 备选） |
| 快速导入 / 创建工作区路由 | 导入管线 | **保留管线，UI 词汇随控制台收编** |
| `GraphCanvas` / `RelationEdgeDialog` / `WorldMapPage` / `AuthoringWorldbookPanel` | 可用 | 保留（图谱升级在 W2） |

### 1.4 现状审计：格式侧（阅读展示的原料）

**Pinax 项目文件规范与「大纲」（已入主干）**

- 规范 `pinax-project@1`：`docs/engineering/pinax-project-spec.md:8-13,20-24`；常量 `server/services/localMirrorService.js:21-22`（`pinax-project-fs@2` / `pinax-project@1`），目录模板 :25-27。novel 目录含 `正文/`（逐章 md）、`大纲/（大纲.md + outline.json）`、`世界书/`、`构思/`、`资料/`、`日志/`、`约束/`（手写自由区，:29-30）、`媒体清单.json`。
- **screenplay kind 模板已存在**：`docs/engineering/pinax-project-spec.md:23`——`剧本/（<集>/<场>.md，内容映射待扩展） 人物/ 场景/ 大纲/ 世界书/ 资料/ 日志/ 约束/ 媒体清单.json`（常量同处 `localMirrorService.js:26`）。其「内容映射待扩展」的空缺，本 v2 由 kit 短剧流产物格式填补（见下），模板目录名与 kit 编号目录（`01-选题/02-编剧/…`）的对照列 W1-B 对单项。
- 大纲双层模型：项目节点（id/title/intent/status(exploring/planned/drafted/fulfilled/parked)/chapterRefs/explorationRefs）+ 因果边（causes/foreshadows/alternative/parallel），`AuthoringOutlinePanel.vue:7-16,46,97-98`；本地落盘组装 `src/services/localMirrorService.js:155-157`，服务端写 `大纲/大纲.md + outline.json`（`server/services/localMirrorService.js:574-575`），读回 :826-831（只有 md 时警告无结构化节点）。
- 项目 id 格式（junction 衔接的关键实测）：`projectId = proj_<base36 时间戳><随机>`（`localMirrorService.js:463`）——以字母开头、仅含 `[A-Za-z0-9_]`、长度 ~15，**直接落在 kit junction 的 pid 正则内**（`kit/storyharness/src/serve.ts:362`）。

**kit 剧本资产（格式 canonical，阅读器直接渲染这些）**

- 短剧流 v1.2：`kit/flows/screenplay/flow.json`（flow@3 · official）——m1 topic（找梗/素材解剖/时代情绪锚/网感文案/拆书入库）→ m2 plot（结构/主线/人设/分场/世界观/短剧节拍/暗线/伏笔/悬念/红队评审/编剧）→ m3 drama；outputs：选题报告 / 剧本 IR / 分镜剧本，外加 node `m2.world-forge` → `世界书/总览.md`（GraphHyperRAG 词条库，:83-88）；desc 明言「暂不转 docx，把剧本 md 做好」；inputs `direction`（必填）/`episodes`（默认 6）/`sourceMaterials`（在盘即声明：素材优先，缺席≠兜底）。
- 产物格式块（渲染对象）：
  - **剧本**（m2 唯一交付件）：`kit/skills/script-forge.md:27-47`——`# 剧本 · 《书名》（N 集试稿）`；`## 人物卡（≤6 人）` + `## 伏笔登记（| id | 内容 | 埋于集 | 收于集 |）`；每集 `## 第N集《集名》` → `[旁白：…]` 背景快切 / `场景：县水利局会议室 · 日 · 内` / `△ 动作` / `角色（情绪提示）：台词` / `卡点：代价——…｜钩——…`。同文件 :12 明令输出禁止 5W1H 字段表（模块 op 元数据里「结构化剧本 IR（逐场 5W1H/行动/台词/价值/钩）」字样为另一层描述，落地以 skill 现版输出格式为准，实施时对单）。trigger 行 :5 记落点：输入 `01-选题/选题报告.md` → 输出 `02-编剧/剧本.md`。
  - **分镜剧本**（m3 唯一交付件）：`kit/skills/scene-breakdown.md:17-25`——`第X集 · 分镜 N` / `场景：地点/时间/在场人物` / `行动：…` / `台词：角色名：…` / `备注`；每集 9-12 分镜、每镜 6-15s、编号连续可批注。
  - 佐证格式还有：短剧节拍表 `kit/skills/script-drama-beat.md`（场次编号/△动作/台词内联情绪/前3秒钩子/结尾付费卡点）；分集重排表 `kit/skills/adapt-episode-map.md:18-29`（十列表头）；全季简纲 `kit/skills/story-outline.md`。
- 落位硬约束：世界书卡片一律写**项目根** `世界书/<分类>/<词条>.md`（「flow outputs 契约同款路径」，`kit/knowledge/continuity/worldbook.md:42`）——与 Pinax 镜像布局天然同构；剧本类产物落项目内编号目录（`01-选题/`→`02-编剧/`→……）。
- 推演引擎（剧本互动推演的现成件）：`kit/storyharness/packs/deduce/`（挂载位；主开发件 `D:\storyflow-deduce\`），`pack.ts:1-2` 自述三纪律已内化（「打分=建议面/无私有账本/正文纯净」）；驱动面与设计账：`kit/docs/设计探索-编剧推演引擎-20260929.md`、`kit/docs/交接回执-前端切割与v4收拢-20261002.md:88`（挂载机制保留，经 :8431 `/api/deduce/*` 驱动——本排期只留观察位）。
- **互通底座（junction）**：8431 的 `POST /api/kernel-verb {location}` 把任意文件夹挂成 kit 项目（§1.2）——kit 流在这同一个文件夹里跑、产物落盘、Pinax 前端同文件夹读，**「一个项目多故事类型」的互通不是新造，是接现成**。

**渲染与浏览能力（Pinax 可复用先例）**

- markdown 依赖仅 `marked ^18.0.3`（`package.json:108`）+ dompurify / turndown；无 markdown-it / vue-markdown。
- 渲染先例 3 个：`src/pages/DocsPage.vue:5,72`（手册 md→marked→sanitize，最接近「文档阅读」）、`EntryMdEditor.vue:69,111`（条目 md 预览）、`src/services/notes/assetMarkdown.js:1,33`（资料/笔记 md→html）。
- 文件浏览现成形态：`FolderBrowserModal.vue:83`（仅目录列表）、`LocalizationCenter.vue:73-84`（从文件恢复）；**没有「项目文件列表 + 版面预览」的现成 UI**。
- 本地镜像读 API（`server/routes/localMirror.js`）：`/browse:47`、`/book:166`、`/worldbook:145`、`/sources:177`、`/projects:43`、`/location:29`、`/appdata:36`、`/rules:188`。

**剧本与结构化脚本先例（Pinax 侧）**

- 全仓无 screenplay/fountain 解析代码——该词只出现在 kind 模板与文档占位（`pinax-project-spec.md:23`、`localMirrorService.js:26`、`ProjectInfoPanel.vue:41`、i18n）。
- 漫画分镜脚本是最接近的结构化先例：`ComicAdaptationPlanner.vue:54,59-62` 按 `plan.pages` 导航；page=`{id,title,revision,narrativeBeat,pageTurnHook,panels[]}`、panel=`{id,visual,beat.action,dialogue[{speaker,text}],caption}`（`ComicPlanPageEditor.vue:33-39,84-100`，带 revision 冲突保存 :47-64）——字段清单可作后续结构化格式参照，但其形态是 JSON 编辑表单，不是剧本阅读排版。

### 1.5 缺口结论（v2 重述）

知识侧四个缺口：① **接线**——kit 检索面（打分+一跳扩展+知识卡）现成而未接，Pinax 缺服务端同源代理与前端检索面板；② 缺一个承担「RAG 知识层前端」身份的统一控制台（现在入口 6 路由 + 7 tab + 旧设定页）；③ 缺表格视图（横纵归并）；④ 缺「世界书」旧 UI 的退役路径。

格式侧两个缺口：① 缺「项目文件 → 版面」的文档阅读面（**格式本身不缺——canonical 在 kit**）；② 缺格式注册机制（把分镜/漫剧/推演产物等后续格式低成本接进来）。原「缺剧本书写约定」一项**已消解**（kit 短剧流产物格式直接采纳）。

---

## 2. 口径与非目标

### 2.1 本排期对指令的解释（欢迎推翻，这是 §5 的第一号裁定对象）

- **「RAG 置于前端」**取三义并行：(a) **检索的唯一实现在 kit，Pinax 只做接入与呈现**——浏览器经 tunnel 无法直连 loopback（8451/8421/8431 皆然），故走 Pinax 服务端同源代理（照 `/api/storyagent` 形制）→ 8431 `/api/kernel-verb` → 8421 内核 → 项目 `世界书/graph.json`；一跳扩展与打分全部用 kit 返回值，**前端不重算**。项目与 kit 的桥接用 8431 现成的 `location` junction 机制（内核零改动）。(b) **知识层成为一等前端面**——一个统一「知识」控制台承担检索、图谱、条目、来源四个视图，形态对齐 kit「知识」页两栏（本书设定 / 写作方法论）。(c) **「世界书」品牌与分散入口退役**，知识文件仍是唯一真相，数据不搬迁、存储不更换。
- **「替代已有的世界书」**= UI/IA 层面替代 + 词汇收编（世界书→知识），不删文件、不改契约、不动 tier 注入链。
- **「阅读展示」**= 只读版面渲染（本轮不做编辑器）；**剧本渲染按 kit 产物格式**（script-forge 正常剧本格式 / scene-breakdown 分镜格式），不自创 md 约定；文件保持 md/json 外部可写（本地兼容优先），解析器容错、不因约定外内容报错。
- **默认保留**：导入管线（快速导入/创建工作区）、`RelationEdgeDialog` 建边、`WorldMapPage`、创作台右 dock 入口。

### 2.2 非目标（本排期不做）

- 不做剧本/大纲编辑器（阅读展示为先；编辑需求届时另开）；
- **不在 Pinax 重实现任何 kit 已有的检索/扩展/格式逻辑**（「不用二次开发」的字面执行：无平行打分器、无平行剧本解析器）；
- 不做剧本生成接线（跑 kit 短剧流 m1→m2→m3）与推演引擎驾驶（deduce 包）——观察位（§3.7）；本排期只做阅读；
- 不做格式间 agent 转换器、不做正本裁定、不做工作流编排（另一条线）；
- 不实现「自我进化闭环」（干预信号→知识项），只留观察位（§3.7）；
- 不引入外部检索设施（embedding/图数据库/外部 RAG——`memory-utopia-alignment-20260917.md:20` 口径）。

---

## 3. 排期

每波独立提测、独立点头；波内单可并行。规模为相对量级（S/M/L），不折算工期。

### 3.1 W1-B 文档阅读器 v1：大纲 + 剧本（M，先行快赢）

- **目标**：项目文件夹里的 `大纲/`、剧本类产物（kit 短剧流 md）在 Pinax 内获得只读版面。
- **交付**：
  1. 文档阅读面（入口位置见 §5-4）：项目文件列表（走 `GET /api/localmirror/browse`/`/book` 已有读端点；**扫描不锁目录名**——项目根递归找 md，天然兼容 kit 编号目录 `01-选题/02-编剧/…` 与 Pinax 模板目录并存）+ 版面预览；
  2. 大纲渲染：`大纲.md` 文档视图 + `outline.json` 结构视图（节点按 status 着色、因果边列举，只读）；只有 md 时的降级提示（对齐 `localMirrorService.js:826-831` 现状）；
  3. **剧本渲染（按 kit 格式，v1 轻样式）**：通用 md 渲染 + 行级轻识别（`场景：…` 场景头加粗、`△` 动作行样式、`角色（…）：台词` 对白缩进、`卡点：` 高亮、`[旁白：…]` 弱化；分镜 `第X集 · 分镜 N` 作小节标题）——渲染深度裁定见 §5-3；fixture **直接取自 kit 格式块**（`script-forge.md:29-47`、`scene-breakdown.md:17-25` 原文提取，见「验证」）；
  4. 验证：`scripts/doc-reader-smoke.mjs`（解析器对 fixture 双格式、容错用例）+ Playwright 实拍（既有工装）。
- **出口验收**：真实项目文件夹（含大纲）与剧本 fixture（kit 原文格式）在 1440/390 可读；零控制台错误；**零写入**（只读面不产生任何文件/存储变更）；截图入库。
- **写面**：新组件 + 新解析服务（预计 `src/components/documents/` 或同层新目录 + `src/services/documents/`）；不改 `Authoring.vue`。
- **对单项**：`pinax-project-spec.md:23` screenplay 模板目录名（`剧本/人物/场景/`）与 kit 编号目录的对照——阅读器两者都读，模板文案是否跟随 kit 目录另议（不阻塞本波）。

### 3.2 W1-A RAG 接线：接 kit `worldbook_search` + `kb_search/kb_read`（M）

- **目标**：Pinax 前端获得 kit 全套检索能力（含**一跳关系扩展**与知识卡），「世界书」从浏览升级为检索式入口。
- **前置件（开工即验，属本波交付链的一部分）**：
  1. **kit 8431/8421 可达性**：本机当前均 down 且 kit 守护有失效案（§1.2）。本波开工第一步 = 独立终端手工拉起（`cd kit/storyharness && npx tsx src/cli.ts web`，连带 8421；工作区钉 `STORYHARNESS_WORKSPACE=D:\storyflow-kit`），并写活体探针脚本（`curl --noproxy "*"`，对齐既有 loopback 探测纪律）。长期监督归属见 §5-8 与 `kit-microservice-forms-20261008.md` M2/M3/M5，合并裁定，不另立问；
  2. 契约探针：`GET 8421 /api/v1/openapi.json` 自描述 + 8431 `/api/hub` 健康，固化为 smoke（kit 升级时接口形状漂移即刻显形——对齐 pinax-adapter `/v1/pinax/contract` 自探针先例）。
- **交付**：
  1. **Pinax 服务端同源代理**（新路由文件，照 `server/routes/storyagent.js` 形制）：
     - `POST /api/knowledge/worldbook-search {projectId, q, cat?, k?}` → 8431 `POST /api/kernel-verb {verb:"worldbook_search", args:{project, q, cat, k}, location}`——`location` **由 server 从本地项目注册表推导**（`service.listProjects()` 拿 `rootPath`），**不信任浏览器入参**；首调带 location（junction 挂载），后续可省（`kit/storyharness/src/serve.ts:358-368` 现成；pid = Pinax `projectId`，格式已验证兼容 :463 与 :362）；
     - `POST /api/knowledge/kb-search {q, dir?, k?}` / `POST /api/knowledge/kb-read {ref, maxChars?}` → 同面转发（knowledge 语料在 kit 仓，无 location 需求）；
     - 显式失败纪律：8431 不可达 → 明确错误码 + 启动指引文案（`显式失败不冒充`），不静默回落（行为裁定见 §5-7）；
     - 端口/端点单源：照 `shared/kitTaskPlane.js` 形制新增 `shared/kitProtocolPlane.js`（8431 常量 + 白名单动词表）。
  2. **前端检索面板**（`BrowserSearchBar` 升级 + `entryBrowserModel` 接入）：命中列表 + 「一跳扩展」分区 + 来源说明（边类型/weight/from）——**渲染 kit 返回的 score/relations/expansion，前端不重算**；本地即时轨的去留按 §5-7 裁定执行。
  3. 验证：`scripts/knowledge-proxy-smoke.mjs`（mock 8431 响应形状 + 失败路径 + location 推导断言）+ 活体冒烟（8431 在跑时真调一次，探针留证）+ 前端 E2E（输入→命中→扩展→点入条目）。
- **出口验收**：同义查询（如「豹子头」）在 Pinax 内得到与 kit 面板同形状结果（hits+expansion 分区可见）；8431 down 时错误显式且带指引；只读（不发写请求）；1440/390 通过。
- **写面**：`server/routes/` 新文件 + `server/index.js` 一行 + `shared/` 常量文件 + `src/services/worldbook/` 新文件 + `BrowserSearchBar.vue` 改造 + `scripts/` 冒烟 + `package.json` smoke 行。

### 3.3 W2-A 知识控制台 v1（L，主体）

- **目标**：一个「知识」面取代分散入口——检索 / 图谱 / 条目三视图 + 详情节收编；**形态对齐 kit「知识」页两栏制**（本书设定=世界书检索；写作方法论=kb 检索/读卡，`kit/docs/设计-官方panel-demo形态-20261002.md:23`）；「世界书」不再作为前端主概念。
- **交付**：
  1. 控制台骨架：视图切换（检索/图谱/条目卡片）、EntryWiki 详情收编进控制台侧板（替代覆盖层跳转）；
  2. 「写作方法论」栏：接 W1-A 的 kb-search/kb-read 代理（知识卡列表 + 读卡视图）；
  3. 图谱升级：`GraphCanvas` 增加检索命中高亮、分类/档位（tier）/状态过滤、节点操作（打开条目、聚焦邻域、建边入口保留）；
  4. `WorldBookEditor` 7 tab 收编：总览/条目管理/基础设定/分组管理 → 控制台内视图；章回结算/联网调研/导入导出保留为控制台内 tab 或外链页（逐项在实现前对单）；
  5. 顶栏「条目」入口切换为控制台（§5-1）；旧路由影子共存（跳转指向控制台），退役放 W4。
- **出口验收**：`ui-style-check` + 视觉对齐工作流逐片评审（`docs/engineering/visual-alignment-workflow.md`）；E2E：检索→图谱→条目→编辑（既有写链）全链；1440/390 零横向溢出。
- **写面**：新控制台组件（`src/components/worldbook/` 或新目录）+ `WorldBookEditor.vue` 大幅改造（若超结构预算，拆新页 + 路由切换）。

### 3.4 W3-A 多维表格视图（M）

- **目标**：条目的「多维表格」面——行=词条、列=profile 字段（七模板），支持分组/透视的横纵归并。
- **交付**：表格视图组件（虚拟滚动或分页防大条目集）；列定义来自卡片 profile 模板；分组（按分类/标签/档位）与横向对比（多词条并排）；单元格编辑 → 复用文件写链回写 md frontmatter（`worldStore`/`worldbookFileRepository`）；编辑即时保存 + 失败回落提示。
- **前置**：§5-5 必须给出「第一张表」的真实场景，列与归并维度按场景裁剪。
- **出口验收**：场景旅程 E2E；写回后 graph.json/卡片文件一致（复用既有 server-rw 冒烟断言）；无 localStorage 新源。

### 3.5 W3-B 格式注册表 + 第二格式组（M）

- **目标**：阅读器从「写死大纲/剧本」升级为注册制；把分镜脚本（漫画数据）、推演产物（`clickstream.jsonl` 等，见 `kit/docs/设计探索-编剧推演引擎-20260929.md`）等后续格式低成本接进来。
- **交付**：格式注册模块（matcher→parser→renderer 注册表，新格式零改核心）；分镜脚本只读视图（数据源 `ComicPlanPageEditor` 字段结构，`plan.pages/panels` 只读渲染）；文档列表入口打磨（刷新/折叠/最近打开）。
- **出口验收**：注册表冒烟（新增假格式验证扩展点）；分镜只读视图 E2E；文档阅读器回归不破。

### 3.6 W4-A 旧 UI 退役与迁移（M）

- **目标**：影子共存期结束，旧入口下线、词表切换。
- **交付**：设定页归并落地（§5-2 裁定后）；`基础设定`/`分组管理`/`条目管理` 旧 tab 代码删除（墓碑保留迁移说明）；i18n 词表「世界书」→「知识」全量切换（保留历史词与导入导出中面向 ST 兼容的「世界书」字样）；`docs/user-manual/03-worldbook.md` 与相关文档更新；STATUS/LOG 落账。
- **出口验收**：入口探针（旧路由跳转或 404 符合裁定）；文档构建过；全门禁绿；用户真机过一遍。

### 3.7 观察位（不承诺、不排期）

- **剧本生产接线**：Pinax 内发起/跟踪 kit 短剧流（`flow_run` 等已在 8431 白名单内）——「同一文件夹」经 junction 已通，接线形态（任务面 8451 vs 协议面 8431）届时单独提案；
- **推演引擎驾驶**：deduce 包（`kit/storyharness/packs/deduce/`）经 8431 `/api/deduce/*` 驱动，作品级交互修剪剧情树（设计账：`kit/docs/设计探索-编剧推演引擎-20260929.md`）；
- 知识项生命周期与干预信号（自我进化候选：regenerate/编辑/分支 → 候选知识项 → 人工采纳）；
- 图谱导出独立 HTML（先例：`docs/plan/worldbook-showcase-20261008.html`；定位与应用内视图的先后见 §5-6）；
- 8431 面板文件面（`/api/panel/files|raw|preview`）复用评估——若成立，文档阅读器的项目文件列举或可复用 kit 面（本排期先走 localmirror 读端点，不引入）。

---

## 4. 约束与风险

1. **测试预算零和**：vitest 20 文件/200 用例双满额（`scripts/vitest-budget-reporter.mjs` 超限 exit 1）——本排期所有新验证走 `scripts/` 冒烟 + `package.json` smoke 行（先例：9 个 `worldbook-*-smoke.mjs`、`local-mirror-check`）；确需进单测的只做置换。
2. **结构预算**：`Authoring.vue`（行数与 imports）与 chunk 体积卡得很紧——所有新代码落新组件/新 service；`WorldBookEditor.vue` 已 4671 行，W2 收编若超限，拆新页 + 路由切换，不抬判据。
3. **kit 可达性是本排期新的依赖面**：8431+8421 未运行 = 检索面不可用（设计为显式失败，§5-7）；kit 守护失效有案未修（`kit-microservice-forms-20261008.md` §3），**监督归属与修法需与 M2/M3/M5 合并裁定**，本排期不自行其是。
4. **契约漂移**：检索实现单源在 kit，Pinax 侧「kit parity 漂移」风险从「公式双拷」转为「接口形状漂移」——用 8421 openapi 自探针 + 8431 hub 探针固化（§3.2），kit 升级时立刻显形；不再在 Pinax 建第二实现。
5. **「替代」是用户可见 IA 变更**：按视觉对齐工作流（`docs/engineering/visual-alignment-workflow.md`）逐片评审；先影子共存、后退役，避免一次性切换。
6. **剧本阅读的外部兼容成本下降**：格式不再由 Pinax 冻结（kit 是 canonical），Pinax 解析器按「尽力识别、不报错、显示原文兜底」实现即可；kit 格式演进时以 kit 为准对单。
7. **本机约束**：内存紧张（串行 vitest 为定案口径）；GUI 弹窗不可见（远程经隧道）；E2E 用既有 Playwright 工装（canned 注入先例）；loopback 探测一律 `curl --noproxy "*"`。
8. **数据安全**：全程不动用户真实文档库与项目索引；E2E 用隔离 fixture（先例：`%LOCALAPPDATA%\pinax-probe\` 工装）；junction 机制只挂用户已注册的项目文件夹（注册表推导，不信任浏览器入参）。

---

## 5. 待裁定（请逐条批复；编号供回复引用）

1. **控制台命名与入口**：顶栏「条目」页改名为「知识」并作为控制台入口，「世界书」退居历史词？还是保留「世界书」名称只做结构收编？
   （我的建议：改「知识」——与 kit 既有「世界书与 RAG 合并知识页」定案一致。）
2. **设定页归并方式**（回收 2026-10-07 旧问）：`StructuredSettings` 页整体并入控制台（页面消失），还是留成控制台内的「预设过滤视图」（「设定」=按 kind 预过滤的知识视图）？
   （我的建议：后者——保留心智入口，去掉独立编辑面。`PlaceCatalog` 同步并入。）
3. **剧本阅读渲染深度**（v1 修订，原「md 轻约定」问题已由 kit 消解）：v1 = 通用 md 渲染 + 行级轻样式增强（场景头/△/对白/卡点识别，不做完整解析器）？还是直接上完整剧本解析器（场景数据结构化、可折叠集/场导航）？
   （我的建议：轻样式先行——格式 canonical 在 kit 且可能演进，v1 不该在 Pinax 冻结第二套解析；结构化导航等 W3-B 注册表阶段按实际手感再议。）
4. **文档阅读面入口**：独立「文档」页（项目级，进顶栏或工作台）？还是并入现有页（资料页改造）？
   （我的建议：独立「文档」页——资料页数据源是 IndexedDB 源文档，语义不同，别混。）
5. **多维表格第一张表**：请给一个真实场景——谁、在什么情况下、要横纵看哪些词条（决定列定义与归并维度）。
6. **图谱形态先后**：应用内图谱升级（W2）优先，导出独立 HTML 快照放观察位——认可？
7. **8431 不可达时的检索面行为**：显式失败 + 启动指引（推荐——对齐「不可用=显式失败」纪律）？还是回落现有前端本地轨（无扩展、两套打分并存）？**此裁定决定 `entryBrowserModel.js:171-229` 本地打分轨的去留**（保留=降级/删除=单源，二选一）。
   （我的建议：显式失败为主，本地轨降级为「8431 不可达时的只读过滤」或直接移除，倾向移除——避免第二实现漂移。）
8. **8431/8421 监督归属（跨文档合并项，不另立新问）**：与 `docs/plan/kit-microservice-forms-20261008.md` 的 M2/M3/M5 合并裁定（M2 倾向：8451 归 Pinax 监督、8421/8431 归 kit 守护但要先修好；M3：kit-guard 失效待你亲手验）。本排期只需一句：「W1-A 前置按该裁定执行」。

---

## 6. 进一步改造方向（展望账，非本排期承诺）

用户同日追加指令：「进一步改造的方向」。本节回答，性质是**方向账**：每级独立提案、逐级点头，不进 §3 排期；三个既有口径继续管着——kit 是 canonical、不二次开发、观察位成熟一个提一个案。

**一根轴**：W1–W4 把 Pinax 做成 kit 能力的**消费者**（读检索、读产物、读格式）；进一步改造是把消费关系升级为**驾驶关系**——Pinax 成为 kit 内核与流、推演、知识生长的统一驾驶舱。这正是 §1.1 用户三层架构（表现层七格式 / 叙事内核 / 文本资料+RAG 知识层）里「中间由 agent 工具转换、后续沉淀为工作流」的落地形状。分级如下，依赖自下而上：

| 级 | 名称 | 一句话 | 接现成度 |
|---|---|---|---|
| D6 | 监督地基 | 8421/8431/8451 三面监督与守护定型（§5-8，先决） | 纯裁定+修复 |
| D1 | 检索进 agent 工具集 | 写作 agent 循环挂 worldbook_search/kb_search | **纯接现成** |
| D2 | 流驾驶舱 | Pinax 内发起/跟踪 kit 短剧流，产物直进阅读器 | **纯接现成** |
| D3 | 推演驾驶 | deduce 包 `/api/deduce/*` 驾驶面 + 剧情树进格式注册表 | **纯接现成** |
| D4 | 七格式表现层 | W3-B 注册表长成格式家族 + 格式间转换器 | 大半接现成，转换器需提案 |
| D5 | 自我进化闭环 | 干预信号→候选知识项→人工采纳→知识层生长 | **需 Pinax 提案 + kit 侧能力确认** |

- **D6 监督地基（先决，贯穿）**：M2/M3/M5 裁定落地 + kit-guard 失效修复 + 双探针固化（§3.2 前置件）。D1–D5 全部压在 8431/8421 的可达性上；本机守护失效案不修，方向账全是纸上谈兵。
- **D1 检索进 agent 工具集（近，W1-A/W2 后的自然延伸）**：现状 8451 任务面桥未挂检索组件（§1.2）；把 `worldbook_search`（设定一致性核查）与 `kb_search/kb_read`（写作方法论）注册为写作 agent 的服务端工具，agent 循环按需检索知识层。kit 侧语义现成（`kit/docs/Agent.md:55,77`「世界书=GraphHyperRAG 动词组」），Pinax 侧只是 `storyAgentRuntime` 桥上多挂几个 verb——浏览器零改动。前置仅 D6。
- **D2 流驾驶舱（中）**：8431 白名单本就含 `flow_init/run/next/effect`（§1.2:369）——Pinax 内发起短剧流（junction 挂的是同一个项目文件夹）→ 产物落盘 `01-选题/02-编剧/…` → W1-B 阅读器直接读。**「一个项目多故事类型」的闭环不是新造**：小说项目派生剧本流、剧本/分镜落盘、阅读、采纳回正文，链路每一段都已是现成件。需先裁三件事：流发起入口放哪（知识控制台？文档页？）、流进度/步进的面形态、agent 循环（8451）与 flow 循环（8431）的编排归属——即 M5 老问题的具体化。
- **D3 推演驾驶（中后）**：deduce 包已挂载、三纪律已内化（§1.4），驾驶面走 8431 `/api/deduce/*`；作品级交互修剪剧情树，产物（剧情树/clickstream）经 W3-B 格式注册表进阅读器。前置：W1-B 阅读器（产物可视化）+ W3-B 注册表 + D6。
- **D4 七格式表现层（长线）**：W3-B 的注册表（matcher→parser→renderer）长成格式家族——选题报告/剧本 IR/分镜/节拍表/分集重排表/漫画分镜/推演产物逐一注册；格式间转换器（小说↔剧本等）以 agent 工具形态挂进同一注册表。kit 格式是 canonical，Pinax 侧注册表只做**识别与渲染**，转换器属另一条线（§2.2 非目标）届时另提案。
- **D5 自我进化闭环（长线，唯一需要新能力的级）**：干预信号（采纳/回退/编辑）→ 候选知识项 → 人工采纳 → 知识层生长 → 反哺 D1 检索质量。**kit 侧无现成件**（「信号→知识项」的编译与生长机制需 kit 侧能力确认或扩展）；Pinax 侧能先做的是 W2 控制台里候选项的呈现与采纳 UI。诚实地放在最后：这是方向账里唯一不能「接现成」的一级。

**起步次序建议**：D6 裁定（§5-8 合并问）→ W1/W2 落地 → D1（最小增量、纯接现成）→ D2/D3 逐个提独立工单 → D4/D5 随表现层与知识层成熟度推进。每级开工前按本档惯例出独立提案（背景/排期/待裁三件套），不在本档扩权。
