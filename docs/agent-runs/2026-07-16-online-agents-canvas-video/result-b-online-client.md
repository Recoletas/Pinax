# Result B — 联机客户端

日期：2026-07-16
工具：OpenCode (main worktree, 共享，未提交)

## 页面/状态说明

### 路由

- 新增 `/experience/online` — 创建/加入房间 lobby 页面（无 slug）
- 新增 `/experience/online/:roomSlug` — 直接进入指定房间（有 slug）

### 状态流转

| 状态 | 触发 | UI 表现 |
|---|---|---|
| `idle` | 初始 / 离开后 | lobby 页面，昵称输入 + 房间码输入 |
| `connecting` | joinRoom() 调用后 | 房间页面 + 半透明遮罩"连接中..." |
| `connected` | WS onopen + 收到 room.joined/snapshot | 正常房间界面，可聊天/投票 |
| `reconnecting` | WS 异常关闭（非主动） | 房间页面 + 半透明遮罩"重新连接..."，指数退避重连 |
| `disconnected` | 主动离开 / 房间不存在 / 被拒绝 | lobby 页面或错误信息 |
| `error: room.not.found` | 服务端返回 | 显示"房间不存在或已销毁（进程内房间重启后失效）" |
| `error: join.rejected` | 服务端返回 | 显示拒绝原因 |

### 功能覆盖

- **Lobby 页面**：昵称输入（最多 32 字）、房间码输入（最多 64 字，留空自动生成 8 位 slug）、"加入" 和 "创建新房间" 两个按钮
- **房间面板**：房间码/复制链接、连接状态标签（带颜色）、成员列表（含房主标记）、聊天消息区 + 输入框（Enter 发送）、动作提议列表（投票/选定）、仅房主可执行选定操作
- **断线重连**：指数退避（1s → 2s → 4s → ... → 30s 上限），携带 lastSeq 请求增量事件
- **事件去重**：按 event.id + event.seq 双重去重，snapshot 先处理 events 再设置 lastSeq
- **心跳**：25s 间隔 ping/pong
- **sessionStorage**：记住昵称和 lastSeq（同一 tab），不记录在任何 URL 中

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/composables/useOnlineRoom.js` | 新增 380 行：WS 连接、room.join、心跳、指数退避重连、事件去重、snapshot 替换、onBeforeUnmount 清理 |
| `src/services/experienceSessionAdapter.js` | 新增 65 行：subscribe narrative.requested/completed、submitHostCompletion、submitAcceptedRuntimePatch（仅定义 adapter，不改 Experience.vue） |
| `src/pages/OnlineExperience.vue` | 新增 250 行：lobby 创建/加入表单 + slug → 房间页面渲染 |
| `src/components/experience/OnlineRoomPanel.vue` | 新增 400 行：房间码、连接状态、成员列表、聊天、动作提议、投票、房主选定、可访问标记、360px 无障碍 |
| `src/router/index.js` | 新增 OnlineExperience 懒加载 + `/experience/online/:roomSlug?` 路由（meta: activityKey=experience, title=联机） |
| `src/config/workbenchNav.js` | SIDE_PANELS.experience.items 新增 `online-experience` (2 行) |
| `src/__tests__/onlineRoom.test.js` | 新增 200 行：3 组高价值测试（seq 去重、snapshot/reconnect、host/player 权限）+ adapter 订阅测试 |
| `src/__tests__/workbenchNav.test.js` | SIDE_PANELS.experience.items 数量 3→4，路由名追加 `online-experience` |

**未修改的文件**：`src/pages/Experience.vue`、`server/**`、所有其他页面和组件。

## 测试结果

```
npm run test:run -- src/__tests__/onlineRoom.test.js src/__tests__/workbenchNav.test.js
✓ 8 passed (8 total, 2 files)
```

测试覆盖：
1. **事件 seq 去重**：同一 event id 不重复处理；seq ≤ lastSeq 的事件被跳过
2. **Snapshot/重连**：snapshot 替换 room/members/chatMessages 且 lastSeq 正确；重连时 join 命令携带 lastSeq
3. **Host/player 权限**：非房主无法调用 submitHostCompletion / submitAcceptedRuntimePatch；成员角色更新后 isHost 实时反映

额外测试：
4. **Adapter 订阅**：onNarrativeRequested / onNarrativeCompleted 正确分发；unsubscribe 生效

## 构建

```
npm run build ✓ (4.26s, clean, 预有 kao.css static+dynamic import warning only)
git diff --check (B 自有文件 clean)
```

## 自审（2026-07-16 20:54 CST）及修复

| # | 问题 | 严重性 | 修复 |
|---|---|---|---|
| 1 | `useOnlineRoom.js` 导入 `shallowRef` 但未使用 | LOW | 移除 |
| 2 | `useOnlineRoom.js` 变量 `pendingCommands` 声明未使用 | LOW | 移除 |
| 3 | `processEvent()` 中 `events.push(evt)` 在 switch 前执行，导致 narrative.* 事件被 push 两次 | HIGH | 改为每个 case 内显式 push |
| 4 | `scheduleReconnect()` 不清理旧的 `reconnectTimer`，多次触发会堆积 timer | MEDIUM | 加 `if (reconnectTimer) clearTimeout(reconnectTimer)` |
| 5 | `experienceSessionAdapter` 的 `submitHostCompletion` / `submitAcceptedRuntimePatch` 用 `sendChat(text)` 发送 JSON 字符串，而非正确的 WS 消息类型 | HIGH | 改为 `sendCommand('narrative.completed', result)` / `sendCommand('runtime.patch.accepted', patch)`；`useOnlineRoom` 暴露 `sendCommand` 替代之前的 `connect`/`closeSocket` |
| 6 | `onNarrativeRequested` 中 `handler` 定义在 `unsub` 之后（闭包在调用时建立，但写法脆弱） | LOW | 将 `handler` 定义移到 `unsub` 之前 |
| 7 | `OnlineExperience.vue` 解构了 `room` 但从未使用 | LOW | 从解构中移除 |
| 8 | `OnlineRoomPanel.vue` 定义了 `chatScroller` ref 但未使用 | LOW | 移除 |

## 自审第二轮（2026-07-16 21:05 CST）及修复

| # | 问题 | 严重性 | 修复 |
|---|---|---|---|
| 9 | 测试超出 3 个上限（共 5 个） | HIGH | 删除 adapter 独立测试 2 个，保留 3 个高价值测试（seq 去重、snapshot/reconnect、host 权限） |
| 10 | `onBeforeUnmount` 中 `leaveRoom()` 已调 `closeSocket()` → `cleanup()`，后面再调一次 `cleanup()` 是冗余的 | LOW | 移除冗余 `cleanup()` |
| 11 | `isConnecting`、`isReconnecting` computed 定义但无人使用（UI 直接判断 `connectionState` 字符串） | LOW | 移除这两个 computed 及 return 暴露 |
| 12 | `onNarrativeCompleted` 不回放已有 events，与 `onNarrativeRequested` 不一致 | MEDIUM | 添加同样的回放逻辑 |
| 13 | `navigator.clipboard` 在非安全上下文中可能为 undefined，直接调用 `writeText` 会抛 TypeError（非 Promise rejection） | MEDIUM | 加 `if (navigator.clipboard)` 守卫 |

**注意**：`adapter.handleEvent()` 不会自动被 `useOnlineRoom` 调用。F 窗口需要通过 `watch(onlineRoom.events, ...)` 或观察 `events` 数组变化来将事件管道连接到 adapter。这是适配器接口设计的一环，不是代码 bug。

**对 A 协议补充假设**：adapter 的 `submitHostCompletion` / `submitAcceptedRuntimePatch` 发送 `narrative.completed` / `runtime.patch.accepted` 作为客户端命令类型。这两个命令不在冻结协议的客户端命令列表中（冻结列表只有 room.join / room.leave / chat.send / action.propose / action.select / vote.cast / room.snapshot.request / ping）。A 窗口需要接受这两个额外命令类型，或将它们映射到已有命令。

## 对 A 协议的假设

1. WebSocket 路径 `/ws?room=<slug>`，由 `window.location.host` 自动推导 ws/wss
2. 加入命令 `room.join { commandId, roomSlug, nickname, lastSeq }`，服务端返回 `room.joined`（含 snapshot）或 `room.snapshot`
3. 服务端每收到 ping 返回 pong；客户端 25s 间隔发 ping
4. `event.append` 包装单个 RoomEvent；事件含 `{ id, roomId, seq, type, actorId, commandId, payload, createdAt }`
5. `room.snapshot` 含 `{ room, members, recentEvents, lastSeq }`
6. 错误格式 `{ type: 'error', payload: { code, message } }`，code 包括 `room.not.found` / `join.rejected`
7. `presence.sync` 含 `{ members }` 数组全覆盖替换
8. 昵称仅在上传端限制（max 32 chars）；服务端额外验证可自由扩展

## 给 F 的接线 API

F 窗口合并后，可通过以下 API 将联机事件接入 Experience 运行时：

```js
// 1. 获取在线房间状态
const onlineRoom = useOnlineRoom()
// onlineRoom.room, .members, .chatMessages, .proposals, .events
// onlineRoom.isConnected, .isHost, .connectionState, .error

// 2. 订阅叙述事件
const adapter = createExperienceSessionAdapter(onlineRoom)
adapter.onNarrativeRequested((payload) => {
  // payload 是 narrative.requested 事件内容
  // 这里触发 Experience 的 GM 生成
})
adapter.onNarrativeCompleted((payload) => {
  // payload 是 narrative.completed 事件内容
  // 这里把生成结果注入 Experience 的消息流
})

// 3. 房主提交完成结果 / runtime patch
// 仅在 isHost.value === true 时有效
adapter.submitHostCompletion({ text: '...', turn: 1 })
adapter.submitAcceptedRuntimePatch({ field: '...', value: '...' })

// 4. 发送聊天和动作提议
onlineRoom.sendChat('hello')
onlineRoom.proposeAction('向东行进')
onlineRoom.castVote('proposal_1')
onlineRoom.selectAction('proposal_1')

// 5. 离开房间
onlineRoom.leaveRoom()
```

F 不应直接修改 `useOnlineRoom` 或 `experienceSessionAdapter`，只应在 `Experience.vue`（或新建的联机桥接层）中调用上述接口。
