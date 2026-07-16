# Agent Runs

## 2026-07-16 Online / Agents / Canvas / Video

执行包 A-E 已回收并由 Codex 完成 F 集成。版本异常、恢复过程和最终接线记录在 F 结果中。

| Window | 建议工具 | Scope | 状态 | Prompt / Result |
|---|---|---|---|---|
| A | Claude Code | 联机房间服务、RoomEvent、WS、重连与权限 | 完成并集成 | [result](./2026-07-16-online-agents-canvas-video/result-a-online-server.md) |
| B | OpenCode | 在线路由、房间 UI、WS 客户端与 session adapter | 完成并集成 | [result](./2026-07-16-online-agents-canvas-video/result-b-online-client.md) |
| C | Claude Code | Agent task/context/result 基础契约与 Advisor 兼容 | 完成并集成 | [result](./2026-07-16-online-agents-canvas-video/result-c-agent-contracts.md) |
| D | OpenCode | 关系画布视口、几何、连线调度与交互稳定性 | 完成并集成 | [result](./2026-07-16-online-agents-canvas-video/result-d-canvas-optimization.md) |
| E | Claude Code | 视频 GenerationJob、provider adapter、路由与客户端 | 完成并集成 | [result](./2026-07-16-online-agents-canvas-video/result-e-video-gateway.md) |
| F | Codex | 版本恢复、A-E 合并、体验/分镜接线、测试与文档收口 | 完成，待用户 smoke | [result](./2026-07-16-online-agents-canvas-video/result-f-integration.md) |

冻结契约、文件所有权和合并证据见 [执行包总览](./2026-07-16-online-agents-canvas-video/README.md)。最终测试总量保持 200。

## 历史证据

最近仍与产品主线相关的证据：

- `2026-07-01-geo-history/`：地理、历史、地图可靠性和编辑器恢复记录。
- `2026-07-02-research/`：整合路线研究记录。
- `2026-07-07-rpla-research/`：历史 / 地理 / 涌现相关研究记录。

旧 UI 重构 run 保留在目录中作历史证据，但不再作为当前任务看板，也不应覆盖 `docs/STATUS.md` 和主路线图。
