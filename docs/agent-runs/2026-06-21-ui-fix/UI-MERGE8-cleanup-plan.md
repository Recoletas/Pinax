# UI-MERGE8 Cleanup Plan — Staging List for E6A + N6 Commit

> 任务：分类 worktree 里所有 E6A / N6 / 报告 / 截图 / 未落地产物，给 Codex 一份 stage / no-stage 清单 + commit message 草稿。
> 角色：UI-MERGE8 worker — 只读审查，不改代码不 stage 不 commit。
> 基线：`git log -1` = `1a92bff style(pages): refine archive workbench content states`（main HEAD == worktree HEAD）。

## ⚠️ 关键发现（影响整个 stage 决策）

### F1: 当前 worktree 的 `useCanvasBoard.js` 含 **已知 bug** — `positions.value` 在 `reactive({})` 输入下是 `undefined`，导致拖拽 drop 静默失败，slip 永远跳回默认网格位
**证据**：worktree HEAD 源码 line 62：`if (positions.value && typeof positions.value === 'object')` — Notes.vue line 496 `const pinnedSlipPositions = reactive({})`，传进 `useCanvasBoard`，`positions.value` 是 `undefined`，整个 `setPosition` 函数被跳过。
**影响**：commit 如果直接 ship，Notes pinned slips 的拖拽功能会立即 broken（不是 degrade，是完全 silent no-op）。
**已修复**：commit `1bd38ec fix(composables): useCanvasBoard supports reactive + ref positions` 在 `feat/n6f2-canvas-board-fix` branch 上，含 `isRef` 检测 + `setPosition` in-place mutation + 16 个 behavioral tests in `src/__tests__/useCanvasBoard.test.js`。
**stage 影响**：**必须先 git pull 或 cherry-pick `1bd38ec` 进 worktree**，否则本 commit 不能合 main。详见 §6 merge ordering。

### F2: `N6F2` 在用户的 brief 里被提及，但 worktree 里**没有 N6F2 产物**（无 UI-N6F2.report.md，无 useCanvasBoard.test.js）。N6F2 实际存在于 `feat/n6f2-canvas-board-fix` branch 的 commit `1bd38ec` 上（§F1 同源）。本计划按 N6F2 = branch commit 处理。

### F3: `QA8 review` 在 brief 里被提及，但 worktree 里**没有 QA8 文件**（只有 QA6 + QA7）。本计划按 QA7 = 最新 review 处理。

### F4: 同一时间有 4 个并行 worktree 在做相关 work，已知 branch：
- `feat/n6f-canvas-board-fix` (commit `a308e3a`) — N6 早期 fix（被 N6F2 取代）
- `feat/n6f2-canvas-board-fix` (commit `1bd38ec`) — N6F2 final fix（line 59-65 isRef + 16 tests）
- `feat/e6b-record-folio-hierarchy` (commit `d174a29` / `b12b692`) — E6B 完整实现（worktree 没合入）

**W5R 也在另一 worktree**（截图 + 报告 + UI-W5R-apply-or-drop.md 都提到 src 改动但 worktree HEAD 没合入）。

---

## 1. 必须 stage 的源码（4 modified + 1 untracked-add）

### 1a. E6A 相关（src/components/GamePanel.vue）
**文件**：`src/components/GamePanel.vue` — modified, +212/-190 行
**为什么 stage**：E6A record-book message stream 实现，是这次 commit 的核心。

### 1b. N6 相关（src/pages/Notes.vue）
**文件**：`src/pages/Notes.vue` — modified, +212/-2 行
**为什么 stage**：N6 pinned material slips 实现 + state refs + drag/drop handlers + persistence。

### 1c. N6 + E6A 共同样式（src/styles/themes/kao.css）
**文件**：`src/styles/themes/kao.css` — modified, +67/-2 行
**为什么 stage**：N6 的 `.pinned-slip` + dark-mode hardening + reduced-motion guard（E6A GamePanel 用 scoped CSS 不动 kao.css）。

### 1d. useCanvasBoard composable（untracked add）
**文件**：`src/composables/useCanvasBoard.js` — NEW, 170 行
**为什么 stage**：N6 拖拽逻辑的复用 composable，被 Notes.vue 引用。
**⚠️ 警告**：worktree 的版本含 F1 bug，必须先合 `1bd38ec` 或手动 apply `isRef` 修复才能 stage。

### 1e. 关键依赖关系（合并顺序，详见 §6）
**E6A commit 不能独立 ship 而不带 useCanvasBoard fix**（虽然 E6A 自身 worktree 版本已经 fix `right: 8px → 4px` + 注释去 `:global` 子串 + Notes CSS ceiling bump，但 useCanvasBoard 的 bug 仍卡 N6 functional）。**只 stage E6A + buggy useCanvasBoard = 推一个 broken N6 拖拽上 main。**

---

## 2. 必须 stage 的测试

### 2a. uiPolish.test.js 增量 contract tests
**文件**：`src/__tests__/uiPolish.test.js` — modified, +249 行
**为什么 stage**：9 个新 UI-N6 contract tests + UI-E6A hard-constraint test + ceiling bump 950→1900 + comment-rewording regression fix。
**绝对必要** — 没有这些 contract，commit 会让 N6 wiring 完全无验证。

### 2b. useCanvasBoard behavioral tests（来自 `feat/n6f2-canvas-board-fix`）
**文件**：`src/__tests__/useCanvasBoard.test.js` — NEW（在 `1bd38ec` 里，未在 worktree）
**为什么 stage**：F1 bug 的修复证据 + 16 个 functional mutation tests 覆盖 reactive/ref/setPosition/layoutItems/onBoardDrop math + onBoardDrop resets draggingId。
**⚠️ 工作树缺失此文件**。**必须在 stage 前 cherry-pick 进 worktree**。

---

## 3. 必须 stage 的 docs/screenshots

### 3a. E6A 报告 + 截图
- `docs/agent-runs/2026-06-21-ui-fix/UI-E6A.report.md` — E6A work report ✅ stage
- `docs/agent-runs/2026-06-21-ui-fix/UI-E6-implementation-plan.md` — 计划文档 ✅ stage
- `docs/agent-runs/2026-06-21-ui-fix/experience-e6a-ledger-1280.png` — 18 messages + chapter-rule ✅ stage
- `docs/agent-runs/2026-06-21-ui-fix/experience-e6a-ledger-long-1280.png` — 32 messages ✅ stage

### 3b. N6 报告 + 截图
- `docs/agent-runs/2026-06-21-ui-fix/UI-N6.report.md` — N6 work report ✅ stage
- `docs/agent-runs/2026-06-21-ui-fix/UI-N6-pinned-slips-plan.md` — N6 plan ✅ stage
- `docs/agent-runs/2026-06-21-ui-fix/UI-N6-pre-impl-check.md` — N6 pre-impl checklist ✅ stage
- `docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-light-1280.png` — 5 assets + 2 pinned slips ✅ stage
- `docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-dark-1280.png` — 真正 dark gate 生效 ✅ stage
- `docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-640.png` — 移动端 640px ✅ stage

### 3c. N6F2 报告（来自 `feat/n6f2-canvas-board-fix`，未在 worktree）
- `docs/agent-runs/2026-06-21-ui-fix/UI-N6F2.report.md` — N6F2 fix report ⚠️ worktree 缺失
- 必须在 stage 前 cherry-pick 进 worktree（与 §1d / §2b 同源）

### 3d. QA7 review（最新 review）
- `docs/agent-runs/2026-06-21-ui-fix/UI-QA7.review.md` — 最新 review（ACCEPT WITH FIXES 判定）✅ stage

---

## 4. 建议 **不要** stage 的内容

### 4a. W5R 报告 + 截图 — **src 没落地，不 stage**
- `docs/agent-runs/2026-06-21-ui-fix/UI-W5R.report.md` — W5R report ❌ 不要 stage
- `docs/agent-runs/2026-06-21-ui-fix/UI-W5R-apply-or-drop.md` — W5R 决策 doc ❌ 不要 stage
- `docs/agent-runs/2026-06-21-ui-fix/writing-w5r-1280.png` — W5R 截图 ❌ 不要 stage
- `docs/agent-runs/2026-06-21-ui-fix/writing-w5r-empty-1280.png` — W5R empty 截图 ❌ 不要 stage
**理由**：W5R src 改动（`src/pages/Writing.vue` + `src/styles/themes/kao.css` 部分）从未进入此 worktree。如果把 W5R 报告 stage 而 src 没动，等于"卖空头支票" — 报告承诺的实现 commit 里没有。**留到 W5R 真正合 main 的那次 commit 一起 stage。**

### 4b. W5 旧截图 — 已被 W5R 取代 — **不 stage**
- `docs/agent-runs/2026-06-21-ui-fix/writing-fix-1280.png` — W5 baseline ❌ 不要 stage
- `docs/agent-runs/2026-06-21-ui-fix/writing-fix-empty-1280.png` — W5 baseline empty ❌ 不要 stage
**理由**：W5 baseline 是 W5R 之前的视觉状态，commit 里没有对应的 src 改动（仅 W5 已在更早 commit `aa4a71e` ship）。这些 PNG 是"上一个状态"快照，不应作为"新 commit 的视觉证据"出现。**留到 git 历史或归档。**

### 4c. E6B plan — **src 没落地，不 stage**
- `docs/agent-runs/2026-06-21-ui-fix/UI-E6-implementation-plan.md` 含 E6A + E6B 两块，但 E6B src 在 `feat/e6b-record-folio-hierarchy` branch（未合并）。
**处理**：**UI-E6-implementation-plan.md 可以 stage**（作为 E6A 实施的参考计划，但需要在 commit message 里标注"含 E6B 未来计划"）。如果你认为混淆风险高，可以不 stage，改在 commit message 提一句。
- `docs/agent-runs/2026-06-21-ui-fix/UI-R7-visual-direction-review.md` — 整体 workbench 方向 review（含 W5R / E6A / E6B 全部 3 个），不是 E6A+N6 专属证据 ❌ 不要 stage（理由同 4a，commit 里只 ship E6A+N6，不 ship 整体方向）

### 4d. QA6 / UI-DETAIL1 / UI-N5 / UI-R5 等历史 review — **与本次 commit 无关**
- `docs/agent-runs/2026-06-21-ui-fix/UI-QA6.review.md` — 上一轮 review（QA7 已经 supersede）❌ 不要 stage
- `docs/agent-runs/2026-06-21-ui-fix/UI-SHOT6.report.md` — 截图脚本流程报告（不是 ship 资产）❌ 不要 stage
- `docs/agent-runs/2026-06-19-ui-redesign-research/UI-DETAIL1.craft-audit.md` — craft audit（research dir，不属于 ui-fix 范围）❌ 不要 stage
- `docs/agent-runs/2026-06-20-ui-e5/ui-e5-read-only-brief.md` — e5 brief（与 E6A 无关）❌ 不要 stage
- `docs/agent-runs/2026-06-20-ui-polish-p2/UI-N5-design-brief.md` — N5 brief（更早期，已 ship）❌ 不要 stage
- `docs/agent-runs/2026-06-20-ui-polish-p2/UI-R5.diagnosis.md` — R5 diagnosis ❌ 不要 stage
- `docs/agent-runs/2026-06-20-ui-polish-p2/notes-drawer-p2-*.png` — Notes drawer p2 截图（属于其他 commit，不属于本次 E6A+N6）❌ 不要 stage
**理由**：commit 形状应该清晰反映 ship 内容。stage 无关文件会让 git history 噪音 + 让 reviewer 困惑。

### 4e. R7 visual direction review — **建议不要 stage**
- `docs/agent-runs/2026-06-21-ui-fix/UI-R7-visual-direction-review.md` — 整体 workbench 视觉方向 review（含 W5R / E6A / E6B 3 块建议，但**只有 E6A 在本次 commit 实现**）
**理由**：stage R7 会让 reviewer 误以为 W5R / E6B 也 ship 了。建议 commit message 里 inline 写一句"参见 UI-R7-visual-direction-review.md"足够。

---

## 5. Env-specific scripts 检查

```
$ find docs -name "*screenshot*.mjs" -o -name "take-*.mjs" -o -name "inspect*.mjs" -o -name "shoot*.py" -o -name "shoot*.mjs"
(0 matches — clean)

$ find /tmp -name "shoot*" -o -name "seed-*.json" -o -name "*screenshot*.mjs" 2>/dev/null | head -5
(none left — SHOT6 已 cleanup)

$ grep -rE "/home/recoletas|hard-coded|env-specific" docs/agent-runs/2026-06-21-ui-fix/*.md 2>&1 | grep -vE "UI-SHOT6\.report\.md|UI-QA7\.review\.md"
(0 real leaks — only matches are inside reports documenting absence)
```

**结论**：repo tree 无 env-specific script，临时脚本已清理。可以安全 stage。

---

## 6. Merge ordering (CRITICAL — 必须先做)

**在 stage 任何文件之前**，Codex 必须先完成下面 2 个动作之一：

### 方案 A（推荐）— cherry-pick N6F2 fix
```bash
git fetch origin feat/n6f2-canvas-board-fix
git cherry-pick 1bd38ec
# Now useCanvasBoard.js 含 isRef 检测 + 16 behavioral tests
# Now useCanvasBoard.test.js 存在
# Now UI-N6F2.report.md 存在
```

**cherry-pick 内容**：
- `src/composables/useCanvasBoard.js` — modified (加 `isRef` + in-place mutation)
- `src/__tests__/useCanvasBoard.test.js` — NEW (16 behavioral tests)
- `docs/agent-runs/2026-06-21-ui-fix/UI-N6F2.report.md` — NEW (N6F2 fix report)

### 方案 B（备选）— 等 N6F2 PR 合 main
如果 `feat/n6f2-canvas-board-fix` 已经开了 PR 并 review 中，等它先合 main 然后 `git pull` 进 worktree。

### ⚠️ 不接受的路径
- ❌ 不要把 worktree 当前 buggy `useCanvasBoard.js` + 修复好的 Notes.vue 一起 ship（拖拽 broken）
- ❌ 不要 "ship E6A first, fix useCanvasBoard later"（commit 形状分离，reviewer 无法完整验收）

---

## 7. Stage 命令建议（cherry-pick N6F2 后）

### 7a. stage 源码（5 个文件）
```bash
git add \
  src/components/GamePanel.vue \
  src/pages/Notes.vue \
  src/styles/themes/kao.css \
  src/__tests__/uiPolish.test.js \
  src/composables/useCanvasBoard.js
```

### 7b. stage 新增测试（来自 cherry-pick）
```bash
git add src/__tests__/useCanvasBoard.test.js
```

### 7c. stage E6A 文档 + 截图（4 个）
```bash
git add \
  docs/agent-runs/2026-06-21-ui-fix/UI-E6A.report.md \
  docs/agent-runs/2026-06-21-ui-fix/UI-E6-implementation-plan.md \
  docs/agent-runs/2026-06-21-ui-fix/experience-e6a-ledger-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/experience-e6a-ledger-long-1280.png
```

### 7d. stage N6 文档 + 截图（6 个）
```bash
git add \
  docs/agent-runs/2026-06-21-ui-fix/UI-N6.report.md \
  docs/agent-runs/2026-06-21-ui-fix/UI-N6-pinned-slips-plan.md \
  docs/agent-runs/2026-06-21-ui-fix/UI-N6-pre-impl-check.md \
  docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-light-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-dark-1280.png \
  docs/agent-runs/2026-06-21-ui-fix/notes-n6-pinned-640.png
```

### 7e. stage N6F2 fix 报告（来自 cherry-pick，1 个）
```bash
git add docs/agent-runs/2026-06-21-ui-fix/UI-N6F2.report.md
```

### 7f. stage QA7 review（1 个）
```bash
git add docs/agent-runs/2026-06-21-ui-fix/UI-QA7.review.md
```

**总计 stage 18 个文件** (5 src + 1 test + 4 E6A docs + 6 N6 docs + 1 N6F2 doc + 1 QA7 doc)。

**不要 stage**：W5R 报告/截图 (4) + W5 旧截图 (2) + R7 review (1) + E6B plan (1, if separate from E6A) + QA6 / SHOT6 / DETAIL1 / E5 / N5 / R5 / N1 / N2 / R0 等历史 review。

---

## 8. Conventional commit message 草稿（无 Co-Authored-By）

```
style(pages): ship E6A record-book messages + N6 pinned slips + fix useCanvasBoard reactive

E6A — Experience 消息区改成 record-book 页：
- GamePanel 消息流分章节（每 8 条 chapter-rule ribbon: 卷 X · 第 Y 页）
- 每条消息 3px 左竖条（assistant 金 / user 橄榄）+ paper-strong 半透明衬底
- 硬切角 + 1px ink hairline 分隔；msg-header 改为 position: absolute top-right marginalia
  (msg-time 右上角，与页码共占)
- msg-item__folio 左上角页码（页 N/M）
- 角色 kicker "我 · / 旁白 · / 档案员 ·" 14px display block 在 body 上方
- body 16px / line-height 1.75（之前 14px / 1.65），sans 11px ink 48% for meta
- dark-mode hardening: .theme-kao.theme-dark .msg-item / .text-main 整体降亮
- reduced-motion guard: .msg-item / :hover / .chapter-rule animation: none

N6 — Notes pinned material slips：
- 新增 src/composables/useCanvasBoard.js（170 行）：ref + reactive 双模式 positions
- 新增 src/__tests__/useCanvasBoard.test.js（16 个 behavioral tests）：
  reactive/ref drop / setPosition / layoutItems / onBoardDrop math
- Notes.vue: reading-deck 接 ref="boardRef" + @dragover.prevent + @drop
- pinned-slip 模板：tab 色条 + kind 标签 + 标题 + preview + 字数 + ×unpin 按钮
- MAX_PINNED_SLIPS = 3；pinnedSlipIds ref + pinnedSlipPositions reactive({})
- localStorage 持久化到 pinax_notes_pinned_slips_v1（ids + positions）
- deck-toolbar 钉到板按钮 togglePinSlip(selectedAsset.id)
- 暗态硬化: .theme-kao.theme-dark .pinned-slip 保底可见（解决 dark void follow-up）

useCanvasBoard fix (cherry-picked from feat/n6f2-canvas-board-fix @ 1bd38ec):
- 检测 ref vs reactive via Vue isRef
- reactive 模式 in-place mutation（proxy 不暴露 .value，原 setPosition 静默 no-op）
- 显式 reset draggingId after every onBoardDrop 路径（success / no-drag / no-board / no-item）
- 暴露 setPosition 给 callers / tests

Tests:
- uiPolish.test.js +249 行: 9 个 N6 contract + UI-E6A hard-constraint
- Notes.vue scoped CSS ceiling: 950 → 1900 (容纳 structural refactor)
- useCanvasBoard.test.js: 16 个 behavioral mutation tests

Artifacts:
- 5 screenshots (E6A ledger + long, N6 light + dark + 640)
- 8 reports (E6A / N6 / N6F2 / QA7 + 4 plans)
- QA7 review ACCEPT WITH FIXES verdict

Ref:
- docs/agent-runs/2026-06-21-ui-fix/UI-QA7.review.md
- docs/agent-runs/2026-06-21-ui-fix/UI-N6F2.report.md
- docs/agent-runs/2026-06-21-ui-fix/UI-E6A.report.md

Out of scope (留到后续 commit):
- W5R (Writing 顶部薄条化) — src 没进此 worktree，截图/报告留档
- E6B (record-folio 3-tier hierarchy) — 在 feat/e6b-record-folio-hierarchy 分支，未合 main
- Notes 全面 dark-mode 覆盖（除 .pinned-slip 外其他组件）
- useCanvasBoard 之外的 behavioral test (例 Notes.vue 整体 mount test)

Co-authored-by: none
```

---

## 9. 给 Codex 的 checklist（commit 前必跑）

- [ ] `git fetch origin feat/n6f2-canvas-board-fix` 成功
- [ ] `git cherry-pick 1bd38ec` 应用成功（无 conflict）
- [ ] `git diff HEAD --name-only` 现在含 5 src + 2 test + 8 doc + 5 png = **20 文件**
- [ ] `npm run test:run -- src/__tests__/uiPolish.test.js` → 138+ pass
- [ ] `npm run test:run -- src/__tests__/useCanvasBoard.test.js` → 16 pass（来自 cherry-pick）
- [ ] `npm run test:run` → 887+ pass
- [ ] `npm run build` → clean
- [ ] `git diff --check` → clean
- [ ] `git diff --cached --check` → clean（防止 commit hook 报错）
- [ ] 检查 commit message **无** `Co-Authored-By` 行
- [ ] 检查 commit message subject ≤ 72 字符
- [ ] `git status --short` 在 commit 前应是 clean

合并后下一轮建议：
- [ ] pull `feat/e6b-record-folio-hierarchy` 单独 ship E6B
- [ ] pull `feat/n6-canvas-board-fix` (a308e3a) 或与 N6F2 一起合并（已被 N6F2 取代，可跳过）
- [ ] 决定 W5R 是否 ship（取决于 writing 页是否要重构）

---

## 10. 不做的事（per AGENTS.md / commit-conventions）

- ❌ 不 stage / 不 commit（按 task brief "不要 stage，不要 commit"）
- ❌ 不 push（让 Codex 主控推）
- ❌ 不在 commit 加 `Co-Authored-By` footer
- ❌ 不修 UI-DETAIL1 已记录但本轮未触发的 craft 缺陷（避免 scope 膨胀）
- ❌ 不把 W5R / E6B 报告 + 截图混进这次 commit（src 没落地，混进等于卖空头支票）

---

## 11. 最终 stage 清单（汇总表）

| File | 来源 | Stage? | 备注 |
|---|---|---|---|
| `src/components/GamePanel.vue` | worktree diff | ✅ | E6A |
| `src/pages/Notes.vue` | worktree diff | ✅ | N6 |
| `src/styles/themes/kao.css` | worktree diff | ✅ | N6 + E6A (N6 主) |
| `src/__tests__/uiPolish.test.js` | worktree diff | ✅ | N6 + E6A contracts |
| `src/composables/useCanvasBoard.js` | worktree diff + **cherry-pick 1bd38ec** | ✅ | **必须先合 N6F2 fix** |
| `src/__tests__/useCanvasBoard.test.js` | **cherry-pick 1bd38ec** | ✅ | N6F2 behavioral tests |
| `docs/.../UI-E6A.report.md` | worktree | ✅ | E6A work report |
| `docs/.../UI-E6-implementation-plan.md` | worktree | ✅ | E6A plan |
| `docs/.../experience-e6a-ledger-1280.png` | worktree | ✅ | E6A ledger 1280 |
| `docs/.../experience-e6a-ledger-long-1280.png` | worktree | ✅ | E6A long ledger |
| `docs/.../UI-N6.report.md` | worktree | ✅ | N6 work report |
| `docs/.../UI-N6-pinned-slips-plan.md` | worktree | ✅ | N6 plan |
| `docs/.../UI-N6-pre-impl-check.md` | worktree | ✅ | N6 pre-impl |
| `docs/.../notes-n6-pinned-light-1280.png` | worktree | ✅ | N6 light |
| `docs/.../notes-n6-pinned-dark-1280.png` | worktree | ✅ | N6 dark |
| `docs/.../notes-n6-pinned-640.png` | worktree | ✅ | N6 mobile |
| `docs/.../UI-N6F2.report.md` | **cherry-pick 1bd38ec** | ✅ | N6F2 fix report |
| `docs/.../UI-QA7.review.md` | worktree | ✅ | QA7 review |
| `docs/.../UI-W5R.report.md` | worktree | ❌ | W5R src 没落地 |
| `docs/.../UI-W5R-apply-or-drop.md` | worktree | ❌ | 同上 |
| `docs/.../writing-w5r-1280.png` | worktree | ❌ | 同上 |
| `docs/.../writing-w5r-empty-1280.png` | worktree | ❌ | 同上 |
| `docs/.../writing-fix-1280.png` | worktree | ❌ | W5 旧截图，已 superseded |
| `docs/.../writing-fix-empty-1280.png` | worktree | ❌ | 同上 |
| `docs/.../UI-R7-visual-direction-review.md` | worktree | ❌ | 含 W5R/E6B，commit 里只 ship E6A+N6 |
| `docs/.../UI-QA6.review.md` | worktree | ❌ | QA7 已 supersede |
| `docs/.../UI-SHOT6.report.md` | worktree | ❌ | 流程报告，非 ship 资产 |
| `docs/.../UI-DETAIL1.craft-audit.md` (research dir) | worktree | ❌ | research 阶段产出，不属 ui-fix |
| `docs/.../ui-e5-read-only-brief.md` | worktree | ❌ | E5 brief，E5 已 ship |
| `docs/.../UI-N5-design-brief.md` | worktree | ❌ | N5 brief，已 ship |
| `docs/.../UI-R5.diagnosis.md` | worktree | ❌ | R5 diagnosis |
| `docs/.../notes-drawer-p2-*.png` | worktree | ❌ | 属其他 commit |

**Stage 18 files**, skip 22 files. Commit message 见 §8.
