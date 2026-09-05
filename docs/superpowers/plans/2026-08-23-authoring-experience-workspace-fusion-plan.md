# 体验与写作工作区融合实施计划

> **For agentic workers:** 按阶段执行，每任务 TDD（先失败测试 → RED → 实现 → GREEN → 提交）。步骤用 `- [ ]` 跟踪。

**Goal:** 按 `docs/superpowers/specs/2026-08-23-authoring-experience-workspace-fusion-design.md` 把体验回合循环融入 Authoring 统一工作区：共享现场投影 + 左栏稿件/现场 + 下一拍输入 + 右侧按需详情，删除九指令横条，Experience 在等价验收前保留。

**Canonical inputs:**
- 设计真源：`docs/superpowers/specs/2026-08-23-authoring-experience-workspace-fusion-design.md`（信息架构、投影 schema、组件边界、响应式、验收标准）
- 现有运行时：`src/services/agents/authoring/authoringRuntime.js`、`narrativeSceneWorkflow.js`、`authoringTextTransaction.js`、`useAuthoringTask.js`（fingerprint revision 事务）、`src/services/agents/observers/*`
- 页面现状：`Authoring.vue` 左栏 `wall__shelf`（books.slice(0,4) :94、chapters.slice(0,6) :109、装饰稿纸卷 :160-163）、右栏 `writing-inspector`（inspectorTab 'comments'/'version' :1142）、九指令 `AuthoringCommandBar.vue`
- 状态源：gameStore（encounteredCharacters/factionRelations/goals/keyChoices/worldMapState.currentScene/activities/memories/writingCharacters）、worldStore.activeWorldbook、观察器派生结果

## Worktree 与隔离策略

- 主工作树存在未提交 WIP（测试精简、摄取内核、写作 UI 字体），**不得触碰或提交**。
- 每个 Phase 在独立 worktree 从集成分支 HEAD 新建分支：
  - Phase 1: `feature/unified-authoring-fusion-p1`（`src/pages/Authoring.vue`、`src/components/authoring/**`、新服务文件、对应测试）
  - Phase 2: 基于 P1 合并后 HEAD 建 `feature/unified-authoring-fusion-p2`
  - Phase 3/4 同理递进。
- 共享冻结目录（`shared/agentCapabilityContract.js`）不改；如需目录修订向集成 owner 申请。
- `docs/STATUS.md` 仅集成 owner 在合并时更新。

---

## Phase 1：结构与单一投影（不改生成链）

### Task 1.1 共享现场投影 `authoringSceneProjection.js`

Files: Create `src/services/agents/authoring/authoringSceneProjection.js`、Create `src/__tests__/authoringSceneProjection.test.js`

- [x] RED：契约测试锁定 spec §10 schema——`schemaVersion/projectId/chapterId/revision/viewpointCharacter/activeActor/dialogueTarget/location/time/presentCharacters/activeRelations/unresolvedEvents/emergenceCandidates/unreadChanges/sourceRefs`；断言：(a) 无依据人物不得出现在 presentCharacters；(b) 无法确定视角/地点时字段为 null 且 UI 层显示"未指定"，投影本身不猜名字；(c) 实体一律稳定 ID；(d) 投影可从相同输入确定性重建（纯函数、无 DOM、无持久化）。
- [x] GREEN：`buildAuthoringSceneProjection({ chapter, documentRevision, runtimeState, worldbook, observerState, outlineItems })` 纯函数实现。来源映射：runtimeState=gameStore 运行时快照（encounteredCharacters→present 候选须有 evidence 标记）、worldMapState.currentScene→location、观察器派生 relations/events→activeRelations/unresolvedEvents、emergenceCandidates 来自现有 emergence store。输入缺失字段安全降级为 null/[]。
- [x] Commit: `feat(authoring): build shared scene projection`

### Task 1.2 左栏稿件导航完整化

Files: Modify `src/pages/Authoring.vue`（:92-165 区域及样式在 Writing.scoped.css）

- [x] RED：UI 契约测试断言——左栏渲染全部书籍与当前书全部章节（无 `slice(0, 4)`/`slice(0, 6)`）；非当前书折叠为单行可展开；章节列表在稿件区内滚动（grid 两行 `minmax(180px,1fr) auto`）；`.wall__shelf-roll` 装饰不存在；切换章节后现场区仍可见。
- [x] GREEN：移除两个 slice 与装饰卷；书籍默认只展开当前项；滚动容器限高。
- [x] Commit: `refactor(authoring): show full manuscript navigation`

### Task 1.3 本章现场条 `AuthoringSceneRail.vue`

Files: Create `src/components/authoring/AuthoringSceneRail.vue`、Modify `Authoring.vue`（挂载于左栏下部 auto 行）

- [x] RED：组件契约测试——props 只接收 projection（+unreadCounts）；渲染地点·时间一行、视角/行动者/对象/在场各一条带文字状态标签（不只靠颜色）、一条最高优先级未决事件、未读 `+N`；emit `select-actor/select-target/open-detail(kind,id)/advance-with(eventId)`；空数据显示"未指定"；语义列表+button，无仅 click div。
- [x] GREEN：纯展示组件，不直接读写完整实体；样式复用左栏档案索引文字层级与短色条 token。
- [x] Commit: `feat(authoring): add scene rail summary`

### Task 1.4 右侧临时详情 `AuthoringInspectorDetail.vue`

Files: Create `src/components/authoring/AuthoringInspectorDetail.vue`、Modify `Authoring.vue`（inspectorTab 状态扩为 `{ baseView, detail, returnFocusRef }`）

- [x] RED：交互契约测试——默认 baseView='comments' 不变；点击左栏人物/地点/时间/事件条目 → 右侧原位切详情（无新 tab 排、无抽屉/modal）；详情含"← 返回批注"，关闭后恢复 baseView、滚动位置与左侧焦点；点另一条目原位替换；详情内容按 spec §7.3 最小集（人物：目标/心境/本场身份/1-3 条关系/最近行动/口吻依据 + 设为行动者/打开完整设定；地点/时间/事件同理）；详情对象失效自动回批注并提示一次。
- [x] GREEN：详情数据从同一 projection + worldbook 读取；生成/派生不自动抢占右侧。
- [x] Commit: `feat(authoring): add on-demand inspector details`

### Task 1.5 Phase 1 门禁

- [x] focused 测试 + `npm run verify:full` exit 0（vitest 36 files / 570 tests passed；vite build ✓；git diff --check ✓；vitepress build ✓）
- [x] audit fixture：ui-audit 增加 authoring 路由 scene-rail/detail 状态（deterministic 部分）——`scene-rail` 断言现场条常显且带「本章现场」摘要；`detail` 断言无运行时证据时检查器不被抢占、保持批注视图
- [ ] 外部门禁记录：1440/900/390 截图审计需用户 dev server（待用户执行 `UI_AUDIT_ROUTES=authoring UI_AUDIT_STATES=scene-rail,detail npm run ui:audit` 类审计；另：Authoring 页面当前不加载体验会话运行时快照，现场条在有会话数据前以「未指定」呈现，交互式 rail→detail 截图需先经 Experience 建立会话或等 Phase 2 接入生成链）
- [x] 合并前自审 diff；Commit(handoff): `docs(authoring): record fusion phase 1 gates`

## Phase 2：下一拍输入与正文事务

### Task 2.1 回合意图契约 `authoringTurnContract.js`

Files: Create contract + test

- [x] RED/GREEN：四种类型 `action|dialogue|thought|scene` 的请求 shape：`{ kind, actorId?, targetId?(对话必填), instruction, directorNote?, sourceRefs }`；校验规则按 spec §6.2/§16（对话缺说话人或对象→typed invalid；心理限定视角可知；用户控制文本标记为 control-intent 不入正文）。Commit: `feat(authoring): define turn intent contract`

### Task 2.2 `AuthoringTurnComposer.vue`

Files: Create component、Modify `Authoring.vue`（编辑器下方挂载，同宽；editor-toolbar 最多加一个 tool-btn 风格"推进"锚点）

- [x] RED：契约测试——类型选择用文本+下划线（无 pill）；常显一两行精简态；主按钮三态（空输入"继续下一拍"/非空"按此推进"/生成中"停止"）；失败保留输入+行动者+对象+导演注并提供重试；更多菜单收纳导演注/半自动/参考摘要/下一步方向/对话说法；半自动上限三拍且用户输入等条件暂停；a11y（segmented 键盘操作、live status）。
- [x] GREEN：发出标准 turn request，不拼 prompt。Commit: `feat(authoring): add turn composer`

### Task 2.3 运行时接入与正文事务

Files: Modify `narrativeSceneWorkflow.js`（接受 turn intent 映射 NarrativeKernel intentMode）、`Authoring.vue` 执行链

- [x] RED：集成测试——composer 请求 → authoringRuntime 链 → NarrativeKernel 生成 → stale 检查（复用 fingerprint revision）→ 原子插入一个新 writingUnit → 瞬时来源+请求级撤销 → 观察器调度一次；控制文本不出现在正文；请求期间文档变化→丢弃结果不写入。
- [x] GREEN：接线为主，NarrativeKernel 与事务层已有能力不重写。Commit: `feat(authoring): execute turns through narrative kernel`

## Phase 3：体验等价能力（任务清单）

1. 下一步方向候选：空输入请求 2-4 条 → 输入区上方短列表（填入/按此推进/加入纲要/忽略）；复用 authoringAuxiliaryWorkflow。
2. 对话说法：仅对话模式，带说话人/对象，填入输入框不写正文。
3. 导演注：更多菜单内一次性注入本轮。
4. 有界半自动：最多连续三拍，暂停条件按 spec §6.4。
5. 涌现候选：左栏 `+N` → 点击右侧详情审阅（确认/忽略/加入纲要/打开来源），不自动成事实。
6. 旧体验会话导入验证：authoringSessionProjection 幂等 + 来源回跳回归测试。

## Phase 4：清理与退役门禁（任务清单）

1. 删除 `AuthoringCommandBar.vue` 及九 pill CSS；局部编辑入口归位（改写选区→批注改写 owner、插入→编辑器既有流程）。
2. 响应式与 Zen 审计：1440 / 900 / 390 / Zen 四档，横向溢出 0、焦点恢复正确（spec §14/§15/§19.14-18）。
3. recovery smoke + production dry-run + 真实 provider 矩阵（外部门禁）。

### Experience 等价矩阵（验收前必须逐行勾掉）

| Experience 能力 | 新归属 | 验证方式 |
|---|---|---|
| 自由行动/对白输入 | Composer | 集成测试 + 手工 |
| 继续 | 空输入主动作 | 同上 |
| 场景/心理 | 输入类型 | 同上 |
| 对话角色选择 | 左栏人物+说话人/对象 | UI 契约测试 |
| 导演注 | 更多菜单 | 契约测试 |
| 半自动 | 更多菜单（三拍上限） | ✅ 契约测试 + 真实机制暂停信号 |
| 下一步选项 | 输入辅助候选 | 集成测试 |
| 对话选项 | 对话模式辅助 | 集成测试 |
| 人物/地点/时间/事件索引 | 左栏摘要+右栏详情 | 组件契约 |
| 涌现 | 左栏计数+右侧审阅 | 契约测试 |
| 速记/素材收集 | 既有批注/收为素材 | 回归 |
| 分支/版本 | 写作版本快照 | 回归 |
| 导出 | 书籍/章节正文导出 | ✅ schema-v3 正文回归（分镜导出独立保留） |
| Prompt 详情 | Context Inspector | 既有 |

### 退役审批门禁

- 上表全勾 + 四档审计通过 + recovery/provider 验收 + **用户书面复验同意**后，才单独提案退役 `/experience`；本计划不执行退役。

### 2026-08-23 等价缺口收口

- 下一拍在进入 NarrativeKernel 前自动构造有界章节上下文：短稿保留原文消息，超过 6000 字时只传最近四段，并以不落正文真源的派生 `sceneSummary` 压缩旧段落；本轮显式指令作为最后一条 user message，turn block 同时携带类型/行动者/对象。
- 半自动现在消费本拍正文检测、canonical `activeMechanism/mechanismContext` 与本拍新增 runtime events；机制触发会暂停后续拍，但不会自动打开面板。
- “更多”菜单提供当前章节与整本书 Markdown 正文导出，直接读取 schema-v3 canonical 文档；原章节分镜导出仍是独立动作。

## 明确不做（继承 spec §18）

不扩展左栏为世界书编辑器；不加右侧常驻四 tab；不存第二份 transcript；不让模型自选身份不明说话人；不让涌现自动成为事实；不加无限续写；不重设计主题；不复用体验页大型组件壳（只提取 selector/adapter）。
