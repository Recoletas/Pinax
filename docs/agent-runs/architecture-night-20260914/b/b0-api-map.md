# B0 · API 与存档地图

基线 `37e0679`（含已验证 WIP 快照，基线 verify:full exit 0）。worktree `/home/recoletas/jiuguan/pinax-arch-b-20260914`，分支 `arch/gamestore-20260914`。

## store 表面（迁移前；统一口径见 scripts/experience-store-api-surface.mjs）

- `defineStore('game')`：state 73 顶层键 / 136 actions / 无 getters，文件 4854 行。
  （早期草稿曾记 82 键，为把嵌套对象字面量键也计入的非统一口径；正式口径
  只数 state: () => ({ 块内缩进 4 的顶层键，两期对比脚本以此为准。）
- 模块级可变状态（891-928 行）：`saveSessionDebouncers`、`narrativeAbortControllers`（WeakMap）；`authoringObserverBridge/Scheduler/MemoryTriggers`（let 单例）；`authoringMemoryAgentEnabled`、`authoringActiveProjectId`（let 标量）；`authoringMemoryTriggerEvents/ObserverEvents/DerivedState/ObserverExceptions`（模块级数组）；`authoringObserverResultListeners`（Set，B7 目标）；`authoringLastDocumentRevisions`（Map）、`authoringDocumentSequence`。
- 卸载 flush：`beforeunload/pagehide/visibilitychange` → `flushPending()`（useDebounce 全局 flush，随 gameStore 模块注册）。

## 职责分区（行号为基线）

| 分区 | 行号 | B 包 |
|---|---|---|
| 纯 normalize/clone/快照键（43 个函数/常量） | 100-116, 167-886 | **B1** |
| 会话列表持久化 + 快照构造（loadSessions…deleteSession） | 1998-2175 | **B2** |
| runtime snapshot 投影（getRuntimeSnapshot/applyRuntimeSnapshot） | 2206-2304 | **B3** |
| 历史/分支恢复（persistLatestPlayerHistoryNode、gc/branch/regenerate/switch/rebuild） | 1615-1667, 2831-3266 | B3 部分；分支图为第三批 B11 |
| Authoring observer/记忆运行时 | 4253-4549 + 模块级状态 | **B7** |
| 生成流程（sendAction/generateAIResponse/executeExperienceAction） | 2695-3267, 3289-3919 | 第三批 B9/B12/B16 |
| 状态提取（extract*） | 3920-4249, 4550-4614 | 第三批 B12 |
| 生命周期（initGame/startGame/reset*） | 4616-4801 | 第三批 B14 |
| 机制/对话/里程碑检测 | 2404-2694 | 未排入（低优） |

## 外部消费者（15 文件）

- **Authoring.vue**（关键合同）：`commitAuthoringProseResult`、`handleAuthoringProseUndo`（×3）、`rememberAuthoringSelection`、`subscribeAuthoringObserverResults`、`getAuthoringObserverExceptions/DerivedState`、`setAuthoringProjectId`、`setAuthoringMemoryAgentEnabled`、`sessions/currentSessionId`、`activities/worldMapState/writingCharacters`。observer/prose undo 回执不得改变参数与返回。
- **Experience.vue**：messages、sessions、cancelNarrativeGeneration、executeExperienceAction 链。
- **Notes.vue**：sessions/currentSessionId（只读）。
- 组件层：GamePanel/InputArea/QuestLog/StatusBar/SessionPicker/TimeQuickRail/TimeSettings/WorldMapPanel；composables：useLocalDemo/useWorkstationMeta；测试 gameStoreSession.test.js（6 用例）。

## 存档合同

- key：`STORAGE_KEYS.WRITING_SESSIONS`；session `{id,schemaVersion:1,title,createdAt,updatedAt,worldId,worldbookId,runtimeState,messages,chatHistory,worldState{character,time,worldMap,activities},turnRecords,lastCommittedTurnId,activeBranchId}`。
- 快照键集：`RUNTIME_SNAPSHOT_KEYS`（35 键）+ forSession 的 playerCharacter/aiCharacter。
- 保存调度：500ms trailing 去抖（每 store 实例独立 WeakMap）；unload 全局 flush。
