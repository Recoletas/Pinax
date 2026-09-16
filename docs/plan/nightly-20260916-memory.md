# A 线夜间任务书：历史、证据与记忆账本

> 状态：**计划，尚未执行**。用户于 2026-09-16 要求充分调研后制定夜间任务；本文件不代表数据库已升级，也不代表已创建自动执行任务。
> 集成基线：Pinax `f74545b`；执行时由 O 冻结最终计划提交为实际 base。调度、共享文件、最终验收服从[三线总计划](./nightly-20260916-three-track.md)。

## 1. 交付对象与一句话目标

让作者能可靠回答：“这条记忆从哪里来、我什么时候接受或纠正过它、它在故事的哪个时间成立、为什么这次被模型引用？”

本夜首先交付**可验证、可恢复的事实与历史纵向闭环**，不是一夜重造 Utopia，也不是把所有 localStorage 搬进一个表后宣称完成。

- 必交：正式事实与候选隔离、来源冻结、审核/更正审计、双时间只读查询、作品/会话/分支隔离、旧历史兼容、按书审核入口、完整备份恢复。
- P0 的历史持久化包括一类既有记忆来源的完整闭环；跑团永久回合接线由 O 在 C 回执协议冻结后完成，列组合门禁，不能由 A 越界编辑回合协调器。
- 扩展：永久回合归档、历史检索接线完善、显式角色知情记录、跨标签写冲突、规模性能。
- 后续：全量候选真源迁移、复杂实体消歧/合并回滚、向量历史检索、自动本体增长、桌面 SQLite/云端协作。
- 无论完成多少，早晨展示的是实际已验收切片，未完项逐条保留，不把储备任务改成“已完成”。

## 2. 调研冻结与证据等级

### 2.1 上游版本

- 仓库：[deeplethe/utopia](https://github.com/deeplethe/utopia)。
- 2026-09-16 通过 upstream `ls-remote HEAD` 与独立浅克隆核实 SHA：`60df635d6924127c9a57e98acbd99e43bdd92d08`。
- 本地用户副本 `/home/recoletas/jiuguan/utopia` 当时为 `dbb92981b7f017f141d838f7b35ecb1788ad73d0`，未切换、未拉取、未改动。
- 现有 Pinax 首切来源登记曾固定 `e879b7a1694c9e4eb78d2f048da361fe03905330`。该历史登记仍准确，不应伪改为本轮新版本；新实现另添登记。
- 本次独立研究副本 `/tmp/pinax-utopia-research-20260916` 只是临时证据；执行者以固定 SHA 链接为准，不依赖该目录长期存在。
- 已实际读取 SQL、Rust 写读路径、ADR 与数据库测试源码；**没有运行 Utopia PostgreSQL 测试，也没有实测其部署性能**。

### 2.2 关键源码和采用结论

| 固定版本证据 | 实际观察 | Pinax 决策 |
|---|---|---|
| [0003_graph.sql](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/migrations/0003_graph.sql) | 事实、证据、本体分层；事实有有效时间、记录/作废时间和 supersedes | 借鉴事实版本模型，使用既有实体引用，不复制整套本体数据库 |
| [0018_a_fact_awaiting_a_nod.sql](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/migrations/0018_a_fact_awaiting_a_nod.sql) | pending 独表，遗漏读取时宁可看不到候选也不混入事实；拒绝单独记录 | 新正式事实域独立于 legacy 候选，默认读取只能返回正式事实 |
| [memory.rs](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/crates/utopia-store/src/memory.rs) | 一句记忆先成为来源文档中的 episode/chunk，追加有事务 | “记录一句话”与“认可一句事实”分开；保存证据快照 |
| [pending.rs](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/crates/utopia-store/src/pending.rs) | 审核显示原句；确认不把 confidence 强设为 1；confirm 依赖幂等而非总事务 | Pinax 用 Dexie 同库事务提交事实、证据关联与决定；用户确认单独记 actor/decision |
| [record_axis.rs](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/crates/utopia-store/src/record_axis.rs) | 记录轴谓词集中管理，事实、派生、来源、合并各自有相应生命周期 | 不让每个 UI/tool 各写一遍“当前有效”过滤 |
| [graph.rs](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/crates/utopia-store/src/graph.rs) | 多个读路径传 at 与 as_of；写路径守卫仍查询当前事实 | 回看只读，更正永远记在现在，不能伪装成过去写入 |
| [temporal.rs](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/crates/utopia-store/src/temporal.rs) | 按关系时间语义和唯一性对账；保留不确定冲突；新版本处理乱序到达 | P0 不自动关闭复杂区间；显式更正可完成，自动对账为储备 |
| [0019 ADR](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/docs/decisions/0019-the-second-clock-can-be-rewound.md) | 最新状态已分切片实施记录轴/实体合并/检索，图控件与全文历史仍有边界 | 不沿用旧本地副本“尚未实现”的判断，也不宣称上游全域完美回放 |
| [第二时钟测试](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/crates/utopia-store/tests/the_second_clock_can_be_rewound.rs) | 用真实数据库验证撤回前后可见性 | Pinax 必须真实 IndexedDB 测，不接受内存 Map 替代持久性证据 |
| [晚到属性测试](https://github.com/deeplethe/utopia/blob/60df635d6924127c9a57e98acbd99e43bdd92d08/crates/utopia-store/tests/a_late_value_takes_its_place_in_history.rs) | 乱序插入应形成正确区间，原文显式终点不应随意切掉 | 列为自动区间关闭启用前的硬门禁；没有数据库变量时上游测试可能跳过，不能冒称测试通过 |

### 2.3 必须刻意不照搬的行为

1. Utopia 的 pending 隔离针对交互式记忆，批量摄入允许乐观写入后审阅。Pinax 的 AI 推演、漫画生成和模型抽取**都不能默认提升为作者认可设定**。
2. 上游拒绝去重对实体宾语与字面值有差异，`pending.rs` 明确字面值不走同一拒绝匹配。Pinax 必须将字面值规范化、来源版本和作用域纳入指纹。
3. 上游事实记录轴不等于小说角色知情轴。作者昨天知道与人物在第二章知道是两件事。
4. 上游 UTC 时间模型不能直接代表“庆历三年”“第四纪元”或没有公历的世界；继续使用 Pinax 已有 timeline/era/ordinal 语义。
5. 上游 Rust/PostgreSQL/pgvector 服务不是可直接 import 的 Vue 库。本夜不要求用户安装 Rust、PostgreSQL 或运行新服务。
6. 上游幂等确认不代表浏览器跨 localStorage/IndexedDB 已获得统一事务。凡跨存储必须显式 outbox/补偿。
7. 从可追溯记录推断“完全不会幻觉”是错误承诺；这套工程减少错误污染并使错误可审查。

## 3. Pinax 现状：保留什么、缺少什么

| 当前位置 | 已有能力 | 缺口及处置 |
|---|---|---|
| `src/services/memory/memoryCandidates.js` | 同步候选 single writer，pending/active/stale/rejected | 不一夜改掉所有同步调用者；先维持兼容，禁止它与新正式事实争同一真源 |
| `src/services/memory/memoryHistoryStore.js` | Dexie v1 revisions、稳定版本 ID、恢复队列、不可变同 ID 冲突拒绝 | 新增专属账本 schema 与查询索引，保留 v1 历史原样读写兼容 |
| `src/components/authoring/MemoryHistoryWorkspace.vue` | 当前值/来源/修订查看，恢复旧内容为 pending | 增加正式事实审阅、更正链、查询范围提示；不要恢复左下角全局浮窗 |
| `src/services/project/projectMemoryReader.js` | 按 active 候选召回，排除审计不暴露正文 | O 接正式事实 reader，legacy 与新事实类型显式区分，不能重复喂入 |
| `src/services/project/knowledgeReadModel/` | 只读身份/权限/未知时间/故事时间过滤 | 复用规则；A 只提适配接口，跨域源适配及合同修改 O 单写 |
| `src/services/agents/tools/historyLookup.js` | 受索引约束的 search/get/trace | 不是永久历史库；O 接只读账本快照，不开放任意数据库查询给模型 |
| `src/services/experience/runtimeEvents.js` | 最多 200 条 sidecar 事件，delta 白名单 | 保留热窗口；永久归档另有 owner，不能只把 200 改大 |
| `src/services/experience/experienceTurnCoordinator.js` | 回合快照、分支、失败/取消恢复 | C 保留唯一回合协调器，O 接提交回执/outbox；A 不直接修改 |
| `src/services/storage/workspaceBackupBundle.js` | ZIP v3 包含记忆修订，哈希、补偿和幂等 | O 扩展新域，旧包可导入，新必要域不能被旧客户端静默忽略 |
| `docs/engineering/memory-history.md` | 清楚声明 H0/H1 首切边界 | 实现后更新准确能力，不删除已存在的局限历史 |

当前同一 localStorage 写入携带候选快照与 `_historyPending`，Dexie 成功后清队列；这不是跨标签 CAS，也不是全系统 ACID。
v1 历史迁移基线无法还原首次归档前丢失的版本；UI 和回执必须直说。

## 4. 权威与信息类型：先分清再落表

### 4.1 五类记录不得混用

- `authorPreference`：写作口味、行文要求，不是世界事实。
- `proposal`：来自人或 AI 的建议，尚未成为正式事实。
- `canonicalFact`：作者显式确认的世界/作品事实版本。
- `sessionEvent`：已经提交的会话行动/结果；只在所属会话和分支有效，不默认改写世界书。
- `derivedClaim`：摘要或推断；保留 derivation/sourceVersion，不因检索命中而变成事实。

### 4.2 作用域合同

```text
ScopeRef = {
  bookId: string | null,
  worldbookId: string | null,
  sessionId: string | null,
  branchId: string | null,
  domain: 'author' | 'book' | 'worldbook' | 'session'
}
```

- 书级默认 `bookId` 必填；会话级 `sessionId` 与 `branchId` 必填；世界书独立入口必须显式选择世界书。
- 不能以 `bookId || worldbookId` 合成混合身份。现有个别 runtime 的 projectId 来源不同，迁移必须记录 identityKind，不猜测。
- 两本书共享世界书时，只共享作者明确登记为世界书域的事实；书级剧情、会话事件仍分开。
- 无归属 legacy 记录进入“待归属”，不能自动给当前打开的书认领。
- scopeKey 是规范编码的复合身份，不用可碰撞的裸字符串拼接。
- 展示审计、搜索计数、错误详情也走同一授权过滤，不能先全库搜再仅遮正文。

## 5. 数据模型与事务设计

### 5.1 P0 建议模型（由 A 提交 schema ADR、O 冻结字段）

| 数据集合 | 权威与最小字段 | 索引要求 |
|---|---|---|
| `revisions` | 原 v1 历史，内容和 parentId 保留 | 保留 id/candidateId；补充 scope 索引前迁移先算投影 |
| `evidenceSnapshots` | id、scopeKey、sourceKind、sourceId、sourceRevision、quote、contentHash、recordedAt、tombstoneAt | scope+source、唯一 sourceRevision/hash 组合 |
| `factProposals` | id、scopeKey、subjectRef、predicate、object、evidenceIds、storyInterval、baseRevision、status、origin | scope+status+顺序；指纹用于重复提议匹配 |
| `factVersions` | id、factKey、scopeKey、subjectRef、predicate、object、evidenceIds、validInterval、recordedAt、recordedSeq、invalidatedAt、invalidatedSeq、supersedes、authority | scope+subject，scope+factKey，scope+recordedSeq |
| `factDecisions` | id、commandId、scopeKey、operation、actorKind、actorRef、reason、beforeIds、afterIds、recordedAt、recordedSeq | unique commandId；scope+顺序 |
| `rejectionMarks` | id、scopeKey、normalizedClaimHash、sourceRevision、rejectedAt、decisionId、reopenedBy | scope+fingerprint |
| `ledgerMeta` | schema/迁移状态、作用域单调 sequence、最近迁移检查摘要 | id |

这些是任务合同而不是已存在表。新表放同一个受控 Dexie 数据库版本中，避免本来能一库事务却人为拆库。
唯一业务事实 owner 是 fact repository；UI、模型 tool、备份解析器不能绕过它写事实。
`invalidatedAt/Seq` 只允许通过更正/撤回事务从空转为作废值；正文不可覆盖。若需要撤销更正，追加新版本/决定，而不是删掉历史决定。

### 5.2 更正事务

1. 校验 scope、commandId、expectedHead、用户明确动作和来源可用性。
2. 事务内读取当前 head，版本不符返回 conflict，不最后写入者静默取胜。
3. 分配 scope 内单调 sequence；UTC 墙钟用于展示，排序/边界用 sequence 保证同毫秒可判定。
4. 冻结新证据或引用已存在的不可变证据。
5. 新增新事实版本，supersedes 指向旧版本；设置旧版本作废元数据。
6. 写入决定和 proposal 消费状态；全部在同一个 Dexie transaction 内。
7. 提交后通知 UI 刷新；任一步失败不得显示“已接受”。
8. 同 commandId 同载荷重复请求返回原结果；同 ID 不同载荷返回冲突。

### 5.3 来源身份与失效

- quote 是审核时的冻结片段，sourceRevision 是产生片段的版本；不能点击旧证据却展示最新改写正文而不提示。
- 引文定位保留 chapterId/unitId 或既有 stable source ref，不靠当前行号作为唯一身份。
- 原文修改后旧事实不自动删；显示来源已变化，并要求重新核对才能把 stale 候选接受为新事实。
- 来源删除分两种：普通逻辑删除保留冻结审计证据；用户明确彻底清除敏感数据必须单独预览影响并删除相关敏感副本，不能借 append-only 违背用户删除意图。
- 不把完整 prompt、API key、token、provider 请求头或无关正文放进审计。
- 仅人工直接录入而没有原文的事实，来源类型为 manual-assertion，记作者输入；不能伪造 chapter 引文。

## 6. 双时间查询：必须是两个参数

### 6.1 合同

```text
queryFacts({ scope, subjects, storyAt, recordedAsOf, cursor, limit })
  -> { items, excludedReasonCounts, nextCursor, snapshotVersion, completeness }
```

- `storyAt`：故事世界里的时刻/纪元；复用 `knowledgeReadModel/time.js` 的声明时间轴与未知语义。
- `recordedAsOf`：作者账本截至某次记录/决定的视角；支持精确 seq，墙钟输入解析为该时点最大已记录 seq。
- 两者都不传：当前可用事实，但未知故事有效范围不能被渲染成“永远成立”。
- 记录轴半开区间：`recordedSeq <= cutoff && (invalidatedSeq == null || cutoff < invalidatedSeq)`。
- 不能只查 `invalidatedAt == null` 后再做故事时间筛选，那会丢掉后来被纠正的历史事实。
- `endSemantic: open` 与 `unknown` 不同；未知区间不能据此自动推断人物还活着、关系仍成立。
- 不同 timelineId 不直接比较；没有声明纪元顺序时返回 unknown，不按名称字典序排列。
- 搜索全文暂为当前索引时必须标注“不支持历史全文检索”；不能拿当前命中结果冒充完整历史查询。
- P0 无需第二根炫目时间滑块：高级筛选中“故事时间”和“记录截至”两组明确文字即可。

### 6.2 强制示例

1. 9 月 16 日作者记录：故事第 3 年甲任城主。
2. 9 月 17 日作者补录：第 2 年乙任城主，甲实际从第 4 年开始。
3. 查询“第 3 年，以 9 月 16 日所知”返回旧甲版本。
4. 查询“第 3 年，以 9 月 17 日所知”按作者已确认的修正返回乙或未知，而不是旧甲。
5. 角色丙是否知道此事仍是另外一个权限/知识问题，不能根据第 4 步自动授予。

## 7. 旧数据迁移与模型读取接线

### 7.1 P0 迁移边界

本夜**不切换 legacy memoryCandidates 的同步 API 真源**。它继续持有原有候选/偏好；新事实账本只持有显式迁入的新领域。

- 迁入前预览：记录数、可识别归属、缺来源、重复 ID、损坏条目。
- legacy active 只标“旧版已接受记忆”，不自动生成没有证据的 canonicalFact。
- 用户显式迁为事实时追加决定，保留 legacyCandidateId 与 legacyRevisionId；原候选加迁移映射，避免双召回。
- 原 revisions 与 `_historyPending` 继续可恢复；迁移不能清空旧 localStorage 作为“成功”的判据。
- 对不可识别记录给出隔离清单和原始备份，不默默丢弃。
- 迁移过程崩溃可再次进入；按 migrationId/源 ID 幂等，计数核对。
- Dexie versionchange 被另一标签阻塞时提示关闭旧标签，不自动删库重建。

### 7.2 模型只读投影

O 将 A 的只读 repository 接入既有 projectMemoryReader / knowledgeReadModel / narrativeResourceIndex，避免新增第四套全局召回器。

每条返回包含：事实版本 ID、来源版本、scope、authority、timeMatch、reason；未纳入的内容仅返回低敏原因码。
候选、拒绝、失效、别书、不可见分支不能进入 prompt；作者审核 UI 与模型上下文是不同读权限。
历史查看和恢复不能触发模型调用；历史重放不能触发事实再次采用。
模型返回的引用 ID 必须在本次冻结 manifest 内；字符串看起来像合法 ID 不能绕过来源边界。
限制返回条数/字符预算沿用既有合同；新 reader 不是无限长“全历史提示词”。

## 8. 与 C 线永久回合历史的接缝

### 8.1 回执不是游戏状态真源

C 输出 `TurnReceiptV1`；A 实现 `appendCommittedTurnReceipt` 的幂等存储能力；O 完成 coordinator 接线。
gameStore/会话 repository 仍负责游戏状态，账本是已提交回合的持久审计，不反向驱动游戏执行。

最小回执：scope、receiptId、turnId、parentTurnId、branchId、commandId、规则版本、结构化骰点/结果、状态变更引用、证据引用、committedAt、payloadHash。
不存完整模型凭据，不将未公开 KP 信息暴露到公开回执；权限投影在读取前完成。

### 8.2 跨存储可靠性

- 不能“先 localStorage 存游戏，后随手 fire-and-forget 写 Dexie”就声称永久记录可靠。
- O 将 pending archive receipt 与成功的会话快照放进**原 owner 的同一 durable 写入**，之后排出到账本。
- 回执落盘失败保留 outbox；显示“回合已保存，历史归档待重试”，不是把已发生回合回滚后再掷骰。
- 归档成功但 outbox 清理失败，重复 drain 返回原回执，不二次加奖励/掷骰/调用 provider。
- 取消、失败、重生成支路可有明确类型的技术审计，但不能被当作 committed turn。
- 回退/分支切换不删除账本；当前分支 reader 只读祖先链可见回合。
- 旧 200 条热窗口只能迁为“现存窗口基线”，不能伪造此前丢失事件。
- 如果共享提交点接入无法完成，单线可交，**三线永久历史组合门禁保持未通过**。

## 9. 作者界面：低干扰、可读、可核对

1. 沿用现有设置“记忆与历史”和本书入口，不新增全局悬浮圆点。
2. 默认按书进入，页头展示当前归属和数据库健康，不让作者从全库记录猜书名。
3. 主区是紧凑列表或阅读流；筛选可分“待审核 / 当前事实 / 修订记录”，属于页内视图而非新浏览器标签系统。
4. 一条候选同时显示建议内容、来源原句、人物/关系、来源版本、时间未知提示。
5. 主要操作为“接受为事实”；“修改后接受”“拒绝”次级；动作明确不只靠图标颜色。
6. 长引文可以展开整段，正文随页面滚动；禁止给每条事实都塞一个窄内滚框。
7. 更正页展示旧/新变化与理由，支持取消；无变化不能生成无意义修订。
8. 历史默认只读；“基于此版本建立新候选”明确标注，不叫“还原”以免暗示抹掉后续历史。
9. 证据缺失/来源变更/数据库失败必须可见，并提供下一步，不用统一“未知错误”。
10. 空态区分没有记忆、筛选无结果、作用域未选、数据库不可用；不伪显示“0 条”掩盖失败。
11. 1440/900/390、亮/暗、键盘、200% 文本缩放检查；窄屏把详情转单列，不挤压为三栏。
12. 沿用 `workspace-surfaces.css` 和 WorkbenchIcon，入口/字号/按钮层级与主页统一；用户尚未认可全站视觉，不能因 smoke 通过声称“高级感完成”。

## 10. 可执行工作包

每包必须输出代码/验证/边界；任务 ID 只用于验收，不是要求为每包制造一个 git 提交。

| ID | 优先级 | 实施内容 | 验收产物 |
|---|---|---|---|
| A01 | P0 | 固定 upstream SHA、许可证与现有调用图 | source-map + 复用分类 |
| A02 | P0 | 新旧记忆类型与 scope ADR | 字段表、拒绝示例、不迁移列表 |
| A03 | P0 | Dexie schema 升级及索引 | 旧 v1 浏览器 profile 升级 smoke |
| A04 | P0 | 规范化命令/载荷哈希/幂等键 | 同 ID 同/异载荷结果 |
| A05 | P0 | 冻结证据 repository | 改正文后旧证据仍可核对 |
| A06 | P0 | proposal 与 fact repository 分离 | 默认 facts reader 不见 pending |
| A07 | P0 | 审核事务与 expectedHead | 双标签抢确认只有一个决定 |
| A08 | P0 | 更正/撤回/supersedes | 旧内容未覆盖，撤销不删审计 |
| A09 | P0 | 拒绝指纹与显式重开 | 相同拒绝不刷回，改来源可审阅 |
| A10 | P0 | 集中记录轴谓词 | 撤回前/后/同毫秒 seq 测例 |
| A11 | P0 | 复用故事时间比较 | unknown/open/异纪元断言 |
| A12 | P0 | 分页范围查询 | 多书同名隔离、稳定游标 |
| A13 | P0 | legacy 迁入预览和映射 | 无来源不提权、不双召回 |
| A14 | P0 | UI 审核/更正/历史纵向闭环 | 真实 browser journey + 截图 |
| A15 | P0 | 只读投影输出与 O 联调 | 冻结版本及低敏排除回执 |
| A16 | P0 | 新域导出/校验/补偿接口 | O 的 ZIP 整包失败/重复恢复 |
| A17 | P0 | 容量/异常/升级阻塞处理 | 注入失败不假成功 |
| A18 | P0 | 文档与回执 | 已实现/未实现/真实模型界限 |
| A19 | P1 | 永久 turn ledger + outbox 接口 | 1,000 条回执刷新后不截断 |
| A20 | P1 | O/C 提交点接线协作 | 崩溃重试不重执行 |
| A21 | P1 | 历史 tool 接入与预算 | 超预算截断可见、不读全库 |
| A22 | P1 | 10k 数据性能与分页 | 记录机器/数据规模/耗时 |
| A23 | P1 | 显式角色获得/失去知识事件 | 角色视角不等于作者视角 |
| A24 | P1 | 删除/保留策略预览 | 不误删他书/共享世界书 |
| A25 | P2 | 功能关系冲突队列 | 缺时间只提审，不硬判胜负 |
| A26 | P2 | 乱序状态区间关闭 | 四版本乱序和显式终点测试 |
| A27 | P2 | 实体别名歧义与手工映射 | 同名不同人不会被自动合并 |
| A28 | P2 | 抽取任务去重、版本指纹 | 来源未变不全库重抽 |
| A29 | 后续 | 全量候选迁 Dexie 真源 | 异步 hydration/旧调用者/跨标签迁移专项 |
| A30 | 后续 | 向量历史、合并回滚、SQLite | 独立 ADR/预算，不夹入本夜依赖 |

## 11. 验收矩阵：不能只测 happy path

### 数据与时间

- G-A01：旧 v1 209 条修订升级后内容/parentId/计数不变。
- G-A02：旧恢复队列尚未 drain 时升级，刷新后不重复、不丢版本。
- G-A03：两书同名人物、相同内容、不同 sourceRevision，范围无串库。
- G-A04：两书共用一库，书级私有事实不可互见，显式 worldbook 域可共享。
- G-A05：pending/derived/rejected/stale 不被正式 facts 默认 reader 返回。
- G-A06：同指纹拒绝抑制重复，字面值对象也生效；来源变更允许新审阅而非永久压制。
- G-A07：更正保存后，旧记录时点看旧版本，当前时点看新版本。
- G-A08：同毫秒两次决定靠 seq 正确排序，不依赖随机 UUID 字典序代表先后。
- G-A09：未知开始/未知结束/开放结束/跨 timeline 返回明确语义。
- G-A10：记录时间修改不改变故事有效区间，故事时间修改保留记录轴。
- G-A11：缺失来源不能一键提升 AI 候选；手工断言来源可明确区分。
- G-A12：恢复旧版本创建新 pending，不覆盖后来版本、不自动进入模型。

### 崩溃与事务

- G-A13：事实写入后故障注入，事务回滚证据关联、决定和 head，UI 不显示成功。
- G-A14：两标签同时采用同 proposal，结果幂等或版本冲突，无重复事实。
- G-A15：同 commandId 不同 payload 必须明确拒绝。
- G-A16：IndexedDB 不可用、配额满、upgrade blocked，旧数据仍可备份，不能自动删库。
- G-A17：整包恢复中途失败仅补偿本次新增记录，不 clear 已有账本。
- G-A18：相同包恢复两次不重复；同记录 ID 内容不同整域拒绝并报原因。
- G-A19：未知未来 schema 不猜测降级，保留原包/当前工作区。
- G-A20：连续归档超过热窗口 200 条，持久库完整、当前运行窗口仍受限。
- G-A21：回合已保存而归档失败，刷新后 drain 成功；骰点/奖励/provider 调用计数不变。
- G-A22：分支回退仅改变投影，不删掉另一分支历史、不跨分支召回。

### UI 与召回

- G-A23：入口按书、无全局浮窗，详情长文不困在小内滚框。
- G-A24：sourceRevision 变化可见，点击引文不会不加提示跳成别的文字。
- G-A25：模型只收到冻结 manifest 中的正式事实版本，恶意引用外部 ID 被拒。
- G-A26：排除审计不带隐藏事实正文、标题或敏感计数。
- G-A27：筛选/分页/刷新后 selected record 合法，不因旧异步结果跳回另一本书。
- G-A28：键盘审核、焦点返回、390px 无横向溢出，1440/900/暗色截图实际检查。
- G-A29：角色未获知的事实在角色投影中不存在；没有知情实现时返回 unavailable，不当 omniscient。
- G-A30：全套 `npm run verify:full` exit 0，20 文件/200 用例上限保持；新增场景放显式 smoke/eval 或并入既有用例。

## 12. 文件归属与禁止越界

A 可写：`src/services/memory/` 新账本模块、`MemoryHistoryWorkspace.vue`、专属 `scripts/memory-ledger-*.mjs`、本线回执、记忆架构说明。
A 对 `memoryCandidates.js` 的修改只能做兼容映射/入口，禁止未批准的同步→异步全量破坏式转换。
O 单写：package/lock、共享合同、AppShell/router/WorkspaceTabs、backup、project knowledge adapters、gameStore/coordinator 接线。
C 拥有跑团回合内部工作包；A 若需要接缝，写接口提案和 fixture，不去同文件抢写。
禁止修改用户 LOCAL.md、用户运行中的浏览器数据、当前 Vite 进程、C2 冻结分支。

## 13. 开源复用、依赖与合规

- Dexie 已是依赖，继续使用其 schema/transaction/bulk/query 能力，不重写 IndexedDB 驱动。
- Utopia 为 Apache-2.0；若移植具体表达/代码，保留许可证、相关版权/NOTICE、标注修改，并在 THIRD_PARTY_NOTICES 分类登记，由 O 集中提交。
- SQL/Rust 结构借鉴与实际移植要分列；本次任务书没有把上游业务代码复制进运行时。
- 现有 Pinax time/identity/query、source archive、backup hashing 优先复用，禁止第二套近似相同 helper。
- 不引入 LangChain/LlamaIndex/向量数据库仅为“看起来专业”；新增依赖需证明现有工具缺什么、bundle/许可证/维护成本如何。
- 不把敏感书稿送给新外部服务来验证记忆；默认合成语料与确定性 provider。

## 14. 夜间节奏、降级和后续储备

### 一夜参考节奏（8 小时为建议窗口，不是已启动计时）

- T+0～0:45：A01/A02 与 O 冻结 schema/scope/legacy 边界，先测旧 profile。
- T+0:45～2:30：A03～A08，跑事务与更正纵向 smoke；若 schema 仍不能安全升级，停止扩展。
- T+2:30～4:00：A09～A13、双时间与迁入，O 获得冻结只读接口。
- T+4:00～5:30：A14～A17，真实 UI + ZIP 接线反馈；缺 backup 门禁不能打开默认新写入。
- T+5:30～6:30：修 P0，余裕进入 A19～A22，不为了撑时长盲目开新功能。
- T+6:30～8:00：O 组合/冲突修复/全仓验证/回执。最后 90 分钟不新增 schema。

### 第一储备：历史可用性

永久回合归档、冻结历史 tool、10k 索引分页、错误修复入口、源删除影响预览。
这些依赖 P0 真正稳定后才能开始，不以“写了接口”替代端到端。

### 第二储备：认知与一致性

角色显式知情记录、关系冲突队列、乱序状态区间对账、来源重抽指纹。
自动传播和实体合并撤销风险高，只在测试与预算允许时进行小切片；完整推理引擎另开任务。

### 停止扩展条件

发现旧数据损坏、跨书泄漏、导入不可补偿、正式事实与候选双真源、历史回放触发模型/骰点，立即切回修复；不能靠隐藏入口掩盖数据门禁失败。
若来不及，保留默认关闭的新账本入口和已验证模块，明确 partial；不强推迁移给使用中的用户。

## 15. 可复制的 A 线启动 brief

> 你负责 Pinax A 线历史/记忆账本。先读 AGENTS、STATUS、记忆架构和本任务书，使用 O 冻结 base 的独立 worktree。参考 Utopia SHA 60df635d6924127c9a57e98acbd99e43bdd92d08；优先复用 Dexie 和 Pinax 时间/身份/来源能力。先做 A01～A18 的可恢复纵向闭环，候选不自动变事实，记录轴不等于故事时间或角色知情，旧候选同步真源本夜不全量迁移。你只写 A 归属文件，公共合同/backup/runtime 接线交 O。每 60～90 分钟交任务 ID、变更文件、命令与 exit、截图或数据证据、下一风险。P0 完成后依次取储备，不得自行开云服务、合 C2、改服务器或操作用户数据。最终自审后交 completed/partial/not-started 清单和精确复现，禁止把计划、mock 通过、真实模型通过混为一谈。
