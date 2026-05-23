# WriterHelper / Text Game Framework

> 本项目是一个前后端分离的中文创作与文字体验工具，支持**小说体验**、**诗歌写作**、**散文创作**三大场景。

---

## 项目定位

| 模块 | 定位 | 核心能力 |
|------|------|----------|
| **小说体验** | 类酒馆，但以辅助小说写作为导向 | 世界书驱动、事件触发机制、AI 叙事 |
| **诗歌工坊** | 视觉化灵感激发 | 树状意象生成、双模式（写作/编导） |
| **散文随笔** | 卡片式自由创作 | 情绪标签、AI 扩展、导出演示脚本 |
| **小说写作** | 传统编辑器 | 书籍-章节管理、富文本编辑、Markdown |

**与酒馆的核心差异：** 本框架不以娱乐对话为目标，而是以**可沉淀到写作的叙事片段**为核心输出。

---

## 核心技术栈

**前端：** Vue 3 + Composition API / Vue Router 4 / Pinia / Axios / Vite 5
**后端：** Node.js + Express + CORS
**AI：** 多 Provider 支持（OpenAI / Claude / DeepSeek / Ollama 等）
**本地存储：** localStorage（键名统一在 `useStorage.js` 中定义）

---

## 目录结构

```
text-game-framework/
├─ src/
│  ├─ pages/              # 页面组件
│  │  ├─ Experience.vue   # 小说体验（原 Game.vue）
│  │  ├─ WorldBookEditor.vue
│  │  ├─ Writing.vue      # 小说写作
│  │  ├─ PoetryLab.vue    # 诗歌灵感工坊
│  │  ├─ ProseEssay.vue   # 散文随笔卡片
│  │  └─ Notes.vue        # 笔记
│  ├─ components/         # 可复用组件
│  ├─ composables/        # 组合式函数（共享逻辑）
│  │  ├─ useApiSettings.js    # AI 配置统一入口
│  │  ├─ useStorage.js       # localStorage 统一封装
│  │  ├─ useQuickNotes.js    # 速记草稿
│  │  └─ useRichEditor.js    # 富文本工具条
│  ├─ services/api.js      # AI API 调用封装
│  └─ stores/             # Pinia 状态管理
├─ server/
│  ├─ routes/chat.js      # AI 聊天 + secrets 管理
│  ├─ services/           # 领域逻辑
│  └─ data/              # 世界模板、事件数据
└─ docs/                 # 项目文档
   ├─ architecture/       # 架构说明
   ├─ engineering/       # 开发规范
   ├─ guides/            # 使用指南
   └─ operations/        # 运维排障
```

---

## 快速开始

```bash
npm install
npm run server   # 后端，监听 localhost:3001
npm run dev      # 前端，监听 localhost:5173
npm run build    # 生产构建
npm run test     # 运行测试（Vitest）
npm run lint     # ESLint 检查
```

---

## 文档导航

| 目标 | 文档 |
|------|------|
| 了解产品路线与阶段目标 | [PLAN.md](./PLAN.md) |
| 查看已完成里程碑记录 | [LOG.md](./LOG.md) |
| 了解系统架构与模块划分 | [architecture/system-overview.md](./architecture/system-overview.md) |
| 世界书导入与编辑流程 | [guides/worldbook-workflow.md](./guides/worldbook-workflow.md) |
| 开发规范与提交前检查 | [engineering/development-standards.md](./engineering/development-standards.md) |
| 常见故障定位 | [operations/troubleshooting.md](./operations/troubleshooting.md) |

---

## 后续规划

详见 [PLAN.md](./PLAN.md)，核心方向：

1. **小说体验深化** - 世界书编辑器、小说文本 AI 导入、事件驱动机制
2. **编辑器 AI 辅助** - 导入笔记/小说后 AI 自动补全（类似 Copilot）
3. **提示词工程** - 整合酒馆风格提示词 + prompt-optimizer
4. **记忆力系统** - 接入 mem0（API 已通，尚未融合）
5. **编导模式完善** - 面向 AI 视频创作的剧本提示词生成

---

## 质量门槛

发布前必须通过：

```bash
npm run test      # 单测通过
npm run build     # 构建通过
npm run lint      # ESLint 通过
```

测试覆盖：树操作纯函数（`flattenTree` / `reindexTree` / `cloneTree`）、localStorage 封装层。