# P5R UI Rules → CSS / Vue Tokens

> Research output for Pinax refactor. Concrete values, file:line cites to direction docs, no prose.

## 1. Signature visual elements
P5R UI is recognizable by the **stark red-on-cream/black inversion** (a single accent hue against two neutrals, never multi-color) and the **diagonal motion grammar** — every panel, button, and divider has a `~12–18°` skew that mirrors the cover-art slash. Sources: [Wikipedia](https://en.wikipedia.org/wiki/Persona_5) ("UI uses only primary red, black, and white, no sub-colors"); direction doc: see `kao-ui-direction.md:24-29` (high-contrast 4-tone stack).

## 2. Color system
| Token | Hex | Role |
|---|---|---|
| `--p5r-crimson` | `#E60012` | base accent (the "Persona red") |
| `--p5r-crimson-deep` | `#B3000E` | hover/pressed, type-on-cream |
| `--p5r-ink` | `#0A0A0A` | primary type, panel grounds |
| `--p5r-cream` | `#F4ECD8` | paper surface, NOT pure white |
| `--p5r-paper` | `#E8DCC0` | secondary paper / inset |
| `--p5r-gold` | `#D4A24C` | small accent only (≤5% area) |
| `--p5r-gold-glow` | `#F2C977` | gold highlight, type-only |
| `--p5r-grey-haze` | `#7A6F60` | muted secondary text |

Layering: **base = cream/ink, accent = crimson, type-only = gold**. Wikipedia: "only primary red, black, and white" — gold is reserved for punctuation. Kao doc already proposes a warm paper stack at `kao-ui-direction.md:86-96` (`#f5ebdd`/`#e9dcc8`/`#271d18`) — P5R uses the same hue family, just with a saturated crimson on top instead of verdigris.

## 3. Typography
- **Display**: condensed serif (e.g. `Roboto Slab`, `Playfair Display`, or Japanese `Klee One`); weight **700–800**; **italic** for emphasis; tracking `letter-spacing: 0.02em` tight.
- **UI sans**: `Inter`, `Helvetica Neue`, or `Hiragino Kaku Gothic`; weight **400 / 700**; tracking `letter-spacing: 0.08em` loose; **UPPERCASE** on all nav/buttons; small caps disabled.
- **Numeric / HP/MP**: tabular monospace, weight 700, often white-on-red or black-on-cream.
- **Rule**: never mix more than 2 families in one view. Direction doc §5 (`kao-ui-direction.md:106-120`): "一屏里让 serif 负责标题性信息，sans 负责交互性信息".

## 4. Layout grammar
- **12-col grid** with intentional column skipping (e.g. headline spans col 2-9, body col 5-12).
- **The red slash** = a `~14°` rotated rect (`transform: rotate(-14deg)` or `skewX(-12deg)`), full-bleed, behind content, clipped to viewport.
- **Asymmetric balance**: image-heavy right half, text-heavy left margin. `kao-ui-direction.md:148-160` already calls for "CTA 作为书签切片压在海报上" — the slash is the visual analog.
- **Hairline rules** = 1px black or 2px crimson, never grey.

## 5. Component vocabulary
1. **Slanted button** — `transform: skewX(-12deg)` on the surface, counter-skew (`skewX(12deg)`) on inner text. `padding: 12px 28px`. Fill: crimson; on press, swap to ink and reverse text to cream.
2. **Hairline rule** — `border-top: 2px solid var(--p5r-crimson)` + `border-bottom: 1px solid var(--p5r-ink)`, no border-radius.
3. **Halftone overlay** — `background-image: radial-gradient(var(--p5r-ink) 1px, transparent 1.2px); background-size: 6px 6px; opacity: 0.18; mix-blend-mode: multiply`.
4. **Photo cutout block** — `clip-path: polygon(0 0, 100% 4%, 100% 100%, 0 96%)` (slight angle on top/bottom); ink border 2px; caption in display serif italic.
5. **Text-on-photo block** — cream type on crimson panel; `padding: 8px 16px; letter-spacing: 0.12em; text-transform: uppercase`.
6. **Tab strip** — slanted tabs (`skewX(-14deg)`), 40px tall, crimson active state, ink inactive, 2px crimson underline on active.
7. **Info chip** — small `skewX(-10deg)` pill, 1px ink border, cream fill, sans uppercase 11px inside.

## 6. Motion principles
| Event | Effect | Duration | Easing |
|---|---|---|---|
| Panel in (whoosh) | `translateX(-100%) skewX(-12deg)` → `translateX(0) skewX(-12deg)` | **320ms** | `cubic-bezier(0.22, 1, 0.36, 1)` (easeOutQuart) |
| Hold (idle) | no animation, just static | — | — |
| Fade (text) | `opacity 0 → 1` | **180ms** | `linear` |
| Slam (button press) | `scale(1) → scale(0.96) → scale(1)` | **120ms** | `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out) |
| Page transition | horizontal slide with crimson slash wipe | **420ms** | `cubic-bezier(0.7, 0, 0.3, 1)` |

`kao-ui-direction.md:200-213` explicitly bans soft-fade-as-primary, bouncing cards, neon glow — consistent with P5R's snap, not spring.

## 7. Anti-patterns
1. **Multi-color UI** — P5R never uses green/blue/purple as accents. Adding any third hue breaks the contract (Wikipedia: "no sub-colors").
2. **Rounded corners** — `border-radius` should be **0**. Slants replace curves.
3. **Soft drop shadows / glassmorphism** — only hard, offset ink shadows (`box-shadow: 6px 6px 0 var(--p5r-ink)`).
4. **Stock sans for headlines** — display MUST be a serif or condensed grotesque, never Inter for a title.
5. **Spring/bounce on entrance** — P5R slams, doesn't bounce. Spring is anti-grammar.
6. **Equal-weight buttons** — primary = crimson filled slanted, secondary = cream outlined slanted; never same fill.

## 8. Highest-leverage CSS-translatable rules
1. **Single accent rule**: `color: var(--p5r-crimson);` is the *only* chromatic color on screen. Everything else is cream/ink/gold-text. Token in `:root`; ban via linter regex for hex outside the 7-token list.
2. **Global skew primitive**: `.skew { transform: skewX(-12deg); } .skew > * { transform: skewX(12deg); }` — apply to every button, tab, callout.
3. **Slash background**: `body::before { content: ''; position: fixed; inset: -10% -10%; background: var(--p5r-crimson); transform: rotate(-14deg); transform-origin: top left; z-index: -1; clip-path: polygon(0 0, 100% 0, 100% 38%, 0 62%); }` — single SVG-free slash.
4. **Hard offset shadow**: `box-shadow: 6px 6px 0 var(--p5r-ink);` on every raised surface; never `blur`.
5. **Halftone overlay mixin**: `.halftone { background-image: radial-gradient(var(--p5r-ink) 1px, transparent 1.2px); background-size: 6px 6px; opacity: 0.18; mix-blend-mode: multiply; }` — for photo panels and section breaks.
6. **Display + UI pairing**: `:root { --font-display: 'Playfair Display', 'Klee One', serif; --font-ui: 'Inter', 'Hiragino Sans', sans-serif; --tracking-ui: 0.08em; --tracking-display: 0.02em; }` — enforce via `body { font-family: var(--font-ui); }` and `.display { font-family: var(--font-display); }`.
7. **Motion presets** as Vue composable: `useMotion('whoosh', { dur: 320, ease: 'cubic-bezier(0.22,1,0.36,1)' })` / `'slam'` / `'fade'` / `'slide'` — all snap, no spring. Respect `prefers-reduced-motion: reduce` (per `character-driven-arc.md:194`).

## Mapping to Pinax
- Kao doc palette (`kao-ui-direction.md:86-96`) keeps the warm paper/ink but swaps verdigris for crimson — aligns P5R rules 1, 6 with `character-driven-arc.md:84` (P5R anchor).
- Surface taxonomy (FolioSurface / PosterStage / BookmarkButton / ArchiveStrip) at `kao-ui-direction.md:125-140` maps to slanted buttons + photo cutouts + halftone overlays above.
- Motion rules at `kao-ui-direction.md:200-213` (抽页 / 滑片 / 相片层差 / 书签位移) are a direct subset of the P5R motion table — same easing family, no spring.

## Sources
- [Persona 5 — Wikipedia](https://en.wikipedia.org/wiki/Persona_5) (palette constraint, art direction intent, cel-shader note)
- [Persona 5 Royal — Wikipedia](https://en.wikipedia.org/wiki/Persona_5_Royal) (Royal-specific extensions)
- Direction docs (in-repo): `docs/plan/kao-ui-direction.md`, `docs/plan/character-driven-arc.md`
