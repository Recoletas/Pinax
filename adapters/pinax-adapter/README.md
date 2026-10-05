# pinax-adapter

Pinax 的可选 Node 工具运行时，使用 pi-agent 管理模型回合、工具、任务记录、取消和续接。世界书、正文和作者确认仍由 Pinax 管理。

## 已接入的入口

- 现有写作助手的 **写作与修改**：可选正文/设定参考和写作技法；支持 `@` 补全。后续消息续接当前任务，**重新开始任务**保留对话但建立新任务。
- 全屏与侧栏共用 `useAuthoringKnowledgeAssistant`。对话、命名会话、任务 ID 和草稿按作品保存到既有 conversation store，没有另一份 Agent 对话真源。
- 完整输出先留在助手，**加入生成时的章节**由 Authoring 保存。切到另一章不能采纳；保存失败不标记成功；采纳前保存保护版本，成功后通知既有现场/记忆观察流程。
- **参考与技法**中的体验开关默认关闭。开启后普通体验回合可走适配器；适配器不可达时保留原生入口。带严格任务合同的推演始终由原生发布前检查/修订流程处理。
- **讨论故事**、带出处的**查阅资料**、审稿和正文轻量推演保留各自的既有约束。不会因关键词命中就把一次资料查询改成写作任务。

```text
现有助手 → Authoring engine → /api/storyagent → loopback adapter → pi-agent
普通体验（可选） → 同一 bridge
严格任务 → 原生 narrative loop → 发布前验收
正文采纳 → Pinax 保护版本 / durable save / 现场观察
```

原来的独立 beta 面板和全局 Dock 已撤下，不需要 beta URL 开关。

## 运行

使用仓库约定的 Node 22：

```bash
npm ci --prefix adapters/pinax-adapter
npm run server
```

主服务载入 `server/.env`。配置了服务器文本凭据后，会在 loopback 启动运行时；`PINAX_STORYAGENT_ENABLED=0` 可关闭。内置 MiniMax 沿用 `MiniMax-Text-01`，密钥只在服务器。独立运行可用包内忽略的 `.external/pinax-adapter.json` 或 `PINAX_ADAPTER_*` 环境变量配置 provider/model/baseUrl。

浏览器使用同站 `/api/storyagent`，不连接访客自己的 `127.0.0.1`。代理受既有公网入口校验约束，只转发服务器配置的 loopback；浏览器随机 capability 的哈希限定任务命名空间，不公开跨访客任务列表。部署须同步安装适配器依赖；只更新前端产物不会启动它。

## 工具与预算

- 五个原有 lookup；另有 `manuscript_search/get`、`notes_search`、`outline_lookup`、`calc_evaluate` 和节拍计划。
- 资料是本轮快照，不是外部 RAG，也不是全文导入系统。新增三域最多各 60 项；正文每项最多前 8,000 字符，其他文本有界。coverage 随请求说明范围；不能据此声称读完全部章节。
- 规划调用计入模型步数，并随主任务一起取消。有效计划不再要求重复提交；作者要求优先于计划。
- 请求只能收紧服务器预算；`maxTokens` 为每次正文/工具模型调用的输出上限，200–8,000，规划为 900。工具总调用和任务时限另受限制；最多 4 个任务同时执行。
- 续接 transcript 按完整 user 回合裁剪，不拆开 tool call/result 配对。任务记录保留在服务器，浏览器对话是作者可见真源。
- 终态携带最终正文，避免拼入工具调用前言。只打印调用代码时最多修正一次，仍无法执行则失败。

## 检查

```bash
npm run typecheck --prefix adapters/pinax-adapter
npm test --prefix adapters/pinax-adapter
node scripts/storyagent-beta-smoke.mjs
node scripts/storyagent-integration-smoke.mjs
BASE=http://127.0.0.1:5174 node scripts/storyagent-ui-smoke.mjs
```

CI 覆盖适配器类型/生命周期测试和两项接入脚本。浏览器脚本使用合成响应，不评价模型质量；截图默认随结束删除。真实 MiniMax 首次调用与续接样本、实际合并检查见 [PR #5 接入记录](../../docs/agent-runs/pr5-integration-20261005.md)。

StoryFlow 只读来源快照见 [VENDOR.md](./vendor/storyflow-kit/VENDOR.md)，运行时依赖 npm 包。长篇导入、外部检索和自动替换正文/设定未在本 PR 完成。
