# WriterHelper / Text Game Framework

一个前后端分离的中文创作与文字体验项目，包含三条核心工作流：

- 体验：世界选择 + 文字冒险
- 写作：书籍/章节管理与长文编辑
- 诗歌灵感工坊：树状灵感生成、反馈续写与导出

项目基于 Vue 3 + Vite + Express，支持可切换 AI 提供商与本地数据持久化。

## 目录

- [功能总览](#功能总览)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [页面与路由](#页面与路由)
- [后端 API](#后端-api)
- [数据持久化约定](#数据持久化约定)
- [项目结构](#项目结构)
- [开发说明](#开发说明)
- [常见问题](#常见问题)

## 功能总览

### 1) 体验模式

- 入口：`/fit` -> `/game`
- 基于世界配置启动游戏状态
- 支持事件触发、时间推进、状态更新
- 可切换 AI 叙事模式与规则引擎模式

### 2) 写作模式（小说）

- 入口：`/writing`
- 书籍-章节结构化管理
- 支持章节新建、删除、切换、自动保存
- 多编辑功能：排版、分隔、字体设置、随机取名、查找替换、Markdown/预览切换
- 右侧隐藏式速记栏：
  - 单行输入，内容增多自动扩展
  - 图标操作：保存、导入剪贴板、跳转笔记、跳转小说

### 3) 笔记模式

- 入口：`/notes`
- 与写作并列的工作区（在写作头部可切换）
- 单层笔记列表（无书/章层级）
- 与写作一致的编辑体验和自动保存
- 数据与速记共享（统一写入 `writing_notes`）

### 4) 诗歌灵感工坊

- 入口：`/poetry-lab`
- 生成树状灵感节点（可控制分支与层级）
- 节点反馈模式：正向/负向/中性
- 对选中节点继续生成分支、删除节点
- 导出 Markdown / TXT，支持全树或自定义节点导出
- 右侧速记栏与写作页一致，支持导入剪贴板

## 技术栈

### 前端

- Vue 3
- Vue Router 4
- Pinia
- Axios
- marked + turndown
- Vite 5

### 后端

- Node.js + Express
- CORS
- 本地 JSON 数据文件驱动（世界/事件）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动后端

```bash
npm run server
```

默认监听：`http://localhost:3001`

### 3. 启动前端

```bash
npm run dev
```

默认地址：`http://localhost:5173`

### 4. 生产构建

```bash
npm run build
npm run preview
```

## 页面与路由

当前路由定义位于 `src/router/index.js`：

- `/`：主页（WriterHelper）
- `/fit`：体裁选择（小说/诗歌）
- `/game`：体验页
- `/writing`：小说写作页
- `/notes`：笔记页
- `/poetry-lab`：诗歌灵感工坊

## 后端 API

后端入口：`server/index.js`

### 配置相关

- `GET /api/config/worlds`：获取世界列表
- `GET /api/config/worlds/:worldId`：获取世界详情

### 游戏相关

- `POST /api/game/start`：开始游戏
- `POST /api/game/action`：发送行动
- `GET /api/game/state/:gameId`：获取游戏状态

### 事件相关

- `GET /api/events/categories`：获取事件分类
- `GET /api/events/:category`：获取分类事件

### 聊天与 AI 相关

- `POST /api/chat/chat`：多提供商聊天请求
- `POST /api/chat/models`：拉取模型列表
- `POST /api/chat/test`：测试 API 连通性
- `POST /api/chat/secrets/write`：写入密钥配置
- `POST /api/chat/secrets/read`：读取密钥配置

## 数据持久化约定

本项目大量使用 localStorage，核心键如下：

### 写作与笔记

- `writing_books`：小说书籍与章节
- `writing_notes`：笔记列表
- `quick_note_draft`：速记输入暂存

### 诗歌工坊

- `poetry_idea_tree_v2`：灵感树
- `poetry_idea_positions_v2`：节点坐标
- `poetry_adapt_profile_v2`：反馈适配状态

### 其他

- `dialogue_characters`：体验模式下已保存角色
- `writing_*`：写作上下文相关（人物/时间/场景等）

## 项目结构

```text
text-game-framework/
├─ src/
│  ├─ pages/
│  │  ├─ Home.vue
│  │  ├─ Fit.vue
│  │  ├─ Game.vue
│  │  ├─ Writing.vue
│  │  ├─ Notes.vue
│  │  └─ PoetryLab.vue
│  ├─ components/
│  ├─ stores/
│  │  └─ gameStore.js
│  ├─ services/
│  │  └─ api.js
│  └─ router/
│     └─ index.js
├─ server/
│  ├─ index.js
│  ├─ routes/
│  │  ├─ game.js
│  │  ├─ events.js
│  │  ├─ config.js
│  │  └─ chat.js
│  ├─ services/
│  │  ├─ eventEngine.js
│  │  ├─ timeSystem.js
│  │  └─ stateManager.js
│  └─ data/
│     ├─ worlds/
│     └─ events/
├─ public/
├─ package.json
└─ vite.config.js
```

## 开发说明

### 新增世界

1. 在 `server/data/worlds/` 新建目录
2. 放置 `world.json`
3. 至少包含 `config.defaultLocation`

### 新增事件分类

1. 在 `server/data/events/` 新增 `*.json`
2. 每项事件保持统一字段结构
3. 前端会在分类接口中自动读取

### AI 提供商配置

后端 `server/routes/chat.js` 已内置多提供商默认参数（如 OpenAI、Claude、OpenRouter、Ollama 等）。
建议通过前端设置页写入后端 secrets，再测试连接。

## 常见问题

### 1) 速记导入失败

- 浏览器不支持 Clipboard API，或权限被拒绝
- 需要在安全上下文（通常是 `http://localhost`）下使用

### 2) 启动后接口 404

- 确认后端已启动（`npm run server`）
- 确认前端请求走 `/api/*`，并由 Vite 代理到后端

### 3) 世界无法加载

- 检查 `server/data/worlds/<worldId>/world.json` 是否存在且 JSON 合法

---

如果你准备继续扩展：

- 可以先为 `writing_notes` 增加标签和搜索
- 然后把 PoetryLab 的导出格式扩展为可回导结构（JSON）
- 最后再接入持久化后端（替代 localStorage）以支持多设备同步
