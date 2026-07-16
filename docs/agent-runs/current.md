# Agent Runs

## 2026-07-16 Round 2 Integration

所有窗口固定基线为 `635a439038a16a3306ab9b30c45c4d3412250957`，不得从 `main`、旧 worktree 或 stash 开工。Codex 负责最终合并，worker 不修改共享状态文档。

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| R2-A | Manual agent | `/tmp/pinax-r2-entry` / `round2/visible-online-entry` | 联机常驻入口与路由可发现性 | ready | [prompt](./2026-07-16-round2-integration/prompt-a-entry.md) |
| R2-B | Manual agent | `/tmp/pinax-r2-canvas` / `round2/canvas-video` | 视频入口可见性与画布拖拽状态机 | ready | [prompt](./2026-07-16-round2-integration/prompt-b-canvas-video.md) |
| R2-C | Manual agent | `/tmp/pinax-r2-advisor` / `round2/advisor-lifecycle` | 顾问任务、结果生命周期和可应用状态 | ready | [prompt](./2026-07-16-round2-integration/prompt-c-advisor.md) |
| R2-D | Manual agent | `/tmp/pinax-r2-comic` / `round2/comic-production` | Notes HTML 修复与漫画页级制作逻辑 | ready | [prompt](./2026-07-16-round2-integration/prompt-d-comic.md) |

### Write Locks

- R2-A: `src/config/workbenchNav.js`, `src/layouts/AppShell.vue`, `src/components/workbench/ActivityBar.vue`, `src/components/workbench/SidePanel.vue`
- R2-B: `src/pages/ProseEssay.vue`, `src/components/canvas/`, `src/composables/useCanvasViewport.js`, `src/services/canvasGeometry.js`, `src/__tests__/canvasOptimization.test.js`
- R2-C: `src/composables/useAdvisor.js`, `src/components/AdvisorPanel.vue`, `src/services/advisor*.js`, `src/services/agents/`, advisor-related existing tests
- R2-D: `src/pages/Notes.vue`, `src/components/media/ComicPageEditor.vue`, `src/components/media/ComicPagePreview.vue`, `src/services/media/comic*.js`

约束：不启动 dev server，不新增测试用例总数，不修改 `docs/STATUS.md`、`docs/PLAN.md`、`docs/LOG.md`、`AGENTS.md`、主 store 或其他窗口文件。每个 worker 必须自审、运行定向验证、提交 scoped commit，并写不超过 400 字的结果摘要。

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
