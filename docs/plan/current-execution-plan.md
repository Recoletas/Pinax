# 当前执行计划

> 这是总索引页。详细方案分散在各专题文件中。

## 1. 当前判断

项目已经有完整方向，但还没有稳定闭环。

已存在的能力：

- 小说体验页，支持世界书、事件、AI 叙事、重写后续、会话选择。
- 小说写作页，支持书籍/章节管理、富文本能力、Copilot 雏形。
- 世界书存储与导入导出，能兼容 SillyTavern。
- 诗歌工坊、散文随笔、笔记、生图、顾问。
- `useStorage`、`useApiSettings`、`generationRetry`、Vitest 工程护栏。

当前主要问题：

1. 体验数据边界不清，`gameStore` 和 `experienceStore` 并存。
2. 会话系统的创建、重置、切换语义不稳定。
3. 世界书还是关键词注入，缺少可解释上下文。
4. 体验内容到写作素材的沉淀链路不完整。
5. AI 生成入口没有完全统一。
6. 记忆系统还停留在静默写入阶段。

## 2. 目标闭环

```text
世界书 / 角色 / 设定
  → 小说体验生成剧情
  → 体验片段沉淀为素材
  → 写作页继续加工正文
  → AI 抽取新增设定与记忆
  → 反哺世界书和后续体验
```

## 3. 总体原则

1. 只保留一个主体验状态源，短期以 `gameStore` 为准。
2. 会话和全局资料分离。
3. AI 写入必须可确认。
4. 先抽服务，再谈目录重构。

## 4. 专题文档

| 编号 | 文档 | 说明 |
|------|------|------|
| 01 | [session-stability.md](./session-stability.md) | 会话、重置、保存、世界书切换 |
| 02 | [worldbook-context.md](./worldbook-context.md) | 世界书上下文构建、条目分层、注入预览 |
| 03 | [asset-loop.md](./asset-loop.md) | 体验内容沉淀为写作素材的闭环 |
| 04 | [generation-service.md](./generation-service.md) | 统一 AI 生成服务和 prompt 管理 |
| 05 | [memory-system.md](./memory-system.md) | 记忆候选、确认写入、作用域隔离 |
| 06 | [storyboard-system.md](./storyboard-system.md) | 编导模式、分镜 schema、导出校验 |
| 07 | [implementation-order.md](./implementation-order.md) | 实施顺序、风险、验收标准 |

## 5. 当前优先级

1. 先稳会话和体验主链路。
2. 再做世界书上下文。
3. 然后打通素材闭环。
4. 再统一生成服务。
5. 最后收束记忆和编导。
