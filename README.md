# WriterHelper / Text Game Framework

一个以中文创作为核心的前后端分离项目，整合了体验、世界书、写作、素材与卡片画布工作流。

前端基于 Vue 3 + Vite，后端基于 Express，本地持久化以 localStorage 和 JSON 数据为主。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动后端

```bash
npm run server
```

默认地址：`http://localhost:3001`

### 3. 启动前端

```bash
npm run dev
```

默认地址：`http://localhost:5173`

### 4. 回归验证（推荐）

```bash
npm run verify
```

该命令会串行执行：

- `npm run test:run`
- `npm run build`

## 核心服务说明

| 服务文件 | 职责 |
|---------|------|
| `api.js` | 核心 API 通信层，所有前后端通信经由此文件 |
| `generationService.js` | 文本生成任务入口，封装 `runGenerationTask` |
| `generationRetry.js` | 多轮生成重试策略执行器 |
| `promptRegistry.js` | 所有 prompt 模板常量注册表 |
| `promptBuilder.js` | 分层 prompt 构建器（Layer 0-4） |
| `narrativeAssets.js` | 叙事素材 CRUD |
| `relationCanvas.js` | 画布卡片管理 |
| `textExpander.js` / `textRewriter.js` | 文本扩展与改写 |
| `storyboardStore.js` / `shotExporter.js` | 分镜存储与导出 |
| `worldbookImportGeneration.js` | 世界书 AI 生成 |
| `experienceAssetSummarizer.js` | 体验素材总结 |

## 工作台与路由

| 路径 | 名称 | 用途 |
| --- | --- | --- |
| `/` | welcome | 工作台欢迎页 |
| `/experience` | experience | 体验页（核心游戏界面） |
| `/experience/worldbook` | experience-worldbook | 世界书快速导入 |
| `/experience/worldbook/advanced` | experience-worldbook-advanced | 世界书编辑 |
| `/writing` | writing | 小说写作 |
| `/materials` | materials | 素材管理 |
| `/prose-essay` | prose-essay | 卡片关系画布 |

兼容重定向：`/notes`、`/poetry-lab` 等旧入口仍可访问，会重定向到对应新路由。

## 世界书定位说明

世界书功能在工作台活动栏中单列 `worldbook`，支持快速切换导入/编辑两个入口。代码层页面组件位于 `src/pages/WorldBookQuickImport.vue` 与 `src/pages/WorldBookEditor.vue`，路由层归属 `/experience/worldbook*` 子路径下。

## 项目结构（当前）

```text
text-game-framework/
├─ docs/                         # 计划、规范、日志
├─ server/
│  ├─ index.js                   # 后端入口
│  ├─ routes/                    # chat / config / events / game
│  ├─ services/                  # 状态与事件服务
│  └─ data/                      # worlds / events 数据
├─ src/
│  ├─ components/                # 通用组件（含 ImageGenRail）
│  ├─ composables/               # 组合式逻辑
│  ├─ config/                    # 工作台导航配置
│  ├─ layouts/                   # AppShell
│  ├─ pages/                     # 业务页面（含 worldbook 页面）
│  ├─ router/                    # 路由
│  ├─ services/                  # 业务服务
│  ├─ stores/                    # Pinia store
│  ├─ styles/                    # 全局样式
│  ├─ views/                     # 欢迎页等
│  └─ __tests__/                 # Vitest 测试
├─ index.html                    # Vite 入口 HTML（唯一）
├─ package.json
└─ vite.config.js
```

## 开发脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动前端开发服务器 |
| `npm run server` | 启动 Express 后端 |
| `npm run test:run` | 运行 Vitest（一次性） |
| `npm run build` | 生产构建 |
| `npm run verify` | 测试 + 构建回归 |

## 数据与持久化

- 运行态主存储：localStorage（例如世界书、写作、素材、画布状态）
- 后端静态数据：`server/data/worlds` 与 `server/data/events`
- 世界书写入链路：写作收件箱中的 `worldbook-draft` 可入库到当前活跃世界书

## 安全与部署提示

- `.env`、`.env.*`（除 `.env.example`）已被 `.gitignore` 排除；请勿把真实 API key 提交到仓库
- 任何 `marked` 渲染的 HTML 在进入 `v-html` 之前都会经过 `src/utils/sanitize.js`（DOMPurify）。SVG 由同一文件的 `sanitizeSvg` 处理
- **公网部署模型（无鉴权）**：服务器在公网上对所有人开放 `/api/*`，**不**做鉴权（`server/index.js` 只挂 `cors()` 与 `express.json()`）。前端需要在 `Settings.vue` 里给每位用户自己配置自己的 API key。
- **用户 API key 的隔离边界**：用户的 `apiKey` / Mem0 `apiKey` 等敏感字段**只**存在各自浏览器的 `localStorage` 中（key 见 `src/composables/useStorage.js` 里的 `STORAGE_KEYS`）。服务器**从不**落盘任何用户的 key，请求时由前端在请求体内注入，服务端做一次中转就把字段透传到上游 LLM/Mem0。
- 历史背景：早期版本曾把 key 落到 `secrets.json`、或要求设置 `PINAX_TOKEN` 才能访问，这两条路径都已删除。详见 `## 本次清理记录`。
- 公网部署前建议：① nginx / 反代层加 rate limit（防止 LLM 中转被刷爆）；② 任何 reverse proxy 都不要在 access log 里透传 `Authorization` / 请求体里的 `apiKey`；③ 定期轮换上游 LLM 的 key。

## 文档入口

- 总入口：`docs/README.md`
- 主计划：`docs/PLAN.md`
- 当前执行板：`docs/plan/current-execution-plan.md`
- 开发规范：`docs/engineering/development-standards.md`
- 故障排查：`docs/operations/troubleshooting.md`
- 近期日志：`docs/LOG.md`

## 本次清理记录

- 删除重复入口文件：`public/index.html`
  - 原因：项目真实入口是根目录 `index.html`，`public/index.html` 会造成入口认知重复。
- **API key 隔离重构（user secrets 全部下放到客户端）**：
  - 删除 `server/index.js` 里的 `PINAX_TOKEN` Bearer 鉴权中间件，服务器恢复"公网对所有人开放 `/api/*`"模型。
  - 删除 `server/routes/chat.js` 里的 `/secrets/read` 与 `/secrets/write` 端点，以及 `server/services/memoryService.js` 里读 `secrets.json` 的 `loadMem0Secrets`。
  - `server/routes/chat.js` 与 `server/routes/preferences.js` 不再回退去读 `process.env.MEM0_API_KEY` / 服务端 secrets；请求体里必须自带 `apiKey` / `mem0ApiKey`，否则直接 `400 API_KEY_REQUIRED`。
  - 前端 `src/services/api.js`、`src/services/memorySync.js`、`src/components/Settings.vue`、`src/composables/useApiSettings.js` 改为只从 `localStorage` 读 key（key 见 `STORAGE_KEYS`），并在每个出站请求里把 key 注入请求体。
  - `.env.example` 同步移除 `MEM0_API_KEY` / `PINAX_TOKEN` / `VITE_PINAX_TOKEN`（这三条是历史"服务端持久化用户 key"的入口，留着会误导）。
  - 测试 `src/__tests__/memorySync.test.js` 改为通过 `localStorage` 播种 mem0 配置，而不是 mock `/chat/secrets/read`。
  - 理由：用户希望公网直接访问，**关键不是鉴权**，而是**绝不让一个用户的 key 出现在另一台机器/另一个用户能读到的地方**。之前的 `secrets.json` 是单用户本地时遗留的产物，公网部署后会变成跨用户泄露点。
