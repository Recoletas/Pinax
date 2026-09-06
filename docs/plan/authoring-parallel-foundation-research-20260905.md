# Authoring 并行能力建设：调研证据

日期：2026-09-05。性质：代码与计划只读调研；实施方案见[并行计划](./authoring-parallel-foundation-plan-20260905.md)。未启动模型、数据库、开发服务或 worker；不把旧浏览器报告当成本轮实测。

## 1. 基线与证据等级

- 发布基线：本地 `main` 与已同步的 `origin/main` 为 `f03e40f`；本轮没有再次远端 fetch，不代表远端在调研期间不可能变化。
- 当前工作区仍为 `integration/consolidation-20260823@da7eda1`，含已发布但相对旧 HEAD 仍显示未提交的文件，以及发布后继续修改的 Notebook、Authoring CSS、页面接线与旅程脚本。
- 旧分支未跟踪、但 main 已跟踪的文件，在 `git diff main` 中可能看似删除；这些路径在磁盘上仍存在。不能直接用这个 diff 当增量补丁。
- 用户明确表示原 UI/UX 与趣味计划正在执行；STATUS 中“本轮只调研”“C2 尚未整合”等部分文字属于旧回执，不能据此否定正在发生的实现。
- `代码`：本轮读到的实现及限制；`历史`：既有报告；`推论`：由实现导出的风险；`拟议`：尚未实现的方案。性能、模型质量和用户满意度没有本轮新测量。

## 2. 关键证据与影响

| 编号 | 类型 | 证据入口 | 事实及规划含义 |
| --- | --- | --- | --- |
| E01 | 代码 | [Authoring](../../src/pages/Authoring.vue) | 上轮统计约1.5万行，当前继续变化；页面协调保存、现场、推演、双栏、资料、批注等。它是共享热点，不适合两线同时拆改。行数不是性能结论。 |
| E02 | 代码 | [正文仓储](../../src/services/writing/writingBooksRepository.js)、[文档仓储](../../src/services/writing/authoringDocumentRepository.js) | 正文仓储保存整个 writing_books 集合，文档能力也依赖同一书对象；页面 saveBooks 重读探索/大纲数据避免覆盖。底层支线不能另建写库与其竞争。 |
| E03 | 代码 | [只读世界书](../../src/stores/worldStore.js)、[绑定读取](../../src/services/agents/authoring/authoringRunRepositories.js) | readWorldbookSnapshot 明确不切 activeWorldbook、不迁移归档、不落盘；readBoundAuthoringWorldbook 核对书与世界书绑定。已有合适的只读入口，不应通过可写 load 流程构造查询。 |
| E04 | 代码 | [知识门面](../../src/services/project/projectKnowledgeFacade.js) | 按 kind 调 reader 并做 authority 排序；不是现成的实体消歧、双时态或权限引擎。新功能可适配它，不能声称接口存在就已实现全部语义。 |
| E05 | 代码 | [世界书 store](../../src/stores/worldStore.js)、[角色卡](../../src/services/characterCard.js) | 结构化人物 materialize 为独立 entry，部分身份派生涉及姓名/序号，保留 touched 标志与删除 tombstone；运行时人物又有自身 ID。不能靠同名自动认定同一人。 |
| E06 | 代码 | [地点身份 v2](../../src/services/world-map/model/placeIdentity.ts)、[地点目录](../../src/services/worldbookPlaceCatalog.js) | 稳定叙事身份为 worldbookId + worldbookEntryId；地图对象和正文场景出现另有作用域，旧 place 字符串只作 alias。 |
| E07 | 代码 | [旧地点引用](../../src/services/worldHistory/placeRefs.js)、[历史地点聚合](../../src/services/worldHistory/placeEntity.js) | 旧历史仍以 worldbook/map/site 组成地点引用。新旧身份不能靠字符串格式直接等同；需要有证据的引用对照，未映射就返回 unresolved。 |
| E08 | 代码 | [历史生成](../../src/services/worldHistory/historyGenerator.js)、[地理历史管线](../../src/services/worldHistory/geoHistoryPipeline.js) | 已有确定性的地理历史节点生成，不是长期自治历史模拟。保留历史节点草稿/显式写入，避免重列为从零开发。 |
| E09 | 代码 | [事件状态](../../src/services/runtimeEvents.js) | canonicalFacts 仅允许 subjectId/predicate/标量value/status/confidence/sourceRefs 等有限字段；不是双时态事实表。关系合同限于亲属类别，不能直接塞“信任/背叛”等新结构。 |
| E10 | 代码 | [事件上限](../../src/services/runtimeEvents.js) | RUNTIME_EVENT_LIMIT=200，capRuntimeEvents 保留尾部窗口。事件 ts 是记录时间，不能当故事时间；缺旧事件不能重建任意过去状态。 |
| E11 | 代码 | [因果报告](../../src/services/runtimeEventCausality.js)、[涌现调度](../../src/services/worldHistory/emergenceScheduler.js) | 已有分支、回滚、冲突、stale 传播和有界候选。首期应读既有结论，不再实现另一套因果判定，也不把涌现建议当已发生事件。 |
| E12 | 代码 | [工具注册](../../src/services/agents/narrativeToolRegistry.js)、[历史工具](../../src/services/agents/tools/historyLookup.js) | 世界/地理/历史/记忆/政治工具已有；history_lookup 委托共享索引 search/get/trace。工具存在不代表 Authoring 每条路径均获授权。 |
| E13 | 代码 | [manifest 授权](../../src/services/agents/context/manifestToolAuthorization.js)、[Kernel](../../src/services/agents/narrativeKernel.js) | 当前 Authoring 授权仅映射 worldbook-entry 与 memory。来源链、依赖或旧 runtime 不能扩张工具可读范围；历史接入是跨合同集成包，不是注册表加一行。 |
| E14 | 代码 | [资料问答](../../src/services/agents/authoring/authoringKnowledgeQuerySession.js)、[资源索引](../../src/services/agents/narrativeResourceIndex.js) | F2 已把绑定世界书的 geoHistory 转为历史证据，并复用 tokenizer/ranker；问答历史 sourceRef 为 history-node，旧叙事索引采用 history。必须显式映射，不靠改前缀授权。 |
| E15 | 代码 | [依赖失效](../../src/services/agents/context/contextManifestLifecycle.js) | 已有逐依赖 revision 复核。新增事实投影需登记实际依赖，不能因全书任何修改都 stale，也不能漏掉影响查询结果集合的新事实。 |
| E16 | 代码 | [桌面存储适配](../../src/services/storage/storageRepository.js)、[桌面 schema](../../electron/projects/migrations/001-foundation.sql) | 浏览器/桌面 adapter 与 SQLite 文件事务底座已存在，但 Authoring 正文尚未全面迁移。长期历史存储必须与桌面 P3 所有权对齐。 |
| E17 | 代码 | [UI 合同测试](../../src/__tests__/uiControlContract.test.js) | 静态源码断言与组件行为测试并存；拆模块会触碰静态断言。测试通过不证明真实模型因果质量，应补行为/故障证据而非更多字符串检查。 |
| E18 | 历史+代码 | [体验计划第10–11节](./authoring-ux-and-story-play-plan-20260905.md)、[体验调研](./authoring-ux-story-play-research-20260905.md) | A4 方向可改、A5 普通稿局部试写等已有任务归属；新计划只列依赖，不复制成第二组 UI 工作。 |
| E19 | 代码 | [研究 claims](../../src/services/worldbookResearchClaims.js)、[项目记忆](../../src/services/memoryCandidates.js) | 研究资料 claims、项目记忆、运行时 canonicalFacts 有不同证据与状态含义，不能按字段同名混为“正式事实”。 |

## 3. Utopia 候选参考：已核验与不确定

用户尚未给出具体仓库。暂以 `deeplethe/utopia` 作为候选，不认定就是用户所指，不以其为 Pinax 的依赖或实施前置。以下为2026-09-05在线读取的可变 dev 分支；没有运行 Utopia，也未审计其完整运行时。实施借鉴前需锁定参考 SHA，不能把此处当兼容性证明。

- 官方将其定位为企业知识世界模型，双时态记录事实与认知变化；决策推理仍有开发中内容。借鉴时间与来源语义，不推定它已经解决小说历史涌现。[官方说明](https://github.com/deeplethe/utopia/blob/dev/README.zh-CN.md)
- SQL 将实体身份与名称分开，并区分事实有效时间、记录/作废时间和修订关系；无日期的结束不能伪装成精确时间。Pinax 应保留“不知道”的语义，且另需小说纪年与正文叙述位置。[图谱 schema](https://github.com/deeplethe/utopia/blob/dev/migrations/0003_graph.sql)
- 单条交互记忆有独立 pending_facts，避免遗漏过滤把待确认内容读成事实；其批量摄入仍允许乐观入库。Pinax 可以借鉴候选隔离，但不能照搬批量自动确认到作者的正式设定。[候选事实迁移](https://github.com/deeplethe/utopia/blob/dev/migrations/0018_a_fact_awaiting_a_nod.sql)
- 审计台账是独立结构；这不意味着可以把本项目有上限的 runtimeEvents 当永久账本。[审计 schema](https://github.com/deeplethe/utopia/blob/dev/migrations/0007_audit.sql)

## 4. 尚未证明的事项

1. 用户究竟指哪个 Utopia，及希望借鉴的具体体验。
2. 真实作者稿件中旧角色/地点 ID 无歧义映射的比例；本轮没有读取用户创作数据。
3. 历史接入是否改善正文质量、值得新增等待；没有新真实 provider 调用。
4. 全书读写、派生索引、JSON 序列化在长篇和实体设备上的耗时、内存与 quota。
5. 正文、世界书、历史跨存储迁移的端到端恢复能力。
6. 当前 UI 执行 owner 的最新包号与释放时间；必须在实际接入前重新确认，不能据旧 STATUS 排期。

这些缺口分别进入计划的 P0、K2/K4、I2、E0/H0 与接入 Gate，不把未知写成既成事实，也不让全部未知一起阻塞只读支线。
