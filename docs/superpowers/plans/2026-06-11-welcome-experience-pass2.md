# WelcomeView + Experience Pass 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land 4 fixes from `2026-06-11-welcome-experience-pass2-design.md` v3 (committed `7f98157`) — soft fade main image, 7-tile A3 collage, isolation救01按钮, Experience comprehensive — into `wip/map-realism-render-docs-20260608` with 2 commits.

**Architecture:** All changes are CSS / SVG additions to existing surfaces. Zero new components, zero deps. SVG `feGaussianBlur` appended to existing `feDisplacementMap` chain; new `::before` / `::after` overlays use `mix-blend-mode` scoped by `isolation: isolate`. 3 → 7 collage tiles preserve current SVG mask pipeline (`feDisplacementMap` + `mask-image` polygon data URL); 4 new utility-class prop elements use new `.is-archive-prop` modifier. Experience.vue rules append to existing `@media (max-width: 980px)` block at line 4752 (source order matters for cascade).

**Tech Stack:** Vue 3 + Vite + CSS (custom properties, `mix-blend-mode`, `isolation`), SVG filter chains (`feTurbulence` / `feDisplacementMap` / `feGaussianBlur`), Vitest for contract tests.

**Spec reference**: `docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md` (commit `7f98157`)
**Branch**: `wip/map-realism-render-docs-20260608`
**Commits**: 2 (per spec §3 Step 8 templates) — Welcome 视觉 / Experience 综合

---

## File Structure

| File | Action | Lines | Responsibility |
|---|---|---|---|
| `src/styles/main.css` | Modify | `:root` after line 6; after line 535 | 4 new z-index tokens + `.is-archive-prop` utility class with 3 modifiers |
| `src/views/WelcomeView.vue` | Modify | L27-30, L255-258, L329-400, L501-510, L581-586, L846- | 3→7 tile + 4 prop template; isolation; `::after`/`::before` overlay; 760px hide rule |
| `src/components/folio/PosterStage.vue` | Modify | L34-38 | Append `feGaussianBlur stdDeviation="3"` inside existing `<filter id="pinax-paper-tear">` |
| `src/pages/Experience.vue` | Modify | L2046-2096 (no change to base), L2763, L4794, L4752 block | Z-index token swap; Hero clamp; append 4 rules to 980px block |
| `src/__tests__/welcomeView.test.js` | Modify | After L41 | Add 7-tile + 4-prop existence assertions |
| `src/__tests__/uiPolish.test.js` | Modify | New describe block | Add isolation + 4 z-index token assertions |
| `docs/STATUS.md` | Modify | "Recently done" top + "Next up" cleanup | New 2026-06-11 entry |
| `docs/LOG.md` | Modify | New 2026-06-11 section | Pass 2 landing log |
| `docs/demo/pass2-screenshots/` | Create | (new dir) | 6 verification screenshots |

---

## Pre-flight (read once before starting)

- Spec v3: `docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md`
- Per AGENTS.md hard rules, invoke skills in this order:
  - Before Task 2/8/9/14 (UI/CSS changes) → `ui-style-check`
  - Before Task 11/16/17/18 (test/verify) → `testing-verification`
  - Task 19/20 (docs sync) → `docs-status-handoff`
  - Before Task 12/21 (commits) → `commit-conventions`
- Test runner: `npm run test:run -- <path>` (Vitest, not `npm test` which is watch mode)
- Dev server: `npm run dev` (Vite, port 5177 default; auto-bumps if occupied)
- Build: `npm run build` (Vite production build)
- Docs build: `npm run docs:build` (VitePress)
- Hairline check: `git diff --check` (whitespace / merge marker safety)

---

## Task 1: Add 4 z-index tokens to `main.css`

**Files:**
- Modify: `src/styles/main.css:1-10` (the `:root` block)

- [ ] **Step 1: Verify current state**

Run: `sed -n '1,10p' src/styles/main.css`
Expected output includes:
```
  --z-floating-rail: 220;
  --z-floating-dock: 240;
  --z-floating-action: 260;
```

- [ ] **Step 2: Add 4 new tokens after line 6**

Edit `src/styles/main.css` — find the block:
```css
  --z-floating-rail: 220;
  --z-floating-dock: 240;
  --z-floating-action: 260;
```

Replace with:
```css
  --z-floating-rail: 220;
  --z-floating-dock: 240;
  --z-floating-action: 260;
  --z-stage-decor: 2;
  --z-stage-hero: 5;
  --z-stage-cta: 6;
  --z-mechanism-notice: 248;
```

- [ ] **Step 3: Verify diff**

Run: `git diff src/styles/main.css | head -20`
Expected: 4 lines added, 0 removed, no other changes.

---

## Task 2: Add `.is-archive-prop` utility with 3 modifiers

**Files:**
- Modify: `src/styles/main.css` (append after line 535, the existing `.is-archive-paper img` block)

- [ ] **Step 1: Locate insertion point**

Run: `grep -n "^.is-archive-paper img\|^.is-archive-paper .poster-stage__art" src/styles/main.css`
Expected: 2 lines like `534:.is-archive-paper img,` and `535:.is-archive-paper .poster-stage__art {`

Read 5 lines after line 535 to find the closing `}` of that block:
Run: `sed -n '533,545p' src/styles/main.css`

- [ ] **Step 2: Append `.is-archive-prop` block after `.is-archive-paper img` block closes**

Add to `src/styles/main.css` (immediately after the `.is-archive-paper img, .is-archive-paper .poster-stage__art { ... }` rule block closes):

```css

/* Archive prop — scattered tape / corner-fold / coffee-stain decorations
   in the WelcomeView poster collage. Each modifier sets its own
   width/height/background; the base class shares position + shadow
   semantics with the parent stage. Position (top/left/right) is set
   per-instance in WelcomeView.vue (tied to A3 mock numbers). */
.is-archive-prop {
  position: absolute;
  pointer-events: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.is-archive-prop--tape {
  width: 70px;
  height: 20px;
  background: rgba(245, 235, 221, 0.55);
  border: 1px solid rgba(183, 138, 52, 0.5);
}

.is-archive-prop--fold {
  width: 28px;
  height: 28px;
  background: linear-gradient(225deg, rgba(0, 0, 0, 0.45) 50%, transparent 50%);
  box-shadow: none;
}

.is-archive-prop--stain {
  width: 42px;
  height: 36px;
  background: radial-gradient(ellipse, rgba(120, 70, 30, 0.55) 0%, transparent 60%);
  border-radius: 50%;
  filter: blur(2px);
  box-shadow: none;
}
```

- [ ] **Step 3: Verify diff**

Run: `git diff src/styles/main.css | grep '^+' | head -40`
Expected: ~30 lines added (the new utility + 3 modifiers + comment), 0 removed.

---

## Task 3: Add `isolation: isolate` to `.welcome-stage-poster`

**Files:**
- Modify: `src/views/WelcomeView.vue:255-258`

- [ ] **Step 1: Verify current state**

Run: `sed -n '255,260p' src/views/WelcomeView.vue`
Expected:
```css
.welcome-stage-poster {
  position: relative;
  min-height: clamp(640px, 86vh, 940px);
}
```

- [ ] **Step 2: Add `isolation: isolate`**

Edit `src/views/WelcomeView.vue` — find the block:
```css
.welcome-stage-poster {
  position: relative;
  min-height: clamp(640px, 86vh, 940px);
}
```

Replace with:
```css
.welcome-stage-poster {
  position: relative;
  isolation: isolate;
  min-height: clamp(640px, 86vh, 940px);
}
```

- [ ] **Step 3: Verify diff**

Run: `git diff src/views/WelcomeView.vue | grep -A 1 -B 1 'isolation'`
Expected: 1 line added (`+  isolation: isolate;`), nothing else around it.

---

## Task 4: Append `feGaussianBlur` to PosterStage SVG filter

**Files:**
- Modify: `src/components/folio/PosterStage.vue:34-38`

- [ ] **Step 1: Verify current state**

Run: `sed -n '26,40p' src/components/folio/PosterStage.vue`
Expected output includes:
```xml
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="6"
          />
```

- [ ] **Step 2: Append `feGaussianBlur` inside the `<filter id="pinax-paper-tear">`**

Edit `src/components/folio/PosterStage.vue` — find:
```xml
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="6"
          />
        </filter>
```

Replace with:
```xml
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="6"
            result="displaced"
          />
          <feGaussianBlur
            in="displaced"
            stdDeviation="3"
          />
        </filter>
```

Note: added `result="displaced"` to the existing `feDisplacementMap` so the new `feGaussianBlur` can chain its output via `in="displaced"`. Without explicit chaining, SVG filter primitives default to using the previous primitive's output, but explicit `result` / `in` is more robust.

- [ ] **Step 3: Verify diff**

Run: `git diff src/components/folio/PosterStage.vue`
Expected: `feDisplacementMap` block gains 1 line (`result="displaced"`), new 4-line `feGaussianBlur` block follows.

---

## Task 5: Add `.welcome-stage-haze::after` color-temp overlay

**Files:**
- Modify: `src/views/WelcomeView.vue` (after line 586, the `.welcome-stage-haze { ... }` block closes)

- [ ] **Step 1: Verify current state**

Run: `sed -n '581,590p' src/views/WelcomeView.vue`
Expected: `.welcome-stage-haze { ... }` block with `inset: 0` and 2 linear-gradients, NO `::after` rule currently exists.

Run: `grep -n 'welcome-stage-haze::after\|welcome-stage-haze::before' src/views/WelcomeView.vue`
Expected: empty (confirms no existing pseudo).

- [ ] **Step 2: Append `.welcome-stage-haze::after` rule after the `.welcome-stage-haze` block**

Edit `src/views/WelcomeView.vue` — find:
```css
.welcome-stage-haze {
  inset: 0;
  background:
    linear-gradient(180deg, transparent 0 52%, color-mix(in srgb, var(--archive-olive-strong) 18%, transparent) 78%, color-mix(in srgb, var(--archive-olive-strong) 40%, transparent) 100%),
    linear-gradient(108deg, transparent 0 68%, color-mix(in srgb, var(--archive-gold) 12%, transparent) 68.2% 74%, transparent 74.2%);
}
```

Append immediately after the closing `}`:
```css

.welcome-stage-haze::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(120, 50, 30, 0.25) 65%, rgba(60, 20, 18, 0.55) 100%);
  mix-blend-mode: multiply;
}
```

- [ ] **Step 3: Verify diff**

Run: `git diff src/views/WelcomeView.vue | grep -B 1 -A 8 'welcome-stage-haze::after'`
Expected: 8 new lines (the rule), 0 removed.

---

## Task 6: Add `.welcome-poster-stage::before` cream overlay

**Files:**
- Modify: `src/views/WelcomeView.vue` (after the `.welcome-poster-stage { ... }` block at line 501-510)

- [ ] **Step 1: Verify current state**

Run: `sed -n '501,512p' src/views/WelcomeView.vue`
Confirm the `.welcome-poster-stage` block ends with a `}` and there's no `::before` immediately after.

Run: `grep -n 'welcome-poster-stage::before\|welcome-poster-stage::after' src/views/WelcomeView.vue`
Expected: empty.

- [ ] **Step 2: Append `.welcome-poster-stage::before` rule after the `.welcome-poster-stage { ... }` block**

Edit `src/views/WelcomeView.vue` — locate the line just after the `.welcome-poster-stage { ... }` closing `}` (around line 511).

Append:
```css

.welcome-poster-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background: linear-gradient(180deg, rgba(245, 235, 221, 0.18) 0%, rgba(245, 235, 221, 0.05) 50%, transparent 100%);
  mix-blend-mode: multiply;
}
```

- [ ] **Step 3: Verify diff**

Run: `git diff src/views/WelcomeView.vue | grep -B 1 -A 9 'welcome-poster-stage::before'`
Expected: 9 new lines.

---

## Task 7: Write failing tests for 7-tile + 4-prop + isolation + 4 z-index tokens

**Files:**
- Modify: `src/__tests__/welcomeView.test.js` (append a new `describe` block after existing one)
- Modify: `src/__tests__/uiPolish.test.js` (append a new `describe` block at end of file)

- [ ] **Step 1: Append 7-tile + 4-prop assertions to `welcomeView.test.js`**

Edit `src/__tests__/welcomeView.test.js` — after the existing `describe('welcome view redesign', ...)` block closes (`}`), append:

```javascript

describe('welcome view pass 2 — 7-tile A3 collage', () => {
  it('renders 7 collage tiles (--1 through --7) and 4 archive props', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toContain('welcome-collage-tile--1')
    expect(welcomeView).toContain('welcome-collage-tile--2')
    expect(welcomeView).toContain('welcome-collage-tile--3')
    expect(welcomeView).toContain('welcome-collage-tile--4')
    expect(welcomeView).toContain('welcome-collage-tile--5')
    expect(welcomeView).toContain('welcome-collage-tile--6')
    expect(welcomeView).toContain('welcome-collage-tile--7')

    expect(welcomeView).toContain('is-archive-prop--tape')
    expect(welcomeView).toContain('is-archive-prop--fold')
    expect(welcomeView).toContain('is-archive-prop--stain')
    // 2 tapes + 1 fold + 1 stain = 4 props, but tape class appears twice
    const tapeMatches = welcomeView.match(/is-archive-prop--tape/g) || []
    expect(tapeMatches.length).toBe(2)
  })

  it('removes legacy 3-tile classes (--a/--b/--c)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).not.toContain('welcome-collage-tile--a')
    expect(welcomeView).not.toContain('welcome-collage-tile--b')
    expect(welcomeView).not.toContain('welcome-collage-tile--c')
  })
})
```

- [ ] **Step 2: Append isolation + z-index token assertions to `uiPolish.test.js`**

Edit `src/__tests__/uiPolish.test.js` — at the end of the file (last `})`), append:

```javascript

describe('welcome + experience pass 2 — z-index tokens and isolation', () => {
  it('adds 4 new z-index tokens to main.css :root', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    expect(mainCss).toContain('--z-stage-decor:')
    expect(mainCss).toContain('--z-stage-hero:')
    expect(mainCss).toContain('--z-stage-cta:')
    expect(mainCss).toContain('--z-mechanism-notice:')
  })

  it('isolates blend-mode stacking context on .welcome-stage-poster', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toMatch(/\.welcome-stage-poster\s*\{[\s\S]*?isolation:\s*isolate;[\s\S]*?\}/)
  })

  it('exposes .is-archive-prop utility with 3 modifiers in main.css', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    expect(mainCss).toContain('.is-archive-prop')
    expect(mainCss).toContain('.is-archive-prop--tape')
    expect(mainCss).toContain('.is-archive-prop--fold')
    expect(mainCss).toContain('.is-archive-prop--stain')
  })

  it('replaces hardcoded mechanism-notice z-index with --z-mechanism-notice token', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    expect(experience).toMatch(/\.mechanism-notice\s*\{[\s\S]*?z-index:\s*var\(--z-mechanism-notice\)/)
  })
})
```

- [ ] **Step 3: Run tests, expect failures**

Run: `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js`

Expected:
- ✓ existing tests still pass (Tasks 1-3 already changed `isolation` and z-index tokens; those new assertions pass)
- ✗ `'welcome-collage-tile--1'` etc. (Task 8/9 not done yet)
- ✗ `'is-archive-prop--tape'` etc. (Task 8 not done yet)
- ✗ removes legacy `--a/--b/--c` (Task 8 not done yet)
- ✓ `--z-mechanism-notice` token assertion fails (Task 13 not done yet, regex needs `var(--z-mechanism-notice)` in Experience.vue)

Some tests pass (Tasks 1-3 already done), some fail (Tasks 8/13 pending). This is expected — TDD red phase.

---

## Task 8: Replace 3-tile template with 7-tile + 4-prop template

**Files:**
- Modify: `src/views/WelcomeView.vue:27-30`

- [ ] **Step 1: Verify current state**

Run: `sed -n '25,32p' src/views/WelcomeView.vue`
Expected:
```html
            <span class="welcome-collage-tile welcome-collage-tile--a is-torn-a"></span>
            <span class="welcome-collage-tile welcome-collage-tile--b is-torn-b"></span>
            <span class="welcome-collage-tile welcome-collage-tile--c is-torn-c"></span>
            <span class="welcome-collage-note"></span>
```

- [ ] **Step 2: Replace 3-tile + 1-note with 7-tile + 4-prop**

Edit `src/views/WelcomeView.vue` — find:
```html
            <span class="welcome-collage-tile welcome-collage-tile--a is-torn-a"></span>
            <span class="welcome-collage-tile welcome-collage-tile--b is-torn-b"></span>
            <span class="welcome-collage-tile welcome-collage-tile--c is-torn-c"></span>
            <span class="welcome-collage-note"></span>
```

Replace with:
```html
            <span class="welcome-collage-tile welcome-collage-tile--1 is-torn-a"></span>
            <span class="welcome-collage-tile welcome-collage-tile--2 is-torn-b"></span>
            <span class="welcome-collage-tile welcome-collage-tile--3 is-torn-c"></span>
            <span class="welcome-collage-tile welcome-collage-tile--4 is-torn-a"></span>
            <span class="welcome-collage-tile welcome-collage-tile--5 is-torn-b"></span>
            <span class="welcome-collage-tile welcome-collage-tile--6 is-torn-c"></span>
            <span class="welcome-collage-tile welcome-collage-tile--7 is-torn-a"></span>
            <span class="welcome-collage-note"></span>
            <span class="is-archive-prop is-archive-prop--tape welcome-prop-tape-1"></span>
            <span class="is-archive-prop is-archive-prop--tape welcome-prop-tape-2"></span>
            <span class="is-archive-prop is-archive-prop--fold welcome-prop-fold-1"></span>
            <span class="is-archive-prop is-archive-prop--stain welcome-prop-stain-1"></span>
```

Note:
- `is-torn-a/b/c` per spec §2.2 mask mapping: 1/4/7 → torn-1 (`is-torn-a`), 2/5 → torn-2 (`is-torn-b`), 3/6 → torn-3 (`is-torn-c`)
- `welcome-collage-note` is **preserved** (line 30 of template) — still used by `display: none` shells in tests; existing 980px hide rule keeps it hidden on mobile
- 4 prop spans carry both `.is-archive-prop` (shared) + `.is-archive-prop--tape/--fold/--stain` (modifier from Task 2) + per-position class `.welcome-prop-tape-1` etc. (positions defined in Task 9)

- [ ] **Step 3: Verify diff**

Run: `git diff src/views/WelcomeView.vue | grep -E '^\+.*welcome-collage-tile--[0-9]|^\+.*welcome-prop'`
Expected: 7 tile lines + 4 prop lines = 11 added.

Run: `git diff src/views/WelcomeView.vue | grep -E '^-.*welcome-collage-tile--[abc]'`
Expected: 3 lines removed.

---

## Task 9: Replace 3-tile CSS with 7-tile CSS + 4-prop position rules

**Files:**
- Modify: `src/views/WelcomeView.vue:329-360` (the 3 `.welcome-collage-tile--a/b/c` rules)

- [ ] **Step 1: Verify current state**

Run: `sed -n '329,361p' src/views/WelcomeView.vue`
Expected: 3 blocks for `.welcome-collage-tile--a` / `--b` / `--c`, each ~10 lines with `--welcome-tile-mask` (polygon SVG data URL) and `--welcome-tile-filter` (SVG filter id reference).

Save the 3 polygon SVG data URLs (will be reused — copy from current file):
```
--a: points='0,8 8,0 28,4 48,0 68,6 86,1 100,4 100,28 96,52 100,72 98,94 100,100 76,96 50,100 26,95 4,98 0,90 0,68 4,42 0,18'
--b: points='0,5 18,0 42,3 64,0 88,6 100,2 100,22 96,48 100,72 98,96 100,100 78,98 56,100 30,96 8,100 0,94 0,72 4,46 0,22'
--c: points='0,4 14,0 36,5 58,0 82,3 100,0 100,22 96,48 100,72 96,96 100,100 72,98 48,100 22,96 0,98 0,76 4,52 0,28'
```

- [ ] **Step 2: Replace 3 tile blocks (lines 329-360) with 7 tile blocks**

Edit `src/views/WelcomeView.vue` — find the three blocks `.welcome-collage-tile--a`, `--b`, `--c` (full content lines 329-360 inclusive).

Replace all three blocks with:
```css
.welcome-collage-tile--1 {
  left: 12%;
  top: 14%;
  width: 175px;
  height: 130px;
  background-position: 18% 44%;
  transform: rotate(-7deg);
  z-index: var(--z-stage-decor);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,8 8,0 28,4 48,0 68,6 86,1 100,4 100,28 96,52 100,72 98,94 100,100 76,96 50,100 26,95 4,98 0,90 0,68 4,42 0,18'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-a);
}

.welcome-collage-tile--2 {
  left: 36%;
  top: 8%;
  width: 145px;
  height: 175px;
  background-position: 32% 48%;
  transform: rotate(9deg);
  z-index: calc(var(--z-stage-decor) + 3);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,5 18,0 42,3 64,0 88,6 100,2 100,22 96,48 100,72 98,96 100,100 78,98 56,100 30,96 8,100 0,94 0,72 4,46 0,22'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-b);
}

.welcome-collage-tile--3 {
  left: 26%;
  top: 30%;
  width: 130px;
  height: 95px;
  background-position: 48% 52%;
  transform: rotate(-12deg);
  z-index: var(--z-stage-decor);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,4 14,0 36,5 58,0 82,3 100,0 100,22 96,48 100,72 96,96 100,100 72,98 48,100 22,96 0,98 0,76 4,52 0,28'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-c);
}

.welcome-collage-tile--4 {
  left: 50%;
  top: 28%;
  width: 180px;
  height: 120px;
  background-position: 62% 44%;
  transform: rotate(6deg);
  z-index: calc(var(--z-stage-decor) + 2);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,8 8,0 28,4 48,0 68,6 86,1 100,4 100,28 96,52 100,72 98,94 100,100 76,96 50,100 26,95 4,98 0,90 0,68 4,42 0,18'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-a);
}

.welcome-collage-tile--5 {
  left: 14%;
  top: 50%;
  width: 115px;
  height: 110px;
  background-position: 22% 64%;
  transform: rotate(-4deg);
  z-index: calc(var(--z-stage-decor) - 1);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,5 18,0 42,3 64,0 88,6 100,2 100,22 96,48 100,72 98,96 100,100 78,98 56,100 30,96 8,100 0,94 0,72 4,46 0,22'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-b);
}

.welcome-collage-tile--6 {
  left: 32%;
  top: 56%;
  width: 160px;
  height: 110px;
  background-position: 42% 70%;
  transform: rotate(11deg);
  z-index: calc(var(--z-stage-decor) + 4);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,4 14,0 36,5 58,0 82,3 100,0 100,22 96,48 100,72 96,96 100,100 72,98 48,100 22,96 0,98 0,76 4,52 0,28'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-c);
}

.welcome-collage-tile--7 {
  left: 60%;
  top: 48%;
  width: 120px;
  height: 150px;
  background-position: 68% 60%;
  transform: rotate(-8deg);
  z-index: var(--z-stage-decor);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,8 8,0 28,4 48,0 68,6 86,1 100,4 100,28 96,52 100,72 98,94 100,100 76,96 50,100 26,95 4,98 0,90 0,68 4,42 0,18'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-a);
}

.welcome-prop-tape-1 {
  top: 10%;
  left: 30%;
  transform: rotate(-3deg);
  z-index: calc(var(--z-stage-decor) + 8);
}

.welcome-prop-tape-2 {
  top: 44%;
  right: 8%;
  transform: rotate(6deg);
  z-index: calc(var(--z-stage-decor) + 8);
}

.welcome-prop-fold-1 {
  top: 6%;
  left: 10%;
  z-index: calc(var(--z-stage-decor) + 9);
}

.welcome-prop-stain-1 {
  top: 60%;
  right: 18%;
  transform: rotate(25deg);
  z-index: calc(var(--z-stage-decor) + 7);
}
```

Note:
- Each tile's `width` and `height` are explicit `px` (per spec §2.2 table — A3 mock direct values), replacing the previous `min(28vw, 420px)` / `aspect-ratio` pattern
- `z-index` per spec §2.2 table: tile 1/3/7 use bare token (2), 2/4/6 use offsets, 5 uses -1
- `--welcome-tile-mask` polygon SVGs are the **same 3 polygons** as the old `--a/--b/--c` (preserved verbatim from Step 1 verification); only the tile they're attached to changes
- `--welcome-tile-filter` references existing `welcome-collage-tear-a/b/c` SVG filter defs (`WelcomeView.vue:33-44`, untouched)
- 4 prop classes set position (`top`, `left`/`right`, `transform`) only — width/height/background come from `.is-archive-prop--tape/--fold/--stain` (Task 2)

- [ ] **Step 3: Verify diff**

Run: `git diff src/views/WelcomeView.vue | grep -c '^+.*welcome-collage-tile--[0-9]'`
Expected: 7

Run: `git diff src/views/WelcomeView.vue | grep -c '^+.*welcome-prop-'`
Expected: 4

Run: `git diff src/views/WelcomeView.vue | grep -c '^-.*welcome-collage-tile--[abc]'`
Expected: 3

---

## Task 10: Add 760px hide rule (R7 mitigation) + clean 980px hide rule

**Files:**
- Modify: `src/views/WelcomeView.vue:796-804` (existing 980px block hides `--b/--c/note`)
- Modify: `src/views/WelcomeView.vue:846-` (760px block currently doesn't hide tiles)

- [ ] **Step 1: Verify current 980px hide rule and patch it**

Run: `sed -n '791,810p' src/views/WelcomeView.vue`
Expected:
```css
@media (max-width: 980px) {
  .welcome-stage-poster {
    min-height: 820px;
  }

  .welcome-collage-tile--a {
    width: 38vw;
  }

  .welcome-collage-tile--b,
  .welcome-collage-tile--c,
  .welcome-collage-note {
    display: none;
  }
```

The `.welcome-collage-tile--a` rule (line 796-798) and `.welcome-collage-tile--b, --c, ...note` rule (line 800-804) reference the OLD class names. With 7 new tiles, the 980px breakpoint needs an updated strategy. Per spec §2.2 + §5 R6, at 980px we want to **keep the main poster prominent** by reducing collage density.

Edit `src/views/WelcomeView.vue` — find:
```css
  .welcome-collage-tile--a {
    width: 38vw;
  }

  .welcome-collage-tile--b,
  .welcome-collage-tile--c,
  .welcome-collage-note {
    display: none;
  }
```

Replace with (keep 3 prominent tiles at 980px, hide the rest + note):
```css
  .welcome-collage-tile--3,
  .welcome-collage-tile--5,
  .welcome-collage-tile--6,
  .welcome-collage-tile--7,
  .welcome-collage-note,
  .welcome-prop-tape-2,
  .welcome-prop-stain-1 {
    display: none;
  }
```

This keeps tiles 1, 2, 4 + the 2 left-side props (`tape-1`, `fold-1`) visible at 980px — they sit center-left and don't overlap the full-width `.welcome-command-stack` (R2 button visibility).

- [ ] **Step 2: Add 760px hide rule (R7 mitigation)**

Run: `sed -n '846,855p' src/views/WelcomeView.vue`
Expected: `@media (max-width: 760px) { ... }` block opens around line 846.

Edit `src/views/WelcomeView.vue` — find the opening of the 760px block:
```css
@media (max-width: 760px) {
  .welcome-chrome,
  .welcome-main {
    width: min(100%, calc(100% - 28px));
  }
```

Insert immediately after the opening `{`:
```css
@media (max-width: 760px) {
  .welcome-collage-tile,
  .welcome-collage-note,
  [class*='welcome-prop-'] {
    display: none;
  }

  .welcome-chrome,
  .welcome-main {
    width: min(100%, calc(100% - 28px));
  }
```

This hides all 7 tiles + note + all 4 props on phones (per spec §5 R7 acceptance-3 requires it).

- [ ] **Step 3: Verify diff**

Run: `git diff src/views/WelcomeView.vue | grep -B 1 -A 8 'max-width: 760px'`
Expected: new hide rule inside the 760px block.

Run: `git diff src/views/WelcomeView.vue | grep -E '^-.*welcome-collage-tile--[abc]'`
Expected: 4 lines removed (the old `--a` width rule line + the `--b/--c/note` hide block).

---

## Task 11: Run Welcome-scope tests, all green

**Files:**
- Run only

- [ ] **Step 1: Run targeted tests**

Run: `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js`

Expected output:
```
✓ src/__tests__/welcomeView.test.js (2 tests)
  ✓ welcome view redesign > uses the routed Pinax welcome surface...
  ✓ welcome view pass 2 — 7-tile A3 collage > renders 7 collage tiles...
  ✓ welcome view pass 2 — 7-tile A3 collage > removes legacy 3-tile classes...
✓ src/__tests__/uiPolish.test.js (10+ tests)
  ... (all existing tests pass)
  ✓ welcome + experience pass 2 — z-index tokens and isolation > adds 4 new z-index tokens
  ✓ welcome + experience pass 2 — z-index tokens and isolation > isolates blend-mode...
  ✓ welcome + experience pass 2 — z-index tokens and isolation > exposes .is-archive-prop utility...
```

- [ ] **Step 2: If `--z-mechanism-notice` test fails**

That assertion checks Experience.vue references the token in `.mechanism-notice`. It will fail until Task 13. Skip with `it.skip(...)` is fine? **No** — keep as-is (red), it will turn green in Task 13. This is intentional TDD red on a cross-commit assertion.

If it blocks Commit 1, move that one assertion into a new `it()` in the Task 13 step rather than blocking commit. But preferred: leave it red, document in commit 1 message that it'll turn green in commit 2.

**Decision**: leave assertion in `uiPolish.test.js` as written; commit 1 may have 1 known-red assertion that turns green in commit 2. Commit 1 message notes this explicitly.

- [ ] **Step 3: Run build to make sure no compile breakage**

Run: `npm run build`
Expected: build succeeds, no Vite errors.

---

## Task 12: Commit 1 — Welcome 视觉

**Files:**
- Stage and commit:
  - `src/styles/main.css`
  - `src/views/WelcomeView.vue`
  - `src/components/folio/PosterStage.vue`
  - `src/__tests__/welcomeView.test.js`
  - `src/__tests__/uiPolish.test.js`

- [ ] **Step 1: Inspect what will be committed**

Run: `git status --short src/styles/main.css src/views/WelcomeView.vue src/components/folio/PosterStage.vue src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js`

Expected: 5 lines of ` M` (modified).

Run: `git diff --check src/styles/main.css src/views/WelcomeView.vue src/components/folio/PosterStage.vue src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js`
Expected: empty output (no whitespace/merge errors).

- [ ] **Step 2: Stage the 5 files**

Run:
```bash
git add src/styles/main.css src/views/WelcomeView.vue src/components/folio/PosterStage.vue src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js
```

- [ ] **Step 3: Commit (no Co-Authored-By footer per commit-conventions)**

Run:
```bash
git commit -m "$(cat <<'EOF'
ui(welcome): apply pass 2 — soft fade, 7-tile A3 collage, isolation fix

- PosterStage: feGaussianBlur stdDeviation=3 串在现有 feDisplacementMap 后
- WelcomeView: 3 tile (--a/b/c) → 7 tile (--1..--7) per A3 mock + 4 件 prop (tape × 2 / fold × 1 / stain × 1)
- WelcomeView: .welcome-stage-poster isolation: isolate 救 01 按钮 980px
- WelcomeView: 980px 保留 tile --1/--2/--4 + tape-1/fold-1，隐藏其余;760px 隐藏全部 tile 和 prop (R7)
- WelcomeView: .welcome-stage-haze::after 加色温 multiply (rgba(120,50,30) / rgba(60,20,18))
- WelcomeView: .welcome-poster-stage::before 加 cream multiply (rgba(245,235,221))
- main.css: 4 个新 z-index token (--z-stage-decor: 2 / --z-stage-hero: 5 / --z-stage-cta: 6 / --z-mechanism-notice: 248)
- main.css: .is-archive-prop utility + 3 modifier (--tape / --fold / --stain)
- test: welcomeView.test.js 加 7-tile + 4-prop 断言, uiPolish.test.js 加 isolation + 3 token 断言
- 注: uiPolish.test.js 的 .mechanism-notice z-index var() 断言此 commit 红，commit 2 转绿

Spec: docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md (v3 7f98157)
EOF
)"
```

- [ ] **Step 4: Verify commit landed**

Run: `git log --oneline -2`
Expected: top line is the new commit; `7f98157` (spec v3) is 2nd.

---

## Task 13: Update `.mechanism-notice` z-index to use token

**Files:**
- Modify: `src/pages/Experience.vue:2761-2776` (the `.mechanism-notice` block)

- [ ] **Step 1: Verify current state**

Run: `sed -n '2758,2780p' src/pages/Experience.vue`
Expected to see `z-index: 248;` hardcoded inside the `.mechanism-notice` block.

- [ ] **Step 2: Replace hardcoded z-index with token**

Edit `src/pages/Experience.vue` — find the `.mechanism-notice { ... }` block (~line 2758-2776), within it find:
```css
  z-index: 248;
```

Replace with:
```css
  z-index: var(--z-mechanism-notice);
```

- [ ] **Step 3: Verify diff**

Run: `git diff src/pages/Experience.vue | grep -B 1 -A 1 'z-index'`
Expected: 1 line changed (`-  z-index: 248;` → `+  z-index: var(--z-mechanism-notice);`).

---

## Task 14: Update Hero title clamp at 640px

**Files:**
- Modify: `src/pages/Experience.vue:4787-` (the `@media (max-width: 640px)` block)

- [ ] **Step 1: Verify current state**

Run: `sed -n '4787,4810p' src/pages/Experience.vue`
Expected to find the rule `.playable-world-stage-copy strong { font-size: clamp(38px, 12vw, 54px); }` around line 4794.

- [ ] **Step 2: Reduce clamp values**

Edit `src/pages/Experience.vue` — find:
```css
  .playable-world-stage-copy strong {
    font-size: clamp(38px, 12vw, 54px);
  }
```
(inside the `@media (max-width: 640px)` block)

Replace with:
```css
  .playable-world-stage-copy strong {
    font-size: clamp(32px, 9vw, 46px);
  }
```

- [ ] **Step 3: Verify diff**

Run: `git diff src/pages/Experience.vue | grep -B 2 -A 2 'clamp(32px'`
Expected: 1 line changed.

---

## Task 15: Append 4 new rules to existing 980px block at line 4752

**Files:**
- Modify: `src/pages/Experience.vue:4752-` (append to existing `@media (max-width: 980px)` block)

- [ ] **Step 1: Locate end of 4752 block**

Run: `awk 'NR>=4752 && /^\}/ {print NR": "$0; exit}' src/pages/Experience.vue`
Expected: a line number > 4752 with `}` — that's the closing brace of the 980px block.

Also verify no other media queries are inside that block:
Run: `awk 'NR>=4752 && NR<=4790 {print NR": "$0}' src/pages/Experience.vue`

- [ ] **Step 2: Append 4 rules INSIDE the 980px block, just before the closing `}`**

Edit `src/pages/Experience.vue` — find the line that closes the `@media (max-width: 980px)` block (the `}` you located in Step 1).

Immediately before that closing `}`, insert (note the indentation matches existing rules inside the block — 2 spaces):
```css

  .stage-command {
    min-height: 50px;
    transform: skewX(-8deg);
  }

  .stage-command:hover:not(:disabled) {
    transform: translate3d(0, -2px, 0) skewX(-8deg);
  }

  .playable-world-stage-poster {
    max-height: 280px;
    height: auto;
  }

  .mechanism-notice,
  .quick-notes-rail,
  .game-image-gen-rail {
    bottom: calc(150px + env(safe-area-inset-bottom, 0px));
  }
```

Note per spec §2.4:
- `.stage-command` original (line 2062) is `perspective(600px) rotateY(-18deg) skewX(-14deg)` — at 980px we drop perspective + rotateY, keep only `skewX(-8deg)` (milder tilt)
- hover (line 2091) baseline is `translate3d(0, -2px, 0) perspective(600px) rotateY(-18deg) skewX(-14deg)` — at 980px, match: `translate3d(0, -2px, 0) skewX(-8deg)`
- `min-height: 50px` overrides original 62px (line 2049); 760px breakpoint already has 56px (line 3992)
- `.playable-world-stage-poster` original (line 1764) is `height: 316px`; at 980px cap at 280px to free space for floating dock
- Bottom-`150px` unifies floating layer offset

- [ ] **Step 3: Verify diff**

Run: `git diff src/pages/Experience.vue | grep -c '^+.*stage-command\|^+.*playable-world-stage-poster\|^+.*mechanism-notice'`
Expected: ≥ 4 (rules added).

Run: `git diff src/pages/Experience.vue | grep -B 1 -A 1 '@media'`
Expected: empty (no new `@media` lines, only appends inside existing).

---

## Task 16: Run full test suite

**Files:**
- Run only

- [ ] **Step 1: Run all tests**

Run: `npm run test:run`

Expected:
- All tests pass, including the previously-red `--z-mechanism-notice` assertion (now green after Task 13)
- Total: ~60+ tests across all `src/__tests__/*.test.js` files

- [ ] **Step 2: If any test fails**

Inspect output. Common causes:
- A test relies on the old `welcome-collage-tile--a/b/c` literal — check `grep -rn "welcome-collage-tile--[abc]" src/__tests__/` (should be 0 after Task 7)
- An assertion needs Experience.vue token (Task 13) and was committed in commit 1 — should now pass

Fix and re-run.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: success, no errors.

---

## Task 17: Run `docs:build` (VitePress)

**Files:**
- Run only

- [ ] **Step 1: Run docs build**

Run: `npm run docs:build`

Expected: VitePress build completes without error. May print warnings about dead links — record if any reference Pass 2 files.

- [ ] **Step 2: Whitespace / merge marker safety**

Run: `git diff --check`
Expected: empty output.

---

## Task 18: Dev server smoke test + 6 screenshots

**Files:**
- Create: `docs/demo/pass2-screenshots/` directory and 6 PNG files

- [ ] **Step 1: Start dev server in background**

Run: `npm run dev` (let it print its port; expect `127.0.0.1:5177` or auto-bumped 5178/5179)

If running interactively in this terminal, use `run_in_background: true` via Bash. Wait ~5s for Vite to be ready.

- [ ] **Step 2: Smoke test routes**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5177/welcome`
Expected: `200`

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5177/experience`
Expected: `200` (note: Experience may redirect; record actual code)

- [ ] **Step 3: Create screenshots directory**

Run: `mkdir -p docs/demo/pass2-screenshots`

- [ ] **Step 4: Capture 6 screenshots manually (or via tool)**

Open Chrome DevTools at `http://127.0.0.1:5177/welcome`, use device toolbar (Ctrl+Shift+M), set viewport to:
- 1280 × 800 → `Ctrl+Shift+P` → "Capture full size screenshot" → save as `docs/demo/pass2-screenshots/welcome-1280.png`
- 980 × 800 → repeat → `welcome-980.png`
- 760 × 800 → repeat → `welcome-760.png`

Repeat at `/experience`:
- 1280 × 800 → `experience-1280.png`
- 980 × 800 → `experience-980.png`
- 760 × 800 → `experience-760.png`

Alternative: `npx playwright screenshot --viewport-size 1280,800 http://127.0.0.1:5177/welcome docs/demo/pass2-screenshots/welcome-1280.png` (etc.) if Playwright is installed.

- [ ] **Step 5: Visual acceptance check (per spec §6)**

For each screenshot, eyeball-verify:
- `welcome-1280.png` → main image fades softly into dark bg (no hard polygon cut) + 7 tiles center-2/3 cluster + 01 button clear (R6 — tile 3 at 30%/26% doesn't cover left-edge Act 01)
- `welcome-980.png` → 01 button NOT eaten by tiles (verify visually with Inspect → click button to confirm clickable)
- `welcome-760.png` → only main image, NO tiles (R7 acceptance)
- `experience-1280.png` → `.stage-command` skew much milder than before (was perspective+rotateY+skewX-14, now skewX-8 at 980px+)
- `experience-980.png` → floating dock layers don't overlap; check `.mechanism-notice` computed style: `getComputedStyle(...).zIndex === '248'` (token resolved)
- `experience-760.png` (proxies as 640px viewport too) → hero title clamp doesn't overflow

- [ ] **Step 6: R8 cross-browser check (optional, if Safari available)**

If Safari is reachable, open `http://<host>:5177/welcome` at 1280px and look at the edge halo of `kao.jpg` — if Chrome shows clean blur but Safari shows 1-2px grey band, edit `src/components/folio/PosterStage.vue` to change `stdDeviation="3"` → `stdDeviation="2"`, re-run Task 16/17/18.

- [ ] **Step 7: Stop dev server**

If started in background, kill the process (or use `TaskStop` if started via background Task).

---

## Task 19: Update `docs/STATUS.md`

**Files:**
- Modify: `docs/STATUS.md` ("Recently done" section + "Next up" section)

- [ ] **Step 1: Locate "Recently done" section**

Run: `grep -n "Recently done\|Next up" docs/STATUS.md`
Expected: 2 lines with the section headers.

- [ ] **Step 2: Add new entry at top of "Recently done"**

Edit `docs/STATUS.md` — find the line `## Recently done` (or equivalent header). Insert immediately after that header line (above the most recent existing entry):

```markdown
- 2026-06-11 HH:MM CST — Claude on wip/map-realism-render-docs-20260608: Pass 2 收尾, 4 个 Issue 全部修完(Welcome 主图软过渡 / 01 按钮可见 / 7-tile A3 中密度 / Experience 综合修)。验证: `npm run test:run` (全绿)、`npm run build` (通过)、`npm run docs:build` (通过)、`git diff --check` (clean)。截图见 `docs/demo/pass2-screenshots/`。Spec: `docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md` (v3, `7f98157`)。
```

Replace `HH:MM` with actual time (e.g. `15:42`).

- [ ] **Step 3: Update "Next up" — remove the Pass 2 line**

Look in "Next up" for any line referencing `pass 2` / `2026-06-11` / "Welcome/Experience 修复" / similar. Mark done or delete.

Run: `git diff docs/STATUS.md`
Expected: 1-2 lines added at top of Recently done; possibly 1-2 lines removed from Next up.

---

## Task 20: Update `docs/LOG.md`

**Files:**
- Modify: `docs/LOG.md` (prepend new 2026-06-11 section at top of the most recent log block)

- [ ] **Step 1: Verify log format**

Run: `head -40 docs/LOG.md`
Note the heading style used (e.g. `## 2026-06-10` etc.).

- [ ] **Step 2: Prepend 2026-06-11 entry**

Edit `docs/LOG.md` — add at the top of the file (after any front-matter or initial heading), before the most recent existing date heading:

```markdown
## 2026-06-11

- Pass 2 落地: WelcomeView 主图软过渡 (PosterStage `feGaussianBlur stdDeviation="3"` 串在现有 `feDisplacementMap` 后 + `.welcome-stage-haze::after` 色温 multiply + `.welcome-poster-stage::before` cream multiply)、7-tile A3 中密度 (3 → 7 tile per A3 mock 精确数值 + 4 件 prop: tape × 2 / fold × 1 / stain × 1)、`isolation: isolate` 救 01 按钮 980px (在 `.welcome-stage-poster` 上把 mix-blend-mode stacking context 隔离)、760px 隐藏全部 tile + prop (R7 mitigation)。
- Experience 综合修: `.stage-command` 980px 降级为 `skewX(-8deg)` (base + hover 同步) + `min-height: 50px`、Hero 标题 640px 改 `clamp(32px, 9vw, 46px)` 防溢出、`.playable-world-stage-poster` 980px 加 `max-height: 280px`、浮动层 (mechanism-notice / quick-notes-rail / game-image-gen-rail) 980px 统一 `bottom: calc(150px + env(safe-area-inset-bottom, 0px))`、`.mechanism-notice` z-index 改 `var(--z-mechanism-notice)` 替代硬编码 248。
- main.css 新加 4 个 z-index token (`--z-stage-decor: 2` / `--z-stage-hero: 5` / `--z-stage-cta: 6` / `--z-mechanism-notice: 248`) + `.is-archive-prop` utility 及 3 modifier (`--tape` / `--fold` / `--stain`)。
- Test: `welcomeView.test.js` 加 7-tile + 4-prop 存在性断言、`uiPolish.test.js` 加 isolation + 4 token + Experience mechanism-notice token 断言。
- Spec: `docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md` (v3, commit `7f98157`, 8-subagent review)。验证截图见 `docs/demo/pass2-screenshots/` (6 张, 1280/980/760 × welcome/experience)。
```

- [ ] **Step 3: If R6/R7/R8 fallback triggered, update `docs/src/known-issues.md`**

Run: `grep -l "known-issues" docs/src/*.md`
Expected: `docs/src/known-issues.md`

Only if Task 18 Step 5/6 revealed a regression (e.g. Safari grey band remains, or 7-tile covers Act 01), edit `docs/src/known-issues.md` to add a brief entry. Otherwise skip.

---

## Task 21: Commit 2 — Experience 综合 + docs

**Files:**
- Stage and commit:
  - `src/pages/Experience.vue`
  - `docs/STATUS.md`
  - `docs/LOG.md`
  - `docs/demo/pass2-screenshots/` (6 PNG files)
  - `docs/src/known-issues.md` (only if Task 20 Step 3 modified it)

- [ ] **Step 1: Inspect what will be committed**

Run: `git status --short`
Expected:
- ` M docs/LOG.md`
- ` M docs/STATUS.md`
- ` M src/pages/Experience.vue`
- `?? docs/demo/pass2-screenshots/` (6 PNG files)
- (possibly ` M docs/src/known-issues.md`)

- [ ] **Step 2: Final hairline + test sanity**

Run: `git diff --check`
Expected: empty.

Run: `npm run test:run`
Expected: all green.

Run: `npm run build && npm run docs:build`
Expected: both succeed.

- [ ] **Step 3: Stage files**

Run:
```bash
git add src/pages/Experience.vue docs/STATUS.md docs/LOG.md docs/demo/pass2-screenshots/
```

If `docs/src/known-issues.md` was modified:
```bash
git add docs/src/known-issues.md
```

- [ ] **Step 4: Commit (no Co-Authored-By footer per commit-conventions)**

Run:
```bash
git commit -m "$(cat <<'EOF'
ui(experience): apply pass 2 — stage-command 降级, 浮动层公式统一

- Experience.vue:4752 980px 块 append: .stage-command transform skewX(-8deg) (base + hover 同步) / min-height 50px; .playable-world-stage-poster max-height 280px; 浮动层 (mechanism-notice / quick-notes-rail / game-image-gen-rail) bottom 150px 统一
- Experience.vue:2763 .mechanism-notice z-index 改 var(--z-mechanism-notice) 替代硬编码 248
- Experience.vue:4794 Hero 标题改 clamp(32px, 9vw, 46px) 防 640px 溢出
- docs/STATUS.md: Recently done 顶部加 2026-06-11 记录, Next up 移除 pass 2 line
- docs/LOG.md: 加 2026-06-11 落地记录, 含 4 个 Issue 全部 fix detail
- docs/demo/pass2-screenshots/: 6 张验证截图 (1280/980/760 × welcome/experience)
- 注: 此 commit 让 commit 1 中遗留的 uiPolish.test.js .mechanism-notice z-index var() 断言转绿

Spec: docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md (v3, 7f98157)
EOF
)"
```

- [ ] **Step 5: Verify commit landed**

Run: `git log --oneline -3`
Expected: top 2 lines are the new Pass 2 commits (welcome 视觉 + experience 综合), 3rd is `7f98157` (spec v3).

Run: `git status`
Expected: working tree clean (except possibly untracked files from prior work outside scope).

---

## Acceptance Verification (per Spec §6)

Map each spec §6 acceptance criterion to its task:

| Acceptance | Verified by Task | Pass criterion |
|---|---|---|
| 验收-1 (1280px soft fade + 7 tile + 01 button) | Task 18 Step 5 | `welcome-1280.png` eyeball check |
| 验收-2 (980px 01 button not eaten) | Task 18 Step 5 | `welcome-980.png` eyeball + DevTools click test |
| 验收-3 (760px 7 tile hidden) | Task 18 Step 5 | `welcome-760.png` only shows main image |
| 验收-4 (Experience 1280 mild tilt) | Task 18 Step 5 | `experience-1280.png` `.stage-command` tilt visibly milder |
| 验收-5 (640px hero no overflow) | Task 18 Step 5 | `experience-760.png` proxy + 640 viewport DevTools |
| 验收-6 (980px float layers + token) | Task 18 Step 5 | `experience-980.png` + `getComputedStyle(...).zIndex === '248'` |
| 验收-7 (STATUS.md entry) | Task 19 | `git diff` shows new 2026-06-11 line |
| 验收-8 (LOG.md entry) | Task 20 | `git diff` shows new 2026-06-11 section |
| 验收-9 (2 commits no Co-Authored-By) | Task 12 + Task 21 | `git log --oneline -2` shows both, `git show <hash>` shows no `Co-Authored-By` |

All 9 must pass before declaring Pass 2 complete.

---

## Self-Review

**1. Spec coverage** (every §2-§7 requirement mapped to a Task):

| Spec | Task |
|---|---|
| §2.1 fade — PosterStage feGaussianBlur | Task 4 |
| §2.1 fade — `.welcome-stage-haze::after` color temp | Task 5 |
| §2.1 fade — `.welcome-poster-stage::before` cream | Task 6 |
| §2.1 fade — R1 brightness threshold | Task 18 Step 5 (visual judgment) |
| §2.2 collage — 3 → 7 tile template | Task 8 |
| §2.2 collage — 7-tile CSS w/ A3 numbers | Task 9 |
| §2.2 collage — 4 prop template | Task 8 |
| §2.2 collage — `.is-archive-prop` utility | Task 2 |
| §2.2 collage — mask SVG defs reuse | Task 9 (uses existing `welcome-collage-tear-a/b/c`) |
| §2.2 collage — 6px cream border preserved | Task 9 (`.welcome-collage-tile` shared rule untouched at line 303) |
| §2.2 collage — test contract (7-tile + 4-prop) | Task 7 |
| §2.3 01 button — `isolation: isolate` | Task 3 |
| §2.3 01 button — R3 980px scoped fallback | Task 18 Step 5 (defer until visual verdict) |
| §2.4 experience — `.stage-command` correct origin transform | Task 15 (base + hover both updated) |
| §2.4 experience — `.playable-world-stage-poster` max-height | Task 15 |
| §2.4 experience — 4 new z-index tokens | Task 1 |
| §2.4 experience — `.mechanism-notice` token swap | Task 13 |
| §2.4 experience — float dock bottom unify | Task 15 |
| §2.4 experience — Hero 640px clamp | Task 14 |
| §3 Step 6a TDD assertions | Task 7 |
| §3 Step 6b full test + docs build | Task 16 + 17 |
| §3 Step 7a dev server smoke | Task 18 Step 2 |
| §3 Step 7b 6 screenshots | Task 18 Step 4 |
| §3 Step 7c STATUS.md | Task 19 |
| §3 Step 7d LOG.md + known-issues | Task 20 |
| §3 Step 8 commit 1 + commit 2 | Task 12 + Task 21 |
| §4 hard constraints — 17+ literals preserved | Task 8 (only adds, doesn't touch existing aria-labels / class literals tested at welcomeView.test.js L13-41) |
| §4 hard constraints — 8 `display:none` shells preserved | Task 8 (template unchanged for `welcome-persona-note` / `welcome-dossier` / etc.) |
| §4 hard constraints — SVG mask path preserved | Task 9 (reuses existing 3 polygon SVG data URLs) |
| §5 R1-R8 mitigations | R1: Task 18 visual check; R2: Task 7 covers; R3: Task 18 defer; R4: Task 15 (append to existing block); R5: Task 18 visual; R6: Task 9 + Task 18 (tile 3 position check); R7: Task 10; R8: Task 18 Step 6 |
| §6 acceptance 1-9 | See Acceptance Verification table above |
| §7 out of scope respected | No tasks touch AppShell / WorkbenchPageHero / QuestLog / gm-persona / `src/components/folio/{Bookmark,Folio,Archive}*` |

All §2-§7 spec items have a task. ✓

**2. Placeholder scan**:

- No "TBD", "TODO", "implement later"
- All code blocks complete (no `...` placeholders)
- All file paths absolute or repo-relative; all line numbers cited
- All commit message templates complete inline
- `HH:MM` in Task 19 Step 2 — flagged as fill-in (cannot be predicted at plan-write time; this is fine, it's a runtime value the executor fills in)
- "If R6/R7/R8 fallback triggered" in Task 20 Step 3 — conditional logic with skip path documented

**3. Type consistency**:

- 4 new z-index tokens use kebab-case `--z-stage-decor` / `--z-stage-hero` / `--z-stage-cta` / `--z-mechanism-notice` consistently across Task 1, 7, 9, 13
- 7 tile classes: `welcome-collage-tile--1` through `--7` consistent across Task 7, 8, 9, 10
- 4 prop classes: `is-archive-prop--tape` / `--fold` / `--stain` (utility modifiers) + `welcome-prop-tape-1` / `tape-2` / `fold-1` / `stain-1` (position classes) consistent across Task 2, 7, 8, 9
- SVG filter id `pinax-paper-tear` (Task 4) vs `welcome-collage-tear-a/b/c` (Task 9) — different filters serving different elements; verified by reading source
- `.welcome-stage-haze::after` (Task 5) vs `.welcome-poster-stage::before` (Task 6) — different elements; both rules are new (Step 1 verified via grep)
- `.stage-command` transform: Task 15 changes `skewX(-8deg)` matching both base + hover; consistent with spec §2.4 critical correction

No type drift. ✓

---

**Done.** Plan ready for execution.
