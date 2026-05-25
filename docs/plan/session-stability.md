# 01 - 会话稳定方案

> 目标：保证小说体验可以稳定创建、保存、恢复、重写，不误删全局资料。

## 1. 为什么要先做这个

当前体验页已经接入会话选择，但边界还不稳：

- 新建会话会混入旧运行态。
- 重置逻辑会误删全局写作资料。
- 世界书切换会直接重建上下文，可能丢当前剧情。
- 会话保存还没有完全覆盖编辑、删除、重写后续等动作。

如果这个基础不稳，后面的世界书、素材、记忆、编导都会被污染。

## 2. 当前现状

相关位置：

- `src/pages/Experience.vue`
- `src/stores/gameStore.js`
- `src/components/GamePanel.vue`
- `src/components/SessionPicker.vue`

当前实现里已经有：

- `sessions` / `currentSessionId`
- `createSession`
- `loadSession`
- `saveCurrentSession`
- `deleteSession`
- `resetGameState`

但这些动作现在承担了两类职责：

1. 当前会话运行态。
2. 全局写作资料。

这两个层次必须拆开。

## 3. 目标数据边界

### 3.1 会话应该保存什么

```ts
type ExperienceSession = {
  id: string
  schemaVersion: number
  title: string
  worldbookId: string | null
  messages: Message[]
  chatHistory: ChatMessage[]
  runtimeState: {
    character: object
    time: object
    worldMap: object
    activities: array
    flags: object
  }
  createdAt: number
  updatedAt: number
}
```

### 3.2 不应该被会话清掉的内容

- 世界书本体
- 书籍与章节
- 角色卡库
- 笔记库
- 长期记忆

## 4. 具体方案

### 4.1 拆分 reset 语义

把现在的 `resetGameState()` 拆成两个动作：

#### `resetRuntimeState()`

只清当前会话运行态。

应包括：

- `messages`
- `chatHistory`
- `time`
- `player`
- `inventory`
- `quests`
- `flags`
- `activities`
- `npcRelations`
- `discoveredPlaces`
- `completedQuests`
- `writingCharacter`
- `writingTime`
- `worldMapState`
- `activeMechanism`
- `mechanismContext`
- `milestoneEvent`

#### `resetGlobalWritingAssets()`

只在用户明确要求时调用。

应包括：

- `WRITING_CHARACTER`
- `WRITING_TIME`
- `WRITING_WORLDMAP`
- `WRITING_ACTIVITIES`

### 4.2 让 createSession 更明确

建议接口：

```js
createSession({
  title = '新会话',
  worldbookId = null,
  inheritRuntimeState = false
} = {})
```

规则：

- 默认创建空会话。
- 只有明确传 `inheritRuntimeState` 才继承当前运行态。
- 新会话必须持久化 `worldbookId`。

### 4.3 保存时机统一

以下动作后必须调用 `saveCurrentSession()`：

- 用户发送消息
- AI 回复完成
- 编辑消息保存
- 删除消息
- 重写后续完成
- 会话标题变更
- 世界书切换确认完成

### 4.4 世界书切换保护

切换世界书时，不能直接 `initGame()`。

应当提供最少一种保护逻辑：

1. 应用于当前会话并重建上下文。
2. 新建会话并使用该世界书。
3. 只设为默认，不影响当前会话。

如果当前会话已有消息，默认必须走确认。

### 4.5 会话恢复流程

加载会话后，必须恢复：

- `messages`
- `chatHistory`
- `writingCharacter`
- `writingTime`
- `worldMapState`
- `activities`
- `playerCharacter`
- `currentSessionId`

并确保 `isPlaying`、`isLoading`、`activeMechanism` 等运行态不会残留旧值。

## 5. 实施步骤

### 第一步

- 拆分 `resetGameState()`。
- 调整 `handleSessionCreate()`。
- 明确新建会话不会删除全局资料。

### 第二步

- 让 `createSession()` 接收明确参数。
- 在 `Experience.vue` 和 `gameStore` 里统一保存时机。

### 第三步

- 为世界书切换加入确认流程。
- 保证会话里有 `worldbookId`。

### 第四步

- 清掉调试日志。
- 补会话单元测试和冒烟测试。

## 6. 验收标准

- 新建会话不会清掉写作资料。
- 刷新页面后可以恢复当前会话。
- 删除消息不会回魂。
- 重写后续结果可以持久化。
- 世界书切换不会静默覆盖当前剧情。

