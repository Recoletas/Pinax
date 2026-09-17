# ADR：事实账本（fact ledger）的作用域、记录类型与数据库 schema

状态：2026-09-17 白天统一集成；生产创作 reader、完整 ZIP 和 C 跑团回执已接线。当前验收及未完成项见[组合回执](../agent-runs/nightly-20260917/integration-summary.md)。不设夜间 O 线。
日期：2026-09-16。基线：`main@b5b2b56`。验证：`node scripts/memory-ledger-smoke.mjs`。

## 1. 上游来源与复用分类

- Utopia（Apache-2.0，[deeplethe/utopia](https://github.com/deeplethe/utopia)）本轮设计参照冻结于 `60df635d6924127c9a57e98acbd99e43bdd92d08`（2026-09-16 经 `git ls-remote` 实测核实）。已有首切登记 `e879b7a1694c9e4eb78d2f048da361fe03905330` 保持不变，本 ADR 是新增登记，不改写历史。
- **结构借鉴（无代码复制）**：
  - `0018_a_fact_awaiting_a_nod.sql` 的 pending 独表隔离 → `factProposals` 与 `factVersions` 分表，默认 facts 读取只见正式事实（G-A05）。
  - `0003_graph.sql` 的事实版本/有效时间/supersedes → `factVersions.validInterval` + `supersedes` 链，正文不可覆盖，作废只能经更正/撤回事务。
  - `record_axis.rs` 的集中记录轴谓词 → `ledger/recordAxis.js` 是唯一"当前有效/截至有效"过滤实现。
  - `graph.rs`/`temporal.rs` 的双时钟与乱序处理 → `storyAt`（故事时间）与 `recordedAsOf`（作者记录轴）两个独立查询参数；自动区间对账不做，显式更正完成。
  - 幂等 confirm → 全部变更以 `commandId` 封装：同 ID 同载荷重放返回原决定，同 ID 异载荷拒绝（`command-payload-conflict`）。
- **刻意不照搬**（任务书 §2.3 全部维持）：批量乐观摄入、UTC 即故事时间、Rust/PostgreSQL 服务、"工程化=不幻觉"的承诺。
- 数据库继续使用 Dexie 4.4.6（已在 THIRD_PARTY_NOTICES 登记）；哈希复用 `src/services/contentHash.js` 的 SHA-256 与 knowledgeReadModel 的 `stableStringify`，故事时间语义复用 `knowledgeReadModel/time.js`，未新增依赖、未新增第二套近似 helper。

## 2. 作用域合同（ScopeRef）

```text
ScopeRef = { domain: 'author'|'book'|'worldbook'|'session',
             bookId, worldbookId, sessionId, branchId }  // 无关联显式 null
```

- `author`：全字段 null；`book`：bookId 必填；`worldbook`：worldbookId 必填；`session`：sessionId 与 branchId 必填（K1）。
- scopeKey 为固定五元组以 `\u001f` 连接的规范编码；字段 id 含该分隔符直接判无效，无拼接碰撞。
- legacy 候选映射：`global-author→author`、`project→book`、`session→不可迁入`（缺 branch，记录 `identityKind: 'legacy-session'` 进待归属清单，不猜归属）。
- 两书共享世界书时，只有显式 `worldbook` 域的事实共享；书级与会话事实互不可见（smoke G-A03/A04 已验）。

## 3. 记录类型与表映射

| 计划类型 | 存储 | 说明 |
|---|---|---|
| authorPreference | 不入账本 | 留在 legacy 候选 owner，本夜不迁移真源 |
| proposal | `factProposals` | pending/adopted/dismissed；AI 提案无证据不可采用 |
| canonicalFact | `factVersions` | 仅 `authority:'author-confirmed'`，只经 factLedger 写入 |
| sessionEvent | `turnReceipts` | 已提交回合的持久审计（A19 接缝），不驱动游戏状态 |
| derivedClaim | 不入账本 | 后续投影任务，不因检索命中升级 |

## 4. Dexie schema v2（同库升级）

`pinax-memory-history` v1 `revisions` 声明原样保留；v2 新增：

| 表 | 主键 | 索引 |
|---|---|---|
| evidenceSnapshots | id | scopeKey, sourceId, [scopeKey+sourceId] |
| factProposals | id | scopeKey, status, fingerprint, [scopeKey+status] |
| factVersions | id | scopeKey, factKey, [scopeKey+factKey], [scopeKey+subjectKey], [scopeKey+recordedSeq] |
| factDecisions | id | scopeKey, commandId, [scopeKey+recordedSeq] |
| rejectionMarks | id | scopeKey, fingerprint, [scopeKey+fingerprint] |
| ledgerMeta | id | （`schema` 元数据 + `seq:<scopeKey>` 单调序号） |
| turnReceipts | receiptId | scopeKey, commandId, [scopeKey+archivedSeq] |

- 升级不改写、不删任何 v1 行（smoke：7 条修订升级前后内容/父链不变；旧 smoke 209 条回归通过）。
- 同一数据库内跨表事务真实存在：采纳 = 证据校验 + 拒绝指纹检查 + 新版本 + 旧版本作废 + 提案消费 + 决定，一个 `rw` 事务。
- `recordedSeq` 每作用域单调，同毫秒决定仍有全序；墙钟仅展示。
- `invalidatedAt/invalidatedSeq` 只能由更正/撤回事务从空转为值；正文与决定均 append-only。
- 事实身份 `factKey = fact:<subjectKey>:<predicate>`；更正不改身份，只换 object/区间/证据。

## 5. 双时间查询合同

```text
queryFacts({ scope, subjectKeys?, storyAt?, recordedAsOf?, cursor?, limit?, timeline? })
  -> { ok, items, excludedReasonCounts, nextCursor, snapshotVersion, completeness }
```

- `recordedAsOf: {seq}` 精确；`{recordedAt}` 墙钟解析为该时点前最后一次决定的 seq；无记录返回空视图而非当前视图。
- 记录轴半开区间：`recordedSeq <= cutoff && (invalidatedSeq == null || cutoff < invalidatedSeq)`。
- `storyAt` 复用 knowledgeReadModel/time.js：inside/outside/unknown 三值；unknown 计入 `excludedReasonCounts.storyTimeUnknown`，绝不当作"一直成立"；跨 timeline 恒 unknown。
- 任务书 §6.2 强制示例已入 smoke：第 3 年 @T1 返回旧甲区间版本，@T3 按更正返回乙。
- 游标绑定 scope/filter/snapshot/lastSeq，按 seq 降序稳定分页；实际合同以 `queryFacts.js` 为准，不接受跨作用域重放。

## 6. 生产读取、备份域与恢复

`authoringKnowledgeReaderHost` 经原 `projectMemoryReader` 调用账本适配器，按请求冻结 bookId 读取已确认事实；待审核与别书事实不进入上下文。连接按请求关闭。只有实际进入投影的迁入版本才抑制对应旧候选，读取失败不清空旧候选。当前是有预算的有限召回，不是全库语义检索。

`workspaceBackupBundle` 的 v3 ZIP 新增可选 `ledger/fact-ledger.json`；导出在账本内使用一致性只读事务，账本不可用时拒绝生成“完整备份”。导入检查版本、清单数量、scope、证据与更正链、序号计数器；同 ID 同内容幂等跳过，同 ID 异内容整域拒绝。`ledgerMeta.schema` 是环境元数据，`seq:*` 是数据，不能覆盖当前计数器。补偿只删除本次插入的账本 ID，媒体和来源分别实际回滚，任一补偿失败不跳过其他域；所有路径关闭连接。旧 v3 包没有账本域时保留现有账本，并在预览明示缺域。跨 localStorage/多个数据库仍是补偿事务，不声称 ACID。

## 7. 已知边界（诚实清单）

- 升级阻塞和双页竞态已在隔离浏览器复测；配额错误做了受控注入，未真实填满用户磁盘，也未迁移用户真实数据。
- 会话域事实（含分支祖先链投影）、角色知情轴、全文历史检索、向量检索、实体合并不在本夜范围。
- `legacyMigration` 迁入的事实以 `legacy:<candidateId>` 为 subject 的"记事"整句 claim，不做实体拆解；结构化拆分留给显式更正。
- `previewLegacyMigration` 经 `listMemoryCandidates()` 读取，其读路径迁移写回行为与既有 owner 一致，未新增写路径。
