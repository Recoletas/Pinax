# 系统架构总览

## 1. 架构目标

“小说体验”框架采用前后端分层架构，核心目标：
- 世界书驱动：体验状态与叙事上下文围绕世界书组织。
- 入口分层：普通入口负责低门槛导入，高级入口负责精细编辑。
- 生成可控：业务侧统一通过重试计划调用 AI，避免散乱调用。

## 2. 模块分层

### 前端（Vue + Pinia）
- `src/pages`：页面编排与用户流程（体验、导入、高级编辑、写作工具页）。
- `src/stores`：跨页面状态与业务动作（如世界书状态、游戏状态）。
- `src/components`：可复用展示与交互组件（状态栏、世界地图、活动记录等）。
- `src/services`：API 通信与外部服务封装。

### 后端（Express）
- `server/routes`：按域划分 HTTP 路由（chat、game、events、config）。
- `server/services`：事件引擎、时间系统、状态管理等领域逻辑。
- `server/data`：默认事件、世界模板、NPC 等基础数据。

## 3. 关键业务链路

### 世界书双入口
- 普通入口：`/experience/worldbook`，用于预设导入、小说文本提炼、AI 生成草案。
- 高级入口：`/experience/worldbook/advanced`，用于条目精修、注入参数、分组管理、SillyTavern 导入导出。

### 导入处理策略
- 新建导入：直接创建世界书。
- 同名冲突：提供重命名新建、同名新建、覆盖同名三种显式策略。
- 覆盖导入：清空旧条目并写入新条目，导入前展示条目变化指标。

## 4. 生成链路约束（架构守卫）

业务层（pages/stores/composables）不允许直接调用 `sendChat`。
统一策略：
- 由 `runGenerationRetryPlan` 管理“首轮 + 重试 + 解析 + 校验”。
- 页面只处理输入、结果展示与错误反馈。
- 所有 AI 结构化输出先过 JSON 解析，再做字段归一化。

## 5. 数据与持久化

- 前端持久化：通过 `useStorage` 统一访问浏览器存储。
- 世界书索引：维护世界书元信息与 active worldbook。
- 世界书条目：统一规范字段，导入时做兼容映射与清洗。
- 日志与计划：`docs/LOG.md` 记录已完成事实，`docs/PLAN.md` 记录目标路线。

## 6. 发布前最低验证

执行：
- `npm run verify`

通过标准：
- 单测通过（Vitest）。
- 构建通过（Vite build）。
- 无新增架构守卫违规（尤其是直接调用 `sendChat`）。
