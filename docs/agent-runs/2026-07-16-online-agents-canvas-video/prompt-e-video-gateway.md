# Window E Prompt - Claude Code - Video Job Gateway

你负责建立 Pinax 分镜视频生成的服务端异步任务网关和前端任务客户端。请完成可用的 provider abstraction、任务状态机、MiniMax 与通用异步 HTTP adapter；不要改页面和 `server/index.js`。

开始前：

1. 阅读 `AGENTS.md`、`docs/STATUS.md`、非空时的 `LOCAL.md`。
2. 阅读主路线图 Gate 5/Iteration F，以及执行包 README 的 GenerationJob 契约。
3. 盘点现有 `src/services/media/**`、图片 provider 配置、`storyboardStore.js` 和 `useDirector.js`，只复用契约，不改它们。
4. 在独立 worktree/分支工作，建议 `feature/video-job-gateway`。不启动 dev server。

你的文件所有权仅限：

- `server/media/**`
- `server/routes/media.js`
- `src/services/media/videoJobService.js`
- 你新增的定向测试文件
- 你的总结 `docs/agent-runs/2026-07-16-online-agents-canvas-video/result-e-video-gateway.md`

必须实现：

1. 进程内 `GenerationJobStore`：创建、读取、状态转换、取消、过期清理，严格执行冻结状态机，非法转换返回稳定错误。
2. `providerRegistry`：注册 adapter、能力描述、配置校验、公开安全元数据；浏览器永远拿不到 key/token/header secret。
3. `minimaxVideo` adapter：按 MiniMax 异步视频 API 的 submit/query/cancel 能力实现；HTTP transport 可注入，测试不访问公网。若取消能力受 provider 限制，规范化为本地 cancelled 并停止轮询。
4. `genericAsyncHttp` adapter：仅支持受约束模板，不执行任意 JS。允许配置 submit/status/cancel URL、method、静态 headers、JSON body/path mapping、成功/失败状态集合和输出 URL path。
5. 后台 job runner：有界并发、轮询退避、超时、最大尝试次数、进程退出清理。单个 provider 失败不能阻塞其他任务。
6. Express router 实现冻结 API：create/get/cancel/providers/test。校验 prompt、duration、aspect ratio、sourceRefs/referenceImages 和 provider config。
7. 错误 normalization：认证、限流、超时、上游 4xx/5xx、未知响应、无输出等映射到统一结构；日志中 redact secret。
8. `videoJobService.js`：前端 create/get/cancel/test/listProviders 和可停止的 polling helper；不依赖 Vue，不持久化密钥，不改 UI。
9. 输出 metadata 保留 sourceRefs、provider、model、duration、尺寸/比例和 providerJobId，方便 F 归档到 MediaAsset。

实现约束：

- 不在页面中写 provider fetch，不把视频二进制存进 localStorage。
- 不新增第二套项目 ID 或 MediaAsset schema。
- 不修改 `server/index.js`；F 负责注册 router。
- 不真实调用 MiniMax。所有 provider 测试使用注入 transport/mock server。
- 优先复用现有依赖，不增加大型 SDK。

测试与验收：

- 最多新增 3 个高价值测试：状态机；adapter normalization；router 或 polling/cancel 流程。
- 运行定向测试、`npm run build` 和 `git diff --check`。
- 确认测试结束后没有 timer/open handle。

交付时：

- 自审并修复你发现的问题。
- 在 result 文件写：API、配置 shape、adapter 能力差异、测试结果、F 注册路由和归档输出所需步骤。
- 如果在独立 worktree，创建一个 scoped commit；共享 worktree则不要提交。
- 不修改 `server/index.js`、`useDirector.js` 或页面组件。
