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
