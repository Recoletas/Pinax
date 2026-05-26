# 04 - 统一 AI 生成服务

状态：进行中

## 已完成

- `src/services/generationService.js` 提供 `runGenerationTask()`。
- `runGenerationTask()` 统一携带 `taskType`、`promptVersion`、`attemptName`。
- `src/services/generationService.js` 提供 `runGenerationStreamTask()`。
- API 层普通/流式请求已透传生成任务元数据。
- 架构护栏已禁止业务代码直接调用 `sendChat()`。
- 架构护栏已禁止业务代码直接调用 `sendChatStream()`。

## 已接入任务

| 任务 | 状态 | taskType |
|------|------|----------|
| 写作扩展 | 完成 | `writing.expand` |
| 写作改写 | 完成 | `writing.rewrite` |
| 写作 Copilot | 完成 | `writing.copilot` |
| 体验整理素材 | 完成 | `experience.asset-summary` |
| 创作顾问 | 完成 | `advisor.review` |
| 小说体验开局/续写 | 完成 | `narrative.init` / `narrative.continue` |

## 剩余任务

- 迁移诗歌工坊里的直接 `runGenerationRetryPlan()` 调用。
- 迁移散文随笔里的直接 `runGenerationRetryPlan()` 调用。
- 迁移世界书快速导入里的直接 `runGenerationRetryPlan()` 调用。
- 梳理 `experienceStore` 是否仍有实际运行价值；如果没有，标为 legacy 或收口。

## 推进规则

- 每次只迁移一组相关调用。
- 先抽 service，再改页面。
- 验证优先跑相关测试和 `npm run build`。
