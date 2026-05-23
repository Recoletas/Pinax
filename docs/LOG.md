# 开发日志（对齐 PLAN）

> 说明：本日志以当前代码状态为准。若某项曾尝试但已回退，会显式标注“回退/暂缓”，避免记录与代码不一致。

## 2026-05-21

### M1-1 WorldStore 创建 ✅

目标：创建世界书状态管理，承载世界书、条目、角色卡、活动记录。

变更：
- 新增 `src/stores/worldStore.js`
- 在 `src/composables/useStorage.js` 新增 `STORAGE_KEYS.CHARACTERS`

结果：
- Store 可加载，世界书索引与基础 CRUD 可运行。

回退：无。

---

### M1-2 ExperienceStore 创建 ✅

目标：新增体验态 Store（事件驱动机制状态 + 活动记录 + 基础叙事流程）。

变更：
- 新增 `src/stores/experienceStore.js`

结果：
- Store 可加载，具备 `activeMechanism/mechanismState` 与活动记录相关能力。

回退：无。

---

### M1-4 主界面简化（在体验页分支实现）🟡

目标：按 PLAN 简化侧边栏，突出“角色/位置/活动”。

变更：
- 在 `src/pages/Experience.vue` 中保留 `StatusBar/WorldMap/QuestLog`
- 在 `src/pages/Experience.vue` 中移除 `ContextSelector/Inventory`
- 在 `src/pages/Experience.vue` 中新增侧边栏折叠

当前状态：
- 该简化方案已写入 `Experience.vue`，但当前主路由仍指向 `Game.vue`，尚未成为线上默认入口。

回退：无（但处于“未接线路由”的中间态）。

---

### M1-5 路由重命名方案回退/暂缓 ⏪

原尝试目标：`game -> experience` 命名与路径统一。

当前代码状态（已回退到兼容策略）：
- `src/router/index.js` 仍保留 `name: 'game'`
- 兼容重定向仍使用 `/game`
- `src/config/workbenchNav.js` 的默认入口仍是 `game`

结论：
- 为避免大范围联动风险，暂不做“强制重命名”，后续按 PLAN 再做一次完整切换窗口。

---

### M1-6 世界书选择器接入（体验页分支）🟡

目标：在体验主界面顶部切换世界书。

变更：
- 在 `src/pages/Experience.vue` 顶栏加入世界书下拉
- 接入 `worldStore.loadWorldbooksIndex()` 与 `setActiveWorldbook()`

当前状态：
- 功能在 `Experience.vue` 已可用。
- 因主路由当前仍在 `Game.vue`，该能力尚未成为默认体验链路。

回退：无。

---

## 2026-05-22

### 设置弹窗空值崩溃修复（线上故障）✅

背景：
- 在 `game` 页面点击“设置”后出现无响应，且切换页面后显示错乱。
- 控制台报错：`Cannot read properties of null (reading 'baseUrl')`。

修复动作：
- 修改 `src/composables/useApiSettings.js`
  - 新增默认配置对象 `DEFAULT_API_SETTINGS`
  - `apiSettings` 初始化改为默认对象（不再为 `null`）
  - `loadSettings()` 增加安全 merge 与异常兜底

验证：
- 浏览器复现路径回归通过：`/game` 打开设置 -> 关闭 -> 切到写作 -> 返回体验
- 不再出现 `baseUrl` 空值渲染崩溃

回退：无。

---

### M1-3（第一子步）StatusBar 持久化访问统一 ✅

目标：
- 先收敛 `StatusBar` 内部对持久化层的直接耦合，为后续完整 Store 化改造铺路。

变更：
- 修改 `src/components/StatusBar.vue`
  - 引入 `useStorage` 的 `getItem/setItem/STORAGE_KEYS`
  - 角色数据读取由 `localStorage('writing_character')` 改为 `getItem(STORAGE_KEYS.WRITING_CHARACTER)`
  - 时间数据读取由 `localStorage('writing_time')` 改为 `getItem(STORAGE_KEYS.WRITING_TIME)`
  - 保存角色/时间改为 `setItem(...)`，移除组件内硬编码 key 与 JSON 细节

结果：
- `StatusBar` 与存储层访问路径一致（统一走 `useStorage`）
- 组件内部的“直连 localStorage”耦合下降

验证：
- `npm run verify` 通过
  - `vitest`: 38/38 通过
  - `vite build`: 通过
- 浏览器冒烟通过：设置弹窗可开关，体验/写作来回切换后显示正常

回退：无。

---

### M1-3（第二子步）WorldMap 数据源统一到 Store ✅

目标：
- 将 `WorldMap` 从“组件内直连 localStorage”迁移为“Store 状态源 + Store 持久化 action”。

变更：
- 修改 `src/stores/gameStore.js`
  - 新增 `worldMapState`（`map/currentCountry/currentCity/currentScene`）
  - 新增 `loadWorldMapState()` 与 `saveWorldMapState()`
  - 在 `initGame()` 中补充世界地图状态加载
- 修改 `src/components/WorldMap.vue`
  - 接入 `useGameStore`
  - `mapData/currentCountry/currentCity/currentScene` 改为读取 Store
  - 保存动作统一走 `gameStore.saveWorldMapState(...)`
  - 新增 `syncEditingSelection()`，在数据更新后校正当前编辑项引用

结果：
- `WorldMap` 的主数据源已切换为 Store
- 组件内不再直接读写 `localStorage('writing_worldmap')`

验证：
- `npm run verify` 通过
  - `vitest`: 38/38 通过
  - `vite build`: 通过
- 浏览器冒烟通过：地图弹窗可打开/关闭，体验与写作来回切换后显示正常

回退：无。

---

### M1-3（第三子步）QuestLog 数据源统一到 Store ✅

目标：
- 将 `QuestLog` 从“组件内维护 + 直连 localStorage”迁移为“Store 状态源 + Store 持久化 action”。

变更：
- 修改 `src/stores/gameStore.js`
  - 新增 `activities` 状态
  - 新增 `loadWritingActivities()` 与 `saveWritingActivities()`
  - 在 `initGame()` 中补充活动记录加载
- 修改 `src/components/QuestLog.vue`
  - 接入 `useGameStore`
  - `activities` 改为读取 Store
  - 新增/编辑/删除活动统一走 `saveWritingActivities(...)`
  - 移除组件内 `localStorage('writing_activities')` 直连读写

结果：
- `QuestLog` 的主数据源已切换为 Store
- 侧栏三大组件中，`WorldMap` 与 `QuestLog` 已完成 Store 化数据源统一

验证：
- `npm run verify` 通过
  - `vitest`: 38/38 通过
  - `vite build`: 通过
- 浏览器冒烟通过：活动弹窗可打开/关闭，体验与写作来回切换后显示正常

回退：无。

---

### M1-3（第四子步）StatusBar Store 驱动读写 ✅

目标：
- 将 `StatusBar` 从“组件内直接读写存储”升级为“Store action 驱动读写 + 存储统一由 Store 负责”。

变更：
- 修改 `src/stores/gameStore.js`
  - 新增 `writingCharacter` 与 `writingTime` 状态
  - 新增 `loadWritingCharacter()/saveWritingCharacter()`
  - 新增 `loadWritingTime()/saveWritingTime()`
  - 在 `initGame()` 中补充角色/时间状态加载
- 修改 `src/components/StatusBar.vue`
  - 角色与时间加载改为调用 Store 的 load action
  - 保存角色与时间改为调用 Store 的 save action
  - 移除组件内对存储层的直接依赖

结果：
- `StatusBar` 的读写路径升级为 Store 驱动
- M1-3 侧栏三组件数据源统一已完成：`StatusBar`、`WorldMap`、`QuestLog`

验证：
- `npm run verify` 通过
  - `vitest`: 38/38 通过
  - `vite build`: 通过
- 浏览器冒烟通过：
  - 设置弹窗可开关
  - 时间设定弹窗可开关
  - 活动记录弹窗可开关
  - 体验与写作来回切换后显示稳定

回退：无。

---

### M1-4 主界面简化能力接入主链路 ✅

目标：
- 将已在 `Experience` 分支实现的“精简侧栏 + 世界书选择 + 可折叠侧栏”接入当前主体验入口，消除运行时双实现分叉。

变更：
- 修改 `src/pages/Game.vue`
  - 改为复用 `Experience` 页面实现（薄包装入口）
  - 保持路由名称与导航入口兼容（`/game`、`name: game` 不变）

结果：
- `/game` 已直接呈现 `Experience` 的主界面形态
- 侧栏结构与 PLAN 对齐：仅保留 `StatusBar/WorldMap/QuestLog`，支持折叠
- 顶栏已具备世界书选择入口

验证：
- `npm run verify` 通过
  - `vitest`: 38/38 通过
  - `vite build`: 通过
- 浏览器冒烟通过：
  - `/game` 显示“小说体验 + 世界书选择器”
  - 侧栏折叠/展开可用
  - 设置弹窗可开关
  - 体验与写作来回切换显示稳定

回退：无。

---

### M1-5 路由命名与入口策略收口（兼容别名）✅

目标：
- 以 `experience` 作为体验主路由命名，同时保留 `game` 的兼容入口，完成“收口不破坏历史链接”。

变更：
- 修改 `src/router/index.js`
  - 新增主路由：`path: experience`，`name: experience`
  - `game` 路由改为兼容重定向到 `experience`
  - `fit` 与顶层 `/game` 兼容入口统一重定向到 `experience`
- 修改 `src/config/workbenchNav.js`
  - `experience` 活动默认路由由 `game` 改为 `experience`
  - 侧栏入口路由由 `game` 改为 `experience`
- 修改 `src/pages/Fit.vue`
  - 进入体验跳转目标由 `/game` 改为 `/experience`

结果：
- 体验主入口命名已收敛到 `experience`
- 旧入口 `/game` 仍可访问并自动跳转，兼容历史链接

验证：
- 浏览器验证：访问 `/game` 自动落到 `/experience`
- `npm run verify` 通过（38/38 + build）

回退：无。

---

### M1-6 世界书选择器闭环与 WorldStore 修复 ✅

目标：
- 让世界书选择器在“无数据/旧数据/刷新重进”场景下都可用，形成默认可玩的闭环。

变更：
- 修改 `src/stores/worldStore.js`
  - 修复存储链路：去除双重 `JSON.parse/JSON.stringify` 引发的数据读取异常
  - 增加 `decodeStored` 兼容历史双序列化数据
  - 新增 `ACTIVE_WORLDBOOK_ID_KEY` 持久化当前活跃世界书
  - 新增 `ensureActiveWorldbook()`：无世界书时自动创建“默认世界书”并激活
  - 修复 `exportToSillyTavern()` 在非当前激活世界书下的读取逻辑
- 修改 `src/pages/Experience.vue`
  - 启动时调用 `loadWorldbooksIndex + ensureActiveWorldbook`
  - 将下拉选择与 `worldStore.activeWorldbookId` 双向同步

结果：
- 首次进入体验页即有可选且已激活的默认世界书
- 世界书选择器不再出现“有入口但空转”的断链状态

验证：
- 浏览器验证：`/experience` 顶部下拉出现并选中“默认世界书”
- `npm run verify` 通过（38/38 + build）

回退：无。

---

### M2-1 世界书编辑器页面与路由接入 ✅

目标：
- 按 PLAN 建立可访问的世界书编辑器页面（`/experience/worldbook`），打通体验主链路到编辑器的入口。

变更：
- 新增 `src/pages/WorldBookEditor.vue`
  - 编辑器页面骨架（世界书列表 + 详情编辑 + 条目编辑）
- 修改 `src/router/index.js`
  - 新增路由：`name: experience-worldbook`，`path: experience/worldbook`
- 修改 `src/config/workbenchNav.js`
  - `experience` 二级导航新增“世界书”入口
- 修改 `src/pages/Experience.vue`
  - 顶栏新增“世界书”按钮，可直达编辑器

结果：
- 体验活动下的二级导航已显示“进入体验 / 世界书”
- 支持从 `/experience` 与侧栏二级导航进入编辑器页面

验证：
- 浏览器验证：`/experience/worldbook` 可访问，界面结构正常
- `npm run verify` 通过（38/38 + build）

回退：无。

---

### M2-2 世界书与条目最小 CRUD 闭环 ✅

目标：
- 在编辑器内完成“世界书 + 条目”的最小可用增删改查能力（含搜索/筛选）。

变更：
- 修改 `src/pages/WorldBookEditor.vue`
  - 世界书：搜索、切换、新建、保存、删除
  - 条目：搜索、按类型筛选、新增、保存、删除
  - 编辑状态与当前选中项联动同步

结果：
- 编辑器已具备可独立使用的最小运营能力，不再只是展示页

验证：
- 浏览器冒烟通过：
  - 新建世界书后列表可见并自动切换
  - 新增条目并保存后，触发词与内容可回读
  - 体验页 ↔ 编辑器往返后数据保持
- `npm run verify` 通过（38/38 + build）

回退：无。

---

### M2-3 世界书编辑器交互优化（分组/批量/注入参数）✅

目标：
- 在最小 CRUD 基础上提高编辑效率，补齐高频操作能力，支持更真实的世界书维护流程。

变更：
- 修改 `src/pages/WorldBookEditor.vue`
  - 条目筛选增强：新增注入模式筛选、分组筛选（含“未分组”）
  - 条目列表增强：展示类型/注入模式/分组标签
  - 批量操作增强：支持全选筛选结果、反选、清空选择、批量改注入模式、批量改分组、批量删除
  - 条目编辑增强：新增注入参数可视化编辑（模式、概率、深度、冷却、排除递归、分组）
  - 分组体验增强：新增常用分组快捷按钮，保存条目时自动维护世界书分组列表

结果：
- 编辑器从“可用”提升到“可高效连续编辑”，可直接进行批量结构调整
- 注入参数不再依赖手工 JSON，编辑风险显著下降

验证：
- 浏览器冒烟通过：
  - 批量改分组后，条目标签与分组筛选联动生效
  - 批量改模式后，条目标签与注入模式控件同步更新
  - 批量删除后，条目计数与编辑区状态同步刷新
- `npm run verify` 通过（38/38 + build）

回退：无。

---

### M2-4 SillyTavern 导入预览与导出流程 ✅

目标：
- 在编辑器中完成“上传 JSON -> 预览 -> 确认导入”为新世界书的闭环，并补齐当前世界书导出能力。

变更：
- 修改 `src/pages/WorldBookEditor.vue`
  - 新增“导入导出”卡片
  - 新增导入预览流程：
    - 选择 JSON 文件
    - 解析并校验结构（entries/entry）
    - 展示预览摘要（世界书名、作者、条目数、分组数、类型分布、条目样本）
    - 用户确认后调用 `worldStore.importFromSillyTavern` 创建新世界书
  - 新增导出按钮：调用 `worldStore.exportToSillyTavern` 并下载为 `.json`
  - 新增导入/导出状态反馈与错误提示

结果：
- 编辑器具备 SillyTavern 的“可预览导入”与“一键导出”能力，避免盲导入风险

验证：
- 浏览器冒烟通过：
  - 样例 JSON 可成功进入预览并显示摘要与样本条目
  - 确认导入后自动创建新世界书并切换到导入结果
  - 导出按钮可触发文件下载并显示成功提示
  - 回归清理：测试导入世界书已删除，不污染本地默认数据
- `npm run verify` 通过（38/38 + build）

回退：无。

---

### M2-5 分组管理面板（创建/重命名/删除/迁移）✅

目标：
- 在编辑器中补齐“分组维度”的运营动作，支持低成本整理条目结构与分组资产。

变更：
- 修改 `src/pages/WorldBookEditor.vue`
  - 新增“分组管理”卡片
  - 新增分组创建能力（去重校验）
  - 新增分组重命名能力（同步更新该分组下条目）
  - 新增分组迁移能力（可选迁移后删除源分组）
  - 新增分组删除能力（删除时自动清空相关条目分组）
  - 新增空分组清理能力（仅清理无条目的分组）
  - 新增分组占用统计展示（每个分组条目数）

结果：
- 世界书编辑器已具备“分组全生命周期”管理能力，可直接完成常见运营整理。

验证：
- `npm run verify` 通过
  - `vitest`: 38/38 通过
  - `vite build`: 通过

回退：无。

---

### 架构守卫失败修复（回归收口）✅

背景：
- `npm run verify` 曾失败，失败原因为架构守卫检测到业务层直接调用/导入 `sendChat`。

修复动作：
- 修改 `src/composables/useAdvisor.js`
  - 移除对 `sendChat` 的直接调用
  - 改为使用 `runGenerationRetryPlan`（首轮 + 重试）
- 修改 `src/pages/PoetryLab.vue`
  - 移除 `sendChat` 直接导入
- 修改 `src/pages/ProseEssay.vue`
  - 移除 `sendChat` 直接导入
- 修改 `src/stores/experienceStore.js`
  - 移除 `sendChat` 直接导入

验证：
- `npm run verify` 通过
  - `vitest`: 38/38 通过（含 `architectureGuard`）
  - `vite build`: 通过

回退：无。

---

## 当前状态快照（用于继续按 PLAN 推进）

- 路由入口：`/` 当前走 `AppShell + WelcomeView`（`src/views/WelcomeView.vue`）。
- 主体验路由：主名为 `experience`，`game` 为兼容别名。
- 体验页分支：已成为实际运行主链路（`/experience`）。
- Store 层：`worldStore/experienceStore` 已创建；M1-3 侧栏组件数据源统一已完成，M1-6 世界书默认闭环已打通，M2 最小编辑闭环已可用。

---

## 下一步（按 PLAN 顺序）

1. 继续 M2：补齐导入冲突策略（同名世界书时的覆盖/新建/重命名选项）。
2. 细化导入预览信息（差异摘要、潜在覆盖风险提示、冲突项计数）。
3. 每完成一个子步骤即更新本日志，并附上 `verify` 结果。
