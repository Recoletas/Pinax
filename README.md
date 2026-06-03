# WriterHelper / Text Game Framework

中文创作为核心的前后端分离项目。Vue 3 + Vite 前端，Express 后端，用户数据全部存在浏览器 localStorage。整合了体验（文字冒险）、世界书（设定数据库）、写作（小说章节）、素材（叙事片段）、散文画布（节点-边-时间轴）这一条完整工作流。

**想用这个框架写小说 / 做文字游戏？** 看 [说明书](docs/user-manual/README.md)。

**想改源码 / 二次开发？** 直接看下面的快速开始 + 开发脚本表。

## 快速开始

```bash
git clone <仓库地址>
cd text-game-framework
npm install

# 终端 1：起后端（端口 3001）
npm run server

# 终端 2：起前端（端口 5173）
npm run dev
```

浏览器开 http://localhost:5173 。第一次进入会引导你配 LLM API key，详见说明书的 [快速开始](docs/user-manual/01-quickstart.md)。

公网部署到自己的服务器？看 [说明书 → 部署到公网](docs/user-manual/05-deployment.md)。

## 它能做什么

- **体验** —— 文字冒险，AI 主持，状态栏、机制面板、里程碑
- **世界书** —— 设定数据库，关键词触发注入 prompt。预设 / 文本 / AI 说明三种导入方式
- **结构化设定** —— 朝代 / 角色 / 地点的字段化卡片
- **世界地图** —— Voronoi 程序生成，地形、气候、生物群系、文化圈、势力范围
- **小说写作** —— 书 / 章管理，AI 扩展 / 改写 / 续写，章节分镜导出
- **素材** —— 写作中产生的金句和重要事件，带情绪标签
- **散文画布** —— 节点-边-时间轴，把素材排成分镜版本
- **图片生成** —— 侧栏 AI 生图，绑多个 provider
- **顾问** —— OpenClaw 驱动的章节体检

详细功能介绍 + 四个典型工作流：看 [说明书 → 功能与工作流](docs/user-manual/03-features.md)。

## 关键技术点

- **密钥模型** —— 用户的 LLM / Mem0 API key 只存在各自浏览器的 `localStorage`，服务器不落盘。详见 [说明书 → 部署到公网](docs/user-manual/05-deployment.md) 的"密钥模型"
- **公网部署** —— 服务器**无鉴权**对所有人开放 `/api/*`。设计取舍详见上面那一节
- **AI 安全** —— 所有 `v-html` 入口都过 DOMPurify（`src/utils/sanitize.js`）

## 开发脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动前端开发服务器（Vite，5173） |
| `npm run server` | 启动 Express 后端（3001） |
| `npm run test` | Vitest 监听模式 |
| `npm run test:run` | 一次性跑所有测试 |
| `npm run test:arch` | 只跑架构守护测试 |
| `npm run build` | 生产构建到 `dist/` |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | ESLint（`src/` 下 `.js` 和 `.vue`） |
| `npm run verify` | `test:run` + `build`，发布前跑一遍 |
| `npm start` | PM2 启动（生产环境） |
| `npm run stop` | PM2 停止 |

## 项目结构

```
text-game-framework/
├─ docs/                       # 计划、规范、日志
│  ├─ user-manual/             # 用户向中文说明书
│  ├─ guides/                  # 单点深入指南
│  ├─ operations/              # 运维排障（维护者用）
│  ├─ engineering/             # 开发者规约
│  └─ superpowers/             # 设计稿与实施计划
├─ server/                     # Express 后端
│  ├─ index.js
│  ├─ routes/                  # advisor / chat / config / events / game / generate / openclaw / preferences
│  ├─ services/                # memoryService / openclawService / eventEngine / stateManager / timeSystem / advisorTaskService
│  └─ data/                    # worlds / events / npcs 的 JSON
├─ src/                        # Vue 3 前端
│  ├─ components/              # 通用组件（含 ImageGenRail）
│  ├─ composables/             # useStorage / useApiSettings / useMem0 / useAdvisor / ...
│  ├─ pages/                   # 业务页面
│  ├─ router/                  # 路由
│  ├─ services/                # 业务服务（api / generation / promptRegistry / ...）
│  ├─ stores/                  # Pinia store（gameStore / worldStore / geographyStore / ...）
│  ├─ views/                   # 欢迎页
│  └─ __tests__/               # Vitest
├─ deploy/                     # nginx 配置 + 一键安装脚本
├─ ecosystem.config.js         # PM2 配置
├─ vite.config.js
└─ package.json
```

## 数据持久化

- **用户数据**全在 `localStorage`。备份和键名清单：说明书 [04-configuration.md](docs/user-manual/04-configuration.md) 的"localStorage 键都在存什么"那一节
- **后端静态数据**：`server/data/worlds`（五个预设世界）+ `server/data/events`（事件 JSON）

## 公网部署

最简版流程：

1. 服务器装 Node.js 20 + nginx + PM2
2. `npm ci && npm run build`
3. `pm2 start ecosystem.config.js`
4. 配 nginx（参考 `deploy/nginx-pinax.conf`），记得关 access log 里的请求体，加 rate limit
5. HTTPS 用 Let's Encrypt

完整版（含密钥模型、轮换、监控、nginx 坑）：[说明书 → 部署到公网](docs/user-manual/05-deployment.md)。

## 文档导航

- 用户向：[说明书](docs/user-manual/README.md)
- 运维：[docs/operations/troubleshooting.md](docs/operations/troubleshooting.md)
- 开发者规约：[docs/engineering/development-standards.md](docs/engineering/development-standards.md)
- 内部计划：[docs/PLAN.md](docs/PLAN.md) / [docs/LOG.md](docs/LOG.md)
- 设计稿：[docs/superpowers/](docs/superpowers/)（specs / plans / notes）
