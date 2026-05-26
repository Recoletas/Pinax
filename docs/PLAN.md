# 开发计划入口

> 后续推进默认只看本文件和 [plan/current-execution-plan.md](./plan/current-execution-plan.md)。专题文件只在需要细节或验收口径时打开。

## 当前主线

| 模块 | 状态 | 当前判断 |
|------|------|----------|
| 会话稳定 | 完成 | 新建、切换、保存、恢复和世界书绑定已收口 |
| 世界书上下文 | 完成 | 已抽上下文构建器，并接入命中/常驻/预览链路 |
| 体验素材闭环 | 完成 | 素材可沉淀、整理、入正文、入纲要、做续写参考、转笔记、入世界书 |
| 统一生成服务 | 进行中 | 写作、顾问、体验主生成已接入；剩余诗歌/散文/世界书导入等旧调用 |
| 记忆系统 | 基本完成 | 候选、scope、确认、mem0 同步/读取已接入；剩余整理和冲突策略 |
| 编导模式 | 待做 | 需要统一 storyboard schema、版本和导出校验 |

## 下一步只看

1. [plan/current-execution-plan.md](./plan/current-execution-plan.md) - 当前执行面板。
2. 当前正在推进的专题文件，例如 [plan/generation-service.md](./plan/generation-service.md)。
3. [LOG.md](./LOG.md) - 精简里程碑和已知风险。

## 当前开发原则

- 不新增页面级复杂 prompt 拼接。
- 不新增业务代码直接调用 `sendChat()` / `sendChatStream()`。
- 不新增直接读写 `localStorage` 的页面逻辑，优先走 service。
- 自动写入世界书、长期记忆前必须经过候选或显式确认。
- 用户可感知的更新要说明“用户做什么能看到”。
