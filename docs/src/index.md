# docs/src — 项目内文档框架

> 这一层文档的目标，是**让"现在这个仓库的当前状态"对人或对 coding agent 都可被快速回答**。
> 它不是 API 参考，不是设计散文合集，也不重复 GitHub issues。

## 这一层要回答的五个问题

1. 这段行为由仓库的哪一部分负责？
2. 当前有哪些东西是坏的、未完成的、或脆弱的？
3. 最近改了什么，为什么改？
4. 当前测例或兼容性状态如何？
5. 哪些设计决策已经足够稳定，后续工作应当尊重？

## 目录与职责

| 路径 | 角色 | 何时更新 |
| --- | --- | --- |
| [code-map.md](./code-map.md) | 代码库地图（浅层） | 所有权边界变化时 |
| [known-issues.md](./known-issues.md) | 已知问题与当前限制 | 状态变化，或重新确认后 |
| [test-status.md](./test-status.md) | 测例与基准通过情况 | 测例集启用 / 结果变化时 |
| [decisions/](./decisions/) | 决策记录（ADR） | 出现跨子系统决策时 |
| [rfcs/](./rfcs/) | 公开草案 / RFC | 进入跨人协作评审时 |
| [small-iterations/](./small-iterations/) | 小迭代记录 | 双周日志容纳不下、又不需要 RFC 时 |
| [postmortems/](./postmortems/) | 事故复盘 | 严重回归后（可选） |

## 与仓库其他文档的关系

- [`../LOG.md`](https://github.com/Recoletas/Pinax/blob/main/docs/LOG.md) —— 共享开发日志（精简里程碑）。本层文档的"已落地"事实，与 LOG 不重复。
- [`../PLAN.md`](https://github.com/Recoletas/Pinax/blob/main/docs/PLAN.md) —— 项目主线计划。`docs/src/` 是 PLAN 之外、可被脚本/agent 直接消费的"当前状态"视图。
- [`../plan/`](https://github.com/Recoletas/Pinax/tree/main/docs/plan) —— 既有迭代计划（含 `map-realism-status.md` / `states-perf-residual-issue.md` / `voronoi-engine-v2.md` 等）。**这些是历史归档**；新流程下相关材料应迁到本层对应子目录。
- [`../superpowers/specs/`](https://github.com/Recoletas/Pinax/tree/main/docs/superpowers/specs) —— 既有设计规格。其中"已接受且仍生效"的可迁到 `decisions/`，"未定稿但需公共评审"的可迁到 `rfcs/`。
- [`../user-manual/`](https://github.com/Recoletas/Pinax/tree/main/docs/user-manual) —— 面向最终用户的中文手册，**与本层正交**，不要把开发文档塞进去。
- [`../engineering/development-standards.md`](https://github.com/Recoletas/Pinax/blob/main/docs/engineering/development-standards.md) —— 编码与 UI 基线。写本层文档时应当参考。
- [`../operations/troubleshooting.md`](https://github.com/Recoletas/Pinax/blob/main/docs/operations/troubleshooting.md) —— 故障定位。本层 `known-issues.md` 是它的索引。

## 应该维护什么 / 不应该维护什么

**应该维护**（按价值从高到低）：
- 当前事实（"现在是怎样"）
- 不变量、决策、失效模式、验证闭环
- 一行就能指出的"事情 X 已稳定，不要再改"

**不应该维护**：
- 没人会持续更新的大型设计文档
- 只是复述代码一眼能看出的机制的 API 文档
- 另一套任务系统（重复 GitHub issues / TODO 文件）
- 与仓库自动化 skill 重复的构建/验证操作手册
- 未公开的个人草稿、私有环境配置和原始调试输出

## 边界：当前事实 vs 公开草案

- `code-map.md` / `known-issues.md` / `test-status.md` / `decisions/` 记录**"现在是怎样"**。
- `rfcs/` 记录**"可能如何改变"**。
- 草案一旦被接受，其结论应转写到对应的当前事实页 / 决策记录 / 或在 RFC 目录内**明确标记为 canonical implementation source**。
- 草案本身不陈述"已经落地"的当前实现事实。

## 活动登记 vs Backlog

本层不是 backlog。GitHub issues / PR 负责工作项、讨论、验收条件和长线程；
本层只保留**当前仍然生效、会改变诊断或验证路径的操作性事实**，并尽量通过链接指向对应 issue / PR，而不是重复复述。

## 维护规则

- 同一份事实只在一处声明；其他位置用链接。
- 写"是什么"和"为什么"；少写"如何"（除非是不变量或陷阱）。
- 任何"已稳定"的能力都允许被压缩成一行；旧版展开描述删除。
- 一份文档主要在复述代码里已经一眼能看出的机制时，删除它。
- 测例名 / 文件名 / 行号要带可被 `grep` 验证的锚点，不要泛指。
