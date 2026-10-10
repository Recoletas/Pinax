# RAG 前端化 + 格式阅读展示：任务排期（2026-10-09 · v2）

> **用户指令（2026-10-09 原文）**：「关于前端，我有一个明确的要求是，RAG 置于前端，替代已有的世界书，这个事儿需要提上日程，然后尽快兼容，大纲，以及剧本等格式在 pinax 上阅读展示，基于这个，给我一个任务排期，背景写详细一点。」
>
> **口径纠偏（同日第二指令，原文）**：「这里面很多东西可以在 kit 里找答案，特别是 rag，以及剧本，不用二次开发」——v2 据此后：W1-A 从「前端重实现检索」改为「接 kit 现成检索面」；剧本格式从「自创 md 轻约定」改为「跟随 kit 短剧流产物格式」；背景补 kit 现成能力清单。
>
> 本文是排期与背景账：结论速览（§0）、背景与现状审计（§1）、口径与非目标（§2）、排期（§3）、约束与风险（§4）、待裁定（§5）、进一步改造方向（§6，展望账非承诺）。Pinax 侧证据为 2026-10-09 对 main（HEAD `9a3e257`）的实测；kit 侧证据为同日对 `D:\storyflow-kit\` 的实测。相对路径中 `kit/` = `D:\storyflow-kit\`（兄弟仓，非 vendored），其余 = 本仓。
>
> 状态：**排期 v2；W1-B / W1-A 已合入主干；W2-A-1（知识控制台骨架 + 「知识」入口）、W2-A-2a（图谱升级）、W2-A-2b（「设定」页签折进控制台）、W2-C（文档页归属修复）、W2-D（文档页接共享工作区头）、W4-A（旧世界书入口命名收口）、W3-A（人物多维表格 v1）、W3-A-2（表格收口五项）与 W3-A-3（表格面控件一致性收口）已于 2026-10-10 落地并通过全门禁，尚未提交**。§5-1、§5-2 已批并已落地（见 §5.1 批复账），§5-4 的归属账由 W2-C 结清、其入口形态账由 W2-D 结清，§5-1 的命名账由 W4-A 结清一部分（编辑台／使用指南单一名，「世界书」旧语汇仍留 W4-B），§5-5 已批并由 W3-A 落地（第一张表＝人物表，落点＝控制台第 4 视图 `?view=table`），§5-6/§5-8 仍待裁；W3-B 及之后每波开工前逐波点头。**W3-A-2 与 W3-A-3 等的是同一次视觉裁定**：用户看完五件效果后回「这里面，图标的配色，以及下拉框的 UI，一致性再提升一下」，控件一致性已按该意见收口（见 §3.4 末注），裁定仍未回。

---

## 0. 结论速览

两条线、六个波次，按「快赢先行、主体居中、退役收口」排：

| 波次 | 线 | 内容 | 规模 | 依赖 |
|---|---|---|---|---|
| **W1**（并行） | B | 文档阅读器 v1：大纲 + 剧本在 Pinax 内可读（只读；**剧本按 kit 格式渲染**） | M | 无 |
| **W1**（并行） | A | RAG 接线：Pinax 接 kit `worldbook_search` + `kb_search/kb_read`（同源代理 + 检索面板） | M | kit 8431/8421 可达（前置件见 §3.2） |
| **W2** | A | 知识控制台 v1：统一「知识」面（检索/图谱/条目三视图；**对齐 kit「知识」页两栏形态**） | L | W1-A |
| **W3**（并行） | A | 多维表格视图（横纵归并，单元格编辑回写；**W3-A 人物表 v1 ＋ W3-A-2 收口五项 ＋ W3-A-3 控件一致性均已交付，待同一次视觉裁定**，见 §3.4） | M | W2；§5-5 已批 |
| **W3**（并行） | B | 格式注册表 + 第二格式组（分镜脚本 JSON 只读等） | M | W1-B |
| **W4** | A | 旧世界书 UI 退役与迁移（**W4-A 命名收口已交付**；**W4-B-1 已结清 §3.6 第 5 项冒烟重锚**；设定页归并、tab 收编、词表切换余下见 §3.6 W4-B 清单） | M | W2/W3 用户验收 |

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
- **进度（2026-10-10 W2-C 文档页归属修复）**：阅读器本体（W1-B）已合主干；本波遗留的归属账由 **W2-C** 结清（用户回「做」）——`settings-documents` 注册为 project surface，文档页从此有本书自己的「文档 · 书名」标签；`DocumentReader.vue` 不再在无绑定时静默读注册表第一项，改为显式提示＋空态（手选项目下拉保留）。实拍 25 项全绿（含知识/文档两标签并存、未绑书不串文件、1440/900/390 零溢出），详见 §5.1 的 W2-C 口径与 STATUS 同日月行。**当时未做**：给 `DocumentsPage.vue` 接共享作品导航（现仍是「← 返回工作区」）→ 已由同日 **W2-D** 交付，见下一条。
- **进度（2026-10-10 W2-D 文档页接共享工作区头）**：用户回「可以」批准。文档页头部不再自制——`DocumentsPage.vue` 104→49 行，改用与知识控制台、世界地图同一套 `SettingsWorkspaceHeader` + `SettingsContextBar :project-locked` + `SettingsReturnToManuscript`，于是这一页同时拿到**书身份**（「当前作品 · 书名」＋可切书）、**跨面入口**（资料/地图/知识）和**回程**（正文/助手），旧「← 返回工作区」单点出口撤销；只读声明「项目文件 · 只读」下移到阅读器来源栏右端。**形态与批复的偏离（已如实登记）**：批复话术是「和资料页同一形态」，资料页用的是页内竖排 `WorkspaceProjectNavigation`；实际选了共享头部，因为竖排 rail 在页面一侧要配一套开关/焦点归还/`matchMedia` 浮层状态（`SettingsSources.vue:43`、`:71-90`、`:135-143`）＋ `:209` 的 `flex: 0 0 248px` 栏样式，而文档页已是三栏版面，再吃 248px 左栏会挤掉预览区。分区归属上刻意没把「文档」加成第 4 个 tab：分区导航的语义是设定域内部分区，文档是阅读面，且 3-tab 断言（`worldBookQuickImport.test.js`）与头部几何参照都会被打断——是否把阅读面纳入分区体系归 W4 与旧入口退役一并裁。验证：`settings-header-check.mjs` 参照面 4→5 并新增「文档页 0 个选中 tab」分支，隔离实拍工装扩到 **37 PASS / 0 FAIL**（含点「知识」带 bookId 落 `/settings/knowledge`、点正文落 `/authoring`、换头后仍按本书绑定读回正文），详见 §5.1 的 W2-D 口径。

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
- **进度（2026-10-10 追加：kit R2.2 本书 RAG 双根接线）**：上面第 1、2 项在 W1-A／W2-A-1 交付的是「只查全局」轨。kit 今日新增 `kb_search`／`kb_read` 的可选 `project` 形参——全局根 `repoRoot/kit/hypergraph.rag.json`（语料 `repoRoot/knowledge`）与 `projects/<id>/kit/hypergraph.rag.json` 双根合并，各根自取 top-k、按卡 id 或 normRef 去重（保留项目侧）、同分项目优先，命中带 `source: global|project`，`total = 全局 + 项目 − 重复`；**项目档缺失＝只查全局（fail-open，与历史逐字一致，只多一个 `source` 字段）**。Pinax 侧适配已实施（**已实施 + 三层实测绿，未 commit**）：`server/routes/knowledge.js:90-102` 的 `kbProjectArg` 把 `projectId → args.project`（只读面不挂 `location`，形状非法 400 `INVALID_PROJECT_ID`，未绑定则不传）、`knowledgeSearchClient.js:95` 按 `bookId → 注册表 projectId` 解析并把生效的 `project` 回传给调用方、`KnowledgeMethodPanel.vue` 新增来源说明条（`:107 scopeNote`）＋命中/卡头「本书」徽标＋按 `source` 分流读卡引用（`:135 readRefOf`）。证据：`%LOCALAPPDATA%\pinax-probe\kb-dualroot-check.mjs` **28 PASS / 0 FAIL / exit 0**（[A] 真 kit 内核隔离 `--root` fixture ＋ 真协议面、[B] 真 Pinax `server/index.js` ＋ 临时注册表、[C] vite ＋ Playwright 三层），`scripts/knowledge-proxy-smoke.mjs` 扩 6 断言后全绿，6 张实拍 [docs/screenshots/kb-dualroot-20261010](../screenshots/kb-dualroot-20261010/zh-01-dualroot-hits-1440.png)。**生产栈现状（2026-10-11 已复验，原「8431 旧构建」障碍解除）**：此前用户活栈 8431 是旧构建、会静默忽略 `project`，真书检索停在「本书档没参与」；10-11 按杀树重启＋编译本书档后已在真栈真数据上验到双根生效（下一小条）。重算触发权归属见 §5-9。实拍期间的工装口径记在 §5.1 末块。
  - **进度（2026-10-11 追加：生产栈复验，用户指令「你启动复测一下，我看下rag效果」）**：**已实施＋真栈真书实测绿，未 commit**。动作四件——① 重启（先抓 `GET 8451/model` 掩码快照 `dots3-note-prev`／`ak_T****JHKv`，先杀 kit 两树再杀 3001，kit 走仓内 `scripts/ops/kit-core.vbs`／`kit-web.vbs`＝`kit-guard` 看护的规范路径，Pinax 走 `boot-server.ps1`；**kit 是 tsx 源码直跑，重启即吃当日提交、无 build 步**）；② 编译本书档 `D:\python312\python.exe tools/kit-compile.py --project proj_muxulht3n90m` → `Documents\Pinax\时空崩毁，我为司辰\kit\hypergraph.rag.json`，**40 词条／152 边**（同时作废「本机 python 不可用」的旧判据）；③ 挂 junction 前置实测（新书要先打一次 `worldbook-search`；《雾海航志》缺 `世界书/graph.json` → `worldbook_search` 404 `NO_WORLDBOOK`，与本书 RAG 档是两个工件）；④ **真数据打掉一条假文案**：kit 返回不区分「项目档不存在」与「档在而本轮零匹配」，所以提示不能断言「本书档没有参与」，已改为并列两种可能（`KnowledgeMethodPanel.vue:109`），并补零命中空态提示（`:51`，未编译的书查本书专名不再只显示「无命中」）。证据：`rag-live-dualroot.mjs` ALL PASS ＋ `rag-live-shots.mjs` **14 断言 ALL PASS**，实拍 5 张 [docs/screenshots/kb-dualroot-live-20261011](../screenshots/kb-dualroot-live-20261011/live-01-mixed-hits-1440.png)（「伏笔」8 张命中含 3 张本书／「谛听」8 张全本书、点开读回 1087 字／全局命中而本书零匹配的诚实提示／未编译书空态提示／EN 面）；英文覆盖走 5173 dev 轨（dist 生产构建不打缺键告警，那里取证是空的）。改文案后 `npm run verify:full` exit 0。

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
- **进度（2026-10-10）**：第 1、2 项由 W2-A-1 交付；第 3 项（图谱升级）由 **W2-A-2a** 交付——`GraphCanvas.vue` 加 `highlightIds`（kit 命中 4px 主色单环 + 常显标签）、`visibleIds`（三轴过滤=原位隐藏、不重排）、`cat` 双向写回父级单一状态与 `select/create-edge/update:cat` 事件，`UnifiedEntryBrowser.vue` 补档位 chip 组与过滤交集空态覆盖层，过滤轴走 `entryBrowserModel.filterEntries` 委托注入引擎的 `entryTierOf`，检索/图谱两轨共用一个过滤对象；第 4 项（`WorldBookEditor` 7 tab 收编）未动；**「设定」独立页签折进控制台 = W2-A-2b 已于 2026-10-10 交付**（用户回「继续」）：分区导航从 4 tab 收为 3（资料/地图/知识），`settings-structured` 路由名保留但改为 named redirect 到 `settings-knowledge?view=settings`，体验区旧路径 `/experience/settings/structured` 经一跳链式重定向同样落位；地图地点条、资料页「回到设定」、快速导入页与世界书创建工作区的返回路由四处入口全部改指控制台设定视图，`placeId`/`worldbookId`/`bookId` 上下文一路带过去；设定视图仍复用 `StructuredSettingsWorkspace`（零第二套实现），编辑写链不变，旧独立页 `src/pages/StructuredSettings.vue`（346 行页壳）随之整页删除。旧 4-tab 断言与 header 几何参照按预告同步纠正，实拍 26 项全绿，详见 STATUS 同日月行与 [实拍目录](../screenshots/w2b-settings-fold-20261010/result.txt)。

### 3.4 W3-A 多维表格视图（M）

- **目标**：条目的「多维表格」面——行=词条、列=profile 字段（七模板），支持分组/透视的横纵归并。
- **交付**：表格视图组件（虚拟滚动或分页防大条目集）；列定义来自卡片 profile 模板；分组（按分类/标签/档位）与横向对比（多词条并排）；单元格编辑 → 复用文件写链回写 md frontmatter（`worldStore`/`worldbookFileRepository`）；编辑即时保存 + 失败回落提示。
- **前置**：§5-5 必须给出「第一张表」的真实场景，列与归并维度按场景裁剪。
- **出口验收**：场景旅程 E2E；写回后 graph.json/卡片文件一致（复用既有 server-rw 冒烟断言）；无 localStorage 新源。
- **进度（2026-10-10，W3-A 已交付，用户回「是的」）**：§5-5 已批（场景口径「参考飞书多维表格：既是数据库，也是表单，能实时改，也有可视化基础」），第一张表＝**人物表**。交付 `src/components/knowledge/EntryDataTable.vue`（883 行界面）＋ `src/services/worldbook/entryTableColumns.js`（146 行纯逻辑，node 冒烟第 6 段直跑）＋ `KnowledgeConsolePage.vue:81/:179` 第 4 视图 `?view=table`。**与设想的两处偏离要如实记**：① 原写「单元格编辑→复用文件写链回写 md frontmatter（`worldStore`/`worldbookFileRepository`）」，实际只调 `worldStore.updateEntry/addEntry`——世界书文件双写与回滚本来就在那条 durable 写链里，表格直接摸 `worldbookFileRepository` 会造出第二条写路径；② 原写「虚拟滚动或分页防大条目集」，v1 未做（人物条目量级下不成立，改由「列可开关＋分组」控制视区宽度），大书库手感若成问题再补。出口验收三条实拍取证：场景旅程（改格→裁决→沿用→切策略→记录表单）50 断言全绿、写回后 `content`/`profile.values` 一致性与差异标记断言覆盖、**「一整轮编辑后 `localStorage` 键集合与开场一致」**（无新源）。**当时未做、同日由 W3-A-2 全部结清（见下一行进度）**：跨视图共享过滤状态（表格／词条墙／图谱三视图各持一份 `cat/status/tier`）、删行、自定义列与全词条混排（v1 只 `isCharacterEntry`）、伏笔台账第二张表、列面板外部点击关闭。详见 STATUS 同日月行与 [实拍目录](../screenshots/w3a-data-table-20261010/zh-01-table-default-1440.png)。

- **进度（2026-10-10，W3-A-2 五项收口已实施，等用户看效果裁定）**：用户口径原话「你把这几个先做完了我看到效果了再裁定，现在啥也没有你给我描述，我怎么裁定？」——上一行「未做且需另裁」的五项因此全部落地，不再以文字提案过闸。**① 三视图共享过滤**：过滤真相收归控制台一份（`KnowledgeConsolePage.vue:221` 的 `reactive({cat,status,tier})`），词条墙改为**可选宿主注入**（`UnifiedEntryBrowser.vue:187-197`：给 `filters` prop 就 emit 回宿主，不给就用自己的 `localFilters`——编辑台那种独立挂载点行为与从前逐字相同），表格回显条 `[data-test="edt-shared-filter"]`（`EntryDataTable.vue:46`）说「跟随浏览视图的过滤：草稿」并给一键清除；换世界书时宿主重置三轴（别的书的 `cat` 残留会把表打成空）。**② 删行**：行内两步确认（`armDelete:591`/`confirmDelete:601`，无原生对话框——本机用户看不到 GUI 弹窗），写只走既有 `worldStore.deleteEntry` 唯一接缝；出口验收做到**磁盘级**：删「王城」后 localStorage 6→5、世界书目录 11→10 个文件、全部 md 与 `graph.json` 再无该节点（无孤儿）、词条墙同步 5 张卡。**③ 自定义列＋全词条混排**：表种切换条 `:84`（人物表／全部词条／伏笔台账），`tableEntries(worldbook,'all')`（`entryTableColumns.js:53`）把非人物条目也摆进表，`mixedFieldColumns:117` 在七模板字段并集之外**从正文【标签】自发现列**（「来历」「一句话标签」这样只有正文的字段成为可勾列，勾了才占宽）；机器台账条目（`isMachineLedgerEntry:34`：章账／伏笔台账／底牌）**不进混排表**，作者在表里删不到结算链真相。未建档的**非人物**行改格走 `setLabeledBlock`（`EntryDataTable.vue:480`）——正文里那一【标签】块原位改写、别的块零改动、**不擅自建 profile**（表格不替作者猜模板）；未建档的**人物**行仍然拒改（沿用 W3-A 口径）。**④ 伏笔台账第二张表**：新组件 `ForeshadowLedgerTable.vue`（435 行），行不是世界书条目而是**结算链已有那条台账条目正文里的 markdown 表格行**，解析／upsert／删行全部复用 `settlementService` 的 `parseForeshadowLedger:352`/`updateForeshadowLedger`/`removeForeshadowLedgerRow:374`，写只改那一条的 `content`；fid 是主键故表内只读（改编号＝删旧行＋加新行，会丢回收历史），重复 fid 显式拦截（`:213`）而不是静默覆盖。**⑤ 面板外部关闭**：字段列面板补 `pointerdown`（capture 阶段，忽略 `.edt-columns-wrap` 自身）＋ `Escape`（编辑格子时不抢键）两个收起路径（`:380/:386`）。**验证**：`%LOCALAPPDATA%\pinax-probe\w3a2-table-closeout-check.mjs`（隔离 dev 5349＋server 3959、临时注册表＋临时镜像根、`PINAX_STORYAGENT_ENABLED=0`，3001 未碰）**44 PASS / 0 FAIL / exit 0**，pageerror 0、缺键告警 0，10 张实拍逐张看过（`docs/screenshots/w3a2-table-closeout-20261010/`）；`npm run verify:full` **exit 0**（20/200 顶格不破、Authoring chunk 1,442,206 同值——全在 lazy chunk）、worldbook 冒烟族全绿（browser 7 段 196 断言、settlement 109、file-contract 31、editing 76、relations 22、localization 67、server-rw、dualwrite、write-merge）、W2-A 控制台探针复跑十项全绿。**看效果时要知道的三条边界**：a) 共享的只有分类/状态/档位三轴，词条墙的**检索关键词框不共享**（kit 检索是词条墙专有能力，表格无检索面）；b) 混排表工具条的「添加人物」仍创建 character 条目（`addCharacter:558`），在「全部词条」表种下这个词要不要改成「添加条目」属手感裁定；c) 台账表没有分页／虚拟滚动，行数量级同人物表（v1 判据不变）。

- **进度（2026-10-10，W3-A-3 控件一致性收口已实施，与 W3-A-2 等同一次视觉裁定）**：用户看完五件效果后的意见原话「这里面，图标的配色，以及下拉框的 UI，一致性再提升一下」。**根因不是某个控件写错，而是类名定义的归属**：`.text-input / .select-input / .ghost-btn / .primary-btn / .danger-btn` 只在 `WorldBookEditor.vue` 的 `<style scoped>` 里定义过（样式块 `:2745`，字段基线 `:3743-3756`，无边框覆盖 `:4283-4292`，全文件零 `:deep(`），出了编辑台就没有规则命中，于是表格面同时并存「原生 select 箭头／系统蓝勾选框／原生搜索装饰／无框原生按钮」和同页只读浏览视图早就在用的「8px 圆角／`--border`／主色聚焦」两套长相。**修法选择是补一层命名空间共享样式，而不是把编辑台的 scoped 改成全局**：新 `src/components/knowledge/KnowledgeTableControls.css`（unscoped，每条规则都钉在 `.knowledge-tables` 根类下）只由控制台三处挂载（`EntryDataTable.vue` 根 `<section>`、teleport 的记录浮层 `.edt-record`、`ForeshadowLedgerTable.vue` 根），编辑台里那套无边框 `EntryProfileEditor` 字段零改动；import 先例是仓库既有的 `AuthoringCatalogWorkbench.css`。**本轮立下的两档控件语言（后续界面照此判）**：工具条上的控件**有框**（它们是控件），行内下拉与格子按钮**平时静默无框、hover／focus 才出框**（它们是数据行的格子，不该抢表格的横向节奏）；箭头一律 `appearance:none` ＋主题指示器 `--control-select-indicator`，勾选框 `accent-color: var(--accent)`，原生 `search` 清除装饰抑制，危险动作 hover 仍保持 danger 色不洗淡，粗指针设备格子命中高抬到 40px。**顺带查实的 token 事实（别再写死）**：`--text-tertiary` 在任何主题里都不存在（台账三处引用是死变量，已改 `--text-muted`）；`--success/--warning/--danger` 定义在 `main.css:140-142` 的 `:root`，故 `#b3261e`／`#b8860b` 一类 hex 兜底是死代码（已删）；`--control-select-indicator` 只在 `legacy.css:7`／`:698` 的 `:root.theme-legacy` 下，可用性靠 `index.html:2` 硬编码＋`themeStore.js:79` 再挂，另加 `forced-colors` 退回原生箭头。**「图标配色」这一项要说清缺口在哪**：`WorkbenchIcon.vue` 是 lucide ＋ `stroke="currentColor"`，视图 tab 图标本来就吃文字色；实际不协调的是**控件指示符**（原生箭头、系统蓝勾选、危险按钮 hover 灰化），不是 SVG。**看图才揪出的暗面缺陷**：`--bg-secondary` 在夜间是**下沉色**（#131314 比页面 #1b1c1e 更暗），字段列浮层用它就沉进背景，改 `--surface-workbench-raised` ＋ `--shadow-workbench-float`（`legacy.css:55/67`）后重拍才立起来；另修台账钉住列穿过表头（`.flt-table thead th:first-child{left:0;z-index:3}`）、首列 sticky 双层背景、行分隔线 `--hairline-soft`、多行编辑器与单行输入统一到同一字段基线。**验证**：探针 `w3a2-table-closeout-check.mjs` 从 44 项功能断言扩到 **52 PASS / 0 FAIL / exit 0**（新增 8 项 `getComputedStyle` 取证——量 `appearance/background-image/borderTop/radius/minHeight/accentColor`，＋1 项主题切换），pageerror 0、缺键告警 0；14 张实拍入库 `docs/screenshots/knowledge-table-controls-20261010/`（暗面四张：混排／字段列面板／台账／记录浮层）；`npm run verify:full` **exit 0**（20/20 文件、200/200 用例顶格不破，`lint:delta` 0 新增 error／6 存量 warning，Authoring chunk **1,442,206 B** 与本批前逐字同值，`Authoring.vue` 10,897/120，vitepress 7.50s）。**两条红是探针错、不是产品错**（如实记）：断言找字面 `transparent` 而 Chrome 序列化为 `rgba(0, 0, 0, 0)`；「28px 档」取样取到 `.ghost-btn small`（本就 28px）而非格子按钮（应 30px）。**新增工装口径入 §5.1 清单**。

### 3.5 W3-B 格式注册表 + 第二格式组（M）

- **目标**：阅读器从「写死大纲/剧本」升级为注册制；把分镜脚本（漫画数据）、推演产物（`clickstream.jsonl` 等，见 `kit/docs/设计探索-编剧推演引擎-20260929.md`）等后续格式低成本接进来。
- **交付**：格式注册模块（matcher→parser→renderer 注册表，新格式零改核心）；分镜脚本只读视图（数据源 `ComicPlanPageEditor` 字段结构，`plan.pages/panels` 只读渲染）；文档列表入口打磨（刷新/折叠/最近打开）。
- **出口验收**：注册表冒烟（新增假格式验证扩展点）；分镜只读视图 E2E；文档阅读器回归不破。

### 3.6 W4-A 旧 UI 退役与迁移（M）

- **原设想（2026-10-09 写下，已被实测部分推翻）**：影子共存期结束，旧入口下线、词表切换——`settings-worldbook-advanced` 当影子页退役，`基础设定`/`分组管理`/`条目管理` 旧 tab 代码删除，i18n 词表「世界书」→「知识」全量切换。
- **实测纠正**：`settings-worldbook-advanced` **不是影子页，而是当前唯一的写面真源**（`KnowledgeConsolePage.vue:162` 自己注明条目 CRUD／分组／注入参数／ST 往返／章回结算都留在这里，控制台只读不复制）。要退役的不是这个页面，而是它身上并存的**五个名字**、一份**没有任何运行时引用的 nav 配置**、和一处**文案与动作不一致的返回按钮**。
- **交付（W4-A，2026-10-10，用户回「可以」）**：① 四处同名「编辑台」（`workspaceTabContract.js:56-57`、`workspaceRecentHistory.js:10`、`router/index.js:95`，加旧 EN 键「世界书 · 高级设置」与死键「高级设定」删除）；② `SURFACE_LABELS.docs`→「使用指南」，与项目阅读器的「文档」不再撞名；③ 删除 `src/config/workbenchNav.js`（121 行零引用）及其 2 条测试断言；④ 修 `WorldbookCreationWorkspace.vue:1016` 的 `goBack()` 与按钮文案同源；⑤ 隔离实拍工装 19 断言全绿 + W2-D 探针复跑 37 断言全绿 + 全门禁 exit 0。
- **出口验收**：入口探针（标签名／页面标题／最近使用／回程落点四处一致）；文档构建过；全门禁绿；用户真机过一遍。**尚未做的用户真机验收**：本片证据来自隔离栈实拍，用户的真实书库还没过一遍。
- **W4-B 待裁清单（本片刻意不扩张的部分）**：
  1. 「世界书」旧语汇是否全量切换——`SURFACE_LABELS['settings-worldbook']`＝「设定」、`'settings-worldbook-create'`＝「创建世界书」，以及快速导入页／创建工作区两页是否收进知识控制台（页面本体保留与否属这一档）。
  2. `workspaceTabContract.js:12-14` 的 `settings: 'settings-structured'` 兼容位——留着才能让上一会话的 `project:{book}:settings` 标签恢复；撤它要连 `authoringWorldbookBinding.test.js` 的断言簇一起动。
  3. `DocsPage.vue:204` 的浏览器标题品牌后缀「… - Pinax 文档」——与「使用指南」并存但属不同通道（浏览器标签页 vs 应用内标签条），要不要一并改词需作者手感。
  4. `ActivityBar.vue` 实测零运行时引用（死件），删或留。
  5. ~~`scripts/workspace-consistency-smoke.mjs` 已是存量红~~ —— **已结清（2026-10-10 W4-B-1）**：三处失靶按现状重锚（kicker 改断「在位＋三态合法集合」，`.settings-body` 改按「最近可滚动祖先」断言滚轮意图），并加 `PINAX_SMOKE_BASE_URL`／`PINAX_SMOKE_SHOT_DIR` 让它能在自有端口的隔离栈上跑仓库本体（实测 exit 0、20 张截图，未碰 5173）。证据见 [STATUS 当前安排](../STATUS.md) 与 [已知缺口](../src/known-issues.md)同条。
  6. `i18n/settings-shell.en.json` 之外，`entries: '编辑台'` 与 `'settings-worldbook-advanced': '编辑台'` 是两个 surface key 同一个词——是否合并成一个 surface（`entries` 与全局 `'settings-worldbook-advanced'` 的 dual-mode 归一）。

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
9. **「世界书大改后重算本书 RAG 档」由谁触发**（kit R2.2 双根接线带出的新问，2026-10-10；**2026-10-11 复测后改写——原判据「本机 python 不可用」已被实测推翻**）：本书档 `projects/<id>/kit/hypergraph.rag.json` 是 kit 侧 `tools/kit-compile.py --project <pid>` 的产物，作者改完世界书不会自动重算。三个候选：(a) 保持现状（作者/agent 手动跑，Pinax 只提示）；(b) 方法论面板加一个「重算本书档」按钮，Pinax 经桥 spawn 编译；(c) 桥在世界书写盘成功后自动跑一次。
   （**实测更正**：`tools/kit-compile.py` 在本机跑得通——`D:\python312\python.exe`（3.12.10）与 `uv` 都是真解释器，之前登记的「WindowsApps 占位 exit 49」只适用于 PATH 上那个存根。本轮据此把《时空崩毁，我为司辰》编译成 40 词条／152 边的项目档，双根混合命中已在活栈实拍（详见 §3.2 进度尾注）。所以 (b)(c) 的障碍不再是「python 走不通」，而是**要不要让 Pinax 服务端拉起 kit 仓的进程**这件事本身——(a) 仍是我的建议，但理由换成架构归属而不是环境缺失。另有一条新落点待裁：kit 的 `kb_search` 返回只有 `total` 与 `hits`，**不区分「项目档已挂上但本轮零匹配」与「项目档压根不存在」**，前端提示只能说两种可能（已按此改写文案）；若要把提示做成确定说法，需要 Pinax 端加一个「档存在性／新鲜度」探针（读 `kit/hypergraph.rag.json` 与世界书 md 的 mtime 比对），这是新增面，做不做请一并裁。）

### 5.1 批复账（逐条状态，实测口径）

用户 2026-10-10 只回「12可做」，即 §5-1、§5-2 按建议批准；其余条目按下表分别归入「已由已发代码消解」「仍待裁」两类。这一层区分是实测出来的，不是推断：W1-A 已合入的检索面已经把 §5-3/§5-4/§5-7 的实际内容定死了，再向用户提同一问就是重复裁定。

| 条 | 状态 | 依据 |
|---|---|---|
| §5-1 命名与入口 | **已批**（改「知识」）；命名账由 W4-A 部分结清 | W2-A-1 已落地：`SettingsSectionNav.vue` 「条目」→「知识」并指向 `settings-knowledge`；W4-A 结清「同一页面多个名字」——编辑台四处同名、使用指南撤「文档」重名、删死 nav 配置；`settings-worldbook-advanced` 实测**是写面真源不是影子页**，页面保留；「世界书」旧语汇全量切换仍待裁（§3.6 W4-B 第 1 项） |
| §5-2 设定页归并 | **已批并已落地**（预设过滤视图 + 页签折叠） | W2-A-1 交付控制台内 `?view=settings` 挂 `StructuredSettingsWorkspace`（页面不消失）；W2-A-2b 交付独立「设定」页签折叠：分区导航 4→3 tab，旧路由改 named redirect，`PlaceCatalog` 等设定件原位复用 |
| §5-3 剧本渲染深度 | 已被 shipped 代码消解（轻样式先行） | W1-B 文档阅读器 v1 已按 md 渲染 + 行级轻识别合入主干，无待裁内容 |
| §5-4 文档阅读面入口 | 已被 shipped 代码消解（独立文档页），归属账已由 W2-C 结清、入口形态账已由 W2-D 结清 | 入口位置本身不是裁定点：`settings-documents` 独立页由 W1-B 交付；「文档页无工作台 tab ＋ 无绑定时静默读注册表第一项」经用户 2026-10-10 回「做」批准修复，见下方条目；同日回「可以」批准 W2-D 给该页接共享工作区头（书身份＋资料/地图/知识跨面入口＋正文/助手回程），未加成第 4 个分区 tab |
| §5-7 检索面单源 | 已被 shipped 代码消解（显式失败、本地轨已无） | W1-A 的 `server/routes/knowledge.js` 与 `knowledgeSearchClient.js` 为唯一检索轨，8431 不可达返回 `KIT_PROTOCOL_PLANE_UNAVAILABLE`；`entryBrowserModel.js` 本地打分轨在 W1-A 接线时已不在检索链上，无需二选一 |
| §5-5 多维表格第一张表 | **已批并已落地（W3-A，2026-10-10）；第二张表与四项收口已实施、控件一致性亦已收口（W3-A-2／W3-A-3，同日），三片等同一次视觉裁定** | 用户给的场景口径原话：「参考飞书多维表格的设计，既是数据库，也是表单，能实时改，也有可视化基础」，随后回「是的」批准三项建议——**表级一次确认**（覆盖正文／只存字段，裁决一次后沿用、策略条可改）、**第一张表＝人物表**（七模板字段并集）、**落点＝知识控制台第 4 视图 `?view=table`**；写面只走 `worldStore.updateEntry/addEntry`，表单复用 `EntryProfileEditor`，出口验收「无 localStorage 新源」实拍取证。第二张表（伏笔台账）、删行、跨视图共享过滤状态、全词条混排、面板外部关闭五项**已由 W3-A-2 实施完毕**（用户口径「先做完了我看到效果了再裁定」），证据见 §3.4 尾注；用户看后追加的意见「图标的配色，以及下拉框的 UI，一致性再提升一下」已由 **W3-A-3** 收口（根因＝类名只在一个页面的 scoped 样式里定义，修法＝命名空间共享控件层 ＋ 工具条有框／行内静默两档，见 §3.4 末注与 §5.1 第 8–11 条）；**用户的视觉裁定仍未回，两片均未 commit** |
| §5-6 图谱形态先后 | **仍待裁**（正式裁定未回） | W2-A-2a 已按波次顺序交付应用内升级（见 §3.3 进度）；导出独立 HTML 快照仍在观察位，若裁定改为「快照优先」需另立一片。 |
| §5-8 三面监督归属 | **仍待裁**（与 kit-microservice-forms M2/M3/M5 合并） | 未开工 |
| §5-9 本书 RAG 档重算触发权 | **仍待裁**（2026-10-11 复测改写判据） | 接线侧已交付：前端按 kit 返回的 `source` 如实说明，**不代跑、不做按钮**（`KnowledgeMethodPanel.vue:107`）。**原判据「本机 python 为 WindowsApps 占位不可用」经实测作废**：`D:\python312\python.exe`（3.12.10）与 `uv` 都是可用解释器，本轮已用 `tools/kit-compile.py --project proj_muxulht3n90m` 编译出 40 词条／152 边的本书档并在活栈上验到双根混合命中（证据见 §3.2 进度尾注与 `docs/screenshots/kb-dualroot-live-20261011/`）。(b)(c) 的剩余障碍是「Pinax 服务端是否该拉起 kit 仓进程」的归属问题，不是环境缺失；建议仍为 (a) 手动。附带新落点（是否加「档存在性／新鲜度」探针把提示做成确定说法）一并待裁。 |

**实测新发现 → 已修复（W2-C，2026-10-10，用户回「做」）**：`settings-documents` 路由原先只出现在 `src/components/workbench/WorkspaceProjectNavigation.vue:39`，未注册进 `src/services/workspace/workspaceTabContract.js`，因此文档页不产生工作台 tab——与用户 2026-10-09 指出的「文档页项目归属混乱」同族。现两处一并结清：`workspaceTabContract.js:21/:54` 把 `documents` 注册为 project surface（图标 `WorkspaceTabs.vue:27`、最近面 `workspaceRecentHistory.js:10`），`DocumentReader.vue:313-321` 由「无绑定就静默读注册表第一项」改为「按 `props.bookId` 匹配注册表，未命中写显式提示（`:317`／`[data-test="doc-unbound-project"]`）且不加载任何项目」。留下的口径是**标签身份跟书走、内容跟绑定走**：未绑书照样有自己的「文档 · 书名」标签，只是内容是空态；手选项目下拉仍是可用逃生口。缺书上下文（直接敲 URL）时只在唯一候选下自动选。

**W2-A-2a 实拍期间的实测口径（后续验证工装必须遵守）**：
1. **档位派生只有一条线**：`worldbookContextBuilder.js:36` `KIND_TIER_MAP` 只有 `rule→core`，`character/location/organization→support`，`style/lore/event/source→background`；显式 `entry.tier` 优先。图谱档位过滤断言必须按这张表算，按「kind 直觉」猜数（例如以为 character 是核心）会误判实现有 bug。
2. **绑项目书稿的世界书从磁盘读，不从 localStorage 读**：`worldStore.loadWorldbook` → `resolveWorldbookLoadSource` 的文件真源优先（W2·A3）意味着向 localStorage 灌词条对已绑项目书稿的图谱零效果。 Playwright 工装必须双轨：过滤/空态用**未绑项目**的书（纯 localStorage 轨），kit 检索命中高亮用**已绑项目**的 fixture 书（磁盘轨）；且注册表只登记 fixture 书，避免合成数据落到用户真实项目目录。
3. **预算告警**：W2-A-2b 后 Authoring chunk **1,442,206 / 1,450,000 B（余 ~7.6 KB）**、`Authoring.vue` **10,897 / 10,900 行（余 3 行）**。W3 若继续加界面层代码，需先规划把逻辑沉到 `src/services/worldbook/` 或拆组件，否则会撞 `architecture:build-size` / `architecture:check` 两道闸。

**W2-A-2b 实拍期间的实测口径（后续验证工装必须遵守）**：
1. **无 bookId 的项目面会被自动补书**：`src/services/workspace/workspaceRouteAdapter.js:107` 的 canonical 化（`resolveDefaultBookId`）会把 `/settings/sources` 这类无 query 的项目面 replace 成 `?bookId=<最近书>`。因此「资料页空态（请先打开一本书 / 回到设定）」**只在书库为空时存在**；工装要验空态必须开一个不注入种子的全新 browser context，不能在同一页面里 goto 后干等。
2. **`create?mode=sources` 是旧入口，会被路由吞掉**：`src/router/index.js:77` 的 `beforeEnter` 把 `settings-worldbook-create` + `mode=sources` + `bookId` 重定向到 `settings-sources?bookId=…`（只有再带 `action=add` 才补 `import=add` 打开导入浮窗）。所以知识控制台未绑书空态的「添加资料」按钮**落点是资料一级页**，不是创建工作区——断言写 create 会假红。
3. **5173 实测是 vite dev 在服务**（响应里带 `@vite/client`），其 `/api` 代理默认指向 3001（用户真实栈与真实镜像根）；该端口归属见 known-issues 里「5173 属于另一 worktree」一条，但无论归属如何，**写操作型探针都不得挂 5173**——隔离工装一律自带端口 + 临时 `PINAX_APP_DATA` 注册表 + 临时 `PINAX_MIRROR_ROOT`（本轮 3946/5336）。附带一条：`tr()` 的缺键告警只在 DEV 构建出现（`src/i18n/index.js:45` 的 `import.meta.env?.DEV`），所以查缺词必须起 dev，跑 prod build 只会得到假绿。
4. **本轮量到的存量红（未修，待裁/待 W4）**：`LocalizationCenter.vue` 30 个 `tr()` 字面量 + 「写作、助手、校对和设定生成共用当前模型…」「粘贴文字」「更多选项」3 键在 EN 词典无对应（该面板含清缓存等破坏性动作，未擅自翻译，已在 `english-settings-smoke.mjs` 里登记为已知缺口白名单）；同探针在 ~line 105 之后为红，因「添加资料」已改为站内浮窗而脚本仍按旧跳转找页；`settings-linkage-check.mjs` 的 J1c（工作台 inspector 搜索「没有匹配的设定」）与 J7 删除子步（`[data-test="entry-missing"]`）为 2b 之前的存量红，与本片改动面无交集（两者涉及文件均不在本片写集内）。

**W2-C（文档页归属）实拍期间的实测口径（后续验证工装必须遵守）**：
1. **跨面往返不能用两次 `page.goto`**：整页重载会把刚创建的新标签在落盘前抹掉，得到的是**探针假阴性**而不是产品缺陷（首轮 ⑥ 步即因此红）。真验必须走 SPA 导航：`.shell-tab-navigation` 开抽屉 → `.shell-drawer__body [data-project-surface="…"]` 点面（extra surface 先点 `.workspace-project-nav__more summary` 展开）。附带一条：同一 surface 按钮在 DOM 里会有**两份**——资料页 `SettingsSources.vue:137` 自带侧栏导航，`AppShell.vue:168` 抽屉里还有一份，选择器必须作用域化，否则 Playwright strict mode 直接报 2 elements。
2. **词汇表 fixture 必须写 canonical 扁平形状**：`shared/lexiconFileContract.js` 的读侧只认 `{ format, project, banned:[{word,level,note}], own:[{word,note}], canon:[{term,aliases,ref}] }`；写成 `{ schema, lexicon: { banned:['黑雾'] } }` 这种「看着像」的形状会被容错解析成 0/0/0（契约纪律是损坏→空数组＋warning，绝不抛错）。左栏计数显示 0/0/0 时先怀疑灌的数据，别当读回 bug 报。
3. **预算与本片影响面**：文档页不在 Authoring chunk 内（本批前后同为 **1,442,206 / 1,450,000 B**，余 ~7.6 KB），`Authoring.vue` 仍 10,897 / 10,900 行（余 3 行）。

**W2-D（文档页共享头）实拍期间的实测口径（后续验证工装必须遵守）**：
1. **共享头的 `#actions` 插槽不是自由区**：`scripts/settings-header-check.mjs` 对五个面逐一比对 `.settings-workspace-header` / `.settings-context-bar` / `.settings-section-nav` / `.settings-return-authoring` 的 x/y/height **完全相等**。往头部 `#actions` 里多塞一个元素（哪怕只是个说明文字）就会把 `.settings-context-bar` 的联合盒宽推走，得到假红。页面级标注（如「项目文件 · 只读」）应放在页内，例如 `DocumentReader.vue` 来源栏右端用 `margin-inline: auto 0` 贴齐。
2. **非设定分区的面进参照表要显式声明「不认领 tab」**：`settings-header-check.mjs` 的面元组第三个字段传 `null` 时断言 `.settings-section-tab.active` 计数为 0，而不是找某个 tab 的 `aria-selected`。文档页就是这种情况——它共享头部组件与书身份，但不属于资料/地图/知识任何一个分区。给这类面加第 4 个分区 tab 会同时撞 `worldBookQuickImport.test.js` 的 3-tab 断言与上面第 1 条的几何参照。
3. **暗色截图要显式钉面**：探针循环结束后页面停在**最后一个面**，原来的 `advanced-dark-390.png` 在文档页进表后就悄悄变成文档页的暗色图（文件名与内容不符）。现在暗色段先 `goto` 回目标面再切主题，并另拍 `documents-dark-390.png`；后续加面沿用同一写法。
4. **预算与本片影响面**：`DocumentsPage.vue` 净 −55 行、`DocumentReader.vue` +9 行，都不在 Authoring chunk 内（本批前后同为 **1,442,206 / 1,450,000 B**，余 ~7.6 KB），`Authoring.vue` 仍 10,897 / 10,900 行（余 3 行）。跨面标签与导航证据由隔离实拍覆盖；`workspace-consistency-smoke.mjs` 需挂 5173 且带写路径风险，本片未跑。

**W4-A（命名收口）实拍期间的实测口径（后续验证工装必须遵守）**：
1. **探针的播种只能发生一次**：`addInitScript` 里无条件 `localStorage.clear()` 会在每次 `page.goto` 时把刚写入的 `workspace_tabs_v1` 抹掉，于是「两个标签同屏」「最近打开」这类跨页断言必然假阴性（首轮即红在⑤）。正确写法是加一个 `pinax_probe_seeded` 闸门，只在首个文档加载时播种。
2. **最近使用只记应用内导航的目标页**：`workspaceRouteAdapter.js` 的 `afterEach` 要求 `from?.name` 存在，且 `recordWorkspaceRecentRoute` 会跳过 authoring 与带 object query 的路由——直接敲 URL 进来的那一页**不会**被记账（首次导航的 `from` 是 START_LOCATION）。所以「某面出现在首页最近打开」必须由点外链这类 SPA 导航取证；另外 `workspaceRecentHistory.js:137` 在recent 键缺失时会用 `legacyTabHistory()` 从已落盘标签反推，容易把「只有一个旧标签」误读成「只记了一条」。
3. **`workspaceTabContract` 的标签文案在两个通道上不等价**：项目标签走 `WorkspaceTabs.vue:82` 的 `${tr(label)} · ${书名}`（**标签名在前**，EN 面得 `Editor · 雾港来信`），而浏览器标题走 `App.vue:26` 的 route meta；`DocsPage.vue:204` 又自设 `… - Pinax 文档` 品牌后缀，覆盖 meta。断言页面命名时要分清这三处，别把 meta 断言写死成「浏览器标题必须等于 surface 标签」。
4. **`workspace-consistency-smoke.mjs` 不可作为门禁证据（存量红）**：它硬编码 5173，且 `:21` 的 kicker「关联资料」、`:59` 的 `.settings-body` 都还锚在 W2-A-2b 之前的独立设定页；用一次性端口副本（只换 base、断言原样）实测为「实得『当前作品』」＋「等 `.settings-body` 超时」。本片只把其中 3 处 docs 标签断言（`:105/:110/:119`）改到新词，**重锚另立一片**（§3.6 W4-B 第 5 项）。
5. **删文件前先验可恢复性并查 import**：`src/config/workbenchNav.js` 的删除依据是全仓 grep 零运行时 import ＋ `git cat-file -e HEAD:src/config/workbenchNav.js`（blob 在 HEAD 可取）；它在 `git rm` 下会被拒（本波未提交的编辑算 local modification），`rm` 后 git 显示 ` D`，语义与删除一致。
6. **命名类实拍要用未绑书**：注册表一旦把书绑到项目，世界书从磁盘读（W2-A-2a 口径），编辑台会停在「这本书关联的世界书已不存在」，页面没内容可拍。另：编辑台页面本体在 EN 面有 **2 处既有缺词「总览」「章回结算」**（本片新引入的三个词零缺键），补译属 W4-B 词表切换一并裁，别把它当本片回归。

**W3-A（人物多维表格）实拍期间的实测口径（后续验证工装必须遵守）**：
1. **`tr()` 只有键存在才插值，zh 面是 `key → key` 恒等表**：带参数的中文字面量若没进 `src/i18n/*.en.json` 的并典（现 3,162 键），中文界面会把 `{labels}` 占位符原样打出来（本片「必填未填：{labels}」即中招）。查缺词不能只看 EN 面——**zh 面同样是缺键的后果面**，探针要两语向都跑。
2. **表格的显示口径与编辑台不同，且只在一处**：`entryTableColumns.profileOf`（`:53`）把「已存字段」摆在正文之前，编辑台的 `entryProfileTemplates.profileFromEntry` 是正文优先。原因是表格没有常驻草稿态，按正文优先渲染会让作者改完一格被旧正文顶回去、看着像没保存。写工装时若要断言「格子里显示什么」，必须按表格口径；不一致状态另有 `.is-out-of-sync` 标记，注入真源始终是 `content`。
3. **字段列的渲染序是 `fieldColumns()` 并集序，不是 `DEFAULT_COLUMNS` 序**：默认四列声明为「背景/性格/功能位/当前弧线」，实际表头序是「背景/性格/当前弧线/功能位」，单元格 `data-test` 索引按前者算会拿错格（本片首轮 ⑤ 步即因此假红，代码无错）。
4. **`addInitScript` 只序列化函数体**：Node 侧的常量/闭包变量在页面里全部不存在，fixture（含 `writing_books` 的 `bookId→worldbookId` 绑定）必须经第二个参数 `arg` 注入；且书未绑 `writing_books` 时表格整面不挂载（`?bookId=` 是硬前置）。
5. **双重提交这个缺陷只在真浏览器里现形**：单元格提交 → 编辑器随 `v-if` 卸载 → 卸载过程补发 `blur` → 第二次 `commitEdit` 拿着已清空的草案再写一遍空值。任何「行内编辑＋卸载」的界面都要在提交入口加「当前是否仍在编辑态」的闸（`EntryDataTable.vue:374-386`），并且工装要用「写后读回磁盘条目」而不是「读界面文本」来取证。
6. **`position: sticky` 的钉住基准是滚动容器的 padding box**：容器上的左右内缩会在钉住列的邻侧漏出一条滚动内容，`box-shadow` 外扩在 `border-collapse: collapse` 下盖不住（实测失败）。正解是把水平内缩挪进首/末单元格，容器只留下内缩。验证用 `elementFromPoint` 看绘制顺序，别只看 `getBoundingClientRect().left`。

**W3-A-2／W3-A-3（表格收口五项 ＋ 控件一致性）实拍期间的实测口径（后续验证工装必须遵守）**：
1. **项目根一旦绑定，「世界书」文件夹就是加载真源，空目录读出的是空库**：注册表里给某书登记了 `rootPath` 后，`GET /api/localmirror/worldbook` 对一个**存在但为空**的 `世界书` 目录返 `{ok:true, worldbook:{entries:[]}}`，应用据此把 localStorage 覆盖成 0 条——只有文件面 404 才触发 localStorage 回落＋幂等推送。首轮探针因此拍到「6 张卡变 0 张」：不是回归，是双写契约的加载侧语义。凡**要拍内容**的工装，绑根之前必须先用同源 `POST /api/localmirror/sync {domains:['worldbook'], book, worldbook}` 把 fixture 落盘（顺带就把「契约写→读回不丢条目」这段验了）；只想走 localStorage 轨就干脆别绑根（W4-A 口径 6 是同一件事的另一面）。
2. **磁盘读回的条目 id 与顺序都不等于 fixture**：md 读回时 id 由文件名派生（`沈砚 → c_shen` 这类），行序按文件名/目录排（实测 `["l_city","c_dian","c_shen","s_jieli"]` ≠ fixture 序）。所以选择器一律**先按名字现取 id 映射**（`ids[name]`），行集断言一律**排序后比集合**，比 fixture 序必假红。
3. **`data-test` 挂在按钮上时别再写后代 `button`**：`ForeshadowLedgerTable.vue:70` 的 `:data-test="field.test"` 就在 `<button>` 元素本身，写成 `[data-test="flt-due-cell"] button` 永远等不到（首轮 30s 超时）。同一组件的 `<select data-test="flt-status">` 也是自身带属性——写探针前先 grep 一下属性落在哪层。
4. **表头文本比较别在去空白后再找带空格的词**：`allInnerTexts()` 之后 `.replace(/\s+/g,'')` 得到 `Dueby`，再 `includes('Due by')` 恒假。要么保留原始文本做 `/Due\s*by/i`，要么两侧都去空白。
5. **同一浏览器不同 page 是隔离 context，但共享磁盘真源**：中文面删掉的条目，英文面新开一页就读不到了（W3-A-2 首轮 EN 步等 `[data-entry-id="l_city"]` 超时即此因）。跨语向复用同一 fixture 时，破坏性动作之后的断言要改用仍在场的对象，或把 EN 面放在删除之前跑。
6. **`knowledge-console-check.mjs` 这类老探针不自带栈**：它按 `http://127.0.0.1:5322` 直连，服务不在就 `ERR_CONNECTION_REFUSED`（exit 1，容易被误读成功能红）。复跑办法：临时 `PINAX_APP_DATA`/`PINAX_MIRROR_ROOT` 起一个 `PORT=5322 node server/index.js`（它同时 serve dist），跑完按端口找 PID、先核命令行再 `taskkill //PID <pid> //F`，并确认 3001 的 PID 未变。
7. **i18n 的 computed 标签不在正则可扫面内**：`EntryDataTable.vue:336-338` 这类 `scope === 'all' ? '词条多维表格' : …` 的动态词，`tr\(['"]…` 扫描器抓不到，必须另列 DYNAMIC 清单人工＋探针双向核对（本轮 11 个动态词，两面零缺键；并典现 **3,201 键**）。
8. **控件长相要用 `getComputedStyle` 钉，不能只靠看图**（W3-A-3 起）：量 `appearance / background-image / borderTopWidth+Style+Color / borderTopLeftRadius / minHeight / accentColor` 六项，就能把「同一页面两套控件皮」这种分叉变成可回归的断言。**注意 Chrome 的序列化口径**：源码写 `transparent`，计算样式回 `rgba(0, 0, 0, 0)`；断言按返回值写，别按字面量写（W3-A-3 首轮「行内下拉无框」即因此假红）。
9. **尺寸断言要先确认取样落在哪一档控件上**：本轮的档位是工具条按钮／工具条下拉 **32px**、它们的 `.small` **28px**、行内下拉与格子按钮 **30px**、粗指针设备格子 **40px**。首轮把「28px 档」的量取打在 `[data-test="edt-open-record"]`（`.ghost-btn small`，本就 28px）上却去断言格子按钮，红了是工装错、代码未动。
10. **暗面必须实拍＋逐张看图，计算样式拦不住它**：`--bg-secondary` 在夜间是**下沉色**（#131314 比页面 #1b1c1e 更暗），浮层用它就沉进背景，只有看图才发现（修法＝`--surface-workbench-raised` ＋ `--shadow-workbench-float`）。另：**主题切换要排在 localStorage 键集合断言之后**——点 `button[aria-label="切换夜间模式"]` 会写 `app_theme`，先切再验「写删全程零新增键」必假阴。
11. **类名的归属决定样式的可见性（本轮根因，后续界面照此判）**：一个页面的 `<style scoped>` 里定义的 `.text-input / .ghost-btn` 之类，**换页面就是无规则命中**，界面会静默退回原生长相。要共享就补一层**命名空间共享 CSS**（unscoped，全部规则钉在根类下，如 `KnowledgeTableControls.css` ＋ `.knowledge-tables`），别把 scoped 改全局——那会波及原宿主（本轮编辑台的无边框 `EntryProfileEditor` 字段必须零改动）。teleport 出去的浮层要单独挂同一个类，否则表单又变回裸控件。

**助手重答参数化（Phase 2）＋ 冒烟重锚（W4-B-1）期间的实测口径（后续验证工装必须遵守）**：
1. **「声明了温度」就是路由开关，越界值不能静默丢**：服务端门控是 `useCapability = !hasTemperatureOverride && getCapabilityToolSpec(taskType) && capabilityPlaneAvailable()`（`server/routes/advisor.js:181`），所以一旦带上温度就必然落漏斗直连链。若客户端允许 `5` 这类越界值通过，请求会「锁到直连链」却被下游归一化丢弃——作者拧了一个不生效的旋钮。正解是两层都收：客户端 `normalizeTemperatureOverride` 把非数值/越界归 null，服务端在 `:90-103` 对**显式声明且非法**的值返 typed 400 `AGENT_TEMPERATURE_INVALID` 并**不打内核**（探针按端点命中计数断言零命中）。同理 `0` 是合法温度，判「有没有覆盖」必须用 `!== undefined/null` ＋ `Number.isFinite`，不能用真值判断。
2. **`authoring.knowledge.query` 的请求体必须是合法信封，legacy `context` 走不通**：`validateAgentContextEnvelope`（`shared/agentContextContract.js:174-227`）要求 `version:1`、非空 `surface`、`budget.maxChars/usedChars` 为**整数**且 ≤ 32,000、每个 block 有 `kind/priority/sourceRefs[]`；旧 `context` 字段会被合成成 `kind:'legacy'` 块，而 `authoring-knowledge` profile（`shared/agentContextProfiles.js:16`）只认 `rules/selection/scene/worldbook/outline/history/memory/references`，结果是 `400 AGENT_CONTEXT_INVALID`（**不是产品回归，是工装用错了协议**）。最小可跑信封：一块 `worldbook` ＋ `budget {maxChars:28000, usedChars:120}`。
3. **桩 kit 要同时供三个端点**：能力探测 `GET /model`、任务面 `POST /v1/pinax/tasks`（SSE，`event: task.completed` ＋ `capabilityResult`）、漏斗直连 `POST /v1/pinax/complete`（`{ok, content: <JSON 字符串>, finishReason}`）。**门控归属只能靠端点命中计数取证**——两条链的响应内容可以一样，看返回值分不出走了哪条。
4. **重答必须把被替换的旧答案剔出历史**：`questionWithConversation(question, messages, excludeId)` 不剔的话，旧答案会作为历史摘录把新答案**锚回同一个写法**，参数轴等于白做；同一函数还要跳过与本次问题同文的作者轮，否则重答会把原问题在提示词里打两遍。UI 侧「原地替换」的口径是**提问数 1→1、不新增作者轮**（探针按消息计数断言）。
5. **flex 列 ＋ `overflow:auto` 的面板会切字**：子项被压缩时 `[data-test]` 行的 `clientHeight 16 < lineHeight 20.15`，首行下半截消失；内容 `scrollHeight 645 > max-height 620` 又会让主操作按钮掉到折叠线下。修法是 `> * { flex: none }` ＋ 主体区单独 `overflow-y:auto` ＋ 标题/原问题/操作行常驻。**这类缺陷看图才看得见**，断言要同时量 `clientHeight vs lineHeight` 和按钮 `getBoundingClientRect` 是否落在面板框内。
6. **新面板别混进 Authoring chunk**：`defineAsyncComponent` 之后产物里出现独立的 `AssistantRegenerateDialog-CD495X4O.js`（4,294 B）＋ 同名 css（4,271 B），改样式后 `Authoring-BZE1C3vL.js` 字节**逐字不变**（1,444,055 / 1,450,000，余 ~5.9 KB）——以后判断「改这块会不会挤爆预算」，先 `ls dist/assets` 认 chunk 归属，别按源码位置猜。
7. **重锚存量冒烟脚本：断言要钉意图而不是钉条件值**：`SettingsContextBar.vue` 的 kicker 是「当前作品／关联资料／世界书」三态条件式，钉死任一具体值都会在别的绑定态下假红，正解是 `assert.match(..., /^(当前作品|关联资料|世界书)$/)` 这类「在位＋合法集合」。`.settings-body` 已随控制台改版消失（现仅 `WorldMapPage` 有），滚轮断言改按「最近可滚动祖先的 `scrollTop > 0`」取意图。同时给脚本加 `PINAX_SMOKE_BASE_URL`／`PINAX_SMOKE_SHOT_DIR`，让**仓库本体**能在自有端口的隔离栈上直跑，不再需要制作端口副本（也就不会挂用户的 5173）。

**本书 RAG 双根接线（kit R2.2 `project` 形参）实拍期间的实测口径（后续验证工装必须遵守）**：
1. **协议面 `serve` 不带 `--project` 直接起不来**：`storyflow-kit/storyharness/src/cli.ts` 的 serve 要求项目，否则报「未指定项目：用 `--project` 或在 `<workspace>/.external/storyharness.json` 写 project」并退出。kb 动词并不消费这个默认值——双根的项目侧永远来自请求体 `args.project`——但工装必须传一个才能把面拉起来（首轮 `[A0] 隔离协议面就绪` 红即此因）。
2. **本书卡要用 `hit.file` 读，不能用 `hit.id`**：全局根有 `knowledge/index.json` 的 id→文件映射（kit `kbResolve` 先试 path 再查 index），项目根**没有那份索引**，`kb_read` 的项目回落是 `resolveInProject`＝`projectDir/<ref>.md` 与去掉 `pj/` 前缀再试一次。所以前端读卡引用必须按 `hit.source` 分流（`KnowledgeMethodPanel.vue:135 readRefOf`），拿 id 读项目卡就是「知识卡不存在」——**这条是实拍才揪出的真缺陷，接口层看不出来**。
3. **只读检索面不挂 junction**：`kb_search / kb_read` 只转 `args.project`，**一律不带 `location`**（`server/routes/knowledge.js:90-102` 的 `kbProjectArg` ＋ 文件头纪律注释）。挂 junction 是 `worldbook_search` 的职责，一次搜索不该有写副作用。
4. **「本书档没生效」不是错误态，代理层不能拦**：kit 侧项目档缺失＝只查全局（fail-open，与历史逐字一致、只多一个 `source` 字段），所以代理**不做注册表存在性校验**，改由前端按命中 `source` 如实说明（`KnowledgeMethodPanel.vue:107 scopeNote`）。只有形状非法的 `projectId` 才 400 `INVALID_PROJECT_ID`——**显式故障与合法缺省是两件事，混在一起就会把「还没编译」变成「检索坏了」**。
5. **断言必须带正当前提，否则空数据给假绿**：`Array.isArray(undefined) === false` 这类写法在协议面没起来时会让「命中形状对」的断言直接通过（首轮 `[A3]/[A7]/[B2]` 就是这样假绿的）。工装现在每条都加正向前提（`hits.length > 0`、同一查询带 `project` 必须返回 nonce 卡），并在 kernel/plane 未就绪时 `cleanup(); process.exit(1)` 硬中止。
6. **重算本书 RAG 档是 kit 仓的确定性动作，Pinax 不代跑（2026-10-11 更正环境口径）**：`tools/kit-compile.py --project <pid>` 纯 stdlib，**本机跑得通**——可用解释器是 `D:\python312\python.exe`（3.12.10）与 `uv`；PATH 上那个 `python` 才是 WindowsApps 存根（exit 49）。此前登记的「本机 python 不可用」只适用于存根，已作废，别再拿它当裁定障碍。前端仍然只把命令与 pid 显示给作者、不 spawn 也不放按钮（触发权归属＝本排期 §5-9 待裁）。
7. **fixture 挑「双根去重对象」要挑 id 末段全图唯一的卡**：全局图 30 条截断会把项目侧挤出命中列表，断言就退化成工装噪声。现在按末段稀有度排序取第一，并让 `[A0]` 断言 `rarity === 1`。
8. **「项目档零命中」与「项目档不存在」在 kit 返回里长得一样**：`kb_search` 只回 `{total, hits}`，项目侧缺席和在场但零匹配都表现为「命中全是 `source=global`」。所以提示文案不能断言「本书档没参与」——已改为「要么没有匹配的卡，要么还没编译」两种可能并列（`KnowledgeMethodPanel.vue:109`）。要做成确定说法只能靠 Pinax 侧加档存在性／新鲜度探针，那是新增面，随 §5-9 一并裁。
9. **编译前置是 junction 已挂载**：`kit-compile.py --project <id>` 读的是 `projects/<id>/`，新书没挂 junction 时直接 `[ABORT] 项目目录不存在`。挂载由检索面顺手完成（`worldbook_search` 带 `location`，Pinax 从注册表推导），所以**复测一本没编过书的标准动作是：先经 `/api/knowledge/worldbook-search` 打一次检索，再跑编译**。注意世界书检索还额外要 `世界书/graph.json`（kit `worldbook_index.py` 的产物），缺失时回 404 `NO_WORLDBOOK`——这与 `kit/hypergraph.rag.json`（本书 RAG 档）是两个不同工件，别混为一谈：本轮实测《雾海航志》有 junction 无 graph.json，`worldbook_search` 报 `NO_WORLDBOOK`，而 kb 双根轨不受影响。

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
