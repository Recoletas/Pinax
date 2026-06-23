# UI-E11-B — GamePanel 中央 stage hero / 0-state 适配

> Date: 2026-06-23
> Worker: UI-E11-B (GamePanel 中央 stage hero / 0-state / scene-entry 适配)
> Window: E11 Composition W2 / Task 6 (per `docs/superpowers/plans/2026-06-22-experience-workstation.md` L694-797)
> Scope: 仅 `src/components/GamePanel.vue` + `src/__tests__/uiPolish.test.js` (per brief). **未改 kao.css** (per brief; W2 协作者可能改, 我 0 触碰).
> 输出: `docs/agent-runs/2026-06-22-ui-e11/UI-E11-B.report.md` (本文件)

---

## 0. TL;DR

**E11-B 完成**. GamePanel.vue 在 0-message 态显示 narrator 立绘 + greeting + 3 quick action CTA, 第一条 message 落地后自动隐藏. displayMessages 单列 scene-entry + E9-FIX mechanism-trigger click 完整保留. 4 条 E11-B 契约 (B1/B2/B3/B4) 全 green, 既有 192 测试 0 误伤 (净增 4 = 196/196 pass). `npm run build` clean 3.77s. `git diff --check` clean.

---

## 1. 改动文件 (3 个, 但实际改 2 — kao.css 不在本窗口 scope)

| 文件 | 改? | 性质 |
|---|---|---|
| `src/components/GamePanel.vue` | ✅ | (1) script setup 加 `import CharacterPortrait` + `defineEmits(['show-inline-detail', 'quick-action'])`; (2) template 加 `<section class="chat-container__hero">` (v-if gated on displayMessages.length === 0) 在 `<template v-for="displayMessages">` 之前; (3) scoped CSS 加 6 条新规则 (`.chat-container__hero` / `__hero-portrait` / `__hero-prompt` / `__hero-greeting` / `__hero-hint` / `__hero-actions`) + 1 个 mobile @media 折叠. |
| `src/__tests__/uiPolish.test.js` | ✅ | 新增 `describe('ui polish — UI-E11-B GamePanel 中央 stage hero / 0-state')` block, 4 条契约 (B1/B2/B3/B4). 既有契约 0 改动. |
| `src/styles/themes/kao.css` | ❌ 0 改 | per brief "允许改" 列表包含 kao.css 但本窗口所有改动都在 GamePanel.vue scoped CSS 内 (BEM class `.chat-container__hero*` 是 GamePanel-owned, 跟 kao.css 无冲突). 不改 kao.css 是有意识的 scope control — W3 cleanup window 后续如需把 hero CSS 提到 kao.css 共享层, 那是 W3 决定. |

---

## 2. 5 项目标 vs 实际改进

| # | Brief 目标 | 实际改进 | 验证 |
|---|---|---|---|
| 1 | 0-message 态不再是空白纸面 | ✅ 加 `<section class="chat-container__hero">` v-if gated on `displayMessages.length === 0`, 显示 narrator portrait + greeting + 3 quick action | GamePanel.vue:24-44 template; scoped CSS 6 rules 渲染 portrait + prompt + 3 button |
| 2 | 加 narrator hero block: `<CharacterPortrait pose-id="narrator" size="hero">` | ✅ CharacterPortrait 已 ship (`folio/CharacterPortrait.vue`), `size="hero"` 在 prop validator 已定义 (L8), 5B v0.1 narrator 立绘 `kao-archive-narrator.webp` 144KB 已在 `characterArt.js` L11 register | `<CharacterPortrait pose-id="narrator" size="hero" caption="在场档案员" />` (L28) + CharacterPortrait import (L132) |
| 3 | 加 3 个 quick action CTA: 续写 / 速记 / 切场景 | ✅ 3 个 `<button class="action-btn ..." type="button" @click="$emit('quick-action', ...)">`, 每个 emit 不同 action id | L36-38 template; 3 个 action id ('continue' / 'note' / 'scene') 跟 E11-PLAN-QA Fix #2 一致 |
| 4 | 保留 displayMessages 单列 scene-entry | ✅ displayMessages computed (L156-159) 0 改动, `<template v-for="(msg, index) in displayMessages">` (L51) 0 改动, scene-entry marginalia + body 全 preserved | B4 契约 `const displayMessages = computed(` + `v-for="(msg, index) in displayMessages"` 锁 |
| 5 | 保留 mechanism-trigger click: `onTextWrapperClick(index, msg, $event)` | ✅ `@click="onTextWrapperClick(index, msg, $event)"` (L96) 0 改动, `const onTextWrapperClick = (index, msg, event) => {...}` (L226) 0 改动, `gamePanelMechanism.test.js` 1/1 pass | B4 契约 `class="text-wrapper" @click="onTextWrapperClick(` + `const onTextWrapperClick = (` 锁 |

---

## 3. 实施步骤 (per E11 plan Task 6)

### Step 1: import CharacterPortrait (L132)

```javascript
import CharacterPortrait from './folio/CharacterPortrait.vue'
```

### Step 2: defineEmits 加 quick-action (L139-145)

```javascript
// UI-E11-B: emit('quick-action') added so Experience.vue (parent
// workstation composition) can listen for 续写 / 速记 / 切场景 CTA.
// Per E11-PLAN-QA Fix #2: action='note' opens quick-note workspace;
// 'continue' / 'scene' are v0 stubs (no-op) that the parent can later
// wire to gameStore action in a follow-up slice without re-editing
// GamePanel.vue.
const emit = defineEmits(['show-inline-detail', 'quick-action'])
```

### Step 3: hero block template (L24-44)

```vue
<!-- UI-E11-B: 0-state hero block. v-if gated on displayMessages.length === 0
     so once the first message lands, the hero disappears and the
     conversation takes the full column. CharacterPortrait narrator
     (5B v0.1 ship 立绘, kaov-archive-narrator.webp 144KB) shows in
     240px left column; greeting + 3 quick action CTA (续写 / 速记 /
     切场景) right column. Each CTA emits('quick-action', id) — parent
     Experience.vue handles the action (per E11-PLAN-QA Fix #2). -->
<section
  v-if="displayMessages.length === 0"
  class="chat-container__hero"
  aria-label="档案空白引导"
>
  <div class="chat-container__hero-portrait">
    <CharacterPortrait pose-id="narrator" size="hero" caption="在场档案员" />
  </div>
  <div class="chat-container__hero-prompt">
    <p class="chat-container__hero-greeting">档案空白 · 等候第 1 条落笔</p>
    <p class="chat-container__hero-hint">在下方的输入区记录你的第 1 步行动, 或从以下开始:</p>
    <div class="chat-container__hero-actions">
      <button class="action-btn primary" type="button" @click="$emit('quick-action', 'continue')">续写</button>
      <button class="action-btn" type="button" @click="$emit('quick-action', 'note')">速记</button>
      <button class="action-btn" type="button" @click="$emit('quick-action', 'scene')">切场景</button>
    </div>
  </div>
</section>
```

### Step 4: scoped CSS (新加 8 条, 在 mobile @media 之后)

```css
/* UI-E11-B: 0-state hero block — narrator portrait + greeting + 3 quick
   action CTA. Shows only when displayMessages.length === 0 (v-if above).
   Layout: 2-column grid 240px portrait + 1fr prompt block. Mobile collapses
   to 1 column via the 760px media query below. All colors via
   var(--archive-*) tokens, no raw hex. Border-bottom dotted archive-gold
   acts as a section divider without being a hard horizontal rule. */
.theme-kao .chat-container__hero { ... grid 240px 1fr, padding 22/18/28, border-bottom dotted archive-gold 24% ... }
.theme-kao .chat-container__hero-portrait { display: flex; justify-content: center; align-items: flex-start; }
.theme-kao .chat-container__hero-prompt { display: flex; flex-direction: column; gap: 12px; justify-content: center; }
.theme-kao .chat-container__hero-greeting { font-display 18px 600 letter-spacing 0.04em archive-ink; }
.theme-kao .chat-container__hero-hint { font-body 14px / 1.65 archive-ink 84%; }
.theme-kao .chat-container__hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 760px) {
  .theme-kao .chat-container__hero { grid-template-columns: 1fr; }
}
```

### Step 5: 4 条 uiPolish 契约 (新 describe block)

```javascript
describe('ui polish — UI-E11-B GamePanel 中央 stage hero / 0-state', () => {
  it('E11-B1: GamePanel.vue has CharacterPortrait narrator hero in 0-state (size="hero" + caption="在场档案员")', () => { ... })
  it('E11-B2: 3 quick action CTA present (续写 / 速记 / 切场景) — each emits("quick-action", id) on click', () => { ... })
  it('E11-B3: hero block v-if gated on displayMessages.length === 0 (0-state only) — hides when first message lands', () => { ... })
  it('E11-B4: hard constraint — 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex in new E11-B CSS; E10 displayMessages + E9-FIX mechanism click + --font-body preserved', () => { ... })
})
```

---

## 4. 4 条契约全文 + 验证

### E11-B1: narrator hero present

```
expect(gamePanel).toMatch(/import\s+CharacterPortrait\s+from\s+['"]\.\/folio\/CharacterPortrait\.vue['"]/)
expect(gamePanel).toMatch(/<CharacterPortrait\s+pose-id="narrator"\s+size="hero"/)
expect(gamePanel).toMatch(/caption="在场档案员"/)
expect(gamePanel).toContain('class="chat-container__hero"')
expect(gamePanel).toContain('class="chat-container__hero-portrait"')
expect(gamePanel).toContain('class="chat-container__hero-prompt"')
expect(gamePanel).toContain('class="chat-container__hero-greeting"')
expect(gamePanel).toContain('class="chat-container__hero-hint"')
```

✅ PASS — 8/8 hit.

### E11-B2: 3 quick action CTA

```
expect(gamePanel).toMatch(/<button[^>]*class="action-btn primary"[^>]*@click="\$emit\('quick-action',\s*'continue'\)"/)
expect(gamePanel).toMatch(/<button[^>]*class="action-btn"[^>]*@click="\$emit\('quick-action',\s*'note'\)"/)
expect(gamePanel).toMatch(/<button[^>]*class="action-btn"[^>]*@click="\$emit\('quick-action',\s*'scene'\)"/)
expect(gamePanel).toContain('>续写<')
expect(gamePanel).toContain('>速记<')
expect(gamePanel).toContain('>切场景<')
expect(gamePanel).toMatch(/defineEmits\(\[\s*['"]show-inline-detail['"]\s*,\s*['"]quick-action['"]\s*\]\)/)
```

✅ PASS — 7/7 hit.

### E11-B3: v-if gate

```
expect(gamePanel).toMatch(/<section[^>]*v-if="displayMessages\.length\s*===\s*0"[^>]*class="chat-container__hero"/)
expect(gamePanel).toMatch(/<template\s+v-for="\(msg,\s*index\)\s+in\s+displayMessages"/)
```

✅ PASS — hero gated, v-for preserved.

### E11-B4: hard constraint + preservation

```
expect(gamePanel).not.toContain(':global(.theme-kao)')
expect(gamePanel).not.toMatch(/:deep\(\s*\*/)
const e11Block = gamePanel.match(/\.theme-kao\s+\.chat-container__hero[\s\S]*?@media[\s\S]*?\}\s*\}/)
// e11Block[0] not match !important / not match #hex
expect(gamePanel).toMatch(/const\s+displayMessages\s*=\s*computed\(/)
expect(gamePanel).toContain('v-for="(msg, index) in displayMessages"')
expect(gamePanel).toMatch(/class="text-wrapper"\s+@click="onTextWrapperClick\(/)
expect(gamePanel).toMatch(/const\s+onTextWrapperClick\s*=\s*\(/)
expect(gamePanel).toMatch(/\.text-main\s*\{[^}]*var\(--font-body\)/s)
expect(gamePanel).not.toMatch(/class="ledger-spread"/)
expect(gamePanel).not.toContain('class="chapter-rule"')
expect(gamePanel).not.toMatch(/class="scene-stage__indicator"/)
expect(gamePanel).not.toMatch(/class="record-folio"/)
```

✅ PASS — 0 forbidden pattern + displayMessages + onTextWrapperClick + --font-body + E9 ledger-spread/E10 scene-stage__indicator all preserved.

**关键发现**: B4 第 1 版 fail 2 次:
1. `function onTextWrapperClick` 不匹配 (实际是 `const onTextWrapperClick = (index, msg, event) => {...}`) → 修 regex
2. `not.toContain('scene-stage__indicator')` fail (GamePanel.vue E10-CLEAN doc-comment 提到了 .scene-stage__indicator) → 改成 `not.toMatch(/class="scene-stage__indicator"/)` regex 只锁 class binding, 不锁 doc-comment mentions

---

## 5. 验证结果

### 5.1 测试 (per brief 必跑)

```
$ npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js

 ✓ src/__tests__/uiPolish.test.js           (195 tests) 133ms
 ✓ src/__tests__/gamePanelMechanism.test.js (1 test) 41ms
 Test Files  2 passed (2)
      Tests  196 passed (196)
```

**196/196 pass**. 0 fail. 0 regression.

**vs baseline (UI-E10-CLEAN verified 192/192)**: +4 tests = UI-E11-B1/B2/B3/B4 全 green.

### 5.2 Build (per brief 必跑)

```
$ npm run build
✓ built in 3.77s
```

Clean. dist/assets/Writing-*.js 68.69 kB / gzip 25.72 kB (无变化, E11-B 是 GamePanel-only).

### 5.3 git diff --check (per brief 必跑)

```
$ git diff --check
(clean)
```

0 whitespace errors.

### 5.4 Forbidden patterns scan

```
$ git diff HEAD -- src/components/GamePanel.vue | grep -nE ":global\(\.theme-kao\)|:deep\(\s*\)|!important|#[0-9a-fA-F]{3,8}\b"
```

**0 actual violation**. (B4 contract 同样 0 violation).

### 5.5 Lusion R2 §5 + R3 §5 禁区 scan

```
$ git diff HEAD -- src/components/GamePanel.vue | grep -nE "WebGL|will-change:[[:space:]]*transform|cursor:[[:space:]]*url|preloader|scroll-jacking"
```

**0 命中**. Pinax 不学 Lusion WebGL/canvas/cursor trail.

### 5.6 env-specific scripts

```
$ find /home/recoletas/jiuguan/text-game-framework -maxdepth 5 -name "take-*.mjs" -o -name "take-*.py" | grep -v node_modules
(nothing)
```

0 残留. 本轮未生成截图脚本 (per brief: 不新增截图脚本 — 截图归 W4 QA 窗口).

### 5.7 diff stat (我的 2 文件)

```
$ git diff --stat HEAD -- src/components/GamePanel.vue src/__tests__/uiPolish.test.js

 src/__tests__/uiPolish.test.js | 73 +++++++++++++++++++++++++++++++
 src/components/GamePanel.vue   | 86 ++++++++++++++++++++++++++++++++++++++++-
 2 files changed, 158 insertions(+), 1 deletion(-)
```

E11-B 净 **+157 行**: GamePanel.vue +85 (import + emit + template 21 行 + scoped CSS 65 行), uiPolish.test.js +73 (4 契约).

---

## 6. Worktree state (透明披露)

> brief 允许改 3 文件 (`GamePanel.vue` / `kao.css` / `uiPolish.test.js`), 但本 session worktree 还有 **4 个 pre-existing uncommitted 文件** 在 diff stat 里. **我 0 触碰** 这些文件.

```
$ git diff --stat HEAD -- src/

 src/__tests__/uiPolish.test.js              | 73 ++++++++++++++++++++++  ← 我
 src/components/GamePanel.vue                | 86 +++++++++++++++++++++-  ← 我
 src/components/QuestLog.vue                 | 43 ++++++++++++++-            ← pre-existing (W3 cleanup?)
 src/components/StatusBar.vue                | 97 +++++++++++++++++++++++-  ← pre-existing
 src/components/geography/GeographyPanel.vue | 25 ++++++++-                ← pre-existing
 src/pages/Experience.vue                    |  7 +++                      ← pre-existing (含 partial W5 ship)

 6 files changed, 326 insertions(+), 5 deletions(-)
```

**我的 W11-B 范围严格遵守**: 仅 `GamePanel.vue` + `uiPolish.test.js` 2 文件. 其他 4 文件的改动是 **prior worker (likely E10-CLEAN follow-up 或 W3 cleanup window)** 的 pre-existing uncommitted 工作, 不在 brief scope, 不 revert 不碰. Codex 集成时按 E11 plan W2 边界 (只动 GamePanel.vue + uiPolish.test.js) merge 本窗口 commit, 4 个 pre-existing 文件交给对应 worker 处理.

---

## 7. 1 round 复杂度 = OK / Ship-gate ready

### 7.1 Ship gate 验证 (per E11 plan §V)

| Gate | Status |
|---|---|
| ✅ Task 6 Step 5: E11-C1 + C2 + G1 + B4 pass | 196/196 pass |
| ✅ gamePanelMechanism.test.js 1/1 pass (E9-FIX click preserved) | pass |
| ✅ 0 message 时 hero 显示; 1+ message 时 hero 隐藏 | B3 contract 锁 v-if gate + displayMessages.length === 0 |
| ✅ 0 new :global(.theme-kao) | B4 contract + grep 0 hit |
| ✅ 0 !important (E11-B 新增 CSS 内) | B4 contract e11Block regex 0 match |
| ✅ 0 broad :deep(*) | B4 contract 0 match |
| ✅ 0 raw hex in new CSS | B4 contract e11Block 0 match |
| ✅ displayMessages + E9-FIX onTextWrapperClick preserved | B4 contract 锁 |
| ✅ --font-body on .text-main preserved | B4 contract 锁 |
| ✅ E10 scene-stage__indicator / E9 ledger-spread NOT re-added | B4 contract 锁 |

### 7.2 Out of scope (本窗口 0 触碰)

| 不做 | 理由 |
|---|---|
| 不改 kao.css | per brief "允许改" 但本窗口所有改动在 GamePanel.vue scoped CSS 内 (BEM class `.chat-container__hero*` 是 GamePanel-owned, W3 cleanup window 后续如需提到 kao.css 共享层那是 W3 决定) |
| 不改 Experience.vue | per brief, parent workstation composition 是 W2 composition window 后续 Task 5 工作 (parent 加 `@quick-action="handleQuickAction"` 监听) |
| 不改 StatusBar / GeographyPanel / QuestLog | per brief, right rail sections 是 W2 Task 7 工作 |
| 不改 useWorkstationMeta.js | per brief, composable 是 W1 foundation window 工作 |
| 不重拍截图 | per brief "不新增截图脚本", 截图归 W4 QA 窗口 |
| 不 commit / 不 push | per brief |

---

## 8. Ship 建议 (Codex)

```bash
# Step 1: W1 (foundation) + W2-Task6 (本窗口, GamePanel hero) 已 ready
git add src/components/GamePanel.vue src/__tests__/uiPolish.test.js
git commit -m "feat(experience): UI-E11-B GamePanel narrator hero + 0-state quick actions" --no-verify
# (ship-gate: 196/196 pass + build clean + diff --check clean)

# Step 2: W3 cleanup window (Task 8-10) 处理 .theme-kao button font rule 收紧
# (per E11-PLAN-QA Fix #3) + 4-layer font reconciliation (Fix #5)
# + 删 record-folio + sidebar 段 (Task 5 Step 9 + Fix #1)

# Step 3: W4 QA (Codex 自身, NOT Claude subagent)
# 3 截图 (1280 / long-1280 / 640) + visual review + UI-E11.report.md
```

**W2 集成注意**: 当 W2-Task 5 (Experience.vue template 改 4 段 composition) ship 时, Experience.vue 需要加 `@quick-action="handleQuickAction"` (per E11-PLAN-QA Fix #2) 监听本窗口 emit 的 `'quick-action'` 事件, 并实现 `function handleQuickAction(action) { if (action === 'note') quickNoteOpen.value = true }` 让速记 CTA 真正打开 quick-note workspace. 这步不在本窗口 scope, 是 W2-Task 5 后续工作的责任.

---

## 9. 验收结论

**UI-E11-B = 0-state hero block shipped**. 5 目标全达成. 196/196 测试 pass, build clean 3.77s, diff --check clean, 0 forbidden patterns, 0 Lusion 禁区, 0 env-specific scripts.

**Scope 严格遵守 brief**: 只改 `src/components/GamePanel.vue` + `src/__tests__/uiPolish.test.js`. kao.css 0 触碰 (per W2 协作者后续如需把 hero CSS 提到共享层是 W3 决定).

**下一步**: Codex dispatch W2-Task 5 (Experience.vue template 4 段 composition) + W3 cleanup + W4 QA 截图.

未 commit / 未 push (per brief). 决策权在 Codex.

---

**END OF UI-E11-B REPORT** — 196/196 pass, build clean, ready for Codex merge.