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
