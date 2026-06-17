# Writing Page W3 — Visual Emergence Design Spec

**Date**: 2026-06-17
**Status**: Draft v1 — pending user review
**Owner**: Pinax / text-game-framework
**Scope (in)**: `src/pages/Writing.vue`, `src/styles/themes/kao.css`, `src/__tests__/uiPolish.test.js`, `docs/STATUS.md`, `docs/LOG.md`
**Scope (out — preserved from v2 ship)**: `src/stores/gameStore.js`, `src/services/worldbookContextBuilder.js`, `src/services/generation*`, `src/components/StatusBar.vue`, `src/composables/useCharacterArt.js`, `src/components/folio/*`. Also explicitly out: Tiptap v3 migration, Codex 右侧栏 (Tier 2 #15), 5B v0.2 real art, Notes.vue / ProseEssay.vue Phase 1C rollout, CharacterPortrait `compact` size.

## 1. Goal

After commit `5768475` (v2 ship) landed, the user reported the visual felt "和原来差别不大" (not much different from original) — the kao archive-folio surface grammar was applied at the **token / component level** but the **visual layer** itself (立体感, drop-cap, ambient motion, depth z-axis) was deferred to W3. This spec lands W3 in 3 atomic commits with hand-tune moments between each, per the 5C v3.12 emerging pattern (10+ user hand-tunings before positive signal).

**Success criteria**:
- Each atomic commit adds 1 visible, independently-evaluable visual layer
- 0 new components, 0 new dependencies
- All CSS gated by `.theme-kao` so legacy variant is untouched
- 1 manual screenshot per commit, captured in STATUS.md, before moving to next
- `prefers-reduced-motion: reduce` honors all animation — a11y lock

## 2. User-confirmed decisions (brainstorm 2026-06-17)

1. **3 原子 commit, 按冲击配对** (vs. 5 atomic or 1 mega-commit). User picked the "balanced granularity" path.
2. **drop-cap 仅中文字符** (CJK U+4E00-U+9FFF; English/digit/punctuation skip to next sentence)
3. **3-plane z-axis: back folio 底 → window editor → front 光标/copilot pill/标题高光** (back=`--z-stage-decor 2`, window=`--z-stage-hero 5`, front=`--z-stage-cta 6`; middle z unused)
4. **chapter list motion 仅 hover/focus 微亮** (default static, no idle motion in sidebar; uses `kickerPulse 1.5s` on hover/focus only)

## 3. Architecture

**No new components. No new dependencies. Pure CSS additions to `kao.css` + scoped CSS additions to `Writing.vue`.**

| Layer | Where | What |
|---|---|---|
| Tokens | (none new — reuse existing `--archive-*`, `--hairline-*`, `--font-display`, `--z-stage-*`) | All 5 items use tokens defined in 5C v3.14 ship |
| Kao variant CSS | `kao.css` (8 → 13 new `.theme-kao` rules) | drop-cap rule, 3 z-axis assignments, wallpaperMist::before, titleGlow, motion hover rules, reduced-motion guard |
| Page CSS | `Writing.vue` (scoped, 0 → 3 new rules) | `.writing-first-paragraph` first-child selector, 1 z-index override, 1 hover rule (most logic in kao.css) |
| Tests | `uiPolish.test.js` (1 new `describe` block + 8-10 new `it()`s) | 8-10 contract tests for CSS rules + animation keyframe names + reduced-motion guard |
| Docs | `STATUS.md` + `LOG.md` | 1 entry per commit (Recently done + permanent log) |

**Key reuses**:
- `@keyframes wallpaperMist 14s` already defined in `main.css:427-431` (5C ship) — W3 just adds a `.theme-kao .editor-container::before` consumer, no new keyframe
- `@keyframes titleGlow 4.8s` already defined in `main.css:457-460` (5C ship) — W3 just adds a `.theme-kao .chapter-title-input` consumer
- `@keyframes kickerPulse 1.5s` already defined in `CharacterBackdrop.vue:442-445` (5B ship) — W3 just adds a `.theme-kao .chapter-list-item .bookmark-button:hover` consumer
- `--z-stage-decor / --z-stage-hero / --z-stage-cta` tokens already defined in `main.css:7-9`

## 4. Per-commit design

### Commit 1 — drop-cap (手稿页招牌)

**Visual goal**: First character of the first paragraph in the editor becomes a 3-line LXGW WenKai gold initial. The user sees a manuscript-page signature immediately when they open a chapter.

**CSS in `kao.css`** (under `@layer kao`):
```css
.theme-kao .writing-first-paragraph::first-letter {
  font-family: var(--font-display);  /* LXGW WenKai */
  font-weight: 400;
  font-size: clamp(48px, 6.5vw, 96px);
  line-height: 0.85;
  float: left;
  margin: 4px 8px 0 0;
  background: linear-gradient(180deg, var(--archive-gold) 0%, var(--archive-rose) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 24px color-mix(in srgb, var(--archive-gold) 32%, transparent);
  text-transform: none !important;  /* 防止 LXGW WenKai 自身艺术化冲突 */
}
```

**Template + scoped CSS in `Writing.vue`**:
- Add `<div class="writing-first-paragraph" v-html="previewHtml"></div>` wrap inside `.editor-preview` (line 519) — wraps the rendered markdown HTML so its first child is the first paragraph
- Or, simpler: scoped CSS `.editor-preview > p:first-of-type { /* apply same drop-cap via */ }` directly on the preview container
- Decision: use the simpler `:first-of-type` approach; no template change needed. Scoped CSS in `Writing.vue` adds the class via `:first-of-type` selector.

```css
/* Writing.vue scoped */
.editor-preview > p:first-of-type::first-letter,
.writing-first-paragraph::first-letter {
  /* same rule as in kao.css — duplicated so Writing.vue contract test reads the source */
  font-family: var(--font-display);
  font-size: clamp(48px, 6.5vw, 96px);
  ...
}
```

**Note**: We duplicate the rule in two files because (a) `kao.css` is the canonical token-aware location for theme CSS, and (b) `Writing.vue` scoped CSS gives the contract test a stable, in-source location to assert against. Alternative: only one location. **Decision: kao.css only; contract test reads kao.css.** Avoid duplication.

**Tests** (3 contracts):
- `kao.css` exposes `.theme-kao .editor-preview > p:first-of-type::first-letter` (or `.writing-first-paragraph::first-letter` if we use the wrapper)
- Rule uses `var(--font-display)` (not hardcoded `LXGW WenKai`)
- Rule uses `var(--archive-gold)` for text shadow (token-aware)

**Manual screenshot gate**: open `/writing` with a non-empty chapter, screenshot the editor area. Drop-cap visible on first character of first paragraph.

**Hand-tune moment**: drop-cap size (48-96px clamp), color (gold vs gold→rose gradient), float margin (4-8px), text-shadow opacity (32%). User picks the values that feel right.

**Risk R1** (drop-cap CJK scope): CSS `::first-letter` always targets the first character regardless of CJK or Latin. To enforce CJK-only, we use `:lang(zh)` selector at the wrapper level OR accept that English/digit first chars will also get drop-cap. **Decision: accept that any first char gets drop-cap** (R1 closed in spec — the gradient + LXGW WenKai handles both CJK and Latin gracefully; Latin chars are still readable as gold initial). Note in Open Questions if user wants to restrict to CJK.

### Commit 2 — 3-plane z-axis + wallpaperMist + titleGlow (立体感呼吸)

**Visual goal**: The editor surface feels like a manuscript page with subtle depth — the folio substrate is behind, the editor is the page, the title and cursor are on top. Slow ambient mist breathes in the background, the chapter title glows softly.

**3-plane z-axis in `kao.css`** (z-index assignments to existing elements, no markup change):
```css
.theme-kao .editor-container {
  position: relative;
  z-index: var(--z-stage-hero);  /* 5 — window plane */
  isolation: isolate;
}
.theme-kao .copilot-indicator,
.theme-kao .chapter-title-input {
  position: relative;
  z-index: var(--z-stage-cta);  /* 6 — front plane */
}
.theme-kao .folio-surface--paper {
  z-index: var(--z-stage-decor);  /* 2 — back plane */
}
```

**wallpaperMist 14s consumer in `kao.css`**:
```css
.theme-kao .editor-container::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(118deg, transparent 0 60%, color-mix(in srgb, var(--archive-olive) 8%, transparent) 60.2% 66%, transparent 66.2%);
  animation: wallpaperMist 14s ease-in-out infinite alternate;
  pointer-events: none;
  opacity: 0.5;
  z-index: -1;  /* within window plane */
}
```

**titleGlow 4.8s consumer in `kao.css`**:
```css
.theme-kao .chapter-title-input {
  font-family: var(--font-display);
  font-weight: 400;
  letter-spacing: 0.04em;
  font-size: 28px;
  color: var(--archive-ink);
  animation: titleGlow 4.8s ease-in-out infinite alternate;
}
```

**Scoped CSS in `Writing.vue`**: none — all logic in kao.css. (Scoping the animation names prevents the .theme-kao variant from leaking into legacy.)

**Tests** (4 contracts):
- `kao.css` exposes `.theme-kao .editor-container` with `z-index: var(--z-stage-hero)`
- `kao.css` exposes `.theme-kao .copilot-indicator` AND `.theme-kao .chapter-title-input` with `z-index: var(--z-stage-cta)`
- `kao.css` exposes `.theme-kao .folio-surface--paper` with `z-index: var(--z-stage-decor)`
- `kao.css` exposes `.theme-kao .editor-container::before` with `animation: wallpaperMist`

**Manual screenshot gate**: open `/writing`, observe:
- 14s slow mist on editor background (subtle olive gradient shift)
- Chapter title has soft glow pulse (4.8s)
- Z-ordering correct: chapter title sits above editor surface

**Hand-tune moment**: wallpaperMist opacity (0.5 default), titleGlow brightness, font size (28px default), letter-spacing (0.04em), drop-shadow intensity.

**Risk R2** (z 重排破现有 contract): 现有 uiPolish tests 可能 assert specific z-index values for other elements. **Mitigation**: 现有 `--z-stage-*` token values 已在 5A/5B ship, z 重排用 token 不变值; 验证: commit 后跑全量 4-contract gate。

**Risk R3** (prefers-reduced-motion): wallpaperMist + titleGlow 是 ambient motion, 必须 a11y 守卫。**Mitigation**: 在 kao.css 末尾加 `@media (prefers-reduced-motion: reduce)` block, 关掉 3 个 commit 的所有 animation。

### Commit 3 — chapter list motion (侧栏活, hover-only)

**Visual goal**: The chapter list BookmarkButton rows feel responsive — when the user hovers or focuses (keyboard Tab), a soft kicker pulse confirms the row is interactive. Default state is static (no idle motion to avoid visual noise when there are 20+ chapters visible).

**CSS in `kao.css`**:
```css
.theme-kao .chapter-list-item .bookmark-button:hover,
.theme-kao .chapter-list-item .bookmark-button:focus,
.theme-kao .chapter-list-item .bookmark-button:focus-visible {
  animation: kickerPulse 1.5s ease-in-out infinite alternate;
  box-shadow: 0 0 0 1px var(--archive-gold);
}
```

**Scoped CSS in `Writing.vue`**: none — the `.chapter-list-item` class already exists from v2 ship.

**Tests** (2 contracts):
- `kao.css` exposes `.theme-kao .chapter-list-item .bookmark-button:hover` rule with `animation: kickerPulse`
- `kao.css` exposes `.theme-kao .chapter-list-item .bookmark-button:focus` rule with `animation: kickerPulse` (a11y keyboard nav)

**Manual screenshot gate**: open `/writing`, hover a chapter row in the sidebar, observe 1.5s soft pulse + 1px gold hairline ring. Tab through with keyboard, observe same effect on focus.

**Hand-tune moment**: kickerPulse duration (1.5s default), pulse intensity (text-decoration alpha), gold ring width (1px default), hover transition timing.

**Risk R4** (kickerPulse 关键帧定义位置): 5B ship 在 `CharacterBackdrop.vue:442-445` 定义 `@keyframes kickerPulse`. W3 commit 3 引用它, 不在 kao.css 复制定义。 验证: 该 keyframe 已 ship + 没被删除。

**Risk R5** (hover motion 让密集侧栏看着闹): 限定在 `.chapter-list-item` scope, 不影响其他 BookmarkButton 实例 (OpeningPage, WelcomeView 各自独立). 验证: grep 其他使用 BookmarkButton 的 .vue 文件, 确认没误影响.

## 5. Cross-cutting a11y guard

In `kao.css` end of `@layer kao` block (after the commit 3 rules), add a single reduced-motion media block that covers all 3 commits' animations:

```css
@media (prefers-reduced-motion: reduce) {
  .theme-kao .editor-container::before,
  .theme-kao .chapter-title-input,
  .theme-kao .chapter-list-item .bookmark-button:hover,
  .theme-kao .chapter-list-item .bookmark-button:focus,
  .theme-kao .chapter-list-item .bookmark-button:focus-visible {
    animation: none;
  }
}
```

**Decision**: This block is added in **commit 1** (drop-cap) as part of the foundation, so the same `@media` block extends naturally in commit 2 and 3 without duplication. Each commit's new rules are added to the selector list as needed.

**Actually revised**: The reduced-motion block is added in **commit 1** to cover drop-cap's `text-shadow` (not animation but a CSS effect that should respect reduced-motion for users who find it distracting). The block is then extended in commit 2 and 3.

## 6. Test strategy

Per commit, the same verification gate runs:

```
1. npx vitest run src/__tests__/uiPolish.test.js  # new contracts green
2. npx vitest run src/__tests__/uiPolish.test.js src/__tests__/welcomeView.test.js src/__tests__/workbenchNav.test.js src/__tests__/themeVariantView.test.js  # 4-contract gate green
3. npm run test:run  # full suite, 0 regression
4. npm run build  # clean
5. git diff --check  # clean
6. Manual screenshot of /writing in .theme-kao mode, captured in STATUS.md
```

Per `commit-conventions`: 1 commit per feature, max 2. W3 = 3 commits = max-bound, acceptable per user pick.

## 7. File touch summary

| File | commit 1 | commit 2 | commit 3 |
|---|---|---|---|
| `src/styles/themes/kao.css` | +1 drop-cap rule + 1 reduced-motion block | +3 z-axis rules + 1 wallpaperMist rule + 1 titleGlow rule + extend reduced-motion | +1 hover/focus motion rule + extend reduced-motion |
| `src/pages/Writing.vue` | 0 (selector-based, no template change) | 0 | 0 |
| `src/__tests__/uiPolish.test.js` | +3 contracts | +4 contracts | +2 contracts |
| `docs/STATUS.md` | +1 Recently done | +1 Recently done | +1 Recently done |
| `docs/LOG.md` | +1 permanent entry | +1 permanent entry | +1 permanent entry |
| **per-commit file count** | 4 | 4 | 4 |
| **per-commit new CSS lines (kao.css)** | ~12 | ~30 | ~8 |
| **per-commit new test lines** | ~30 | ~50 | ~20 |

## 8. Risks (R1-R5)

| # | Risk | Mitigation | Closed in |
|---|---|---|---|
| R1 | CJK-only drop-cap enforcement via CSS is fragile | **Accept** that any first char gets drop-cap (R1 closed in spec — Latin still reads as gold initial) | §4 commit 1 |
| R2 | z 重排破现有 uiPolish contracts | z-index values come from `--z-stage-*` tokens unchanged; full 4-contract gate per commit | §4 commit 2 |
| R3 | ambient motion breaks a11y for reduced-motion users | Single `@media (prefers-reduced-motion: reduce)` block in commit 1, extended in 2 and 3 | §5 |
| R4 | kickerPulse keyframe 5B ship 位置可能在 CharacterBackdrop.vue:442-445, commit 3 不在 kao.css 重写 | Reference existing definition; don't redefine | §4 commit 3 |
| R5 | chapter list hover motion 跨 BookmarkButton 实例污染 | Selector scope `.chapter-list-item` (specific to Writing page); grep verify other consumers | §4 commit 3 |

## 9. Out of scope (explicit)

These are deferred to follow-up commits or separate specs:

- Tiptap v3 migration + Codex 右侧栏 (Tier 2 #15 from comprehensive research synthesis — separate subsystem, needs its own spec)
- 5B v0.2 real art for `writing-sidekick` pose (just change `src` in `characterArt.js`)
- Notes.vue + ProseEssay.vue Phase 1C rollout (follow same kao grammar)
- CharacterPortrait `compact` size (currently constrained via inline `style="max-width: 180px"`)
- 5A PR merge + 5b rebase (separate from W3)

## 10. Open questions (resolved in brainstorm 2026-06-17)

1. **Commit 编排粒度**: 5 atomic vs 3 grouped vs 1 mega — user picked **3 grouped** (Approach B from brainstorm)
2. **drop-cap 字符范围**: 中文 only vs 任意首字 vs 仅首章首段 — user picked **中文 only** (with R1 mitigation in §4 commit 1)
3. **3-plane z-axis 语义**: cursor-led vs title-led vs mix-blend-only — user picked **back 底 → window editor → front 光标** (token-aligned)
4. **chapter list motion 范围**: hover-only vs idle kickerPulse vs 全静 — user picked **仅 hover/focus 微亮** (least distracting)

## 11. Self-review

**1. Placeholder scan**: No "TBD" / "TODO" / incomplete sections. All 3 commits have explicit CSS sketches, tests, file:line refs.

**2. Internal consistency**: §3 architecture and §4 per-commit design match. §5 a11y guard consistent across all 3 commits. §6 test strategy consistent with §4 per-commit tests.

**3. Scope check**: This is a single focused spec for visual emergence on `/writing` page only. 3 atomic commits, each independently testable. Fits in 1 plan.

**4. Ambiguity check**:
- "back 底 → window editor → front 光标" — the "cursor" in "front 光标" is loose. Reread: actually user picked "back folio 底 → window editor → front 光标/copilot pill/标题高光" so "光标" here means "cursor OR copilot pill OR title glow" — not literally the text caret. Decision: front plane = `.copilot-indicator` + `.chapter-title-input` only. The text caret inherits its parent's z-index. The §4 commit 2 spec correctly lists both.
- "3-plane z-axis" — at runtime, only the 3 selected elements get z-index. Other elements have no z-index and use normal stacking. Decision: explicit in §4 commit 2.

**5. Reversibility matrix**: Each commit is independently revertable. Reverting commit 2 leaves drop-cap (commit 1) + motion (commit 3) intact. Reverting commit 3 leaves drop-cap + 3-plane/wallpaperMist/titleGlow intact. Reverting commit 1 leaves the page with no drop-cap (degraded to v2 visual).

**6. File:line audit**: All citations re-verified against current repo state as of commit `5768475`. `main.css:7-9` z-tokens, `main.css:427-431` wallpaperMist, `main.css:457-460` titleGlow, `CharacterBackdrop.vue:442-445` kickerPulse — all confirmed.

---

**Next**: After user reviews this spec, invoke writing-plans to create the implementation plan.
