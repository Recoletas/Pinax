# 05 - 记忆系统方案

> 目标：让系统记住作者和作品，但不污染上下文。

## 1. 当前问题

当前项目里已经有 `recordMemory` 的影子，但记忆机制还比较早期：

- 可能静默写入。
- 没有明确作用域。
- 没有候选确认。
- 没有针对不同作品的隔离。

这很危险，因为长期记忆一旦污染，后续所有生成都会受影响。

## 2. 目标

把记忆拆成三层：

1. 全局作者偏好。
2. 当前作品事实。
3. 当前会话摘要。

并且所有写入都先经过候选确认。

## 3. 记忆模型

建议统一成：

```ts
type MemoryRecord = {
  id: string
  schemaVersion: number
  scope: 'global-author' | 'project' | 'session'
  scopeId: string
  kind: 'author-preference' | 'project-fact' | 'character-state' | 'plot-event' | 'style-sample' | 'constraint'
  content: string
  confidence: number
  sourceRef: string
  status: 'pending' | 'active' | 'rejected' | 'stale'
  createdAt: number
  updatedAt: number
}
```

## 4. 具体方案

### 4.1 候选而不是直接写入

体验输出、写作输出、世界书抽取结果，先进入 memory candidate。

候选需要：

- 可编辑
- 可拒绝
- 可确认
- 可标记失效

### 4.2 作用域隔离

读取记忆时必须按 scope 过滤。

例如：

- 作者偏好跨作品可复用。
- 项目事实只用于当前作品。
- 会话摘要只用于当前会话。

### 4.3 mem0 适配层

先做统一 memory service，再接 mem0。

要求：

- 前端不直接依赖 mem0 SDK。
- 本地 fallback 保留。
- 后续替换后端不影响页面层。

## 5. 实施步骤

### 第一步

- 先定义 memory candidate 结构。
- 把静默写入改成候选生成。

### 第二步

- 做记忆确认界面或侧栏。
- 支持编辑、确认、拒绝。

### 第三步

- 实现 scope 读取。
- 让项目间记忆隔离。

### 第四步

- 接入 mem0 适配层。

## 6. 验收标准

- 记忆不会自动污染。
- 记忆有明确作用域。
- 不同作品互不干扰。
- 作者可以看到和控制写入内容。

