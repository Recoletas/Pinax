# Pinax

Pinax 是一个**地理与历史可持续演化的 AI GM 创作系统**，也是一套面向小说、文字冒险和多媒体创作的本地优先工作台。
当前主链是：

```text
选择世界
  -> 开始冒险
  -> 沉淀剧情日志和素材
  -> 写成作品
  -> 整理成分镜或继续扩展世界
```

也就是说：**设定生成的地点要进入历史，历史要进入冒险，冒险结果再回到世界和作品。**

当前第一部分内测聚焦“结构化设定中的地点目录”：世界书概述先整理为待审地点草稿，用户逐项确认后才进入正式世界书和地图。完整操作路径见 [第一部分内测说明](docs/user-manual/07-internal-test.md)。

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

## 当前分支与部署

- `main`：开发集成主线，服务器默认应跟踪此分支。
- `integration/online-agents-canvas-video-f`：本轮集成分支，验证通过后快进合并到 `main`。
- `server-version`：生产适配分支，保留独立部署适配，不作为本轮服务器拉取目标。

服务器部署当前主线时使用：

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm run build
pm2 restart pinax
```

如果 PM2 应用名不同，以服务器现有的 `ecosystem.config.js` 配置为准。前端已经部署但后端路由仍返回 404 时，需要重启对应后端进程加载新代码。

## 文档入口

- 当前计划：[docs/PLAN.md](docs/PLAN.md)
- 产品路线图：[docs/plan/pinax-integrated-product-roadmap.md](docs/plan/pinax-integrated-product-roadmap.md)
- 近期变化：[docs/LOG.md](docs/LOG.md)
- 项目文档导航：[docs/README.md](docs/README.md)
- 代码 owning surface：[docs/src/code-map.md](docs/src/code-map.md)
- 已知风险：[docs/src/known-issues.md](docs/src/known-issues.md)

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

## 许可证

Pinax 代码采用 [PolyForm Noncommercial License 1.0.0](LICENSE)。这是一种允许查看、修改和非商业再分发的 source-available 许可证，不是 OSI 定义下的开源许可证：商业销售、商业 SaaS、付费托管、商业集成或其他商业用途需要事先取得版权所有者的单独许可。

本许可证只覆盖本仓库中由 Pinax 项目提供的代码和文件。第三方依赖、字体、图片、演示素材、模型服务以及用户自己的世界书、文章和生成内容，仍分别受其原始许可证、服务条款或用户权利约束。完整条款见仓库根目录的 [LICENSE](LICENSE)。
