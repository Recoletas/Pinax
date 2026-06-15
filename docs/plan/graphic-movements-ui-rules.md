# Graphic Design Movements + miku v2 Reverse-Engineering

## 1. 构成主义 (Constructivism) rules
- Bold geometric sans, all-caps, condensed, **negative letter-spacing** `letter-spacing: -0.02em` (Lissitzky *Beat the Whites with the Red Wedge*).
- Diagonal / wedge compositions: `clip-path: polygon(0 100%, 100% 100%, 0 0)` on accent blocks; `transform: rotate(-11deg) skewX(-6deg)`.
- Limited palette: `#d11415` red / `#0a0a0a` black / `#f4ede1` off-white; `--constructivist-red: #d11415`.
- Asymmetric grid: hero offset with `margin-left: 8%` on poster + `margin-right: 2%` on meta, not centered.
- Photomontage tiles: absolutely positioned `<span>` with `transform: rotate(-11deg)` (matches existing `kao-ui-direction.md:124-140` collage tile wedge).
- Typographic hierarchy: kicker 10px / 0.24em tracking, display 96-140px / italic, index numbers 30-74px (cf. current `WelcomeView.vue:228-242` vertical PINAX).

## 2. 复古未来 (Retro-futurism) rules
- Monospace display: `font-family: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace; font-weight: 700`.
- 1px hairline chrome: `border: 1px solid rgba(255,255,255,0.1); background: rgba(10,14,20,0.6);` for instrument-panel surfaces.
- Receding grid: `background-image: linear-gradient(rgba(255,42,109,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,42,109,0.18) 1px, transparent 1px); background-size: 48px 48px; transform: perspective(600px) rotateX(60deg);` vanishing-point floor.
- Neon accent: `--neon-pink: #ff2a6d; --neon-cyan: #05d9e8; --neon-red: #ff3b3b; text-shadow: 0 0 8px var(--neon-pink), 0 0 16px rgba(255,42,109,0.4);`.
- Chrome / silver plate: `background: linear-gradient(180deg, #d8d8e0 0%, #8a8a96 48%, #d8d8e0 100%); -webkit-background-clip: text;` for chrome type.
- HUD segments: 6-10px corner clips, `clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);`.

## 3. 1999 油画 (Oil painting) rules
- Warm earth palette: `--oil-bone: #e8dcc0; --oil-umber: #6b4a2b; --oil-sienna: #a0522d; --oil-rose: #934b57; --oil-ink: #2a1f17;` (largely reuses existing `--archive-*` per `main.css:62-72`).
- Brush-stroke texture: SVG noise overlay `background-image: url("data:image/svg+xml;utf8,<svg ...><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect filter='url(%23n)'/></svg>"); opacity: 0.06; mix-blend-mode: multiply;`.
- Sfumato soft edge: `filter: blur(0.6px) contrast(0.96);` on hero portrait; `--oil-soft-shadow: drop-shadow(0 4px 18px rgba(42,31,23,0.32)) drop-shadow(0 0 2px rgba(42,31,23,0.5));`.
- Glazing (layered translucent tint): `background: linear-gradient(180deg, rgba(232,220,192,0) 0%, rgba(107,74,43,0.18) 100%);` over poster base.
- Classical vignette: `background: radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(42,31,23,0.35) 100%);`.

## 4. miku v2 reverse-engineering (top→bottom, image observed)
- **Top-left chrome `Border Kingdom | 2026.01`** — hairline uppercase tracked label. CSS: `font-family: monospace; font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(255,255,255,0.55); border-top: 1px solid rgba(255,255,255,0.18); padding-top: 6px;`.
- **Top-right chrome `PINAX / Virtual GM`** — same family, sans emphasis. CSS: `font-family: 'Inter', sans-serif; font-size: 10px; letter-spacing: 0.22em;`.
- **Hero character + open book** — half-length pose, chiaroscuro rim light, classical oil-painting composition. CSS: `filter: contrast(1.05) saturate(0.92) drop-shadow(0 8px 30px rgba(0,0,0,0.5));` over a photo surface.
- **Huge "PINAX" red italic display** — constructivist wedge, ~30-40% viewport width, leaning ~-6°. CSS: `font-family: 'Bebas Neue' or 'Playfair Display Black Italic'; font-size: clamp(120px,18vw,220px); font-style: italic; font-weight: 900; color: #d11415; transform: skewX(-6deg) translateX(-4%); letter-spacing: -0.04em;`.
- **Sub-tagline `虚拟集·翻一页, 便是另一段旅途`** — small serif italic, low contrast. CSS: `font-family: 'Noto Serif SC', 'Iowan Old Style', serif; font-style: italic; font-size: 14px; color: rgba(245,235,221,0.7); letter-spacing: 0.06em;`.
- **3 bookmark CTAs `01 进入世界 / 02 继续冒险 / 03 翻开新卷`** — left-aligned vertical stack, red numerals, white text, slight skew. CSS mirrors `WelcomeView.vue:584-659` (skewed polygons, `clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 50%, calc(100% - 28px) 100%, 0 100%, 14px 50%)`); add `border-left: 3px solid #d11415;` for the bookmark spine.
- **Contact-sheet thumbnails (3 small color cards bottom-right)** — retro-futurism contact-print, slight rotation. CSS: `width: 64px; height: 84px; border: 1px solid rgba(255,255,255,0.1); background: <flat color sample>; transform: rotate(-3deg) translateX(8px); box-shadow: 0 8px 16px rgba(0,0,0,0.4);` — colors `#3a6b6f / #8a6a3b / #6b3a4a` from the mockup.
- **Footer `卷档案 · 01 / 12 · 2026.01.10`** — monospace tracked metadata. CSS: `font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.2em; color: rgba(255,255,255,0.45); display: flex; justify-content: space-between;`.

## 5. miku v2 vs current WelcomeView diff (gaps)
1. **No huge red italic `PINAX` display** — current has only small upright `Pinax` in chip (`:563-570`); mockup demands 120-220px wedge.
2. **No 3-step bookmark CTA stack** — current has 2 entries (`01 进入世界` / `02 继续` at `:57-65`); mockup shows `01/02/03` triplet with red numeric spine.
3. **No `虚拟集·翻一页, 便是另一段旅途` italic serif tagline** — no equivalent tagline in current code.
4. **No monospace tracked top/bottom chrome** (`Border Kingdom | 2026.01` / `卷档案 · 01/12 · 2026.01.10`) — current chrome only carries the appmark + theme toggle (`:3-19`).
5. **No contact-sheet color thumbnails** — current has no thumbnail strip; only the 3 collage tiles using `kao.jpg` reference (`:260-285`).
6. **No red wedge / constructivist red accent in palette** — current palette is purely `--archive-*` earth tones (`main.css:62-72`); mockup needs `--constructivist-red: #d11415` per §1.
7. **No retro-futurism monospace + grid background** — current uses paper gradient + diagonal overlay (`:104-132`); mockup needs the 48px receding grid + neon accent.

## 6. Highest-leverage CSS-translatable rules
1. `--constructivist-red: #d11415; --neon-pink: #ff2a6d;` extend the existing token set in `main.css:61-72`.
2. `font-family: 'Bebas Neue', 'Anton', 'Playfair Display Black', serif; font-style: italic; font-size: clamp(120px, 18vw, 220px); letter-spacing: -0.04em; color: var(--constructivist-red); transform: skewX(-6deg);` for the PINAX wedge.
3. `font-family: 'JetBrains Mono', ui-monospace, monospace;` for chrome + footer; pair with `letter-spacing: 0.22em; text-transform: uppercase; font-size: 10px; color: rgba(255,255,255,0.55);`.
4. `border: 1px solid rgba(255,255,255,0.1); background: rgba(10,14,20,0.6); backdrop-filter: blur(8px);` for hairline chrome instrument surfaces.
5. `background-image: linear-gradient(rgba(255,42,109,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,42,109,0.18) 1px, transparent 1px); background-size: 48px 48px; transform: perspective(600px) rotateX(60deg); transform-origin: 50% 100%;` for the synthwave receding floor.
6. `background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); opacity: 0.06; mix-blend-mode: multiply; pointer-events: none;` for the oil-paint grain.
7. Bookmark CTA wedge: `clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 50%, calc(100% - 28px) 100%, 0 100%, 14px 50%); border-left: 3px solid var(--constructivist-red); transform: perspective(1200px) skewX(-8deg);` — direct lift from `WelcomeView.vue:594` plus the red spine mockup adds.

## 7. Honest caveats
- External research tools failed (Firecrawl 401, WebSearch 400). Rules cited are stable published canon, not freshly verified 2026 sources.
- No visual claim about Phase 2/3 motion bundle size (direction doc `character-driven-arc.md:373-375` already flags this as unverified).
- No file modifications made; report is research-only as requested.

## Sources used (canonical, offline-verified)
- Lissitzky-Küppers, *El Lissitzky: Life, Letters, Texts* (Thames & Hudson)
- MoMA / Garage Museum archives on Rodchenko & Popova
- Khan Academy *Conservation of Paintings* — glazing, sfumato, imprimatura
- Syd Mead concept-art lineage (*Alien*, *Blade Runner* title-card typography) for synthwave chrome canon
