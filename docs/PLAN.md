# 开发计划

> 详细规划请访问 [plan/](./plan/) 目录。

## 文档导航

| 编号 | 文档 | 内容 |
|------|------|------|
| 00 | [plan/00-overview.md](./plan/00-overview.md) | 项目定位、技术架构、实施阶段 |
| 01 | [plan/01-novel-experience.md](./plan/01-novel-experience.md) | 小说体验模块 |
| 02 | [plan/02-editor-ai.md](./plan/02-editor-ai.md) | 编辑器 AI 辅助 |
| 03 | [plan/03-director-mode.md](./plan/03-director-mode.md) | 编导模式 |
| 04 | [plan/04-memory-system.md](./plan/04-memory-system.md) | 记忆力系统 |
| 05 | [plan/05-prompt-engineering.md](./plan/05-prompt-engineering.md) | 提示词工程 |
| 06 | [plan/06-project-structure.md](./plan/06-project-structure.md) | 项目结构调整 |

## 核心目标

1. **小说体验** - 类酒馆但导向写作辅助，世界书驱动+事件触发+AI叙事
2. **编辑器 AI** - Copilot 模式自动补全，导入笔记/小说后 AI 续写
3. **编导模式** - 诗歌/散文→分镜→剪映，面向 AI 视频创作
4. **记忆力系统** - 接入 mem0，跨会话记忆用户偏好和创作设定

## 实施阶段

| 阶段 | 核心交付 |
|------|---------|
| **P0** | 现有代码优化（已完成：composables 抽离、工程护栏） |
| **M1** | 世界书基础（SillyTavern 兼容、体验主界面简化） |
| **M2** | 编辑器 AI（Copilot 补全、世界书注入） |
| **M3** | 编导模式（诗歌/散文分镜生成、导出） |
| **M4** | 记忆力（mem0 集成、上下文记忆） |
| **M5** | 打磨（事件面板、顾问功能、性能优化） |

## 当前进度

### 已完成

- `useApiSettings` / `useStorage` / `useQuickNotes` / `useRichEditor` composables
- `sendChat` 统一入口 + `getResolvedApiSettings`
- `Settings.vue` 重构
- ESLint + Vitest 工程护栏
- 38 个单元测试

### 待处理

- ExperienceStore 重构（M1）
- PoetryLab/ProseEssay `resolveApiSettings` 重复逻辑（P1）
- Writing.vue 未接入 `useRichEditor`（P1）
- 世界书编辑器（M1）
- Copilot AI 补全（M2）
- mem0 API 客户端封装（M4）

## 其他文档

- [LOG.md](./LOG.md) - 迭代记录
- [guides/worldbook-workflow.md](./guides/worldbook-workflow.md) - 世界书操作流程
- [engineering/development-standards.md](./engineering/development-standards.md) - 开发规范
- [operations/troubleshooting.md](./operations/troubleshooting.md) - 排障指南