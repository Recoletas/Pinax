# 文档导航

这里是 Pinax 的工程文档入口。按需要选择使用指南、部署说明或开发资料。

产品介绍以核心工作台为中心：基础写作与通用 AI，关联世界书后的特色 AI，以及独立跑团。设定按资料、各项设定、高级条目、地图说明；漫画和视频列为边缘扩展。用户指南提供流程概览，具体操作留在对应章节。

| 我要做什么 | 从这里开始 |
| --- | --- |
| 使用 Pinax 写作 | [作者使用指南](./user-manual/README.md) · [快速开始](./user-manual/01-quickstart.md) · [常见问题](./user-manual/08-faq.md) |
| 自行部署或排障 | [README 的本地运行](../README.md#开发者本地运行) · [运维排障](./operations/troubleshooting.md) · [服务端配置示例](../server/.env.example) |
| 参与开发 | [贡献指南](../CONTRIBUTING.md) · [代码地图](./src/code-map.md) · [测试状态](./src/test-status.md) |

面向作者的“帮助”应直接进入用户手册；`docs/src/` 继续承载架构、决策、验证和维护记录，不与作者手册重复维护正文。

## 当前工程入口

> 当前只维护一份产品级路线图。旧专题和 agent run 只作为研究、决策与验证证据。

| 文档 | 用途 |
| --- | --- |
| [PLAN.md](./PLAN.md) | 当前工程边界与执行模型 |
| [plan/pinax-integrated-product-roadmap.md](./plan/pinax-integrated-product-roadmap.md) | 当前唯一产品级路线图：设定、地理、历史、冒险、写作与视听输出 |
| [STATUS.md](./STATUS.md) | 当前 session 状态、下一步和最近验证 |
| [LOG.md](./LOG.md) | 近期用户可感知变化和文档定位调整 |
| [UI/UX 与故事试演计划](./plan/authoring-ux-and-story-play-plan-20260905.md) | 当前Authoring体验优化任务、依赖、验收；进行中的计划不作为清理对象 |
| [src/code-map.md](./src/code-map.md) | 代码 owning surface，找行为负责人 |
| [src/known-issues.md](./src/known-issues.md) | 当前风险、已知缺口和稳定限制 |
| [src/test-status.md](./src/test-status.md) | 完整验证命令、测试预算与浏览器/真实渠道边界 |

## 其他入口

| 文档 | 用途 |
| --- | --- |
| [src/index.md](./src/index.md) | 当前事实层的维护规则 |
| [src/decisions/](./src/decisions/) | 已接受决策记录（ADR） |
| [src/rfcs/](./src/rfcs/) | 仍需评审或保留上下文的设计草案 |
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
- 创作工作台是当前作者入口；旧研究中的 `Writing.vue` 或旧工具名称只代表当时的实现，不用于推定当前 owner。
- 历史规格与研究保留原始语境；失效的当前入口应修正，不为了清理而改写历史验收事实。一次性调试脚本写入被忽略的 `tmp/`，不要与正式Gate脚本混放。
