# Agent 运行包发布

PR #6 将文本请求出口统一到 Storyflow。仅上传 `dist` 无法运行文本生成，还必须携带运行包。

## 本机构建

使用 Node 22，在 Pinax 仓库执行：

```sh
npm ci
PINAX_RUNTIME_OUTPUT=.runtime/storyagent-next npm run build:agent-runtime
npm run build
```

运行器源版本固定在 `shared/storyagentRuntimeSource.json`；构建脚本只导出源代码和锁文件，使用 `npm ci` 编译并移除开发依赖，不带入上游配置或上游已安装依赖。输出目录由 `PINAX_RUNTIME_OUTPUT` 指定（默认 `.runtime/storyagent`）；本轮候选位于 `.runtime/storyagent-next`，其 `runtime-source.json` 记录源提交、依赖锁和 Pinax 扩展指纹。此目录被 Git 忽略，需要随发布包上传。

2026-10-12 助手返修经过独立包验证，并按作者授权切为 `.runtime/storyagent-next`、仅重启8451。健康响应包含 `assistantWorkspace: true`，新版交付预算及默认目录已加载。最近一次追加参数修复前的包保存在 `.runtime/storyagent-next-backup-append-1791781497`，首轮旧包保存在 `.runtime/storyagent-next-backup-20261012-1791780256`；任务目录和模型配置未改，5份日志哈希已核对。Express与前端未重启。运行PID另记 `.runtime/storyagent-current.pid`，本轮运行器为独立后台进程，Express重启会探测并复用。不要覆盖任务目录或密钥配置。

## 服务器运行

服务器使用同平台 Node 22；发布包含 `dist/`、`server/`、`shared/`、必要的服务端生产依赖和本轮 `.runtime/storyagent-next/`（或通过 `PINAX_RUNTIME_DIR` 显式指定的运行包）。服务器启动 Express 时自动拉起编译后的运行器，监听 loopback，浏览器只能通过 Express 代理访问。运行器默认任务目录为 `.runtime/data/storyagent-tasks`，可用 `PINAX_ADAPTER_TASKS_DIR` 显式覆盖。宿主在拉起新运行器前非破坏性复制旧 `.runtime/storyagent/tasks` 日志，保留源文件，并拒绝覆盖分歧日志。默认构建遇到输出目录含旧日志会拒绝替换，应使用独立候选目录。更新前先停止旧运行器，避免迁移期间继续追加。

保留服务器已有环境配置和模型密钥。只有 `MINIMAX_API_KEY` 且没有显式 Kit 模型配置时，启动器使用 MiniMax-M2.7 的 Anthropic 接口；有显式配置时尊重显式配置。公网必须设置已有的 `PINAX_PUBLIC_ORIGINS`，由服务端关闭本机文件能力和模型写接口。不得上传本地 `.env`，也不要把运行器端口暴露到公网。

协议 2 前后端须成套更新，运行包健康响应需包含 `assistantProtocolVersion: 2`；只刷新网页无法让已加载旧模块的 Express 或运行器更新。发布前检查 `/api/storyagent/healthz`、模型状态、真实助手检索与生成；采用动作应在浏览器执行，不能让运行器直接修改正式作品。运行器缺失时会明确返回不可用，不自动切换另一套文本引擎。

## 回滚

保留上一版完整前端、后端和运行包，通过现有进程管理器一起切回，保留原环境配置和任务目录。不要只回滚前端或只覆盖运行器依赖。

本轮已经在 1871 MiB 的现有服务器上做临时运行包内存检查：运行器空闲约 91 MiB，两个合成任务并发峰值约 103 MiB，测试进程合计约 180 MiB。临时目录已清理；该检查没有部署或重启生产服务。真实模型质量和整站负载不能由该内存结果推定。

2026-10-12 推演接线沿用作者的8451更新授权：当前包健康响应增加 `assistantNarrative: true`，支持 `generate_narrative_draft` 的 planned 请求；正文实际生成仍由前端冻结会话调用既有内核，不由聊天工具直接写入。旧包保存于 `.runtime/storyagent-next-backup-narrative-1791805953`，当前PID2413804，仍以pid文件为准。切包前后的10份既有任务日志哈希一致，模型环境与配置继承，5173／3001未重启。

2026-10-13 PR #7助手适配增加 `assistantSampling`／`assistantObservability`，从实际pi消息列表流式发送提示词组成，采样仅对合法本轮助手参数生效。当前PID2542722，回退包 `.runtime/storyagent-next-backup-observability-1791851363`，更新前后21份既有任务日志哈希一致。原配置继承，前端与Express未重启；新增预览帧不单独写任务日志，既有运行器journal机制不变；新内存快照由浏览器持有。


2026-10-13剩余知识接线：8451健康增加 `assistantKnowledge:true`，PID2568202，回退包 `.runtime/storyagent-next-backup-knowledge-1791854711`，24份既有日志SHA256保持一致。工具只按需经本机Express `/api/knowledge`代理；默认3001，运行器可用 `PINAX_KNOWLEDGE_PROXY_PORT` 配置其他端口。原配置／任务路径不变。5173／3001未重启；知识工具需要新的Express路由以及独立kit协议／内核服务，健康标记只说明工具已装入，不证明这两项依赖就绪。

## 2026-10-13 知识内核接线

本地使用 Node22 与 Python3，执行 `npm run build:knowledge-runtime`，默认构建 `.runtime/knowledge`。已有目录不覆盖，升级通过 `PINAX_KNOWLEDGE_RUNTIME` 指定独立候选。版本固定69420a76e93d1537891f9264d6e15e2984c534ba；构建导出core／adapters／契约／编译器及公开图，保留上游MIT许可，不包含上游私有知识原文或配置。Express按需在只读工作线程调用真实内核，无需额外两个常驻服务。

本书项目位置来自已有注册表。查询时生成独立派生索引，来源更新后重建；只有索引的通用卡会明确标记，缺少原文时读取失败，不补造正文。资料导入、项目绑定和正式世界书仍沿原入口。公网部署继续关闭本机知识能力。

作者已授权更新3001。最终8451 PID2613222、3001 PID2613223；回退包 `.runtime/storyagent-next-backup-pr7-final-1791860850`。24份既有日志SHA256一致，继承原环境与模型设置（模型由既有环境凭据提供，显式配置文件当前不存在）；5173未重启。健康检查及当前3001真实kb_search通过。PID最终以各自pid文件为准；生产未部署。
