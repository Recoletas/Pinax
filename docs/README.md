# 文档导航

> 先读当前主线和当前事实；专题路线图按需打开，只有标明 `SUPERSEDED` 的材料才默认按历史看。

## 先读这几份

| 文档 | 用途 |
| --- | --- |
| [PLAN.md](./PLAN.md) | 当前产品主线、近期重点和非目标 |
| [LOG.md](./LOG.md) | 近期用户可感知变化和验证记录 |
| [src/code-map.md](./src/code-map.md) | 代码 owning surface，找行为负责人 |
| [src/known-issues.md](./src/known-issues.md) | 当前风险、已知缺口和稳定限制 |
| [src/test-status.md](./src/test-status.md) | 最近测试 / 构建 / 视觉验收状态 |

## 其他入口

| 文档 | 用途 |
| --- | --- |
| [src/index.md](./src/index.md) | 当前事实层的维护规则 |
| [src/decisions/](./src/decisions/) | 已接受决策记录（ADR） |
| [src/rfcs/](./src/rfcs/) | 仍需评审或保留上下文的设计草案 |
| [user-manual/README.md](./user-manual/README.md) | 面向用户的说明书 |
| [content-review/border-kingdom-review.md](./content-review/border-kingdom-review.md) | 旗舰世界内容 review：雾潮暮湾是否够格做单主推世界 |
| [demo/border-kingdom-adventure.md](./demo/border-kingdom-adventure.md) | 边境王国 demo case：手测执行稿、小说样例、分镜节点 |
| [content-review/border-kingdom-ui-reference.md](./content-review/border-kingdom-ui-reference.md) | 单旗舰世界入口 UI 参考与信息优先级约束 |
| [engineering/development-standards.md](./engineering/development-standards.md) | 开发与 UI 基线 |
| [operations/troubleshooting.md](./operations/troubleshooting.md) | 运维与故障定位 |
| [plan/README.md](./plan/README.md) | 计划文档分层：当前主线专题 + 活跃技术专题 + 历史背景 |
| [superpowers/README.md](./superpowers/README.md) | 设计草案 / 执行计划 / agent 基础设施材料；不是当前事实入口 |

## 本地文档站

```bash
npm run docs:dev
npm run docs:build
```

VitePress 源码位于 [src/](./src/)，入口页是 [src/index.md](./src/index.md)。不要提交 `.vitepress/cache/` 或 `.vitepress/dist/` 生成产物。

## 维护规则

- 当前事实只写一处，其他地方链接过去。
- 已稳定的能力压缩成结果摘要，不保留长过程。
- 新问题先写到 [src/known-issues.md](./src/known-issues.md)，设计方案再进 [src/rfcs/](./src/rfcs/)。
- 每次跑全量测试后更新 [src/test-status.md](./src/test-status.md)。
