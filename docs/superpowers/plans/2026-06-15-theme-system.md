# Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recent UI redesign (kao/archive-folio) selectable against a pre-redesign UI. `kao` stays default; `legacy` is a frozen visual fallback at `4e779d2`.

**Architecture:** Pinia `themeStore` (variant + colorScheme) → wrappers `ThemeVariantView` (route resolver) + `ThemeAssets` (CSS + font loader) + `AppearanceControls` (drawer UI) → variant-specific Vue files in `src/{views,pages,components/worldbook}/legacy/` + Vite-managed CSS in `src/styles/themes/`. No runtime `<link href="/src/styles/...">` injection; CSS chunks loaded via Vite dynamic import.

**Tech Stack:** Vue 3, Vite, Pinia, Vue Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-theme-system-design.md` (v2 user-approved).

**Branch:** `feat/theme-system-20260615`. Do NOT touch `wip/map-realism-render-docs-20260608`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/stores/themeStore.js` | CREATE | Pinia store: variant, colorScheme, initTheme, setVariant, setColorScheme, applyToHtml |
| `src/composables/useTheme.js` | MODIFY | Shim over themeStore; preserve isDark, toggleTheme, initTheme API |
| `src/components/theme/ThemeVariantView.vue` | CREATE | Resolves `welcome/opening/experience` to kao/legacy component at render time |
| `src/components/theme/ThemeAssets.vue` | CREATE | Loads variant CSS module + manages dynamic LXGW font preload per variant |
| `src/components/theme/AppearanceControls.vue` | CREATE | 4-radio "外观" group used by AppShell drawer |
| `src/router/index.js` | MODIFY | `/welcome`, `/opening`, `/experience` routes point to `ThemeVariantView` |
| `src/views/WelcomeView.vue` | MODIFY | Gate kao-specific selectors with `.theme-kao` prefix |
| `src/views/legacy/WelcomeView.vue` | CREATE | Snapshot from `4e779d2`; add header comment |
| `src/pages/OpeningPage.vue` | MODIFY | Gate kao-specific selectors with `.theme-kao` prefix |
| `src/pages/legacy/OpeningPage.vue` | CREATE | Snapshot from `4e779d2`; add header comment |
| `src/pages/Experience.vue` | MODIFY | Gate kao-specific selectors; opening-page residue contracts |
| `src/pages/legacy/Experience.vue` | CREATE | Snapshot from `4e779d2`; add header comment |
| `src/components/worldbook/StructuredSettingsPanel.vue` | MODIFY | Gate kao-specific selectors with `.theme-kao` prefix |
| `src/components/worldbook/legacy/StructuredSettingsPanel.vue` | CREATE | Snapshot from `4e779d2`; add header comment |
| `src/styles/main.css` | MODIFY | Strip kao-specific rules; keep shared tokens + `.theme-dark` rules |
| `src/styles/themes/kao.css` | CREATE | Kao/archive-folio rules gated by `.theme-kao` |
| `src/styles/themes/legacy.css` | CREATE | Empty/minimal; no `@font-face`, no kao/archive rules |
| `src/main.js` | MODIFY | Imports `main.css` (still); ThemeAssets dynamically imports variant CSS |
| `index.html` | MODIFY | Remove static LXGW preload `<link>` |
| `src/App.vue` | MODIFY | Mount `ThemeAssets`; call `useThemeStore().initTheme()` on mount |
| `src/layouts/AppShell.vue` | MODIFY | Include `AppearanceControls` in `shell-drawer__body` |
| `src/__tests__/themeStore.test.js` | CREATE | 8 store contract tests |
| `src/__tests__/uiPolish.test.js` | MODIFY | +8 static UI/CSS contracts |
| `src/__tests__/themeVariantView.test.js` | CREATE | Smoke test for ThemeVariantView resolution |
| `docs/STATUS.md` | MODIFY | Add handoff entry in Recently done |

---

## Task 1: Extract legacy snapshot files from `4e779d2`

**Files:**
- Create: `src/views/legacy/WelcomeView.vue`
- Create: `src/pages/legacy/OpeningPage.vue`
- Create: `src/pages/legacy/Experience.vue`
- Create: `src/components/worldbook/legacy/StructuredSettingsPanel.vue`
- Create: empty `src/styles/themes/legacy.css` (filled in Task 3)
- Test: `src/__tests__/legacySnapshot.test.js` (import smoke)

- [ ] **Step 1: Verify boundary commit exists**

```bash
git cat-file -e 4e779d2 && echo "boundary ok" || echo "boundary missing"
```

Expected: `boundary ok`. If missing, stop and re-derive the boundary from `git log --oneline --grep="world-map" -5`.

- [ ] **Step 2: Extract WelcomeView snapshot**

```bash
mkdir -p src/views/legacy
git show 4e779d2:src/views/WelcomeView.vue > src/views/legacy/WelcomeView.vue
```

Verify the file size is reasonable: `wc -l src/views/legacy/WelcomeView.vue` (expect ~600-1300 lines).

- [ ] **Step 3: Add "Frozen snapshot" header to the extracted file**

Use Edit on `src/views/legacy/WelcomeView.vue` and prepend (preserving all original content below):

```vue
<!--
  Frozen snapshot from 4e779d2 fix(world-map): stabilize settlement realism baselines.
  Extracted 2026-06-15 by feat/theme-system-20260615 implementation.
  DO NOT MODIFY. This file is a visual fallback only.

  Allowed changes (per spec §7):
  - compile fixes required by current Vue/Vite/store contracts
  - wrapper adapters for renamed composables or store fields
  - accessibility / test IDs for the theme switcher
  - critical bug fixes that prevent the fallback from loading
-->
```

- [ ] **Step 4: Extract OpeningPage, Experience, StructuredSettingsPanel snapshots**

```bash
mkdir -p src/pages/legacy src/components/worldbook/legacy src/styles/themes
git show 4e779d2:src/pages/OpeningPage.vue > src/pages/legacy/OpeningPage.vue
git show 4e779d2:src/pages/Experience.vue > src/pages/legacy/Experience.vue
git show 4e779d2:src/components/worldbook/StructuredSettingsPanel.vue > src/components/worldbook/legacy/StructuredSettingsPanel.vue
touch src/styles/themes/legacy.css
```

Then repeat the header prepend for each of the 3 files (same header text as Step 3).

- [ ] **Step 5: Verify imports resolve**

The legacy files will likely have broken imports at this point — they reference components / composables that have since been renamed. This is acceptable for the snapshot step (compile fixes land in Task 6). For now, just confirm the files exist:

```bash
ls -la src/views/legacy/WelcomeView.vue src/pages/legacy/OpeningPage.vue src/pages/legacy/Experience.vue src/components/worldbook/legacy/StructuredSettingsPanel.vue src/styles/themes/legacy.css
```

Expected: 5 file entries, no errors.

- [ ] **Step 6: Write import-resolution smoke test**

Create `src/__tests__/legacySnapshot.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

const LEGACY_FILES = [
  'src/views/legacy/WelcomeView.vue',
  'src/pages/legacy/OpeningPage.vue',
  'src/pages/legacy/Experience.vue',
  'src/components/worldbook/legacy/StructuredSettingsPanel.vue',
  'src/styles/themes/legacy.css',
]

describe('legacy snapshot files exist', () => {
  it.each(LEGACY_FILES)('%s exists at the expected path', (relPath) => {
    const abs = resolve(ROOT, relPath)
    expect(existsSync(abs)).toBe(true)
  })

  it.each(LEGACY_FILES)('%s carries the Frozen snapshot header', (relPath) => {
    if (relPath.endsWith('.css')) return
    const abs = resolve(ROOT, relPath)
    const head = readFileSync(abs, 'utf8').split('\n').slice(0, 6).join('\n')
    expect(head).toMatch(/Frozen snapshot from 4e779d2/)
  })

  it('legacy.css exists and is empty or minimal', () => {
    const abs = resolve(ROOT, 'src/styles/themes/legacy.css')
    const content = readFileSync(abs, 'utf8').trim()
    expect(content.length).toBeLessThan(200)
  })
})
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npm run test:run -- src/__tests__/legacySnapshot.test.js
```

Expected: PASS (5 + 4 + 1 = 10 assertions across 3 test blocks).

- [ ] **Step 8: Commit**

```bash
git add src/views/legacy/WelcomeView.vue \
        src/pages/legacy/OpeningPage.vue \
        src/pages/legacy/Experience.vue \
        src/components/worldbook/legacy/StructuredSettingsPanel.vue \
        src/styles/themes/legacy.css \
        src/__tests__/legacySnapshot.test.js
git commit -m "chore(extract): snapshot 6 legacy files from 4e779d2"
```

---

## Task 2: Pinia themeStore + useTheme shim

**Files:**
- Create: `src/stores/themeStore.js`
- Modify: `src/composables/useTheme.js`
- Modify: `src/App.vue` (call initTheme on mount)
- Create: `src/__tests__/themeStore.test.js`

- [ ] **Step 1: Write failing themeStore tests**

Create `src/__tests__/themeStore.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore, DEFAULT_VARIANT, DEFAULT_COLOR_SCHEME, LS_VARIANT, LS_COLOR } from '../stores/themeStore.js'

describe('themeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('exposes default state on first construction', () => {
    const s = useThemeStore()
    expect(s.variant).toBe(DEFAULT_VARIANT)
    expect(s.colorScheme).toBe(DEFAULT_COLOR_SCHEME)
    expect(s.initialized).toBe(false)
  })

  it('initTheme() reads valid localStorage values into state', () => {
    localStorage.setItem(LS_VARIANT, 'legacy')
    localStorage.setItem(LS_COLOR, 'dark')
    const s = useThemeStore()
    s.initTheme()
    expect(s.variant).toBe('legacy')
    expect(s.colorScheme).toBe('dark')
    expect(s.initialized).toBe(true)
  })

  it('initTheme() falls back to defaults on invalid variant', () => {
    localStorage.setItem(LS_VARIANT, 'garbage')
    localStorage.setItem(LS_COLOR, 'dark')
    const s = useThemeStore()
    s.initTheme()
    expect(s.variant).toBe(DEFAULT_VARIANT)
    expect(s.colorScheme).toBe('dark')
  })

  it('initTheme() preserves existing app_theme=dark when no variant key', () => {
    localStorage.setItem(LS_COLOR, 'dark')
    const s = useThemeStore()
    s.initTheme()
    expect(s.variant).toBe(DEFAULT_VARIANT)
    expect(s.colorScheme).toBe('dark')
  })

  it('setVariant("legacy") updates state, localStorage, and <html>', () => {
    const s = useThemeStore()
    s.initTheme()
    s.setVariant('legacy')
    expect(s.variant).toBe('legacy')
    expect(localStorage.getItem(LS_VARIANT)).toBe('legacy')
    expect(document.documentElement.classList.contains('theme-legacy')).toBe(true)
    expect(document.documentElement.classList.contains('theme-kao')).toBe(false)
  })

  it('setVariant("garbage") is a no-op', () => {
    const s = useThemeStore()
    s.initTheme()
    s.setVariant('garbage')
    expect(s.variant).toBe(DEFAULT_VARIANT)
    expect(localStorage.getItem(LS_VARIANT)).toBeNull()
  })

  it('setColorScheme("dark") updates state, localStorage, and <html>', () => {
    const s = useThemeStore()
    s.initTheme()
    s.setColorScheme('dark')
    expect(s.colorScheme).toBe('dark')
    expect(localStorage.getItem(LS_COLOR)).toBe('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(document.documentElement.classList.contains('theme-light')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/__tests__/themeStore.test.js
```

Expected: FAIL — `Cannot find module '../stores/themeStore.js'`.

- [ ] **Step 3: Implement themeStore**

Create `src/stores/themeStore.js` with the exact content from spec §5:

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

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/__tests__/themeStore.test.js
```

Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Convert useTheme.js into a shim**

Read the current `src/composables/useTheme.js` first to preserve any non-trivial logic, then replace its body. The shim should expose `isDark` (computed), `toggleTheme()`, `initTheme()`, all delegating to `useThemeStore()`.

```js
// src/composables/useTheme.js
import { computed } from 'vue'
import { useThemeStore } from '../stores/themeStore.js'

export function useTheme() {
  const store = useThemeStore()
  return {
    isDark: computed(() => store.colorScheme === 'dark'),
    toggleTheme() {
      store.setColorScheme(store.colorScheme === 'dark' ? 'light' : 'dark')
    },
    initTheme() {
      store.initTheme()
    },
  }
}
```

- [ ] **Step 6: Add `initTheme()` call in App.vue**

Read `src/App.vue`. In the `setup()` (or `onBeforeMount`), add:

```js
import { useThemeStore } from './stores/themeStore.js'

// inside setup():
const themeStore = useThemeStore()
themeStore.initTheme()
```

Verify no other useTheme() call sites change — they all keep working via the shim.

- [ ] **Step 7: Run full test suite to verify back-compat**

```bash
npm run test:run
```

Expected: All previously-passing tests still pass (the shim preserves the public API).

- [ ] **Step 8: Commit**

```bash
git add src/stores/themeStore.js \
        src/composables/useTheme.js \
        src/App.vue \
        src/__tests__/themeStore.test.js
git commit -m "feat(theme): Pinia themeStore + useTheme shim"
```

---

## Task 3: Split `main.css` → base + `themes/kao.css` + remove static LXGW preload

**Files:**
- Modify: `src/styles/main.css` (strip kao-specific rules)
- Create: `src/styles/themes/kao.css` (kao rules gated by `.theme-kao`)
- Modify: `src/styles/themes/legacy.css` (keep minimal / empty)
- Modify: `index.html` (remove static LXGW preload `<link>`)
- Modify: `src/__tests__/uiPolish.test.js` (+5 contracts)

- [ ] **Step 1: Write failing uiPolish contracts for CSS structure**

Open `src/__tests__/uiPolish.test.js`. Add a new `describe` block (find a good spot — near the existing token contracts):

```js
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

describe('theme system CSS contracts', () => {
  it('main.js imports shared CSS exactly once', () => {
    const mainJs = readFileSync(resolve(ROOT, 'src/main.js'), 'utf8')
    const imports = mainJs.match(/import\s+['"][^'"]*\.css['"]/g) || []
    expect(imports.length).toBe(1)
    expect(imports[0]).toMatch(/styles\/main\.css/)
  })

  it('no runtime source-CSS link injection via /src/styles/*.css', () => {
    const mainJs = readFileSync(resolve(ROOT, 'src/main.js'), 'utf8')
    const appVue = readFileSync(resolve(ROOT, 'src/App.vue'), 'utf8')
    expect(mainJs).not.toMatch(/href=["']\/src\/styles\//)
    expect(appVue).not.toMatch(/href=["']\/src\/styles\//)
  })

  it('variant CSS files exist under src/styles/themes/', () => {
    expect(existsSync(resolve(ROOT, 'src/styles/themes/kao.css'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'src/styles/themes/legacy.css'))).toBe(true)
  })

  it('index.html no longer contains static LXGW preload', () => {
    const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
    expect(indexHtml).not.toMatch(/LXGWWenKai-Regular\.woff2/)
  })

  it('legacy.css does not contain LXGW WenKai or @font-face', () => {
    const legacy = readFileSync(resolve(ROOT, 'src/styles/themes/legacy.css'), 'utf8')
    expect(legacy).not.toMatch(/LXGW\s*WenKai/i)
    expect(legacy).not.toMatch(/@font-face/)
  })
})
```

Add `import { existsSync } from 'node:fs'` near the top of the file (merge with any existing import).

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: FAIL — at least one of: kao.css missing, legacy.css has content, index.html still has LXGW preload.

- [ ] **Step 3: Strip kao-specific rules from `main.css`**

Open `src/styles/main.css`. Move the kao-specific rules (archive/folio `--archive-*` tokens, `.is-folio`, `.is-bookmark`, `.is-archive-strip`, archive-folio chrome overrides if any) into a new file. The split is:

- **Keep in `main.css`**: `--bg-*`, `--text-*`, `--font-serif`, `--font-sans`, `--font-mono`, `.theme-dark` rules, shared utilities, layout/z-index tokens, semantic colors, accent colors, hairlines.
- **Move to `src/styles/themes/kao.css`**: `--archive-*` tokens, archive-folio chrome overrides, `.is-folio`, `.is-bookmark`, `.is-archive-strip`, LXGW WenKai `@font-face`.

Concrete grep to identify what to move:

```bash
grep -nE '(--archive|is-folio|is-bookmark|is-archive-strip|LXGW WenKai|@font-face)' src/styles/main.css
```

Move every match (and its block) to `kao.css`, then wrap each surviving selector with `.theme-kao` prefix. Example: `.is-folio { ... }` → `.theme-kao .is-folio { ... }`.

- [ ] **Step 4: Create `src/styles/themes/kao.css`**

```css
/*
 * kao.css — variant-specific rules, gated by .theme-kao on <html>.
 * Imported by ThemeAssets when themeStore.variant === 'kao'.
 *
 * Frozen note: this file is owned by the kao/active track. Any visual
 * regression should land here, not in main.css.
 */

@layer kao {
  /* LXGW WenKai @font-face — moved from main.css */
  @font-face {
    font-family: 'LXGW WenKai';
    src: url('../fonts/LXGWWenKai-Regular.woff2') format('woff2');
    font-weight: 400 900;
    font-style: normal;
    font-display: swap;
  }

  /* archive / folio / kao tokens */
  :root {
    --archive-paper: #f5ebdd;
    --archive-paper-strong: #e8d9c3;
    --archive-paper-soft: #fbf4e9;
    --archive-ink: #241a15;
    --archive-ink-soft: #5f5348;
    --archive-olive: #2f6e64;
    --archive-olive-strong: #173c37;
    --archive-gold: #b78a34;
    --archive-gold-soft: #e0ae68;
    --archive-rose: #944f5b;
    --archive-photo: #264944;
  }

  .theme-kao .is-folio { /* ... */ }
  .theme-kao .is-bookmark { /* ... */ }
  .theme-kao .is-archive-strip { /* ... */ }
}
```

The actual rule bodies are copies from the old `main.css`. Fill them in verbatim from the moved blocks. The `@layer kao { }` wrapper makes it easy for `legacy.css` overrides to win if needed (but legacy.css should have no overrides per spec).

- [ ] **Step 5: Strip the moved content from `main.css`**

Use Edit to delete the moved blocks. The result should be: `main.css` no longer has `--archive-*` tokens, no `.is-folio/.is-bookmark/.is-archive-strip`, no `@font-face`. Verify:

```bash
grep -nE '(--archive|is-folio|is-bookmark|is-archive-strip|LXGW WenKai|@font-face)' src/styles/main.css
```

Expected: no output (empty grep).

- [ ] **Step 6: Remove static LXGW preload from `index.html`**

Open `index.html`. Find the `<link rel="preload" as="font" type="font/woff2" href="/src/assets/fonts/LXGWWenKai-Regular.woff2" crossorigin>` line and delete it. Also delete any `<link rel="stylesheet" ...>` that points at `/src/styles/...` (there should be none — `main.js` is the entry).

- [ ] **Step 7: Run test to verify it passes**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: PASS — the 5 new contracts hold.

- [ ] **Step 8: Run full build to verify CSS still resolves**

```bash
npm run build
```

Expected: build succeeds. Vite should not warn about missing CSS chunks.

- [ ] **Step 9: Commit**

```bash
git add src/styles/main.css \
        src/styles/themes/kao.css \
        src/styles/themes/legacy.css \
        index.html \
        src/__tests__/uiPolish.test.js
git commit -m "chore(css): split main.css into base + themes/kao.css; remove static LXGW preload"
```

---

## Task 4: `ThemeVariantView` + `ThemeAssets` + router wiring

**Files:**
- Create: `src/components/theme/ThemeVariantView.vue`
- Create: `src/components/theme/ThemeAssets.vue`
- Modify: `src/router/index.js`
- Modify: `src/App.vue` (mount ThemeAssets)
- Create: `src/__tests__/themeVariantView.test.js`

- [ ] **Step 1: Write failing smoke test**

Create `src/__tests__/themeVariantView.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'

// mock the imports ThemeVariantView resolves to
vi.mock('../../views/WelcomeView.vue', () => ({ default: { name: 'WelcomeKao', render: () => h('div', 'kao welcome') } }))
vi.mock('../../views/legacy/WelcomeView.vue', () => ({ default: { name: 'WelcomeLegacy', render: () => h('div', 'legacy welcome') } }))
vi.mock('../../pages/OpeningPage.vue', () => ({ default: { name: 'OpeningKao', render: () => h('div', 'kao opening') } }))
vi.mock('../../pages/legacy/OpeningPage.vue', () => ({ default: { name: 'OpeningLegacy', render: () => h('div', 'legacy opening') } }))
vi.mock('../../pages/Experience.vue', () => ({ default: { name: 'ExperienceKao', render: () => h('div', 'kao experience') } }))
vi.mock('../../pages/legacy/Experience.vue', () => ({ default: { name: 'ExperienceLegacy', render: () => h('div', 'legacy experience') } }))

import ThemeVariantView from '../components/theme/ThemeVariantView.vue'
import { useThemeStore } from '../stores/themeStore.js'

function factory(props) {
  return mount(ThemeVariantView, { props })
}

describe('ThemeVariantView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('resolves welcome/opening/experience in both variants', async () => {
    const s = useThemeStore()
    s.initTheme()

    for (const view of ['welcome', 'opening', 'experience']) {
      for (const variant of ['kao', 'legacy']) {
        s.setVariant(variant)
        const wrapper = factory({ view })
        await flushPromises()
        expect(wrapper.text()).toMatch(new RegExp(`${variant} ${view}`))
        wrapper.unmount()
      }
    }
  })

  it('unknown view falls back to a placeholder', async () => {
    const s = useThemeStore()
    s.initTheme()
    const wrapper = factory({ view: 'unknown-route' })
    await flushPromises()
    expect(wrapper.text()).toMatch(/unknown-route/i)
    wrapper.unmount()
  })

  it('switching themeStore.variant changes the rendered component', async () => {
    const s = useThemeStore()
    s.initTheme()
    const wrapper = factory({ view: 'welcome' })
    await flushPromises()
    expect(wrapper.text()).toMatch(/kao welcome/)

    s.setVariant('legacy')
    await flushPromises()
    expect(wrapper.text()).toMatch(/legacy welcome/)
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/__tests__/themeVariantView.test.js
```

Expected: FAIL — `Cannot find module '../components/theme/ThemeVariantView.vue'`.

- [ ] **Step 3: Implement `ThemeVariantView.vue`**

Create `src/components/theme/ThemeVariantView.vue`:

```vue
<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useThemeStore } from '../../stores/themeStore.js'

const props = defineProps({
  view: { type: String, required: true }, // 'welcome' | 'opening' | 'experience'
})

const RESOLVERS = {
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

const themeStore = useThemeStore()
const Resolved = computed(() => {
  const bucket = RESOLVERS[props.view]
  if (!bucket) return null
  const loader = bucket[themeStore.variant]
  if (!loader) return null
  return defineAsyncComponent(loader)
})
</script>

<template>
  <component :is="Resolved" :key="`${view}-${themeStore.variant}`" v-if="Resolved" />
  <div v-else class="theme-variant-view-fallback" data-test="theme-variant-fallback">
    Unknown theme variant view: {{ view }}
  </div>
</template>
```

The `:key` ensures Vue remounts the component when the variant changes.

- [ ] **Step 4: Implement `ThemeAssets.vue`**

Create `src/components/theme/ThemeAssets.vue`. This component:
- Watches `themeStore.variant`
- Dynamically imports the corresponding variant CSS module (Vite-managed)
- Manages the LXGW font `<link rel="preload">` injection/removal

```vue
<script setup>
import { watch, onMounted, onBeforeUnmount } from 'vue'
import { useThemeStore } from '../../stores/themeStore.js'

const themeStore = useThemeStore()
let injectedPreload = null

const VARIANT_CSS = {
  kao: () => import('../../styles/themes/kao.css'),
  legacy: () => import('../../styles/themes/legacy.css'),
}

const FONT_HREF = '/src/assets/fonts/LXGWWenKai-Regular.woff2' // Vite resolves at build

function injectFontPreload() {
  if (document.querySelector('link[data-theme-font="LXGW"]')) return
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'font'
  link.type = 'font/woff2'
  link.href = FONT_HREF
  link.crossOrigin = 'anonymous'
  link.dataset.themeFont = 'LXGW'
  document.head.appendChild(link)
  injectedPreload = link
}

function removeFontPreload() {
  if (injectedPreload && injectedPreload.parentNode) {
    injectedPreload.parentNode.removeChild(injectedPreload)
  }
  injectedPreload = null
}

async function syncAssets(variant) {
  await VARIANT_CSS[variant]() // Vite injects CSS chunk on first call
  if (variant === 'kao') injectFontPreload()
  else removeFontPreload()
}

onMounted(() => syncAssets(themeStore.variant))
watch(() => themeStore.variant, (v) => syncAssets(v))
onBeforeUnmount(() => removeFontPreload())
</script>

<template>
  <span data-theme-assets :data-variant="themeStore.variant" style="display:none" aria-hidden="true" />
</template>
```

The empty `<span>` exists only so this component has a render target. The side effects (CSS + font) happen in `<script setup>`.

- [ ] **Step 5: Update `router/index.js`**

Open `src/router/index.js`. Find the route records for `/welcome`, `/opening`, `/experience`. Replace their `component:` field with a wrapper pointing at `ThemeVariantView`. The wrapper passes a `view` prop.

Example transformation (apply per route):

```js
// before
{
  path: 'opening',
  name: 'opening',
  component: () => import('../pages/OpeningPage.vue'),
  meta: { ... }
}

// after
import ThemeVariantView from '../components/theme/ThemeVariantView.vue'
{
  path: 'opening',
  name: 'opening',
  component: ThemeVariantView,
  props: { view: 'opening' },
  meta: { ... }
}
```

Repeat for `welcome` and `experience`. Do NOT touch other routes (workbench children, settings, etc.).

- [ ] **Step 6: Mount `ThemeAssets` in `App.vue`**

Open `src/App.vue`. Add `<ThemeAssets />` somewhere near the root template (it's invisible but needs a mount point). Update the `<script setup>` import:

```js
import ThemeAssets from './components/theme/ThemeAssets.vue'
```

And in the template:

```vue
<template>
  <ThemeAssets />
  <router-view />
  <!-- existing chrome -->
</template>
```

- [ ] **Step 7: Run smoke test to verify it passes**

```bash
npm run test:run -- src/__tests__/themeVariantView.test.js
```

Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 8: Run full test suite + build**

```bash
npm run test:run
npm run build
```

Expected: all tests pass; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/components/theme/ThemeVariantView.vue \
        src/components/theme/ThemeAssets.vue \
        src/router/index.js \
        src/App.vue \
        src/__tests__/themeVariantView.test.js
git commit -m "feat(theme): ThemeVariantView + ThemeAssets wrappers + router wiring"
```

---

## Task 5: AppearanceControls in AppShell drawer + dynamic LXGW preload contract

**Files:**
- Create: `src/components/theme/AppearanceControls.vue`
- Modify: `src/layouts/AppShell.vue`
- Modify: `src/__tests__/uiPolish.test.js` (+2 contracts)

- [ ] **Step 1: Write failing uiPolish contracts**

Open `src/__tests__/uiPolish.test.js`. Add to the existing "theme system CSS contracts" block:

```js
it('AppShell.vue or shared AppearanceControls.vue exposes 外观 group', () => {
  const appShell = readFileSync(resolve(ROOT, 'src/layouts/AppShell.vue'), 'utf8')
  const appearance = (() => {
    try {
      return readFileSync(resolve(ROOT, 'src/components/theme/AppearanceControls.vue'), 'utf8')
    } catch { return '' }
  })()
  const combined = appShell + appearance
  expect(combined).toMatch(/外观/)
  // 4 options: kao+light, kao+dark, legacy+light, legacy+dark
  expect(combined).toMatch(/kao/i)
  expect(combined).toMatch(/legacy/i)
  expect(combined).toMatch(/亮色/)
  expect(combined).toMatch(/暗色/)
})
```

Also add a contract for the dynamic LXGW preload:

```js
it('ThemeAssets injects LXGW preload when variant=kao, removes when variant=legacy', async () => {
  const { mount } = await import('@vue/test-utils')
  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())
  const ThemeAssets = (await import('../components/theme/ThemeAssets.vue')).default
  const { useThemeStore } = await import('../stores/themeStore.js')

  const store = useThemeStore()
  store.initTheme()
  const wrapper = mount(ThemeAssets)
  await new Promise((r) => setTimeout(r, 0))

  store.setVariant('kao')
  await new Promise((r) => setTimeout(r, 0))
  expect(document.querySelector('link[data-theme-font="LXGW"]')).not.toBeNull()

  store.setVariant('legacy')
  await new Promise((r) => setTimeout(r, 0))
  expect(document.querySelector('link[data-theme-font="LXGW"]')).toBeNull()

  wrapper.unmount()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: FAIL — at least one contract missing the `外观` group, or ThemeAssets not yet injecting LXGW.

- [ ] **Step 3: Implement `AppearanceControls.vue`**

Create `src/components/theme/AppearanceControls.vue`:

```vue
<script setup>
import { computed } from 'vue'
import { useThemeStore } from '../../stores/themeStore.js'

const themeStore = useThemeStore()

const OPTIONS = [
  { variant: 'kao', colorScheme: 'light', label: 'Kao · 亮色', testId: 'appearance-kao-light' },
  { variant: 'kao', colorScheme: 'dark', label: 'Kao · 暗色', testId: 'appearance-kao-dark' },
  { variant: 'legacy', colorScheme: 'light', label: 'Legacy · 亮色', testId: 'appearance-legacy-light' },
  { variant: 'legacy', colorScheme: 'dark', label: 'Legacy · 暗色', testId: 'appearance-legacy-dark' },
]

const current = computed(() =>
  OPTIONS.find((o) => o.variant === themeStore.variant && o.colorScheme === themeStore.colorScheme)
)

function pick(option) {
  themeStore.setVariant(option.variant)
  themeStore.setColorScheme(option.colorScheme)
}
</script>

<template>
  <fieldset class="appearance-controls" data-test="appearance-controls">
    <legend class="appearance-controls__legend">外观</legend>
    <label
      v-for="opt in OPTIONS"
      :key="opt.testId"
      class="appearance-controls__option"
      :data-test="opt.testId"
      :class="{ 'is-active': current?.testId === opt.testId }"
    >
      <input
        type="radio"
        name="appearance"
        :value="opt.testId"
        :checked="current?.testId === opt.testId"
        @change="pick(opt)"
      />
      <span>{{ opt.label }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.appearance-controls {
  border: 0;
  padding: 0;
  margin: 0;
}
.appearance-controls__legend {
  font-size: var(--fs-sm, 12px);
  color: var(--text-secondary, #5d5247);
  margin-bottom: 6px;
}
.appearance-controls__option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  cursor: pointer;
}
</style>
```

- [ ] **Step 4: Mount `AppearanceControls` in `AppShell.vue`**

Open `src/layouts/AppShell.vue`. Find `shell-drawer__body` (or equivalent body section inside the drawer). Add:

```vue
<script setup>
// add to existing imports
import AppearanceControls from '../components/theme/AppearanceControls.vue'
</script>

<template>
  <!-- existing drawer trigger etc. -->
  <aside class="shell-drawer">
    <div class="shell-drawer__body">
      <!-- existing nav groups -->
      <AppearanceControls />
    </div>
  </aside>
</template>
```

The exact position in the drawer depends on existing structure; place it as the last group below navigation (per spec §6 "below navigation groups").

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: PASS — both new contracts hold.

- [ ] **Step 6: Run full suite to verify no regressions**

```bash
npm run test:run
```

Expected: All previous tests still pass; 2 new uiPolish tests + 1 ThemeAssets contract pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/theme/AppearanceControls.vue \
        src/layouts/AppShell.vue \
        src/__tests__/uiPolish.test.js
git commit -m "feat(theme): AppearanceControls in AppShell drawer + LXGW preload contract"
```

---

## Task 6: Gate kao-specific selectors + Experience opening-page residue contracts

**Files:**
- Modify: `src/views/WelcomeView.vue`
- Modify: `src/pages/OpeningPage.vue`
- Modify: `src/pages/Experience.vue`
- Modify: `src/components/worldbook/StructuredSettingsPanel.vue`
- Modify: `src/__tests__/uiPolish.test.js` (+2 contracts)

- [ ] **Step 1: Write failing uiPolish contracts**

Open `src/__tests__/uiPolish.test.js`. Add:

```js
it('variant-specific selectors are gated by .theme-kao / .theme-legacy', () => {
  const kao = readFileSync(resolve(ROOT, 'src/styles/themes/kao.css'), 'utf8')
  // All kao rules that don't apply at :root or @font-face must be inside .theme-kao
  const ruleBlocks = kao.match(/[.][a-z][^{]*\{[^}]*\}/gi) || []
  for (const block of ruleBlocks) {
    const selector = block.split('{')[0]
    if (selector.includes('@')) continue
    // selectors must include .theme-kao
    expect(selector).toMatch(/\.theme-kao/)
  }
})

it('/experience legacy/current contracts do not include removed opening-page residues', () => {
  const expCurrent = readFileSync(resolve(ROOT, 'src/pages/Experience.vue'), 'utf8')
  const expLegacy = readFileSync(resolve(ROOT, 'src/pages/legacy/Experience.vue'), 'utf8')
  for (const exp of [expCurrent, expLegacy]) {
    // Forbidden strings/classes per spec §8.2
    expect(exp).not.toMatch(/playable-world-opening-page/)
    expect(exp).not.toMatch(/opening-brief-lines/)
    expect(exp).not.toMatch(/opening-action-directory/)
    expect(exp).not.toMatch(/experience-stage-band/)
    expect(exp).not.toMatch(/playable-world-strip/)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: FAIL — at least one selector not gated, or one forbidden string still present.

- [ ] **Step 3: Gate kao-specific selectors in `WelcomeView.vue`**

Open `src/views/WelcomeView.vue`. Identify kao-specific selectors (`.is-folio`, `.is-bookmark`, archive-folio chrome selectors, etc.). For each, prepend `.theme-kao ` to the selector. Example:

```css
/* before */
.is-folio { ... }

/* after */
.theme-kao .is-folio { ... }
```

If a selector is for `:root`-level custom properties or `@font-face`, leave it ungated (Task 3 already moved those into kao.css).

- [ ] **Step 4: Repeat gating for `OpeningPage.vue`**

Same procedure. Add `.theme-kao` prefix to kao-specific selectors in `src/pages/OpeningPage.vue`.

- [ ] **Step 5: Repeat gating for `Experience.vue`**

Same procedure for `src/pages/Experience.vue`. ALSO verify the opening-page residue strings (`playable-world-opening-page`, `opening-brief-lines`, `opening-action-directory`, `experience-stage-band`, `playable-world-strip`) are absent. If any are present, remove them.

- [ ] **Step 6: Repeat gating for `StructuredSettingsPanel.vue`**

Same procedure for `src/components/worldbook/StructuredSettingsPanel.vue`.

- [ ] **Step 7: Run test to verify it passes**

```bash
npm run test:run -- src/__tests__/uiPolish.test.js
```

Expected: PASS — both new contracts hold.

- [ ] **Step 8: Run full suite + build**

```bash
npm run test:run
npm run build
```

Expected: all tests pass; build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/views/WelcomeView.vue \
        src/pages/OpeningPage.vue \
        src/pages/Experience.vue \
        src/components/worldbook/StructuredSettingsPanel.vue \
        src/__tests__/uiPolish.test.js
git commit -m "feat(theme): gate kao-specific selectors + Experience opening-page residue contracts"
```

---

## Task 7: docs/STATUS.md handoff entry

**Files:**
- Modify: `docs/STATUS.md` (add Recently done entry)

- [ ] **Step 1: Read current STATUS.md `Recently done` section**

```bash
sed -n '/^## Recently done/,/^## /p' docs/STATUS.md | head -20
```

Identify the existing entry pattern (look at the most recent handoff entries to match style).

- [ ] **Step 2: Prepend the theme-system handoff entry**

Use Edit on `docs/STATUS.md`. Find the `<!--` comment block at the top of `## Recently done`, then insert a new entry at the top of the entries list (after the comment, before the most recent existing entry):

```markdown
- 2026-06-15 18:55 CST — Claude on `feat/theme-system-20260615`: theme-system v1 implementation handoff (7 atomic commits, follow spec `docs/superpowers/specs/2026-06-15-theme-system-design.md` v2 + plan `docs/superpowers/plans/2026-06-15-theme-system.md`). 6 文件 legacy snapshot 从 `4e779d2` 抽出 + Pinia `themeStore` (variant + colorScheme + localStorage `app_theme_variant` + 保留 `app_theme`) + `useTheme` shim 保 back-compat + `main.css` 拆 base + `themes/{kao,legacy}.css` (Vite dynamic import，selector gated by `.theme-kao/.theme-legacy`) + `index.html` LXGW 静态 preload 删除 + `ThemeVariantView` / `ThemeAssets` wrappers + `router/index.js` 3 路由过 wrapper + `AppearanceControls` 4-radio 进 AppShell 抽屉 + LXGW kao 动态 preload + `useTheme()` 调用点 (WelcomeView/OpeningPage/Writing/Notes/ProseEssay/StructuredSettings) 0 破坏 + `uiPolish` +13 静态契约 / `themeStore` 8 tests / `themeVariantView` 3 smoke. 全量验证:`npm run test:run` 通过（应 87+ files, 600+ tests）；`npm run build` 通过；`git diff --check` clean。Out of scope: 立体感 migration interplay / build-time variant flag / per-page override / URL ?theme= override / Playwright visual（环境无 Chromium 维持 deferred）。
```

- [ ] **Step 3: Verify diff is sensible**

```bash
git diff docs/STATUS.md | head -20
```

Expected: a single `- ` line added at the top of `## Recently done`, no other changes.

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs(status): theme-system v1 implementation handoff"
```

---

## Self-Review Checklist

After all tasks complete, run through this checklist before marking the plan done:

- [ ] **Spec coverage**: every section of `docs/superpowers/specs/2026-06-15-theme-system-design.md` maps to at least one task. Reference:
  - §1 hard constraints → Task 1 (legacy snapshot) + Task 3 (CSS split) + Task 2 (useTheme shim)
  - §2 decisions → spread across all 7 tasks
  - §3 architecture → Tasks 2, 3, 4
  - §4 file structure → Tasks 1, 2, 3, 4, 5, 6
  - §5 store contract → Task 2
  - §6 switcher UX → Task 5
  - §7 legacy boundary → Task 1 (header) + Task 6 (residue contracts)
  - §8 tests → Tasks 1 (snapshot), 2 (store), 3 (CSS), 5 (LXGW), 6 (selectors + residue)
  - §9 verification → per-task test runs + final `npm run test:run && npm run build && git diff --check`
  - §10 rollout → Task 7 (status handoff) + branch isolation
  - §11 risks → addressed by mitigation: Task 4 (router/Pinia decoupling), Task 3 (CSS import strategy), Task 1 (legacy compile fixes noted), Task 6 (selector gating), Task 3 (LXGW preload removal), Task 4 (ThemeAssets for dynamic), Task 2 (useTheme shim), Task 6 (residue contracts)

- [ ] **Placeholder scan**: no "TBD", "TODO", "implement later", "fill in details", "similar to Task N", or vague requirements. Concrete code in every step.

- [ ] **Type / method consistency**:
  - `themeStore.initTheme()` used in Task 2, called from App.vue in Task 2, used in tests consistently.
  - `setVariant`, `setColorScheme`, `applyToHtml` signatures match spec §5.
  - `LS_VARIANT = 'app_theme_variant'` and `LS_COLOR = 'app_theme'` used consistently across Task 2 and Task 5.
  - `ThemeVariantView` props.view values: `'welcome' | 'opening' | 'experience'` — used consistently in Task 4 (router) and Task 4 (test).
  - `AppearanceControls` test IDs `appearance-kao-light` etc. — used consistently in Task 5 (component) and Task 5 (contract).
  - ThemeAssets `data-theme-font="LXGW"` selector — used consistently in Task 5 (component) and Task 5 (contract).

- [ ] **Final verification before merge**:

```bash
npm run test:run
npm run build
git diff --check
```

All three must pass. Push to `feat/theme-system-20260615` after the 7 commits land.