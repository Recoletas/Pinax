# 夜间执行统一进度快照

核对时间：2026-09-19 00:20 +08:00。此文件是主线只读核对后的进度汇总，不替换各工作树正在维护的回执。完整任务与新的领取顺序见[主计划](../../plan/nightly-20260918-runtime-maturity.md)。

| 工作树 / 分支 | 固定提交 | 已交付 | 在途 / 风险 |
|---|---|---|---|
| `pinax-night-runtime-a-20260918` / `night/runtime-a-20260918` | `41465f0`（另含 `21bcd5e`） | G0 单飞与 G1 有界检索、过滤先于截断 | 两个 narrative 工具文件未提交，疑属 T02/T03；与原 C 的 T 写集安排需统一 |
| `pinax-night-roleplay-b-20260918` / `night/roleplay-b-20260918` | `57b268e` | R01/R02 实现，R03 离线与 R06 部分 | `run/` 为未跟踪依赖；R03 provider 未接；smoke 第 6 旅程回执失败；不算组合验证 |
| `pinax-night-runtime-c-20260918` / `night/runtime-c-20260918` | `2218d17` | G2a 合同、跑团 G2b/G3 切片 | KP/同伴/gameStore/eval 在途，与 B 重叠；旧基线 `6bca059` |

证据读取：A 的 `docs/agent-runs/nightly-20260918/current.md` 和 reuse.md；B 的 current.md/b-line.md；C 的 current.md/c-line.md，以及上述固定提交的文件差异。回执数字属于**分线自报验证**：A G1 五组真实 IndexedDB 反例、核心 20/200；B KP 50/0、既有 eval 196/0；C eval 237/0、smoke 53/0。此次未在其他正在写入的工作树重跑，也未将数字作为主线组合结果。

注意：A 表格把 G1 写 implemented、后文写 verified；B nextReady 一处仍为 R01、详细回执已到 R05/R07；C 把 B 分工写作 T，和 B 当前工作相冲突。主计划已经按实际代码改正，不照抄旧板。

下一组合 Gate：先解决 C 合同依赖与 B/C KP 重叠，再在同一已提交基线上核对 HTTP 编号、刷新同骰点恢复、真人接管、预算/重复采用、角色隔离、备份和生产旅程。G4 未完成，M01–M12、R04–R12 和 T 余项不预记完成。

本次授权范围：提交推送 main 的 HTTP UUID 修复与计划进度修订；不合并或推送其他夜间分支，不启动/停止 worker，不部署或调用真实模型。
