# Pinax

Pinax 是一个“可玩的世界书”工作台：先选择一个世界，让 AI GM 推动冒险，再把剧情沉淀成素材、章节和分镜。

当前主线路径：

```text
选择世界
  -> 开始冒险
  -> 沉淀剧情日志和素材
  -> 写成作品
  -> 整理成分镜或继续扩展世界
```

## 快速开始

```bash
git clone <Pinax 仓库地址>
cd text-game-framework
npm install

# 终端 1：起后端（3001）
npm run server

# 终端 2：起前端（5173）
npm run dev
```

打开 `http://localhost:5173` 后：

1. 右上角 **设置** 填 LLM API key
2. 进入 **体验**
3. 先 **导入种子世界**
4. 回到体验页点 **进入这个世界**
5. 开始输入行动

更完整的用户流程看 [docs/user-manual/README.md](docs/user-manual/README.md)。

## 文档入口

- 用户说明书：[docs/user-manual/README.md](docs/user-manual/README.md)
- 项目文档导航：[docs/README.md](docs/README.md)
- 当前产品主线：[docs/PLAN.md](docs/PLAN.md)
- 近期变化：[docs/LOG.md](docs/LOG.md)
- 代码 owning surface：[docs/src/code-map.md](docs/src/code-map.md)
- 已知风险：[docs/src/known-issues.md](docs/src/known-issues.md)
- 公网部署：[docs/user-manual/05-deployment.md](docs/user-manual/05-deployment.md)

## 主要工作区

- **体验**：进入世界、进行 AI GM 冒险
- **设定**：快速导入、高级设置、结构化设定、世界地图
- **写作**：章节管理、扩写、改写、续写
- **素材**：剧情片段和灵感真源
- **画布**：素材关系、时间轴、分镜编排

## 开发脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动前端开发服务器 |
| `npm run server` | 启动 Express 后端 |
| `npm run test` | Vitest 监听模式 |
| `npm run test:run` | 一次性跑所有测试 |
| `npm run test:arch` | 只跑架构守卫测试 |
| `npm run build` | 生产构建到 `dist/` |
| `npm run docs:dev` | 本地启动 VitePress 文档站 |
| `npm run docs:build` | 构建 VitePress 文档站 |
| `npm run verify` | `test:run` + `build` |
| `npm start` | PM2 启动生产服务 |
| `npm run stop` | PM2 停止生产服务 |

## 仓库结构

- `src/`：Vue 前端
- `server/`：Express 后端
- `docs/`：用户手册、开发文档、计划、日志
- `deploy/`：部署模板和脚本
- `ecosystem.config.js`：PM2 配置

## 数据与部署边界

- 用户级 API key 默认存浏览器 `localStorage`，不是服务器配置。
- 服务端接收并转发这些 key，但不提供仓库内持久化的用户密钥存储。
- 公网部署默认是开放模型，必须自己处理反向代理日志、限流和 HTTPS。

部署细节和风险说明见 [docs/user-manual/05-deployment.md](docs/user-manual/05-deployment.md)。
