# A 线续跑回执（nightly-20260917）：事实账本接生产与永久历史

- Owner：Claude worker（A 线续跑）。基线：`night/memory-20260916@aa17b47`（首批 tip，未被重建）。
- Worktree：`/home/recoletas/jiuguan/pinax-night-memory-20260916`；共同 main `b5b2b56` 未移动；B worktree（b5b2b56）未动，C worktree（0f0eea2）只读参考。
- 任务书：[nightly-20260917-memory-continuation.md](../../plan/nightly-20260917-memory-continuation.md)。**其引用的调度修订 `nightly-20260917-ac-dispatch.md` 在仓库中不存在**（已检索全部 worktree）；本批以续跑书 §15 与用户启动指令为准执行，缺口在此登记。
- 完成标签（互不替代）：已实施 ✓（本回执代码真实存在）；分线验证 ✓（下列命令与 exit）；组合验证 ✗（未合并，O 未复验）；真实模型 ✗（未调用）；用户确认 ✗。

## 1. 48 项任务表（每项唯一主状态）

| ID | 状态 | 交付/证据（✳=真实命令见 §4） |
|---|---|---|
| AX01 | completed | 首批 30 项 G-A 场景重列单一状态（§3）；首批 smoke 真实重跑 exit 0 ✳ |
| AX02 | completed | 17 条事实、limit 3、重复人物 ID → 6 页遍历恰好 17 个唯一版本（XA-G01）✳ |
| AX03 | completed | 游标 v2 信封：绑定 scopeKey+筛选哈希+snapshotSeq+lastSeq；跨书 `cursor-scope-conflict`、改筛选 `cursor-filter-conflict`、篡改/乱码 `cursor-invalid` ✳ |
| AX04 | completed | 双真实连接阻塞：blocked 即时触发(≤300ms)、取消不删库、释放后升级成功、数据经旧连接全程可读；meta 初始化失败类型化(quota→retryable)（XA-G05/G06 部分）✳；注：Dexie 封装内 openTimeoutMs 参数就绪，未实触发该分支 |
| AX05 | completed | Proxy 注入四类事务中段失败（adopt/correct/reject/migrate）：全部类型化 `db-unavailable`、零半提交、提案/头未被消费；双 page 抢同 head 一胜一 `head-conflict`、版本数恰 +1（XA-G06/G08）✳ |
| AX06 | completed | 投影保留 `主语 · 谓语 · 宾语` 全文（否定句"不对外来商队开放"完整）；超预算宾语整条排除并审计（不截断）；携带证据版本与 timeMatch（XA-G09）✳ |
| AX07 | partial | `ledgerProductionAdapter` + 可应用补丁 `patches/projectMemoryReader-ledger-facts.patch`（已 `git apply --check` + 补丁态端到端验证：事实进 reader 输出、否定语义完整、迁移候选被抑制）；**生产树未应用（O 转锁），真实作者操作链的请求拦截未跑** |
| AX08 | partial | 迁移映射 `suppressLegacyCandidateIds` + `unverifiable-legacy-source` 标记已验；"不两次进入上下文"需补丁应用后才在生产生效 |
| AX09 | completed | `createRoleplayArchiveParticipant` 对齐 C 线 `installRoleplayHistoryPort` 合同：null branch/无 scope 回执/引用无载荷/ actionId 不符 全部类型化拒绝；同 ID 同载荷幂等重放、异载荷冲突（XA-G14）✳ |
| AX10 | completed | `drainReceiptArchive`：40 条 + 5 重发 → archived 40 / duplicates 5 / rejected 0；重 drain 全 duplicates；A 仅归档不重执行（XA-G13）✳ |
| AX11 | partial | `patches/workspaceBackupBundle-fact-ledger.patch`（git apply 验证 + 补丁态端到端：manifest 域计数吻合、inspection `factLedgerCount`、未声明缺失域 `missingDomains`、不可用包拒恢复、二次恢复幂等 written 0）；**O 树未应用；restore 预览 UI 列新域体积未接** |
| AX12 | partial | 补丁态实测：localStorage 步失败后 `factLedger.rolledBack=true` 且本轮写入被精确补偿（版本 2→1→补偿后仍 1）；**发布开关未处理：首批 UI 已可写账本而完整 ZIP 补丁未应用，存在"新写入暂不可完整备份"窗口——建议 O 优先应用 AX11 补丁** |
| AX13 | completed | `queryTurnReceipts`：索引分块真分页、branchId 过滤、throughTurnId 锚点（34 条窗口）、45+1 条范围零漏重；200 热窗口外可读 ✳ |
| AX14 | completed | `createLedgerHistoryTool` search/get/trace：别书 ID get 返回 not-found 不泄漏（XA-G15）、trace 有界截断、输出预算；接 `agents/tools/historyLookup` 归 O |
| AX15 | completed | 三处真分页（facts/receipts/decisions）+ 每结果 `scanned/elapsedMs`；1 万条决策游标 4 页、扫描有界 ✳ |
| AX16 | completed | `traceTurnChain` 父链有界遍历（10 hops → 11 链接 + truncated）；全文历史检索明确不支持（结构化链路降级成立，不取今日正文冒充） |
| AX17 | completed | 10k 事实 + 10k 回执 + 90k 扩展（自适应）：facts walk p50 5ms/p95 10ms、receipts p50 5ms/p95 8ms、扩展写入 90k≈70.5s、扩展后单页读 67–101ms、扫描恒 ≤500/页（XA-G16）✳；环境：headless Chromium/WSL2，同机对照 |
| AX18 | not-started | 历史浏览 UI（书→会话→分支→回合）：查询接口全就绪（AX13/AX16），UI 未建；下一动作：MemoryHistoryWorkspace 增"回合历史"视图 + 会话作用域选择 |
| AX19–AX24 | not-started | 角色认知（knowledgeEvents 需 Dexie v3 + ADR）；下一动作：AX19 ADR 与 schema |
| AX25–AX30 | not-started | 来源生命周期与增量提议 |
| AX31–AX36 | not-started | 时间冲突队列与实体消歧 |
| AX37–AX42 | not-started | 审核工作台深化与检索评测集 |
| AX43 | not-started | 旧候选同步调用图与异步 hydration 方案 |
| AX44 | not-started | 影子迁移对账（隔离副本，真源开关须批准） |
| AX45 | partial | 真 双 page 写冲突已测（一胜一可恢复冲突）；旧客户端（v1-only 声明）对 v2 库只读可用（旧 smoke 回归佐证）；系统化旧客户端策略未写 |
| AX46 | not-started | 存储健康/配额预警/保留策略 |
| AX47 | partial | 恢复失败补偿（补丁态真实验证）+ 域级隔离恢复/补偿（首批）+ v3 升级成功路径实测；"旧代码遇未来 schema" VersionError 分类就绪未实测 |
| AX48 | completed | 本回执 |

## 2. 36 项专项场景（XA-G，唯一主状态）

- **pass**（真实浏览器证据，✳）：G01、G02、G03、G04（序号全链单调+重放）、G05、G06（meta 失败类型化 + 四类中段注入零半提交）、G08、G09、G11、G12（`unverifiable-legacy-source`）、G13、G14、G15、G16（10k/40k 实测；100k 按环境自适应执行了 90k 扩展，数字见 §4）。
- **partial**：G07（Proxy 注入 QuotaExceededError 类型化验证；真实浏览器配额未注入）、G10（reader 级拦截；生产请求链待补丁应用）、G31（批量审核未建 UI，域级事务幂等已验）、G33（同 ID 异内容拒绝/幂等已验；seq 元数据不匹配场景未显式构造）、G35（1440/390 已验；900/暗色/键盘矩阵未跑）。
- **not-run**：G17、G18–G30（阶段四至七域）、G32（ZIP 导出中持续编辑）、G34（旧客户端开未来 schema——VersionError 分类就绪未实测）、G36（影子迁移）。

## 3. 首批 G-A01–A30 复验（唯一状态）

- **pass**：G-A01–A15、G-A17–A22（存储侧）、G-A23–A27、G-A30 —— 由首批 smoke 重跑 exit 0 + 续跑 smoke 增强覆盖。
- **partial**：G-A16（同 §2 G07/G05 注记）、G-A28（900/暗色未跑）。
- **not-run**：G-A29（角色知情投影——阶段四未实施，维持 unavailable 语义）。

## 4. 真实验证命令与 exit（本轮全部新跑，不借旧 smoke 抵数）

| 命令（隔离 dev server 127.0.0.1:5179，独立 profile） | 结果 |
|---|---|
| `node scripts/memory-ledger-continuation-smoke.mjs` | **exit 0**：part1 `{g01Pages:6, frozenSize:10, drainArchived:40}`；scale `{factInsertMs:2474, receiptInsertMs:5516, extInsertMs:70573, extReadMs:67, factWalk p50 5/p95 10, receiptWalk p50 5/p95 8, decisions 320}`；race `{winners:1, conflicts:1}`；lifecycle `{blockedObserved:true, markerWhileHeld:present, markerStillThere:present, upgradeResult:upgraded, markerAfter:present}` |
| `node scripts/memory-ledger-smoke.mjs`（首批回归） | exit 0：`{v1Revisions:7, factsBookA:10, receipts:1001, domainRows:1059, dualTimeExample:true, ui:true, responsive:true, consoleClean:true}` |
| `PINAX_SMOKE_URL=… node scripts/memory-history-smoke.mjs`（回归） | exit 0：209 修订/ZIP 往返/配额恢复 |
| 补丁验证（补丁临时应用态，一次性脚本） | exit 0：reader 事实块含否定语义全句、迁移候选无双重召回；ZIP manifest 域计数=14、inspection `factLedgerCount=14`、二次恢复 written 0、注入失败后 `factLedger.rolledBack=true` 且补偿精确（2→1→1） |
| `npm run verify:full` | **exit 0**：20/20 文件、200/200 用例（预算顶格保持，本批零新增 vitest） |

## 5. 写集与共享文件声明

- **A 独占（已提交）**：`src/services/memory/ledger/`（新增 `ledgerReceiptBridge.js`、`ledgerProductionAdapter.js`、`ledgerHistoryTool.js`；重写 `queryFacts.js`、`ledgerDb.js` 生命周期、`ledgerProjection.js` 语义、`ledgerBackup.js` 主键/元数据处理、`factLedger.js` 决策分页）、`scripts/memory-ledger-continuation-smoke.mjs`、`scripts/fixtures/ledger/upgrade-probe.mjs`。
- **O 锁定（仅补丁文件，未改生产树）**：`docs/agent-runs/nightly-20260917/patches/projectMemoryReader-ledger-facts.patch`、`patches/workspaceBackupBundle-fact-ledger.patch`。两份补丁均通过 `git apply --check`，并在临时应用态完成端到端浏览器验证（含真实补偿）后还原。
- 未触碰：`memoryCandidates.js`/`memoryHistoryStore.js` 行为（回归为证）、gameStore/coordinator（C 域）、C2、server-version、package.json、用户 5173 进程与浏览器数据、LOCAL.md、STATUS/PLAN/LOG（O 单写）。

## 6. 下一阶段首任务（按续跑书顺序）

1. **AX18**：MemoryHistoryWorkspace"回合历史"视图（书→会话→分支→回合，复用 `queryTurnReceipts/traceTurnChain`）。
2. **AX19**：knowledgeEvents Dexie v3 schema + ADR（知情时间独立于记录轴/故事时间）。
3. **AX25**：来源 revision 变化检测与受影响图。
4. 等待 O：应用两份补丁（AX07/AX11），随后补跑 XA-G10/G32/G34 的组合验证。

## 7. 边界与诚实声明

- 首批回执的"A01–A18 completed"按续跑书要求降级重列：接线与组合验收未完成即为 partial（AX07/AX08/AX11/AX12）。
- 本批未合并 C 分支、未启动 O 窗口；`TurnReceiptV1` 桥接以 C worktree `0f0eea2` 的真实端口合同为对面形状做了 fixture 级验证，跨树组合验证待 O。
- 未调用任何真实模型/付费渠道；全部数据为合成 fixture；未操作用户真实书稿与服务。
