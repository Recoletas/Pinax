# Agent Runs

## 2026-09-17 ABC白天统一验收（夜间无O）

当前入口：[组合审查回执](./nightly-20260917/integration-summary.md)与[ABC后续职责](../plan/nightly-20260917-ac-dispatch.md)。本轮未新起worker；核对既有交付后由Codex统一集成。计划文档先保存为 `daa2524`，运行时组合回归后本地提交，不push/部署。

本轮新增真实reader/ZIP/会话最终保存故障组合测试；A/B/C原脚本、备份UI与全量门禁在主线重跑。完整角色知识、自主主持、跨刷新图片恢复仍未交付，不按worker自报的completed全量结项。

| ID | 当前已核查分支/基线 | 夜间写集与职责 | 状态 | 任务书 |
|---|---|---|---|---|
| A-CONT | `night/memory-20260916@81aa3f9` | memory/knowledge、生产reader、历史bridge、统一ZIP | 实际交付已集成并补生产接线；AX18及后续知识/来源工作未完成 | [A](../plan/nightly-20260917-memory-continuation.md) |
| B-CONT | `night/comics-20260916@c00c59b` | 漫画/media、Shell/router、package/lock/许可 | 实际交付已集成；30项组合门禁；跨刷新保存恢复和部分BX待续 | [B与共享分工](../plan/nightly-20260917-ac-dispatch.md) |
| C-CONT | `night/roleplay-20260916@0dbca43` | roleplay、session/coordinator/gameStore、体验入口与公共UI断言 | 实际交付已集成并修复归档/回执/知识边界；完整主持/战役待续 | [C](../plan/nightly-20260917-roleplay-continuation.md) |

不创建夜间O工作树/worker。后续施工先以集成后的main为基线，保持ABC领域责任。**以下均为历史回执**，包括早期O交接和“仅计划/未启动”等表述；冲突时以本节与组合回执为准。

## 2026-09-16 三线夜间调研与计划（仅计划）

入口：[总任务书](../plan/nightly-20260916-three-track.md)。既有运行时已提交推送 `f74545b`；本次并行只写任务书，未启动夜间实现。旧 C2 状态不因本轮更新而改变。

| ID | Owner | Worktree | Scope | Status | Output |
|---|---|---|---|---|---|
| NIGHT-PLAN-A/O | Codex 主控 | 当前 main | Utopia 固定源码研究、提交推送、记忆任务书与共享集成合同 | 计划完成；最终 verify:full exit 0，20/200、双build、lint/架构/diff及链接检查通过 | [A](../plan/nightly-20260916-memory.md)、[O](../plan/nightly-20260916-three-track.md) |
| NIGHT-PLAN-B | comic_plan / Averroes | 共享树，仅独占漫画任务书 | StoryForge 漫画源码、许可、现状差距与验收 | 调研完成，无运行时代码写入 | [B](../plan/nightly-20260916-comics.md) |
| NIGHT-PLAN-C | rpg_plan / James | 共享树，仅独占跑团任务书 | StoryForge 跑团源码、许可、回合恢复与验收 | 调研完成，无运行时代码写入 | [C](../plan/nightly-20260916-roleplay.md) |

后续 A/B/C 实现 worker、worktree、进程、开始时间均尚未分配；不得将以上研究 agent 视作正在夜间施工。

## 2026-09-17 A 线续跑（AX01–AX18 生产与永久历史；阶段四至八未启动）

用户指派按[续跑任务书](../plan/nightly-20260917-memory-continuation.md)继续同一 worktree；不重建首批。base `aa17b47`；本批 tip 见 git log。O 集成窗口仍未开启；两份 O 锁定文件窄补丁已交并验证。

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| NIGHT-A-X | Claude worker | `/home/recoletas/jiuguan/pinax-night-memory-20260916` / `night/memory-20260916` | AX01–AX17 completed（AX07/08/11/12 补丁态 partial）、AX18 not-started、AX19–46 not-started、AX45/47 partial | 续跑 smoke exit 0（双页竞态/故障注入/10k+90k 压测/阻塞生命周期）；首批 smoke + 旧 smoke + verify:full 全 exit 0（20/200 保持） | [memory-continuation-summary.md](./nightly-20260917/memory-continuation-summary.md)、patches/*.patch |

## 2026-09-16 三线夜间 A 线执行（仅 A 线；用户直接指派，O 未启动）

用户指派执行 A 线（历史/记忆账本）；B/C 未启动，O 集成窗口未开启。base 冻结 `b5b2b56`，分支 `night/memory-20260916`，未 push，合并等 O 或用户验收。

| ID | Owner | Worktree | Branch | Scope | Status | Output |
|---|---|---|---|---|---|---|
| NIGHT-A | Claude worker | `/home/recoletas/jiuguan/pinax-night-memory-20260916` | `night/memory-20260916` | A01–A18 P0 纵向闭环 + A19 存储侧；A 归属写集 | completed（G-A16、A15/A16/A19 接线侧 partial，详见回执）；ledger smoke exit 0、旧 smoke 209 回归 exit 0、vitest 20/200 | [memory-summary.md](./nightly-20260916/memory-summary.md)、ADR [memory-fact-ledger.md](../engineering/memory-fact-ledger.md) |

## 2026-09-15 夜间架构成果修正

独立初验入口：[O 修改与集成指导](./architecture-night-20260914/O-MODIFICATION-AND-INTEGRATION-GUIDE.md)。三线已按指导修正，并按 B → C → A 压缩合入 main；组合验收见[最终回执](./architecture-night-20260914/integration-acceptance-20260915.md)。

| ID | 当前分支 / HEAD | 初验状态 | 下一动作 | 指导 |
|---|---|---|---|---|
| ARCH-A-R | `night/arch-a-20260914-fix@ed12a0c` → `main@a40521e` | integrated：scope/IME/取消/采纳异常已复核 | 保留 A12 partial，后续按真实需求推进 | `a/summary.md` |
| ARCH-B-R | `arch/gamestore-20260914@a7770f5` → `main@c52256b` | integrated + O fix：失败/取消最终提交与 no-AI no-op 已补 | 保留 B12 人物/活动提取 partial | `b/summary.md` |
| ARCH-C-R | `arch/notes-20260914@0921e31` → `main@b7de2e5` | integrated + O fix：异步编辑归属、durable mutation 与媒体写入已收紧 | 真实作者素材流内测 | `c/summary.md` |
| ARCH-O-R | `main` | complete：组合 verify:full、浏览器 Gate、双 Node 故障矩阵与 skills 完整性均通过；集成修复已提交 | 分线写锁已解除 | [验收回执](./architecture-night-20260914/integration-acceptance-20260915.md) |

## 2026-09-14 三线夜间架构整理（已执行；历史调度表）

若前三层全完成，§20 的 A14–A17/B15–B18/C14–C17 作为溢出队列，扩大写集前由 O 转锁。§21 固定 T+0:30/1:30/2:30/3:30/4:30/5:30/6:15/6:30/7:15/8:00 检查点，并记录续派与 active/blocked 区间。当前仍仅是 planned。

持续运行规则见 §19：T0 同基线启动，O 每 45–60 分钟检查；worker 早于 T+6:30 返回时在原 worktree 续派。第三批候选为 A10–A13、B11–B14、C10–C13；最后 90 分钟冻结并组合。当前仍未启动，不将计划中的写集登记为活跃锁。

新增 S 包按 §16–17 派发：A 独占 UI skill（S2），B 世界书 skill（S3），C 文档交接 skill（S4），O 持验证/maintenance/共享规则并完成 S0/S1/S5–S8。skill 改动与产品分提交，生效点显式交接；当前仅计划，无技能改动/活跃写锁。

加量派发以任务书 §13–15 为准：A0–A4 → A6 → A7/A8/A9；B0–B5 → B7 → B8/B9/B10；C0–C4 → C6 → C7/C8/C9。各线必须交本域文档补丁，公共 README/架构/导航由 O 提前串行合并，D1–D8 未落地不能标整轮完成。未启动，无新增活跃写锁。

入口：[详细任务书](../plan/architecture-night-three-tracks-20260914.md)。当前仅编制计划，未启动 worker；以下不是活跃写锁。实际启动时由 O 补齐共同基线 SHA、工作区、分支、进程和开始时间。

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| ARCH-O | Codex 集成/验收 | 当前 main；独立集成树待创建 | 基线、边界、共享断言、组合验收与文档 | planned | 任务书；实施回执待产出 |
| ARCH-A | 待分配 Claude worker | 待创建 | Authoring 写作助手生命周期 | planned | `architecture-night-20260914/a/summary.md`（待产出） |
| ARCH-B | 待分配 Claude worker | 待创建 | gameStore 会话规范化/保存/历史 | planned | `architecture-night-20260914/b/summary.md`（待产出） |
| ARCH-C | 待分配 Claude worker | 待创建 | Notes 目录/编辑/异步归属 | planned | `architecture-night-20260914/c/summary.md`（待产出） |

## 2026-09-13/14 StoryForge 借鉴与 Public Alpha 夜间计划

计划已执行并由 O 在 2026-09-14 完成组合收口。入口：[总任务书](../plan/pinax-nightly-storyforge-public-alpha-20260913.md)，[调度与启动](../plan/pinax-nightly-20260913/execution.md)，[编制证据](./nightly-20260913/planning-evidence.md)。

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| SF-PLAN | Codex + 三位只读scope reviewer | `pinax-integration-20260906` / `main@5152aad` | 核查现状并编制30主包、12储备、6项owner职责 | 计划完成；verify:full exit 0、21新增链接通过；没有启动实施worker | 上述任务书与编制证据 |
| SF-A | runtime worker + Codex integration | `night/sf-runtime-20260913` → `main` | 后果/身份/知情/实际请求与试稿来源 | 主包集成；A08 partial（12 步、2/3 试稿） | `nightly-20260913/a-runtime/a01-a08-receipt.md` |
| SF-B | public worker + Codex integration | `night/public-alpha-20260913` → `main` | Node/CI/lint/公共贡献/来源核查 | 本地工程项集成并经最终 main 干净 clone 复验；外部公开决策待用户 | `nightly-20260913/night-sf-alpha-20260913/morning-review.md` |
| SF-C | UX worker + Codex integration | `night/authoring-ux-20260913` → `main` | 首访/导入/自救/后果右栏与键盘 | 集成；A/C 接线阻断解除 | `nightly-20260913/c-ux-20260914/summary.md` |

三条夜间写锁已解除；旧 worktree/端口不再视为活跃任务。下列历史看板保留为证据。

## 2026-09-02 C2 collaboration v2 foundation

Base commit: `e8b9df1e0a6def8fc667066e181ff818a6a2c675`

| ID | Owner | Worktree / Branch | Scope | Status | Output |
|---|---|---|---|---|---|
| C2-W1 | Sol medium sub-agent | `/tmp/pinax-c2-foundation` / `feature/collaboration-v2-foundation` | C2-0/C2-1：纯协议合同、wire fixture、repository/materializer、身份/epoch/ACK/恢复/权限/配额/密文 fixture；旧 Experience compatibility；不触碰 Authoring/F3 | complete at `5f97714`; Codex matrix 28/28 + scoped lint green | `docs/agent-runs/c2-w1-foundation.summary.md` |
| C2-W2 | Sol medium sub-agents | `/tmp/pinax-c2-transport` / `feature/collaboration-v2-transport` | C2-2：transport/protocol client、WebCrypto、Web/Electron endpoint、REST/WS relay、真实邀请入口与安全生命周期；基线 `5f97714`，不触碰 Authoring/F3 | complete at `12b9596`; Codex foundation 28/28 + transport 43/43 + `verify:full` green | `docs/agent-runs/c2-w2-transport.summary.md` |
| C2-S | Sol medium read-only reviewers | `/tmp/pinax-c2-transport` | 多轮跨层安全/可靠性复审：Origin、撤销、resume、TTL、maintenance、邀请入口、heartbeat、parser scope、limiter GC 与终态 | complete; all blocker/high findings closed before freeze | findings absorbed into `06cc77b`…`12b9596` |
| C2-I | Codex | `/home/recoletas/jiuguan/text-game-framework` / `integration/consolidation-20260823` | 合并 foundation/transport，并接 C2-3 共同排演可见纵切 | code complete；`verify:full` 20/20 文件、200/200 用例与双 build/diff 全绿；等待真实双人 pilot | integration owner |
| C2-3A | Sol medium read-only reviewer | shared integration tree | 冻结 F3 intervention/rehearsal/adoption 与 C2 artifact/proposal/promotion 的唯一接缝 | complete；发现 typed locator、multi-target revision fence、promotion/generation 终态缺口 | seam findings retained by integration owner |
| C2-3B | Sol medium implementation worker | shared integration tree；仅新 collaboration authoring bridge/fixture | 实现纯 `toCollaborableArtifact()`、promotion request/receipt bridge 与 focused script，不改 Authoring UI | submitted `36912b1`；bridge 9/9，但非 manuscript evidence 使用 `sourceRef` fallback，不满足冻结条件，进入 fix-forward | `docs/agent-runs/c2-w3-authoring-bridge.summary.md` |
| C2-3D | Sol medium implementation worker | shared integration tree；collaboration shared/server/domain contracts | 扩展无损 typed evidence locator、promotion 多目标围栏、rehearsal failure 与 promotion terminal receipt；保持旧 fixture 兼容 | complete at `f06d0a2`；contract 7/7、foundation 28/28、transport 43/43 | `docs/agent-runs/c2-w3-contract-fix.summary.md` |
| C2-3E | Sol medium read-only reviewer | shared integration tree | 复审 `36912b1` 与 F3 真源的 adapter/registry/promotion owner 边界 | complete；确认 frozen scope、7 类 typed locator、existing directionId、host-only once、local original result、no early adoption | findings retained by integration owner |
| C2-3F | Sol medium implementation worker | shared integration tree；F3 artifact adapter + local host registry/bridge | 修正 `36912b1`：strict frozen scope、typed visible payload、once-only local result registry、新 promotion preflight、零 early adoption | complete at `38e6320`；14/14，原 2 blocker + 2 high 经独立复审确认关闭 | `docs/agent-runs/c2-w3-adapter-registry.summary.md` |
| C2-3G | Sol medium read-only reviewer | shared integration tree | 独立审查 `f06d0a2` 权限、状态机、replay、加密边界与 revision fence | complete；1 blocker + 4 high 经 `baa26db` 关闭，复审无新增 blocker/high | `docs/agent-runs/c2-w3-contract-audit-fix.summary.md` |
| C2-3H | Sol medium read-only reviewer | shared integration tree | 独立复审 `3e4964f` adapter/local registry 的授权、once-only、live fence 与零写入 | complete；发现 2 blocker + 2 high：intervention 未绑定、draft target 越权、reconnect identity、live reader 仅回显 mock；进入 fix-forward | findings retained by integration owner |
| C2-3I | Sol medium implementation worker | shared integration tree；WebCrypto proposal codec | 将 existing `directionId + artifactFingerprint` binding 作为 exact logical payload 加密，relay 不见明文 | complete at `19aad62`；transport 43/43，旧 wire 兼容 | commit evidence |
| C2-3J | Sol medium implementation worker | shared integration tree；artifact publish protocol | 增加 host-only 初始 artifact 发布、replay/snapshot/TTL/权限链，避免访客只能拿到 locator allowlist | complete at `d5e7175`；contract 8/8、foundation 33/33 | `docs/agent-runs/c2-w3-artifact-publish.summary.md` |
| C2-3K | Sol medium read-only reviewer | shared integration tree | 独立复审 `d5e7175` 的权限、nonce、replay、TTL 与客户端投影 | complete；2 high 经 `f338da1` 关闭，live projection blocker 经 `76cb345` 关闭并复审通过 | `docs/agent-runs/c2-w3-retention-source-fence.summary.md` |
| C2-3L | Sol medium read-only reviewer | shared integration tree | 复审 `38e6320` 的本地 source owner、跨重连 binding、live revision 与 provider 前围栏 | complete；无 blocker/high；要求 controller 接 canonical branded reader 并补真实 artifact→protocol 跨层矩阵 | findings retained by integration owner |
| C2-3N | Sol medium implementation worker | shared integration tree；仅 collaboration controller/endpoint/matrix | 实现无 UI rehearsal room controller、加密邀请/发布/提案/投票/生成/promotion 编排和真实跨层合同 | complete at `c90ad47`；room matrix 8/8，后续审查修正为 9/9 | commit evidence |
| C2-3O | Sol medium read-only reviewer | shared integration tree | 映射 Authoring 房主 inspector、访客只读页、共享 review surface 与响应式/焦点接入点 | complete；映射由 Codex 接线 | findings retained by integration owner |
| C2-3P | Sol medium read-only reviewer | shared integration tree | 审查真实 Authoring 接缝、promotion/reconcile/receipt 与邀请清理 | complete；4 high 已修，bridge 16/16、room 9/9 | findings retained by integration owner |
| C2-3Q | Sol medium read-only reviewer | shared integration tree | 审查 1440/1024/390 布局、焦点、滚动、触控、长文本与 flag 边界 | complete；原 1 blocker + 6 high 已修，最终复审 blocker/high 清零 | findings retained by integration owner |

### Write locks and merge conditions

- C2 owns only new `shared/collaboration/`, `server/realtime/v2/`, `server/repositories/collaboration/`, `src/services/collaboration/`, collaboration fixtures/smokes, and the minimum old Experience compatibility adapter.
- C2 must not modify `src/pages/Authoring.vue`, Authoring CSS/editor/Ghost/history, F3 domain objects, worldbook/history/media stores, or `docs/STATUS.md`.
- W2 starts from the reviewed W1 contract commit; W1 and W2 do not edit overlapping implementation files.
- F3-5 已释放 Authoring owner；C2-3 已进入单一 integration window。`36912b1` 作为首版 bridge 保留审计轨迹，但不得把 `sourceRef` fallback 当作稳定 locator。C2-3D 先修正协议接缝；Authoring 页面与样式仍由 Codex 独占，接缝冻结后才增加首个可见共同排演切片。

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
