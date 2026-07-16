# Window A Prompt - Claude Code - Online Server

你负责 Pinax 联机模式的服务端基础。请一次完成一个可用的房间服务，不只搭空目录；但不要接数据库、LLM 或前端。

开始前：

1. 阅读 `AGENTS.md`、`docs/STATUS.md`、非空时的 `LOCAL.md`。
2. 阅读 `docs/agent-runs/2026-07-16-online-agents-canvas-video/README.md`，严格使用其中冻结的 `RoomEvent` 和消息协议。
3. 在独立 worktree/分支工作，建议分支 `feature/online-room-server`。保留所有无关 WIP，不启动 dev server。

你的文件所有权仅限：

- `server/realtime/**`
- `server/routes/rooms.js`
- `server/index.js`
- 你新增的定向测试文件
- 你的总结 `docs/agent-runs/2026-07-16-online-agents-canvas-video/result-a-online-server.md`

必须实现：

1. 把 Express 的监听改为显式 HTTP server，并在 `/ws/rooms` 挂载现有 `ws` 包；保留原 HTTP 行为和端口逻辑。
2. 实现进程内 `RoomRegistry`：创建/按 slug 获取房间、成员、房主、递增 seq、有限事件日志、最近活动时间和空房清理。
3. 实现 `RoomEventStore`：事件追加、按 `lastSeq` 读取增量、日志上限后的 snapshot 回退、`commandId` 幂等去重。
4. 实现连接生命周期：hello/ready、join、leave、异常断开、heartbeat、presence 广播、重连。
5. 实现聊天、动作提议、选择与投票。只有 host 能 `action.select`、`narrative.request` 和 `runtime.patch.accept`；服务端必须返回稳定错误码。
6. 实现 `GET /api/rooms/:roomSlug` 的安全公开摘要，以及可选的 `POST /api/rooms` 创建接口；不要暴露内部连接或密钥。
7. 加输入限制：昵称、消息、动作长度，最大成员数，JSON 解析错误，未知消息类型，基础频率限制。
8. 所有发送都通过统一 serializer；断开的 socket 不得导致广播抛错。

实现约束：

- 首版只做进程内房间，进程重启丢失是已接受限制。
- 不调用 LLM。`narrative.requested` 只是权威事件，由最终集成窗口处理生成与回写。
- 不同步完整前端 store；只传 RoomEvent、presence 和 snapshot。
- 不引入新 npm 依赖，优先使用 `crypto.randomUUID()` 和现有 `ws`。
- `server/index.js` 是你在并行阶段的独占文件，不注册尚未合并的视频路由。

测试与验收：

- 最多新增 3 个高价值测试，覆盖：seq/command 幂等；host 权限；lastSeq 重连或 snapshot。
- 运行你的定向测试和 `git diff --check`。如修改后的服务端可被无监听方式导入，再做一次最小 HTTP/WS smoke；不要常驻启动服务。
- 自查不会把 socket、timer 或 room 状态泄漏到测试进程。

交付时：

- 自审并修复你发现的问题。
- 在 result 文件写：实现摘要、改动文件、协议偏差、测试命令与结果、已知限制、给窗口 F 的接线说明。
- 如果在独立 worktree，创建一个 scoped commit；共享 worktree 则不要提交。
- 不修改其他窗口文件，也不要调用 Codex 代你完成。
