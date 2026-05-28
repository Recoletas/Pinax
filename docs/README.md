# 文档导航（UI 可用性重构阶段）

> 当前阶段主目标：先解决用户可用性问题，再用兼容检查兜住移动端和低分辨率阻塞问题，之后再继续新增功能。

## 建议阅读顺序

1. [PLAN.md](./PLAN.md)
	- 当前目标、已完成归档摘要、UI 可用性优先原则。
2. [plan/current-execution-plan.md](./plan/current-execution-plan.md)
	- 当前迭代执行面板（按优先级和验收口径推进）。
3. [engineering/development-standards.md](./engineering/development-standards.md)
	- 开发约束，尤其是 UI 可用性和交互基线。
4. [operations/troubleshooting.md](./operations/troubleshooting.md)
	- 常见故障与 UI 可用性排障清单。
5. [LOG.md](./LOG.md)
	- 仅保留近期里程碑和风险，不再记录长流水。

## 当前有效文档

| 文档 | 用途 | 状态 |
| --- | --- | --- |
| [PLAN.md](./PLAN.md) | 项目主线与边界 | 当前主入口 |
| [plan/current-execution-plan.md](./plan/current-execution-plan.md) | UI 可用性重构执行顺序与验收 | 当前主入口 |
| [plan/page-transition.md](./plan/page-transition.md) | 页面间动画衔接与反馈一致性 | 当前 P2 视觉 polish 执行文档 |
| [engineering/development-standards.md](./engineering/development-standards.md) | 编码与 UI 基线 | 持续维护 |
| [operations/troubleshooting.md](./operations/troubleshooting.md) | 故障定位和回归路径 | 持续维护 |
| [LOG.md](./LOG.md) | 近期里程碑、验证、风险 | 精简维护 |

## 归档专题（按需查看）

以下专题不再作为日常推进入口，仅在改动对应模块时查边界：

- [plan/memory-system.md](./plan/memory-system.md)
- [plan/storyboard-system.md](./plan/storyboard-system.md)
- [plan/implementation-order.md](./plan/implementation-order.md)

## 维护规则（简化优先）

- 已实现且稳定的能力，只保留一行“结果摘要”，删除过程性描述。
- 同一主题只保留一个主入口文档，避免重复叙述。
- 每次迭代只更新：目标、用户可感知变化、验证结果、风险。
