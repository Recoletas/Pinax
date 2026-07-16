# Window A — 联机服务端 实现报告

Date: 2026-07-16
Branch: `feature/online-room-server`
Status: 完成，待 Codex 或 F 窗口接线

## 实现摘要

按 `prompt-a-online-server.md` 的 8 项要求实现了联机房间服务端基础层。

### 新增文件

| 文件 | 职责 |
|---|---|
| `server/realtime/RoomRegistry.js` | 进程内房间注册表：创建/按 slug 获取、成员管理、房主、递增 seq、事件日志、activity、空房清理 |
| `server/realtime/RoomEventStore.js` | 事件存储：追加、按 lastSeq 增量读取、snapshot、commandId 幂等去重 |
| `server/realtime/wsHandler.js` | WebSocket 连接生命周期：ready/join/leave/断开/heartbeat 超时/presence 广播/重连 |
| `server/realtime/validators.js` | 输入校验：昵称 ≤30、消息 ≤2000、动作 ≤500、最大成员 20、频率限制 |
| `server/realtime/serializer.js` | 统一序列化器：所有出站消息统一 JSON 格式 |
| `server/routes/rooms.js` | HTTP API：GET /api/rooms/:slug 公开摘要、POST /api/rooms 创建、GET /api/rooms 列表 |
| `server/__tests__/onlineRoom.test.js` | 3 个定向单元测试：seq+commandId 幂等；host 权限；lastSeq 重连/snapshot |

### 改动文件

| 文件 | 改动 |
|---|---|
| `server/index.js` | `app.listen()` 改为显式 `createServer(app)`；在 `/ws/rooms` 挂载 `WebSocketServer`；注册 rooms 路由；SIGTERM/SIGINT 时调用 `stopCleanupInterval()`；SPA fallback 排除 `/ws/` 路径；导出 `{ app, server, wss }` 供测试导入 |

## 协议偏差

无。严格按照 README.md 4.1 RoomEvent / 4.3 GenerationJob 冻结契约实现。

- 事件类型：10 种中 8 种已实现（room.member.joined/left, chat.message, action.proposed/selected, vote.cast, narrative.requested, runtime.patch.accepted）；`room.member.updated` 与 `narrative.completed` 保留供 F 窗口接入
- 客户端命令：8 种全部实现（room.join/leave, chat.send, action.propose/select, vote.cast, room.snapshot.request, ping）
- 服务端消息：6 种全部实现（server.ready, room.joined, room.snapshot, event.append, presence.sync, error, pong）
- host-only 命令：action.select, narrative.request, runtime.patch.accept 三者均检查 `conn.memberId === room.hostId`

### 未实现（协议保留，由 F 窗口接续完成）

- `narrative.completed` 事件生成 — 需要 LLM 集成，不在本窗口 scope
- `room.member.updated` 事件 — 保留类型，见协议偏差
- WS ping/pong：服务端 heartbeat 定时器只做超时检测，`pong { sentAt }` 仅在收到客户端 `ping` 时回复

## 测试命令与结果

```bash
# 单元测试（req 流程：seq+commandId 幂等；host 权限；lastSeq 重连/snapshot）
npx vitest run --config ./vitest.server.config.js   # 独立 config，不污染 vitest.config.js
# 结果: 3 passed (3 tests)

# build
npm run build
# 结果: ✓ built in 4.15s, clean

git diff --check: EXIT=0
```

`vitest.config.js` 未被本窗口修改。

## 审查记录

自审发现并修复的问题：

1. **`wsHandler.js` `connState` 从未赋值（严重 bug）**: `broadcastToRoom` / `broadcastPresence` 引用闭包变量 `connState.room`，但 `connState` 仅声明为 `null`，从未赋值，导致 join 时房间内其他成员收不到 `event.append` / `presence.sync` 广播。改为使用 `this.room` 引用 conn 自身属性。
2. **`wsHandler.js` 心跳定时器里主动发 `pong`**: 与 README 协议中"`pong` 是对 `ping` 的响应"语义冲突，且与 `handleMessage` 中 `ping → pong` 重复。改为定时器只做 60s 超时检测，`pong` 仅在收到 `ping` 时回复。
3. **`routes/rooms.js` 不校验 `hostNickname`**: `POST /api/rooms` 直接把 body 里的 hostNickname 透传给 `createRoom`，可绕过 validators。补 `validateNickname` 调用，并修正空 slug 检测。
4. **`wsHandler.js` `socket._socketId` 与 `socket._conn`**: 这两个自定义属性从未被赋值也未被读取，删除死代码。
5. **`RoomEventStore.js` `compactEvents` 生产代码未触发**: `RoomRegistry.pushEvent` 已做 100 上限截断，`compactEvents` 永远不派上用场且无人调用，删除。

## 已知限制

1. 进程内存储：房间、事件、成员全部在内存中，进程重启丢失。未接数据库。
2. 不调用 LLM：`narrative.requested` 是权威事件，由最终集成窗口（F）处理生成与回写。
3. 单进程路由：server.js 现有路由和 SPA fallback 保持不变，仅新增 `server/routes/rooms.js`；不注册未合并的视频路由。
4. 房间清理：闲置超 1 小时后每 5 分钟清理一次。`cleanupTimer.unref()` 不阻止进程退出。
5. 命令广播只在新事件产生时；server 不做 undo/delete。
6. 未引入新 npm 依赖，全部基于现有 `ws` + 标准 `node:crypto`/`node:http`。

## 给后续窗口（B 客户端 + F 接线）的接线说明

### B 窗口（联机客户端）

- 连接地址：`ws://localhost:3001/ws/rooms`
- 握手：连接后收到 `server.ready`，便立即发送 `room.join` 命令
- 房间创建：POST `/api/rooms` 前检查是否存在（先 GET `/api/rooms/:slug` 看是否有 404），或直接 joining（服务端自动创建不存在 slug 的房间）
- snapshot：连接时如果客户端有 `lastSeq` 带入 `room.join`，服务端自动路由错失事件
- 房主标识：客户端可根据 `presence.sync` 或 `room.snapshot` 中的 `hostId` 自行标志；房主看到专属 action
- 重连：disconnect 后重新发起 `room.join { roomSlug, nickname, lastSeq }` 即可恢复 session

### F 窗口（最终接线）

- `server/index.js` 已导出 `{ app, server, wss }`，可直接导入测试
- `room.joined` 收到后应将本地体验会话注入 `ws-layout` 的 online panel
- `narrative.requested` 事件生成由 F 窗口接入 LLM 后回调 `narrative.completed`
- 频率限制为 `connection-only`，服务端不做全局限流
- 导出房间列表仅提供公开摘要，不暴露内部 socket ID 或密钥
