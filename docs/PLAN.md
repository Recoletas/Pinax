# 开发计划

> 当前唯一的执行级规划入口是 [plan/current-execution-plan.md](./plan/current-execution-plan.md)。

## 你现在应该先看什么

1. [plan/current-execution-plan.md](./plan/current-execution-plan.md) - 总索引页
2. [plan/session-stability.md](./plan/session-stability.md) - 会话稳定
3. [plan/worldbook-context.md](./plan/worldbook-context.md) - 世界书上下文
4. [plan/asset-loop.md](./plan/asset-loop.md) - 体验素材闭环
5. [plan/generation-service.md](./plan/generation-service.md) - 统一生成服务
6. [plan/memory-system.md](./plan/memory-system.md) - 记忆系统
7. [plan/storyboard-system.md](./plan/storyboard-system.md) - 编导模式
8. [plan/implementation-order.md](./plan/implementation-order.md) - 实施顺序和验收
9. [LOG.md](./LOG.md) - 已完成迭代记录
10. [guides/worldbook-workflow.md](./guides/worldbook-workflow.md) - 世界书操作流程
11. [engineering/development-standards.md](./engineering/development-standards.md) - 开发规范
12. [operations/troubleshooting.md](./operations/troubleshooting.md) - 排障指南

## 当前摘要

项目现在的重点不是继续扩功能，而是把已有能力收束成稳定闭环：

- 稳定小说体验会话
- 让世界书上下文可解释
- 把体验内容沉淀成素材
- 让写作页消费这些素材
- 让记忆写入变成可确认流程
- 统一 AI 生成入口
- 编导模式收束为统一分镜 schema

## 当前开发原则

1. 不再新增直接读写 localStorage 的业务代码。
2. 不再让页面直接拼复杂 prompt。
3. 不再自动写入世界书和长期记忆。
4. 不再扩写第二套体验 store。
5. 所有会话、世界书、生成链路改动都要补测试。
