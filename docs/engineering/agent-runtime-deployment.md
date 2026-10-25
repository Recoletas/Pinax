# 构建、部署与更新运行包

文本生成需要前端、Express 和 Storyflow 运行包配套。仅上传 `dist/` 只能更新页面，不能更新助手工具。公网 2026-10-15 已按本文的产物发布方式更新，具体提交和回滚位置见[发布回执](../agent-runs/release-20261015.md)。

## 1. 准备环境

使用仓库要求的 Node.js `>=22.13.0 <23`。在开发机安装依赖并构建；2 GB 生产服务器只接收产物，不在服务器跑 Vite、TypeScript 或 `npm ci`。

```sh
nvm use
npm ci
PINAX_RUNTIME_OUTPUT=.runtime/storyagent-next npm run build:agent-runtime
npm run build
```

构建会拉取 `shared/storyagentRuntimeSource.json` 固定的上游提交，再编译 Pinax 适配。默认输出 `.runtime/storyagent`；上例使用独立候选 `.runtime/storyagent-next`，避免覆盖运行中的包。`runtime-source.json` 记录上游版本、锁文件和适配指纹；源清单的 `protocolVersion` 与运行包的 `assistantProtocolVersion` 不是同一个字段。

按任务切换模型需要运行包 `/healthz` 声明 `requestModels: true`，以及配套的 Express `requestModelContext`。前端配置列表不再通过 POST /model 热改全局模型；自定义文本配置随单次请求进入内核，生成时只使用该任务的配置副本。旧包不支持时明确要求更新，不静默使用服务器默认模型。公网继续拒绝自定义文本模型请求。

结构化作者提问需要运行包声明 `assistantUserInput: true`。`request_user_input` 保存 `needs_input` 交付与问题后结束本次生成连接，任务传输状态仍为 completed，业务状态为等待作者。网页展示问题，回答后通过原 taskId 的 resume 续接，不依赖长期存活的工具 Promise。问题/回答保存在既有会话存储，运行日志保留成对的工具调用与结果；不会自动超时选择，也不通过回答扩大权限。旧运行包仍只显示普通澄清文字，需要更新运行包才能产生问题选项。

运行中补充需要 `assistantSteering: true` 运行包及配套 Express `/tasks/:id/steer` 转发。正文消息队列由原会话所有者保存；steer 则使用 Pi 原生会话的 lane.steer，在工具/模型步骤之间接收。HTTP 接收不等于模型已读：`author_input` 工具结果帧确认实际消费后，前端才将待发送项转为对话中的作者消息。补充不重启请求、不更换模型、不扩大授权；提交候选后仍可补充，队列等待下一个可消费边界。已停止或正在等待作者回答的任务不接收运行中补充，由前端保留消息。接口只接受消息 ID、文字和 bookId，沿用浏览器任务前缀隔离。运行器按消息ID去重，中途补充不按固定8条或剩余模型回合数拒收；中断后未确认消费的项保留在暂停队列中。

不要把已有 `tasks` 目录当构建输出清空；脚本会拒绝覆盖含旧日志的目录。升级时使用新目录，并保留任务和配置。

批量建议与 M3 兼容修复需要更新运行包：取消每批8处、总计32处的硬上限，前端与运行器配套支持合并提议。原生会话候选中，提交提议是普通工具结果，助手可继续查阅和说明；final 字段仅兼容旧请求，不强制结束。运行包 `requestModelTransport` 负责特定 MiniMax-M3/Anthropic 请求的 adaptive thinking，以及续跑历史中的中断工具帧清理；不修改服务器默认模型或密钥。仅更新网页不能使这些运行器改动生效。

## 2. 发布需要哪些文件

| 内容 | 发布要求 |
| --- | --- |
| `dist/` | 本机构建的静态页面与资源 |
| `server/`、`shared/`、包清单 | 与前端来自同一套发布提交 |
| 后端生产 `node_modules` | 在兼容目标系统的平台准备；原生依赖需匹配架构、Node ABI 和 glibc |
| `.runtime/storyagent-next/` 或指定目录 | 完整编译包及其生产依赖，不只是入口 JS |
| 服务器配置 | 保留原 `.env` 和模型配置，不用本地文件覆盖 |
| `.runtime/data/` | 任务日志、派生数据等；独立保存，不作为可删除构建目录 |

不要直接把 Windows 或不同 Node 版本的 `node_modules` 传到 Linux。SQLite 等原生模块必须在隔离候选目录确认能加载，再切换正式服务。`deploy/setup.sh` 是旧环境脚本，不代替本轮 Node 22 和运行包发布流程。

仓库使用 `main` 做开发集成，`server-version` 承接生产适配。先完成 main，再合并到生产分支构建；不要在生产分支继续开发功能。

## 3. 启动与配置

Express 的 `startStoryAgentRuntime` 先探测 loopback 任务面，健康时复用；否则在配置和产物齐备时启动运行器。

| 配置 | 用途 |
| --- | --- |
| `PINAX_RUNTIME_DIR` | 显式指定运行包；未指定时优先使用协议 2 的 storyagent-next，否则 storyagent |
| `PINAX_ADAPTER_ENDPOINT` | 任务面地址，默认 loopback 8451；拒绝公网主机 |
| `PINAX_ADAPTER_CONFIG` | 显式模型配置文件路径 |
| `PINAX_ADAPTER_TASKS_DIR` | 任务日志位置，默认 `.runtime/data/storyagent-tasks` |
| `PINAX_STORYAGENT_ENABLED=0` | 禁止由 Express 自动拉起运行器 |
| `PINAX_PUBLIC_ORIGINS` | 公网来源配置；同时收紧模型配置和本机能力 |

模型配置示例见 [server/.env.example](../../server/.env.example)。只有 `MINIMAX_API_KEY`、没有其他显式模型密钥/配置时，启动器采用代码中的 MiniMax 默认配置；已有显式配置优先。密钥不写入前端构建变量、发布日志或提交。

本地开发维护按 [AGENTS.md](../../AGENTS.md) 的持续授权执行：需要启用修复时直接更新受影响服务，保留原配置与任务记录；已验证产物只做必要启用核对，不逐次要求作者确认或重复全套测试。公网发布仍按明确发布指令执行。

运行器不监听公网。浏览器经 `/api/storyagent` 使用能力令牌访问任务。前端刷新不会重载旧 Express 模块；更新后端或运行器需要对应进程重新加载，且应先处理在途任务。

## 4. 切换与回滚

1. 记录旧提交、静态目录指向、运行包、生产依赖和进程配置。备份配置与日志，但不输出密钥。
2. 上传到独立候选目录，核对文件哈希和运行包清单，检查目标机原生依赖能否加载。
3. 在维护窗口停止需要替换的旧进程。现存 8451 会被复用，不能只重启 Express 就假定运行器已更新。
4. 成套切换后端、运行包和静态资源，再由原进程管理器启动服务。已有打开页面可能还请求旧哈希资源，可短期保留上一版 assets。
5. 检查首页和资源、模型状态、`/api/storyagent/healthz`、公网能力限制，以及本次实际承诺的用户流程。

协议 2 发布需核对 `assistantProtocolVersion: 2`。`assistantWorkspace`、`assistantNarrative`、`assistantSampling`、`assistantObservability`、`assistantKnowledge` 标志只证明对应适配已装入；健康响应不能证明真实生成、采用或知识检索成功。

失败时切回上一套前端、后端、依赖和运行包。保留原环境和任务目录；回滚代码不应还原旧日志覆盖新记录。旧任务日志迁移由 `storyAgentJournals` 非破坏性复制并检查分歧。

## 5. 本机知识运行包（可选）

只为本机项目知识检索安装，公网部署不需要借此开放服务器文件。

```sh
npm run build:knowledge-runtime
```

构建需 Node 22 和 Python 3；源版本由 `shared/knowledgeRuntimeSource.json` 固定，默认输出 `.runtime/knowledge`。已有目录不会被覆盖；升级使用新的 `PINAX_KNOWLEDGE_RUNTIME` 路径，运行 Express 时也要指向该路径。

Express 在按需工作线程中调用真实知识内核，不再要求另启 8421/8431 两个常驻服务。项目范围从已绑定注册表取得；派生索引存到 `.runtime/data/knowledge`，不会替代正式来源。来源变化会重建/拒绝过期结果，缺少原文时明确报错。

工具标志为 true 而查询失败时，继续检查运行包、项目绑定、索引和原文。不要用旧 kit-guard 的 Windows 计划任务成功码来判断当前 Pinax 知识链就绪。

## 6. HTTPS 与用户数据迁移

截至 2026-10-15，公网 HTTP 可用，HTTPS 握手失败；现有 Nginx 仅提供 80 端口。证书、自动续期和 HTTPS 跳转仍待配置。

HTTP 与 HTTPS 的 localStorage/IndexedDB 隔离。启用强制跳转前应提供旧地址导出备份的窗口和新地址恢复说明，保留回退入口；不要因新地址书库为空就初始化覆盖或清理旧数据。迁移后再核对 `PINAX_PUBLIC_ORIGINS`、证书链和混合内容请求。


## 持续执行与源码依据（2026-10-22）

本轮对照了 OpenAI 官方[agent loop 说明](https://openai.com/index/unrolling-the-codex-agent-loop/)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)，以及 Codex `342ed69a174c206c1de52a59491b131e0753cfa5` 的 [session/turn.rs](https://github.com/openai/codex/blob/342ed69a174c206c1de52a59491b131e0753cfa5/codex-rs/core/src/session/turn.rs) 和 compact.rs；pi 以实际安装的 `@earendil-works/pi-agent-core@0.87.1` 为准，另核对了[官方 agent-loop.ts](https://github.com/earendil-works/pi/blob/main/packages/agent/src/agent-loop.ts)。

- Codex 读取模型的 needs_follow_up 及待处理输入决定是否继续；上下文接近容量时进入压缩。其流空闲超时、单个MCP工具超时和任务总时长不是同一个配置。
- pi 的循环持续处理工具与 steering/follow-up，finishTurn 可明确结束本轮；内核不要求 Pinax 固定6次调用、8个模型回合或任务倒计时。
- Pinax 原来在 engine、Express、运行器与委托正文生成链重复设置限制，触发工具拒绝、提前收工具和整轮中断。本地代码已移除这些助手任务限制。后续原生会话候选复用 AgentHarness；finishTurn 只整理交付信息，提交候选不结束循环，旧完成工具只作兼容确认。
- 完整启用涉及前端、3001 Express 和8451运行包。本轮获得作者明确授权后已更新3001/8451，5173保持PID476118。75份日志和模型配置哈希保持；回执`.runtime/service-native-20261022.json`，没有推送或公网部署。
- 后续候选已接入实装 Pi 0.87.1 的 AgentHarness、JsonlSessionRepo、原生队列及自动/手动压缩。运行器 `assistantNativeSession` 表示安装该适配；手动压缩还需3001转发 `/tasks/:id/compact`。作者随后明确授权更新3001/8451，本机已启用原生会话；79份任务日志与模型配置哈希保持，5173未动。激活回执为 `.runtime/service-native-session-20261022.json`，公网尚未更新。
- 备份任务目录时必须连同 `pi-sessions` 一起保存，不能只取顶层任务JSON。旧日志首次续聊时导入；原生会话按作品及taskId隔离。压缩不清空原始消息，手动压缩不换taskId；取消压缩等待实际操作结束。
- 原生会话保存不等于浏览器断线后所有工具能继续。进程意外退出后的未知修改不自动重放；下次作者发送时结算未结束操作后继续已有对话。依赖浏览器的正文生成仍保留该边界。

### 原生会话验收

10-23 正文补全修复需要配套8451运行包，本机已按作者本轮授权更新启用（回执`.runtime/service-long-writing-20261023.json`，公网未更新）：`modelFunnel` 未显式传输出额度时从注册模型读取能力，移除4096缺省；流式返回保留实际停止原因和用量。候选包可用 `PINAX_RUNTIME_OUTPUT=/path/to/candidate node scripts/narrative-output-funnel-smoke.mjs` 对本机模拟供应商验证，两种协议、流式/非流式、默认/明确额度共8个请求，不调用真实模型。仅更新前端不会改变运行中补全漏斗；已有3001转发支持时无需为本项重启3001。

固定上游版本编译后，可对候选运行包执行：

```bash
PINAX_RUNTIME_OUTPUT=.runtime/storyagent-native-final-20261022 node scripts/assistant-runtime-delivery-smoke.mjs
PINAX_RUNTIME_OUTPUT=.runtime/storyagent-native-final-20261022 node scripts/assistant-native-session-smoke.mjs
PINAX_RUNTIME_OUTPUT=.runtime/storyagent-native-final-20261022 MOCK_API=anthropic-messages node scripts/assistant-native-session-smoke.mjs
```

第一项检查产品工具交付合同；后两项启动临时端口与模拟模型，贯穿真实 HTTP/SSE 适配、原生会话、提问续接、工作中补充、压缩/取消及服务重开。它们不会连接用户作品或真实模型，不能替代真实供应商质量验收。生成包与运行包分开；部署要保留任务日志和原生会话目录。

### 写作方法与正文结果回传（2026-10-22）

本地新版要求 `assistantWritingMethods` 和 `assistantNarrativeExchange`。除 8451 外，3001 必须同时支持 `/tasks/:id/narrative-result` 转发；只有前端更新无法完成接线。运行器在当前工具调用中等待浏览器推演，收到实际文字后继续原任务，不以 planned 请求提前结束。生成草稿已自动进入提议；同目标的提议可修订其文字，重复生成默认替换候选，extend 才续接。取消/断流沿当前任务停止；不承诺浏览器刷新后恢复未完成生成。方法目录与结构属性合同随运行包扩展一起复制，必须重新构建候选，不能只替换 prompt 文件。健康标志和编译通过不代表真实任务验收。

2026-10-23 流程优化：正文工具新增 planning（direct/reuse/plan）与可选 finishTask；原生 after_tool 仅在显式最后一项写稿成功、无待消费补充时结束，正常多步工作和队列保留。工具回包只保留 proposalChanges 一份正文，最终交付仍带完整候选。需要配套更新8451；本机已自动启用，3001与5173未重启，回执 `.runtime/service-flow-20261023.json`。
