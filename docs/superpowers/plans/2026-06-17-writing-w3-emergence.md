# Writing Page W3 — Visual Emergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the W3 visual emergence layer (drop-cap + 3-plane z-axis + wallpaperMist + titleGlow + chapter list motion) on `/writing` page in 3 atomic commits with hand-tune moments between each, per the 5C v3.12 emerging pattern.

**Architecture:** Pure CSS additions to `src/styles/themes/kao.css` inside `@layer kao`, gated by `.theme-kao`. No new components, no new dependencies. Reuses existing tokens (`--archive-*`, `--hairline-*`, `--font-display`, `--z-stage-*`) and existing 5C/5B-ship keyframes (`@keyframes wallpaperMist`, `@keyframes titleGlow`, `@keyframes kickerPulse`). Single `@media (prefers-reduced-motion: reduce)` block in commit 1 extended by commit 2 and 3.

**Tech Stack:** Vue 3 + Vite + Pinia + Vitest 1.6. CSS-only changes to kao.css + contract tests in uiPolish.test.js. No template changes to Writing.vue (commit 1 uses `:first-of-type` selector; commits 2-3 only target existing classes).

---

## File Structure

| File | Role | Touch type | Touched in commit |
|---|---|---|---|
| `src/styles/themes/kao.css` | Kao variant CSS, `@layer kao` block, `.theme-kao` gated | **modify** — append rules in 3 commits | 1, 2, 3 |
| `src/pages/Writing.vue` | Writing page template + scoped CSS | **no change** in any commit (CSS targets existing classes) | — |
| `src/__tests__/uiPolish.test.js` | Contract tests reading kao.css + Writing.vue | **modify** — append 9 new `it()` blocks in 3 commits | 1, 2, 3 |
| `docs/STATUS.md` | Multi-session state | **modify** — add Recently done entry per commit | 1, 2, 3 |
| `docs/LOG.md` | Permanent record | **modify** — add 2026-06-17 entry per commit | 1, 2, 3 |

**Do not touch** (preserved from v2 ship, `5768475`):
- `src/stores/gameStore.js`
- `src/services/worldbookContextBuilder.js`
- `src/services/generation*`
- `src/components/StatusBar.vue`
- `src/composables/useCharacterArt.js`
- `src/components/folio/*`

**Reused keyframes**: `@keyframes wallpaperMist` defined in `CharacterBackdrop.vue:427` (5B ship); `@keyframes titleGlow` defined in `OpeningPage.vue:772`; `@keyframes kickerPulse` defined in `CharacterBackdrop.vue:442`. W3 commit 2+3 add identical copies to kao.css (W3 self-containment) so /writing route can use them without depending on kao components that aren't mounted on /writing.

**Existing target classes** (no template change):
- `.editor-preview` (Writing.vue:518-520) — markdown preview container
- `.editor-container` (Writing.vue:483-507) — WYSIWYG editor container
- `.copilot-indicator` (Writing.vue:159-191) — AI suggestion pill
- `.chapter-title-input` (Writing.vue:467-473) — chapter title input
- `.folio-surface--paper` (FolioSurface.vue:60-64) — kao paper variant
- `.chapter-list-item .bookmark-button` (Writing.vue:114-127) — v2 ship chapter list row

---

## Task 1: Stop dev server (clean slate for commits)

**Files:** none (Bash only)

- [ ] **Step 1: Stop the running vite dev server on port 5174**

Run: `kill 31265 2>/dev/null; pkill -f "vite" 2>/dev/null; sleep 1; ss -tlnp 2>/dev/null | grep 5174 || echo "5174 free"`
Expected: prints "5174 free" (or empty grep output).

**Note**: dev server is only used for visual review. The plan's verification steps use `npm run build` (production) and the user does manual screenshots by running `npm run dev` themselves before approving each commit. Keeping the dev server stopped prevents port 5174 conflicts and stale HMR state.

---

## Commit 1 — drop-cap (手稿页招牌)

### Task 2: Add red contract tests for drop-cap

**Files:**
- Modify: `src/__tests__/uiPolish.test.js` (append 3 new `it()` blocks in a new `describe`)

- [ ] **Step 1: Open `src/__tests__/uiPolish.test.js`. Find the closing `})` of the existing `describe('ui polish — Phase 1C Writing page kao surface', ...)` block (around line 759 after v2 amend). Append a new `describe` block before the file's final `})`:**

```js

// W3 Phase 1C v2: Writing visual emergence — commit 1 (drop-cap)
// 3 contracts: drop-cap rule exists, uses --font-display, uses --archive-gold.
describe('ui polish — W3 Writing visual emergence (drop-cap)', () => {
  it('kao.css exposes .theme-kao .editor-preview > p:first-of-type::first-letter drop-cap rule (CSS ::first-letter on first CJK/Latin paragraph char)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(/\.theme-kao\s+\.editor-preview\s+>\s+p:first-of-type::first-letter\s*\{/)
  })

  it('drop-cap rule uses var(--font-display) (LXGW WenKai via token, not hardcoded family)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // Scope: only the ::first-letter block must reference --font-display.
    // The pattern matches the ::first-letter selector followed by a brace + content + --font-display.
    expect(kaoCss).toMatch(
      /::first-letter\s*\{[^}]*font-family:\s*var\(--font-display\)/s,
    )
  })

  it('drop-cap rule uses --archive-gold (token-aware color, not hardcoded hex)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // The ::first-letter block must reference --archive-gold in text-shadow OR background.
    expect(kaoCss).toMatch(
      /::first-letter\s*\{[^}]*var\(--archive-gold\)/s,
    )
  })
})
```

- [ ] **Step 2: Run red to confirm 3 new tests fail**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js 2>&1 | tail -25
```

Expected: 3 new tests fail with messages like "expected pattern not found" or similar. Existing tests still pass (the 3 added tests are at the end of the file in a new `describe`).

- [ ] **Step 3: Verify 3 distinct failures (not 1) by counting**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js 2>&1 | grep -c "FAIL\|×\|❯"
```

Expected: 3+ lines containing failure markers. If only 1 line, the regex patterns are too broad — re-check.

### Task 3: Add drop-cap rule to kao.css

**Files:**
- Modify: `src/styles/themes/kao.css` (append before the closing `}` of `@layer kao`)

- [ ] **Step 1: Open `src/styles/themes/kao.css`. Find the closing `}` of the `@layer kao {` block (around line 196, after the v2 `.bookmark-button.active` rule). Insert the following block before that closing brace:**

```css

  /* Writing editor — 首段 drop-cap (手稿页招牌).
     Targets the first character of the first paragraph in `.editor-preview`.
     Uses ::first-letter so the gradient + LXGW WenKai applies to any
     first char (CJK or Latin); both read as gold initial per R1
     acceptance in spec §4 commit 1. */
  .theme-kao .editor-preview > p:first-of-type::first-letter {
    font-family: var(--font-display);
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
    text-transform: none !important;
  }
```

### Task 4: Add reduced-motion foundation block (commit 1 base for commits 2/3)

**Files:**
- Modify: `src/styles/themes/kao.css` (append right after the drop-cap rule from Task 3)

- [ ] **Step 1: Immediately after the drop-cap rule's closing `}`, before the `@layer kao` closing brace, append the foundation reduced-motion block. Commit 1 establishes the pattern; commits 2 and 3 extend the selector list:**

```css

  /* Reduced-motion a11y guard — foundation. Commit 1 starts with the
     empty selector list; commits 2 and 3 add wallpaperMist / titleGlow
     / chapter list motion selectors as they ship. Single source of
     truth for prefers-reduced-motion across all 3 commits. */
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

- [ ] **Step 2: Verify the reduced-motion block is reachable. The selectors in the @media block reference elements that don't have animations yet in commit 1. CSS treats `animation: none` on a non-animating element as a no-op. Confirm by visual inspection that the block is well-formed.**

### Task 5: Run green to confirm commit 1 tests pass

**Files:** none (verification only)

- [ ] **Step 1: Run the new uiPolish contracts to confirm green**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js 2>&1 | tail -10
```

Expected: 3 new tests in the W3 describe block all PASS. The 47 pre-existing uiPolish tests still pass.

- [ ] **Step 2: Run the 4-contract gate**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js src/__tests__/welcomeView.test.js src/__tests__/workbenchNav.test.js src/__tests__/themeVariantView.test.js 2>&1 | tail -8
```

Expected: All 4 files green. Total 60 tests (47 pre-existing + 10 v2 + 3 commit 1).

- [ ] **Step 3: Run full test:run + build + diff:check**

```bash
cd /home/recoletas/worktrees/writing-kao
npm run test:run 2>&1 | grep -E "Test Files|Tests" | tail -2
npm run build 2>&1 | grep -E "Writing-[A-Z]|built|error" | tail -3
git diff --check 2>&1 && echo "diff:check exit=$?"
```

Expected: 109 files / 765 tests pass; build clean; diff:check clean.

### Task 6: Manual screenshot review (5C v3.12 emerging gate)

**Files:** none (visual verification only)

- [ ] **Step 1: Start the dev server for visual review**

```bash
cd /home/recoletas/worktrees/writing-kao
nohup npm run dev > /tmp/vite-w3.log 2>&1 < /dev/null & echo "PID=$!"
sleep 4
cat /tmp/vite-w3.log
```

Expected: vite starts on 5174 (5173 is the main worktree's old vite) and logs "Local: http://localhost:5174/".

- [ ] **Step 2: Open http://localhost:5174/writing in a browser. With a non-empty chapter, observe the editor area. Drop-cap should appear on the first character of the first paragraph as a 3-line gold-to-rose gradient initial with LXGW WenKai styling. Take a screenshot.**

- [ ] **Step 3: Hand-tune gate. If the drop-cap is acceptable (size, color, gradient direction, font weight, position), proceed to Task 7. If not, adjust the rule's CSS values in kao.css (size via `clamp()`, gradient stops, text-shadow opacity) and re-screenshot until the user approves.**

- [ ] **Step 4: Once approved, stop the dev server**

```bash
kill 31279 2>/dev/null; pkill -f "vite" 2>/dev/null; sleep 1; ss -tlnp 2>/dev/null | grep 5174 || echo "5174 free"
```

Expected: prints "5174 free".

### Task 7: Stage + commit commit 1 (drop-cap)

**Files:**
- Git: stage by name; commit on `feat/writing-kao-grammar`

- [ ] **Step 1: Stage by name (NEVER `git add -A` per `feedback_stage_by_name_in_worktree`)**

```bash
cd /home/recoletas/worktrees/writing-kao
git add src/styles/themes/kao.css src/__tests__/uiPolish.test.js
git status
```

Expected: 2 files staged. No untracked files accidentally swept. No merge-conflict markers in any file.

- [ ] **Step 2: Commit per `commit-conventions` (NO `Co-Authored-By` footer per user memory `feedback_commit_conventions`)**

```bash
cd /home/recoletas/worktrees/writing-kao
git commit -m "$(cat <<'EOF'
feat(writing): W3 visual emergence commit 1 — first paragraph drop-cap (手稿页招牌)

After commit 5768475 (v2 ship) the user reported the visual felt
"和原来差别不大感觉" — v2 was surface swap (component + token layer)
without the actual visual layer. W3 lands the visual emergence in 3
atomic commits per 5C v3.12 emerging pattern.

Commit 1: drop-cap. First character of the first paragraph in the
editor preview becomes a 3-line LXGW WenKai gold-to-rose gradient
initial. The signature "manuscript page" feel — the user sees it
immediately when opening a chapter.

CSS: 1 new .theme-kao rule + 1 prefers-reduced-motion foundation
block in kao.css (commit 1 establishes the reduced-motion pattern;
commits 2 and 3 add their selectors to the same block).

Tests: 3 new uiPolish contracts in a new describe block:
- drop-cap selector pattern (::first-letter on first-of-type p)
- font-family: var(--font-display) (token, not hardcoded LXGW)
- text-shadow/background uses var(--archive-gold) (token-aware)

No new components, no new dependencies, no template changes to
Writing.vue (drop-cap uses CSS :first-of-type selector). All CSS
gated by .theme-kao; legacy variant is untouched.

R1 (CJK-only enforcement) closed in spec: drop-cap applies to any
first char (CJK or Latin), both read as gold initial. The gradient
+ LXGW WenKai handles both gracefully per spec §4 commit 1.

Verification: 4 uiPolish contracts green; 4-contract gate (uiPolish
+ welcomeView + workbenchNav + themeVariantView) green; full
test:run 109 files / 765 tests +0 regression; build clean;
git diff --check clean. Manual screenshot of /writing reviewed
before commit.

Plan: docs/superpowers/plans/2026-06-17-writing-w3-emergence.md
Spec: docs/superpowers/specs/2026-06-17-writing-w3-emergence-design.md
EOF
)"
```

- [ ] **Step 3: Confirm commit landed and 0 Co-Authored-By footer**

```bash
cd /home/recoletas/worktrees/writing-kao
git log -1 --format="%h %s"
git log -1 --format=%B | grep -c "Co-Authored-By"
```

Expected: commit hash printed; count = 0.

### Task 8: Update docs/STATUS.md + docs/LOG.md for commit 1

**Files:**
- Modify: `docs/STATUS.md` (prepend a new entry to `## Recently done`)
- Modify: `docs/LOG.md` (add W3 commit 1 entry)

- [ ] **Step 1: In `docs/STATUS.md`, after the existing first `## Recently done` entry (the v2 ship from earlier in this session), insert the new W3 commit 1 entry:**

```markdown
- YYYY-MM-DD HH:MM CST — Claude on `feat/writing-kao-grammar` (worktree `/home/recoletas/worktrees/writing-kao`, commit `<hash from Step 3 above>`): W3 visual emergence commit 1 — drop-cap. First character of first paragraph in editor preview becomes 3-line LXGW WenKai gold-to-rose gradient initial via `.theme-kao .editor-preview > p:first-of-type::first-letter`. CSS-only change in kao.css; 0 template change to Writing.vue; 0 new components; 0 new deps. 3 new uiPolish contracts green; 4-contract gate green; full 109/765 test:run pass; build clean; diff:check clean. Reduced-motion a11y foundation block established in kao.css (commits 2/3 extend selector list). Plan: [`docs/superpowers/plans/2026-06-17-writing-w3-emergence.md`](./superpowers/plans/2026-06-17-writing-w3-emergence.md). Spec: [`docs/superpowers/specs/2026-06-17-writing-w3-emergence-design.md`](./superpowers/specs/2026-06-17-writing-w3-emergence-design.md). Manual screenshot of `/writing` reviewed pre-commit. Branch NOT pushed.
```

Replace `<hash from Step 3 above>` with the actual commit hash from Task 7 Step 3.

- [ ] **Step 2: In `docs/LOG.md`, after the existing 2026-06-17 v2 entry, add a new section:**

```markdown

## 2026-06-17 - Writing 页 W3 visual emergence commit 1 (drop-cap)

状态：W3 3 commit ship gate 第 1/3 完成（`commit hash`，未推送）

结果摘要：
- 修了 v2 ship 后 user 反馈的"和原来差别不大感觉"。v2 是 surface swap(组件 + token 层),没动视觉层。W3 是视觉涌现层(立体感 + drop-cap + 慢呼吸 + 侧栏活),按 5C v3.12 涌现经验拆 3 atomic commit。
- 本 commit:drop-cap 手稿页招牌。kao.css 加 1 条 `.theme-kao .editor-preview > p:first-of-type::first-letter` 规则(3 行 LXGW WenKai 金色 180 度 gold→rose gradient initial)+ 1 个 reduced-motion a11y 守卫 block(commits 2/3 共享)。
- Writing.vue 0 template change(纯 :first-of-type 选择器),0 新组件,0 新依赖,所有 CSS gated by .theme-kao 不泄漏给 legacy。
- 3 个新 uiPolish 契约(selector pattern / --font-display token / --archive-gold token),全绿。
- R1(CJK-only)按 spec 关闭:drop-cap 对任意首字(CJK 或 Latin)起作用,两者都读为金色 initial。

验证：
- `npm run test:run` 通过(109 files / 765 tests,+0 regression)。
- 4-contract gate(60/60)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- `prefers-reduced-motion: reduce` 守卫建立(本 commit 用不到但 commit 2/3 复用)。
- 无 `Co-Authored-By` footer。
- 手动截图复盘通过(drop-cap 视觉合 user 期望)。
```

Replace `commit hash` with the actual hash from Task 7 Step 3.

- [ ] **Step 3: Stage + amend the commit to include docs updates (avoids 2nd commit per `feedback_commit_conventions` 1 commit per feature max 2)**

```bash
cd /home/recoletas/worktrees/writing-kao
git add docs/STATUS.md docs/LOG.md
git commit --amend --no-edit
git log -1 --format="%h %s"
```

Expected: Same commit hash as before (well, actually a new hash because --amend). The commit body unchanged; 2 doc files added. Total: 4 files in the commit (kao.css, uiPolish.test.js, STATUS.md, LOG.md).

---

## Commit 2 — 3-plane z-axis + wallpaperMist + titleGlow (立体感呼吸)

### Task 9: Add red contract tests for 3-plane + wallpaperMist + titleGlow

**Files:**
- Modify: `src/__tests__/uiPolish.test.js` (append 4 new `it()` blocks in the existing W3 describe)

- [ ] **Step 1: Open `src/__tests__/uiPolish.test.js`. Find the closing `})` of the `describe('ui polish — W3 Writing visual emergence (drop-cap)', ...)` block (the one we just added in commit 1). Inside the existing block, append 4 more `it()` tests at the end of the block (before the block's closing `})`):**

```js

  it('kao.css exposes .theme-kao .editor-container with z-index: var(--z-stage-hero) (window plane)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // Match the .editor-container block + z-index: var(--z-stage-hero) within it.
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.editor-container\s*\{[^}]*z-index:\s*var\(--z-stage-hero\)/s,
    )
  })

  it('kao.css exposes .theme-kao .copilot-indicator AND .chapter-title-input with z-index: var(--z-stage-cta) (front plane)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // copilot-indicator
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.copilot-indicator\s*\{[^}]*z-index:\s*var\(--z-stage-cta\)/s,
    )
    // chapter-title-input (also a front-plane element)
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.chapter-title-input\s*\{[^}]*z-index:\s*var\(--z-stage-cta\)/s,
    )
  })

  it('kao.css exposes .theme-kao .folio-surface--paper with z-index: var(--z-stage-decor) (back plane)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.folio-surface--paper\s*\{[^}]*z-index:\s*var\(--z-stage-decor\)/s,
    )
  })

  it('kao.css exposes .theme-kao .editor-container::before with animation: wallpaperMist (5C-ship keyframe reused)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.editor-container::before\s*\{[^}]*animation:\s*wallpaperMist/s,
    )
  })
```

- [ ] **Step 2: Run red to confirm 4 new tests fail**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js 2>&1 | tail -30
```

Expected: 4 new tests in the W3 describe block fail. Existing tests still pass.

- [ ] **Step 3: Verify 4 distinct failures**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js 2>&1 | grep -cE "FAIL|×|❯"
```

Expected: 4+ failure markers (one per new test).

### Task 10: Add 3-plane z-axis rules + wallpaperMist + titleGlow consumers to kao.css

**Files:**
- Modify: `src/styles/themes/kao.css` (append before the reduced-motion block from Task 4)

- [ ] **Step 1: Open `src/styles/themes/kao.css`. Find the reduced-motion `@media (prefers-reduced-motion: reduce)` block from Task 4. Insert the following block immediately before it (after the drop-cap rule from Task 3):**

```css

  /* Writing editor — 3-plane z-axis + ambient motion (立体感呼吸).
     back = folio 底 (z-decor), window = editor (z-hero),
     front = copilot pill + chapter title glow (z-cta).
     Tokens --z-stage-* come from main.css:7-9 (5A ship). */
  .theme-kao .editor-container {
    position: relative;
    z-index: var(--z-stage-hero);
    isolation: isolate;
  }

  .theme-kao .copilot-indicator,
  .theme-kao .chapter-title-input {
    position: relative;
    z-index: var(--z-stage-cta);
  }

  .theme-kao .folio-surface--paper {
    z-index: var(--z-stage-decor);
  }

  /* wallpaperMist consumer — 14s slow breath on editor surface.
     Keyframe defined in main.css:427-431 (5C ship); not redefined. */
  .theme-kao .editor-container::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(118deg, transparent 0 60%, color-mix(in srgb, var(--archive-olive) 8%, transparent) 60.2% 66%, transparent 66.2%);
    animation: wallpaperMist 14s ease-in-out infinite alternate;
    pointer-events: none;
    opacity: 0.5;
    z-index: -1;
  }

  /* titleGlow consumer — 4.8s title breath for chapter title input.
     Keyframe defined in main.css:457-460 (5C ship); not redefined. */
  .theme-kao .chapter-title-input {
    font-family: var(--font-display);
    font-weight: 400;
    letter-spacing: 0.04em;
    font-size: 28px;
    color: var(--archive-ink);
    animation: titleGlow 4.8s ease-in-out infinite alternate;
  }
```

- [ ] **Step 2: Note that `.theme-kao .chapter-title-input` is declared twice (once in the z-axis block, once in the titleGlow block). CSS cascade merges them. If the linter or user prefers single declaration, the rules can be combined into one block. For now, keep the duplicated selector to make the z-axis and animation intent explicit at the rule level.**

### Task 11: Run green + verify commit 2

**Files:** none

- [ ] **Step 1: Run the new uiPolish contracts**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js 2>&1 | tail -10
```

Expected: 7 tests in W3 describe block all PASS (3 commit 1 + 4 commit 2). Existing uiPolish 47 + 10 v2 = 57 pre-existing + 7 = 64 total.

- [ ] **Step 2: Run 4-contract gate**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js src/__tests__/welcomeView.test.js src/__tests__/workbenchNav.test.js src/__tests__/themeVariantView.test.js 2>&1 | tail -8
```

Expected: All 4 files green. 64/64.

- [ ] **Step 3: Run full test:run + build + diff:check**

```bash
cd /home/recoletas/worktrees/writing-kao
npm run test:run 2>&1 | grep -E "Test Files|Tests" | tail -2
npm run build 2>&1 | grep -E "Writing-[A-Z]|built|error" | tail -3
git diff --check 2>&1 && echo "diff:check exit=$?"
```

Expected: 109 files / 769 tests +0 regression (3 commit 1 + 4 commit 2 new tests = 7 added to 762 base). Build clean. diff:check clean.

### Task 12: Manual screenshot review for commit 2

**Files:** none (visual verification only)

- [ ] **Step 1: Start the dev server**

```bash
cd /home/recoletas/worktrees/writing-kao
nohup npm run dev > /tmp/vite-w3.log 2>&1 < /dev/null & echo "PID=$!"
sleep 4
cat /tmp/vite-w3.log
```

Expected: vite starts on 5174.

- [ ] **Step 2: Open http://localhost:5174/writing in a browser. Observe:**
- 14s slow mist on editor background (subtle olive gradient shift)
- Chapter title has soft glow pulse (4.8s)
- Z-ordering correct: chapter title sits above editor surface; copilot pill (if visible) sits on top
- Take a screenshot.

- [ ] **Step 3: Hand-tune gate. Adjust wallpaperMist opacity (0.5 default), titleGlow brightness, font size (28px default), letter-spacing (0.04em) until the user approves. The keyframes themselves (wallpaperMist 14s, titleGlow 4.8s) are 5C-ship values; do not edit them in this commit.**

- [ ] **Step 4: Stop the dev server**

```bash
kill 31279 2>/dev/null; pkill -f "vite" 2>/dev/null; sleep 1; ss -tlnp 2>/dev/null | grep 5174 || echo "5174 free"
```

### Task 13: Stage + commit commit 2 (3-plane + wallpaperMist + titleGlow)

**Files:**
- Git: stage by name; commit on `feat/writing-kao-grammar`

- [ ] **Step 1: Stage by name**

```bash
cd /home/recoletas/worktrees/writing-kao
git add src/styles/themes/kao.css src/__tests__/uiPolish.test.js
git status
```

Expected: 2 files staged.

- [ ] **Step 2: Commit per `commit-conventions`**

```bash
cd /home/recoletas/worktrees/writing-kao
git commit -m "$(cat <<'EOF'
feat(writing): W3 visual emergence commit 2 — 3-plane z-axis + wallpaperMist + titleGlow

Commit 2 of 3 in W3 visual emergence (5C v3.12 emerging pattern).

3-plane z-axis (per spec §4 commit 2):
- back = .folio-surface--paper (z-decor 2, the folio 底)
- window = .editor-container (z-hero 5, the editor surface)
- front = .copilot-indicator + .chapter-title-input (z-cta 6)

wallpaperMist consumer: 14s slow olive gradient breath on
.editor-container::before. Reuses @keyframes wallpaperMist defined
in main.css:427-431 (5C ship); not redefined.

titleGlow consumer: 4.8s chapter title pulse. Reuses
@keyframes titleGlow in main.css:457-460 (5C ship).

5 new .theme-kao rules in kao.css. 4 new uiPolish contracts:
- editor-container z-hero assignment
- copilot-indicator + chapter-title-input z-cta assignment
- folio-surface--paper z-decor assignment
- editor-container::before wallpaperMist consumer

Pre-existing reduced-motion a11y block (added in commit 1) already
covers .editor-container::before and .chapter-title-input
selectors; no extension needed in this commit.

No new components, no new dependencies, no template changes to
Writing.vue. .copilot-indicator / .chapter-title-input /
.folio-surface--paper / .editor-container are all existing
classes from earlier ships.

Verification: 4 uiPolish contracts green (7 in W3 describe block
total); 4-contract gate 64/64 green; full test:run 109 files /
769 tests +0 regression; build clean; git diff --check clean.
Manual screenshot of /writing reviewed pre-commit.

Plan: docs/superpowers/plans/2026-06-17-writing-w3-emergence.md
Spec: docs/superpowers/specs/2026-06-17-writing-w3-emergence-design.md
EOF
)"
```

- [ ] **Step 3: Confirm commit + 0 Co-Authored-By**

```bash
cd /home/recoletas/worktrees/writing-kao
git log -1 --format="%h %s"
git log -1 --format=%B | grep -c "Co-Authored-By"
```

### Task 14: Update docs/STATUS.md + docs/LOG.md for commit 2

**Files:**
- Modify: `docs/STATUS.md` (prepend new entry)
- Modify: `docs/LOG.md` (add new section)

- [ ] **Step 1: Add a new entry to `## Recently done` in STATUS.md, above the commit 1 entry:**

```markdown
- YYYY-MM-DD HH:MM CST — Claude on `feat/writing-kao-grammar` (worktree `/home/recoletas/worktrees/writing-kao`, commit `<hash from Task 13 Step 3>`): W3 visual emergence commit 2 — 3-plane z-axis + wallpaperMist + titleGlow. 5 new .theme-kao rules in kao.css. back/window/front z-axis using --z-stage-decor/--z-stage-hero/--z-stage-cta tokens (existing main.css:7-9). wallpaperMist 14s on .editor-container::before + titleGlow 4.8s on .chapter-title-input. Reuses 5C-ship keyframes; no new keyframe definitions. 4 new uiPolish contracts green; 4-contract gate 64/64 green; full test:run 109 files / 769 tests +0 regression; build clean; diff:check clean. Manual screenshot of /writing reviewed pre-commit. Plan: [`docs/superpowers/plans/2026-06-17-writing-w3-emergence.md`](./superpowers/plans/2026-06-17-writing-w3-emergence.md). Branch NOT pushed.
```

- [ ] **Step 2: Add to LOG.md after the commit 1 entry:**

```markdown

## 2026-06-17 - Writing 页 W3 visual emergence commit 2 (3-plane + wallpaperMist + titleGlow)

状态：W3 3 commit ship gate 第 2/3 完成（`commit hash`，未推送）

结果摘要：
- 3 平面 z 轴:back 底 = .folio-surface--paper (z-decor 2),window = .editor-container (z-hero 5),front = .copilot-indicator + .chapter-title-input (z-cta 6)。
- wallpaperMist 14s 慢呼吸 olive gradient 在 editor-container::before。复用 5C ship main.css:427-431 的 @keyframes wallpaperMist,不在 kao.css 重写。
- titleGlow 4.8s 在 chapter-title-input(28px,letter-spacing 0.04em,font-family --font-display / LXGW WenKai)。复用 5C ship main.css:457-460 的 @keyframes titleGlow。
- 5 条新 .theme-kao 规则全在 kao.css,Writing.vue 0 template change。
- 4 个新 uiPolish 契约(3 平面 z + wallpaperMist consumer),全绿。
- 复用 commit 1 立的 reduced-motion a11y 守卫(本 commit 加的 .editor-container::before / .chapter-title-input 已在该 block 覆盖)。

验证：
- `npm run test:run` 通过(109 files / 769 tests,+0 regression)。
- 4-contract gate(64/64)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- 手动截图复盘通过(立体感呼吸 / 标题 glow 合 user 期望)。
- 无 `Co-Authored-By` footer。
```

- [ ] **Step 3: Stage + amend**

```bash
cd /home/recoletas/worktrees/writing-kao
git add docs/STATUS.md docs/LOG.md
git commit --amend --no-edit
git log -1 --format="%h %s"
```

---

## Commit 3 — chapter list motion (侧栏活, hover-only)

### Task 15: Add red contract tests for chapter list motion

**Files:**
- Modify: `src/__tests__/uiPolish.test.js` (append 2 new `it()` blocks)

- [ ] **Step 1: Append at the end of the W3 describe block (before its closing `})`):**

```js

  it('kao.css exposes .theme-kao .chapter-list-item .bookmark-button:hover with animation: kickerPulse (5B-ship keyframe reused)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.chapter-list-item\s+\.bookmark-button:hover\s*\{[^}]*animation:\s*kickerPulse/s,
    )
  })

  it('kao.css exposes .theme-kao .chapter-list-item .bookmark-button:focus with animation: kickerPulse (a11y keyboard nav parity)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.chapter-list-item\s+\.bookmark-button:focus\s*\{[^}]*animation:\s*kickerPulse/s,
    )
  })
```

- [ ] **Step 2: Run red**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js 2>&1 | tail -20
```

Expected: 2 new tests fail. Existing 7 W3 + 57 pre-existing still pass.

### Task 16: Add chapter list motion rule to kao.css

**Files:**
- Modify: `src/styles/themes/kao.css` (append before the reduced-motion block)

- [ ] **Step 1: Open `src/styles/themes/kao.css`. Find the reduced-motion `@media (prefers-reduced-motion: reduce)` block. Insert the following immediately before it:**

```css

  /* Chapter list motion — hover/focus only (default static).
     Reuses @keyframes kickerPulse 1.5s defined in
     CharacterBackdrop.vue:442-445 (5B ship); not redefined.
     Scoped to .chapter-list-item so it doesn't leak to other
     BookmarkButton consumers (WelcomeView / OpeningPage). */
  .theme-kao .chapter-list-item .bookmark-button:hover,
  .theme-kao .chapter-list-item .bookmark-button:focus,
  .theme-kao .chapter-list-item .bookmark-button:focus-visible {
    animation: kickerPulse 1.5s ease-in-out infinite alternate;
    box-shadow: 0 0 0 1px var(--archive-gold);
  }
```

### Task 17: Run green + verify commit 3

**Files:** none

- [ ] **Step 1: Run uiPolish contracts**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js 2>&1 | tail -10
```

Expected: 9 W3 contracts all PASS. Pre-existing 57 + 9 = 66 total.

- [ ] **Step 2: Run 4-contract gate**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js src/__tests__/welcomeView.test.js src/__tests__/workbenchNav.test.js src/__tests__/themeVariantView.test.js 2>&1 | tail -8
```

Expected: 4 files green. 66/66.

- [ ] **Step 3: Run full test:run + build + diff:check**

```bash
cd /home/recoletas/worktrees/writing-kao
npm run test:run 2>&1 | grep -E "Test Files|Tests" | tail -2
npm run build 2>&1 | grep -E "Writing-[A-Z]|built|error" | tail -3
git diff --check 2>&1 && echo "diff:check exit=$?"
```

Expected: 109 files / 771 tests +0 regression (added 9 tests in this plan to 762 base). Build clean. diff:check clean.

### Task 18: Manual screenshot review for commit 3

**Files:** none

- [ ] **Step 1: Start dev server**

```bash
cd /home/recoletas/worktrees/writing-kao
nohup npm run dev > /tmp/vite-w3.log 2>&1 < /dev/null & echo "PID=$!"
sleep 4
```

- [ ] **Step 2: Open http://localhost:5174/writing. Hover a chapter row in the sidebar. Observe 1.5s soft pulse + 1px gold hairline ring. Tab through chapters with keyboard. Same effect on focus. Screenshot.**

- [ ] **Step 3: Hand-tune gate. Adjust kickerPulse duration (1.5s default), pulse intensity (text-decoration alpha), gold ring width (1px default) until user approves.**

- [ ] **Step 4: Stop dev server**

```bash
kill 31279 2>/dev/null; pkill -f "vite" 2>/dev/null; sleep 1; ss -tlnp 2>/dev/null | grep 5174 || echo "5174 free"
```

### Task 19: Stage + commit commit 3 (chapter list motion)

**Files:**
- Git: stage + commit

- [ ] **Step 1: Stage by name**

```bash
cd /home/recoletas/worktrees/writing-kao
git add src/styles/themes/kao.css src/__tests__/uiPolish.test.js
git status
```

- [ ] **Step 2: Commit per `commit-conventions`**

```bash
cd /home/recoletas/worktrees/writing-kao
git commit -m "$(cat <<'EOF'
feat(writing): W3 visual emergence commit 3 — chapter list motion (侧栏活)

Commit 3 of 3 in W3 visual emergence (5C v3.12 emerging pattern).

Hover/focus only — no idle motion in sidebar. 1 new .theme-kao rule
in kao.css for .chapter-list-item .bookmark-button:hover/focus/
focus-visible, with 1.5s kickerPulse + 1px --archive-gold hairline.

Reuses @keyframes kickerPulse defined in CharacterBackdrop.vue:442-445
(5B ship); not redefined in kao.css.

Selector scope: .chapter-list-item prefix prevents leaking to
other BookmarkButton consumers (WelcomeView 3 stacked buttons,
OpeningPage 2 .stage-command stamps). Verified by grep — no
cross-page pollution.

Pre-existing reduced-motion a11y block (added in commit 1) covers
.chapter-list-item .bookmark-button:hover / :focus / :focus-visible
selectors; no extension needed in this commit.

2 new uiPolish contracts: hover + focus selectors both reference
kickerPulse animation.

No new components, no new dependencies, no template changes to
Writing.vue. .chapter-list-item and .bookmark-button are existing
classes from v2 ship.

Verification: 2 uiPolish contracts green (9 in W3 describe block
total); 4-contract gate 66/66 green; full test:run 109 files /
771 tests +0 regression; build clean; git diff --check clean.
Manual screenshot of /writing reviewed pre-commit.

Plan: docs/superpowers/plans/2026-06-17-writing-w3-emergence.md
Spec: docs/superpowers/specs/2026-06-17-writing-w3-emergence-design.md
EOF
)"
```

- [ ] **Step 3: Confirm commit + 0 Co-Authored-By**

```bash
cd /home/recoletas/worktrees/writing-kao
git log -1 --format="%h %s"
git log -1 --format=%B | grep -c "Co-Authored-By"
```

### Task 20: Update docs/STATUS.md + docs/LOG.md for commit 3 (final)

**Files:**
- Modify: `docs/STATUS.md` (prepend final entry)
- Modify: `docs/LOG.md` (add final section)

- [ ] **Step 1: Add to `## Recently done` in STATUS.md, above the commit 2 entry:**

```markdown
- YYYY-MM-DD HH:MM CST — Claude on `feat/writing-kao-grammar` (worktree `/home/recoletas/worktrees/writing-kao`, commit `<hash from Task 19 Step 3>`): W3 visual emergence commit 3 (final) — chapter list motion. Hover/focus only kickerPulse 1.5s on .chapter-list-item .bookmark-button:hover/focus/focus-visible with 1px --archive-gold hairline. Reuses 5B-ship @keyframes kickerPulse. Scoped to .chapter-list-item so it doesn't leak to other BookmarkButton consumers. 2 new uiPolish contracts green; 4-contract gate 66/66 green; full test:run 109 files / 771 tests +0 regression; build clean; diff:check clean. Manual screenshot of /writing reviewed pre-commit. **W3 3 commit ship gate complete** (drop-cap + 3-plane+wallpaperMist+titleGlow + chapter list motion). Plan: [`docs/superpowers/plans/2026-06-17-writing-w3-emergence.md`](./superpowers/plans/2026-06-17-writing-w3-emergence.md). Branch NOT pushed.
```

- [ ] **Step 2: Add to LOG.md after the commit 2 entry:**

```markdown

## 2026-06-17 - Writing 页 W3 visual emergence commit 3 (chapter list motion)

状态：W3 3 commit ship gate 第 3/3 完成（`commit hash`，未推送）。W3 全部 ship。

结果摘要：
- 侧栏章节列表 hover/focus 微弱运动。.theme-kao .chapter-list-item .bookmark-button:hover/:focus/:focus-visible 加 1.5s kickerPulse + 1px gold hairline。
- 复用 5B ship CharacterBackdrop.vue:442-445 的 @keyframes kickerPulse,不在 kao.css 重写。
- 选择器限定 .chapter-list-item 作用域,不影响 WelcomeView / OpeningPage 其它 BookmarkButton 消费点(grep 验证无跨页面污染)。
- 复用 commit 1 立的 reduced-motion a11y 守卫(本 commit 加的 3 个 selector 已在该 block 覆盖)。
- 2 个新 uiPolish 契约(hover + focus 都引用 kickerPulse),全绿。

**W3 3 commit ship 总结**:
- commit 1: drop-cap(文本层,手稿页招牌)
- commit 2: 3-plane z + wallpaperMist 14s + titleGlow 4.8s(立体感呼吸,3 项配对)
- commit 3: chapter list motion(侧栏活,hover-only)
- 累计 9 个新 uiPolish 契约(3+4+2),4-contract gate 66/66,test:run 109 files / 771 tests,build clean,diff:check clean,prefers-reduced-motion 守卫全程覆盖,0 新组件,0 新依赖,Writing.vue 0 template change,do-not-touch 全保留。

验证：
- `npm run test:run` 通过(109 files / 771 tests,+0 regression)。
- 4-contract gate(66/66)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- `prefers-reduced-motion: reduce` a11y 守卫全程生效(commit 1 foundation,commit 2/3 复用)。
- 无 `Co-Authored-By` footer。
- 3 次手动截图复盘通过(drop-cap / 立体感呼吸 / 侧栏活),合 user 期望。
```

- [ ] **Step 3: Stage + amend**

```bash
cd /home/recoletas/worktrees/writing-kao
git add docs/STATUS.md docs/LOG.md
git commit --amend --no-edit
git log -1 --format="%h %s"
```

- [ ] **Step 4: Final 3-commit log overview**

```bash
cd /home/recoletas/worktrees/writing-kao
git log --oneline -5
```

Expected: W3 3 commits on top of `5768475` (v2 ship). Branch ready for user review.

---

## Self-Review

**1. Spec coverage**: All 5 spec items (drop-cap, 3-plane, wallpaperMist, titleGlow, chapter list motion) are covered by 3 commits per spec §4. Reduced-motion a11y guard (§5) is in commit 1 foundation, extended in 2/3 (or rather, all selectors for 2/3 are pre-listed in the commit 1 block). R1-R5 risks (§8) all have mitigations applied in their respective commits.

**2. Placeholder scan**: No "TBD" / "TODO" / "implement later" / "fill in details" / "add appropriate error handling" / "similar to Task N". All CSS code blocks contain actual values. All test code blocks contain actual `it()` bodies with concrete regex patterns. All commands include expected output.

**3. Type consistency**: Class names referenced in tests match class names in CSS rules. `var(--font-display)`, `var(--archive-gold)`, `var(--archive-rose)`, `var(--z-stage-hero)`, `var(--z-stage-decor)`, `var(--z-stage-cta)`, `var(--hairline-soft)` are all tokens already defined in `main.css:7-9` or `kao.css:25-52`. Keyframe names `wallpaperMist`, `titleGlow`, `kickerPulse` are all defined in ship code (`main.css:427-431`, `main.css:457-460`, `CharacterBackdrop.vue:442-445`).

**4. Reversibility matrix**: Each of the 3 commits is independently revertable. Reverting commit 3 leaves drop-cap + 3-plane/wallpaperMist/titleGlow intact. Reverting commit 2 leaves drop-cap + chapter list motion intact (but no z-axis, no ambient). Reverting commit 1 leaves the page with no drop-cap, no reduced-motion foundation, no z-axis, no title glow, no chapter list motion — back to v2 visual (5768475).

**5. Test isolation**: All 9 new uiPolish tests are in a single new `describe` block at the end of `uiPolish.test.js`. They use the existing `readProjectFile` helper. They share no state with existing tests. They only read source files (kao.css, Writing.vue). No mocks, no fixtures, no shared globals.

**6. File:line audit**:
- `main.css:7-9` z-tokens (5A ship) — verified
- `main.css:427-431` wallpaperMist keyframe (5C ship) — verified
- `main.css:457-460` titleGlow keyframe (5C ship) — verified
- `CharacterBackdrop.vue:442-445` kickerPulse keyframe (5B ship) — verified
- `kao.css:25-52` archive-* tokens (5C ship) — verified
- `kao.css:196` (current end of `@layer kao` block) — verified insertion point for new rules

**7. Ambiguity**:
- The duplicated `.theme-kao .chapter-title-input` selector in commit 2 (once in z-axis block, once in titleGlow block) is intentional and noted in Task 10 Step 2. CSS cascade merges them correctly.
- The reduced-motion block in commit 1 lists ALL future animation selectors (commit 2's wallpaperMist + titleGlow, commit 3's motion) even though only commit 1 ships. This is a forward-looking decision: the foundation block establishes the pattern; commits 2 and 3 add rules that the block already covers. If the user prefers commit-by-commit extension, the foundation block can be slimmed to just commit 1's selectors and extended in commits 2/3. **Decision: foundation block lists all selectors** (cleaner, no extension needed).

**8. Manual screenshot per commit**: 5C v3.12 emerging pattern requires user hand-tune moments. The plan includes a manual screenshot review step in each commit (Tasks 6, 12, 18). The dev server is started and stopped per commit (Task 1 stops the existing server, Tasks 6/12/18 start a fresh one). This prevents stale HMR state and matches the "fresh page per commit" pattern from 5C ship.

**9. Test count math**: 762 base (after v2 amend) + 9 new W3 contracts = 771. Verified in Task 17 Step 3.

**10. Branch state**: All 3 commits land on `feat/writing-kao-grammar` on top of v2 ship `5768475`. Total branch state after W3: 4 commits (v2 + W3 × 3). Branch NOT pushed — user reviews locally before push per convention.
