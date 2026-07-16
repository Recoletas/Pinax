# Agent Runs

## 2026-07-16 Online / Agents / Canvas / Video

执行包已编写，等待用户在独立 OpenCode / Claude Code 窗口启动；当前没有已确认运行中的 worker。

| Window | 建议工具 | Scope | 状态 | Prompt / Result |
|---|---|---|---|---|
| A | Claude Code | 联机房间服务、RoomEvent、WS、重连与权限 | 待启动 | [prompt](./2026-07-16-online-agents-canvas-video/prompt-a-online-server.md) |
| B | OpenCode | 在线路由、房间 UI、WS 客户端与 session adapter | 待启动 | [prompt](./2026-07-16-online-agents-canvas-video/prompt-b-online-client.md) |
| C | Claude Code | Agent task/context/result 基础契约与 Advisor 兼容 | 待启动 | [prompt](./2026-07-16-online-agents-canvas-video/prompt-c-agent-contracts.md) |
| D | OpenCode | 关系画布视口、几何、连线调度与交互稳定性 | 待启动 | [prompt](./2026-07-16-online-agents-canvas-video/prompt-d-canvas-optimization.md) |
| E | Claude Code | 视频 GenerationJob、provider adapter、路由与客户端 | 待启动 | [prompt](./2026-07-16-online-agents-canvas-video/prompt-e-video-gateway.md) |
| F | Claude Code | A-E 合并后的体验/分镜接线、测试与文档收口 | 被 A-E 阻塞 | [prompt](./2026-07-16-online-agents-canvas-video/prompt-f-integration.md) |

冻结契约、文件所有权、合并顺序和完成定义见 [执行包总览](./2026-07-16-online-agents-canvas-video/README.md)。A-E 必须使用不同 worktree 或分支；F 不得提前启动。最终测试总量仍需保持不超过 200。

## 历史证据

最近仍与产品主线相关的证据：

- `2026-07-01-geo-history/`：地理、历史、地图可靠性和编辑器恢复记录。
- `2026-07-02-research/`：整合路线研究记录。
- `2026-07-07-rpla-research/`：历史 / 地理 / 涌现相关研究记录。

旧 UI 重构 run 保留在目录中作历史证据，但不再作为当前任务看板，也不应覆盖 `docs/STATUS.md` 和主路线图。
