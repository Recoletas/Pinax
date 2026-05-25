# 02 - 世界书上下文方案

> 目标：让世界书从“关键词命中”变成“可解释、可预览、可测试的上下文构建”。

## 1. 当前问题

现在的世界书系统已经能做这些事：

- 世界书索引
- 世界书 CRUD
- 条目 CRUD
- 导入导出 SillyTavern
- 关键词匹配

但它还存在几个问题：

1. 世界书注入逻辑分散在 `gameStore`。
2. 关键词匹配没有明确层级。
3. 常驻设定、规则、禁忌、样式没有明确优先级。
4. 用户看不到本次生成到底命中了哪些条目。
5. token budget 只能粗略控制，缺少报告。

## 2. 目标

把世界书处理成一个独立的上下文构建过程：

```text
worldbook + chatHistory + runtimeState + tokenBudget
  → matchedEntries
  → systemMessages
  → budgetReport
  → warnings
```

## 3. 条目分层

建议把条目类型明确化：

- `character`
- `location`
- `item`
- `organization`
- `event`
- `rule`
- `style`
- `forbidden`
- `general`

注入优先级建议：

1. 系统身份和生成目标。
2. 世界书常驻设定。
3. 规则和禁忌。
4. 当前 runtimeState。
5. 关键词命中的具体条目。
6. 近期摘要和用户输入。

## 4. 详细方案

### 4.1 抽上下文构建器

新增服务：

`src/services/worldbookContextBuilder.js`

建议接口：

```js
buildWorldbookContext({
  worldbook,
  chatHistory,
  runtimeState,
  tokenBudget,
  scanDepth
})
```

输出：

- `messages`：要注入的 system message 列表
- `matchedEntries`：命中的条目
- `budgetReport`：预算占用
- `warnings`：截断、重复、空设定等提示

### 4.2 注入预览

输入区提示词详情里要能看到：

- 命中了哪些条目
- 每个条目属于什么类型
- 本次注入用了多少预算
- 哪些条目被截断了

### 4.3 草稿回写

从体验回复中抽取出来的新设定，不要直接写回世界书。

流程应该是：

1. 抽取候选。
2. 进入草稿箱。
3. 用户确认。
4. 再写回 active worldbook。

## 5. 实施步骤

### 第一步

- 抽出 `worldbookContextBuilder`。
- 让 `gameStore` 不再直接拼世界书 prompt。

### 第二步

- 梳理 entry 类型和注入优先级。
- 让常驻规则和禁忌优先于普通条目。

### 第三步

- 在 UI 上做注入预览。
- 展示 budget 和命中条目。

### 第四步

- 增加草稿箱，不直接写世界书。
- 为上下文构建加单测。

## 6. 验收标准

- 世界书注入顺序稳定。
- 规则和禁忌优先级明确。
- 用户能看见本次命中的世界书内容。
- 模型抽错不会直接污染世界书。

