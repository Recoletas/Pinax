# 调研 + 计划 v4

v3 有错。用户找出 5 个。修了。砍掉 6 个 Phase。改成 4 个顺序小切片。先做小的。跑通再做下一个。

---

## v3 错在哪

### 错 1（高）：safeTargetLimit 设计不生效

v3 说改 `promptBuilder.buildPromptSequence`。

`promptBuilder.buildPromptSequence` 在 src/ 里 **0 个真实调用**。只有它自己第 394 行和测试文件调。

真实链路：
- `gameStore.js:1663` `generateAIResponse` 直接调 `buildWorldbookContext`
- `useCopilot.js:236` `buildCopilotMessages` 也直接调 `buildWorldbookContext`
- `generationAdventureTriggers.js:125, 248` 也直接调

改 promptBuilder 管不到。

`worldbookContextBuilder.js` 又在 do-not-touch 列表（用户规矩）。

**修法**：先把 `worldbookBudgetGuard.js` 写成纯函数 + 测试。**不接真实链路**。等用户说能动 wb.js 再接。

### 错 2（高）：并行 worktree 会撞

v3 流 A 要改 AppShell.vue 挂 DebugTriage。流 C 也要改 AppShell.vue。两个 worker 必撞。

流 B 改 worldStore.js。Phase 3、4、5 都在扩 worldStore schema。切片不清。

流 D 写 `gameStore.regenerateAsBranch()` 但又标"不碰 store"。自相矛盾。

**修法**：4 个流砍掉。只开 2 个独立 slice。剩的世界书预算另起一个顺序 slice。

### 错 3（高）：v3 自己打自己

v3 第 48 行写"不动 worldbookContextBuilder.js"。第 92 行写"`worldbookContextBuilder.js collectScanText` 接衰减"。风险项第 172 行又写"不能碰"。三处冲突。

**修法**：删衰减接 wb.js 这一段。衰减只在 `factionTopology.js` 里跑。wb.js 不动。

### 错 4（中）：promptBuilder 优先级偏高

promptBuilder 在主体验链路没接入。除自己外只有测试引用。先重构它容易做漂亮不落地。

**修法**：把 Phase 2 砍掉。或者降级为"promptBuilder 现状审计"。本期不做。

### 错 5（中）：分支基线写错

v3 写 master。AGENTS.md 写 main。当前是 main。

**修法**：改 main。

---

## 还有 4 个 v3 漏掉的真问题

1. **`useDirector.js` 整个 composable 在 src/ 0 生产调用**。只有自己的测试 import 自己。死代码。
2. **`useCopilot` 已经被 Writing.vue:711 接了**。v3 说"接 useCopilot ghost overlay"是错的。已经接。
3. **`GENERATE_FROM_ASSET` / `EXTRACT_TO_ASSET` taskType 已经在 writingAgentContext.js:501/508 实现**。v3 P0 #1 wiring 比想象中简单。Writing.vue L1078 替换 inline 计算即可。
4. **`lastContextLedger` 在 UI 0 消费**。DebugTriage 是第一个真展示它的面板。用户价值比预想高。

---

## v4 计划：4 个顺序小切片

不并行。每个跑通再做下一个。不做并行避免切片冲突。

基线分支：**main**。

---

### 切片 1A：Writing 接入

时间 `1` 天。

**两步做**。先接线。再谈素材自动创建。

**第一步：接 7 个 quick actions**。

`Writing.vue:1078-1114` 的 inline `advisorQuickActions` 替换为：

```js
import { getWritingQuickActions } from '../services/writingAgentContext'
const advisorQuickActions = computed(() => getWritingQuickActions({
  hasSelection: Boolean(String(selectedText.value || '').trim()),
  hasParagraph: getWritingParagraphSnapshot(copilotCursorPos.value).hasParagraph
}))
```

`getWritingQuickActions`（writingAgentContext.js:457）已经返回带 `taskType` 字段的 actions。`useAdvisor.askAdvisor` 已经传 `taskType` 到 `requestAdvisorTask`。链路打通。

不动 `useAdvisor.js`。不动 `useCopilot.js`。已经接好。

不动 gameStore.js。不动 wb.js。不改 generation。

**第二步：素材动作只验证 taskType 传递**。

`GENERATE_FROM_ASSET` / `EXTRACT_TO_ASSET` 走 advisor 服务。**不在 quick action wiring 这一步承诺自动创建素材**。

原因：`Writing.vue` 只把 `taskType` 传给 `requestAdvisorTask`。前端只在 `Writing.vue:1209` 当 `result.actions[]` 返回时调 `applyWritingAgentAction`。`APPLIER_ACTIONS.CREATE_ASSET` 要求 action 里有完整 `{kind, title, content}`。**这不是 quick action wiring 能承诺的**。

这一步骤只验证：
- `taskType` 字段从 quick action 传到 `requestAdvisorTask`
- advisor 服务收到 taskType 后能识别
- `result.actions[]` 是后端契约（**不属于本切片**）

素材自动创建等 advisor 服务返回 schema 决定。**单独讨论**。

测试：`npm run test:run -- src/__tests__/writingAgentContext.test.js src/__tests__/advisorResultApplier.test.js src/__tests__/writingQuickActions.test.js`（新建）。

提交：`1` squash commit。

---

### 切片 1B：DebugTriage 面板

时间 `2` 天。

放 `src/components/debug/`。跟 PerfOverlay.vue 同目录。

```vue
<!-- src/components/debug/DebugTriage.vue -->
<script setup>
import { useGameStore } from '../../stores/gameStore'
import { usePerf } from '../../composables/usePerf'
const gameStore = useGameStore()
const { latest } = usePerf()
</script>
```

`4` 个面板：
- 上次 context ledger parts
- 上次记忆召回
- 运行时事件时间线
- 生成性能（复用 usePerf()）

挂载点：`AppShell.vue` `<DebugTriage v-if="showDebugTriage" />`。

开关 `showDebugTriage`：URL `?debug=1` 临时开。或 localStorage `pinax.debugMode=true` 持久开。

`AppShell.vue` 在 do-not-touch？查 STATUS.md：
- In-flight 那条 welcome-folio refactor 写"do not touch: gameStore.js, worldbookContextBuilder.js, generation*, StatusBar.vue"
- **AppShell.vue 不在 do-not-touch**

但 W5c 报告说 AppShell.vue 改过（V3 mast stamp）。可以再改。**只允许加 1 个 `<DebugTriage>` 元素 + 1 个 ref + 1 个 v-if**。

`useDebugMode.js` 新建。30 行。读 URL query + localStorage。

不动 gameStore.js。DebugTriage 用 `useGameStore()` reactive 读。不调 action。

不动 router/index.js。

不动 `lastContextLedger` 等 reactive ref。这些是只读 state。

测试：`npm run test:run -- src/__tests__/debugTriage.test.js src/__tests__/useDebugMode.test.js`。

提交：`1` squash commit。

---

### 切片 1C：useLocalAdvisor fallback

时间 `2` 天。

**设计决定**：fallback **不是 useAdvisor 内部的事**。是**调用方传入**。

`useAdvisor` 不变胖。不 import `useApiSettings`。不读 apiSettings。

调用方（`Writing.vue:695`、 `Experience.vue:470`、 `Notes.vue:511`、 `legacy/Experience.vue:294`）在拿 advisor 时传 `hasApiKey` 或 `allowRemoteAdvisor`。

```js
// Writing.vue / Experience.vue / Notes.vue — 调用方
import { useApiSettings } from '../composables/useApiSettings'
const { apiSettings } = useApiSettings()
const hasApiKey = Boolean(apiSettings.value?.apiKey)

const { askAdvisor, ... } = useAdvisor({ hasApiKey })
// useAdvisor 内部基于 hasApiKey 决定走 generation 还是 askLocalAdvisor
```

`useAdvisor` API 变化（向后兼容）：
- `useAdvisor(options = {})` 加可选 `options.hasApiKey`
- `options.hasApiKey === false` 时，`askAdvisor` 直接走 `askLocalAdvisor`
- 不再在内部 catch 里判断 apiSettings

**新建** `src/composables/useLocalAdvisor.js`。~120 行。纯函数。

读：
- `gameStore.lastMemoryContext`（string，L525）
- `gameStore.lastMemoryRecall`（object，L528）
- `gameStore.chatHistory` 最近 `5` 条

输出：
```js
{
  advice: string,  // 启发式总结
  sources: [{kind, ref}],  // 来源
  isLocal: true   // 显式标记非 AI
}
```

不调 generation。纯前端。

UI 展示**必须带"启发式建议（无 API key）"徽章**。不伪装成 AI 输出。

调用方改 4 处：`Writing.vue:695` / `Experience.vue:470` / `Notes.vue:511` / `legacy/Experience.vue:294`。每处加 `const { apiSettings } = useApiSettings()` + `const hasApiKey = Boolean(apiSettings.value?.apiKey)` + `useAdvisor({ hasApiKey })`。

测试：
- `src/__tests__/useLocalAdvisor.test.js`（新建）
- `src/__tests__/useAdvisor.test.js` 加 `hasApiKey=false` 走 local path 的 contract
- `src/__tests__/writingLocalAdvisorFallback.test.js`（新建，写 Writing.vue 集成）

提交：`1` squash commit。

---

### 切片 1D：worldbookBudgetGuard（纯函数 + 测试）

时间 `1` 天。

新建 `src/services/worldbookBudgetGuard.js`。~80 行。

**输入契约**（写死在模块 JSDoc）：

```js
/**
 * @typedef {Object} BudgetGuardEntry
 * @property {string} id
 * @property {string} matchReason  - 'history' | 'starter' | 'constant' | 'keyword'
 * @property {string} content      - 已 trim 好的文本
 * @property {Object} [injection]
 * @property {number} [injection.budgetCap] - 0-100，占总 tokenBudget 的百分比上限
 * @property {number} [injection.depth]
 * @property {string} [type]
 * @property {string} [name]
 */

export function safeTargetLimit(matchedEntries, tokenBudget) {
  // 按 matchReason 优先级 (history → starter → constant → keyword) 分配预算
  // entry.injection.budgetCap 字段 enforce
  // 产出 {keptEntries, droppedEntries, budgetReport}
}
```

**排序优先级**（写死，**跟 wb.js L320-327 matchWorldbookEntries 排序对齐**）：
- history（最高）
- starter
- constant
- keyword（最低）

跟 wb.js 现有 `matchReason === 'history' ? -1 : ... === 'constant' ? 0 : 1` 一致。**加 starter = -0.5 在 history 和 constant 之间**。

**默认 cap**：
- history: 30% 总预算
- starter: 25%
- constant: 25%
- keyword: 20%
- entry.injection.budgetCap 覆盖默认

测试：
- `src/__tests__/worldbookBudgetGuard.test.js`（新建）覆盖：
  - 入口超过 budget 时哪些 entry 被砍（按 priority 砍，先砍 keyword）
  - `budgetCap` 字段 enforce
  - 空 entries 不 crash
  - priority 顺序对（history > starter > constant > keyword）
  - 4 种 matchReason 各覆盖一遍
  - entry.content 为空字符串时仍记录 dropped

**不接真实链路**。等用户说能动 wb.js 再做集成层（要在 wb.js:330 `buildWorldbookContext` 入口 wrap，但 wb.js 在 do-not-touch）。

不动 promptBuilder.js。改了没用。

提交：`1` squash commit。

---

### 切片 2-6 暂缓

原 Phase 2-6 不做。等切片 1A-1D 跑通 + 用户 review + STATUS.md 记录后再排。

后续候选（按价值排序）：
- 切片 2：把 worldbookBudgetGuard 接真实链路（**前提：用户批准动 wb.js**）
- 切片 3：useMem0 加 lexical fusion hook（用 useMem0.extractCharacterMemory 已有的函数）
- 切片 4：factionTopology.js + factionEdges（不动 gameStore）
- 切片 5：ApiProfileSlots 3 槽（useApiSettings.js 扩）
- 切片 6：ChatBranchPanel 真实分支 UX（涉及 gameStore，需要专门讨论）

`useDirector.js` 死代码清理。不在切片里。**单独**列出。等用户决定删还是接。

---

## 风险与对策

1. **`Writing.vue:1078-1114` 替换后某个旧 taskType 没对应 service** → 测试覆盖所有 7 个 taskType。
2. **`AppShell.vue` 加挂载元素跟 W3 V3 mast stamp 视觉冲突** → DebugTriage 默认 `v-if=false`,只在 debug 模式显。
3. **`useLocalAdvisor` 输出质量差** → 限显示"启发式建议（无 API key）"徽章。**不要伪装成 AI 建议**。
4. **`worldbookBudgetGuard` 不接 = 写了没用** → 在 STATUS.md 显式记录"待用户批准接入"。

---

## 8 个问用户（切片 1 启动前）

1. DebugTriage 入口？URL `?debug=1`？菜单开关？两个都要？
2. `useLocalAdvisor` 输出要不要带"启发式"徽章显式标记非 AI？
3. `worldbookBudgetGuard` 接入要不要这次明确批准动 `wb.js`？
4. 后续切片要不要一次性写完所有 6 个？还是跑完 1A-1D 等用户 review 再继续？
5. `useDirector.js` 死代码怎么处理？删？接？保留？
6. `MiniMax` provider id 大小写要不要改成 `minimax`？改了会破坏 localStorage。
7. 4 个切片要 squash 1 个 commit 还是每个切片 1 个 commit？
8. 切片 1 是不是只做 1A？其他切片等单独 review？

---

## 提交规矩

- 每切片 `1` squash commit。
- 不写 `Co-Authored-By` 页脚。
- 每切片 ship 前跑：
  - `npm run test:run -- <focused-files>`（切片相关的测试文件）
  - `npm run build`（构建）
  - `git diff --check`（行尾检查）
- 阶段收口（多切片一起 ship 后）跑：`npm run verify:full`。
- `STATUS.md` 加 In-flight 条目。commit 后移 Recently done。
- 分支 `main`。worktree 单独切。

---

## 报告位置

- 研究产出：`/tmp/claude-1000/.../wu1k3kkfn.output`
- 切片报告：`docs/agent-runs/2026-07-07-rpla-research/` 下新建子目录

---

## 最终判断

v3 方向对。4 个切片都能直接提高可用性。Writing 接入是最快出 demo 价值的。DebugTriage 是第一个真展示 `lastContextLedger` 的面板。`useLocalAdvisor` 让用户没 API key 也能用顾问。`worldbookBudgetGuard` 是基础设施等接入。

但 v3 想 6 个 Phase + 4 个并行 worker 是错的。切片不清。会撞。

v4 只开 4 个顺序切片。每个 1-2 天。每个独立 squash 提交。

跑完 v4 等用户 review 再开切片 2。