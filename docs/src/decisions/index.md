# 决策记录（ADR）

> 跨子系统的、影响后续工作的设计决策。
> 决策一旦做出，就应当被尊重 —— 除非有显式的新决策覆盖（见 §生命周期）。

## 状态字段

- **proposed** —— 提议中，未达成共识
- **accepted** —— 已接受
- **superseded by ADR-NNNN** —— 已被新决策覆盖
- **deprecated** —— 已废弃但仍有代码引用

## 命名与模板

文件命名 `ADR-NNNN-<short-slug>.md`。模板：

```markdown
# ADR-NNNN: <标题>

- **状态**: accepted
- **日期**: YYYY-MM-DD
- **领域**: world-map / 文本生成 / UI / 基础设施 / ...
- **影响范围**: <哪个子系统 / 哪些文件>

## 背景

为什么需要做这个决策。一两段。

## 决策

我们要做什么。一两段。

## 备选方案

考虑了哪些方案、各自的代价、为什么没选。

## 后果

- 正面：……
- 负面 / 代价：……
- 后续约束：后续工作应当尊重的不变量。
```

## 索引

| 编号 | 标题 | 状态 | 日期 | 领域 |
| --- | --- | --- | --- | --- |
| [ADR-0001](./ADR-0001-map-gen-perf-profiling.md) | 地图生成管线分阶段计时基础设施 | accepted | 2026-06-01 | world-map |
| [ADR-0002](./ADR-0002-nations-perf-fix.md) | `states` 与 `roads` 阶段性能修复 | accepted | 2026-06-02 | world-map |
| [ADR-0003](./ADR-0003-azgaar-pipeline.md) | Azgaar 风格地图管线重写（06-08 后已恢复模板语义） | accepted / amended | 2026-06-04 | world-map |
| [ADR-0004](./ADR-0004-engine-oss-replacements.md) | 引擎 5 处自造基础设施替换为成熟 OSS 库（模板删除说明已过期） | accepted / amended | 2026-06-05 | world-map |

## 生命周期

- 决策记录**不是**设计文档。设计文档草稿进 [`../rfcs/`](../rfcs/)。
- 决策记录**不是**任务清单。任务在 GitHub issues。
- 决策记录只保留**已经稳定下来**的决策；草案不允许进 `decisions/`，进 `rfcs/`。
- 任何后续工作若要推翻一个 `accepted` 决策，必须新开 ADR 显式 supersede。

## 关系

- [`../rfcs/`](../rfcs/) —— 草案；被接受后迁入此处（或保留在 `rfcs/<slug>/` 并标记 canonical implementation source）。
- [`../small-iterations/`](../small-iterations/) —— 局部语义变化；不上升到 ADR。
- [`../known-issues.md`](../known-issues.md) —— 决策之外的可观察问题。
