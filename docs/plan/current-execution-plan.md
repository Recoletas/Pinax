# 当前执行计划

> 本文件是后续继续推进时的默认入口。不要每次从所有 plan 重新判断，先看这里。

## 当前进度

粗略进度：75%

| 优先级 | 模块 | 状态 | 下一步 |
|--------|------|------|--------|
| 1 | 会话稳定 | 完成 | 只做回归修 bug |
| 2 | 世界书上下文 | 完成 | 后续仅补预览体验和预算细节 |
| 3 | 体验素材闭环 | 完成 | 后续仅优化 UI 和批量处理体验 |
| 4 | 统一生成服务 | 进行中 | 继续迁移诗歌/散文/世界书导入等直接 `runGenerationRetryPlan()` 调用 |
| 5 | 记忆系统 | 基本完成 | 做候选整理、冲突处理、同步状态展示收口 |
| 6 | 编导模式 | 待做 | 统一 storyboard schema、版本化、导出校验 |

## 当前正在推进

专题：[generation-service.md](./generation-service.md)

已完成：

- `runGenerationTask()` 接管写作扩展、改写、Copilot、体验整理。
- `runGenerationStreamTask()` 接管创作顾问和小说体验主生成。
- 生成请求会透传 `taskType`、`promptVersion`、`attemptName`。
- 架构护栏已禁止业务代码直接调用 `sendChat()` 和 `sendChatStream()`。

下一步：

- 迁移诗歌工坊、散文随笔、世界书快速导入中的直接 `runGenerationRetryPlan()` 调用。
- 能抽 service 的先抽 service，避免页面继续膨胀。
- 每次迁移只跑相关测试和 `build`，避免一次测试过多。

## 已知需要记住

- 新会话初始化曾出现角色名复用/疑似缓存或旧上下文污染，暂未继续排查；后续碰会话初始化时优先复查 prompt 和传参边界。
- 写作页 UI 已做多次调整，新增区域必须保持现有风格，不要再加割裂的抽屉式入口。
- `docs/LOG.md` 保留精简里程碑，不再复制每个小 patch 的长说明。
