# A 线回执：历史、证据与记忆账本（nightly-20260916）

- Owner：Claude worker（A 线）；基线：`main@b5b2b56`（含三线计划的最终 main，干净树冻结）。
- Worktree：`/home/recoletas/jiuguan/pinax-night-memory-20260916`，分支 `night/memory-20260916`。
- 任务书：[nightly-20260916-memory.md](../../plan/nightly-20260916-memory.md)；上游冻结 Utopia `60df635d6924127c9a57e98acbd99e43bdd92d08`（2026-09-16 `git ls-remote` 实测一致）。
- 状态：**A01–A18 P0 纵向闭环 completed（含两项 partial 子项，见下）；A19 部分 completed（存储侧）；A20–A28 not-started；O 接线项全部 not-started（越界禁写）。**

## 已完成（附证据）

| 任务 | 内容 | 证据 |
|---|---|---|
| A01 | upstream SHA 实测核实、复用分类、旧登记保持 | `git ls-remote` = `60df635d…`；[ADR §1](../../engineering/memory-fact-ledger.md) |
| A02 | ScopeRef/五类记录/拒绝示例/不迁移清单 ADR | [memory-fact-ledger.md](../../engineering/memory-fact-ledger.md) |
| A03 | Dexie v2 同库升级：七张新表，v1 `revisions` 声明与数据原样 | smoke：7 条种子修订升级后内容/父链不变；旧 smoke 209 条回归 exit 0 |
| A04 | commandId 命令封套、SHA-256 载荷哈希（复用 contentHash/stableStringify） | 同命令同载荷重放、同命令异载荷 `command-payload-conflict` |
| A05 | 证据冻结 repository（quote+sourceRevision+contentHash，不可变、幂等） | 重复追加同一引文返回原行 |
| A06 | proposal / fact 分离，默认 facts 读取不见 pending | `queryFacts` 在采纳前返回 0 条（G-A05） |
| A07 | 采纳事务（一个 Dexie `rw` 事务：证据校验→指纹→版本→作废→消费→决定） | 双重采纳 `proposal-already-adopted`，无重复版本（G-A14） |
| A08 | 更正/撤回/supersedes 链；无变化拒绝生成修订；expectedHead 冲突 | 更正链 2 版本可见；`no-change`、`head-conflict` 拒绝（G-A07/A13 形状） |
| A09 | 拒绝指纹（fingerprint+sourceRevision）抑制；来源变更可再审；显式重开 | 同指纹+同来源 `suppressed:true` 不建行；换来源新提案；reopen 解除（G-A06/A09） |
| A10 | 集中记录轴谓词 `recordAxis.js` | seq 单调断言；半开区间过滤全部经此模块 |
| A11 | 故事时间比较复用 `knowledgeReadModel/time.js` | inside/outside/unknown 三值；跨 timeline 恒 unknown（G-A09） |
| A12 | 双时间分页查询 `queryFacts.js` | 任务书 §6.2 强制示例通过；10 条事实 limit 3 → 4 页稳定游标无丢失 |
| A13 | legacy 迁入预览+显式迁移+映射 | 可迁入/缺来源/待归属三清单；按 candidateId 幂等；legacy owner 未被改写 |
| A14 | MemoryHistoryWorkspace 事实账本 UI 纵向闭环 | 真实浏览器旅程：提案→接受→更正→决定记录，1440/390 无横向溢出，0 console error，截图 `/tmp/pinax-memory-ledger-{desktop,mobile}.png` 已查看 |
| A15 | 只读投影 + manifest 引用校验器（O 联调用） | 伪造版本 ID 被拒（G-A25）；审计块零正文（G-A26） |
| A16 | 新域 collect/validate/import/rollback | 同 ID 异内容整域拒绝；隔离新库恢复 1058+1 跳过计数吻合；补偿仅删本次写入（G-A17/A18） |
| A17 | IndexedDB 不可用类型化失败（不删库） | defineProperty 注入后 `indexeddb-unavailable, retryable:false` |
| A18 | 本回执 + ADR + memory-history.md 更新 | 本文与上述文档 |
| A19（存储侧） | `appendCommittedTurnReceipt` 幂等存储 | 同回执重放、异载荷冲突；1,001 条回执无截断（G-A19/A20 目标的存储侧） |

## Partial / 未完成（不冒称完成）

- **G-A16 partial**：IndexedDB 不可用已类型化实测；配额满走 Dexie 错误的 retryable 类型化路径但未注入实测；upgrade-blocked 有 `on('blocked')` 处理与文案，未做双标签实时模拟。
- **A19/A20 partial**：回合回执存储与查询就绪；**coordinator/提交点接线是 O 的写集，本夜未接线**。按任务书 §8.2：三线永久历史组合门禁（O-G07/O-G08/O-G09）保持未通过。
- **A15 联调 half**：投影与校验器接口完成并有直接验证；接入 projectMemoryReader/knowledgeReadModel 归 O，未接线前模型上下文不含正式事实。
- **A16 整包 half**：域接口完整验证；workspaceBackupBundle ZIP 接线归 O，`verify:full` 的备份域仍是 v1 memory-history。
- A21–A28（历史 tool、10k 性能、角色知情、删除预览、冲突队列、乱序对账、别名映射、抽取指纹）：not-started。
- A29/A30：后续路线，未纳入本夜。

## 真实验证命令与 exit

| 命令 | 结果 |
|---|---|
| `node scripts/memory-ledger-smoke.mjs`（隔离 dev server 127.0.0.1:5179，独立 profile） | exit 0：`{"ok":true,"v1Revisions":7,"factsBookA":10,"receipts":1001,"domainRows":1059,"dualTimeExample":true,"ui":true,"responsive":true,"consoleClean":true}` |
| `PINAX_SMOKE_URL=http://127.0.0.1:5179 node scripts/memory-history-smoke.mjs` | exit 0：209 修订/ZIP 往返/配额恢复全通过（回归） |
| `npx vitest run --reporter=default --reporter=./scripts/vitest-budget-reporter.mjs` | exit 0：**20/20 文件、200/200 用例**（预算顶格保持，新场景全部走显式 smoke） |
| `npx eslint src/services/memory/ledger src/components/authoring/MemoryHistoryWorkspace.vue scripts/memory-ledger-smoke.mjs` | 0 error / 2 no-console warning（与既有 smoke 同类） |

## 边界与数据安全声明

- 只写了 A 归属文件：`src/services/memory/ledger/`（9 个模块）、`MemoryHistoryWorkspace.vue`、`scripts/memory-ledger-smoke.mjs`、`docs/engineering/memory-{fact-ledger,history}.md`、本回执。未触碰 memoryCandidates/memoryHistoryStore 的既有行为（smoke 回归为证）、gameStore/coordinator、backup、reader、router、package.json；未动用户 5173 进程、用户浏览器数据、LOCAL.md、C2 分支。
- 全部验证在隔离 Chromium profile + 独立端口 5179 完成；未调用任何真实模型/外部服务，无预算消耗。
- UI 视觉未经用户确认，仅旅程/响应式断言通过；按惯例不标"视觉完成"。
- 未 push：合并顺序（共享合同 → A 账本 → C → B → 组合）由 O 执行；分支 `night/memory-20260916` 等待 O 验收。
