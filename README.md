# Pinax

Pinax 是以作者为中心、以本地数据为基础的 AI 辅助创作工作台。核心入口是 `/authoring`：管理书稿与章节、查阅设定、尝试故事走向，再由作者编辑、采用或放弃生成内容。

可以直接开始写作，不必先生成世界、玩一段冒险或配置 AI。设定、地图、体验和视听创作是可选的创作支撑：

```text
正文 / 构思 / 大纲 ← 设定、地点、历史、体验素材
        ↕
  受控推演 → 可编辑草稿 → 作者确认采用
        ↓
  素材 / 插画 / 漫画 / 画布与分镜
```

项目正在向 Authoring 收敛并打磨 UI/UX 与故事试演体验；详细进度以 [当前计划](docs/PLAN.md) 和 [共享状态](docs/STATUS.md) 为准。计划中的玩法、真实模型验收和桌面迁移进度不等同于已发布能力。

## 快速开始

建议使用 Node.js 22.x（≥22.13）和 npm；测试及部分依赖对 Node 小版本有要求，SQLite 等原生依赖还需匹配系统与运行时。当前仓库不再适合按旧部署脚本的 Node 18 配置安装。

```bash
git clone <Pinax 仓库地址>
cd text-game-framework
npm ci

# 终端 1：起后端（3001）
npm run server

# 终端 2：起前端（5173）
npm run dev
```

打开 `http://localhost:5173` 后：

1. 进入 **创作**（或直接打开 `/authoring`），新建书稿与章节即可写作。
2. 需要时关联世界书，在角色、设定、大纲或双栏中查阅、编辑资料。
3. 使用 AI 前，在 **设置** 中配置模型渠道并测试连接；生成内容先审阅，再决定是否采用。
4. 若使用内置 MiniMax，由部署者参考 [server/.env.example](server/.env.example) 配置 `server/.env` 中的 `MINIMAX_API_KEY`；没有服务端密钥时该渠道不能实际生成。自带渠道与服务端内置渠道的配置不要混淆。

前端默认5173，Express默认3001，开发代理配置见 [vite.config.js](vite.config.js)。后端读取 `server/.env`，根目录 `.env.example` 的旧服务参数需按用途迁入服务端环境；不要把私密key放进 `VITE_*` 前端变量。

用户手册见 [使用指南](docs/user-manual/README.md)。部分旧章节仍描述体验优先的流程，当前创作入口和能力归属以本页与代码地图为准。

## 当前分支与部署

- `main`：开发集成主线，功能优先从此分支建立隔离 worktree。
- `server-version`：下游生产适配分支；功能在 `main` 验证后再同步、适配，不直接在此开发普通功能。
- 临时集成分支及进行中的修改见 [STATUS.md](docs/STATUS.md)，README 不固定某一轮分支名。

部署前确认目标分支、环境配置和数据备份；不要直接覆盖服务器上的适配改动。在已检出并验证的部署分支中构建：

```bash
npm ci
npm run build
```

Express提供 `dist/` 和API。生产进程可按 [ecosystem.config.js](ecosystem.config.js) 使用PM2管理（需另行安装）；更新后端需重启对应进程，具体名称以部署现场为准。HTTPS、访问控制、限流、密钥与日志脱敏由部署者配置。

[deploy/](deploy/) 保留旧服务器模板；`setup.sh` 含 `/root/Pinax` 固定路径、Node 18安装和系统级Nginx修改，不能作为当前通用一键安装器直接执行。

## 文档入口

- 当前计划：[docs/PLAN.md](docs/PLAN.md)
- 产品路线图：[docs/plan/pinax-integrated-product-roadmap.md](docs/plan/pinax-integrated-product-roadmap.md)
- 近期变化：[docs/LOG.md](docs/LOG.md)
- 项目文档导航：[docs/README.md](docs/README.md)
- 当前体验优化：[UI/UX 与故事试演计划](docs/plan/authoring-ux-and-story-play-plan-20260905.md)
- 代码 owning surface：[docs/src/code-map.md](docs/src/code-map.md)
- 已知风险：[docs/src/known-issues.md](docs/src/known-issues.md)

## 主要工作区

- **创作 `/authoring`**：章节与构思、大纲、双栏编辑、资料助手、批注、查找、校对与历史；推演草稿经作者审阅采用
- **设定**：快速导入、高级设置、结构化设定、世界地图
- **体验 `/experience`**：保留文字冒险与旧会话兼容，不是写作的前置步骤
- **素材**：带来源的剧情片段、图片和创作资产
- **画布**：素材关系、时间轴、分镜编排

`/writing` 已重定向到 `/authoring`。Electron 项目底座与旧数据迁移工具已存在，但 Authoring 到桌面项目真源的完整适配仍按桌面专项计划推进，不将浏览器稿件宣称为已自动同步到磁盘项目。

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
| `npm run verify:full` / `npm run verify` | 核心测试及预算、Vite构建、diff检查、VitePress构建 |
| `npm run verify:contract` | 核心测试和预算检查 |
| `npm run desktop:dev` | Electron开发入口，需要对应原生依赖环境 |
| `npm run desktop:make` | 按Forge配置生成桌面分发包，平台验收另行执行 |
| `npm start` | PM2 启动生产服务 |
| `npm run stop` | PM2 停止生产服务 |

核心套件硬预算为最多20个文件/200个用例。浏览器旅程、离线eval和真实provider测试另有前置条件，见 [验证说明](docs/src/test-status.md)；完整脚本以 [package.json](package.json) 为准。若已有开发服务运行，复用它，不为验收重复启停。

## 仓库结构

- `src/`：Vue 前端
- `server/`：Express 后端
- `shared/`：前后端共享合同与校验
- `electron/`：桌面进程、项目存储与迁移
- `docs/`：用户手册、开发文档、计划、日志
- `scripts/`：回归、诊断、基准与发布检查
- `prototype/`：仍被研究/验证使用的实验原型，不是默认产品入口
- `agent-skills/`：仓库工作流规范
- `deploy/`：部署模板和脚本
- `ecosystem.config.js`：PM2 配置

## 数据与部署边界

- 浏览器稿件与配置主要在 `localStorage`；来源归档、媒体等还使用 IndexedDB。浏览器清理、隐私模式和配额会影响保存，请定期使用备份/导出；本地优先不等于自动云同步。
- 自带API key默认保存在当前浏览器，生成请求可能经服务端代理发送。内置渠道密钥由部署者放在服务端环境，禁止提交真实 `.env`。
- 服务端媒体缓存、协作数据库与Electron项目是独立数据边界；不要把 `data/` 或数据库当构建缓存删除。
- `dist/`、依赖和临时验收输出不应提交。清理时保留正在执行的计划、fixture、未确认截图和未提交工作，不能仅凭“未import”就删除迁移或兼容入口。

## 许可证

Pinax 代码采用 [PolyForm Noncommercial License 1.0.0](LICENSE)。这是一种允许查看、修改和非商业再分发的 source-available 许可证，不是 OSI 定义下的开源许可证：商业销售、商业 SaaS、付费托管、商业集成或其他商业用途需要事先取得版权所有者的单独许可。

本许可证只覆盖本仓库中由 Pinax 项目提供的代码和文件。第三方依赖、字体、图片、演示素材、模型服务以及用户自己的世界书、文章和生成内容，仍分别受其原始许可证、服务条款或用户权利约束。完整条款见仓库根目录的 [LICENSE](LICENSE)。
