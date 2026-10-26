# 《大梦》真稿 MCP 填充、Agent 读写与协议合规测试（2026-10-26）

## 结论

- 真实稿路径跑通：6 份约束、13 条世界书、3 章正文经 MCP 写入隔离项目，读回内容哈希与源稿一致，**54/54 项通过**。
- 协议与工具格式检查 **39/39 项通过**（官方 SDK Client + 原始 HTTP 探针），`smoke:mcp` 109 项通过，eslint 0 错误。
- 测试中发现 7 个问题，均已修复；其中 3 个会直接影响真实使用：长世界书条目名无法被短提问命中、`secret` 类型被 schema 拒绝、未知工具/非法入参未按 JSON-RPC `-32602` 返回。
- 仍有 3 个待裁定项，均不属于 MCP 协议违规：无模型时 advisor 的错误码映射、大纲 warning 的返回位置、未声明 `outputSchema`。
- 未做真实模型回答质量测试：本机 pi-agent 任务面未启动、未选择模型，只验证到既有的"无模型"错误链路。
- 作者原稿未被改动：导入前后三章 sha256 一致；所有写入都落在 `D:\Pinax-e2e\run-*` 隔离目录与临时应用数据中。

## 测试方式

| 项 | 内容 |
| --- | --- |
| 源目录（只读） | `C:\Users\Administrator\D盘归档\写作\写作\Kit Project\大梦` |
| 测试项目 | `D:\Pinax-e2e\run-1792997124930\大梦-mcp`（每次运行新建时间戳目录） |
| 真稿端到端 | `node scripts/dameng-mcp-e2e.mjs`；官方 SDK Client 走 stdio，stub advisor 检查信封，再起真实 `server/index.js` 验模型边界 |
| 协议合规 | `node scripts/mcp-conformance.mjs`；官方 `ToolSchema`、stdio Client、`StreamableHTTPClientTransport` 与原始 HTTP 探针 |
| 回归 | `npm run smoke:mcp`、eslint（`server/mcp`、三个测试脚本） |

## 真稿填充结果

- 约束 6 份：`00-规则索引`、`禁用词与禁用句式`、`可用skill清单`、`润笔交付标准`、`三件套工作流`、`文风-大梦`，读回 6 个且字数一致。
- 世界书 13 条：`character` 1、`event` 1、`general` 6、`secret` 5；`pinax_worldbook_list` 按 `type=secret` 过滤得到 5 条，柯秒条目读回正文哈希一致。
- 正文 3 章：`001-第一章 “.md`、`002-第二章 延迟.md`、`003-第三章 倒带.md`；`readChapter` 三章内容哈希与源稿一致。
- 项目统计：`chapters=3`、`outlineNodes=0`、`worldbookEntries=13`。
- 正文写入走 `pinax_chapter_import`，直接落 `正文/`；Agent 改写仍只落 `.pinax/proposals/`，原稿不动。

## Agent 读写结果

- `pinax_project_context`：返回 3 章、6 份约束、13 条世界书；项目无 `大纲/outline.json` 的提示在 `outline.warnings` 中。
- `pinax_agent_ask`：信封含 6 个 `rules` 块与世界书块，问题里的"柯秒"命中 `人物·柯秒（冷穿越剧版）`；预算 `usedChars=19185 / maxChars=28000`，未截断。
- `pinax_expert_list`：3 位内置专家；`pinax_expert_invoke` 的 `senior-reader` 模板正确进入问题并附带真实上下文。
- `authoring.review.chapter`：未指定章节时默认最后一章（第三章），并在警告里说明。
- `pinax_chapter_write`：生成 `pinax-proposal@1` 提案，`origin=mcp`、`status=proposed`、`manuscriptUntouched=true`；写入后三章正文哈希不变。
- 真实 advisor 路由可达，返回 `ERR_ADVISOR_FAILED`（"未检测到可用模型"），说明错误链路通、但尚无模型产出可供评估。

## 协议与格式检查

通过的检查项包括：

- `serverInfo` 为 `pinax-local`，只声明 `tools` 能力，`instructions` 非空。
- 16 个工具名唯一且符合 `^[a-zA-Z0-9_-]{1,64}$`；全部通过官方 `ToolSchema`。
- 全部 `inputSchema` 为 object，且 `additionalProperties:false`；`annotations` 均为布尔；写类工具 `readOnlyHint:false`，只读工具 `readOnlyHint:true`。
- 成功结果同时返回 `content` 文本与 `structuredContent` 对象；业务错误 `isError:true` 且带 `code`。
- 未知工具、参数类型错误、参数越界、多余参数均返回 JSON-RPC `-32602`。
- HTTP：initialize 200 JSON、无 `mcp-session-id`、无 CORS 头；协议版本协商正确；`GET`/`DELETE` 405；浏览器 `Origin` 403；非本机 `Host` 403；非法 `MCP-Protocol-Version` 400；`notifications/initialized` 202；未声明能力的方法 `-32601`；仅 `Accept: application/json` 返回 406 而非 5xx。
- 未声明 `resources`/`prompts` 能力，相关方法按 `-32601` 拒绝，符合预期。

## 问题清单

### 已修复（7）

| # | 问题 | 影响 | 修复位置 |
| --- | --- | --- | --- |
| 1 | 世界书长名称（如 `人物·柯秒（冷穿越剧版）`）无法被问题里的短词"柯秒"命中，只有写全名才会进入信封 | 真实提问几乎永远带不上对应设定 | `server/mcp/agentAsk.js:156` 起：按分隔符与别名切词命中 |
| 2 | `pinax_worldbook_write` 的 `type` 原为固定枚举，真实稿的 `secret` 被拒 | 真相层条目无法导入 | `server/mcp/tools/importTools.js:87` 改为字符串 + `^[a-z][a-z0-9_-]{0,31}$` 校验，未知类型落 `设定/` |
| 3 | 未知工具与非法入参返回业务 JSON，而不是 JSON-RPC 错误 | 客户端按协议处理时会误判为成功 | `server/mcp/createMcpServer.js:130` 未知工具 `-32602`；`:55` 起做入参类型/范围/额外字段校验 |
| 4 | 成功结果只有 `content`，没有 `structuredContent` | 结构化客户端拿不到可编程字段 | `server/mcp/createMcpServer.js:114` |
| 5 | 无状态 HTTP 入口对 `GET`/`DELETE` 返回 200；非法 `MCP-Protocol-Version` 也返回 200 | 不符合无状态 Streamable HTTP 语义，问题被静默吞掉 | `server/mcp/http.js:43` 起：`405 + Allow: POST`、`400` |
| 6 | `/mcp` 继承了全局 `cors()`，响应带 `Access-Control-Allow-Origin: *` | 与"拒绝浏览器来源"的定位矛盾，给页面跨源探活放行信号 | `server/index.js:61`：`/mcp` 跳过全局 CORS；Origin 请求仍 403 |
| 7 | ESLint 报 `agentAsk.js` 正则多余转义 | 门禁失败 | `server/mcp/agentAsk.js:156` |

另新增 4 个填充工具（`pinax_project_init`、`pinax_rule_write`、`pinax_worldbook_write`、`pinax_chapter_import`），逻辑在 `server/mcp/imports.js`，只写 `正文/`、`约束/`、`世界书/`、`.pinax/project.json`，默认不覆盖，公网与非项目目录拒绝。

### 待裁定（3，均非协议违规）

1. **advisor 无模型时返回 5xx**：MCP 侧已映射为 `ERR_ADVISOR_FAILED` 的 typed error，但源头是 5xx，不是"模型未配置"的 4xx。改动会触及既有 `/api/advisor` 路由与前端错误处理，因此未动。
2. **大纲 warning 位置不统一**：`pinax_project_context` 的约束读取警告在顶层 `warnings`，大纲缺失警告在 `outline.warnings`。不影响功能，但客户端要读两处。
3. **未声明 `outputSchema`**：已提供 `structuredContent`，但没有为工具声明输出 schema。协议允许，属于可选的增强项；若希望客户端强校验，需要为 16 个工具补 schema。

### 源稿侧问题（只记录，未修改）

- 第一章标题含一个孤立的 `“`：最终文件名为 `001-第一章 “.md`，与源稿保持一致。
- 世界书 id 使用 `pj/worldbook-wangman/...` 前缀，`keys` 基本为空；导入按名称与 id 保留，但短词命中依赖名称切分补足。
- 源目录没有 `大纲/outline.json`，只有 `001-004.md`，因此项目大纲节点为 0。
- 归档中平铺世界书文件与 `世界书/设定/` 副本并存；本次按结构化目录读取，未产生重复条目。

## 产物

- 真稿端到端报告：`D:\Pinax-e2e\run-1792997124930\report.json`（54 项，0 失败）
- 协议合规日志：`D:\Pinax-e2e\conformance2.log`（39 项，0 失败）
- 测试项目：`D:\Pinax-e2e\run-1792997124930\大梦-mcp`
- 可重复执行：`DAMENG_SOURCE=/原稿/大梦 npm run mcp:dameng`（源目录必填，缺省即 exit 2；批次9 起不再在脚本里写作者机器路径）、`npm run mcp:conformance`、`npm run smoke:mcp`
