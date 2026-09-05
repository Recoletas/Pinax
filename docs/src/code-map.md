# 代码库地图

> 目标是快速找到行为负责人，不在这里复述实现细节。

## 顶层

| 路径 | 角色 |
| --- | --- |
| `src/pages/` | 路由级页面和主要用户流程 |
| `src/components/` | 页面内组件和局部工作台 |
| `src/services/` | 业务服务、生成、地图引擎、导出和数据层 |
| `src/stores/` | Pinia 状态源 |
| `src/composables/` | 组合式状态和 UI 行为 |
| `src/__tests__/` | Vitest 测试 |
| `server/` | Express、WebSocket、服务端代理 |
| `shared/` | 前后端共享的任务、文档、候选和协作合同 |
| `electron/` | 桌面进程、项目存储、IPC和旧数据迁移 |
| `scripts/` | 浏览器旅程、离线评测、故障矩阵和发布检查 |
| `docs/` | 项目文档 |

## 当前主线路径

| 用户链路 | 主要入口 | 关键支撑 |
| --- | --- | --- |
| 统一创作 | `src/pages/Authoring.vue`, `src/components/writing/WritingNotebookEditor.vue` | `src/components/authoring/`, `src/services/agents/authoring/`, `src/services/writing/` |
| 进入世界 / 开始冒险 | `src/pages/Experience.vue`, `src/components/GamePanel.vue` | `src/composables/useAdvisor.js`, `src/services/generationService.js`, `src/services/memorySync.js` |
| 世界书 / 设定 | `src/pages/WorldBookQuickImport.vue`, `src/pages/WorldBookEditor.vue`, `src/pages/StructuredSettings.vue` | `src/stores/worldStore.js`, `src/services/worldbookContextBuilder.js`, `src/services/settingFieldGeneration.js`, `src/services/settingPanelSchema.js` |
| 素材收集 / 编辑 | `src/pages/Notes.vue` | `src/services/narrativeAssets.js`, `src/services/professionalInfoGenerator.js`, `src/services/media/imageProviderService.js` |
| 关系画布 / 分镜 | `src/pages/ProseEssay.vue`, `src/components/canvas/CanvasTimeline.vue` | `src/services/relationCanvas.js`, `src/services/storyboardStore.js`, `src/services/shotExporter.js` |

`/writing` 已由router重定向到 `/authoring`；`/experience` 保留兼容，不能因入口收敛直接删除其会话和运行时。实际注册入口以 `src/router/index.js` 为准。

## 重点子系统

### 地图引擎

路径：`src/services/world-map/`

| 区块 | 关键文件 |
| --- | --- |
| 生成编排 | `engine/generate.ts`, `engine/index.ts` |
| 高程图 / 模板 | `engine/heightmap.ts`, `engine/heightmap-templates.ts`, `engine/enforceTemplateContract.ts`, `engine/shape-metrics.ts` |
| 板块 / 地形 | `engine/tectonics.ts`, `engine/heightmap.ts`, `engine/tectonic-data.ts` |
| 海岸 / 河流 | `engine/coast.ts`, `engine/coastline.ts`, `engine/rivers.ts` |
| 聚落 / 国家 / 边界 | `engine/settlements.ts`, `engine/nations.ts`, `engine/borderlands.ts` |
| 渲染 | `engine/renderer.ts`, `engine/renderer-pipeline.ts`, `engine/style-presets.ts` |
| worker 桥 | `engine/worker.ts`, `engine/worker-bridge.ts` |

### 世界书 / 设定

| 职责 | 关键文件 |
| --- | --- |
| 世界书存储 | `src/stores/worldStore.js` |
| 上下文构建 | `src/services/worldbookContextBuilder.js` |
| 快速导入 / 生成 | `src/services/worldbookImportGeneration.js`, `src/services/worldbookDraftAssets.js` |
| 结构化设定 | `src/services/settingPanelSchema.js`, `src/services/settingFieldGeneration.js`, `src/components/worldbook/` |

### 记忆 / 顾问 / 生成

| 职责 | 关键文件 |
| --- | --- |
| 记忆 | `src/services/memorySync.js`, `src/services/memoryCandidates.js`, `src/composables/useMem0.js` |
| 顾问 | `src/services/advisorTaskService.js`, `src/composables/useAdvisor.js` |
| 通用生成 | `src/services/generationService.js`, `src/services/generationRetry.js` |

Authoring的方向规划、上下文冻结、Ghost采用与因果排演归 `src/services/agents/authoring/`；行内补全由Notebook的ProseMirror实现承担，不再使用已退役的悬浮补全组件。

### 素材 / 画布 / 导出

| 职责 | 关键文件 |
| --- | --- |
| 素材真源 | `src/services/narrativeAssets.js` |
| 图片 Provider / 配置 | `src/services/media/imageProviderService.js`, `src/services/media/imageProviderConfigStore.js` |
| 媒体资产 / Blob | `src/services/media/mediaAssetStore.js` |
| 素材图片桥接 / 迁移 | `src/services/media/narrativeImageAssetBridge.js` |
| 画布附件桥接 / 迁移 | `src/services/media/canvasImageAssetBridge.js` |
| 关系画布 | `src/services/relationCanvas.js` |
| 分镜状态 / 导出 | `src/services/storyboardStore.js`, `src/services/shotExporter.js` |

## 服务端

| 路径 | 角色 |
| --- | --- |
| `server/index.js` | Express 入口 |
| `server/routes/chat.js` | 聊天 / 代理相关入口之一 |
| `server/` 其他模块 | WebSocket、顾问任务、外部通道 |

## 测试入口

| 路径 / 命令 | 用途 |
| --- | --- |
| `src/__tests__/` | 默认Vitest核心套件；其他平台脚本见package.json |
| `npm run test:run` | 核心回归；单独执行不包含构建和测试预算reporter |
| `npm run verify:full` | 核心测试预算（≤20文件/≤200用例）、双构建及diff检查 |
| `npm run build` | 生产构建 |
| `npm run docs:build` | 文档站构建 |

## 不放在这里

- 单文件内部的实现细节：直接在 IDE 跳转。
- 公开 API 说明：不维护。
- 计划 / 风险 / 验证状态：分别去 `PLAN.md`、`known-issues.md`、`test-status.md`。
