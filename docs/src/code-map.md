# 代码库地图

> 浅层地图：识别 owning surface 即可。
> 新成员和 agent 应能在 5 分钟内从这里找到任意行为的负责人 / 文件。

## 顶层布局

```
pinax/
├── src/                       # 前端 + 引擎
│   ├── services/              # 业务服务层（含 world-map 引擎、AI 集成、生成）
│   ├── components/ views/ pages/ layouts/   # Vue 3 UI
│   ├── stores/ composables/                  # Pinia 状态 + 组合式
│   ├── router/  api.js                       # 路由 + 网络
│   ├── __tests__/                            # vitest 测例
│   └── config/ types/ utils/ styles/         # 通用
├── server/                    # Express + WebSocket
├── docs/                      # 项目文档
├── deploy/                    # 部署配置（pm2 等）
├── dist/                      # 构建产物
└── .agents/ .codex/ .claude/  # 各自带的 agent 工作目录与指令
```

## 服务层 owning surface

### world-map 引擎（最大子系统）

`src/services/world-map/`：

| 模块 | 职责 | 关键文件 |
| --- | --- | --- |
| 高程图 | 海陆分布、模板选择、模板合同 | `engine/heightmap.ts` · `engine/heightmap-templates.ts` · `engine/heightmap-template-aware.ts` · `engine/enforceTemplateContract.ts` · `engine/parseTemplate.ts` · `engine/shape-metrics.ts` |
| 板块构造 | plate-driven 地形、边界地形 | `engine/tectonics.ts` · `engine/boundary-terrain.ts` · `engine/tectonic-data.ts` |
| 海岸 | 扰动、低频重塑、多边形提取 | `engine/coast.ts` · `engine/coastline.ts` |
| 河网 | 曲流、三角洲 | `engine/rivers.ts` |
| 聚落 | 选址 | `engine/settlements.ts` |
| 国家 | graphology 图 | `engine/nations.ts` |
| 边界 / 派系 | 边境 / 派系纹理 | `engine/borderlands.ts` · `engine/faction-texture.ts` |
| 渲染管线 | 6 preset、layer ordering | `engine/renderer-pipeline.ts` · `engine/renderer.ts` · `engine/style-presets.ts` · `engine/hillshade.ts` · `engine/wind.ts` · `engine/climate.ts` · `engine/features.ts` |
| 编排 | 主编排入口 | `engine/generate.ts` · `engine/index.ts` |
| 离线程 | comlink worker 桥 | `engine/worker.ts` · `engine/worker-bridge.ts` |
| 通用 | 随机、类型、网格、性能 | `engine/random.ts` · `engine/types.ts` · `engine/grid.ts` · `engine/perf.ts` · `engine/realism-metrics.ts` · `engine/name-pool.ts` |

> 命名池、地名、文化相关：`engine/name-pool.ts`。
> 真实感档位（classic / realistic / ultra）经 `engine/realism-metrics.ts` 评估，由 `tectonics.ts` 和 `coast.ts` 接受参数后生效。

### 文本生成 / 世界书

- `services/worldbookContextBuilder.js` · `worldbookImportGeneration.js` · `worldbookDraftAssets.js` · `worldbookFeedback.js` —— 世界书导入 / 构建 / 反馈
- `services/generationService.js` · `generationFeatureServices.js` · `generationRetry.js` —— 生成服务主路径
- `services/proseGeneration.js` · `poetryGeneration.js` · `dialogueOptions.js` · `textExpander.js` · `textRewriter.js` · `chapterOutline.js` —— 各文本变换
- `services/settingFieldGeneration.js` · `settingPanelSchema.js` · `professionalInfoGenerator.js` —— 设定字段生成
- `services/promptBuilder.js` · `promptRegistry.js` · `experienceAssetSummarizer.js` —— prompt 组装与模板
- `services/advisorTaskService.js` · `advisorResultApplier.js` —— 统一智能顾问

### 记忆 / 上下文

- `services/memorySync.js` · `memoryCandidates.js` · `memoryCompaction.js` —— 记忆系统
- `services/contextCompression.js` · `contextMessage` —— 上下文压缩

### 分镜 / 导出

- `services/storyboardStore.js` · `shotExporter.js` · `relationCanvas.js` —— 分镜与关系画布
- `services/narrativeAssets.js` · `writingNotes.js` —— 叙事资产与写作笔记

### 集成

- `services/api.js` —— 前端 HTTP 客户端
- `services/ai/` —— AI 适配层（具体模块按集成目标划分）

## UI owning surface

- `src/pages/` —— 路由级页面
- `src/views/` —— 视图组件
- `src/components/` —— 通用组件
- `src/layouts/` —— 页面骨架
- `src/router/` —— 路由表
- `src/stores/` —— Pinia store
- `src/composables/` —— 组合式 API（`useCopilot` `useDirector` `useMem0Scope` `usePerf` `useAdvisor`）

## 服务端

- `server/index.js` —— Express 入口
- `server/` 下：WebSocket、openclaw 通道、advisor task 等

## 关键测试入口

| 路径 / 命令 | 用途 |
| --- | --- |
| `src/__tests__/` | vitest 测例 |
| `src/__tests__/architectureGuard.test.js` | 架构护栏（`npm run test:arch`） |
| `src/__tests__/__snapshots__/` | 视觉 / 序列化快照 |
| `npm run test:run` | 全量跑 |
| `npm run verify` | 测例 + 构建 |

## 仓库自动化

- `.agents/` `.codex/` `.claude/` —— 各自带的 agent 工作目录与指令
- `docs/superpowers/` —— 既有 spec / plan / note（迁移路径见 [`index.md` §关系](./index.md)）

## 不在地图里的

- 公开 API 详细说明 → 不维护（见 [`index.md` §不应该维护](./index.md)）
- 部署步骤 → `docs/operations/`
- 用户操作手册 → `docs/user-manual/`
- 单一文件级别的枚举 → 在 IDE 里跳转，不要在这里重复
