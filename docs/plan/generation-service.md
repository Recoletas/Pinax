# 04 - 统一 AI 生成服务

> 目标：把所有模型调用统一到同一套生成服务里，避免页面和 store 各写一套策略。

## 1. 当前问题

现在仓库里已经有：

- `sendChat`
- `sendChatStream`
- `runGenerationRetryPlan`
- `getResolvedApiSettings`

但不同页面仍然有不同调用路径，容易出现：

- 流式和非流式行为不一致
- 重试策略不一致
- JSON 解析策略不一致
- 错误提示不一致
- meta 记录不一致

## 2. 目标

统一成一个生成任务层：

```text
taskType + messages + settings + options
  → generationService
  → stream/result
  → parse/validate/retry
  → meta/event
```

## 3. 任务类型

建议先覆盖这些任务：

- `narrative.continue`
- `narrative.init`
- `narrative.summarize`
- `writing.copilot`
- `writing.rewrite`
- `worldbook.extract`
- `memory.extract`
- `storyboard.generate`
- `advisor.review`

## 4. 具体方案

### 4.1 新增 generationService

建议新增文件：

`src/services/generationService.js`

统一接口：

```js
runGenerationTask({
  taskType,
  messages,
  settings,
  stream = false,
  parse = null,
  validate = null,
  retries = 0,
  metadata = {}
})
```

### 4.2 统一重试

所有需要重试的任务都通过同一入口处理。

规则：

- 先生成。
- 再解析。
- 再校验。
- 失败后重试。
- 最后返回明确失败状态。

### 4.3 统一 prompt 管理

把 prompt 模板集中到 `promptBuilder.js`。

要求：

- 每个 prompt 有任务名。
- 每个 prompt 有版本号。
- 每次请求 meta 能记录 prompt 版本。

### 4.4 统一错误策略

页面层不直接处理底层请求错误格式。

统一要求：

- loading 状态由服务返回结果驱动。
- 错误消息标准化。
- 生成 meta 可上报事件。

## 5. 实施步骤

### 第一步

- 抽 `generationService`。
- 先接管体验页和写作页最核心的生成任务。

### 第二步

- 把 `runGenerationRetryPlan` 迁移成服务内部能力。

### 第三步

- 集中 prompt 模板。
- 给不同任务补最小测试。

## 6. 验收标准

- 页面不再直接关心 `sendChat` 细节。
- 生成、重试、解析、meta 记录行为统一。
- 体验页、写作页、顾问页都能复用同一套服务。

