# 提示词工程

> 本框架的提示词工程基于两大来源：**酒馆风格提示词** 和 **prompt-optimizer**。

## 1. 酒馆风格提示词

### 1.1 核心原则

- **第一人称扮演**：AI 作为角色直接与用户对话
- **记忆锚定**：通过 `{{char}}` / `{{user}}` 等变量注入角色设定
- **场景注入**：通过 `{{scenario}}` 等注入当前情境

### 1.2 变量系统

| 变量 | 说明 |
|------|------|
| `{{char}}` | 当前角色名 |
| `{{user}}` | 用户名 |
| `{{scenario}}` | 当前场景描述 |
| `{{context}}` | 世界书条目注入 |

### 1.3 叙事格式

```markdown
*动作描述*
"对话内容"
（心理活动）
```

## 2. prompt-optimizer 集成

> prompt-optimizer 尚未接入，正在规划集成。

### 2.1 优化目标

- 自动压缩冗余提示词
- 提升 Token 效率
- 保持输出质量

### 2.2 集成方式

```javascript
// 规划中
import { optimize } from 'prompt-optimizer'

const optimizedPrompt = await optimize({
  prompt: rawPrompt,
  maxTokens: 2048,
  model: 'gpt-4'
})
```

## 3. 分层提示词架构

详见 [novel-experience.md](./novel-experience.md) 第四章，本框架采用四层架构：

```
Layer 1: 系统提示词 (叙事者身份 + 格式规则 + 风格指导)
Layer 2: 世界书注入 (关键词匹配 + 常量/分组条目)
Layer 3: 情境上下文 (角色状态 + 时间背景 + 活动 + 情绪)
Layer 4: Few-shot 示例 (2-3 个高质量片段)
```

## 4. 各模块提示词特点

| 模块 | 提示词风格 |
|------|-----------|
| 小说体验 | 酒馆风格，叙事者 + 角色扮演混合 |
| 诗歌工坊 | 意象生成，强调文学性和情感表达 |
| 散文编导 | 分镜指令，景别/运镜/音效 |
| 编辑器 AI 补全 | 续写风格，保持文风一致 |

## 5. 最佳实践

1. **结构化输出**：AI 输出先过 JSON 解析，再做字段归一化
2. **错误边界**：网络/解析失败时提供友好提示
3. **重试机制**：业务层通过 `runGenerationRetryPlan` 管理重试
4. **避免硬编码**：`src/services/api.js` 统一调用入口