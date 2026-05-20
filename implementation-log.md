# P0 实施日志（长输入稳定性 + 统一状态提示）

## 2026-05-20 Step 0
- 动作：建立日志文件，准备按小步迭代执行 P0。
- 说明：每完成一段改动后，都会记录测试结果；若该段无法修复将回滚该段。
- 测试：未开始。
- 回滚：不需要。

## 2026-05-20 Step 1
- 动作：修改 [src/services/api.js](src/services/api.js)，sendChat 新增生成参数透传（max_tokens/temperature/response_format），并增加 ai-generation-meta 事件广播。
- 说明：兼容现有第 4 参数调用方式（Prose/Poetry 里的 generationSettings 可直接透传）。
- 测试：`npm run test:run`，结果 2/2 文件通过，29/29 用例通过。
- 回滚：不需要。

## 2026-05-20 Step 2
- 动作：修改 [server/routes/chat.js](server/routes/chat.js)，新增统一错误码返回（BAD_REQUEST_MESSAGES_REQUIRED / INVALID_BASE_URL / UPSTREAM_REQUEST_FAILED / UPSTREAM_EMPTY_CONTENT / INTERNAL_CHAT_ERROR），并加入输入预算裁剪与元信息回传（truncatedInput/retryCount/warnings/inputChars）。
- 动作：修改 [src/App.vue](src/App.vue)，增加全局浮动提示条，监听 ai-generation-meta 事件显示“已截断/重试”状态。
- 测试：
	- `npm run test:run`，结果 2/2 文件通过，29/29 用例通过。
	- `npm run build`，构建通过。
- 回滚：不需要。

## 2026-05-20 Step 3
- 动作：后端冒烟测试（临时端口 3905）验证新错误码和 meta 字段。
- 测试：
	- `POST /api/generate` 空 body -> `{"code":"BAD_REQUEST_MESSAGES_REQUIRED"}`。
	- 无效上游地址 + retryCount=2 -> `{"code":"INTERNAL_CHAT_ERROR","meta":{"retryCount":2,...}}`。
	- 超长输入 + max_input_chars=1200 -> `meta.truncatedInput=true`，并返回截断 warning。
	- `npx eslint src/App.vue src/services/api.js`：0 error，仅 no-console 警告。
	- `npm run test:run`：29/29 通过。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 4
- 动作：静态收口校验（仅针对本轮改动文件）。
- 测试：
	- `node --check server/routes/chat.js`：通过。
	- IDE 问题检查：[server/routes/chat.js](server/routes/chat.js)、[src/services/api.js](src/services/api.js)、[src/App.vue](src/App.vue) 均无错误。
- 回滚：不需要。

## 2026-05-20 Step 5
- 动作：继续优化链路观测与透传。
	- 修改 [src/services/api.js](src/services/api.js)：新增 `max_input_chars/retryCount/request_id` 透传；失败响应也会触发 ai-generation-meta 事件；错误提示附带后端 `code`。
	- 修改 [server/routes/chat.js](server/routes/chat.js)：支持 `request_id` 回传；网络型上游失败细化为 `UPSTREAM_NETWORK_ERROR`（HTTP 502）。
- 测试：
	- `npm run test:run`：29/29 通过。
	- `npm run build`：构建通过。
	- 端口 3906 冒烟：
		- 自定义 request_id 返回 `meta.requestId=manual_req_001`。
		- 无效上游地址返回 `code=UPSTREAM_NETWORK_ERROR`。
		- 超长输入场景仍返回 `truncatedInput=true`。
- 回滚：不需要。

## 2026-05-20 Step 6
- 动作：修复输入预算边界，确保注入系统提示后总输入不超过 `max_input_chars`。
	- 修改 [server/routes/chat.js](server/routes/chat.js)：当预算不足时压缩或跳过附加系统提示词。
- 测试：
	- `node --check server/routes/chat.js`：通过。
	- `npm run test:run`：29/29 通过。
	- `npm run build`：构建通过。
	- 端口 3907 长输入冒烟：`max_input_chars=1200` 时返回 `meta.inputChars=1200`（严格不超限）。
- 回滚：不需要。

## 2026-05-20 Step 7
- 动作：进入 P1 的第一步，抽取统一重试执行器并接入两条主生成链路。
	- 新增 [src/services/generationRetry.js](src/services/generationRetry.js)：统一处理多轮 sendChat、retryCount/request_id 透传、解析判定与结果回收。
	- 修改 [src/pages/ProseEssay.vue](src/pages/ProseEssay.vue)：`generateCards` 改为统一重试计划执行（首轮 + 格式修复重试）。
	- 修改 [src/pages/PoetryLab.vue](src/pages/PoetryLab.vue)：`buildTitleTreeByLines` 与 `generateDirectingTree` 改为统一重试计划执行。
- 测试：
	- IDE 问题检查：上述 3 个文件均无错误。
	- `npm run test:run`：29/29 通过。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 8
- 动作：继续收敛 Poetry 剩余手写重试路径。
	- 修改 [src/pages/PoetryLab.vue](src/pages/PoetryLab.vue)：
		- `fillExamplesForMissingTitles` 改为统一重试计划（例句首轮 + 缺失补齐重试）后再进入逐条兜底。
		- `generateContinueByLLM` 改为统一重试计划（续写首轮 + 格式重试）并保留 loose title 回退。
- 测试：
	- IDE 问题检查：`src/pages/PoetryLab.vue`、`src/services/generationRetry.js` 无错误。
	- `npm run test:run`：29/29 通过。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 9
- 动作：补齐统一重试执行器回归测试，并继续收敛 Prose 生成链路。
	- 新增 [src/__tests__/generationRetry.test.js](src/__tests__/generationRetry.test.js)：覆盖首轮成功、二轮成功、全失败、buildMessages 4 类重试行为。
	- 修改 [src/pages/ProseEssay.vue](src/pages/ProseEssay.vue)：
		- `expandFromCard` 改为统一重试计划（延伸首轮 + 格式修复重试）。
		- `expandByEmotion` 改为统一重试计划（情绪扩展首轮 + 格式修复重试）。
- 测试：
	- IDE 问题检查：`src/__tests__/generationRetry.test.js`、`src/pages/ProseEssay.vue`、`src/services/generationRetry.js` 无错误。
	- `npm run test:run`：34/34 通过。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 10
- 动作：增强统一重试执行器对请求失败的容错能力。
	- 修改 [src/services/generationRetry.js](src/services/generationRetry.js)：当某一轮 `sendChat` 请求失败时，记录 requestError 并进入下一轮；仅在最后一轮仍失败时抛错。
	- 修改 [src/__tests__/generationRetry.test.js](src/__tests__/generationRetry.test.js)：新增“首轮请求失败后次轮成功”与“全部请求失败最终抛错”两条测试。
- 测试：
	- IDE 问题检查：`src/services/generationRetry.js`、`src/__tests__/generationRetry.test.js` 无错误。
	- `npm run test:run`：36/36 通过。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 11
- 动作：将 Game 主聊天链路接入统一重试执行器。
	- 修改 [src/stores/gameStore.js](src/stores/gameStore.js)：`generateAIResponse` 改为 `runGenerationRetryPlan` 双尝试策略（同上下文重试），并在重试全部失败时抛出友好错误。
- 测试：
	- IDE 问题检查：`src/stores/gameStore.js`、`src/services/generationRetry.js` 无错误。
	- `npm run test:run`：36/36 通过。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 12
- 动作：将 Poetry 批量例句 JSON 修复链路接入统一重试执行器。
	- 修改 [src/pages/PoetryLab.vue](src/pages/PoetryLab.vue)：`repairExamplesBatchByLLM` 改为“JSON 首轮 + JSON 重试”策略，并合并多轮部分结果。
- 测试：
	- IDE 问题检查：`src/pages/PoetryLab.vue`、`src/services/generationRetry.js`、`src/__tests__/generationRetry.test.js` 无错误。
	- `npm run test:run`：36/36 通过。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 13
- 动作：收口最后一个业务层直接 `sendChat` 调用点。
	- 修改 [src/pages/PoetryLab.vue](src/pages/PoetryLab.vue)：`fillExamplesForMissingTitles` 的单标题兜底改为统一重试计划（首轮 + 重试），并保留逐行正则兜底。
	- 同步移除 `PoetryLab` 对 `sendChat` 的直接导入，业务层统一经由 [src/services/generationRetry.js](src/services/generationRetry.js) 调用。
- 测试：
	- 全仓检索 `sendChat(`：仅剩 [src/services/generationRetry.js](src/services/generationRetry.js) 与 [src/services/api.js](src/services/api.js) 两处。
	- IDE 问题检查：`src/pages/PoetryLab.vue`、`src/services/generationRetry.js` 无错误。
	- `npm run test:run`：36/36 通过。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 14
- 动作：新增“架构守卫测试”，防止业务层回归到直接调用 `sendChat`。
	- 新增 [src/__tests__/architectureGuard.test.js](src/__tests__/architectureGuard.test.js)：
		- 仅允许 [src/services/api.js](src/services/api.js) 与 [src/services/generationRetry.js](src/services/generationRetry.js) 出现 `sendChat(` 调用。
		- 限制 `pages` / `stores` 目录不得直接 import `sendChat`。
	- 修复：守卫测试首轮发现 [src/pages/ProseEssay.vue](src/pages/ProseEssay.vue) 仍有 `sendChat` 导入，已移除并复测通过。
- 测试：
	- `npm run test:run`：38/38 通过（含 architecture guard）。
	- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 15
- 动作：将架构守卫纳入本地与 CI 自动化门禁。
	- 修改 [package.json](package.json)：新增 `test:arch` 与 `verify` 脚本（`verify = test:run + build`）。
	- 新增 [/.github/workflows/ci.yml](.github/workflows/ci.yml)：在 `push` / `pull_request` 自动执行 `npm run verify`。
	- 修改 [README.md](README.md)：补充“提交前质量门禁”与 CI 自动校验说明。
- 测试：
	- 执行 `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 16
- 动作：继续强化门禁可读性与 CI 执行效率。
	- 修改 [/.github/workflows/ci.yml](.github/workflows/ci.yml)：将单一 `verify` job 拆分为并行 `test` / `build` 两个 job。
	- 修改 [src/__tests__/architectureGuard.test.js](src/__tests__/architectureGuard.test.js)：
		- 守卫失败时输出违规文件、行号、修复建议。
		- 区分两类违规（未授权 `sendChat()` 调用 / pages|stores 直接 import）。
	- 修改 [README.md](README.md)：CI 章节更新为并行 job 说明，并保留本地 `npm run verify` 建议。
- 测试：
	- `npm run test:arch`：2/2 通过。
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 17
- 动作：继续优化 CI 执行路径，减少重复安装依赖。
	- 修改 [/.github/workflows/ci.yml](.github/workflows/ci.yml)：
		- 新增 `deps` job：统一执行一次 `npm ci`，并上传 `node_modules` artifact。
		- `test` 与 `build` job 改为 `needs: deps`，并分别下载依赖产物后执行。
		- 新增 `concurrency`：同分支重复触发时取消旧运行，减少资源浪费。
	- 修改 [README.md](README.md)：同步 CI 章节为 `deps -> test/build(并行)` 的执行模型说明。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 18
- 动作：按“稳步迁移”原则落地路由重构第一阶段（工作台壳承载旧页面）。
	- 新增 [src/layouts/AppShell.vue](src/layouts/AppShell.vue)：引入 ActivityBar + SidePanel + 内容区三段结构。
	- 新增 [src/config/workbenchNav.js](src/config/workbenchNav.js)：集中管理一级活动导航和二级侧栏配置。
	- 新增 [src/components/workbench/ActivityBar.vue](src/components/workbench/ActivityBar.vue) 与 [src/components/workbench/SidePanel.vue](src/components/workbench/SidePanel.vue)。
	- 修改 [src/router/index.js](src/router/index.js)：
		- 新增 `/work` 父路由，并将 `fit/game/writing/notes/poetry-lab/prose-essay` 收为子路由。
		- 旧路径 `/fit`、`/game`、`/writing`、`/notes`、`/poetry-lab`、`/prose-essay` 统一重定向到新工作台路由。
	- 修改 [README.md](README.md)：补充“路由重构阶段一（工作台壳）”说明。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 19
- 动作：修复“诗歌页/散文页显示异常”（工作台移动断点布局错误）。
	- 根因：`AppShell` 在 `max-width: 900px` 下只定义了两行网格，但元素未显式指定行位；`shell-activity` 先占据第一行大区域，`shell-content` 被挤到下方，导致页面显示错位。
	- 修改 [src/layouts/AppShell.vue](src/layouts/AppShell.vue)：
		- 移动断点下显式指定 `shell-content` 位于第 1 行，`shell-activity` 位于第 2 行（底栏）。
		- 移除 `shell-content` 的错误 `min-height: calc(100vh - 56px)`，改为网格内自适应高度。
		- 补充 `app-shell` 的 `height: 100vh`，稳定工作台高度。
	- 冒烟验证：在 `/work/poetry-lab` 与 `/work/prose-essay` 下确认内容区恢复在上方、活动栏固定底部。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 20
- 动作：继续修复诗歌/散文在工作台中的显示异常（覆盖“活动栏在左”场景）。
	- 修改 [src/pages/PoetryLab.vue](src/pages/PoetryLab.vue)：
		- 页面根容器从 `height: 100vh` 调整为 `height: 100%; min-height: 100%;`，避免嵌入 `shell-content` 时高度越界。
		- 将内部响应断点从 `max-width: 980px` 调整为 `max-width: 900px`，与 `AppShell` 断点对齐，避免 901~980 区间出现“左侧活动栏 + 移动布局”错配。
	- 修改 [src/pages/ProseEssay.vue](src/pages/ProseEssay.vue)：
		- 页面根容器从 `height: 100vh` 调整为 `height: 100%; min-height: 100%;`，消除内容区嵌套高度不一致。
	- 冒烟验证：在 `/work/poetry-lab` 与 `/work/prose-essay` 检查根容器高度与 `shell-content` 对齐。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 21
- 动作：修复“活动栏在左时诗歌/散文内容区偶发空白”的根因（无侧栏场景列分配错误）。
	- 根因：`AppShell` 使用三列网格（活动栏 / 侧栏 / 内容），当侧栏隐藏时，`shell-content` 仍按自动流落入第 2 列；而第 2 列在无侧栏时宽度为 0，导致内容区看起来“整页空白”。
	- 修改 [src/layouts/AppShell.vue](src/layouts/AppShell.vue)：
		- `without-panel` 状态改为两列网格：`activity + content`。
		- 显式指定列归属：`shell-activity` 固定列 1，`shell-panel` 固定列 2，`shell-content` 默认列 3。
		- `without-panel` 下将 `shell-content` 显式切换到列 2，避免 0 宽。
	- 配套断点统一：
		- [src/components/workbench/ActivityBar.vue](src/components/workbench/ActivityBar.vue) 断点调整为 `760px`。
		- [src/pages/PoetryLab.vue](src/pages/PoetryLab.vue) 断点调整为 `760px`，与壳层一致。
	- 冒烟验证：
		- `/work/poetry-lab`：`shell-content` 宽度恢复（约 929px），页面正常显示。
		- `/work/prose-essay`：`shell-content` 宽度恢复（约 929px），页面正常显示。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 22
- 动作：按需求将活动栏字母标识替换为简易图标。
	- 修改 [src/config/workbenchNav.js](src/config/workbenchNav.js)：将 `glyph` 配置改为 `icon`（`compass` / `book` / `music` / `document`）。
	- 修改 [src/components/workbench/ActivityBar.vue](src/components/workbench/ActivityBar.vue)：
		- 移除 `EX/WR/PY/PS` 文本渲染。
		- 增加内联 SVG 简易图标渲染逻辑。
		- 调整活动栏图标样式为统一尺寸的 `activity-icon`。
	- 冒烟验证：活动栏显示为图标 + 中文标签，不再出现英文缩写字母。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 23
- 动作：继续优化活动栏图标可读性（更清晰、更高对比）。
	- 修改 [src/components/workbench/ActivityBar.vue](src/components/workbench/ActivityBar.vue)：
		- 图标线宽从 `1.3` 提升到 `1.45`，增强小尺寸下的识别度。
		- 图标容器由 `14x14` 调整为 `16x16`，提升可视清晰度。
		- 新增 `:focus-visible` 样式，增强键盘导航可用性。
		- 暗色模式下活动栏按钮的默认/hover/active 颜色对比增强。
	- 冒烟验证：活动栏仍显示“图标 + 中文标签”，不出现字母缩写。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 24
- 动作：推进路由重构第二阶段（Writing/Notes 导航职责收敛到壳层）。
	- 修改 [src/pages/Writing.vue](src/pages/Writing.vue)：
		- 移除顶部标题栏中的“小说/笔记”切换组件（`workspace-switch`）。
		- 移除对应 `switch-btn` 样式，减少重复导航入口。
	- 修改 [src/pages/Notes.vue](src/pages/Notes.vue)：
		- 移除顶部标题栏中的“小说/笔记”切换组件（`workspace-switch`）。
		- 移除对应 `switch-btn` 样式，统一由工作台侧栏切换。
	- 校验：`Writing.vue` 与 `Notes.vue` 中已无 `workspace-switch` / `switch-btn` 相关代码。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 25
- 动作：继续收敛 Fit/Game 页的重复全局导航控件（最小改动）。
	- 修改 [src/pages/Fit.vue](src/pages/Fit.vue)：
		- 移除标题栏“返回”按钮与 `goBack()`。
		- 移除仅用于返回按钮的 `.icon-btn` 样式。
	- 修改 [src/pages/Game.vue](src/pages/Game.vue)：
		- 移除标题栏“返回”按钮与 `goBack()`。
		- 移除仅用于返回按钮的 `.icon-btn` 样式。
	- 保留业务操作按钮（如 `AI ON/OFF`、角色、设置）不变，避免影响体验流。
	- 校验：`Fit.vue` / `Game.vue` 中已无 `goBack`、`@click="goBack"`、`.icon-btn` 残留。
- 测试：
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
- 回滚：不需要。

## 2026-05-20 Step 26
- 动作：按最新产品方向完成“欢迎首页 + 体验直入”，并移除体验选择页在主流程中的职责。
	- 修改 [src/config/workbenchNav.js](src/config/workbenchNav.js)：`experience` 默认路由改为 `game`，侧栏移除 `fit` 入口。
	- 修改 [src/router/index.js](src/router/index.js)：
		- `/work` 默认重定向到 `game`。
		- `fit` 子路由改为重定向 `game`。
		- 兼容旧入口 `/fit`，统一重定向到 `game`。
	- 修改 [src/pages/Game.vue](src/pages/Game.vue)：新增 `onMounted` 兜底初始化，若未在进行中且消息为空则自动执行 `initGame()`，保障直入可用。
	- 修改 [src/pages/PoetryLab.vue](src/pages/PoetryLab.vue)：`goBack()` 返回首页 `/`。
	- 重建 [src/pages/Home.vue](src/pages/Home.vue)：实现欢迎页与多入口分发（`/game`、`/writing`、`/notes`、`/poetry-lab`、`/prose-essay`）。
	- 修复中途异常：`Home.vue` 曾因重复写入导致双 `<template>`，已删除并重建为单一 SFC 结构。
- 测试：
	- IDE 问题检查：`Home.vue`、`workbenchNav.js`、`router/index.js`、`PoetryLab.vue`、`Game.vue` 均无错误。
	- `npm run verify`：
		- `npm run test:run`：38/38 通过。
		- `npm run build`：构建通过。
	- 浏览器冒烟：
		- `/` 显示欢迎首页与五个入口。
		- `/work` 自动落到 `/work/game`。
		- `/fit` 自动重定向到 `/work/game`。
		- `/game` 直入到 `/work/game` 且存在首条系统消息“游戏开始！...”。
- 回滚：不需要。
