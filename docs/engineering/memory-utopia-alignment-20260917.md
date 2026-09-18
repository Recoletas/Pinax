# N-C 记忆链与 Utopia 对照报告（NC02）

日期：2026-09-17 夜。对照基线：本地 `/home/recoletas/jiuguan/utopia`，commit `dbb92981b7f017f141d838f7b35ecb1788ad73d0`（执行时已重新核实，未漂移）。许可证 Apache-2.0（根 LICENSE）。Pinax 侧基线：`night/memory-quality-20260917`。本文只做语义对照与取舍记录；**没有移植任何 Rust/Postgres 代码**，引用处均为设计语义级别。

## 1. 逐项对照

| Utopia 机制（出处） | Pinax 现状（文件/函数） | 本夜动作与取舍 |
| --- | --- | --- |
| 决策 0015「记录一句话 ≠ 断言一个事实」：`remember` 仍写文档，抽取事实进 `pending_facts` 等确认，确认卡片**原句与三元组并列展示**；拒绝按 (subject, predicate, object entity) 记 `rejected_facts`，字面值不封禁（决策正文 Decisions 4/5） | 事实账本 `factProposals`（pending）+ `adoptProposal`/`rejectProposal`/`rejectionMarks`（`services/memory/ledger/factLedger.js`）；审阅 UI 随白天 A 线集成 | **已对齐**。本夜提取管线（`extraction/extractionRunner.js`）只产 `origin='ai'` 的 pending 提案 + chapter-quote 证据，不直接产 active 事实。差异：Utopia 在确认卡里并列展示，Pinax 的提案 evidence 引文由审阅界面展示（同语义，载体不同）。字面值不封禁的取舍已在 `claimFingerprint`（含 object）+ `rejectionMarks` 按来源版本抑制中体现 |
| `utopia-extract` 严格结构化输出：prompt 要求逐字 quote（`lib.rs` L225/L253「quote must be a contiguous excerpt from the source text」）、部分/截断可见（L262 要求空结果也说明）、`parse_response` 逐项解析 | `extraction/structuredExtraction.js`：EXTRACTION_INSTRUCTION 要求逐字 quote + 禁止编造 + `unextractable.reason`；`validateMemoryExtractionResponse` 逐项校验，`quote-missing-in-source` 拒绝可见 | **已对齐**（本夜新增）。差异：Utopia 用本体 domain 校验属性；Pinax 无本体，改用已知实体目录（resolved/unresolved/ambiguous 三态，ambiguous 直接无产出） |
| 抽取丢弃信号 `extraction_drops.rs`：稳定原因码（`subject_not_declared`、`malformed_item`、`low_confidence`、`direction_corrected` 等十三类），「记录失败不影响抽取」，读者是上传文档的人 | 本夜 job.rejected[]（`quote-missing-in-source`/`claim-fields-missing`/`duplicate-claim`/`ambiguous-entity`）+ `unextractableReason`；**低敏分类不落原文** | **部分对齐**。Pinax 已有等价的「逐项原因码 + 部分失败可见」；尚未做独立的丢弃面板 UI（提案审阅处可见 rejected 数组）。列为后续 |
| `extraction.rs` 摄取与提取分离、逐 chunk 调度、限流退避（`chat_retrying_rate_limits` L44-75：Retry-After 优先 + 指数退避 + 上限）、更新时 chunk 级跳过（L689-690） | `extraction/extractionJobStore.js` + `extractionRunner.js`：任务队列 FIFO 并发 1、429/超时退避（30s 起步、10min 封顶、最多 3 次）、401/403 不重试、同源新 revision 使旧任务 `source-changed`、会话总预算 20 次 | **已对齐**（本夜新增，浏览器确定性门禁覆盖）。差异：Utopia 按 embedding 检索每 chunk 相关本体；Pinax 无向量检索，切片即变更切片本身，无需检索 |
| `temporal.rs` 晚到事实对账：闭合走「作废+改写」、闭合点只用世界时间（valid_from），绝不用摄取时刻顶替（文件头 L5-7；`reconcile_new_fact`/`reconcile_moved_facts` 按 recorded_at 重放） | 账本双时间：`factVersions` + `recordAxis.js`（isVisibleAt / resolveCutoffSeqFromDecisions）+ `queryFacts` 的 storyAt/recordedAsOf 双轴；storyInterval 精度 unknown/label 不强转公历 | **部分对齐**。读取轴已对齐；**写入时态对账（新事实与旧事实的 valid 区间冲突自动闭合）尚未实现**——Pinax 现在靠审阅人裁决冲突提案（conflictsWith/待审）。这是与 Utopia 的最大剩余差距，标为后续（需要与 NC12 一起做） |
| `a_fact_awaits_a_nod.rs` 等行为测试：守「确认前不进图」「拒绝后同三元组不再提」「purge 不可逆」 | `scripts/memory-quality-check.mjs` A3–A5（提取→账本→采纳→reader）+ 账本既有 tests/smoke（memory-ledger-smoke） | **已对齐**。本夜门禁新增：采纳后生产 reader 可见、pending 不混入、401 不盲重试、坏 JSON 一次修复、来源更新不重复提取 |
| 决策 0010「no relation is no relation」（空谓词不算关系） | `normalizeClaim` 要求 subject/predicate/object 全非空（`ledgerContract.js` L114-123） | **已对齐**（白天 A 线已实现，本夜提取校验复用同一合同） |

## 2. 明确不适用（不做）

- **本体（ontology）与 domain 校验**：Utopia 的属性域/关系方向校验依赖本体声明；Pinax 小说场景没有本体，方向正确性交给 claim 文本 + 审阅人 + 引文。
- **PostgreSQL / sqlx / embedding 检索**：Pinax 是浏览器 Dexie + localStorage，不引入服务端图数据库。
- **确认卡片长进聊天流**（0016 的 UI 形态）：Pinax 的记忆审阅在素材/设定工作区，不复制聊天卡片交互。
- **批量摄取免确认**（0015 的 bulk ingest 分支）：Pinax 本夜范围是增量正文提取（逐切片小批量），默认全部走审阅；大规模资料摄取归 N-A 的设定提取链（已有独立审阅）。

## 3. 本夜新增的差距清单（诚实声明）

1. **时态对账写入侧未做**（对照表第 5 行）——冲突提案目前靠人审；自动「作废+改写」需要与 NC12（否定/矛盾/晚到更正）一起设计。
2. **丢弃面板 UI 未做**——rejected 原因码已在 job 与提案审阅数据里，无专门视图。
3. **chunk 级跳过缓存未做**——Pinax 以「变更切片 + 指纹去重」达到同等目的（重复内容不重提），但没有 Utopia 的文档更新时按 chunk 复用提取结果的机制。
4. **角色知情（knowledge cutoff）不在本夜范围**——保持白天集成结论：`character-knowledge-reader` 未就绪，降级为公开信息投影。

## 4. 复用与许可记录

借鉴均为**设计语义级**（确认门、引文硬校验、丢弃原因码、限流退避、双时间轴），未复制源码；无需在分发物中附带 Apache-2.0 文本。若未来整段移植 Utopia 代码（当前为零），需按其 NOTICE 要求随分发保留许可与出处。
