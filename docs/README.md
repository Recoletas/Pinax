# 文档导航

> 先读方向，再读执行骨架，再按需打开专题计划。当前最重要的变化是：**`character-driven` 已经是已采纳方向，`playable-worldbook` 现在是执行骨架。**

## 先读这几份

| 文档 | 用途 |
| --- | --- |
| [PLAN.md](./PLAN.md) | 当前方向、执行模型、冻结区和近期重点 |
| [plan/character-driven-arc.md](./plan/character-driven-arc.md) | 已采纳的产品方向：角色化 AI GM |
| [plan/playable-worldbook-roadmap.md](./plan/playable-worldbook-roadmap.md) | 迁移期执行骨架：runtime / content / trigger 主链 |
| [plan/playable-worldbook-parallel-plan.md](./plan/playable-worldbook-parallel-plan.md) | 接下来并行分工与避冲突边界 |
| [LOG.md](./LOG.md) | 近期用户可感知变化和文档定位调整 |
| [src/code-map.md](./src/code-map.md) | 代码 owning surface，找行为负责人 |
| [src/known-issues.md](./src/known-issues.md) | 当前风险、已知缺口和稳定限制 |

## 其他入口

| 文档 | 用途 |
| --- | --- |
| [src/index.md](./src/index.md) | 当前事实层的维护规则 |
| [src/decisions/](./src/decisions/) | 已接受决策记录（ADR） |
| [src/rfcs/](./src/rfcs/) | 仍需评审或保留上下文的设计草案 |
| [user-manual/README.md](./user-manual/README.md) | 面向用户的说明书 |
| [content-review/border-kingdom-review.md](./content-review/border-kingdom-review.md) | 旗舰世界内容 review |
| [demo/border-kingdom-adventure.md](./demo/border-kingdom-adventure.md) | 边境王国 demo case：手测执行稿、小说样例、分镜节点 |
| [content-review/border-kingdom-ui-reference.md](./content-review/border-kingdom-ui-reference.md) | 入口 UI 参考与信息优先级约束 |
| [engineering/development-standards.md](./engineering/development-standards.md) | 开发与 UI 基线 |
| [operations/troubleshooting.md](./operations/troubleshooting.md) | 运维与故障定位 |
| [superpowers/README.md](./superpowers/README.md) | 设计草案 / 执行计划 / agent 基础设施材料；不是当前事实入口 |

## 本地文档站

```bash
npm run docs:dev
npm run docs:build
```

VitePress 源码位于 [src/](./src/)，入口页是 [src/index.md](./src/index.md)。不要提交 `.vitepress/cache/` 或 `.vitepress/dist/` 生成产物。

## 维护规则

- “方向”只在 `character-driven-arc.md` 里定。
- “底层主链”只在 `playable-worldbook-roadmap.md` 里定。
- “谁接下来改什么”只在 `playable-worldbook-parallel-plan.md` 里定。
- 用户手册描述当前可用事实，不提前把未实现的新 UI 写成既成事实。
