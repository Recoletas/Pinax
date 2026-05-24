# 06 - 项目结构调整规划

> 本文档规划目标文件结构与重构路径。

## 6.1 目标目录结构

```
src/
├── pages/                      # 页面组件（按路由划分）
│   ├── Home.vue                # 首页
│   ├── Fit.vue                 # 体裁选择
│   ├── Experience.vue           # 小说体验（原 Game.vue，重命名）
│   ├── WorldBookEditor.vue     # 世界书编辑器（新增）
│   ├── Writing.vue              # 小说写作
│   ├── PoetryLab.vue            # 诗歌灵感工坊
│   ├── ProseEssay.vue           # 散文随笔卡片
│   └── Notes.vue                # 笔记
│
├── components/                 # 可复用组件
│   ├── common/                  # 通用组件
│   │   ├── TitleBar.vue
│   │   ├── IconButton.vue
│   │   └── Modal.vue
│   │
│   ├── experience/              # 小说体验组件（新增）
│   │   ├── NarrativeOutput.vue   # 叙事输出区
│   │   ├── InputBar.vue         # 输入栏
│   │   ├── Sidebar.vue          # 侧边栏
│   │   ├── CombatPanel.vue       # 战斗面板
│   │   ├── TradePanel.vue        # 交易面板
│   │   ├── QuestPanel.vue        # 任务面板
│   │   └── DialoguePanel.vue     # 对话面板
│   │
│   ├── worldbook/              # 世界书编辑器组件（新增）
│   │   ├── EntryList.vue
│   │   ├── EntryEditor.vue
│   │   ├── EntrySearch.vue
│   │   ├── WorldImporter.vue
│   │   └── GroupManager.vue
│   │
│   ├── editor/                  # 编辑器组件
│   │   ├── ChapterList.vue
│   │   ├── EditorToolbar.vue
│   │   ├── QuickNotes.vue
│   │   └── CopilotSuggestion.vue  # AI 补全建议
│   │
│   ├── poetry/                  # 诗歌工坊组件
│   │   ├── Canvas.vue
│   │   ├── NodeDetail.vue
│   │   ├── HistoryPanel.vue
│   │   └── ToolPanel.vue
│   │
│   ├── prose/                   # 散文随笔组件
│   │   ├── CardList.vue
│   │   ├── CardDetail.vue
│   │   └── TimelineView.vue
│   │
│   ├── advisor/                 # 主动创作顾问组件（新增）
│   │   ├── AdvisorFAB.vue        # 悬浮按钮（idle/pulsing/alert 三态）
│   │   ├── AdvisorSidebar.vue    # 侧边顾问报告面板
│   │   ├── InlineConsistencyMarker.vue  # 行内波浪线标注
│   │   └── SceneUnlockModal.vue  # 场景解锁全屏弹窗
│   │
│   └── shared/                  # 跨模块共享
│       ├── CharacterCard.vue
│       ├── LocationTag.vue
│       └── ImageGenRail.vue
│
├── composables/                 # 组合式函数（共享逻辑）
│   ├── useApiSettings.js        # ✅ AI 配置统一入口（已完成）
│   ├── useStorage.js            # ✅ localStorage 统一封装（已完成）
│   ├── useQuickNotes.js         # ✅ 速记草稿（已完成）
│   ├── useRichEditor.js         # ✅ 富文本工具条（已完成）
│   │
│   ├── useWorldBook.js          # 🔲 世界书操作（待建）
│   ├── useWorldEntry.js         # 🔲 条目注入逻辑（待建）
│   ├── useCopilot.js            # 🔲 AI 补全（待建）
│   ├── useMem0.js               # 🔲 记忆力系统（待建）
│   ├── useNarrativeStyle.js     # 🔲 叙事风格管理（待建）
│   ├── useGenerationPlan.js     # 🔲 生成计划执行器（待建）
│   ├── useProactiveAdvisor.js   # 🔲 主动顾问核心（待建，SSE 订阅 + proactive-check）
│   ├── usePauseListener.js       # 🔲 写作停顿监听（待建）
│   ├── useConsistencyMonitor.js # 🔲 一致性监控器（待建）
│   └── usePlotDriftMonitor.js   # 🔲 剧情失控度分析（待建）
│
├── services/                     # API 与业务服务
│   ├── api.js                   # ✅ sendChat 统一入口（已完成）
│   ├── promptBuilder.js         # 🔲 提示词构建（待建）
│   ├── textExpander.js          # 🔲 文本扩展（待建）
│   ├── textRewriter.js          # 🔲 文本改写（待建）
│   ├── shotExporter.js          # 🔲 分镜导出（待建）
│   ├── sillyTavernParser.js     # 🔲 SillyTavern 解析（待建）
│   ├── narrativeAnalyzer.js     # 🔲 叙事分析（待建）
│   ├── tokenBiasEngine.js       # 🔲 Token 偏置控制引擎（待建）
│   └── openclawAdapter.js       # 🔲 OpenClaw 审查结果映射（待建）
│
├── stores/                        # Pinia 状态管理
│   ├── gameStore.js             # ⚠️ 重构为 experienceStore
│   ├── worldbookStore.js        # 🔲 世界书状态（待建）
│   ├── editorStore.js           # 🔲 编辑器状态（待建）
│   └── advisorStore.js          # 🔲 主动顾问状态（待建）
│
├── utils/                         # 工具函数
│   ├── treeUtils.js             # 🔲 树操作（已有测试，待迁移）
│   └── textUtils.js             # 🔲 文本处理（待建）
│
└── router/
    └── index.js                 # 路由配置

server/
├── index.js
├── routes/
│   ├── chat.js                  # ✅ AI 聊天 + secrets（已完成）
│   ├── game.js
│   ├── events.js
│   ├── config.js
│   ├── worldbook.js             # 🔲 世界书 API（待建）
│   └── openclaw.js             # 🔲 proactive-check + SSE 警报通道（待建）
│
├── services/
│   ├── eventEngine.js
│   ├── timeSystem.js
│   ├── stateManager.js
│   ├── novelAnalyzer.js         # 🔲 小说分析 AI（待建）
│   ├── worldbookService.js      # 🔲 世界书服务（待建）
│   └── openclawService.js      # 🔲 OpenClaw 异步处理 + SSE 推送（待建）
│
└── data/
    ├── worlds/                  # 世界模板
    ├── events/                  # 事件数据
    └── secrets.json             # API 密钥（已列入 .gitignore）
```

**图例：** ✅ 已完成 | ⚠️ 待重构 | 🔲 待新建

## 6.2 重构任务

### Game.vue → Experience.vue

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 文件重命名 | `Game.vue` → `Experience.vue` | P2 |
| 路由更新 | `/game` → `/experience` | P1 |
| Store 重构 | `gameStore` → `experienceStore`，清理无效字段 | P0 |
| 组件数据源统一 | 侧边栏组件从 Store 读取，不再各自管理 localStorage | P0 |
| 主界面简化 | 按 1.4 布局简化 Experience 页面 | P0 |

### PoetryLab.vue / ProseEssay.vue 重构

| 任务 | 说明 | 优先级 |
|------|------|--------|
| extract useApiSettings | 移除 `resolveApiSettings` 重复逻辑 | P1 |
| extract canvas logic | 节点操作、画布交互抽到 composable | P1 |
| extract tree operations | `flattenTree`/`reindexTree`/`cloneTree` 迁移到 utils | P1 |

### Writing.vue 重构

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 接入 useRichEditor | 富文本工具条逻辑抽离 | P1 |
| 接入 useCopilot | AI 补全功能 | P0 |

## 6.3 新建 composables 清单

| Composable | 职责 | 优先级 |
|-----------|------|--------|
| `useWorldBook.js` | 世界书 CRUD、搜索、分组 | P0 |
| `useWorldEntry.js` | 条目注入逻辑、关键词匹配、递归扫描 | P0 |
| `useCopilot.js` | AI 补全状态机、上下文窗口 | P0 |
| `useMem0.js` | 记忆存储/检索/注入、事件驱动同步队列 | P0 |
| `useNarrativeStyle.js` | 叙事风格预设、切换 | P1 |
| `useGenerationPlan.js` | runGenerationRetryPlan 封装 | P1 |
| `useProactiveAdvisor.js` | 主动顾问核心：SSE 订阅、proactive-check POST、alert 分发 | P0 |
| `usePauseListener.js` | 写作停顿监听：200 字 + 3 秒触发上下文提取 | P0 |
| `useConsistencyMonitor.js` | 一致性监控器：年龄/地点/时间/关系冲突检测 | P0 |
| `usePlotDriftMonitor.js` | 剧情失控度分析：driftScore 计算、大纲对比 | P1 |

## 6.4 新建 services 清单

| Service | 职责 | 优先级 |
|---------|------|--------|
| `promptBuilder.js` | 集中管理所有提示词模板、Layer 0~4 组装 | P0 |
| `sillyTavernParser.js` | SillyTavern JSON 解析/导出 | P0 |
| `shotExporter.js` | 剪映 JSON / Premiere XML 导出 | P1 |
| `novelAnalyzer.js` | 小说文本 AI 实体提取 | P1 |
| `textExpander.js` | AI 文本扩展 | P1 |
| `textRewriter.js` | AI 文本改写 | P1 |
| `tokenBiasEngine.js` | Token 偏置表管理、动态偏置计算、API 参数注入 | P0 |
| `openclawAdapter.js` | OpenClaw 审查结果 → activeAlert 映射 | P0 |
| `clichéAnalyzer.js` | 叙事输出质量分析、陈词滥调检测报告 | P1 |

## 6.5 迁移检查清单

```
迁移步骤：
□ 1. 创建新 composable / service
□ 2. 在小范围组件中试用
□ 3. 验证功能正确
□ 4. 更新依赖该功能的组件
□ 5. 删除旧代码
□ 6. 运行 npm run test 确保全绿
□ 7. 运行 npm run build 确保构建通过
```

## 6.6 实施顺序

```
阶段 1：基础设施
  useStorage.js (已完成) → useApiSettings.js (已完成)
  → useWorldBook.js → useWorldEntry.js

阶段 2：小说体验
  experienceStore 重构 → Experience.vue 简化
  → WorldBookEditor.vue → SillyTavern 导入导出

阶段 3：编辑器 AI
  useCopilot.js → Writing.vue 接入
  → textExpander.js / textRewriter.js

阶段 4：其他模块
  useMem0.js → 编导模式完善 → prompt-optimizer 集成

阶段 5：主动创作顾问（07 模块）
  advisorStore → useProactiveAdvisor → usePauseListener
  → useConsistencyMonitor → usePlotDriftMonitor
  → AdvisorFAB / AdvisorSidebar / InlineConsistencyMarker
  → openclawService.js → openclaw.js 路由
```

---

## 相关文档

- [00-overview.md](./00-overview.md) - 项目总览
- [01-novel-experience.md](./01-novel-experience.md) - 小说体验规划
- [02-editor-ai.md](./02-editor-ai.md) - 编辑器 AI 规划
- [03-director-mode.md](./03-director-mode.md) - 编导模式（shotExporter.js）
- [04-memory-system.md](./04-memory-system.md) - 记忆力系统（useMem0.js）
- [05-prompt-engineering.md](./05-prompt-engineering.md) - 提示词工程（promptBuilder.js、tokenBiasEngine.js）
- [07-proactive-advisor.md](./07-proactive-advisor.md) - 主动顾问（advisorStore、useProactiveAdvisor 等）