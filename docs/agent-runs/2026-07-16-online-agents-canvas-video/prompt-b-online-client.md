# Window B Prompt - OpenCode - Online Client

你负责 Pinax 联机模式的前端房间入口和 WebSocket 客户端。请交付能实际创建/加入房间、聊天、显示成员和动作提议的页面；不要修改现有 `Experience.vue` 的游戏生成逻辑。

开始前：

1. 阅读 `AGENTS.md`、`docs/STATUS.md`、非空时的 `LOCAL.md`。
2. 阅读 `docs/agent-runs/2026-07-16-online-agents-canvas-video/README.md`，严格使用冻结的 RoomEvent 协议。
3. 在独立 worktree/分支工作，建议 `feature/online-room-client`。不启动 dev server。

你的文件所有权仅限：

- `src/pages/OnlineExperience.vue`
- `src/components/experience/OnlineRoomPanel.vue`
- `src/composables/useOnlineRoom.js`
- `src/services/experienceSessionAdapter.js`
- `src/router/index.js`
- 你新增的定向测试文件
- 你的总结 `docs/agent-runs/2026-07-16-online-agents-canvas-video/result-b-online-client.md`

必须实现：

1. 新增 `/experience/online/:roomSlug?` 路由。无 slug 时显示紧凑的创建/加入界面，有 slug 时直接进入房间界面。
2. `useOnlineRoom` 负责 WebSocket URL 推导、连接状态、join、心跳、指数退避重连、lastSeq、commandId、事件去重、snapshot 替换和页面卸载清理。
3. 本地只持有联机投影：room、members、events、chat、proposals、votes、connection state；不要复制世界书或体验 store。
4. `OnlineRoomPanel` 显示房间码/复制链接、连接状态、成员及角色、聊天、动作提议、投票和房主选择。布局沿用体验页安静、紧凑的样式，不做营销页，不嵌套卡片。
5. 无障碍与小屏可用：清晰 label、Enter 发送、按钮禁用态、错误信息、滚动区域稳定，360px 宽不横向溢出。
6. `experienceSessionAdapter` 将联机事件投影成后续可被 Experience 消费的最小接口：订阅 narrative request/completed、提交 host completion、提交 accepted runtime patch。这里只定义和测试 adapter，不直接改 `Experience.vue`。
7. URL 昵称不要明文持久化；可用 sessionStorage 记住同一 tab 的昵称和 lastSeq。不得把任何 API key 放入 URL/localStorage。

UI 约束：

- 使用现有 token、按钮和图标库；图标按钮加 tooltip。
- 不做大标题 hero、装饰性卡片或新的单色主题。
- 房间连接中、重连中、离线、被拒绝和房间不存在都有明确状态。
- 进程内房间重启会失效，在加入错误里自然说明，不写大段教程。

测试与验收：

- 最多新增 3 个高价值测试：event seq 去重；snapshot/reconnect；host/player 控件权限之一。
- 使用 mock WebSocket，不依赖真实服务端。
- 运行定向测试、`npm run build` 和 `git diff --check`。
- 按仓库 `ui-style-check` 检查暗色 token、响应式和组件一致性；不要启动 dev server。

交付时：

- 自审并修复你发现的问题。
- 在 result 文件写：页面/状态说明、改动文件、测试结果、对 A 协议的假设、给 F 的接线 API。
- 如果在独立 worktree，创建一个 scoped commit；共享 worktree则不要提交。
- 不修改 `Experience.vue` 或任何 server 文件。
