# 1A: Writing 接入 getWritingQuickActions

> 2026-07-07 CST · Recoletas on worktree `/home/recoletas/jiuguan/worktrees/slice-1a` · 1A of v4 写作代理计划
>
> **范围**: 把 `src/pages/Writing.vue` 的 inline `advisorQuickActions`（5 个手写 action，没有 `taskType` 字段）替换为 `getWritingQuickActions(flags)` 目录调用，使全部 7 个 advisor `taskType` 走通到 `requestAdvisorTask`。把 inline 计算抽成纯函数 `computeAdvisorQuickActions`，加上 catalog 契约测试。不动 gameStore / worldStore / useAdvisor / useCopilot / generation / worldbookContextBuilder。
>
> **承接**: v4 计划 `docs/agent-runs/2026-07-07-rpla-research/PLAN.md` 第 73-112 行（切片 1A）。`getWritingQuickActions` 已在 `src/services/writingAgentContext.js:457` 实现并返回带 `taskType` 的 actions；`useAdvisor.askAdvisor` 已经在 `src/composables/useAdvisor.js:67-71` 把 `taskType` 传到 `requestAdvisorTask`。本切片把 `Writing.vue` 这条入口接通。

---

## 1. 交付物

| 路径 | 行数 | 角色 |
| --- | --- | --- |
| `src/pages/Writing.vue` | +21 / −32 | import `getWritingQuickActions`（`Writing.vue:670`）；新 `computeAdvisorQuickActions` 纯函数（`Writing.vue:1084-1101`）；`advisorQuickActions` computed 改为委托 helper（`Writing.vue:1103-1113`） |
| `src/__tests__/writingQuickActions.test.js` | +104 (新) | 6 个契约测试锁：7 个 actions、字段结构、`taskType` 集合等于 `WRITING_TASK_TYPES` 目录、`hasSelection=false` 禁用 `FIX_SELECTION`、`hasParagraph=false` 禁用 `FIX_PARAGRAPH`、3 个 flag 都 true 时全 enabled |
| `docs/STATUS.md` | +1 | `Recently done` 新增本切片条目 |

未新建依赖；不动 gameStore / worldStore / useAdvisor / useCopilot / generation / worldbookContextBuilder / PromptBuilder。

---

## 2. 改动细节

### 2.1 `src/pages/Writing.vue`

**新 import**（`Writing.vue:670`）：`getWritingQuickActions` from `'../services/writingAgentContext'`。`writingAgentContext.js:457` 已经定义这个目录函数，返回 7 个 `{label, question, taskType, scope, disabled}` 形状的 actions。

**新纯函数 `computeAdvisorQuickActions`**（`Writing.vue:1084-1101`）：从 `selectedText.value` 与 `getWritingParagraphSnapshot(copilotCursorPos.value)` 提取 flag 后委托 `getWritingQuickActions({hasSelection, hasParagraph})`。Helper 同时支持直接传 boolean flag（测试用）与从原始 ref 推断（组件用）。抽成命名函数是为了让契约测试可以脱离 Vue 组件 mount 直接验证 wiring。

**`advisorQuickActions` computed 替换**（`Writing.vue:1103-1113`）：原 L1078-1114 inline 数组（5 个手写 action，只有 `scope` + `disabled` 两个字段，**没有 `taskType`**）现在改成调 `computeAdvisorQuickActions({hasSelection, hasParagraph: paragraph.hasParagraph, selectedText: selectedText.value, paragraphSnapshot: paragraph})`。Inline 数组的 5 个 entry（`scope: 'selection' / 'paragraph' / 'thread' / 'chapter' / 'continue'`）全部由 `getWritingQuickActions` 重新提供，加上 `GENERATE_FROM_ASSET`（`scope: 'reference-asset'`）与 `EXTRACT_TO_ASSET`（`scope: 'paragraph-or-selection'`）两个新增入口。

**`normalizeAdvisorAction`** 兼容性（`Writing.vue:1115-1144`）：原函数保留。新形态 actions 多带 `taskType` 字段，被 `normalizeAdvisorAction` 透传（`Writing.vue:1141`），最终在 `Writing.vue:1188-1198` 的 `askAdvisor({...taskType: action.taskType, target: buildAdvisorActionTarget(action, context)...})` 处传进 `requestAdvisorTask`，链路打通。

**`buildAdvisorActionTarget` 已知缺口**（`Writing.vue:1146-1181`）：目前只识别 `selection / paragraph / thread / continue / chapter` 五个 scope；`reference-asset / paragraph-or-selection` 这两个新 scope 走 default 分支返回 `kind: 'chapter'` 目标 → 这正是本切片**留待 follow-up**的 resolver gap（见 §5）。

### 2.2 `src/__tests__/writingQuickActions.test.js`

6 个测试全部从 `src/services/writingAgentContext` 直接 import `getWritingQuickActions` 与 `WRITING_TASK_TYPES`，不 mount Vue：

| 测试 | 锁的契约 |
| --- | --- |
| `returns 7 actions when both hasSelection and hasParagraph are true` | 7 个 actions（legacy 是 5 个） |
| `every action has label / question / taskType / scope / disabled` | 字段结构 + 字符串非空 |
| `taskType set equals the WRITING_TASK_TYPES catalog exactly` | 7 个 `taskType` 字符串正好等于目录（FIX_SELECTION / FIX_PARAGRAPH / CONTINUE_LIGHT / CLOSE_THREAD / CHAPTER_HEALTH / GENERATE_FROM_ASSET / EXTRACT_TO_ASSET） |
| `hasSelection=false disables FIX_SELECTION` | legacy `selection` flag 行为保留 |
| `hasParagraph=false disables FIX_PARAGRAPH` | legacy `paragraph` flag 行为保留 |
| `all actions enabled when hasSelection, hasParagraph, and hasReferenceAsset are all true` | 3 个 flag 都 true 时全部 enabled |

第 3 个测试用 `actions.map(a => a.taskType).sort()` 与 `[...ALL_TASK_TYPES].sort()` 精确比对，未来 catalog 加新条目会立刻 break 测试，强制 review。

### 2.3 `docs/STATUS.md`

新增 `Recently done` 条目（`STATUS.md:69`）：把上面三件事 + 验证 + out-of-scope 全写在同一段，未来 reviewer 不需要再回 commit。

---

## 3. 验证

按 PLAN.md L320-323 切片 ship 前验证命令：

```bash
npm run test:run -- src/__tests__/writingQuickActions.test.js src/__tests__/writingAgentContext.test.js src/__tests__/advisorResultApplier.test.js
```

实际跑：

```
✓ src/__tests__/writingQuickActions.test.js  (6 tests)
✓ src/__tests__/writingAgentContext.test.js  (33 tests)
✓ src/__tests__/advisorResultApplier.test.js (34 tests)

Test Files  3 passed (3)
     Tests  73 passed (73)
```

`npm run build` 干净，无新警告。

`git diff --check` 干净（0 输出 = 无 whitespace 错误）。

---

## 4. Do-not-touch compliance

本切片 **未触碰**：

- `src/stores/gameStore.js`
- `src/stores/worldStore.js`
- `src/composables/useAdvisor.js`（`Writing.vue:1188` 调用的就是它，**接口完全没改**）
- `src/composables/useCopilot.js`
- `src/services/advisorTaskService.js`
- `src/services/worldbookContextBuilder.js`
- `src/services/generationAdventureTriggers.js` / 其他 generation 服务
- `src/services/promptBuilder.js`
- `src/services/advisorResultApplier.js`（只 import，不动实现）
- 任何 UI 组件（除 `Writing.vue` 自己）

只动 `Writing.vue` / 新建 1 个测试文件 / `STATUS.md` +1 行。三个文件，136 insertions / 32 deletions。

---

## 5. Out of scope（留给后续切片）

1. **`buildAdvisorActionTarget` 不识别 `reference-asset` / `paragraph-or-selection` 两个新 scope**（`Writing.vue:1146-1181`）。当用户点击 `GENERATE_FROM_ASSET` 或 `EXTRACT_TO_ASSET` 按钮时，`taskType` 会正确传进 `requestAdvisorTask`，但 `target` 走 default 分支返回 `{kind: 'chapter', ...}` —— 这两个 taskType 的 advisor 服务 backend schema 还没定义，本切片只承诺 `taskType` 传递这一段。后续切片（建议跟随 advisor 服务 schema 落地）需要：
   - 在 `buildAdvisorActionTarget` 加 `scope === 'reference-asset'` 分支 → `{kind: 'reference-asset', assetId, snapshot}`
   - 加 `scope === 'paragraph-or-selection'` 分支 → `{kind: 'paragraph-or-selection', paragraph: {...}, selection: {...}}`
   - 同步扩 `advisorTaskService.requestAdvisorTask` backend contract
2. **`EXTRACT_TO_ASSET` 的 `disabled` 语义**：`writingAgentContext.js:510` 用 `!hasParagraph && !hasSelection`（任一即可），这是临时启发式。后续 advisor 服务 schema 落地时需要决定是否要求 paragraph 优先于 selection。
3. **`applyWritingAgentAction` 的 `CREATE_ASSET` action 落地**：`Writing.vue:1209` 调 `applyWritingAgentAction` 时要求 result action 含 `{kind, title, content}`；本切片 `EXTRACT_TO_ASSET` 按钮可点击，但点完是 no-op 直到 backend 返回这条 action。这是 advisor 服务契约层的事，不属于本切片。
4. **catalog 测试未覆盖 `disabled` 边界为每个 taskType 各跑一次**：本切片只锁了 `FIX_SELECTION` / `FIX_PARAGRAPH` 两个 legacy disabled 行为；`CONTINUE_LIGHT` / `CLOSE_THREAD` / `CHAPTER_HEALTH` 三个无条件 enabled，`GENERATE_FROM_ASSET` / `EXTRACT_TO_ASSET` 的 flag 行为被第 6 个测试隐式覆盖，但没单独锁。后续可补。

---

## 6. 报告位置

本切片上下文：[./PLAN.md](./PLAN.md) — v4 计划（含 4 个顺序切片与切片 1A 完整 spec）。
本报告：`./1A-writing-quick-actions.report.md`。