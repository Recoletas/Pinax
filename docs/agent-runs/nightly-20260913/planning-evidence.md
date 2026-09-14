# 夜间任务书编制证据

本页记录计划依据，不是夜间实施回执。编制跨2026-09-13/14，源码基线`main@5152aad`。没有执行计划中的产品改动、夜间模型采样、公开仓库或推送。

## 1. 当前开发位置

- 主开发树：`/home/recoletas/jiuguan/pinax-integration-20260906`，`main@5152aad`；编制前工作树干净。
- 当前shell默认`text-game-framework`仍是旧`integration/consolidation-20260823`，其STATUS不能替代新main事实。
- 已核对main STATUS、PLAN、最新LOG、上轮夜间计划、项目协作和视觉工作流。
- 用户已在对话报告上轮剩余验收完成；当前STATUS部分旧记录尚未更新。新夜间O01负责把用户确认与实际机器证据分别登记，不重新运行全部旧计划当新功能。

## 2. StoryForge一手来源

源码固定提交`ecb8a28d68177d8cdb8ba494fec89b4407b333c7`。本轮沿用已核查源码，最新在线状态不作为夜间硬依赖。

| 证据 | 对本轮任务的影响 |
|---|---|
| [WORLD-ENGINE.md](https://github.com/yuanbw2025/storyforge/blob/ecb8a28d68177d8cdb8ba494fec89b4407b333c7/docs/products/WORLD-ENGINE.md) | 运行态和正式世界分离，落实到A的session后果而不是新数据库 |
| [character-interaction/runtime.ts](https://github.com/yuanbw2025/storyforge/blob/ecb8a28d68177d8cdb8ba494fec89b4407b333c7/src/lib/character-interaction/runtime.ts) | 可见性、知识来源和分支前缀，映射A01/A03/A04 |
| [ability-ledger.ts](https://github.com/yuanbw2025/storyforge/blob/ecb8a28d68177d8cdb8ba494fec89b4407b333c7/src/lib/ttrpg/ability-ledger.ts) | 借幂等/条件检查原则，不复制通用TTRPG规则 |
| [CI workflow](https://github.com/yuanbw2025/storyforge/blob/ecb8a28d68177d8cdb8ba494fec89b4407b333c7/.github/workflows/ci.yml) | B统一公共声明与实际门禁，但仅选Pinax必要检查 |
| [CONTRIBUTING](https://github.com/yuanbw2025/storyforge/blob/ecb8a28d68177d8cdb8ba494fec89b4407b333c7/CONTRIBUTING.md) / [SECURITY](https://github.com/yuanbw2025/storyforge/blob/ecb8a28d68177d8cdb8ba494fec89b4407b333c7/SECURITY.md) | 外部贡献入口、合成复现、数据安全边界；Pinax私报渠道需查实际启用状态 |
| [能力基线](https://github.com/yuanbw2025/storyforge/blob/ecb8a28d68177d8cdb8ba494fec89b4407b333c7/docs/roadmap/CAPABILITY-BASELINE.md) / [PR #84](https://github.com/yuanbw2025/storyforge/pull/84) | 诚实区分成熟度，保留Authoring集中形态，不展开多产品顶级导航 |

对话中的两份详细调研原稿保存在本机`/tmp/StoryForge-Pinax-deep-research-20260913.md`、`/tmp/Pinax-open-source-direction-20260913.md`。本页已归纳任务所需依据，执行不依赖/tmp原报告仍存在。原报告临时称“P3后果状态”与仓库P3工具方向冲突，新任务只用A/B/C编号。

## 3. 运行时证据

| 当前源码位置（基线行号） | 直接观察 | 任务 |
|---|---|---|
| `authoringRehearsal.js:5–16` | parser仅返回response/change/choices/evidenceRefs，change最多160字符 | A02 |
| `server/services/advisorTaskService.js:173` | rehearsal结果显式只保留四字段，新增字段会丢失 | A02 |
| `shared/agentCapabilityContract.js:39`、`server/services/openclawService.js:330` | task输入输出及模型JSON格式也有合同 | A02/O01 |
| `authoringRehearsal.js:48–86` | pressure参与者投影、action按姓名匹配；participant已有ref | A01 |
| `authoringScenePressureProjection.js:150–151` | present与planned进入参与者集合；需按实际授权时点复现 | A00/A01 |
| `useAuthoringRehearsal.js` createRoute/advance | 已有稳定route、generation、取消和stale；嵌套新状态不能继续浅拷贝可变对象 | A03/A07 |
| `Authoring.vue:4305`附近转Ghost | route与steps读取跨异步边界；增加后果后应一起冻结来源快照 | A06/C06 |
| `knowledgeReadModel/authoringEvidenceBridge.js` | runtime与timeline不随生产桥输入，不能假定角色知情库已接入 | A04 |
| `memoryCandidates.js`与`Authoring.vue:8555`附近 | 现有队列有确认/失效；UI过滤普通pending，仅enqueue不是闭环 | A11/C13 |

部分条目是代码级风险，夜间先复现，不写成已证实每位用户都会遇到的故障。特别是planned人物：作者明确授权下一段入场的情形必须保留，不能为通过白名单测试统一排除。

## 4. 体验证据

| 当前源码 | 直接观察 | 任务 |
|---|---|---|
| `Authoring.vue:6564–6616` | guide来自query，rehearsal.run出现就dismiss，缺按书owner | C01 |
| `src/views/AuthoringWelcomeView.vue` | 回访仍先hero/new，移动recentBooks排介绍之后 | C02 |
| `AuthoringManuscriptImport.vue` readFile/reparseEncoding | 异步身份保护不完整，重解析覆盖人工标题，编码入口仅warning可见 | C03 |
| `SettingsPopup.vue` storage段 | 先显示localStorage key表，成功文案按“键”计数 | C04 |
| `Authoring.vue:1214`附近恢复区 | 恢复副本主要在历史面板，稿面错误自救入口不足 | C05 |
| `AuthoringRehearsalPanel.vue` error/change/compare | 错误主要为文字，change没有结构后果读模型 | C06 |
| `SettingsPopup.vue` watch/keydown | 声明aria-modal但缺完整Tab containment/焦点回程 | C07 |

已完成项不再重做：首访两入口、常见编码正常导入、首次人物库绑定、备份隔离恢复、离页flush、推演右栏顺序流、路线身份与草稿、对照排自身、设定精确往返及stale。

## 5. 开放工程证据

- README要求Node22≥22.13；CI仍Node20。锁定pdfjs-dist6与Electron42的engines使这一分歧具有实际安装影响。
- ESLint只读运行：499文件，259 errors/265 warnings。两个组件顺序规则各86项，no-undef66项；该结果用于计划分流，不代表需机械修改所有文件。
- `authoringWorldbookBinding.test.js:301`重复import触发parser error；`ProseEssay.vue:1076/1830/1973`未定义createSnapshot须实页复现。
- `THIRD_PARTY_NOTICES.md`、字体OFL已存在；图片/预设文本来源覆盖仍需分类，不能无依据认定侵权或原创。
- `docs/demo`已ignore但仍tracked15张图。文件名范围检查未发现tracked真.env；没有做完整历史内容扫描，因此不能宣称无秘密。
- `src/utils/betaDiagnosticExport.js:59`只导出package版本；公共构建身份不足。
- VitePress的`ignoreDeadLinks:true`要求本轮另查新增本地链接。
- 本轮实际链接检查发现PLAN/LOG/旧current看板已有17处历史链接失效，逐项用`git show HEAD:<file>`确认是基线内容；本轮6份新增文档及索引新增/引入的21个本地链接全部存在。B07/B13接管公共阅读路径修复，不把文档build通过说成全仓链接无误。
- 当前LICENSE是PolyForm Noncommercial；本轮计划保持不变，开源/源码可见用语准确。许可证选择不交给夜间worker自主决定。

## 6. 本轮计划如何避免旧问题

三条独立只读调研分别覆盖runtime、public、UX，主owner综合成30主包+12储备，另有6个调度/集成职责。每包要求真实入口、具体反例、文件owner、产物与结束条件；已有包直接核对，不凑重构。

续接将实际任务返回当调度点，主包后有有用储备；调度工具失败只限制无人值守承诺，不强制整晚停工。中途两次组合，避免早上才由用户找缺字段/入口。

持久记忆、物品、工具与节奏为带前置的拓展，不强行全部进入当夜核心；核心秘密/承诺必须走实际前后端及现有UI，不接受纯离线模块。八小时是窗口，不以sleep、重复测试或模糊工时数字填满。

## 7. 计划自身验证

三线独立复审后，任务书已修正以下执行缺口：dev代理固定3001的参数化前置；三个Gate的fixture生成与身份；CI基准diff/lint范围；阶段检查点提交与失联续接；A/C接口就绪与最终验收的循环依赖；受阻主包可转独立储备；真实作者建立秘密/知情条件的入口；实际token owner；action/response两类后果来源；承诺跨路议题标识；真实样本改指A+C组合服务；逐包工时上下界与截止的取舍。未把这些计划修正写成产品已实现。

编制交付验证写入本轮LOG：本地文档链接、任务编号/范围和`npm run verify:full`。该验证只证明计划文件及当前树门禁，不代表夜间42个worker任务、十四条旅程或真实模型质量已经通过。

实际结果：`verify:full` exit 0，20/20 files、200/200 tests、Vite与VitePress build、diff通过；三个分线各14个连续编号（10主包+4储备）；21个新增/引入本地链接存在。全量检查同时发现17处既有历史断链，已用HEAD原文确认并列为开放准备待处理。构建既有chunk/主题导入警告未在本轮文档任务中修改。
