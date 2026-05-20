# WriterHelper / Text Game Framework

一个前后端分离的中文创作与文字体验项目，包含四条核心工作流：**游戏体验**、**小说写作**、**散文随笔**、**诗歌灵感工坊**。

项目基于 Vue 3 + Vite + Express，支持可切换 AI 提供商与本地数据持久化。

---

## 目录

- [功能总览](#功能总览)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [页面与路由](#页面与路由)
- [各页面详细介绍](#各页面详细介绍)
- [后端 API](#后端-api)
- [数据持久化约定](#数据持久化约定)
- [开发说明](#开发说明)

---

## 功能总览

### 1) 游戏体验模式

- 入口：`/fit`（体裁选择） -> `/game`（体验页）
- 基于世界配置启动游戏状态
- 支持事件触发、时间推进、状态更新
- 可切换 AI 叙事模式与规则引擎模式

### 2) 小说写作模式

- 入口：`/writing`
- 书籍-章节结构化管理
- 支持章节新建、删除、切换、自动保存
- 多编辑功能：排版、分隔、字体设置、随机取名、查找替换、Markdown/预览切换
- 右侧隐藏式速记栏

### 3) 散文随笔模式

- 入口：`/prose-essay`
- 卡片式自由写作，支持 AI 扩展
- 情绪标签系统（平静/愉悦/悲伤/愤怒/恐惧/惊讶）
- **双模式切换**：写作模式 / 编导模式
  - **写作模式**：意象生成、关系边（隐喻/并置/断裂/回声）、大纲序列
  - **编导模式**：景别/运镜/时长/台词/音效字段，视觉关联边（跳切/叠化/淡入淡出等），时间轴
- 支持导出 Markdown / TXT / JSON，可导出剪映/Premiere 格式

### 4) 诗歌灵感工坊

- 入口：`/poetry-lab`
- 生成树状灵感节点（可控制分支与层级）
- **双模式切换**：写作模式 / 编导模式
  - **写作模式**：树状意象生成，反馈续写（正向/负向/中性），意象群
  - **编导模式**：景别/运镜/时长/色调/声音字段，场景组，视觉关联边，生成分镜图
- 画布操作：指针/连线/剪刀/成组
- 节点详情弹窗，版本历史（可折叠/删除/恢复）
- 导出 Markdown / TXT，支持全树或自定义节点导出
- 右侧速记栏，支持导入剪贴板

### 5) 笔记模式

- 入口：`/notes`
- 单层笔记列表，与写作并列的工作区
- 数据与速记共享

---

## 技术栈

### 前端

- Vue 3 + Composition API
- Vue Router 4
- Pinia（状态管理）
- Axios
- marked + turndown（Markdown 渲染）
- Vite 5

### 后端

- Node.js + Express
- CORS
- 本地 JSON 数据文件驱动（世界/事件）

---

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

### 5. 提交前质量门禁（建议）

```bash
npm run verify
```

该命令会串行执行：
- `npm run test:run`（包含架构守卫测试，防止页面/store 直接调用 `sendChat`）
- `npm run build`

### 6. 路由重构阶段一（工作台壳）

- 新增工作台壳路由：`/work/*`
- 新增壳层组件：`src/layouts/AppShell.vue`
- 新增导航配置：`src/config/workbenchNav.js`
- 新增导航组件：
   - `src/components/workbench/ActivityBar.vue`
   - `src/components/workbench/SidePanel.vue`
- 兼容旧路径：`/fit`、`/game`、`/writing`、`/notes`、`/poetry-lab`、`/prose-essay` 会重定向到 `/work/*` 下的对应页面

该阶段只完成“壳层承载旧页面”，业务页面逻辑与数据流保持不变，便于稳步迁移。

---

## 项目结构

```
text-game-framework/
├─ src/
│  ├─ pages/
│  │  ├─ Home.vue          # 首页
│  │  ├─ Fit.vue           # 体裁选择
│  │  ├─ Game.vue          # 游戏体验
│  │  ├─ Writing.vue       # 小说写作
│  │  ├─ Notes.vue         # 笔记
│  │  ├─ PoetryLab.vue    # 诗歌灵感工坊
│  │  └─ ProseEssay.vue    # 散文随笔卡片
│  ├─ components/
│  │  ├─ Character.vue     # 角色卡片
│  │  ├─ ContextSelector.vue
│  │  ├─ GamePanel.vue     # 游戏面板
│  │  ├─ ImageGenRail.vue  # AI 生图侧边栏
│  │  ├─ InputArea.vue     # 输入区
│  │  ├─ Inventory.vue     # 物品栏
│  │  ├─ QuestLog.vue      # 任务日志
│  │  ├─ Settings.vue      # 设置
│  │  ├─ StatusBar.vue     # 状态栏
│  │  └─ WorldMap.vue      # 世界地图
│  ├─ composables/
│  │  ├─ useContextSelector.js
│  │  └─ useTheme.js       # 主题切换
│  ├─ services/
│  │  └─ api.js            # AI API 调用
│  ├─ stores/
│  │  └─ gameStore.js      # 游戏状态
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

---

## 页面与路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Home | 首页 |
| `/fit` | Fit | 体裁选择 |
| `/game` | Game | 游戏体验 |
| `/writing` | Writing | 小说写作 |
| `/notes` | Notes | 笔记 |
| `/poetry-lab` | PoetryLab | 诗歌灵感工坊 |
| `/prose-essay` | ProseEssay | 散文随笔卡片 |

---

## 各页面详细介绍

### Home.vue — 首页

项目入口，提供四种创作模式的导航入口。

---

### Fit.vue — 体裁选择

选择创作体裁（小说/诗歌），决定进入游戏体验还是其他创作模式。

---

### Game.vue — 游戏体验

基于世界配置运行的状态机式文字冒险。

**主要功能：**
- 左侧：AI 叙事/用户输入区域
- 中部：状态栏（当前场景/时间/状态点）
- 右侧：角色/物品栏/任务日志/世界地图可折叠面板
- 底部：输入区

**核心机制：**
- 事件引擎驱动状态变化
- AI 叙事与规则引擎双模式
- 时间推进系统
- 状态点消耗与恢复

---

### Writing.vue — 小说写作

长篇文章编辑管理工具。

**主要功能：**
- 书籍-章节层级结构（新建/删除/切换）
- 富文本编辑区：排版、分隔线、字体设置
- 随机人名生成
- 查找替换
- Markdown / 预览切换
- 自动保存
- 右侧隐藏式速记栏（保存/导入/跳转）
- 导出 TXT / Markdown

---

### Notes.vue — 笔记

单层笔记管理，与写作并列工作区，数据与速记共享。

---

### ProseEssay.vue — 散文随笔卡片

卡片式自由写作与 AI 扩展工具。

**双模式：**

| 功能 | 写作模式 | 编导模式 |
|------|----------|----------|
| 生成 | 意象扩展 | 生成分镜图 |
| 边类型 | 隐喻/并置/断裂/回声 | 跳切/叠化/淡入淡出/对比蒙太奇/交叉剪辑/匹配剪辑 |
| 序列 | 大纲序列 | 时间轴 |
| 节点字段 | 情绪 | 景别/运镜/时长/台词/音效 |
| 导出 | Markdown/TXT/JSON | 剪映/Premiere 格式 |

**卡片详情面板（写作模式）：**
- 情绪标签选择
- 扩展按钮
- 撤销/重做/保存/删除

**卡片详情弹窗（编导模式）：**
- 景别下拉（远景/全景/中景/近景/特写）
- 运镜下拉（推/拉/摇/移/跟/固定）
- 时长数字输入
- 色调描述文本框
- 声音描述文本框

**边渲染：**
- 写作模式边：虚线/点线/实线区分类型
- 编导模式边：跳切用断裂点线，视觉回声用波浪线，其他实线

---

### PoetryLab.vue — 诗歌灵感工坊

树状灵感生成、反馈续写与导出的创作工具。

**双模式：**

| 功能 | 写作模式 | 编导模式 |
|------|----------|----------|
| 生成 | 生成灵感树 | 生成分镜图 |
| 边类型 | 隐喻/并置/断裂/回声/层级 | 视觉隐喻/并列镜头/跳切/视觉回声/细节切入 |
| 群组 | 意象群 | 场景组 |
| 节点字段 | 例句/反馈分 | 景别/运镜/时长/色调/声音 |

**画布操作模式：**
- 指针：正常选择拖拽
- 连线：按住节点拖向另一节点创建关系边
- 剪刀：点击边删除（再次点击节点确认删除节点）
- 成组：框选节点命名成组

**节点详情弹窗（编导模式）：**
- 景别/运镜/时长/色调/声音输入
- 保存后更新节点 extraFields

**版本历史：**
- 可折叠显示，显示数量
- 每条快照可预览/删除/恢复
- 最大高度 180px 超出滚动
- 恢复后自动收起

**图例：**
- 固定在画布右上角（`position: fixed`）
- 不随画布滚动，pointer-events: none

---

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

### 聊天与 AI

- `POST /api/chat/chat`：多提供商聊天请求
- `POST /api/chat/models`：拉取模型列表
- `POST /api/chat/test`：测试 API 连通性
- `POST /api/chat/secrets/write`：写入密钥配置
- `POST /api/chat/secrets/read`：读取密钥配置

---

## 数据持久化约定

核心 localStorage 键：

### 通用

- `writing_notes`：速记与笔记数据
- `prose_quick_note_draft`：速记草稿暂存

### 小说写作

- `writing_books`：书籍与章节数据
- `writing_characters`：已保存角色
- `writing_timelines`：时间线数据
- `writing_world_settings`：场景/世界观设置

### 散文随笔

- `prose_cards_v1`：卡片列表
- `prose_edges_v1`：卡片关系边
- `prose_outline_v1`：大纲序列/时间轴
- `prose_timeline_v1`：时间轴记录

### 诗歌工坊

- `poetry_idea_tree_v2`：灵感树
- `poetry_idea_positions_v2`：节点坐标
- `poetry_graph_edges_v1`：关系边
- `poetry_imagery_groups_v1`：意象群/场景组
- `poetry_snapshots_v1`：版本历史快照
- `poetry_image_library_v1`：生图库

### AI 生图

- `image_model_configs`：生图模型配置

---

## 开发说明

### 新增世界

1. 在 `server/data/worlds/` 新建目录
2. 放置 `world.json`，至少包含 `config.defaultLocation`

### 新增事件分类

1. 在 `server/data/events/` 新增 `*.json`
2. 每项事件保持统一字段结构

### AI 提供商配置

后端 `server/routes/chat.js` 已内置多提供商默认参数（OpenAI、Claude、OpenRouter、Ollama 等），建议通过前端设置页写入后端 secrets 再测试连接。

### CI 自动校验

- 已新增 GitHub Actions 工作流：`.github/workflows/ci.yml`
- 触发时机：`push` 与 `pull_request`
- 执行方式：
   - `deps`：先执行一次 `npm ci` 并产出 `node_modules` artifact
   - `test` / `build`：并行下载同一依赖产物后分别执行 `npm run test:run` 与 `npm run build`
- 本地仍建议先执行：`npm run verify`

### 新增页面

1. 在 `src/pages/` 创建 `.vue` 文件
2. 在 `src/router/index.js` 注册路由
3. 在 `src/App.vue` 或父组件引入

---

## 当前进度

- [x] 四种创作模式完整实现
- [x] 双模式切换（写作/编导）完整实现
- [x] AI 生成集成（聊天 + 生图）
- [x] 本地数据持久化
- [x] 版本历史系统
- [x] 导出功能（Markdown/TXT/JSON/剪映格式）
- [ ] 多设备同步（需后端持久化）
- [ ] 协作功能
- [ ] 更多导出格式

## 后续规划

### P0 — 稳住根基

优先修复现有工程问题，避免积累更多技术债：

1. **修 chat.js 的 secrets 路径和 prompt/baseUrl 逻辑**
   - 统一 API 设置读取入口（避免各页面自行解析 settings）
   - 补最基本的错误提示与日志边界

2. **统一 AI 配置读取**
   - 合并 `getApiSettings` 调用路径
   - 统一错误处理和重试逻辑

### P1 — 拆分与抽象

抽共享层、拆大页面前先做：

1. **抽两个共享 composable**
   - `useQuickNotes`：速记草稿暂存、持久化、导入导出逻辑
   - `useRichEditor`：编辑器基础能力（排版、查找替换、字体）

2. **大页面拆分示例（PoetryLab 或 ProseEssay）**
   - 容器页：路由参数解析、布局
   - 子组件：Canvas / NodeDetail / HistoryPanel / ToolPanel
   - composables：节点操作逻辑、画布交互逻辑
   - utils：树结构操作（flatten/reindex/clone）、导出格式化

3. **统一数据模型**
   - 集中定义 localStorage 键（含版本号）
   - 定义 schema（含迁移函数）
   - 避免各页面各自解析、自己写版本迁移

### P1 — 工程护栏

- 加 ESLint 基础配置
- 写基础单测（Vitest）：先覆盖纯函数（如 `flattenTree`/`reindexTree`/`cloneTree`）和 store
- 写 1~2 条关键 E2E 流程（如"写作保存后刷新不丢失"、"AI 配置连通成功可正常调用"）

### P2 — 体验增强

功能稳定后，再做体验优化：

1. **性能优化**
   - 画布节点数量超 200 时考虑虚拟列表或懒加载
   - 大文件写作时编辑器按需渲染

2. **设计系统收敛**
   - 统一 title-bar / theme / 按钮样式
   - 统一组件样式 token

3. **功能扩展**
   - 更多导出格式（PDF、EPUB）
   - 多设备同步（后端持久化）
   - 协作功能