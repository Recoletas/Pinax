# UI-E11-PLAN-QA Review

- **Author**: Claude Code (UI-E11-PLAN-QA window, 2026-06-23)
- **Role**: 只读 / 不改 src / 不改 plan / 只落档本 review
- **Reviewed**: `docs/superpowers/plans/2026-06-22-experience-workstation.md` (1300 行, 11 Task, 4 Window)
- **Spec ref**: `docs/superpowers/specs/2026-06-22-experience-workstation-redesign.md` (301 行, Draft / 方案)
- **Base**: `main` 已 ship E10-CLEAN (`9633168` / `c2754f7` / `03f4c94` 等), axis + indicator 已删, `--font-body` 已 ship

---

## 0. 一句话验收

**ACCEPT WITH FIXES** — 架构 + TDD 顺序 + worker split + screenshot gate 全部合格; 但 Task 5 Step 9 / Task 8 等 5 处实施细节有 worker 误伤风险, 实施前需补 explicit guidance. 5 项 fix 全部针对实施细节, 不改 plan 架构, 补完后无需重审 plan.

---

## 1. 8 项验收清单逐条

### ✅ Q1: plan 严格按 spec 方案 B?

**PASS**. Plan §Architecture 完全照搬 spec §B 4 段 composition:
- viewport 比例 18:54:28 ✓
- topstrip 80px sticky ✓
- 4 段 grid `260px 1fr 300px` ✓ (Task 2 + 4 + 5 全链路)
- `@media (max-width: 1280px)` 改 `220px 1fr 280px` ✓
- `@media (max-width: 980px)` 改 `1fr` 折叠 ✓
- left rail / center stage / right rail 命名跟 spec 一致 ✓
- useWorkstationMeta composable 是 single source of truth (spec §A useWorkstationMeta) ✓
- 4 层字体分层 (DISPLAY/BODY/META/INTERACTIVE) 跟 spec §D 一致 ✓
- E9-FIX mechanism-trigger click 保留 (Task 6 G1 contract) ✓

**Plan 没有讨论方案 A** (符合用户要求 "按 spec 推荐方案 B 执行, 不再讨论方案 A"). ✓

---

### ✅ Q2: 是否仍然试图保留 record-folio 6-cell 空表单?

**PASS — 明确删除, 0 保留**. 3 重保险:

1. **Task 5 Step 2**: "删 `<section class="record-folio" aria-label="案卷记录本">` 整块 (L13-45), 替换为 `<section class="ws-topstrip">`"
2. **Task 5 Step 8**: "删 6 个 record-folio computeds (`recordCaseNo` / `recordVolume` / `recordTime` / `recordCharacters` / `recordLocation` / `recordObjective`) 整段 (L349-403)"
3. **Task 5 Step 9**: "scoped CSS 删 `.record-folio` / `.record-folio__*` 全部规则"
4. **Task 9 Step 1-2**: 删 kao.css 内 `.theme-kao .game-page .sidebar` L1976-2108 (这条覆盖 sidebar, record-folio 在 E10-CLEAN 已删)
5. **E11-E1 contract**: `expect(exp).not.toMatch(/class="record-folio"/)` + `expect(kao).not.toMatch(/\.theme-kao\s+\.record-folio/)`

**无任何 task 提到"保留 record-folio 6-cell"**. ✓

---

### ✅ Q3: 是否加回 axis / scene-stage__indicator?

**PASS — 0 加回**. 验证:

- **Task 0 Step 1-2** baseline check:
  ```
  grep -nE "game-page::before" src/styles/themes/kao.css → 0 match
  grep -nE "scene-stage__indicator" src/styles/themes/kao.css → 0 match
  ```
- **Plan 全文搜索**: 0 处提到"加回 axis / indicator". 所有 axis / indicator 引用都在 deletion context.
- **Plan 引入 ws-* layout 替代 axis**, 是 spec §4.6 functional anchor 路线, 不是装饰线.

**不会加回**. ✓

---

### ✅ Q4: 是否越界改 store / services / router?

**PASS — 0 mutation, 0 service 改, 0 router 改**. 验证:

- **Task 3 Step 1** `useWorkstationMeta.js` 全文: 0 个 `gameStore.<method> =` 赋值, 全部 `computed()` 派生 read.
- **Hard rule** 多处明示:
  - "0 store / 0 service / 0 router mutation (per E10 hard rules)"
  - "UseWorkstationMeta composable 是 single source of truth, topstrip 持有 state, 3 段 reactivity 读"
  - "禁止改 src/stores/** / src/services/** / src/router/**"
- **E11-F1 contract**: "0 store mutation" 锁
- **Task 10 Step 5** forbidden sweep: `git diff HEAD` grep `gameStore.\w+ =` 应 0 match.

**无 store / service / router 改动**. ✓

---

### ✅ Q5: 是否有 TDD 顺序?

**PASS — 11 Task 严格 TDD**:

| Phase | Task | 顺序 |
|---|---|---|
| **Pre-flight** | T0 | baseline read |
| **Red phase** | T1 | 13 contracts 全 fail (红) |
| **Green phase** | T2-T9 | 逐 contract green |
| **Ship gate** | T10 | build + diff + sweep |
| **Visual gate** | T11 | 3 screenshots |

每个 green task 内部顺序 (典型 5 步):
1. 写 CSS / composable / template
2. 跑对应 E11-A*/B*/C*/D*/E*/F* contract
3. 验证 green
4. 跑既有 contracts 验无 0 误伤
5. (跨 task 后) 跑 focused + 全量 test suite

TDD 顺序符合用户要求: contracts → composable → layout → hero → right rail → delete → screenshots. ✓

---

### ✅ Q6: 是否有 screenshot gate?

**PASS — 3 张必跑 + 临时脚本跑完即删**:

- **Task 11 Step 4**: 跑 `/tmp/e11-take-screenshots.py`
- **3 张路径明确** (用户要求):
  - `docs/agent-runs/2026-06-22-ui-e11/experience-e11-1280.png` ✓
  - `docs/agent-runs/2026-06-22-ui-e11/experience-e11-long-1280.png` ✓
  - `docs/agent-runs/2026-06-22-ui-e11/experience-e11-640.png` ✓
- **临时脚本 `/tmp/e11-take-screenshots.py`** 跑完 `rm -f` (Step 6 明确删), 不 ship 到 repo (per AGENTS.md hard rule #11 + E9 §4.4)
- **视觉验收 7 步** (Step 7): 4 段 workstation 一屏可见 + hero narrator + topstrip 进度条 + right rail dossier + 1280×2200 scroll + 640 mobile collapse
- **UI-E11.report.md 落档** (Step 8)

**3 张 screenshot + 临时脚本规范 + 视觉验收清单 + report 落档 全部就位**. ✓

---

### ✅ Q7: 是否有 clear worker split?

**PASS — 4 Window (3 impl + 1 QA), disjoint write sets**:

| Window | Owner | Scope | Do not touch |
|---|---|---|---|
| **W1 Foundation** | Claude / UI-E11-IMPL-A | T0-T3: read baseline + 13 contracts + kao.css ws-* + useWorkstationMeta | Experience.vue / GamePanel.vue / right rail 组件 |
| **W2 Composition** | Claude / UI-E11-IMPL-B | T4-T7: kao.css topstrip + Experience.vue + GamePanel hero + right rail sections | useWorkstationMeta (W1) |
| **W3 Cleanup** | Claude / UI-E11-IMPL-C | T8-T10: 4-layer font rules + 删旧 sidebar 段 + build/diff/sweep | useWorkstationMeta (W1) + Experience.vue + GamePanel.vue + right rail (W2) |
| **W4 QA** | **Codex orchestrator (NOT Claude subagent)** | T11: 3 screenshots + visual review + report | — |

- **集成顺序**: W1 → W2 → W3 → W4, Codex 串行 merge
- **Risk 预案**: 任意 Window contract fail → 返工该 window, 不串到下一个
- **Revert 路径**: ship commit 注明「revert via git revert E11」

**3 impl + 1 QA, worktree 隔离, 任务边界清晰**. ✓

---

### ✅ Q8: 是否能在当前 main 上执行?

**PASS — main 已 ship E10-CLEAN, baseline 就位**:

- **Task 0 baseline verification** (6 步) 验证 main 状态:
  - kao.css 0 引用 axis / indicator (E10-CLEAN 已删)
  - kao.css 有 `--font-display` / `--font-body` / `--font-sans` 三 token
  - GamePanel.vue 保留 `--font-body` + displayMessages + E9-FIX mechanism click
  - 全量 test suite green
- **所有 file paths 跟实际 src 匹配**:
  - `src/pages/Experience.vue` (确认存在)
  - `src/components/GamePanel.vue` (确认存在)
  - `src/styles/themes/kao.css` (确认存在)
  - `src/__tests__/uiPolish.test.js` (确认存在, `readProjectFile` pattern 已 ship)
  - `src/components/folio/CharacterPortrait.vue` (确认存在, `size="hero"` 已 ship)
- **依赖**:
  - `@/composables/useWorkstationMeta` 路径 alias (main 已有 `@` → `src/`)
  - Playwright chromium (E10 ship 已用, env 已 ship)
  - Vite dev server on :5173 (env 已有)

**可在当前 main 上立即执行**. ✓

---

## 2. ⚠️ 发现的 5 项 minor 实施细节缺口 (非 REJECT 级)

> **重要**: 这些是 *实施细节* 缺口, 不是架构缺陷. Plan 架构 + TDD + worker split 都合格. 但 worker 按 plan 字面执行可能误伤其他组件. 实施前需补 explicit guidance.

### Fix #1 — Task 5 Step 9 scoped CSS 删法过粗, 风险误伤

**问题**: Step 9 说 "scoped CSS 删 `.record-folio` / `.record-folio__*` / `.game-layout` / `.game-main-shell` / `.sidebar` / `.sidebar-head` / `.sidebar-section` 全部规则 (L897-1860 大量, 但目标只剩 0; 可整段替换)" — "可整段替换" 把 `.quick-notes-rail` / `.quick-notes-btn` / `.quick-note-workspace-*` / `.mechanism-notice` / `.inline-detail-overlay` / `.fade-*` / `.action-btn` / `@media` 查询全包了, 这些不是 4 段 composition 的一部分, **必须保留**.

**审计 `src/pages/Experience.vue` L897-1860** 实际包含的 keep-规则:
- L1048-1321: `.quick-notes-rail` / `.quick-notes-btn` / `.quick-note-*` 整套 (15 个规则块)
- L1323-1394: `.mechanism-notice` + `.mechanism-notice-fade-*` (5 个规则块)
- L1469-1563: `.inline-detail-overlay` / `.inline-detail-card` / `.inline-detail-body` / `.inline-detail-actions` (10 个规则块)
- L1565-1569: `.fade-*` transitions
- L1577-1583: `.game-page` color override (`.game-page { color: var(--archive-ink); }`)
- L1585-1628: `.action-btn` + `.action-btn.primary` (4 个规则块)
- L1706-1715: `.quick-notes-btn` kao variant
- L1717-1739: `@media (max-width: 980px / 640px / 760px)`
- L1852-1859: `@media (max-width: 980px) .mechanism-notice` position

**Fix**: 把 Step 9 改成 explicit 删除 + 保留清单:

```markdown
### Step 9 (revised): scoped CSS selective delete

**删除** (record-folio + game-layout + sidebar 整套):
- L921-1035: `.game-layout` / `.game-main-shell` / `.sidebar` / `.sidebar.collapsed` / `.sidebar-head` / `.sidebar-head-copy span/strong` / `.sidebar-toggle` / `.sidebar-section` / `.game-main` (含所有 variant)
- L1037-1044: `.game-main`
- L1576-1739 之间所有 `.game-layout` / `.game-main-shell` / `.sidebar` / `.sidebar-head` / `.sidebar-toggle` / `.sidebar-section` / `.game-page` color override 重复块 (3 段重复 from E2 / E4 / E6A)
- L1862-2108 之间 unscoped `<style>` 块内的 `.theme-kao .game-page .record-folio` (L1872-1974) + `.theme-kao .game-page .sidebar` (L1976-2108 整段)

**保留** (NOT in 4-segment workstation, must stay):
- L1048-1321: `.quick-notes-rail` 整套 (quick note workspace modal)
- L1323-1394: `.mechanism-notice` 整套 (浮层)
- L1469-1563: `.inline-detail-overlay` 整套 (对话/物品弹窗)
- L1565-1569: `.fade-*` transitions
- L1585-1628: `.action-btn` 整套 (E4A action button)
- L1706-1715: `.theme-kao .quick-notes-btn` variant
- L1717-1739: `@media (max-width: 980px / 640px / 760px)`
- L1852-1859: `@media (max-width: 980px) .mechanism-notice`

**保留 + 改名** (data-dossier-stamp pseudo-element):
- L2073-2084: `.theme-kao .game-page .sidebar-section::before { content: attr(data-dossier-stamp); ... }` — 改成 `.theme-kao .game-page .ws-section::before { ... }` (Task 7 加 `.ws-section` 时同步改)

验收: grep -cE "\.theme-kao \.game-page \.sidebar" src/styles/themes/kao.css = 0
       grep -cE "class=\"sidebar\"|class=\"record-folio\"" src/pages/Experience.vue = 0
       保留规则 0 改动 (跟 baseline diff)
```

---

### Fix #2 — Task 5 Step 4 缺 `@quick-action` event wiring

**问题**: Task 6 在 GamePanel 加 `quick-action` emit, 但 Task 5 Step 4 的 `<GamePanel @show-inline-detail="handleInlineDetail" />` 没加 `@quick-action` 监听, emit 没人接.

**Fix**: 在 Task 5 Step 4 末尾加 2 行:

```markdown
### Step 4 (revised): ws-center-stage template
- 把 `<GamePanel @show-inline-detail="handleInlineDetail" />` 改成:
  ```vue
  <GamePanel
    @show-inline-detail="handleInlineDetail"
    @quick-action="handleQuickAction"
  />
  ```
- 在 script setup 内 `function handleQuickAction(action) { ... }` 加 stub:
  ```javascript
  function handleQuickAction(action) {
    // UI-E11 v0: visual CTA only. v1 (out of scope) wires to
    // gameStore action: 'continue' → 续写 (focus textarea),
    // 'note' → 速记 (open quick-note workspace),
    // 'scene' → 切场景 (call gameStore.summarizeScene / open new chapter).
    // For now, no-op so the button is a real affordance without
    // overriding existing flows.
    if (action === 'note') {
      quickNoteOpen.value = true
    }
  }
  ```
```

**验收**: E11-C2 contract (3 quick action buttons present) 仍 pass + emit 不被 Vue warn "extraneous non-emits".

---

### Fix #3 — Task 8 `.theme-kao button` 规则太宽, 可能影响其他 kao 按钮

**问题**: Task 8 加:
```css
.theme-kao button,
.theme-kao .action-btn {
  font-family: var(--font-sans);
  font-size: 13px;
}
```

这是 *全局* `.theme-kao button` 规则, 会影响:
- StatusBar `.theme-kao .modal-footer .btn` (L868-876 已 ship 自己规则)
- Quick note panel `.theme-kao .quick-note-panel-btn` (L1278-1299 已 ship)
- Mechanism notice `.theme-kao .mechanism-notice` (L1323-1341 已 ship)
- Inline detail close `.theme-kao .inline-detail-close` (L1520-1522 已 ship)
- SessionPicker / AdvisorPanel / MechanismPanel 等组件

`.theme-kao button` 0,1,1 specificity + 跟既有 `.theme-kao .modal-footer .btn` (0,2,1) 不会冲突 (后者特异性更高), 但跟 `.theme-kao .mechanism-notice` (0,2,1) 也不会冲突. 实际上 *特异性* 上 `.theme-kao button` 大概率被既有规则盖掉.

**但** 仍有 2 个风险:
1. 浮层组件 (如 inline-detail-overlay 内的 button) 没有自己的特异性, 会被 `.theme-kao button` 接管
2. 未来加新 button 时如果不写特异性, 默认走 `.theme-kao button`, 反向污染

**Fix**: 把规则收紧到 workstation 4 段内:

```css
/* 替换 Task 8 原 INTERACTIVE 规则块 */
.theme-kao .ws-layout button,
.theme-kao .ws-layout .action-btn,
.theme-kao .ws-layout .action-btn.primary {
  font-family: var(--font-sans);
  font-size: 13px;
}
.theme-kao .ws-layout textarea,
.theme-kao .ws-layout .tavern-textarea,
.theme-kao .ws-layout .quick-note-workspace-input {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.65;
}
```

注意: textarea 是 InputArea 内的, 跟 `.theme-kao .quick-note-workspace-input` 不冲突 (后者在 quick note modal 内, 不在 ws-layout 内).

**验收**: 浮层组件 (StatusBar / QuickNote / MechanismPanel / AdvisorPanel / ImageGenRail / InlineDetail / SessionPicker) button 字号 0 改动 (跟 baseline diff 0).

---

### Fix #4 — Task 2 ws-center-stage flex layout 跟 chat-container height: 100% 冲突

**问题**: Task 2 加 `.theme-kao .ws-center-stage { display: flex; flex-direction: column; ... overflow: hidden; }`. GamePanel.vue 内部 `.chat-container { height: 100%; overflow-y: auto; ... }` (L223-231). InputArea 跟在 `<GamePanel>` 后面.

flex column 容器内, 子元素用 `height: 100%` 行为反直觉: `.chat-container` 占满整个 ws-center-stage 高度, 然后 InputArea 被挤出视口 (因为 chat-container 是 100%, 没空间留给 InputArea).

**Fix**: 在 Task 2 末尾加 ws-center-stage 子元素规则:

```css
/* ws-center-stage children: GamePanel flex-grows, InputArea sticks to bottom */
.theme-kao .ws-center-stage > .chat-container {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  overflow-y: auto;
}

.theme-kao .ws-center-stage > .input-area,
.theme-kao .ws-center-stage > textarea,
.theme-kao .ws-center-stage > form,
.theme-kao .ws-center-stage > .action-row {
  flex-shrink: 0;
  align-self: stretch;
}
```

`flex: 1 1 auto` 让 chat-container 撑满 ws-center-stage, `min-height: 0` 允许内部 overflow-y scroll, InputArea 用 `flex-shrink: 0` 保持 sticky bottom.

**注意**: 这个规则用 `.ws-center-stage > X` 直接子选择器, 不影响 GamePanel 内部嵌套结构. 但 worker 实施时需要确认 InputArea 的 root element class name. 当前 InputArea.vue L1155 行, 需 grep `<form class=...>` 或 `<textarea>` 确认 root element.

**验收**: E11-A3 contract (ws-topsticky height 80px) 仍 pass + visual: InputArea 在 viewport bottom, GamePanel 上方 scrollable, hero block 在 GamePanel 顶部.

---

### Fix #5 — Task 8 4-layer font rules 跟 E10-ship scoped CSS 重复

**问题**: Task 8 加的 4-layer font rules 中有些 selector 已在 GamePanel.vue scoped CSS 里 ship:
- `.theme-kao .text-main` (Task 8) 跟 `.text-main` (GamePanel.vue L751-762) 都设 `font-family: var(--font-body)`
- `.theme-kao .scene-entry__stamp` (Task 8) 跟 `.theme-kao .scene-entry__stamp` (GamePanel.vue L602-609) 重复
- `.theme-kao .display-name` (Task 8) 跟 `.theme-kao .display-name` (GamePanel.vue L697-705) 重复
- `.theme-kao .msg-time` (Task 8) 跟 `.theme-kao .msg-time` (GamePanel.vue L707-713) 重复

技术上 0 冲突 (相同 token, 相同值), 但形成 *double source of truth*. 后续调字体需要改 2 处.

**Fix**: 在 Task 8 末尾加 reconciliation note:

```markdown
**Reconciliation note**: 以下 4 个 selector 在 E10 ship 时已在 `GamePanel.vue` scoped CSS 内 ship `font-family: var(--font-body/sans)`:
- `.theme-kao .text-main` (GamePanel.vue L751-762)
- `.theme-kao .scene-entry__stamp` (GamePanel.vue L602-609)
- `.theme-kao .display-name` (GamePanel.vue L697-705)
- `.theme-kao .msg-time` (GamePanel.vue L707-713)

Task 8 在 kao.css 重声明是为了让 *字体分层* 在单一 source of truth (kao.css) 可见. 视觉 0 差异, 维护性 gain. 如未来需要 *单一 source*, 把 GamePanel.vue scoped CSS 这 4 个规则删掉, 全部走 kao.css.
```

**注意**: E11-D1 contract 测的是 kao.css 内有这些规则, 不是 0 重复. test 仍 pass. ✓

---

## 3. Verdict

**ACCEPT WITH FIXES**

5 项 fix 全部针对实施细节 (Task 5 / Task 8), 不改 plan 架构, 不改 11 Task TDD 顺序, 不改 4 Window dispatch.

- Plan 架构 (Q1) PASS
- Plan 删除 record-folio (Q2) PASS
- Plan 不加回 axis/indicator (Q3) PASS
- Plan 不改 store/service/router (Q4) PASS
- Plan TDD 顺序 (Q5) PASS
- Plan screenshot gate (Q6) PASS
- Plan worker split (Q7) PASS
- Plan 可在 main 执行 (Q8) PASS

5 项 fix 实施后无需重审 plan. Worker 按 plan + 5 项 fix 即可执行.

---

## 4. 最小修复清单 (Codex 用)

按 fix 顺序实施到 plan 文件 (或 worker 实施时 inline 修补):

| # | 位置 | 改动 | 验收 |
|---|---|---|---|
| **#1** | Plan Task 5 Step 9 | "可整段替换" → explicit 删 + 保留清单 (见上) | grep `\.theme-kao \.game-page \.sidebar` kao.css = 0; grep `class="sidebar"\|class="record-folio"` Experience.vue = 0; 保留规则 0 diff vs baseline |
| **#2** | Plan Task 5 Step 4 | `<GamePanel>` 加 `@quick-action="handleQuickAction"` + `function handleQuickAction(action) { if (action === 'note') quickNoteOpen.value = true }` | E11-C2 contract pass + Vue console 0 emit warning |
| **#3** | Plan Task 8 INTERACTIVE 块 | `.theme-kao button` → `.theme-kao .ws-layout button` (收紧到 workstation) | 浮层组件 (StatusBar / QuickNote / Mechanism / Advisor / ImageGen / InlineDetail / SessionPicker) button 字号 0 diff vs baseline |
| **#4** | Plan Task 2 ws-center-stage rules 末尾 | 加 `.theme-kao .ws-center-stage > .chat-container { flex: 1 1 auto; min-height: 0; height: auto; }` + `.theme-kao .ws-center-stage > .input-area { flex-shrink: 0; }` | InputArea 在 viewport bottom, GamePanel 上方 scrollable, hero 顶部 |
| **#5** | Plan Task 8 末尾 | 加 reconciliation note (GamePanel.vue scoped CSS 4 个 selector 重复说明) | E11-D1 / D2 contract 仍 pass |

5 项 fix 预计 30-60 行 plan 增量, 不重审 plan.

---

## 5. Re-verification 命令 (Codex 实施 fix 后跑)

```bash
# Plan 修复后, 跑 focused test suite 验 plan 仍然 green
npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js 2>&1 | tail -15
# Expected: ≥baseline + 13 E11 contracts pass, 0 fail

# 全量 sanity
npm run test:run 2>&1 | tail -10
# Expected: ≥190 tests, 0 fail

# Build
npm run build 2>&1 | tail -10
# Expected: clean

# Forbidden sweep
git diff HEAD -- src/styles/themes/kao.css src/pages/Experience.vue 2>&1 \
  | grep -nE ":global\(\.theme-kao\)|:deep\(\s*\)|!important" | head -10
# Expected: 0 match
```

**注**: 5 项 fix 不影响任何 uiPolish / gamePanelMechanism contract, 所以 test suite 0 变化. 仅 build + diff 验证 plan 文本合法.

---

## 6. 实施建议 (Codex)

| 路径 | 决策 |
|---|---|
| **Codex 接受 5 项 fix, 实施到 plan** | ✅ 推荐. 30-60 行增量, 1 个 worker session 足够. 不重审 plan, 直接 dispatch W1. |
| **Codex 拒绝 fix, 让 worker 自己实施时避坑** | ⚠️ 不推荐. Worker 可能误伤 quick-notes-rail / mechanism-notice / inline-detail-overlay 等组件, ship 后 QA 才能发现, 浪费 W2 / W3 cycle. |
| **Codex 派 1 个小窗口做 fix-only** | ✅ 也行. 5 项 fix 是 read-mostly + targeted edit, 1 个 window 1-2 小时. 然后 W1 dispatch. |

---

**END OF UI-E11-PLAN-QA** — ACCEPT WITH FIXES, 5 项 fix 全部 minor 实施细节, 不改 plan 架构.

Dispatch 顺序: 5 项 fix (30-60 行 plan 增量) → Codex 跑 re-verification → 派 W1 Foundation → W2 Composition → W3 Cleanup → W4 QA. 共 4-5 个 worker 窗口 (含 fix-only).