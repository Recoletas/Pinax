# 当前事实层

> `docs/src/` 只记录“现在这个仓库是什么状态”。它不是 API 参考，也不是任务系统。

## 快速回答

| 问题 | 先看 |
| --- | --- |
| 当前产品主线是什么？ | [`../PLAN.md`](../PLAN.md) |
| 最近改了什么？ | [`../LOG.md`](../LOG.md) |
| 某段行为归谁负责？ | [`code-map.md`](./code-map.md) |
| 当前有哪些风险或已知限制？ | [`known-issues.md`](./known-issues.md) |
| 最近测试 / 构建状态如何？ | [`test-status.md`](./test-status.md) |
| 哪些跨系统决策已经稳定？ | [`decisions/`](./decisions/) |
| 哪些方案仍是草案？ | [`rfcs/`](./rfcs/) |

## 目录职责

- [`code-map.md`](./code-map.md)：浅层代码地图和 owning surface。
- [`known-issues.md`](./known-issues.md)：会影响诊断或验收的风险、缺口、稳定限制。
- [`test-status.md`](./test-status.md)：最近一次验证结果和必跑命令。
- [`decisions/`](./decisions/)：已接受决策记录。
- [`rfcs/`](./rfcs/)：仍需评审或保留上下文的设计草案。
- [`small-iterations/`](./small-iterations/)：不值得写 RFC、但需要留痕的小迭代。
- [`postmortems/`](./postmortems/)：严重回归后的复盘。

## 维护规则

- 当前事实只写一处；其他地方链接过去。
- 写“是什么”和“为什么”，少写过程。
- 已稳定能力压缩成摘要，不保留长流水账。
- 新风险先写 [`known-issues.md`](./known-issues.md)，设计变化再进 RFC / ADR。
- 跑完全量验证后更新 [`test-status.md`](./test-status.md)。

## 不维护

- 公开 API 详细说明。
- 重复 GitHub issues / TODO 的 backlog。
- 只复述代码一眼能看出的机制。
- 私有环境配置、个人草稿、原始调试输出。
