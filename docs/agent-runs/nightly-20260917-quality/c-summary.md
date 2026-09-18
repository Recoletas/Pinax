# N-C 回执：记忆与提取闭环（nightly-20260917-track-c-memory）

状态：**已实施 + 分线验证（离线确定性）**。真实 LLM 抽样 **not-run**（启动时未获得预算授权）；组合旅程的 A 侧（资料页装配）**blocked-external**（N-A 未启动）。执行窗口 2026-09-17 00:50 – 02:10（本回执提交时约 1.5 小时，窗口尚未结束，后续增量见文末"续跑队列"）。

## 1. 基线与交付

| 项 | 值 |
| --- | --- |
| base SHA | `c445dd4`（main，含白天 ABC 集成；本线开工时重新核实） |
| 分支 / worktree | `night/memory-quality-20260917` / `/home/recoletas/jiuguan/pinax-night-memq-20260917` |
| 提交 | `0885fe9` NC01 复现 → `fb5af75` NC03/NC04 → `ace356e` NC06-10 提取管线 → NC02/NC18 语料与对照 → NC05 分组 → 任务状态 UI（见 git log） |
| Utopia 冻结源 | `/home/recoletas/jiuguan/utopia` @ `dbb92981…`（核实未漂移；Apache-2.0；仅设计语义级借鉴，零代码移植） |
| 开发服务 | 全部自起隔离端口（5317/5319/5331/5333，用完即杀）；未触碰 5173/5179（5179 有其他线的在用服务） |

## 2. 任务状态

| ID | 状态 | 说明 |
| --- | --- | --- |
| NC01 | done | 生产 UI 复现：4 步打字（a/asdfgh/删除/中文句）+ 切章 → block history +3 条全文拷贝（manual-save）、1 条 pending 候选=块开头两句（与改动无关）、修订账 +1、provider 0 次。`scripts/memory-quality-repro.mjs` + `/tmp/pinax-memq-20260917/repro.json` |
| NC02 | done | `docs/engineering/memory-utopia-alignment-20260917.md`（0015 确认门/引文纪律/丢弃原因码/限流退避/双时间轴逐项对照 + 4 项诚实差距）；AC 合同冻结 `docs/engineering/memory-source-contracts-20260917.md` |
| NC03 | done | 同章同块连续 manual-save 会话合并（保留起点+最新、mergedCount）；切章封组；search-replace 标签真实化（原为 unknown）；20 次小改 = 1 条历史（门禁 A2） |
| NC04 | done | `extractionEligibility.js`：asdfgh/aaaaaa/纯符号零资格；他死了/门没锁/NASA/英文短句不拒；revision+内容指纹会话内去重；摘录候选诚实标注 `metadata.derivation='local-excerpt'`；pending delta 逐节点裁剪真实变更切片 |
| NC05 | done | 决定记录按对象（factKey）分组汇总（组内全量保留）+ 状态对照说明 + listDecisionsPaged 分页（50/页 + 加载更早） |
| NC06 | done | `extractionJobStore.js`：8 状态机、去重、8 块上限、退避重试、会话预算 20、刷新中断对账；并发 1 |
| NC07 | done | canonical 任务 `memory.extraction`（目录只追加，客户端/服务端 allowlist 同源派生）；经 `requestAdvisorTask` 真实 transport 调用；门禁用 playwright 路由做确定性 provider 替身 |
| NC08 | done | 逐项校验：quote 必须逐字命中冻结原文、字段完整性、polarity 保留（negative/hedged/report 载入 claim 文本）、ambiguous 实体无产出、unresolved 留待核对、重复 claim 去重、部分失败可见 |
| NC09 | partial | 提案→账本唯一 owner（origin=ai + chapter-quote 证据）+ 采纳/更正/撤回/拒绝抑制沿用既有事务（并发一成功一冲突由账本合同与 continuation-smoke 覆盖）；本夜未新增双标签并发浏览器反例 |
| NC10 | done | 门禁 A4：采纳后 `queryFacts` 生产 reader 可见否定事实、未采纳提案不混入；B 旅程全链（打字→候选→任务→提案）真实 transport 恰好一次模型调用 |
| NC11/NC12/NC13/NC14/NC17 | not-run | P1，夜窗内未启动（来源修订精确失效/时态对账写入侧/正文与事实恢复分离/角色知情/1 万级历史 UI） |
| NC15 | partial-blocked | AC-EXTRACT-v1 已冻结并可消费 AC-SOURCE-v1 形状入参；但 N-A 未启动（其 worktree `pinax-night-sources-20260917` 停在 base 无提交），资料页→提取的页面装配无法接线。已留阻塞说明与接口 |
| NC16 | partial | 提取任务随 localStorage 全量备份域进 ZIP（机制由 workspace-backup-check 覆盖）；账本域 ZIP 白天已集成；本夜未新增针对提取任务的 ZIP 往返断言 |
| NC18 | done | `scripts/memory-quality-corpus.mjs` 30 个标注片段（冻结期望）+ `scripts/memory-quality-check.mjs` 15/15；真实 provider 抽样 not-run |

## 3. 修后量化（同复现旅程，修前 → 修后）

| 层 | 修前 | 修后 |
| --- | --- | --- |
| block history | +3 条（每次微保存一条全文拷贝） | +1 条合并会话（起点+最新） |
| asdfgh/删除候选 | 摘录块开头成为 pending"记忆" | **0 候选** |
| 中文句候选 | 块开头两句（错位） | 作者真实写入句 + `local-excerpt` 标注 |
| 修订账 | +1（噪声也记） | +1（仅真实变更产生） |
| 提取任务 | 不存在 | 1 条，真实 transport 恰好 1 次调用，产出带引文提案 |

## 4. 验证命令与 exit code（本轮真实运行）

```
node scripts/memory-quality-check.mjs        → 15/15 checks passed（A0 语料 23 项断言 + A1-A7 + B1-B6）
node scripts/memory-quality-repro.mjs        → 复现取证（修前/修后两轮）
node scripts/memory-ledger-smoke.mjs         → ok/ui/responsive/consoleClean 全绿（含 NC05 分组视图）
node scripts/memory-history-smoke.mjs        → ok（209 修订/ZIP 往返/配额/作用域隔离）
node scripts/memory-ledger-continuation-smoke.mjs → ok（双页竞争/升级阻塞/1 万分页）
npm run verify:full                          → exit 0（20/20 文件、200/200 用例、lint 0、双 build、架构、diff）
```

核心测试唯一改动：`agentContracts.test.js` observer 面 6→7（memory.extraction 追加），并补新任务存在性断言。共享 smoke 两处过期修复（c445dd4 UI 精修所致，基线即失败、非本线回归）：ledger-smoke 增加事实账本页签点击 + 视图选择器限定区域；history-smoke 增加「AI 候选」页签点击。

## 5. 截图与查看

`/tmp/pinax-memq-20260917/journey-authoring.png`（旅程结束态：第二章、第一章字数含新句、无错误——本 worker 已实际查看）；`/tmp/pinax-memory-ledger-desktop.png`、`/tmp/pinax-memory-ledger-mobile.png`（smoke 决定分组视图，本 worker 已查看）。**用户视觉确认未发生**。

## 6. 数据兼容与回滚

- block history schema 仍为 2（updatedAt/mergedCount/sessionClosedAt 为可空附加字段，normalize 默认安全）；旧历史只读保留，未清理、未迁移任何用户数据。
- 提取任务存于 `memory_extraction_jobs_v1`（新 key），随 localStorage 全量备份域进 ZIP；旧版本客户端忽略该 key，无兼容风险。
- 回滚：revert 本线提交即恢复旧的逐保存历史与自动摘句行为；已入账提案/事实是标准账本数据，回滚代码不删除它们。

## 7. 未承诺能力（诚实声明）

写入侧时态对账（晚到事实自动作废+改写）、丢弃面板独立视图、chunk 级重提缓存、角色知情边界、1 万级历史 UI、真实模型质量（准确率/召回率目标）均未交付。真实 LLM 抽样在获得预算授权后按语料前 12 条、≤12 次请求执行。

## 8. 续跑队列（按优先级）

1. NC15：等 N-A 的按书归档 reader → 资料页「提取为记忆/设定」入口 → 走同一任务队列。
2. NC16：为提取任务加 ZIP 往返显式断言（并入 workspace-backup-check 或本线门禁）。
3. NC12：否定/矛盾/晚到更正的自动时态对账设计（与 NC02 报告差距 #1 对应）。
4. 真实模型抽样（需授权）。
