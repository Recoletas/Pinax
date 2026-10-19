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

不要把已有 `tasks` 目录当构建输出清空；脚本会拒绝覆盖含旧日志的目录。升级时使用新目录，并保留任务和配置。

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
