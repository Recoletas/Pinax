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
- 主体验路由：当前仍是 `game`（`src/pages/Game.vue`）。
- 体验页分支：`src/pages/Experience.vue` 已具备部分 M1 能力，但尚未正式接线。
- Store 层：`worldStore/experienceStore` 已创建，尚未完成 M1-3 的全组件数据源统一。

---

## 下一步（按 PLAN 顺序）

1. 继续执行 M1-3：
  - `WorldMap` 与 `QuestLog` 数据源统一到 Store
  - `StatusBar` 进入第二子步（从“统一存储访问”升级到“由 Store 驱动读写”）
2. 决策路由切换策略：
   - 方案 A：先把 `Game.vue` 逐步吸收 M1 能力，保持 `game` 名称不变。
   - 方案 B：切到 `Experience.vue`，并保留 `game` 兼容别名。
3. 每完成一个子步骤即更新本日志，并附上 `verify` 结果。
