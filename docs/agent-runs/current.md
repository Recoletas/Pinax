# Agent Runs

## 2026-09-02 C2 collaboration v2 foundation

Base commit: `e8b9df1e0a6def8fc667066e181ff818a6a2c675`

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| C2-W1 | Sol medium sub-agent | `/tmp/pinax-c2-foundation` / `feature/collaboration-v2-foundation` | C2-0/C2-1：纯协议合同、wire fixture、repository/materializer、身份/epoch/ACK/恢复/权限/配额/密文 fixture；旧 Experience compatibility；不触碰 Authoring/F3 | complete at `5f97714`; Codex matrix 28/28 + scoped lint green | `docs/agent-runs/c2-w1-foundation.summary.md` |
| C2-W2 | Sol medium sub-agents | `/tmp/pinax-c2-transport` / `feature/collaboration-v2-transport` | C2-2：transport/protocol client、WebCrypto、Web/Electron endpoint、REST/WS relay、真实邀请入口与安全生命周期；基线 `5f97714`，不触碰 Authoring/F3 | complete at `12b9596`; Codex foundation 28/28 + transport 43/43 + `verify:full` green | `docs/agent-runs/c2-w2-transport.summary.md` |
| C2-S | Sol medium read-only reviewers | `/tmp/pinax-c2-transport` | 多轮跨层安全/可靠性复审：Origin、撤销、resume、TTL、maintenance、邀请入口、heartbeat、parser scope、limiter GC 与终态 | complete; all blocker/high findings closed before freeze | findings absorbed into `06cc77b`…`12b9596` |
| C2-I | Codex | integration window TBD | 合并 foundation/transport，并接 C2-3 共同排演可见纵切 | waiting: F3-5 仍持有 Authoring owner；释放后安排单一 integration window | C2 branches remain isolated and frozen |

### Write locks and merge conditions

- C2 owns only new `shared/collaboration/`, `server/realtime/v2/`, `server/repositories/collaboration/`, `src/services/collaboration/`, collaboration fixtures/smokes, and the minimum old Experience compatibility adapter.
- C2 must not modify `src/pages/Authoring.vue`, Authoring CSS/editor/Ghost/history, F3 domain objects, worldbook/history/media stores, or `docs/STATUS.md`.
- W2 starts from the reviewed W1 contract commit; W1 and W2 do not edit overlapping implementation files.
- F3-4B 已形成本地 promotion/adoption 边界，但 F3-5 仍持有 Authoring owner；C2-3 只能在其释放后进入单一 integration window，由一个 owner 合并 foundation 并增加首个可见共同排演切片。

## 2026-08-31 Authoring 落笔上下文闭环 C1-2

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| C1-2 | Codex + bounded read-only audit workers | `/home/recoletas/jiuguan/text-game-framework` / `integration/consolidation-20260823` | 人物/地点三种现场意图、session reader/adapter、精确世界书授权、manifest/receipt 兑现门禁、8 人上限、Ghost 采纳 effect 与生命周期；不实施 C1-3 素材选择器 | 完成，整树门禁全绿 | focused 3 文件/59 用例、真实 5173 V5 旅程 5/5、390 无溢出/AX 阻断；`verify:full` 20/20 文件、200/200 用例及 Vite/VitePress/diff 全绿；下一刀 C1-3 |

本轮共享文件 owner 已解除；`plannedCharacterIds` 只保留旧数据兼容，不得恢复为新运行临时意图真源。C1-3 应抽出轻量 reference controller/picker，不继续把完整选择和回执状态堆入 `Authoring.vue`。

## 2026-08-30 Authoring 落笔上下文闭环 C1-1B

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| C1-1B | Codex + bounded audit workers | `/home/recoletas/jiuguan/text-game-framework` / `integration/consolidation-20260823` | 生产长推演接入冻结 AuthoringRunSession、manifest-only Kernel/工具、实际 receipt、provider 后 live revision/stale；修复 Ghost 原子采纳与 stale 可见性 | 实现与 focused Gate 完成；提交只允许在唯一最终 `verify:full` 全绿后产生 | focused 4 文件/82 用例、上下文生命周期 6/6、Vite build、diff check、production dry-run 1 项通过；下一刀 C1-2/C1-3 |

本轮文件 owner 已解除；后续不得恢复页面旧 `contextCandidates`、整本世界书或全量 runtime 作为生产长推演的第二真源。C1-2/C1-3 只在当前集成分支继续修改现场三意图、“本次参考”和作者可读摘要；地图 P1.7/P2 仍暂停。

## 2026-08-29 Map Platform v2（P0–P1 首轮）

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| MAP-V2 | ZCode（地图轨道，已收口） | 已整支集成 `integration/consolidation-20260823`；来源 baseline `c22af4c`、tip `95e9d29` | 世界档视觉层级与写作语义覆盖 P1 完成（P1.5 重做 + P1.6A/B）：地理优先真实底图、屏幕空间标签规划、落陆内推、浅海压缩、河网汇流系统、语义覆盖层；用户视觉验收通过 | 已集成并暂停；遗留进入以后重新排期的 P4 style pack 与 P1.7 region/local，不继续占用 Authoring 共享文件 | 验收图 `docs/engineering/map-p1-assets/light-world-{base,writing}-1440.png`；Gate 25 项全过。整合后地图合同聚焦 8/8、全项目 20 文件/200 用例与 build/docs 全过；失败证据 `p15-light-world-1440.png` 保留 |

地图 P1 写锁已解除。P1.7/P2 暂停；以后恢复时必须从最新整合基线重新登记 owner，P6 前仍不得直接触碰 Authoring、router、workspace/worldStore 或 `worldbookContextBuilder.js`。

## 2026-08-06 Structured Place Catalog

| ID | Owner | Workspace | Scope | Status | Output |
|---|---|---|---|---|---|
| SPC-LUNA | GPT-5.6 Luna | delegated workspace | G2.4-A A0-A5：地点合同、设定页目录、AI 整理审阅、世界书写入、地图正式条目边界及复用测试 | 代码完成，Codex 已审查 | A0-A4 与 A5 本地门禁完成；真实 provider Gate 待用户环境执行 |

写锁：`shared/*place*`、结构化生成合同中 `setting-places.v1` 的最小扩展、`src/services/*place*`、`src/components/worldbook/*Place*`、`StructuredSettingsPanel.vue`、`worldStore.js` 的地点 CRUD、`worldbookMapBridge.js` 的消费边界，以及既有 worldbook/map 测试项。Luna 不修改 `docs/`，不启动服务，不创建提交，不回滚其他 WIP。Codex 负责计划、差异审查、文档与最终门禁。

## 2026-07-16 Round 2 Integration

所有窗口固定基线为 `635a439038a16a3306ab9b30c45c4d3412250957`，不得从 `main`、旧 worktree 或 stash 开工。Codex 负责最终合并，worker 不修改共享状态文档。

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| R2-A | Manual agent | `/tmp/pinax-r2-entry` / `round2/visible-online-entry` | 联机常驻入口与路由可发现性 | 完成并集成 | [result](./2026-07-16-round2-integration/result-a-entry.md) |
| R2-B | Manual agent | `/tmp/pinax-r2-canvas` / `round2/canvas-video` | 视频入口可见性与画布拖拽状态机 | 完成并集成 | [result](./2026-07-16-round2-integration/result-b-canvas-video.md) |
| R2-C | Manual agent | `/tmp/pinax-r2-advisor` / `round2/advisor-lifecycle` | 顾问任务、结果生命周期和可应用状态 | 完成并集成 | [result](./2026-07-16-round2-integration/result-c-advisor.md) |
| R2-D | Manual agent | `/tmp/pinax-r2-comic` / `round2/comic-production` | Notes HTML 修复与漫画页级制作逻辑 | 完成并集成 | [result](./2026-07-16-round2-integration/result-d-comic.md) |

### Write Locks

- R2-A: `src/config/workbenchNav.js`, `src/layouts/AppShell.vue`, `src/components/workbench/ActivityBar.vue`, `src/components/workbench/SidePanel.vue`
- R2-B: `src/pages/ProseEssay.vue`, `src/components/canvas/`, `src/composables/useCanvasViewport.js`, `src/services/canvasGeometry.js`, `src/__tests__/canvasOptimization.test.js`
- R2-C: `src/composables/useAdvisor.js`, `src/components/AdvisorPanel.vue`, `src/services/advisor*.js`, `src/services/agents/`, advisor-related existing tests
- R2-D: `src/pages/Notes.vue`, `src/components/media/ComicPageEditor.vue`, `src/components/media/ComicPagePreview.vue`, `src/services/media/comic*.js`

约束：不启动 dev server，不新增测试用例总数，不修改 `docs/STATUS.md`、`docs/PLAN.md`、`docs/LOG.md`、`AGENTS.md`、主 store 或其他窗口文件。每个 worker 必须自审、运行定向验证、提交 scoped commit，并写不超过 400 字的结果摘要。

Codex 按 A -> D 顺序集成，并补齐三项审查修正：无 side-effect runner 的顾问结果不得进入 applied；漫画连续性文本和空白视觉引用编辑可正确保存；pointer cancel 回滚坐标并释放 listener/capture。测试总量保持核心 188 + 视觉 12。

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
