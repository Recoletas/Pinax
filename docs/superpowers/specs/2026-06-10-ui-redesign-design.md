# WelcomeView UI Redesign — Design Spec

**Date**: 2026-06-10
**Status**: Approved v1 — 2026-06-10 (Q1=b / Q2=b / Q3=a per user)
**Owner**: Pinax / text-game-framework
**Scope (in)**: `src/views/WelcomeView.vue`, `src/layouts/AppShell.vue`, `src/pages/Experience.vue` (3-file proof per `kao-ui-direction.md:228-229, 236-238` §11)
**Scope (out — do not touch per `docs/STATUS.md:25-27`)**: `src/stores/gameStore.js`, `src/services/worldbookContextBuilder.js`, `src/services/generation*`, `src/components/StatusBar.vue`

## 1. Goal

Refactor `WelcomeView` from "framey / PPT" to a **Kao archive-folio + olive-gold binder grammar**, prove the same grammar holds in 2 of 3 places (WelcomeView + AppShell + Experience) per `kao-ui-direction.md:236-238`, and add the 4 kao components (FolioSurface / PosterStage / BookmarkButton / ArchiveStrip) currently missing from `src/components/`.

## 2. Visual direction (locked)

**Base palette = the existing `--archive-*` tokens in `main.css:62-72`** (olive / gold / rose / photo / paper / ink). This **overrides** the 5th-subagent recommendation of P5R crimson sea + constructivist `#d11415` red — the user has confirmed the existing green/gold is the right base.

The 7 inspiration sources are reference, not destination:

| Source | What we steal | What we ignore |
|---|---|---|
| **P5R** | slanted wedge composition, 1px hairline, sharp offset shadow, italic display wedge | the crimson palette (overridden) |
| **Arknights** | 3-column workbench density, 1px hairline, monochrome state, dense mono | the dark grey base (overridden) |
| **Reverse: 1999 / Disco Elysium / Kentucky Route Zero** | serif-dominant editorial, paper texture, no `box-shadow`, brush-stroke borders | the 1999 油画 warm earth (we keep olive/gold) |
| **构成主义 (Constructivism)** | asymmetric composition, bold display | the red/black/white palette (overridden) |
| **复古未来 (Retro-futurism)** | monospace + 1px chrome + receding grid | the neon pink/cyan (we use olive/gold) |
| **1999 油画 (Oil painting)** | sfumato edge, brush-stroke border, grain texture | the sienna/umber earth tones (we use olive/gold) |
| **miku v2** (`/home/recoletas/Pictures/micu-out/pinax-mockup/p5r-hero-miku-v2_1.png`) | single-character hero + 3 bookmark CTAs + contact-sheet strip + tracked monospace chrome | the P5R red spine + red hero wedge (both overridden → Q1=b gold spine / Q2=b olive-strong wedge) |

The **frozen visual anchor** for layout/composition is miku v2; the **frozen visual anchor** for palette is the existing `--archive-*` system.

## 3. Locked decisions (grammar-sticky)

1. **Base palette = existing `--archive-*`** (olive + gold + rose + photo + paper + ink). Changing means rewriting hero composition + folio chrome.
2. **WelcomeView = 海报 (poster)**, AppShell = folio chrome, Experience inner = workbench — per `character-driven-arc.md:154-170` and `kao-ui-direction.md:148-160`.
3. **No `box-shadow`, `border-radius` ≤ 2px** — universal rule from all 4 subagent reports, applied **opt-in via the 3 `.is-*` utility classes only** (no global selector). Exception: 1px hairline hover indicator `box-shadow: 0 0 0 1px var(--hairline-accent)` per utility class (e.g. `.is-bookmark:hover { box-shadow: 0 0 0 1px var(--hairline-accent); }`).
4. **3-family typography max** — display serif (`'Noto Serif SC', 'Iowan Old Style'`) for hero/headline + UI sans (`Inter`) for body/CTAs + monospace (`'JetBrains Mono'`) for chrome/status.
5. **Slanted bookmark CTAs** — `clip-path: polygon()` wedge, never rounded buttons. `transform: skewX(-6° to -12°)`.
6. **Hero 'PINAX' wedge color = `var(--archive-olive-strong)`** (Q2=b, base-faithful) — miku v2's red wedge overridden for cohesion. **Bookmark spine color = `var(--archive-gold)`** (Q1=b, base-faithful) — already applied in §5 Phase A `.is-bookmark` utility class.

## 4. Hard constraints (must not regress)

Test contracts (`src/__tests__/welcomeView.test.js` + `src/__tests__/uiPolish.test.js`):

- **14+ class literals** must remain:
  - `welcome-stage-poster` (test:14, uiPolish:61)
  - `welcome-poster-shell` (test:15, uiPolish:62)
  - `welcome-poster-frame` (test:16, uiPolish:63)
  - `welcome-poster-stage` (test:17, uiPolish:64)
  - `welcome-poster-meta__brand` (test:18, uiPolish:65)
  - `featuredPreset.name` + `featuredPreset.genreLabel` (test:19-20, uiPolish:66-67)
  - `aria-label="进入世界入口"` + `aria-label="继续当前故事"` + `aria-label="默认世界入口"` (test:21-22, uiPolish:65, 68, 69)
  - 7× `welcome-{persona-note,dossier,briefing,mission-card,pressure-grid,dossier-route,exit-strip}` (test:23-29, uiPolish:70-76)
- **8 `display:none` empty shells** at `WelcomeView.vue:70-76, 79-80` must remain (7 inside `.welcome-stage` + 1 `welcome-workbench-copy` inside `.welcome-workbench`).
- **Most fragile**: `welcomeView.test.js:18` — `class="welcome-poster-meta__brand">Pinax` is whitespace-sensitive. Pre-Phase-B guard: `grep -n 'welcome-poster-meta__brand' src/views/WelcomeView.vue`.
- **CSS token contracts** at `main.css:13-18` (`--accent-text` + `.btn-primary { color: var(--accent-text) }` regex) and `main.css:368-387` (`modal-fade` / `modal-scale` transition classes) — locked at `uiPolish.test.js:13-17`.

## 5. 3-phase plan

### Phase A — CSS tokens + self-contained utility classes (zero template change)
**Goal**: add new tokens + add 3 self-contained `.is-*` utility classes for the kao grammar (each carries its own `box-shadow: none; border-radius: 0`). No `.vue` template diff. Lowest risk, biggest visual impact. The 3 preserved surfaces (theme-toggle / welcome-poster-shell / welcome-collage-tile) are not touched.

**New tokens** (drop into `main.css` `:root` after L96):
```css
/* Phase A — Kao archive-folio tokens (WelcomeView + AppShell + Experience) */
--hairline-soft:    rgba(122, 111, 96, 0.18);  /* olive-tinted hairline */
--hairline-accent:  rgba(183, 138, 52, 0.40);  /* gold hairline */
--hairline-rose:    rgba(147, 75, 87, 0.40);   /* rose hairline */
--fs-display:       clamp(120px, 18vw, 220px); /* P5R-style hero wedge */
--fs-mono:          10px;
--fs-sm:            12px;
--fs-base:          14px;
--spacing-rhythm:   8px;                       /* 8px baseline grid */
```

**No global selector rule** — Phase A deliberately avoids `[class*="welcome-"] *` so the existing `welcome-poster-shell` 22px offset olive shadow, `welcome-collage-tile` 18px depth + inset highlight shadow, and `.theme-toggle` 999px pill radius are preserved. Each utility class is **self-contained**: opt-in via class name, declares its own `box-shadow: none; border-radius: 0` baseline. The 3 utility classes (add to `main.css` near other utilities):

```css
.is-folio {
  background: linear-gradient(180deg, rgba(232,220,192,0.04), rgba(107,74,43,0.10));
  box-shadow: none;
  border-radius: 0;
  mix-blend-mode: multiply;
  position: relative;
}
.is-bookmark {
  box-shadow: none;
  border-radius: 0;
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 50%, calc(100% - 28px) 100%, 0 100%, 14px 50%);
  border-left: 3px solid var(--archive-gold);
  transform: perspective(1200px) skewX(-8deg);
}
.is-archive-strip {
  box-shadow: none;
  border-radius: 0;
  transform: rotate(-3deg) translateX(8px);
  border: 1px solid var(--hairline-soft);
}
```

**Preserved surfaces** (must NOT regress after Phase A):
- `WelcomeView.vue:169-183` `.theme-toggle` — 999px pill radius, `box-shadow: 0 10px 18px color-mix(...)` (theme depth)
- `WelcomeView.vue:244-258` `.welcome-collage-tile` — 18px depth + 2px inset highlight shadow (collage parallax)
- `WelcomeView.vue:327-338` `.welcome-poster-shell` — 22px olive offset shadow (poster lift)

**Verification**: `npm run test:run` green; visual snapshot 12/12; **1 manual screenshot review** of `/welcome` route required (no P5R-crimson, no SaaS drop-shadow bleed, theme-toggle retains 999px pill, welcome-poster-shell retains 22px olive offset shadow, welcome-collage-tile retains 18px depth shadow). **Low template risk** (no `.vue` template diff) but **HIGH visual regression risk** — an earlier draft scoped `[class*="welcome-"] *` globally and stripped 3 intentional shadows; this draft scopes to opt-in `.is-*` classes only.

### Phase B — 4 kao components + template reshuffle
**Goal**: build 4 missing kao components, replace 2 inlined implementations in `WelcomeView.vue`, keep all 14+ literals + 8 shells.

**New files**:
- `src/components/folio/FolioSurface.vue` — paper-folio surface wrapper
- `src/components/folio/PosterStage.vue` — single-character hero stage (replaces inline at `WelcomeView.vue:23-67`)
- `src/components/folio/BookmarkButton.vue` — slanted wedge CTA (replaces inline at `WelcomeView.vue:57-65`)
- `src/components/folio/ArchiveStrip.vue` — contact-sheet thumbnail strip (new section, lower-right of `welcome-stage`)

**Template changes** (locked, no class rename):
- `WelcomeView.vue:23-67` — wrap with `<PosterStage>` (preserves `welcome-stage-poster` / `welcome-poster-shell` / `welcome-poster-frame` / `welcome-poster-stage` literals)
- `WelcomeView.vue:56-66` — replace `<router-link class="welcome-primary-link">` + `<router-link class="welcome-secondary-link">` with `<BookmarkButton>` × 3 (current 2 + new "翻开新卷")
- `WelcomeView.vue` (new) — add `<ArchiveStrip>` section in lower-right of `welcome-stage` (still inside the locked `welcome-stage-poster`)
- 8 `display:none` shells at L70-76, L79-80 — keep all literals, only reposition inside the reshuffled template

**Pre-Phase-B guards** (manual, 2 commands):
```bash
grep -n 'welcome-poster-meta__brand' src/views/WelcomeView.vue  # must match
grep -nE 'welcome-(persona-note|dossier|briefing|mission-card|pressure-grid|dossier-route|exit-strip|workbench-copy)' src/views/WelcomeView.vue  # 8 lines minimum
```

**Verification**: `npm run test:run` green; `git diff --check` clean; visual snapshot 12/12.

### Phase C — 4-component mount + 3-file reuse + 1 manual screenshot
**Goal**: prove the same kao grammar holds in 2 of 3 places per `kao-ui-direction.md:236-238` §11, with all 4 kao components actually mounted (not just defined).

**Mounts** (4 components, 3 files):
- `FolioSurface` → `AppShell.vue` chrome region (replace frame-y wrapper) + `WelcomeView.vue` poster-frame interior
- `PosterStage` → `WelcomeView.vue` hero stage (replace inline at `WelcomeView.vue:23-67`)
- `BookmarkButton` → `WelcomeView.vue` 3× (current 2 + new "翻开新卷") + `Experience.vue` worldbook entry region 1× (replace current rounded button)
- `ArchiveStrip` → `WelcomeView.vue` lower-right of `welcome-stage` (new section) + `Experience.vue` recently-played region 1×

**Acceptance gate** (3 commands, all must pass):
```bash
# Gate 1: 4-component union grep returns ≥3 files
grep -lE 'FolioSurface|PosterStage|BookmarkButton|ArchiveStrip' \
  src/views/WelcomeView.vue src/layouts/AppShell.vue src/pages/Experience.vue | wc -l
# expected: 3

# Gate 2: each of the 3 files contains ≥1 kao component
for f in src/views/WelcomeView.vue src/layouts/AppShell.vue src/pages/Experience.vue; do
  echo -n "$f: "
  grep -cE 'FolioSurface|PosterStage|BookmarkButton|ArchiveStrip' "$f"
done
# expected: WelcomeView ≥3, AppShell ≥1, Experience ≥2

# Gate 3: 1 manual screenshot of /welcome + /experience routes, recorded in docs/STATUS.md Recently done
```

**Verification**: `npm run test:run` + `npm run build` green; gates 1-3 all pass; **1 manual screenshot review** captured in `docs/STATUS.md` Recently done.

## 6. 4 kao components (Phase B)

| Component | Role | Used in | Status |
|---|---|---|---|
| `FolioSurface` | Paper-folio surface wrapper (paper gradient + grain) | WelcomeView, AppShell, Experience | **NEW** |
| `PosterStage` | Single-character hero stage with 1px gold border | WelcomeView, Experience | **NEW** (replaces inline at `WelcomeView.vue:23-67`) |
| `BookmarkButton` | Slanted wedge CTA with gold spine | WelcomeView (3×), Experience (2×) | **NEW** (replaces inline at `WelcomeView.vue:57-65`) |
| `ArchiveStrip` | Contact-sheet thumbnail strip (rotated color blocks) | WelcomeView (new section), Experience (recently played) | **NEW** |

**No 5-pose U-C table** in this refactor — `character-driven-arc.md:128-134` deferred to follow-up cut per `docs/STATUS.md:25-27` scope.

## 7. Highest-leverage CSS rules (ranked by impact)

Distilled from 4 subagent reports (`docs/plan/p5r-ui-rules.md` + `arknights-ui-rules.md` + `three-games-ui-research.md` + `graphic-movements-ui-rules.md`):

1. **`border-radius: 0` + `box-shadow: none`** on `.is-*` utilities / component root only — opt-in, no global selector
2. **1px hairline** — `border: 1px solid var(--hairline-soft)` for all module boundaries
3. **Slanted bookmark CTA** — `clip-path: polygon()` wedge, `transform: skewX(-6° to -12°)`, gold `border-left` spine
4. **3-family type** — display serif + UI sans + monospace, roles strictly separated
5. **Asymmetric 3-zone grid** — `grid-template-columns: 2fr 5fr 3fr` (or similar) for `welcome-stage`
6. **Tracked monospace chrome** — `letter-spacing: 0.2em` + `text-transform: uppercase` + `font-family: 'JetBrains Mono'` for top/bottom hairlines
7. **Olive-tinted hairline** — `rgba(122, 111, 96, 0.18)` instead of pure white, ties to existing `--archive-olive`

## 8. Risks

- **R1 (top)**: `welcomeView.test.js:18` whitespace-sensitive literal regression — Phase B pre-guard
- **R2**: 8 `display:none` shells accidental removal — Phase B grep full literal list
- **R3**: New utility classes (`.is-folio` / `.is-bookmark` / `.is-archive-strip`) are now opt-in (no global selector) but the current `uiPolish.test.js` doesn't cover them. **Manual screenshot review required per phase** to catch regression on the 3 preserved surfaces (theme-toggle / welcome-poster-shell / welcome-collage-tile) — these are the surfaces an earlier draft would have broken with the global `[class*="welcome-"] *` rule. Follow-up test coverage deferred to a separate task.
- **R4 (resolved)**: miku v2 image uses red `#d11415` for spine + hero wedge, but our base is olive/gold. Per Q1=b / Q2=b, spine = gold, hero wedge = olive-strong. Visual deltas accepted; the miku v2 layout/composition is the anchor, the palette is the existing `--archive-*` system.

## 9. Resolved decisions (2026-06-10)

- **Q1 (bookmark spine color) — RESOLVED (b) base-faithful gold** = `var(--archive-gold)`. Already applied in §5 Phase A `.is-bookmark` utility class.
- **Q2 (hero wedge color) — RESOLVED (b) base-faithful olive-strong** = `var(--archive-olive-strong)`. See §3 decision 6.
- **Q3 (utility class names) — RESOLVED (a) `.is-*` prefix** = `.is-folio` / `.is-bookmark` / `.is-archive-strip`. Already in §5 Phase A.

## 10. Acceptance criteria

- `npm run test:run` green throughout all 3 phases
- WelcomeView visually: single-character hero + 3 bookmark CTAs + contact-sheet strip + tracked monospace chrome + no SaaS feel + olive/gold base
- Phase A: 3-gate (CSS-only, no template diff, 0 regression on 3 preserved surfaces — theme-toggle / welcome-poster-shell / welcome-collage-tile)
- Phase C: 3-gate (4-component grep returns ≥3 files; WelcomeView + AppShell + Experience each contain ≥1 kao component; **1 manual screenshot review** of `/welcome` + `/experience` captured in `docs/STATUS.md` Recently done)
- **Manual screenshot review per phase is required** — automated tests do not catch visual regression on the 3 preserved surfaces or on the new `.is-*` utility classes
- 14+ test contract literals + 8 `display:none` shells preserved
- `docs/STATUS.md` updated after each phase with what's done + what's next

---

## Self-review

**Placeholder scan** (pass 2, post-Q-resolution): All 3 Q1/Q2/Q3 open questions resolved 2026-06-10 (see §9). No remaining TBDs.

**Internal consistency** (pass 2): Q1=b → §3 decision 6 spine = `var(--archive-gold)`, §5 Phase A utility class uses `var(--archive-gold)` for `border-left` ✓. Q2=b → §3 decision 6 wedge = `var(--archive-olive-strong)`, §5 Phase A adds no conflicting rule ✓. Q3=a → §5 Phase A utility classes use `.is-folio` / `.is-bookmark` / `.is-archive-strip` ✓. P5R crimson + constructivist red tokens absent from §5 Phase A (cleanly overridden) ✓.

**Reversibility matrix** (pass 2): With Q1=b / Q2=b / Q3=a locked, the only Phase-A-CSS-reversible parameters are exact hex values of new tokens, halftone opacity, skew angle, font-size clamps. All 4 grammar-sticky decisions (palette / 海报-vs-工作台 / 1px hairline / 2-family type / wedge geometry) are now document-locked.

**File:line audit** (pass 2): All citations re-verified — `main.css:62-72` (`--archive-*`), `WelcomeView.vue:23-67` (inline stage), `WelcomeView.vue:57-65` (inline CTA), `WelcomeView.vue:70-76, 79-80` (8 shells), `uiPolish.test.js:13-17, 61-80`, `welcomeView.test.js:14-29`, `kao-ui-direction.md:228-229, 236-238`, `character-driven-arc.md:154-170`. All match the current repo state as of 2026-06-10.

**Internal consistency**: §3 lists 6 sticky decisions; §4 lists 4 hard-constraint categories; §5 Phase A/B/C references all 6 sticky + all 4 constraints. §6 4 components match §5 Phase B. §7 7 rules consistent with §5 tokens. No contradictions.

**Scope check**: Single implementation plan, 3 product surfaces (WelcomeView + AppShell + Experience), 1 component directory (`src/components/folio/`), plus `main.css` + tests. Focused.

**Ambiguity check**: 
- §5 Phase A says "8px baseline grid" — concrete (`--spacing-rhythm: 8px`).
- §5 Phase B says "replace inline" — concrete file:line citations.
- §6 BookmarkButton "3×" — concrete (current 2 + new "翻开新卷").
- §7 rule 3 says "skewX(-6° to -12°)" — could be tighter. Pinned to `-8deg` in §5 Phase A utility class definition.
- §3 decision 5 says "≤ 2px" — concrete. Exception clause in §3 decision 3 explains when 1px hairline is allowed.

No major ambiguity. Ready for user review.

---

**User feedback pass** (pass 3, 2026-06-10 late): User flagged 4 issues post-commit, all addressed in this revision:
1. **Doc口径 not unified** → Updated `STATUS.md:25, 58` + `PLAN.md:42-43` to lock WelcomeView as Phase 1B first priority with olive/gold base. Removed all "暗红" / "暗朱红" / "构成主义红" mentions. (No color spec change — already olive/gold in §3 decision 1.)
2. **Phase A `*` 通杀 too aggressive** → Replaced `[class*="welcome-"] *` global rule with self-contained `.is-*` classes (each carries its own `box-shadow: none; border-radius: 0`). Existing `welcome-poster-shell` 22px offset olive shadow (`WelcomeView.vue:327-338`), `welcome-collage-tile` 18px depth + inset highlight shadow (`WelcomeView.vue:244-258`), `.theme-toggle` 999px pill radius (`WelcomeView.vue:169-183`) all preserved.
3. **Phase C gate too weak** → Replaced 1-component grep with 3-gate proof: (a) 4-component grep returns ≥3 files; (b) WelcomeView + AppShell + Experience each contain ≥1 kao component; (c) 1 manual screenshot review of `/welcome` + `/experience` captured in `docs/STATUS.md`. All 3 gates required.
4. **"Zero test risk" claim too strong** → Replaced with "Low template risk (no `.vue` template diff), HIGH visual regression risk; 1 manual screenshot review required per phase" in §5 Phase A verification + §8 R3 + §10 Acceptance.
