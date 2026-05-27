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

## 工作台与路由

当前应用使用统一壳层（`AppShell`），核心路由如下：

| 路径 | 名称 | 用途 |
| --- | --- | --- |
| `/` | welcome | 工作台欢迎页 |
| `/experience` | experience | 体验页 |
| `/experience/worldbook` | experience-worldbook | 世界书导入 |
| `/experience/worldbook/advanced` | experience-worldbook-advanced | 世界书编辑 |
| `/writing` | writing | 小说写作 |
| `/materials` | materials | 素材管理 |
| `/poetry-lab` | poetry-lab | 诗歌灵感工坊 |
| `/prose-essay` | prose-essay | 散文卡片工坊 |

兼容重定向：`/fit`、`/game`、`/notes` 等旧入口仍可访问，会重定向到新路由。

## 世界书定位说明（协调版）

你提到的“世界书放在一级目录不够协调”是合理感受。当前实现里，它在**代码目录层面**和**业务入口层面**分别如下：

- 代码层：页面组件位于 `src/pages/WorldBookQuickImport.vue` 与 `src/pages/WorldBookEditor.vue`
- 路由层：世界书被约束在 `/experience/worldbook*` 子路径下，不是独立业务域
- 导航层：在工作台活动栏中单列 `worldbook`，便于快速切换导入/编辑

为了在“不大迁目录”的前提下保持协调，本项目采用“**路由归属优先于文件夹层级**”的约定：

- 功能归属以路由段为准（worldbook 归属 experience 域）
- 页面文件暂留在 `src/pages/`，但在文档中按域分组解释
- 新增世界书能力优先落在现有两个页面或其子组件中，避免再扩散成平级入口

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
