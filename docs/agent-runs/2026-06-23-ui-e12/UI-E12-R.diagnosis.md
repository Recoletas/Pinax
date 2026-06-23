# UI-E12-R — Read-Only Visual Diagnosis of E11 Experience Workstation

**Worker**: Claude (UI-E12-R)
**Date**: 2026-06-23
**Branch**: main (working tree clean outside 4 modified files + 4 untracked dirs)
**Status**: Diagnosis only, 0 code changes per brief
**Visual evidence**:
- `docs/agent-runs/2026-06-23-ui-e12/experience-e12-font-{1280,long-1280,640}.png` — **FRESH** captures (untracked, 2026-06-23), filled state with 4 messages
- `docs/agent-runs/2026-06-22-ui-e11/experience-e11-{1280,long-1280,640}.png` — **STALE** captures from `3c3ea08`, show pre-E11 record-folio structure (NOT ws-layout); kept for evidence but superseded by fresh PNGs (see §0)

---

## 0. CRITICAL: stale vs fresh screenshot anomaly

`docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png` were committed in `3c3ea08 (feat(experience): ship workstation layout)` alongside E11 ws-layout code, but the **3 PNGs visually depict pre-E11 structure** (6-cell record-folio vertical stack + 3-card sidebar, no ws-left-rail narrator hero, no ws-topstrip 5-cell, no ws-section dossier stamps).

Cross-check confirms code IS E11 ws-layout:
- `src/pages/Experience.vue:16` — `<div class="ws-layout">` (3-col grid `260px 1fr 300px`)
- `src/pages/Experience.vue:24-54` — `<section class="ws-topstrip">` 5-cell + progress + anchor
- `src/pages/Experience.vue:66-76` — `<aside class="ws-right-rail">` 3 `data-dossier-stamp` sections
- `src/components/GamePanel.vue:11-24` — 0-state `CharacterPortrait` narrator hero + 3 CTA
- `src/styles/themes/kao.css:2433-2635` — 34 ws-* rules inside `@layer kao`
- `src/styles/themes/kao.css:2634` — `.theme-kao .ws-section::before { content: attr(data-dossier-stamp) }`

→ Most likely: stale PNGs were captured **before** E11-A ws-layout refactor completed, then committed alongside the E11 ship. The 2026-06-23 fresh PNGs supersede them for visual diagnosis.

**Visual analysis below uses the 2026-06-23 fresh PNGs.** Stale PNGs are documented in §0.1 for the record.

### 0.1 Stale PNG inventory (for diff / commit cleanup)

| Stale PNG | What it actually shows (pre-E11) | What it should show (E11) |
|---|---|---|
| `experience-e11-1280.png` | 6-cell record-folio vertical stack (卷/案号/当前任务/第N条/共M条/人员关系), top-half of 1280 viewport | ws-topstrip 80px + ws-center-stage + ws-right-rail 3-col |
| `experience-e11-long-1280.png` | same record-folio + portrait + chapter title 在场人物关系 | ws-layout 3-col with narrator + topstrip + sections |
| `experience-e11-640.png` | portrait + chapter title squashed, massive void below | ws-layout @media 980→1fr collapse |

→ Recommendation (out of scope for E12-R): when Codex integrates E11-A + W3F + W3C, **either remove these stale PNGs from the ship commit or replace them with re-captures** so `docs/agent-runs/2026-06-22-ui-e11/` matches the shipped E11 state.

---

## 1. TL;DR

E11 ws-layout is structurally correct (grid + topstrip + 3-section rail + narrator hero all in place). The visual diagnosis is NOT about layout structure — it's about **3 specific compositional deficiencies** that make E11 read as "generic web chat" instead of "archive manuscript":

1. **Center column has no "document" surface** — `.theme-kao .ws-center-stage` is bare `var(--archive-paper)` like everything else. Eye can't find the recording area. Per Lusion DO list, missing ledger-spread backdrop + spine + hairline rule.
2. **Right rail 3 sections read as 3 unrelated cards** — `.theme-kao .ws-section::before` only renders a tiny italic-rose stamp (卷宗一 · 在场人物) at the top-left of each section. No shared dossier chrome, no tab strip, no spine. Per Lusion DO list, missing "1 dossier with N sections" framing.
3. **No menu/page entry ritual** — ws-layout has no enter animation, no settle-in moment. Going from `/opening` or `/menu` → `/experience` is a hard cut. Per Lusion DO list #1, missing ledger-spread enter animation.

User complaints map:
- "字体不好" — typography hierarchy fires on topstrip + left rail kicker, but center column body has NO DISPLAY LXGW moment, no folio header. W3F 4-layer is in place but under-applied in center column.
- "显示奇怪" — center reads as form, right rail reads as 3 cards. See #1 and #2.
- "菜单切换和页面衔接不好" — no entry ritual. See #3.

---

## 2. Severity-ranked diagnosis (5 items)

### 2.1 [HIGH] Center column lacks "document" surface

**Evidence** (fresh `experience-e12-font-1280.png`, 1280 filled state):
- ws-center-stage renders 3 message entries (第2条 / 第3条 / 第4条) on bare `var(--archive-paper)` (cream, ~`#F0E8DC`)
- Top hairline is `1px solid var(--archive-paper-deep)` (almost invisible)
- No ledger spine, no folio frame, no ink-wash ground, no page-edge rule
- Reads as "generic chat list" not "manuscript page"

**Root cause** (`src/styles/themes/kao.css:2475-2502`):
- `.theme-kao .ws-center-stage { background: var(--archive-paper); padding: 0; border: 0; box-shadow: none; }`
- No `::before` / `::after` pseudo-elements
- No z-tier differentiation from surrounding

**Why it matters**:
- Lusion DO list — "Use surface to differentiate zones" (z-tier tokens)
- ui-style-check §3 anti-cliché — "fix composition before adding filler"; the empty cream rectangle IS the filler problem
- Five-dimension — `Visual hierarchy` weak (no first-read difference between topstrip / center / right rail)

### 2.2 [HIGH] Right rail 3 sections read as 3 unrelated cards

**Evidence** (fresh `experience-e12-font-1280.png`, right column):
- 卷宗一 · 在场人物 (with "未登记·空白" + "点击设定纪年与时间" empty state)
- 卷宗二 · 地点卡 (with 主角 + progress + 暂无卷宗 / 地点网络档案的目录 / 点+添加第一章)
- 卷宗三 · 事件卷 (with 地理总述 + "描述这个世界整体地理面貌..." textarea)
- Each section has tiny `9px italic rose stamp` at top-left corner
- NO shared container, NO spine, NO tab strip, NO "this is 1 dossier" framing

**Root cause** (`src/styles/themes/kao.css:2623-2646`):
- `.theme-kao .ws-section { border-top: 1px solid var(--archive-paper-deep); padding: 16px 12px; }`
- Stamp is `::before { content: attr(data-dossier-stamp); font-size: 9px; ... color: var(--archive-rose); }` (L2634-2646)
- `.theme-kao .ws-right-rail` outer (L2504-2511) has no spine, no tab strip, no "dossier" framing

**Why it matters**:
- Lusion DO list — "Consolidate multi-section into single dossier metaphor"
- ui-style-check §4 — `Functionality` weak (3 cards don't communicate they're 1 dossier)
- User mental model: "在场人物 + 地点卡 + 事件卷" = 1 dossier, not 3 separate widgets

### 2.3 [MED] Typography hierarchy under-applied in center column

**Evidence** (fresh PNGs):
- ws-topstrip uses `var(--font-display)` LXGW for `__case` + `__value` + `__anchor` — works ✓
- ws-left-rail kicker uses `var(--font-body)` Songti — works ✓ (W3F L2672-2686)
- **ws-center-stage body text uses scoped CSS `var(--font-body)` BUT no DISPLAY moment anywhere**
- Chat container greeting (0-state hero) uses `var(--font-body)` Songti — not LXGW DISPLAY

**Root cause**:
- W3F (this session, prior task) added 4-layer font at `kao.css:2637-2691` BUT only added:
  - `.theme-kao .ws-right-rail__section-title` (DEAD CSS — no template match)
  - `.theme-kao .ws-left-rail__kicker` + `.ws-left-rail__brief` (left rail only)
  - `.theme-kao .ws-layout button` + `.action-btn` + `textarea` (interactive only)
- Center column was scoped-out because GamePanel.vue scoped CSS has higher specificity (`[data-v-xxx]` = 0,2,1 vs kao.css 0,2,0)
- Net effect: center column has BODY + META + INTERACTIVE layers but ZERO DISPLAY moments

**Why it matters**:
- 4-layer font layering (E11-D1 / D2) is in code but visually missing in the dominant column
- ui-style-check §4 — `Visual hierarchy` weak in center

### 2.4 [MED] Mobile (640) stacking order is undefined

**Evidence** (fresh `experience-e12-font-640.png`):
- ws-topstrip squeezed into 1-cell-each row (wraps)
- ws-left-rail narrator ("在场档案员 · 旁白 GM") shrunk to ~80px height top-left
- ws-center-stage takes most of viewport ✓
- ws-right-rail 3 sections fall to bottom as stacked cards (visible in lower half)
- No clear "what's primary on mobile" hierarchy

**Root cause** (`kao.css:2426, 2449, 2467, 2513`):
- 4 separate `@media (max-width: 980px)` blocks collapse ws-layout to `1fr`
- BUT no `order` property, no display: none on collapsed regions
- ws-left-rail + ws-right-rail both stack below ws-center-stage (or above — order is grid auto)

**Why it matters**:
- Lusion DO list — "Lead with primary action on every breakpoint"
- ui-style-check §4 — `Capacity check` fails at 640 (narrator shrinks to nothing useful)

### 2.5 [LOW] Dead CSS orphans + semantic alias

**Evidence**:
- `kao.css:2659-2665` `.theme-kao .ws-right-rail__section-title` — no template match (Experience.vue uses `data-dossier-stamp` attribute, not `<h3 class="...">`)
- `kao.css:2572-2580` `.theme-kao .ws-topstrip__meta` — no template match (Experience.vue uses `__kicker` / `__value` / `__case` / `__progress` / `__anchor`, not `__meta`)
- `useWorkstationMeta.js:49-51` `currentSection` aliases `totalCount` — topstrip shows "第 N 条 = 共 M 条" with same value (per fresh PNG, both = 4)

**Why it matters**:
- ui-style-check §4 — `Functionality` — dead CSS / dead code violates "every element earn its place"
- semantic mismatch confuses future contributors

---

## 3. Special analysis (per brief)

### 3.1 Font hierarchy

**Current state** (W3F ships):
- DISPLAY `var(--font-display)` LXGW brush — fires on ws-topstrip `__case` / `__value` / `__anchor` + ws-section `::before` stamp + ws-right-rail__section-title (orphan) = ~5 visible moments
- BODY `var(--font-body)` Songti — fires on ws-left-rail kicker + brief + textarea = 3 moments
- META `var(--font-sans)` system — fires on ws-topstrip kicker + meta + ws-layout button/textarea + GamePanel scoped = ~10 moments
- INTERACTIVE `var(--font-sans)` 13px — buttons + textarea inside ws-layout

**Gap**: center column has NO DISPLAY moment. Per Lusion, the recording surface (page-header / chapter-title / time-stamp) should breathe DISPLAY to establish hierarchy.

**Fix direction**: Slice A §4.1 adds DISPLAY LXGW to the 0-state hero greeting + a folio header line in center column.

### 3.2 Central record memory point

**Current state**:
- ws-center-stage IS the memory point (functional) ✓
- BUT visual surface is flat (see §2.1 HIGH)

**User expectation**: the "central record" should feel like an open manuscript on a desk — folio surface with a spine, a header line (案号 / 落笔人 / 时辰), and the message entries below.

**Fix direction**: Slice A §4.1 — add folio backdrop, spine, hairline rule to ws-center-stage.

### 3.3 Left narrator hero

**Current state** (code-verified, NOT in fresh PNGs):
- `GamePanel.vue:11` `v-if="displayMessages.length === 0"` shows 0-state hero
- `GamePanel.vue:16` `<CharacterPortrait pose-id="narrator" size="hero" caption="在场档案员" />`
- `GamePanel.vue:22-24` 3 CTA buttons (续写 / 速记 / 切场景)

**Gap** (per W3C report §5.2 + structural map):
- 2 of 3 CTA (`'continue'` / `'scene'`) are no-ops in `handleQuickAction` (`Experience.vue:364-368` only wires `'note'`)
- 0-state hero is NOT visible in fresh PNGs (those are FILLED state, message count = 4)

**Fix direction**: Slice A scope includes "wire 'continue' + 'scene' CTA to real actions" (small, in same file).

### 3.4 Right rail dossier

**Current state** (see §2.2 HIGH).

**User expectation**: 1 dossier folder with 3 tabbed sections, opens like a real archive binder.

**Fix direction**: Slice B §4.2 — add top tab strip + shared spine to ws-right-rail; dashed section dividers; per-section "未登记" treatment when empty.

### 3.5 Menu / page handoff

**Current state**: zero entry animation. ws-layout renders immediately on route mount.

**Lusion DO list #1**: ledger-spread enter animation = rotateY(-8deg) + translateX(-12px) + opacity 0→1 over 600ms cubic-bezier(0.22,1,0.36,1).

**Fix direction**: Slice C §4.3 — add `--ease-archive` token + `wsLayoutEnter` keyframe + `.ws-layout { animation: ... }` rule with `prefers-reduced-motion` override.

### 3.6 What to KEEP vs DELETE

**KEEP** (E11 structures that are correct):
- ws-layout grid `260px 1fr 300px` + @media 980 collapse to `1fr` ✓
- ws-topstrip 5-cell + progress + anchor structure ✓
- ws-left-rail narrator block (260px, fixed) ✓
- ws-center-stage as column host ✓
- ws-right-rail 300px outer ✓
- ws-section `data-dossier-stamp` attribute + `::before` content ✓
- `useWorkstationMeta` composable (5 computeds + helpers) ✓
- CharacterPortrait narrator (5B v0.1 ship) ✓
- W3F 4-layer font tokens ✓
- LXGW / Songti / sans / mono font definitions ✓
- Archive color tokens (`--archive-paper` / `--archive-ink` / `--archive-gold` / `--archive-rose`) ✓

**DELETE** (dead code / dead CSS):
- `.theme-kao .ws-right-rail__section-title` selector (`kao.css:2659-2665`) — no template match
- `.theme-kao .ws-topstrip__meta` selector (`kao.css:2572-2580`) — no template match
- `currentSection` alias of `totalCount` in `useWorkstationMeta.js:49-51` — semantic mismatch

**FIX** (functional gaps):
- `handleQuickAction` in `Experience.vue:364-368` — wire `'continue'` + `'scene'` to real actions (e.g. `'continue'` triggers `startNewSection()`, `'scene'` triggers `triggerSceneChange()`)
- `isCharacterEmpty()` default — tighten check (currently allows messages with empty content array)

---

## 4. E12 max 3 executable slices

Each slice has: intent, files in scope, concrete changes, verification screenshot, test contracts, risk.

### 4.1 Slice A — "Document surface" for center column (HIGH)

**Intent**: ws-center-stage reads as a ledger page / manuscript, not a generic chat. Adds a folio backdrop + spine + hairline rule + DISPLAY moment in the 0-state hero.

**Files in scope** (3 files):
1. `src/styles/themes/kao.css` — extend `.theme-kao .ws-center-stage` block (L2475-2502) + add `::before` pseudo-element for hairline rule
2. `src/components/GamePanel.vue` — scoped CSS for `.chat-container__hero-greeting` (L894-908) to use `var(--font-display)` + add folio header line in 0-state hero block
3. `src/pages/Experience.vue` — wire `'continue'` + `'scene'` CTA in `handleQuickAction` (L364-368)

**Concrete changes**:
```css
/* kao.css L2475+ extension */
.theme-kao .ws-center-stage {
  background: var(--archive-paper);
  box-shadow:
    0 1px 0 var(--archive-paper-deep) inset,
    0 4px 16px color-mix(in srgb, var(--archive-ink) 6%, transparent);
  position: relative;
}
.theme-kao .ws-center-stage::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: color-mix(in srgb, var(--archive-gold) 30%, transparent);
  pointer-events: none;
}
/* ledger spine — left edge accent */
.theme-kao .ws-center-stage {
  border-left: 3px solid color-mix(in srgb, var(--archive-gold) 25%, transparent);
}
```
```vue
<!-- GamePanel.vue hero block L11-24 — add folio header -->
<div class="chat-container__hero">
  <div class="chat-container__hero-portrait">...</div>
  <div class="chat-container__hero-folio-header">
    <span class="chat-container__hero-folio-no">{{ caseNo }}</span>
    <span class="chat-container__hero-folio-meta">落笔人 · 旁白</span>
    <span class="chat-container__hero-folio-meta">{{ currentTime }}</span>
  </div>
  <div class="chat-container__hero-prompt">
    <p class="chat-container__hero-greeting">档案空白 · 等候第 1 条落笔</p>  <!-- DISPLAY LXGW -->
    ...
  </div>
</div>
```

**Verification screenshot**:
- 1280 fresh capture with **0 messages** (clear localStorage first, OR use dev server reset)
- 640 fresh capture with 0 messages
- Acceptance: center column visibly reads as a "page" with a gold top hairline + left spine; greeting "档案空白 · 等候第 1 条落笔" renders in LXGW brush (DISPLAY); folio header shows caseNo + 落笔人 + 时辰 in sans 10px tabular-nums
- Fallback (per `feedback_visual_companion_broken`): describe visual in text + verify via DevTools computed styles

**Test contracts** (extend `src/__tests__/uiPolish.test.js`):
```js
// UI-E12-A1: ws-center-stage has document-surface chrome
expect(kaoCss).toMatch(/\.theme-kao\s+\.ws-center-stage\s*\{[^}]*box-shadow[^}]*var\(--archive-ink\)/s);
// UI-E12-A2: ws-center-stage has gold hairline rule
expect(kaoCss).toMatch(/\.theme-kao\s+\.ws-center-stage::before\s*\{[^}]*archive-gold/s);
// UI-E12-A3: 0-state hero greeting uses DISPLAY font
expect(kaoCss + gamePanelCss).toMatch(/chat-container__hero-greeting[^{]*\{[^}]*var\(--font-display\)/s);
// UI-E12-A4: continue / scene CTA wired (not no-ops)
expect(experienceSource).toMatch(/case\s+['"]continue['"]\s*:[^}]*startNewSection/s);
expect(experienceSource).toMatch(/case\s+['"]scene['"]\s*:[^}]*triggerSceneChange/s);
```

**Risk**:
- `[data-v-xxx]` specificity: scoped CSS in GamePanel.vue may override kao.css for `.chat-container__hero-greeting`. Mitigate by adding `!important` only if needed (prefer raising specificity with `:where()` trick or moving rule to scoped CSS instead).
- Box-shadow on center column may conflict with adjacent zone shadows; test on 1280 + 640.
- Wiring `'continue'` / `'scene'` CTA may surface bugs in `startNewSection()` / `triggerSceneChange()` — these are pre-existing stub functions, may need implementation.

**Effort**: 0.5 day (mostly CSS, small template addition, 2 CTA wire-ups)

### 4.2 Slice B — "Dossier metaphor" for right rail (HIGH)

**Intent**: 3 ws-section reads as 1 dossier with 3 sections (not 3 unrelated cards). Add shared spine, top tab strip with 卷宗一/二/三 labels, dashed section dividers.

**Files in scope** (2 files):
1. `src/styles/themes/kao.css` — extend `.theme-kao .ws-right-rail` (L2504-2511) + `.theme-kao .ws-section` (L2623-2646)
2. `src/pages/Experience.vue` — template (L66-76) add `<header class="ws-right-rail__tab-strip">` with 3 `<span>` labels

**Concrete changes**:
```css
/* kao.css ws-right-rail — add spine + tab strip */
.theme-kao .ws-right-rail {
  background: var(--archive-paper);
  border-left: 3px solid color-mix(in srgb, var(--archive-gold) 25%, transparent);
  position: relative;
}
/* per-section divider becomes dashed */
.theme-kao .ws-section {
  border-top: 1px dashed color-mix(in srgb, var(--archive-ink) 20%, transparent);
  padding: 20px 12px 16px;
  position: relative;
}
.theme-kao .ws-section:first-child {
  border-top: none;
}
/* empty section gets dim stamp */
.theme-kao .ws-section[data-empty="true"]::before {
  color: color-mix(in srgb, var(--archive-rose) 50%, transparent);
}
```
```vue
<!-- Experience.vue L66-76 — add tab strip -->
<aside class="ws-right-rail" aria-label="右栏档案">
  <header class="ws-right-rail__tab-strip" aria-label="卷宗导航">
    <span class="ws-right-rail__tab is-active">卷宗一</span>
    <span class="ws-right-rail__tab">卷宗二</span>
    <span class="ws-right-rail__tab">卷宗三</span>
  </header>
  <div class="ws-section" data-dossier-stamp="卷宗一 · 在场人物" :data-empty="!hasCharacters">...</div>
  <div class="ws-section" data-dossier-stamp="卷宗二 · 地点卡" :data-empty="!hasGeography">...</div>
  <div class="ws-section" data-dossier-stamp="卷宗三 · 事件卷" :data-empty="!hasQuests">...</div>
</aside>
```

**Verification screenshot**:
- 1280 fresh capture (filled state, has fresh `experience-e12-font-1280.png` for diff baseline)
- 640 fresh capture
- Acceptance: right rail shows top tab strip "卷宗一 / 卷宗二 / 卷宗三" in DISPLAY LXGW 10px, active tab has gold underline; left spine 3px gold visible; dashed dividers between sections

**Test contracts**:
```js
// UI-E12-B1: ws-right-rail has tab strip
expect(experienceSource).toMatch(/<header\s+class="ws-right-rail__tab-strip"/);
// UI-E12-B2: 3 tabs with 卷宗一/二/三 labels
expect(experienceSource).toMatch(/卷宗一[\s\S]*卷宗二[\s\S]*卷宗三/s);
// UI-E12-B3: ws-section border is dashed
expect(kaoCss).toMatch(/\.theme-kao\s+\.ws-section\s*\{[^}]*border-top\s*:\s*1px\s+dashed/s);
// UI-E12-B4: ws-right-rail has left spine
expect(kaoCss).toMatch(/\.theme-kao\s+\.ws-right-rail\s*\{[^}]*border-left\s*:\s*3px\s+solid[^}]*archive-gold/s);
```

**Risk**:
- Tab strip `is-active` state has no interaction (no click handler) — could be misleading. Mitigate by making tabs purely visual labels (no `<button>` semantics) for Slice B, defer interaction to E13.
- `data-empty` attribute requires adding computed properties to Experience.vue (hasCharacters / hasGeography / hasQuests).

**Effort**: 0.5 day

### 4.3 Slice C — Menu / page entry ritual (MED)

**Intent**: hard-cut feeling when entering `/experience` is replaced by a settle-in animation (Lusion DO list #1: ledger-spread enter).

**Files in scope** (3 files):
1. `src/styles/main.css` — add `--ease-archive: cubic-bezier(0.22, 1, 0.36, 1);` to `:root` (around L20-50 token section)
2. `src/styles/themes/kao.css` — add `@keyframes wsLayoutEnter` + `.theme-kao .ws-layout { animation: wsLayoutEnter 480ms var(--ease-archive) both; }` + `prefers-reduced-motion` override
3. `src/styles/themes/kao.css` — optional stagger on ws-topstrip children

**Concrete changes**:
```css
/* main.css :root token addition */
:root {
  --ease-archive: cubic-bezier(0.22, 1, 0.36, 1);
}
```
```css
/* kao.css new keyframes + application */
@keyframes wsLayoutEnter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
.theme-kao .ws-layout {
  animation: wsLayoutEnter 480ms var(--ease-archive) both;
}
/* topstrip stagger */
.theme-kao .ws-topstrip__cell:nth-child(1) { animation-delay: 60ms; }
.theme-kao .ws-topstrip__cell:nth-child(2) { animation-delay: 100ms; }
.theme-kao .ws-topstrip__cell:nth-child(3) { animation-delay: 140ms; }
.theme-kao .ws-topstrip__cell:nth-child(4) { animation-delay: 180ms; }
.theme-kao .ws-topstrip__cell:nth-child(5) { animation-delay: 220ms; }
/* reduced-motion override */
@media (prefers-reduced-motion: reduce) {
  .theme-kao .ws-layout,
  .theme-kao .ws-topstrip__cell {
    animation: none !important;
  }
}
```

**Verification screenshot**:
- 1280 mid-transition (capture at ~240ms after route enter) — shows ws-layout at translateY(4px) opacity 0.5
- 1280 final (capture at 500ms) — fully settled
- Acceptance: visible settle-in motion, no hard cut
- Fallback (per `feedback_visual_companion_broken`): describe animation timeline in text + verify via DevTools `animation` property in computed styles

**Test contracts**:
```js
// UI-E12-C1: --ease-archive token exists
expect(mainCss).toMatch(/--ease-archive\s*:\s*cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
// UI-E12-C2: wsLayoutEnter keyframes defined
expect(kaoCss).toMatch(/@keyframes\s+wsLayoutEnter\s*\{[^}]*opacity\s*:\s*0[^}]*translateY\(8px\)/s);
// UI-E12-C3: ws-layout uses animation + reduced-motion override
expect(kaoCss).toMatch(/\.theme-kao\s+\.ws-layout\s*\{[^}]*animation\s*:\s*wsLayoutEnter[^}]*var\(--ease-archive\)/s);
expect(kaoCss).toMatch(/prefers-reduced-motion[^}]*\.theme-kao\s+\.ws-layout\s*\{[^}]*animation\s*:\s*none/s);
```

**Risk**:
- Page entry animation may interact poorly with Vue Router `<transition>` wrapper if present. Mitigate by scoping to `.ws-layout` (page-internal, not router-level).
- `animation-delay` stagger on 5 topstrip cells + progress + anchor = 7 children, may exceed 480ms total. Cap stagger at 220ms (last cell) so all settles by 700ms.
- `prefers-reduced-motion` MUST use `!important` (per existing convention in `kao.css:2296-2345`).

**Effort**: 0.25 day (mostly CSS, 1 token, 1 keyframe, 1 rule + reduced-motion override)

---

## 5. Risks / unknowns / out of scope

### 5.1 Hard constraints satisfied by all 3 slices

| Constraint | Slice A | Slice B | Slice C |
|---|---|---|---|
| No WebGL / canvas / 3D | ✓ CSS only | ✓ CSS + template | ✓ CSS only |
| No new dependencies | ✓ | ✓ | ✓ |
| No stores / services / server / router changes | ✓ | ✓ | ✓ |
| No reviving `.game-page::before` axis | ✓ new `::before` on ws-center-stage only, not game-page | ✓ no game-page touch | ✓ no game-page touch |
| No reviving `.scene-stage__indicator` | ✓ no scene-stage touch | ✓ no scene-stage touch | ✓ no scene-stage touch |
| All new CSS scoped to `.theme-kao` | ✓ | ✓ | ✓ |
| 0 `!important` outside reduced-motion | ✓ | ✓ | ✓ (reduced-motion exception) |
| 0 raw hex | ✓ color-mix with archive tokens only | ✓ | ✓ |

### 5.2 Out of scope (deferred to E13+)

- Mobile 640 redesign (current @media 980→1fr collapse is functional; redesigning stacking order is a separate slice)
- 5B character art expansion (still only narrator; 5C scene art not ship)
- WebGL / canvas / 3D / scroll-jacking
- GamePanel.vue scoped CSS work outside hero block
- Vue Router transition wrapper (Slice C scopes to .ws-layout only)
- Right rail tab strip interaction (Slice B makes tabs visual-only)
- Removing stale `docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png` PNGs (commit cleanup, not E12-R)

### 5.3 Unknowns / need user input

- **0-state screenshot** — fresh PNGs are FILLED state. Slice A verification needs 0-state capture. Options: (a) Codex clears localStorage before dev-server capture, (b) dev-only URL param `?empty=1` to force 0-state, (c) accept text+computed-styles fallback per `feedback_visual_companion_broken`.
- **`startNewSection()` / `triggerSceneChange()` implementations** — these are stubs. Slice A wires CTA to them but actual behavior is undefined. Codex must clarify scope: stub it with no-op + console.log, or implement properly.
- **Tab strip interaction** — Slice B makes tabs visual-only. User feedback needed: should tabs be clickable in E12, or visual-only with E13 adding interaction?

---

## 6. Summary table

| 项 | 值 |
|---|---|
| Working tree | 4 modified (Experience / GamePanel / kao.css / uiPolish.test.js) + 4 untracked dirs |
| Stale PNGs | 3 (`experience-e11-*.png` in commit `3c3ea08`) — show pre-E11 structure, document anomaly in §0.1 |
| Fresh PNGs | 3 (`experience-e12-font-*.png` in `docs/agent-runs/2026-06-23-ui-e12/`) — accurate E11 ws-layout state |
| Severity HIGH | 2 (center document surface, right rail dossier metaphor) |
| Severity MED | 2 (typography under-applied center, mobile 640 stacking) |
| Severity LOW | 1 (dead CSS orphans + semantic alias) |
| KEEP | ws-layout grid + topstrip + 3-section rail + narrator hero + 4-layer font + archive tokens |
| DELETE | `.ws-right-rail__section-title` + `.ws-topstrip__meta` (kao.css orphans) + `currentSection` alias |
| FIX | `'continue'` / `'scene'` CTA no-ops + `isCharacterEmpty` weak default |
| Slice A (HIGH) | Document surface — 3 files (kao.css + GamePanel.vue + Experience.vue) — 0.5 day |
| Slice B (HIGH) | Dossier metaphor — 2 files (kao.css + Experience.vue) — 0.5 day |
| Slice C (MED) | Entry ritual — 2 files (main.css + kao.css) — 0.25 day |
| Total effort | ~1.25 days for 3 slices |
| Code changes | 0 (this is read-only diagnosis per brief) |
| Commit / Push | 0 / 0 (this is read-only diagnosis per brief) |

**Recommendation for Codex**:
1. Accept Slice A + Slice B as the E12 ship scope (HIGH severity, both visually transformative, 1 day total).
2. Accept Slice C as the E12 polish scope (MED severity, additive, 0.25 day).
3. Treat Slice C as optional (can ship without it; A + B alone fix the major complaints).
4. Address §5.3 unknowns before worker dispatch: 0-state screenshot mechanism + CTA stub/implementation + tab strip interaction.
5. Optionally clean up stale `docs/agent-runs/2026-06-22-ui-e11/experience-e11-*.png` PNGs when integrating E11-A + W3F + W3C commits.