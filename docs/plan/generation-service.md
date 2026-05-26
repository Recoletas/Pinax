# 04 - 统一生成任务层

状态：基础已完成

## 1. 在工具链中的位置

生成服务现在是全项目 AI 调用的统一任务层，而不是某个页面共用的工具函数。

它负责统一处理：

- 任务命名。
- prompt 版本透传。
- 流式与非流式入口。
- 解析、校验和重试策略。
- attempt 元数据和日志可观测性。

## 2. 当前已经完成的收口

- `runGenerationTask()` 已承担非流式任务入口。
- `runGenerationStreamTask()` 已承担流式任务入口。
- API 层普通/流式请求都已透传 `taskType`、`promptVersion`、`attemptName`。
- 架构护栏已限制 `sendChat()` 和 `sendChatStream()` 的直接调用范围。
- 诗歌、散文、体验、写作、顾问、世界书导入都已接入统一任务层。

## 3. 当前任务地图

### 3.1 体验与写作主链路

| 任务 | taskType |
|------|----------|
| 小说体验开局 | `narrative.init` |
| 小说体验续写 | `narrative.continue` |
| 体验整理素材 | `experience.asset-summary` |
| 写作扩展 | `writing.expand` |
| 写作改写 | `writing.rewrite` |
| 写作 Copilot | `writing.copilot` |

### 3.2 顾问与辅助链路

| 任务 | taskType |
|------|----------|
| 创作顾问 | `advisor.review` |

### 3.3 诗歌 / 散文专用入口

| 任务 | taskType |
|------|----------|
| 诗歌灵感树 | `poetry.tree` |
| 诗歌续写分支 | `poetry.continue` |
| 诗歌分镜树 | `poetry.directing-tree` |
| 诗歌例句 JSON 修复 | `poetry.examples.json` |
| 诗歌例句行格式补齐 | `poetry.examples.lines` |
| 诗歌单标题兜底 | `poetry.examples.single` |
| 散文主题卡片 | `prose.topic-cards` |
| 散文情绪扩展 | `prose.expand-emotion` |
| 散文卡片延伸 | `prose.expand-card` |
| 散文分镜卡片 | `prose.directing-cards` |

### 3.4 设定导入链路

| 任务 | taskType |
|------|----------|
| 世界书文本提炼 | `worldbook.import.extract` |
| 世界书随机生成 | `worldbook.import.random` |

## 4. 这条线已经完成意味着什么

1. 页面和 store 不再需要自己定义一套底层请求协议。
2. 诗歌和散文现在是任务入口的消费者，而不是生成体系里的例外。
3. 后续排查问题可以按 taskType 追踪，而不是按页面猜测。

## 5. 当前不再把它作为主施工线

统一生成服务现在不是主要未完成项，后续只做两类工作：

1. 维护型补强。
例如补任务测试、修局部回归、增加少量任务标签。

2. 为新系统接入提供底座。
例如未来 storyboard 任务、记忆整理任务，都要直接接到现有任务层，不再新开通道。

## 6. 继续沿用的硬规则

- 页面层不直接 import `sendChat()` / `sendChatStream()`。
- 页面层不直接调用 `runGenerationRetryPlan()`。
- 新任务必须有 `taskType`。
- 复杂解析和重试逻辑优先沉到 `services/*` 再由任务层执行。
- 验证优先跑相关测试和 `build`，不跳过任务级回归。

## 7. 后续与新规划的衔接

后续如果要做统一分镜输出层，应直接新增 `storyboard.*` 任务族，而不是在诗歌/散文页继续长页面私有调用。
