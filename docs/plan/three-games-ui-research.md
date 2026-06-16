# Three-Game UI Research — Reverse 1999 / Disco Elysium / Kentucky Route Zero

> Pure research output. Concrete CSS-translatable rules. No code changes.
> Anchors: [kao-ui-direction.md](./kao-ui-direction.md), [character-driven-arc.md](./character-driven-arc.md), `docs/demo/kao.jpg`.

1. **Reverse: 1999 signature elements.** Recognizable for hand-painted 1990s oil/watercolor character portraiture (no photo, no 3D, no clean vector) wrapped in **decorative gilded borders**, warm cream backgrounds, classical serif wordmarks with small-caps + tracking, and ornamental flourishes (asterisks, stars, fleurons) framing UI chrome — the character is the "illustration", not a sprite. `kao-ui-direction.md:21-46` ("cream paper white / light ochre page", "metallic gold / warm amber highlight", "斜线 / 拼贴 / 跨页 / 撕边 / 照片堆叠").

2. **油画 / 水彩 treatment (painterly feel in CSS).** Layered noise + warm gradient base + `mix-blend-mode: multiply` for canvas grain, plus SVG hand-drawn brush strokes as borders (never PNG clipart). Concrete CSS:
   ```css
   .painterly-surface {
     background:
       linear-gradient(180deg, #f5ebdd 0%, #e9dcc8 100%),
       url("/textures/canvas-grain.svg"); /* ~6% opacity noise */
     background-blend-mode: multiply;
   }
   .painterly-border {
     border-image: url("/textures/brush-stroke.svg") 28 round;
     /* or */ box-shadow: inset 0 0 0 1px rgba(183,138,52,0.35);
   }
   .vellum-overlay {
     background: rgba(245,235,221,0.08);
     mix-blend-mode: multiply;
   }
   ```
   Avoid `filter: blur()` on text. Use SVG `feTurbulence` baked at build time, not runtime.

3. **装饰艺术 (Art Deco) typography.** Geometric high-contrast serif, all-caps at small size with **generous tracking**, thin/thick weight contrast as ornament, single hairline rules as dividers, corner ornaments via inline SVG (no images). Concrete CSS:
   ```css
   .deco-eyebrow {
     font-family: "Playfair Display", "Cormorant SC", serif;
     font-weight: 500;
     text-transform: uppercase;
     letter-spacing: 0.18em;        /* critical: airy */
     font-size: 0.72rem;
     color: var(--gold-1);          /* #b78a34 per kao-ui-direction.md:91 */
   }
   .deco-title {
     font-family: "Playfair Display", serif;
     font-weight: 700;
     font-size: clamp(2rem, 5vw, 4.5rem);
     line-height: 0.95;
     letter-spacing: -0.01em;
   }
   hr.deco { border: 0; height: 1px; background: var(--gold-2); width: 4rem; }
   ```
   Matches `kao-ui-direction.md:106-120` ("Display serif ... 书卷感", "UI sans ... 紧凑、干净、现代").

4. **Disco Elysium editorial patterns.** Heavy **Didone** display headlines (think *Bodoni* / *Playfair Black*), monospace body in long-form sections, off-white paper with subtle grain, two-column asymmetric grid (left = sticky header/control, right = scrollable content), hand-drawn icons (replace Bootstrap/Heroicons with ink-sketched SVGs), and "diary" affordances — margin scribbles, red strikethrough, taped corners. No rounded corners, no shadows, no gradients on cards.
   ```css
   .de-article {
     font-family: "IBM Plex Mono", "JetBrains Mono", monospace;
     font-size: 0.95rem;
     line-height: 1.65;
     color: var(--ink-1);
   }
   .de-headline {
     font-family: "Bodoni Moda", "Playfair Display", serif;
     font-weight: 900;
     font-size: clamp(3rem, 7vw, 6rem);
     line-height: 0.9;
   }
   .de-grid { display: grid; grid-template-columns: minmax(220px, 1fr) 3fr; gap: 2.5rem; }
   .de-card { background: transparent; border: 1px solid var(--ink-2); border-radius: 0; }
   ```

5. **Kentucky Route Zero magazine patterns.** Multi-column flowing text (2–3 cols), **drop caps** on opening paragraphs, photo-illustration integrated as full-bleed within prose (not in a separate "media" block), faded/desaturated palette with occasional saturated accent, marginalia in the gutter (rotated -90deg small caps), and Act/Scene dividers as ornamental SVG. Concrete CSS:
   ```css
   .krz-prose { columns: 2 18rem; column-gap: 2.5rem; column-rule: 1px solid rgba(93,81,71,0.25); }
   .krz-prose p:first-of-type::first-letter {
     font-family: "Playfair Display", serif;
     font-weight: 700;
     font-size: 4.2em;
     float: left; line-height: 0.85;
     margin: 0.05em 0.1em 0 0;
     color: var(--verdigris-1);
   }
   .krz-marginalia {
     writing-mode: vertical-rl;
     font-family: "Cormorant SC", serif;
     font-size: 0.7rem; letter-spacing: 0.12em;
     color: var(--ink-2); opacity: 0.6;
   }
   .krz-divider { background: url("/ornaments/krz-rule.svg") center/contain no-repeat; height: 3rem; }
   ```
   Aligns with `kao-ui-direction.md:62-78` ("Paper surface", "Photo surface", "相片条 / 缩略目录").

6. **Common DNA across the 3.** (a) Paper-feel substrate, never pure `#fff` or pure `#000` — use `paper-1 #f5ebdd` / `ink-1 #271d18` (`kao-ui-direction.md:88-96`). (b) Illustration or hand-set typography replaces photography in chrome. (c) Serif-dominant, with sans reserved for interactive controls only. (d) **No `box-shadow`** for depth — depth comes from layering, hairlines, and slight rotation (1–3°). (e) Hand-drawn ornament (SVG, not raster) at every section break. (f) Asymmetric grids, never centered card stack.

7. **Anti-patterns (kitsch traps to avoid).** (a) Rusty metal / brushed-brass texture on every button — gate to ≤2 places. (b) Global sepia `filter: sepia(1)` — kills contrast. (c) Generic "old book" / "parchment" clipart or stock burnished corners. (d) Distressed/grunge texture applied to body text (illegible). (e) Curling page-curl CSS on every card (camp). (f) Overuse of `text-shadow` for "emboss" effect. (g) 100% opacity black on warm paper — use `ink-1 #271d18` so it reads as ink, not hole.

8. **5–7 highest-leverage CSS-translatable rules for our refactor.**
   1. **Paper token (mandatory base):**
      ```css
      :root {
        --paper-1: #f5ebdd; --paper-2: #e9dcc8;
        --ink-1: #271d18;    --ink-2: #5d5147;
        --verdigris-1: #2f6e64; --verdigris-2: #173c37;
        --gold-1: #b78a34;   --gold-2: #e0ae68;
        --rose-1: #934b57;
      }
      .surface-paper { background: linear-gradient(180deg, var(--paper-1) 0%, var(--paper-2) 100%); }
      ```
      (`kao-ui-direction.md:88-96`)

   2. **Texture overlay (multiply, never screen):**
      ```css
      .paper-grain::after {
        content: ""; position: absolute; inset: 0; pointer-events: none;
        background: url("/textures/canvas-grain.svg") repeat;
        mix-blend-mode: multiply; opacity: 0.06;
      }
      ```

   3. **Type role split (display serif vs UI sans):**
      ```css
      .display { font-family: "Playfair Display", "Source Han Serif SC", serif; }
      .ui      { font-family: "Inter", "PingFang SC", system-ui, sans-serif; }
      ```

   4. **Art Deco small-caps eyebrow:**
      ```css
      .eyebrow { font-family: "Playfair Display", serif; text-transform: uppercase;
                 letter-spacing: 0.18em; font-size: 0.72rem; color: var(--gold-1); }
      ```

   5. **Brush-stroke / hairline borders, no box-shadow:**
      ```css
      .folio-edge   { box-shadow: inset 1px 0 0 rgba(93,81,71,0.18), inset -1px 0 0 rgba(93,81,71,0.12); }
      .brush-border { border-image: url("/textures/brush-stroke.svg") 28 round; }
      .hard-rule    { border: 0; border-top: 1px solid var(--ink-2); }
      ```

   6. **Bookmark / CTA slice (skewed, no radius):**
      ```css
      .bookmark-cta { transform: skewX(-8deg); border-radius: 0;
                      background: var(--verdigris-1); color: var(--paper-1);
                      padding: 0.6rem 1.4rem; letter-spacing: 0.08em; }
      .bookmark-cta > * { transform: skewX(8deg); } /* un-skew children */
      ```
      Honoring `kao-ui-direction.md:76-78` ("Bookmark surface ... 强方向性斜切") and §6 `BookmarkButton` component (`kao-ui-direction.md:130-134`).

   7. **Drop cap + multi-column prose (KRZ / Disco hybrid):**
      ```css
      .prose-manuscript { columns: 2 20rem; column-gap: 2.5rem; font-family: "Playfair Display", serif;
                          line-height: 1.7; color: var(--ink-1); }
      .prose-manuscript > p:first-of-type::first-letter {
        font-family: "Playfair Display", serif; font-weight: 700; font-size: 4em;
        float: left; line-height: 0.85; margin: 0.05em 0.12em 0 0; color: var(--verdigris-1);
      }
      ```
      Supports §7.4 `Writing` / `ProseEssay` "手稿页 / 成稿页" (`kao-ui-direction.md:191-198`).

   8. **Asymmetric folio grid (2-col, not card stack):**
      ```css
      .folio-grid { display: grid; grid-template-columns: minmax(240px, 1fr) 3fr;
                    gap: 2.5rem; align-items: start; }
      ```
      Bans the "SaaS card stack" anti-pattern in `character-driven-arc.md:94` ("不做 SaaS 卡片堆叠式布局").
