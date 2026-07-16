# 文档导航

> 当前只维护一份产品级路线图。旧专题和 agent run 只作为研究、决策与验证证据。

## 先读这几份

| 文档 | 用途 |
| --- | --- |
| [PLAN.md](./PLAN.md) | 当前工程边界与执行模型 |
| [plan/pinax-integrated-product-roadmap.md](./plan/pinax-integrated-product-roadmap.md) | 当前唯一产品级路线图：设定、地理、历史、冒险、写作与视听输出 |
| [STATUS.md](./STATUS.md) | 当前 session 状态、下一步和最近验证 |
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
| [engineering/agent-orchestration-workflow.md](./engineering/agent-orchestration-workflow.md) | Codex / Claude 分工、worker 看板、上下文保护和验收规则 |
| [engineering/visual-alignment-workflow.md](./engineering/visual-alignment-workflow.md) | direct 标注、视觉切片、截图评分和前端视觉对齐流程 |
| [operations/troubleshooting.md](./operations/troubleshooting.md) | 运维与故障定位 |

## 本地文档站

```bash
npm run docs:dev
npm run docs:build
```

VitePress 源码位于 [src/](./src/)，入口页是 [src/index.md](./src/index.md)。不要提交 `.vitepress/cache/` 或 `.vitepress/dist/` 生成产物。

## 维护规则

- 产品优先级只在 `plan/pinax-integrated-product-roadmap.md` 里定。
- 当前代码事实和风险分别回填 `src/` 文档与 `src/known-issues.md`。
- 用户手册只描述当前可用事实，不把未实现能力写成既成事实。
