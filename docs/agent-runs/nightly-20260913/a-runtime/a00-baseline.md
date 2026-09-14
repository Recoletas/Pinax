# A 线回执 · A00 基线反例与生产协议清点

基线：`main@5152aad`，worktree `/home/recoletas/jiuguan/pinax-night-sf-a-20260913`，branch `night/sf-runtime-20260913`。
状态：**complete（含 3 项复现）**。无源代码必要改动，进入 A01。

## 真实链路（已逐一读取）

`Authoring.vue` → `useAuthoringRehearsal.js`（route/steps/advance ticket）→ `authoringRehearsal.js requestRehearsalStep`（buildAuthoringSceneDirectionEnvelope + 姓名 action 校验）→ `src/services/advisorTaskService.js requestAdvisorTask`（POST /advisor/task）→ `server/routes/advisor.js` → `advisorAgentRunner` → `textModelAgentProvider`（rehearsal max_tokens=1200）→ `openclawService` 输出模板 → 服务端 `buildAdvisorResult` 归一化 → 客户端 `parseRehearsalResponse`。

## 字段在哪里会被剥除（复现通过）

1. **服务端** `server/services/advisorTaskService.js:173-178`：rehearsal 分支只保留 `response/change/choices/evidenceRefs`，模型返回的 `consequences` 被丢弃。
2. **客户端** `authoringRehearsal.js parseRehearsalResponse`（第 8-14 行）：同样只回四字段，且 evidenceRefs 白名单是 envelope 的 sourceRefs（worldbook refs），不含人物 ref。
3. 上限三件套现状：max_tokens=1200（`textModelAgentProvider.js:81`，重试 +600）；`maxOutputChars:1800` 由客户端传入但**服务端无消费者**；整份 JSON 无序列化上限检查。

## 三种人物情形（复现通过）

`pressureProjection.participants` 已带稳定 `ref`（`worldbook-entry:<id>` / `scene-character:<id>`）与 roles（present/planned/viewpoint/active-actor/dialogue-target）。现状：

- `rehearsalParticipants` 不过滤 planned；**只在计划中未入场的人物进入 cast 与 responders**，获得当前台词权。
- 行动者/对象按**姓名**匹配（`participantNames.has(intent.actor)`）；同名两位“老周”无法区分，取集合存在即通过。
- 无稳定 ref 的人物无法作为后果主语（后果链路尚不存在，本包证实 ref 数据已可用）。

## createRoute 浅复制与 Ghost 异步读 steps 时点

- `useAuthoringRehearsal.js:36`：`steps: items.map(item => ({ ...item }))` 浅复制——fork 后 `evidenceRefs`/`choices`/未来 `consequences` 数组跨路共享，复现写 B 污染 A。
- `Authoring.vue writeRehearsalDraft`：`await rehearsal.check()` 之后才读 `rehearsal.steps.value` 拼 instruction，且 `route` 与 steps 读取之间存在异步窗口（busy=false 期间可切路）——A06 需要 `buildRehearsalDraftSource` 冻结快照修复。
- 迟到结果防护已存在：advance 的 `ticket/version` + `routes.find(routeId)` 丢失即丢弃；此部分 verified-existing。

## 首版 DTO（交 C/O，冻结文本见 contract-proposal-a.md）

- 后果段：`{ kind:'knowledge'|'commitment', version:1, ... }`，每步 ≤2 条；`source.kind` ∈ action/response，quote 必须在请求时捕获原文中逐字存在（服务端经 `options.rehearsalVerification` 强校验，prompt 序列化处剥离）。
- 知情：`{ knowerRef, factKey, state:'learned' }`，factKey 只能来自本次冻结条件或本路已学得；承诺：`{ promisorRef, beneficiaryRef?, commitmentKey?, state:'promised'|'conditioned'|'refused'|'withdrawn', content, condition? }`，key 由应用分配/校验，模型只能回显。
- 读模型：`routeId / stateFingerprint / consequences / consequenceIssues / status`；对照 `differences[]` 按 factKey+knowerRef 与 commitment issueKey 匹配。

## 复现证据

`src/__tests__/tmp-a00-repro.test.js`（3/3 通过，已在取证后删除）：planned+同名进入 responders、服务端剥除 consequences、fork 浅复制污染。
