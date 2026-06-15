# Theme System Design v2

> 把当前 `kao / archive-folio` UI 作为默认主题，同时保留一个可切换的 legacy fallback。目标是“可运行的视觉回退”，不是把整个应用永久分叉。

- **Date**: 2026-06-15
- **Status**: review-optimized, needs self-review
- **Owner**: Claude / Codex review
- **Branch**: `feat/theme-system-20260615`
- **Base**: 当前工作区已在 `feat/theme-system-20260615`；不要再回到 `wip/map-realism-render-docs-20260608` 实施。

## 1. Context

User wants the recent UI redesign (`kao / archive-folio`, see `docs/superpowers/specs/2026-06-10-ui-redesign-design.md`) selectable against a pre-redesign UI. `kao` stays default. `legacy` is a fallback snapshot around `4e779d2 fix(world-map): stabilize settlement realism baselines`.

This spec is the source of truth. Implementation plans live in `docs/superpowers/plans/2026-06-15-theme-system.md` after sign-off.

Hard constraints:

- `/opening` remains the standalone opening route. Do not reintroduce opening-page remnants into `/experience`.
- Existing `app_theme` localStorage key remains the color-scheme key for backward compatibility.
- Existing `useTheme()` API must keep working for current callers.
- The current app imports `src/styles/main.css` statically from `src/main.js`; the theme system must be Vite-compatible and must not depend on runtime `<link href="/src/...">` switching for source CSS files.
- `index.html` currently preloads `LXGWWenKai-Regular.woff2`; dynamic font-loading claims are false until that static preload is removed.

## 2. Decisions Summary

| Dimension | Decision |
|---|---|
| Default | `kao + light` |
| Variants | `kao` and `legacy` only |
| Color schemes | `light` and `dark`; keep `.theme-dark` semantics |
| State | New Pinia store `src/stores/themeStore.js` with `variant`, `colorScheme`, `initialized` |
| Compatibility | `src/composables/useTheme.js` becomes a shim over `themeStore` and preserves `isDark`, `toggleTheme`, `initTheme` |
| Routing | Route records stay static; variant-specific views are resolved by wrapper components at render time, not by importing the Pinia store in `router/index.js` at module load |
| CSS | Keep one global base CSS entry. Split/gate variant rules inside Vite-managed CSS modules; do not inject raw `/src/styles/*.css` links |
| Switcher UI | Add appearance controls to the existing AppShell drawer/chrome. No mandatory permanent top bar unless current shell later reintroduces one |
| Font loading | Remove the static `index.html` font preload first; `kao` may inject/preload LXGW dynamically, `legacy` must not define/use LXGW |
| Legacy lifecycle | Frozen visually, but allowed minimal compatibility adapters/tests when shared stores/router/contracts change |
| Tests | Add focused store tests + static UI/CSS contract tests + import-resolution smoke tests |

## 3. Architecture

### 3.1 Layers

```
Layer 1: themeStore
  variant: 'kao' | 'legacy'
  colorScheme: 'light' | 'dark'
  actions: initTheme(), setVariant(), setColorScheme(), applyToHtml()

Layer 2: theme-aware wrappers
  ThemeVariantView.vue resolves current route's kao/legacy component at setup/render time.
  ThemeVariantShell.vue resolves AppShell vs AppShellLegacy if shell splitting is needed.

Layer 3: Vite-managed CSS
  main.js imports base/global CSS once.
  App.vue or a small ThemeAssets component imports variant CSS modules through dynamic import().
```

Do not make route records depend directly on `useThemeStore()` during router module initialization. Pinia is installed after the router module is imported, so store reads belong in Vue setup/render code or in lazy wrapper components.

### 3.2 Routing

`router/index.js` keeps stable paths:

- `/`
- `/opening`
- `/experience`
- existing workbench children

Each route that has variant-specific UI points to a resolver component:

```js
const ThemeVariantView = () => import('../components/theme/ThemeVariantView.vue')

{
  path: 'opening',
  name: 'opening',
  component: ThemeVariantView,
  props: { view: 'opening' },
  meta: { ...existingMeta }
}
```

`ThemeVariantView.vue` owns the mapping:

```js
const VIEW_COMPONENTS = {
  welcome: {
    kao: () => import('../../views/WelcomeView.vue'),
    legacy: () => import('../../views/legacy/WelcomeView.vue'),
  },
  opening: {
    kao: () => import('../../pages/OpeningPage.vue'),
    legacy: () => import('../../pages/legacy/OpeningPage.vue'),
  },
  experience: {
    kao: () => import('../../pages/Experience.vue'),
    legacy: () => import('../../pages/legacy/Experience.vue'),
  },
}
```

The rendered component key includes `themeStore.variant` so switching variants remounts only the active view.

### 3.3 CSS Strategy

Current reality:

- `src/main.js` statically imports `./styles/main.css`.
- `index.html` statically preloads LXGW.
- `main.css` currently mixes base tokens, dark-mode tokens, shared utilities, and kao/archive-folio rules.

Required implementation direction:

1. Extract shared app tokens/utilities into `src/styles/base.css` or keep them in `main.css` as the single base entry.
2. Move kao-specific archive/folio/theme rules into `src/styles/themes/kao.css`.
3. Add legacy override rules in `src/styles/themes/legacy.css`.
4. Import base CSS statically from `main.js`.
5. Load variant CSS with Vite dynamic import:

```js
const THEME_CSS_LOADERS = {
  kao: () => import('../styles/themes/kao.css'),
  legacy: () => import('../styles/themes/legacy.css'),
}
```

Vite will turn these into managed CSS chunks. Do not create runtime `<link href="/src/styles/main.css">` or `<link href="/src/styles/legacy.css">`; those paths are dev-server source paths and are not stable production assets.

Important trade-off: once a CSS chunk is imported, Vite-injected CSS usually remains in the document. Therefore all variant-specific selectors must be gated by `.theme-kao` or `.theme-legacy`, e.g. `.theme-kao .is-folio { ... }`. Do not rely on unloading CSS for correctness.

### 3.4 HTML Classes

`themeStore.applyToHtml()` sets:

- `theme-kao` or `theme-legacy`
- `theme-light` or `theme-dark`

Keep existing `.theme-dark` behavior. Adding `.theme-light` is allowed, but no existing CSS should require `.theme-light` to preserve the light theme.

### 3.5 Font Loading

Before claiming “legacy does not download LXGW”, remove the static preload from `index.html`.

`kao` can then inject:

```html
<link rel="preload" as="font" type="font/woff2" href="..." crossorigin>
```

`legacy` rules must not define `@font-face` for `"LXGW WenKai"` and must use the existing serif stack.

Do not promise that a user who has already visited `kao` in the same SPA session will “un-download” the font after switching to `legacy`. The guarantee is:

- cold load with `legacy` selected does not preload LXGW;
- `legacy` CSS does not reference LXGW;
- `kao` cold load can preload/use LXGW.

## 4. File Structure

Use one consistent legacy path convention:

```
src/
├── components/
│   └── theme/
│       ├── ThemeVariantView.vue          ← NEW
│       ├── ThemeAssets.vue               ← optional, CSS/font loader
│       └── AppearanceControls.vue        ← NEW, shared drawer controls
├── stores/
│   └── themeStore.js                     ← NEW
├── views/
│   ├── WelcomeView.vue                   ← kao/current
│   └── legacy/
│       └── WelcomeView.vue               ← legacy visual fallback
├── pages/
│   ├── OpeningPage.vue                   ← kao/current
│   ├── Experience.vue                    ← kao/current
│   └── legacy/
│       ├── OpeningPage.vue               ← legacy visual fallback
│       └── Experience.vue                ← legacy visual fallback
├── layouts/
│   ├── AppShell.vue                      ← kao/current shell
│   └── legacy/
│       └── AppShell.vue                  ← only if shell actually needs variant split
├── components/
│   └── worldbook/
│       ├── StructuredSettingsPanel.vue   ← current
│       └── legacy/
│           └── StructuredSettingsPanel.vue
├── styles/
│   ├── main.css                          ← shared/base entry imported by main.js
│   └── themes/
│       ├── kao.css                       ← gated by .theme-kao
│       └── legacy.css                    ← gated by .theme-legacy
└── composables/
    └── useTheme.js                       ← compatibility shim
```

Legacy snapshot scope starts with:

- `WelcomeView.vue`
- `OpeningPage.vue`
- `Experience.vue`
- `StructuredSettingsPanel.vue`
- `AppShell.vue` only if the current shell's kao chrome cannot host legacy cleanly
- CSS needed for the copied visual surface

If a copied legacy view imports components/services that no longer compile, either copy the dependent visual component under the same `legacy/` subtree or add a narrow compatibility adapter. Do not assume the first six files are sufficient.

## 5. Store Contract

`themeStore.js`:

```js
import { defineStore } from 'pinia'

export const DEFAULT_VARIANT = 'kao'
export const DEFAULT_COLOR_SCHEME = 'light'
export const VALID_VARIANTS = ['kao', 'legacy']
export const VALID_COLOR_SCHEMES = ['light', 'dark']
export const LS_VARIANT = 'app_theme_variant'
export const LS_COLOR = 'app_theme'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    variant: DEFAULT_VARIANT,
    colorScheme: DEFAULT_COLOR_SCHEME,
    initialized: false,
  }),
  actions: {
    initTheme() {
      const v = localStorage.getItem(LS_VARIANT)
      const c = localStorage.getItem(LS_COLOR)
      this.variant = VALID_VARIANTS.includes(v) ? v : DEFAULT_VARIANT
      this.colorScheme = VALID_COLOR_SCHEMES.includes(c) ? c : DEFAULT_COLOR_SCHEME
      this.applyToHtml()
      this.initialized = true
    },
    setVariant(v) {
      if (!VALID_VARIANTS.includes(v)) return
      this.variant = v
      localStorage.setItem(LS_VARIANT, v)
      this.applyToHtml()
    },
    setColorScheme(s) {
      if (!VALID_COLOR_SCHEMES.includes(s)) return
      this.colorScheme = s
      localStorage.setItem(LS_COLOR, s)
      this.applyToHtml()
    },
    applyToHtml() {
      const html = document.documentElement
      html.classList.remove('theme-kao', 'theme-legacy')
      html.classList.add(`theme-${this.variant}`)
      html.classList.remove('theme-dark', 'theme-light')
      html.classList.add(`theme-${this.colorScheme}`)
    },
  },
})
```

`useTheme.js` remains a compatibility layer:

- `isDark` remains a computed/ref-like value.
- `toggleTheme()` toggles `themeStore.colorScheme`.
- `initTheme()` delegates to `themeStore.initTheme()`.
- Callers in `WelcomeView`, `OpeningPage`, `Writing`, `Notes`, `ProseEssay`, and `StructuredSettings` must not break.

## 6. Switcher UX

Current `AppShell.vue` uses a floating menu trigger and drawer. The spec must not force a persistent top bar.

Implement:

- A compact `AppearanceControls.vue` reused by current and legacy chrome.
- Primary placement inside `shell-drawer__body`, preferably below navigation groups.
- Optional compact pill near the existing drawer trigger only if it does not add a new permanent top bar and does not overlap immersive pages.

Controls:

```
外观
○ Kao · 亮色
○ Kao · 暗色
○ Legacy · 亮色
○ Legacy · 暗色
```

Each option calls `setVariant()` then `setColorScheme()`. Radio semantics must be keyboard accessible.

UI positioning answers:

- Narrative role: workbench chrome setting, not a marketing surface.
- Viewing distance: laptop/desktop utility chrome; keep dense and unobtrusive.
- Visual temperature: quiet operational control.
- Capacity: must fit in the existing 360px drawer and mobile `calc(100vw - 28px)` drawer width.

## 7. Legacy Boundary

`legacy` means “visual fallback from the pre-kao surface,” not “never touched code forever.”

Allowed changes under `legacy/`:

- compile fixes required by current Vue/Vite/store contracts;
- wrapper adapters for renamed composables or store fields;
- accessibility/test IDs for the theme switcher;
- critical bug fixes that prevent the fallback from loading.

Not allowed:

- new product features only added to kao;
- archive-folio visual language;
- reintroducing `/experience` opening-page entry remnants;
- changing legacy layout for polish after the snapshot is accepted.

## 8. Tests

### 8.1 `src/__tests__/themeStore.test.js`

Add focused store tests:

- `initTheme()` reads valid `app_theme_variant` and `app_theme`.
- invalid variant/scheme falls back to `kao + light`.
- existing `app_theme = dark` is preserved when no variant key exists.
- `setVariant('legacy')` updates state, localStorage, and `<html>.theme-legacy`.
- invalid `setVariant()` is a no-op.
- `setColorScheme('dark')` updates state, localStorage, and `<html>.theme-dark`.
- `useTheme()` shim still exposes `isDark`, `toggleTheme`, `initTheme`.

### 8.2 Static UI/CSS Contracts

Extend `src/__tests__/uiPolish.test.js` with static contracts only:

- `src/main.js` still imports shared/base CSS exactly once.
- no runtime source-CSS link injection such as `href="/src/styles/*.css"`.
- variant CSS files exist under `src/styles/themes/`.
- variant-specific selectors are gated by `.theme-kao` / `.theme-legacy`.
- `index.html` no longer contains static LXGW preload.
- `legacy.css` does not contain `LXGW WenKai` or `@font-face`.
- `AppShell.vue` or shared `AppearanceControls.vue` exposes an `外观` group.
- `/experience` legacy/current contracts do not include the removed opening-page residues.

Do not put interactive click behavior into `uiPolish.test.js` if that file remains read-file/static-contract oriented.

### 8.3 Import / Render Smoke

Add one small Vitest smoke test if feasible:

- `ThemeVariantView` can resolve `welcome/opening/experience` in both variants.
- unknown view/variant fails gracefully.
- switching `themeStore.variant` changes the rendered component key.

## 9. Verification

Minimum before marking implementation complete:

```bash
npm run test:run -- src/__tests__/themeStore.test.js src/__tests__/uiPolish.test.js
npm run build
git diff --check
```

If UI markup/CSS is changed beyond static wiring, also run:

```bash
npm run test:run -- src/__tests__/visual-verification.test.js
```

Full regression remains preferred before merge:

```bash
npm run test:run
```

## 10. Rollout

1. Implement on `feat/theme-system-20260615`.
2. Keep commits scoped:
   - store + useTheme compatibility;
   - routing/component/CSS split;
   - controls + tests + docs/status handoff.
3. Do not merge into `wip/map-realism-render-docs-20260608`; that branch is historical context, not the implementation target.
4. Existing users keep `app_theme` color scheme. Missing `app_theme_variant` defaults to `kao`.
5. New users get `kao + light`.
6. Update `docs/STATUS.md` only as a handoff entry after implementation or when the work becomes actively in-flight.

## 11. Risks And Locks

| Risk | Severity | Mitigation / lock |
|---|---:|---|
| Router reads Pinia too early | High | Use wrapper Vue components; no `useThemeStore()` at router module top level |
| Runtime raw CSS links fail in production | High | Use Vite static/dynamic CSS imports only |
| Legacy snapshot does not compile | High | Copy required visual dependencies or add narrow compatibility adapters |
| Variant CSS remains loaded after switch | Medium | Gate all variant selectors by `.theme-kao` / `.theme-legacy` |
| Static LXGW preload makes legacy download font | Medium | Remove `index.html` preload before asserting legacy no-font behavior |
| Permanent top bar conflicts with current shell | Medium | Put controls in drawer/chrome; optional pill only near existing trigger |
| `useTheme()` callers break | Medium | Keep exact public API and test it |
| `/experience` opening residues return | High | Add contract against opening-page strings/classes in Experience current + legacy |
| Frozen legacy becomes impossible to maintain | Medium | Define allowed compatibility-only edits |

## 12. Open Questions

1. Should legacy include a separate `AppShell.vue`, or is a shared current shell with variant-scoped contents enough?
2. Should `WelcomeView` also be routed through `ThemeVariantView`, or should it remain current-only for first implementation?
3. Is dynamic LXGW preload required in v1, or can v1 simply remove static preload and let `kao.css` reference the font normally?
