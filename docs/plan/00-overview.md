# 00 - 项目定位与实施总览

## 1. 项目定位

### 1.1 一句话定义

**WriterHelper** 是一个以写作为核心目标的 AI 辅助工具集，区别于酒馆等娱乐向角色扮演工具，本框架输出目标是**可直接沉淀到写作的叙事片段**。

### 1.2 四大模块

| 模块 | 定位 | 核心功能 | 输出 |
|------|------|---------|------|
| **小说体验** | 类酒馆，写作导向 | 世界书驱动、事件触发、AI 叙事 | 叙事片段 |
| **诗歌工坊** | 视觉化灵感激发 | 树状意象生成、写作/编导双模式 | 诗歌 / 分镜 JSON |
| **散文随笔** | 卡片式自由创作 | 情绪标签、AI 扩展、编导输出 | 散文 / 分镜脚本 |
| **小说写作** | 传统编辑器增强 | 书籍-章节管理、AI Copilot 补全 | 完整小说章节 |

### 1.3 长期愿景

```
导入小说/笔记
    │
    ▼
AI 分析提取世界书
    │
    ▼
小说体验模拟剧情
    │
    ▼
生成叙事片段 → 沉淀到编辑器
    │
    ▼
AI 续写补全
    │
    ▼
导出分镜 → AI 视频生成
```

## 2. 技术架构

### 2.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 3 + Composition API | 响应式、组合式函数 |
| 路由 | Vue Router 4 | 页面导航 |
| 状态管理 | Pinia | 跨页面状态 |
| 构建工具 | Vite 5 | 快速构建 |
| 后端 | Express | API 服务 |
| AI | 多 Provider | OpenAI/Claude/DeepSeek/Ollama 等 |
| 存储 | localStorage | 键名统一在 `useStorage.js` |
| 测试 | Vitest | 单元测试 |
| 代码检查 | ESLint | 规范检查 |
| 记忆力 | mem0 API | 长期记忆（待集成） |

### 2.2 目录结构

```
text-game-framework/
├─ src/
│  ├─ pages/              # 页面组件（按路由模块划分）
│  │  ├─ Experience.vue   # 小说体验（原 Game.vue）
│  │  ├─ WorldBookEditor.vue
│  │  ├─ Writing.vue      # 小说写作
│  │  ├─ PoetryLab.vue    # 诗歌工坊
│  │  ├─ ProseEssay.vue   # 散文随笔
│  │  └─ Notes.vue        # 笔记
│  ├─ components/         # 可复用组件
│  │  ├─ Character.vue
│  │  ├─ ContextSelector.vue
│  │  ├─ GamePanel.vue
│  │  ├─ ImageGenRail.vue
│  │  ├─ InputArea.vue
│  │  ├─ Inventory.vue
│  │  ├─ QuestLog.vue
│  │  ├─ Settings.vue     # 已重构，接入 useApiSettings
│  │  ├─ StatusBar.vue
│  │  └─ WorldMap.vue
│  ├─ composables/         # 组合式函数（已完成 4 个）
│  │  ├─ useApiSettings.js     # AI 配置统一入口
│  │  ├─ useStorage.js         # localStorage 封装
│  │  ├─ useQuickNotes.js      # 速记草稿
│  │  ├─ useRichEditor.js      # 富文本工具条
│  │  ├─ useWorldBook.js       # 世界书操作（待建）
│  │  ├─ useWorldEntry.js      # 条目注入逻辑（待建）
│  │  └─ useMem0.js            # 记忆力（待建）
│  ├─ services/
│  │  └─ api.js           # sendChat 统一入口 + getResolvedApiSettings
│  ├─ stores/
│  │  └─ gameStore.js     # 游戏状态（待重构为 ExperienceStore）
│  └─ router/
│     └─ index.js
├─ server/
│  ├─ index.js
│  ├─ routes/
│  │  ├─ chat.js          # AI 聊天 + secrets 管理（已重构）
│  │  ├─ game.js
│  │  ├─ events.js
│  │  └─ config.js
│  └─ services/
│     ├─ eventEngine.js
│     ├─ timeSystem.js
│     └─ stateManager.js
├─ docs/
│  └─ plan/               # 详细规划文档集
└─ public/
```

### 2.3 AI 配置数据流

```
用户设置（Settings.vue）
    │
    ▼
localStorage('apiSettings') ───────────────────┐
    │                                             │
    ▼                                             ▼
getResolvedApiSettings()              saveApiSettings()
    │                                    │
    ├─► 优先读取 localStorage             │
    │                                     │
    ├─► 缺失则拉取后端 secrets.json ──────┘
    │
    ▼
sendChat(messages, settings)
    │
    ▼
server/routes/chat.js
    │
    ▼
loadSecrets() → 合并 provider/baseUrl/apiKey/model
    │
    ▼
请求对应 AI Provider
```

### 2.4 localStorage 键名规范

所有键名统一在 `src/composables/useStorage.js` 的 `STORAGE_KEYS` 中定义：

```javascript
// 通用
QUICK_NOTE_DRAFT: 'quick_note_draft'
PROSE_QUICK_NOTE_DRAFT: 'prose_quick_note_draft'

// 小说写作
WRITING_BOOKS: 'writing_books'
WRITING_CHARACTER: 'writing_character'
WRITING_TIME: 'writing_time'
...

// 散文/诗歌（已版本化）
PROSE_CARDS_V1: 'prose_cards_v1'
POETRY_IDEA_TREE_V2: 'poetry_idea_tree_v2'
...

// 游戏
GAME_SETTINGS: 'gameSettings'
API_SETTINGS: 'apiSettings'
```

## 3. 架构守卫

### 3.1 sendChat 调用约束

**业务层（pages/stores/composables）不允许直接调用 `sendChat`。**

正确路径：
```
页面 → runGenerationRetryPlan → sendChat
```

`runGenerationRetryPlan` 负责：
1. 首轮生成
2. JSON 解析
3. 字段归一化
4. 失败重试（最多 N 次）
5. 降级兜底

### 3.2 导入流程约束

- 必须先预览，再执行写入
- 同名冲突必须用户显式决策
- 覆盖操作需要可见警告

## 4. 质量门槛

发布前必须通过：

```bash
npm run test      # Vitest 全绿
npm run build     # 构建通过
npm run lint      # ESLint 通过
```

## 5. 实施阶段

| 阶段 | 时间 | M1 | M2 | M3 | M4 | M5 |
|------|------|----|----|----|----|----|
| **P0 稳定根基** | 当前 | | | | | |
| **M1 世界书** | 第 1-2 月 | ● | | | | |
| **M2 编辑器 AI** | 第 2-3 月 | | ● | | | |
| **M3 编导模式** | 第 3-4 月 | | | ● | | |
| **M4 记忆力** | 第 4-5 月 | | | | ● | |
| **M5 打磨** | 第 5-6 月 | | | | | ● |

---

## 6. 当前进度

### 6.1 已完成

| 任务 | 文件 | 状态 |
|------|------|------|
| sendChat 统一入口 | `src/services/api.js` | ✅ |
| secrets 管理重构 | `server/routes/chat.js` | ✅ |
| useApiSettings composable | `src/composables/useApiSettings.js` | ✅ |
| useStorage composable | `src/composables/useStorage.js` | ✅ |
| useQuickNotes composable | `src/composables/useQuickNotes.js` | ✅ |
| useRichEditor composable | `src/composables/useRichEditor.js` | ✅ |
| Settings 重构 | `src/components/Settings.vue` | ✅ |
| ESLint + Vitest | `eslint.config.js` / `vitest.config.js` | ✅ |
| 单元测试（38 个） | `src/__tests__/` | ✅ |

### 6.2 待处理

| 任务 | 优先级 | 关联模块 |
|------|--------|---------|
| PoetryLab resolveApiSettings 重复 | P1 | M3 |
| ProseEssay resolveApiSettings 重复 | P1 | M3 |
| Writing.vue 未接入 useRichEditor | P1 | M2 |
| ExperienceStore 重构 | P0 | M1 |
| 世界书编辑器 | P0 | M1 |
| SillyTavern 导入导出 | P0 | M1 |
| Copilot AI 补全 | P0 | M2 |
| mem0 API 客户端封装 | P0 | M4 |
| prompt-optimizer 集成 | P2 | M5 |

---

## 7. 相关文档

- [PLAN.md](../PLAN.md) - 总览规划
- [01-novel-experience.md](./01-novel-experience.md) - 小说体验详细规划
- [02-editor-ai.md](./02-editor-ai.md) - 编辑器 AI 详细规划