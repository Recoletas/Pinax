# WelcomeView + Experience Pass 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land 4 surgical fixes from `2026-06-11-welcome-experience-pass3-fixes-design.md` (commit `224b69f`) — restore A3 tile-1/6 sizes, wire `--z-stage-cta` token, swap cream fade for dark vignette A, add kao grammar to Experience hero — into `wip/map-realism-render-docs-20260608` with **1 single commit** (per spec §3.5 + §5.3).

**Architecture:** All 4 root causes map to existing surfaces. Zero new components, zero new deps, **0 template changes** (Pass 3 修正 Pass 3 初稿错误: 5 个 `v-if="hasSelectedWorldbook"` 全部保持). CSS-only surgical changes: ~30 lines total. SVG `feGaussianBlur` removed (revert Pass 2 mistake). New CSS `mask-image: radial-gradient` for edge feather. New `mix-blend-mode: multiply` + `isolation: isolate` pair (kao grammar) on Experience hero. Computed property `--hero-image` returns `null` (NOT empty string) so `var()` fallback to `--hero-placeholder-gradient` actually fires.

**Tech Stack:** Vue 3 + Vite + CSS (`mask-image` / `mix-blend-mode` / `isolation: isolate` / CSS custom properties), SVG filter chain (`feTurbulence` + `feDisplacementMap` only — `feGaussianBlur` removed), Vitest contract tests, Playwright screenshots.

**Spec reference**: `docs/superpowers/specs/2026-06-11-welcome-experience-pass3-fixes-design.md` (commit `224b69f`)
**Branch**: `wip/map-realism-render-docs-20260608`
**Commits**: 1 (per spec §3.5 + §5.3)

---

## File Structure

| File | Action | Lines | Responsibility |
|---|---|---|---|
| `src/components/folio/PosterStage.vue` | Modify | L40-43 | Delete 1 `<feGaussianBlur>` element from SVG filter chain (Pass 2 误引入) |
| `src/views/WelcomeView.vue` | Modify | L341-342, L401-402, L598-606, L617-624, L685-692, L757 | 4-5 CSS-only edits: tile-1/6 sizes; swap cream `::before` to dark vignette; add `mask-image` to `.welcome-stage-art`; reduce `.welcome-stage-haze::after` alpha; wire `--z-stage-cta` |
| `src/pages/Experience.vue` | Modify | L1523, L1762, L1762+::after | 3 CSS-only edits: `isolation: isolate` on `.playable-world-strip`; `background-image` + `isolation` + `mix-blend` on `.playable-world-stage-poster`; new `::after` warm-gold multiply overlay |
| `src/__tests__/welcomeView.test.js` | Modify | Append new describe block | +2 contract tests (mask-image presence; vignette A dark multiply) |
| `src/__tests__/uiPolish.test.js` | Modify | Append new describe block | +4 contract tests (CTA token wiring; kao grammar; no `feGaussianBlur stdDeviation="3"`; 5 v-ifs unchanged) |
| `docs/STATUS.md` | Modify | "Recently done" top +1 line | Pass 3 landing entry |
| `docs/LOG.md` | Modify | New 2026-06-11 Pass 3 section | Landing log |
| `docs/demo/pass3-screenshots/` | Create | (new dir) | 6 verification screenshots (welcome-1280/980/760, experience-1280/980/760) |

---

## Pre-flight (read once before starting)

- **Spec** (authoritative): `docs/superpowers/specs/2026-06-11-welcome-experience-pass3-fixes-design.md` (commit `224b69f`)
- **Spec R7 mitigation** (critical, often forgotten): CSS `var()` fallback only fires when variable is **undefined** (not when set to `''` or `none`). The `<script setup>` computed for `--hero-image` MUST return `null` (or unset the var), never `''`.
- **Spec R8 mitigation** (verify before apply): `.welcome-stage-art` is in `WelcomeView.vue` CSS but the actual rendered element may be `.poster-stage__art` from `<PosterStage>` default slot. **Verify in DevTools first**; if wrong, fall back to `:deep(.poster-stage__art)` selector or extend `.welcome-stage-art,` selector list.
- **Spec R5 mitigation** (cascade check): `.playable-world-stage-poster` base rule (line 1762) has 7+ media-query variants. The new `background-image` + `isolation` + `mix-blend-mode` are placed in the base rule; media queries generally don't override these (they only set `max-height` / hide children). If a media query DOES override `background-image` in test, fallback to `:where()` specificity boost.
- **AGENTS.md hard rules**: invoke skills in this order:
  - Before Task 1 (test changes) → `testing-verification`
  - Before Task 3-8 (UI/CSS changes) → `ui-style-check`
  - Before Task 9-10 (full validation) → `testing-verification`
  - Before Task 12-13 (docs sync + commit) → `docs-status-handoff` + `commit-conventions`
- **Test runner**: `npm run test:run -- <path>` (Vitest, not `npm test` which is watch mode)
- **Dev server**: `npm run dev` (Vite, port 5177 default; auto-bumps if occupied)
- **Build**: `npm run build` (Vite production build)
- **Docs build**: `npm run docs:build` (VitePress)
- **Hairline check**: `git diff --check` (whitespace / merge marker safety)

---

## Task 1: Write 6 failing contract tests (TDD red)

**Files:**
- Modify: `src/__tests__/welcomeView.test.js` (append new describe block at end of file)
- Modify: `src/__tests__/uiPolish.test.js` (append new describe block at end of file)

- [ ] **Step 1: Append 2 contract tests to `welcomeView.test.js`**

Open `src/__tests__/welcomeView.test.js`. After the last describe block (currently at L44-71 "welcome view pass 2 — 7-tile A3 collage"), append this new describe block at end of file (L72+):

```js
describe('welcome view pass 3 — vignette A + mask-image edge feather', () => {
  it('uses CSS mask-image: radial-gradient on .welcome-stage-art for edge feather', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toMatch(
      /\.welcome-stage-art\s*\{[^}]*mask-image:\s*radial-gradient/s
    )
  })

  it('replaces cream ::before with dark vignette (rgba 14,6,8 stops, mix-blend-mode: multiply)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    const beforeRule =
      welcomeView.match(/\.welcome-poster-stage::before\s*\{[^}]*\}/s)?.[0] || ''
    expect(beforeRule).toMatch(/rgba\(14,\s*6,\s*8/)
    expect(beforeRule).toMatch(/mix-blend-mode:\s*multiply/)
  })
})
```

- [ ] **Step 2: Append 4 contract tests to `uiPolish.test.js`**

Open `src/__tests__/uiPolish.test.js`. After the last describe block (currently "welcome + experience pass 2 — z-index tokens and isolation"), append this new describe block:

```js
describe('welcome + experience pass 3 — z-stage-cta wiring, kao grammar, no feGaussianBlur, 5 v-if unchanged', () => {
  it('wires .welcome-command-stack to --z-stage-cta token (replaces hardcoded 2)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    const stackRule =
      welcomeView.match(/\.welcome-command-stack\s*\{[^}]*\}/s)?.[0] || ''
    expect(stackRule).toMatch(/z-index:\s*var\(--z-stage-cta\)/)
    expect(stackRule).not.toMatch(/z-index:\s*2\s*;/)
  })

  it('experience world hero uses kao grammar: isolation + mix-blend + background-image var', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const heroRule =
      experience.match(/\.playable-world-stage-poster\s*\{[^}]*\}/s)?.[0] || ''
    expect(heroRule).toMatch(/isolation:\s*isolate/)
    expect(heroRule).toMatch(/mix-blend-mode:\s*multiply/)
    expect(heroRule).toMatch(/background-image:\s*var\(--hero-image/)
  })

  it('experience .playable-world-strip has isolation: isolate (prevents multiply leak)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const stripRule =
      experience.match(/\.playable-world-strip\s*\{[^}]*\}/s)?.[0] || ''
    expect(stripRule).toMatch(/isolation:\s*isolate/)
  })

  it('removes SVG feGaussianBlur stdDeviation="3" from PosterStage filter chain', () => {
    const posterStage = readProjectFile('src/components/folio/PosterStage.vue')

    expect(posterStage).not.toMatch(/<feGaussianBlur[^>]*stdDeviation="3"/)
    // feTurbulence + feDisplacementMap remain (torn paper edge still works)
    expect(posterStage).toMatch(/<feTurbulence/)
    expect(posterStage).toMatch(/<feDisplacementMap/)
  })

  it('preserves 5 v-if="hasSelectedWorldbook" sites in Experience (no template change)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const matches = experience.match(/v-if="hasSelectedWorldbook"/g) || []
    expect(matches.length).toBe(5)
  })
})
```

- [ ] **Step 3: Run tests to verify they all fail (TDD red)**

Run: `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js`
Expected: **6 NEW tests fail**, all pre-existing tests pass. Failure messages will reference "mask-image", "rgba(14, 6, 8)", "z-index: var(--z-stage-cta)", "isolation: isolate", "background-image: var(--hero-image", "feGaussianBlur", "v-if=...5". Pre-existing Pass 2 tests (7-tile A3, 4-prop, isolation, z-index tokens, mechanism-notice) all still pass.

- [ ] **Step 4: Commit TDD-red state**

NOTE: The spec calls for 1 final commit. This intermediate commit captures "tests written" as a checkpoint; we will squash it into the final commit at Task 13 via `git reset --soft HEAD~1` before the final commit. For now, commit the failing tests as checkpoint.

```bash
git add src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js
git commit -m "test(pass-3): add 6 failing contract tests for 4 root-cause fixes"
```

---

## Task 2: G3 fix A — Delete SVG feGaussianBlur from PosterStage

**Files:**
- Modify: `src/components/folio/PosterStage.vue:40-43`

- [ ] **Step 1: Locate the feGaussianBlur element**

Run: `sed -n '34,46p' src/components/folio/PosterStage.vue`
Expected output:
```
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

- [ ] **Step 2: Delete the 3-line feGaussianBlur element**

Edit `src/components/folio/PosterStage.vue` to remove these 3 lines (L40-43, the `<feGaussianBlur` opening tag, the `in="displaced"` attr, the `stdDeviation="3"` attr, and the closing `/>`):

Delete the 3 lines (line 40-43):
```
          <feGaussianBlur
            in="displaced"
            stdDeviation="3"
          />
```

After deletion, the filter chain should read:
```
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.022"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="6"
            result="displaced"
          />
        </filter>
```

- [ ] **Step 3: Run the no-feGaussianBlur test to verify green**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "removes SVG feGaussianBlur"`
Expected: PASS (1 test green). The 5 other Pass 3 tests still fail (we haven't implemented them yet).

- [ ] **Step 4: Verify the feTurbulence + feDisplacementMap are still present**

Run: `grep -n "feTurbulence\|feDisplacementMap\|feGaussianBlur" src/components/folio/PosterStage.vue`
Expected output:
```
27:          <feTurbulence
34:          <feDisplacementMap
```
(NO `feGaussianBlur` line — that's the fix)

---

## Task 3: G3 fix B+C+D — Vignette A + mask-image + haze reduction in WelcomeView

**Files:**
- Modify: `src/views/WelcomeView.vue:598-606` (cream `::before` → dark vignette)
- Modify: `src/views/WelcomeView.vue:617-624` (add `mask-image` to `.welcome-stage-art`)
- Modify: `src/views/WelcomeView.vue:685-692` (reduce `.welcome-stage-haze::after` alpha)

- [ ] **Step 1: Locate the 3 CSS blocks to modify**

Run: `sed -n '598,606p' src/views/WelcomeView.vue; echo "---"; sed -n '617,624p' src/views/WelcomeView.vue; echo "---"; sed -n '685,692p' src/views/WelcomeView.vue`
Expected output: 3 separate CSS blocks exactly as listed in the spec.

- [ ] **Step 2: Replace cream `::before` (L598-606) with dark vignette**

Edit `src/views/WelcomeView.vue`. Replace lines 598-606:

OLD:
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

NEW:
```css
.welcome-poster-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  /* Pass 3: 暗 vignette (A 路径), 让朱红 atmosphere 乘回 */
  background: radial-gradient(ellipse at 50% 50%, transparent 22%, rgba(14,6,8,0.45) 55%, rgba(14,6,8,0.92) 88%, #0e0608 100%);
  mix-blend-mode: multiply;
}
```

- [ ] **Step 3: Add `mask-image` to `.welcome-stage-art` (L617-624)**

Edit `src/views/WelcomeView.vue`. Replace lines 617-624:

OLD:
```css
.welcome-stage-art {
  inset: 0;
  background-image: var(--welcome-reference-image);
  background-position: 60% center;
  background-size: cover;
  filter: saturate(0.95) contrast(0.96) brightness(0.96);
  transform: scale(1.04);
}
```

NEW:
```css
.welcome-stage-art {
  inset: 0;
  background-image: var(--welcome-reference-image);
  background-position: 60% center;
  background-size: cover;
  /* Pass 3: mask + 暗 vignette 双层羽化, 防 mask + cream 的 halo 效应 */
  mask-image: radial-gradient(ellipse 88% 78% at 50% 50%, #000 60%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 88% 78% at 50% 50%, #000 60%, transparent 100%);
  filter: saturate(0.95) contrast(0.96) brightness(0.96);
  transform: scale(1.04);
}
```

- [ ] **Step 4: Reduce `.welcome-stage-haze::after` alpha (L685-692)**

Edit `src/views/WelcomeView.vue`. Replace lines 685-692:

OLD:
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

NEW:
```css
.welcome-stage-haze::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Pass 3: 0.25/0.55 → 0.15/0.35, 避免 vignette + haze 双重 multiply 叠加过暗 */
  background: radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(120, 50, 30, 0.15) 70%, rgba(60, 20, 18, 0.35) 100%);
  mix-blend-mode: multiply;
}
```

- [ ] **Step 5: Run the 2 vignette + mask tests to verify green**

Run: `npm run test:run -- src/__tests__/welcomeView.test.js`
Expected: 2 new tests pass (mask-image + vignette A). The other 4 Pass 3 tests still fail.

- [ ] **Step 6: **R8 mitigation check** — verify the actual rendered DOM element is `.welcome-stage-art`**

Boot dev server: `npm run dev` (background, port 5177)
Open http://localhost:5177/ in Playwright headless:
```js
// Playwright script (one-shot check)
const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('http://localhost:5177/')
  const selectorExists = await page.evaluate(() => {
    return {
      hasWelcomeStageArt: !!document.querySelector('.welcome-stage-art'),
      hasPosterStageArt: !!document.querySelector('.poster-stage__art'),
      computedMaskImage: getComputedStyle(
        document.querySelector('.welcome-stage-art') ||
          document.querySelector('.poster-stage__art')
      ).maskImage
    }
  })
  console.log(JSON.stringify(selectorExists, null, 2))
  await browser.close()
})()
```

Expected output: `hasWelcomeStageArt: true` AND `computedMaskImage: "radial-gradient(...)"`. If `hasWelcomeStageArt: false`, fall back to R8 fix: edit `src/views/WelcomeView.vue` and change `.welcome-stage-art {` to `.welcome-stage-art, :deep(.poster-stage__art) {` — but only if the actual element is `.poster-stage__art`.

Stop dev server: kill the background process.

---

## Task 4: G1 — Restore A3 tile sizes in WelcomeView

**Files:**
- Modify: `src/views/WelcomeView.vue:341-342` (tile-1 size)
- Modify: `src/views/WelcomeView.vue:401-402` (tile-6 size)

- [ ] **Step 1: Change tile-1 size (L341-342)**

Edit `src/views/WelcomeView.vue`. Replace lines 341-342:

OLD:
```
  width: 175px;
  height: 130px;
```

NEW:
```
  width: 210px;
  height: 150px;
```

(Inside `.welcome-collage-tile--1` rule. The new dimensions match A3 mockup 87.5% area for hero-of-collage visual.)

- [ ] **Step 2: Change tile-6 size (L401-402)**

Edit `src/views/WelcomeView.vue`. Replace lines 401-402:

OLD:
```
  width: 160px;
  height: 110px;
```

NEW:
```
  width: 95px;
  height: 95px;
```

(Inside `.welcome-collage-tile--6` rule. Restores small-tile rhythm, not a "big block".)

- [ ] **Step 3: Run pre-existing Pass 2 test to verify tile test still passes**

Run: `npm run test:run -- src/__tests__/welcomeView.test.js -t "7 collage tiles"`
Expected: PASS (the test asserts class names exist, not specific dimensions, so it stays green).

(No new test for tile sizes — visual verification happens in Task 11 with screenshots.)

---

## Task 5: G2 — Wire `--z-stage-cta` token in WelcomeView

**Files:**
- Modify: `src/views/WelcomeView.vue:757`

- [ ] **Step 1: Change `.welcome-command-stack` z-index (L757)**

Edit `src/views/WelcomeView.vue`. Replace line 757:

OLD:
```
  z-index: 2;
```

NEW:
```
  /* Pass 3: 接 Pass 2 创建但漏接的 --z-stage-cta token, 把 CTA 提到 decor 之上 */
  z-index: var(--z-stage-cta);
```

(Inside `.welcome-command-stack` rule. The new value is `var(--z-stage-cta)` which resolves to `6` per `src/styles/main.css:9`.)

- [ ] **Step 2: Run the CTA token wiring test to verify green**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "wires .welcome-command-stack"`
Expected: PASS (1 test green). The 3 other Pass 3 tests still fail (G4 not yet implemented).

---

## Task 6: G4 fix A+B — Hero `background-image` + kao grammar + parent `isolation` in Experience

**Files:**
- Modify: `src/pages/Experience.vue:1523` (add `isolation: isolate` to `.playable-world-strip`)
- Modify: `src/pages/Experience.vue:1762` (add `background-image` + `isolation` + `mix-blend-mode` to `.playable-world-stage-poster`)

- [ ] **Step 1: Add `isolation: isolate` to `.playable-world-strip` parent (L1523)**

Edit `src/pages/Experience.vue`. Find the `.playable-world-strip` rule at line 1523. Read 5 lines for context:
```css
.playable-world-strip {
  display: flex;
  align-items: stretch;
  ...
}
```

Add this line **as the first property** inside the rule block (after the opening brace):
```css
.playable-world-strip {
  /* Pass 3: 让 hero 的 mix-blend-mode: multiply 不 leak 到 .playable-world-strip 外 */
  isolation: isolate;
  display: flex;
  align-items: stretch;
  ...
}
```

- [ ] **Step 2: Add kao grammar to `.playable-world-stage-poster` (L1762)**

Edit `src/pages/Experience.vue`. Find the `.playable-world-stage-poster` rule at line 1762. Read 15 lines for context (it has multi-property layout with `gradient / sash / blade / disc / grid`).

**Append** these 6 lines at the END of the rule block (just before the closing `}`):
```css
  /* Pass 3: hero 真实图层,选世界时显示 world image,空态显示占位 gradient */
  background-image: var(--hero-image, var(--hero-placeholder-gradient));
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  /* Pass 3: kao 语法 — isolation + mix-blend, 跟 cream 空场分层 */
  isolation: isolate;
  mix-blend-mode: multiply;
```

(Important: this is a CSS variable fallback. `--hero-image` will be set by `<script setup>` computed. If the variable is **undefined** (NOT empty string), the fallback to `--hero-placeholder-gradient` fires correctly. See Task 7 step 2 for the computed implementation.)

- [ ] **Step 3: Run the kao grammar test to verify green**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "kao grammar"`
Expected: PASS (1 test green). The 2 other Pass 3 tests still fail (parent isolation test + v-if count test are still pending).

- [ ] **Step 4: Run the parent isolation test to verify green**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "playable-world-strip has isolation"`
Expected: PASS (1 test green).

---

## Task 7: G4 fix C — Add warm-gold multiply overlay `::after` in Experience

**Files:**
- Modify: `src/pages/Experience.vue` (append new `::after` block after the `.playable-world-stage-poster` rule)

- [ ] **Step 1: Add `.playable-world-stage-poster::after` rule**

Edit `src/pages/Experience.vue`. Find the closing `}` of the `.playable-world-stage-poster` rule (just edited in Task 6 step 2). **After** that closing `}`, add this new rule:

```css
.playable-world-stage-poster::after {
  content: "";
  position: absolute;
  inset: 0;
  /* Pass 3: 暖金 multiply overlay, 对应 Welcome .welcome-stage-haze::after 的色温 */
  background: radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(183, 138, 52, 0.22) 80%, rgba(120, 50, 30, 0.18) 100%);
  mix-blend-mode: multiply;
  pointer-events: none;
}
```

- [ ] **Step 2: Add `--hero-placeholder-gradient` to `main.css` `:root`**

Edit `src/styles/main.css`. Find the `:root` block (line 1-10). Add this new CSS variable declaration right after `--z-stage-cta: 6;` (line 9), as a new line 10:

```css
  --z-stage-cta: 6;
  --hero-placeholder-gradient: linear-gradient(180deg, #2a0d12 0%, #1a0809 100%);
```

(Defining the placeholder gradient as a CSS variable so the hero's `var()` fallback chain has a real target. Without this, `var(--hero-placeholder-gradient)` would itself be undefined.)

- [ ] **Step 3: Add `<script setup>` computed property to Experience.vue**

Edit `src/pages/Experience.vue`. Find the `<script setup>` block. Find an appropriate computed property location (look for `const hasSelectedWorldbook = computed(...)`).

**Append** this new computed property right after the existing `hasSelectedWorldbook` computed:

```js
const heroImage = computed(() => {
  // R7 mitigation: return null (not '') when no world, so var() fallback fires
  if (!hasSelectedWorldbook.value) return null
  return worldImageUrl.value || null
})
```

(For this to work, `worldImageUrl` must be an existing ref or computed in the script. If it doesn't exist yet, the implementer can use `ref(null)` as a placeholder; the Pass 3 scope is to make the CSS kao grammar correct. Wiring `worldImageUrl` to actual worldbook data is a Pass 4 concern if it doesn't exist.)

- [ ] **Step 4: Wire `--hero-image` CSS variable on the root element**

Edit `src/pages/Experience.vue`. Find the template root of the Experience page (look for `<div class="playable-world-strip"`). Add a `:style` binding to the same element:

OLD:
```html
<div class="playable-world-strip">
```

NEW:
```html
<div class="playable-world-strip" :style="{ '--hero-image': heroImage }">
```

(When `heroImage` is `null`, Vue's `:style` will not set the inline `--hero-image` property, so the CSS `var(--hero-image, var(--hero-placeholder-gradient))` will fall back to the placeholder gradient — exactly as R7 mitigation requires.)

- [ ] **Step 5: Run the 5 v-if preservation test to verify green**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "preserves 5 v-if"`
Expected: PASS (1 test green).

---

## Task 8: Verify all 6 Pass 3 tests pass (TDD green)

- [ ] **Step 1: Run all Pass 3 contract tests**

Run: `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js`
Expected: **All 6 new Pass 3 tests pass**, plus all pre-existing Pass 2 tests still pass. Total: 2 new welcomeView + 5 new uiPolish = 7 new tests + N pre-existing tests, all green.

- [ ] **Step 2: Run the full test suite to check nothing regressed**

Run: `npm run test:run`
Expected: exit 0, all tests pass.

---

## Task 9: Full validation — build + docs:build

- [ ] **Step 1: Run production build**

Run: `npm run build`
Expected: exit 0, no errors. Output shows `dist/` folder created.

- [ ] **Step 2: Run docs build**

Run: `npm run docs:build`
Expected: exit 0, no errors. Output shows `docs/src/.vitepress/dist/` folder created.

- [ ] **Step 3: Hairline check**

Run: `git diff --check`
Expected: no output (no whitespace issues / merge markers).

---

## Task 10: Take 6 Playwright screenshots for visual verification

**Files:**
- Create: `docs/demo/pass3-screenshots/welcome-1280.png`
- Create: `docs/demo/pass3-screenshots/welcome-980.png`
- Create: `docs/demo/pass3-screenshots/welcome-760.png`
- Create: `docs/demo/pass3-screenshots/experience-1280.png`
- Create: `docs/demo/pass3-screenshots/experience-980.png`
- Create: `docs/demo/pass3-screenshots/experience-760.png`

- [ ] **Step 1: Boot dev server**

Run: `npm run dev` (background, port 5177 default)

- [ ] **Step 2: Take 6 screenshots**

Create a one-off Playwright script `docs/demo/pass3-screenshots/_capture.mjs` (not committed, deleted after):

```js
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'docs/demo/pass3-screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const viewports = [
  { name: '1280', width: 1280, height: 800 },
  { name: '980', width: 980, height: 800 },
  { name: '760', width: 760, height: 800 }
]
const pages = [
  { name: 'welcome', url: '/' },
  { name: 'experience', url: '/experience' }
]

for (const vp of viewports) {
  for (const p of pages) {
    const ctx = await browser.newContext({ viewport: vp })
    const page = await ctx.newPage()
    await page.goto(`http://localhost:5177${p.url}`, { waitUntil: 'networkidle' })
    await page.screenshot({
      path: `${OUT}/${p.name}-${vp.name}.png`,
      fullPage: false
    })
    await ctx.close()
  }
}

await browser.close()
console.log('6 screenshots written to', OUT)
```

Run: `node docs/demo/pass3-screenshots/_capture.mjs`
Expected: 6 PNG files in `docs/demo/pass3-screenshots/`.

- [ ] **Step 3: Visually verify all 4 root causes fixed (eyeball)**

Open each screenshot and confirm per spec §5.1:

| 截图 | 验收点 | 期望 |
|---|---|---|
| `welcome-1280.png` | tile-1 像拼贴主角 (210×150, ~32K px²) | ✓ |
| | 01 / 02 / 03 按钮全可见,01 不被 tile 盖 | ✓ CTA z=6 wins over tile-6 z=6 by paint order |
| | 主图边缘软化,无硬矩形,无 cream halo | ✓ 暗 vignette + mask-image ellipse 88% 78% |
| | 朱红 atmosphere 中心向四周衰减可见 | ✓ radial gradient transparent 22% → rgba(14,6,8,0.92) 88% |
| `welcome-980.png` | 01 按钮可见,主图边缘软化 | ✓ |
| `welcome-760.png` | tiles 隐藏,01 按钮可见 | ✓ (沿用 Pass 2 980px 隐藏规则) |
| `experience-1280.png` | 左侧不再 cream 空场,显示 hero 锚点 | ✓ `--hero-placeholder-gradient` 渲染 |
| | kao 暖金边缘 + 多层 multiply 氛围 | ✓ `::after` 暖金 multiply overlay |
| `experience-980.png` | 同 1280px | ✓ |
| `experience-760.png` | hero 缩到 mobile 适配 | ✓ |

If any验收点 fail, the implementer must fix the relevant CSS and re-screenshot. Do NOT proceed to Task 12 with failing visual acceptance.

- [ ] **Step 4: Stop dev server, delete the capture script**

Stop the dev server background process. Delete `docs/demo/pass3-screenshots/_capture.mjs` (not part of the deliverable).

---

## Task 11: Update docs (STATUS + LOG)

**Files:**
- Modify: `docs/STATUS.md` (add Pass 3 entry to "Recently done" top)
- Modify: `docs/LOG.md` (add Pass 3 landing section at top)

- [ ] **Step 1: Update `docs/STATUS.md`**

Read `docs/STATUS.md` and find the "Recently done" section. Add a new bullet at the TOP of the list (above any other entries):

```markdown
- **2026-06-11** — Pass 3: 4 root-cause fixes (tile sizes, CTA token, vignette A, kao grammar) — spec at `docs/superpowers/specs/2026-06-11-welcome-experience-pass3-fixes-design.md`, screenshots at `docs/demo/pass3-screenshots/`
```

- [ ] **Step 2: Update `docs/LOG.md`**

Read `docs/LOG.md`. Add a new Pass 3 section at the top (above the most recent entry):

```markdown
## 2026-06-11 — Pass 3 landing

4 surgical root-cause fixes (Pass 2 regression rollback):

- **G1** tile sizes: tile-1 `175×130`→`210×150` (A3 mockup 87.5% area), tile-6 `160×110`→`95×95` (rhythm restore)
- **G2** CTA z-index: `.welcome-command-stack` z-index `2` → `var(--z-stage-cta)` (Pass 2 漏接 token, now wired)
- **G3** edge blending: deleted `<feGaussianBlur stdDeviation="3">` from PosterStage SVG filter; cream `::before` → dark vignette A (rgba 14,6,8 stops); added `mask-image: radial-gradient` to `.welcome-stage-art`; reduced `.welcome-stage-haze::after` alpha 0.25/0.55 → 0.15/0.35
- **G4** Experience hero: added `background-image: var(--hero-image, var(--hero-placeholder-gradient))` + kao grammar (isolation + mix-blend) to `.playable-world-stage-poster`; added `isolation: isolate` to `.playable-world-strip` parent (R7 multiply-leak prevention); added warm-gold `::after` overlay; **5 个 v-if="hasSelectedWorldbook" 全部保持不动**

**1 commit**, 0 template changes, ~30 lines CSS total. Verification: 6 new contract tests green + 6 Playwright screenshots at `docs/demo/pass3-screenshots/`.
```

---

## Task 12: Squash checkpoint commits into 1 final commit (per spec §5.3)

The spec requires **1 commit**. The TDD-red checkpoint commit from Task 1 step 4 must be squashed into the final commit, alongside all code changes.

- [ ] **Step 1: Check git log for checkpoint commits**

Run: `git log --oneline -3`
Expected: Pass 2 commit `570e177` + Pass 3 spec commit `224b69f` + (maybe) the TDD-red checkpoint commit from Task 1.

- [ ] **Step 2: Soft-reset to merge the TDD-red checkpoint into the final commit**

If a TDD-red checkpoint commit exists at HEAD:

```bash
git reset --soft HEAD~1
git status
```

(Should show all Task 1-11 changes as staged. The spec commit `224b69f` and Pass 2 commit `570e177` are untouched.)

If no TDD-red checkpoint exists (implementer chose not to commit at Task 1 step 4), skip this step and proceed directly to Step 3.

- [ ] **Step 3: Stage all Pass 3 changes**

```bash
git add src/components/folio/PosterStage.vue
git add src/views/WelcomeView.vue
git add src/pages/Experience.vue
git add src/styles/main.css
git add src/__tests__/welcomeView.test.js
git add src/__tests__/uiPolish.test.js
git add docs/STATUS.md
git add docs/LOG.md
git add docs/demo/pass3-screenshots/
git status
```

Expected: all Pass 3 files staged, no Pass 2 files modified.

- [ ] **Step 4: Verify no `Co-Authored-By` footer (AGENTS.md hard rule)**

Run: `git diff --cached | grep -i "co-authored-by"`
Expected: no output (forbidden per project memory + commit-conventions skill).

- [ ] **Step 5: Create the single Pass 3 commit**

```bash
git commit -m "ui(welcome+experience): apply pass 3 — fix 4 Pass 2 regressions

- G1 tile sizes: tile-1 175x130 -> 210x150 (A3 mockup 87.5% area), tile-6 160x110 -> 95x95
- G2 CTA z-index: .welcome-command-stack z-index 2 -> var(--z-stage-cta) (Pass 2 token leak wired)
- G3 edge blending: delete SVG feGaussianBlur stdDeviation=3; swap cream ::before for dark vignette A (rgba 14,6,8 stops, mix-blend-mode multiply); add mask-image: radial-gradient 88% 78% to .welcome-stage-art; reduce .welcome-stage-haze::after alpha 0.25/0.55 -> 0.15/0.35
- G4 Experience hero: add background-image var(--hero-image, --hero-placeholder-gradient) + kao grammar (isolation: isolate + mix-blend-mode: multiply) to .playable-world-stage-poster; add isolation: isolate to .playable-world-strip parent (multiply-leak prevention); add warm-gold ::after overlay; 5 v-if=hasSelectedWorldbook sites unchanged

6 new contract tests + 6 Playwright screenshots at docs/demo/pass3-screenshots/."
```

- [ ] **Step 6: Verify commit landed correctly**

Run: `git log --oneline -3`
Expected output:
```
<new-sha> ui(welcome+experience): apply pass 3 — fix 4 Pass 2 regressions
224b69f docs(ui-redesign): add Pass 3 spec for 4 Pass 2 regression fixes
570e177 ui(experience): apply pass 2 — stage-command 降级, 浮动层公式统一
```

Run: `git show HEAD --stat | tail -20`
Expected: 8 files changed: PosterStage.vue, WelcomeView.vue, Experience.vue, main.css, 2 test files, STATUS.md, LOG.md, 6 screenshots.

Run: `git show HEAD | grep -i "co-authored-by"`
Expected: no output.

Run: `git status`
Expected: clean (other than the pre-existing 30+ uncommitted changes from the user's broader work).

---

## Self-Review Checklist (controller's inline check)

- [x] **Spec coverage**: §3.1 (G1) → Task 4; §3.2 (G2) → Task 5; §3.3 (G3 fix A/B/C/D) → Task 2 + 3; §3.4 (G4 fix A/B/C) → Task 6 + 7; §5 acceptance → Task 10 screenshots; §5.3 1-commit → Task 12; §3.5 file changes → all Tasks 1-7; R5/R7/R8 mitigations → embedded in Task 3 step 6 + Task 7 steps 1-4.
- [x] **Placeholder scan**: no `TBD` / `TODO` / 「later」 / 「fill in」. All code blocks are complete.
- [x] **Type/identifier consistency**: `--hero-image` / `--hero-placeholder-gradient` consistent across Task 6 step 2, Task 7 steps 1-4. CSS class names `.welcome-stage-art` / `.welcome-poster-stage::before` / `.welcome-stage-haze::after` / `.welcome-command-stack` / `.welcome-collage-tile--1` / `--6` / `.playable-world-stage-poster` / `.playable-world-strip` all match spec §3 + current source.
- [x] **TDD adherence**: Task 1 = red, Task 8 = green. Each fix task has explicit "Run test to verify green" step.
- [x] **Frequent commits**: 1 intermediate checkpoint (Task 1 TDD-red) + 1 final squash (Task 12). Final state is 1 commit per spec.
- [x] **Risk mitigations baked in**: R5 (cascade check) is a section in Task 6 step 2; R7 (var fallback) is in Task 7 steps 1-4; R8 (mask target) is Task 3 step 6.
- [x] **No destructive operations**: git reset --soft only (not --hard), no force-push, no rebases.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-11-welcome-experience-pass3.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints
