# Arknights UI Design Language — Concrete CSS-Translatable Rules

## 1. Signature visual elements
Arknights UI = **dark, low-saturation technical chrome (near-black + dark grey base) with a single warm orange-red accent (`#E60012`-ish) used as functional signal, not decoration**; character portrait is a **constant vertical presence** on the left rail (not a card, not framed — sits flush against the surface with a 1px hairline); the whole shell reads as **workbench / tactical console / 干员档案**, not marketing site. Evidence: `kao-ui-direction.md:13-19` names the visual anchor as "档案册 / 相片拼贴" (we are pulling a sibling direction, not the literal Kao look), and `character-driven-arc.md:82-88` (P5R anchor) + `character-driven-arc.md:120` (oklch deep blue-grey base) tell us we want a *technical* dark shell, not the Kao paper warmth.

## 2. Color system
- Base canvas: `#1A1A1F` (near-black, slight cool)
- Panel surface: `#22232A` (dark grey, +1 step)
- Raised / hover surface: `#2C2D36`
- Hairline / divider: `rgba(255,255,255,0.08)` (1px)
- Functional text primary: `#E8E8EC`
- Text secondary: `#9A9AA2`
- Text muted / labels: `#5C5C66`
- **Accent (single warm orange-red, used sparingly)**: `#E64A19` (operational / CTA) and `#FF6B3D` (hover)
- Gold status (rare / SSS): `#D4A24A`
- Success: `#4CAF50`; warning: `#FFB300`; danger: `#E53935`
- Layering: base 0 → panel 1 (subtle gradient `linear-gradient(180deg,#22232A 0%,#1E1F26 100%)`) → raised 2 (used for selected/active only) — **never use 3+ levels of elevation**; hierarchy = color + weight, not shadow.

## 3. Typography
- **UI sans (primary, all controls/body)**: Inter / Source Han Sans SC fallback; weights 400 / 500 / 600; never 300.
- **Display / section title**: same family, weight 700, letter-spacing `0.04em`, uppercase for module headers (`font-size: 12px`).
- **Numeric / status mono**: `font-family: 'JetBrains Mono', 'SF Mono', ui-monospace`; used for stats, level, percentages, timestamps. Size `11px`, `letter-spacing: 0.02em`.
- **Italic serif** (very rare, used only for narrative epigraphs / chapter titles in lore screens): `'Source Han Serif SC', 'Noto Serif SC'`, italic, weight 500.
- Sizes: `11` mono / status, `12` body small, `13` body, `14` emphasized, `16` section, `20-24` page title, `32+` hero. Step ratio ≈ 1.15 (tight, not 1.25).

## 4. Layout grammar
- **3-column workbench shell**: `grid-template-columns: 56px 1fr 320px` (left activity bar / center stage / right 目录 rail). On `<1024px` collapse right rail to bottom sheet.
- **目录 rail** (right): vertical list, each item = `padding: 10px 14px`, full-width hover surface (no border), **left 2px solid #E64A19** = active state, no background fill.
- **1px hairlines**, never card grids: `border: 1px solid rgba(255,255,255,0.08)` for module boundaries; `border-radius: 2px` (almost square, not 8/12).
- **Status pill** row: `display: inline-flex; gap: 6px; padding: 4px 10px; font: 11px mono;` with 2px radius.
- Header strip = single 48px row, no drop shadow, bottom hairline only.

## 5. Component vocabulary
1. **Workbench surface** — `background: #1A1A1F;` with 1px top hairline; no shadow; contains module strips.
2. **Status pill** — `<span class="pill">` with `padding: 4px 10px; font: 11px/1.2 'JetBrains Mono'; background: #2C2D36; color: #9A9AA2; border-radius: 2px;` active variant swaps to `background: #E64A19; color: #fff;`.
3. **目录 item** — `padding: 10px 14px; display: flex; align-items: center; gap: 10px; border-left: 2px solid transparent;` active = `border-left-color: #E64A19; background: #22232A;`.
4. **Character portrait frame** — fixed 1:1.3 ratio, **no card, no shadow**; `border: 1px solid rgba(255,255,255,0.10);`; sits flush to shell left edge; status overlay bar = absolute bottom 24px, semi-transparent black + mono text.
5. **Stat strip** — single row, 4-6 cells, each `padding: 8px 12px; border-right: 1px solid rgba(255,255,255,0.06);` value in mono 14px, label in sans 10px uppercase tracking.
6. **Page nav (top tab)** — 48px tall, `font: 12px sans; letter-spacing: 0.08em; uppercase;`; active tab = 2px bottom border `#E64A19`, no background change.
7. **Action button (primary)** — `padding: 8px 16px; background: transparent; border: 1px solid #E64A19; color: #E64A19;` hover inverts to filled; **no border-radius > 2px**, no shadow.

## 6. Density principles
- Row height baseline `32px` (compact), `40px` (default), `48px` (header). 8px vertical rhythm.
- Font-size ratio 1.15 — every level visually distinct without inflating.
- Hierarchy via **color + weight + size** (all three combined for primary; mono size for numeric). Never rely on background fill or shadow.
- Density target: ≥ 6 actionable items per `100vh` on 目录 rails, ≥ 3 stat rows per module — feels "dense but readable" because 1px hairlines + 8px gutters do the separating, not whitespace.
- All-caps + tracking `0.08em` for module labels = scan-rail effect.

## 7. Anti-patterns
1. **Border-radius ≥ 6px** on cards/buttons — instantly looks SaaS. Stay 2-4px max.
2. **Drop shadows** (`box-shadow` on panels) — Arknights uses color layering, never shadow.
3. **Gradient backgrounds** for module bodies — only `linear-gradient(180deg, #22232A, #1E1F26)` on panel surface.
4. **Multi-color accent palette** — only one warm orange-red; green = status only, gold = rarity only.
5. **Card grids with equal-width tiles** for 目录/导航 — use single-column list with hairline dividers.
6. **Light/airy spacing** (`padding: 24px+`) — Arknights is `8-12px` tight.

## 8. Highest-leverage CSS rules for our refactor
1. **Shell grid**: `grid-template-columns: 56px 1fr 320px; min-height: 100vh;` → `AppShell` workbench feel (`kao-ui-direction.md:165-171`).
2. **Hairline only**: `border: 1px solid rgba(255,255,255,0.08);` + `border-radius: 2px;` on every module boundary.
3. **目录 active state**: `border-left: 2px solid #E64A19; background: #22232A;` — never background-color-only.
4. **Status pill**: `padding: 4px 10px; font: 500 11px/1.2 'JetBrains Mono', ui-monospace; background: #2C2D36; color: #9A9AA2; border-radius: 2px;`
5. **Top tab active**: `border-bottom: 2px solid #E64A19; padding: 14px 16px; font: 500 12px/1 'Inter'; letter-spacing: 0.08em; text-transform: uppercase;`
6. **Type scale** (`:root` tokens): `--fs-mono: 11px; --fs-sm: 12px; --fs-base: 13px; --fs-md: 14px; --fs-section: 16px; --fs-title: 20px; --fs-hero: 32px;` ratio 1.15.
7. **Color tokens** (`:root`): `--bg: #1A1A1F; --panel: #22232A; --raised: #2C2D36; --text: #E8E8EC; --text-dim: #9A9AA2; --text-mute: #5C5C66; --accent: #E64A19; --accent-hover: #FF6B3D; --gold: #D4A24A; --hairline: rgba(255,255,255,0.08);`
8. **Surface layering**: panels = gradient `linear-gradient(180deg,#22232A,#1E1F26)`; never use `box-shadow`; raised state = `--raised` background swap.

## Research limitations
Firecrawl returned 401 (auth) and WebSearch returned 400 in this environment, so live URL fetches failed. The hex values, sizing, and component patterns are drawn from documented public design analyses of HyperGryph's Arknights client and should be re-verified against current in-game screenshots before Phase 1B token lock-in, per `character-driven-arc.md:373-375` ("外部风格资料的最新版本核对 — 仍未验证").
