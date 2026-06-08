# 测例与基准通过情况

> 让人和 agent 一眼看到功能覆盖与 bench 可运行性。
> **这一页只反映当下**。每次跑 `npm run test:run` 或 `npm run verify` 之后更新。

## 跑测方式

| 命令 | 用途 |
| --- | --- |
| `npm run test` | vitest watch 模式（开发用） |
| `npm run test:run` | vitest 单跑（CI / 提交前） |
| `npm run test:arch` | 架构护栏单跑（`architectureGuard.test.js`） |
| `npm run verify` | 测例 + 构建（发布前） |

## 测例分组（按子域）

### 地图引擎

| 文件 | 覆盖 |
| --- | --- |
| `heightmap-azgaar.test.js` | Azgaar 兼容模式 |
| `heightmap-quality.test.js` | 高程图质量（连通性、分布） |
| `heightmap-template-semantics.test.js` | 模板语义（含 round 1 后的形状指标） |
| `tectonic-data.test.js` | 板块数据并行数组 |
| `polar-realism.test.js` | 极地真实感 |
| `coast.test.js` / `coastline.test.js` | 海岸扰动 + 多边形 |
| `rivers-meander.test.js` | 河网曲流 + 三角洲 |
| `settlement-realism.test.js` | 聚落真实感 |
| `state-realism.test.js` / `province-realism.test.js` / `road-realism.test.js` | 行政区 / 省 / 路真实感 |
| `borderlands.test.js` / `boundary-terrain.test.js` | 边界 / 板块边界地形 |
| `nations.test.js` | 国家生成（graphology） |
| `renderer-pipeline.test.js` / `renderer-smoke.test.js` | 渲染管线 / 6 preset smoke |
| `realism-classic-compat.test.js` | 经典模式 byte-for-byte 兼容 |
| `visual-verification.test.js` | headless 视觉 / 性能验收 |
| `voronoiMapAdapter-prompt.test.js` / `voronoiMapAdapter-realism.test.js` | AI adapter 透传 |
| `worker-bridge.test.js` | comlink worker 桥 |
| `generate-constraints.test.js` | 约束透传 |

### 文本生成

| 文件 | 覆盖 |
| --- | --- |
| `generationService.test.js` / `generationFeatureServices.test.js` | 生成服务主路径 |
| `rpTextRenderer.test.js` / `textGenerationServices.test.js` | RP / 通用文本生成 |
| `settingFieldGeneration.test.js` / `settingPanelSchema.test.js` | 设定字段与面板 schema |
| `worldbookContextBuilder.test.js` / `worldbookDraftAssets.test.js` / `worldbookMapBridge.test.js` | 世界书集成 |

### 记忆 / 上下文

| 文件 | 覆盖 |
| --- | --- |
| `memorySync.test.js` / `memoryCandidates.test.js` | 记忆系统 |
| `contextCompression.test.js` / `contextMessage.test.js` | 上下文压缩 |
| `apiMemory.test.js` | 记忆 API 端点 |
| `useMem0Scope.test.js` | 记忆 UI 集成 |

### 分镜 / 画布

| 文件 | 覆盖 |
| --- | --- |
| `storyboardStore.test.js` | 分镜 store |
| `relationCanvas.test.js` | 关系画布 |
| `useDirector.test.js` | 导演 UI |

### 顾问 / 智能体

| 文件 | 覆盖 |
| --- | --- |
| `advisorResultApplier.test.js` / `advisorTaskService.test.js` | 顾问任务流 |
| `serverAdvisorTaskService.test.js` | 服务端顾问任务 |
| `useAdvisor.test.js` / `useCopilot.test.js` | 顾问 UI |

### 系统级

| 文件 | 覆盖 |
| --- | --- |
| `architectureGuard.test.js` | 架构护栏（`npm run test:arch`） |
| `integration.test.js` | 端到端集成 |
| `apiGeneration.test.js` | 生成 API 端点 |
| `openclawService.test.js` | 外部通道 |
| `gameStoreSession.test.js` / `storage.test.js` | 会话 / 存储 |
| `structuredSettingsStore.test.js` | 设定 store |
| `welcomeView.test.js` / `workbenchNav.test.js` / `pageRouteTransition.test.js` / `uiPolish.test.js` | 入页 / 导航 / 路由过渡 / 视觉 polish |
| `mapConfigSchema.test.js` | 地图配置 schema |

## 当前状态

> 最近一次已知全量地图相关回归来自 Round 2 交付记录（2026-06-08）。本页记录的是当前已知状态；若重新执行 `npm run test:run` 或 `npm run verify`，请覆盖此表。

| 维度 | 状态 |
| --- | --- |
| 测例总数 | 426 |
| 通过 | 425 |
| 失败 | 1 |
| 跳过 | 未记录 |
| `npm run build` | 未在同一轮记录 |
| `npm run docs:build` | 通过（2026-06-08 文档整理时验证） |

## 快照基线

`src/__tests__/__snapshots__/` 下存有视觉 / 序列化快照。
改动 renderer / serialization 时需主动 `npm run test -u` 并人工 diff。

## 已知问题与跳过

见 [`known-issues.md`](./known-issues.md)。当前已知失败：`coast.test.js` 的“海陆交界扰动”用例，标记为 Round 2 前已存在问题；修复时需要重新确认是否仍与 `reshapeCoasts` / `perturbCoast` 行为无关。
