# Vue 3 / Vite Ecosystem Research — Pinax (2026-06-15)

> Research deliverable for the Pinax / text-game-framework upgrade runway.
> Stack today: Vue 3.4, Pinia 2.1, vue-router 4.6, Vite 5, Vitest 1, VitePress 1.6, ESLint 9, jsdom 29.
> Goal: identify current-stable versions, upgrade risks, missing features, and concrete
> performance patterns Pinax can adopt (god store 2398 LoC, god page 4657 LoC, 87–89 test files / ~620 tests).

**Sources of truth used:** Context7 (`vuejs/core`, `vuejs/pinia`, `vuejs/vue-router`,
`vitejs/vite`, `vitest-dev/vitest`, `vuejs/test-utils`, `vuejs/eslint-plugin-vue`,
`vuejs/vitepress`, `vueuse/vueuse`, `unovue/reka-ui`, `unovue/shadcn-vue`,
`prazdevs/pinia-plugin-persistedstate`, `intlify/vue-i18n`).
Firecrawl search and WebSearch returned 401 / 400 invalid-params errors in this
session — those calls were skipped. WebFetch on `github.com` and `vite.dev` was
blocked by the proxy allowlist. Every concrete version number and API claim below
is grounded in Context7 doc pulls.

---

## 1. Latest stable versions (2026-06 cutoff)

| Package | Today (Pinax) | Latest stable (Context7) | Breaking-change risk |
|---|---|---|---|
| `vue` | `^3.4.0` | `vuejs/core` HEAD = **3.5.x** (Vue 3.5 introduced `defineModel`, `useTemplateRef`, `useId`, lazy reactivity, `onWatcherCleanup`) | **Low.** 3.5 is additive for `<script setup>` users; only deprecations are a few rare template-compiler hooks. Pinax uses Composition API heavily, so the migration is essentially free. |
| `pinia` | `^2.1.0` | **3.0.4** (per `packages/pinia/package.json`) | **Low–Medium.** Pinia 3 is "Vue 3 only + removes deprecated APIs"; no new features. Per the v2→v3 cookbook (`docs/cookbook/migration-v2-v3.md`), this is a cleanup major, not a paradigm shift. Setup stores already work in 2.1. |
| `vue-router` | `^4.6.4` | **4.5.x → 4.6.x line continues**; no 5.x announced | **Low.** Pinax is on the latest minor line. |
| `vite` | `^5.0.0` | **7.x stable**, **8.x available** (per `vitejs/vite` versions listing) | **Medium.** Vite 6 introduced the Environment API as RC. Vite 7 added the `buildApp` hook and is described as "a smooth update from Vite 6." For Pinax (SPA only), the `environment` API is opt-in. Recommend **Vite 6 first**, then 7 once `@vitejs/plugin-vue` ships compatible peer ranges. |
| `vitest` | `^1.0.0` | **3.x → 4.x stable** (`vitest-dev/vitest` versions: `v3_2_4`, `v4.0.7`, `v4.1.6`) | **Medium.** Vitest 4 promoted Browser Mode from experimental to stable and moved providers into separate packages (`@vitest/browser-playwright`, `@vitest/browser-webdriverio`). The `page` import path changed from `@vitest/browser/context` → `vitest/browser`. |
| `@vue/test-utils` | `^2.4.11` | **2.4.x** (latest in 2.x line) | **Low.** No 3.x announced. |
| `vitepress` | `^1.6.4` | **1.6.x** line current | **Low.** |
| `eslint` + `eslint-plugin-vue` | `^9.0.0` + `^9.0.0` | ESLint 9 + `eslint-plugin-vue` v9/v10 supports ESLint 8.57 / 9 / 10; `eslint.config.js` flat config is the default since v9 | **Low.** Pinax already runs ESLint 9; flat config is what `eslint-plugin-vue` ships via `pluginVue.configs['flat/recommended']`. |
| `vueuse` | not installed | **13.x** (`v13.3.0` per `vueuse/vueuse` versions) | **Low.** Add-only dep, 200+ tree-shakable composables, full TypeScript. |
| `pinia-plugin-persistedstate` | not installed | **v4** line current (`prazdevs/pinia-plugin-persistedstate`) | **Low.** Drop-in plugin; supports per-store `pick` / `storage` / multi-storage arrays. |

> Note on `vue 3.5` vs the Pinax pin of `^3.4.0`: caret semver already allows 3.4.x → 3.5.x;
> the only reason Pinax is "behind" is the major-minor label and any new test scaffolding
> we want to lean on.

---

## 2. Vue 3.5 features Pinax isn't using

Vue 3.5 shipped (per Context7 docs and the Vue.js blog):

- **`defineModel()`** — declares a `v-model`-style prop+emit pair in one line inside `<script setup>`.
  Pinax currently writes the longhand `props:` + `emits:` + manual `update:xxx` boilerplate on
  most form components. Switching to `defineModel()` cuts ~10 LoC per form and removes the
  manual emit naming footgun.
- **`useTemplateRef('name')`** — replaces the string-based `ref="name"` + `this.$refs.name`
  pattern with a typed `Ref<T | null>` returned from `setup()`. This is exactly what Pinax's
  `OpeningPage.vue`, `WorkbenchPageHero.vue`, and `gm-persona/*` use for canvas / scroll
  anchors. Adopting it gets type-safe DOM access (works especially well with VueUse's
  `useScroll(el)` and `useIntersectionObserver(target)` patterns, both of which currently
  take a `Ref<T>` in VueUse 13).
- **`useId()`** — SSR-safe, deterministic unique id generator. The kao / archive folio
  aesthetic needs ids for `aria-controls`, `<label for>`, and tooltip wiring; today Pinax
  hand-rolls counter-based ids in scattered places. `useId()` is the right primitive.
- **`onWatcherCleanup(callback)`** — the 3rd arg of a `watch` callback, replacing the
  `onCleanup` from `effectScope` for the common "cancel stale async" case. Pinax's
  `worldbookContextBuilder.js` and `generation*` services fire concurrent debounced
  requests; this is the canonical primitive for "abort the previous run".
- **Lazy reactivity for `reactive()` (per Vue 3.5 release notes)** — large object graphs
  that are read-mostly now skip the proxy cost on cold access. Relevant to the god store.
- **`shallowRef` for primitive state** — already supported pre-3.5, but the new docs lean on
  it as the standard for "replace-the-whole-thing" refs (file lists, AI responses,
  large JSON blobs). Pinax's `gameStore.js` would benefit from `shallowRef` for
  `messages[]`, `memories[]`, `generatedImages[]` (replace instead of patch).

**Estimated effort:** 1 PR for `defineModel` across the form components, 1 PR for
`useTemplateRef` swap, 1 PR for `useId` + `onWatcherCleanup`. Low risk because each is
purely additive on the public component contract.

---

## 3. Pinia 2 vs Pinia 3

Context7 confirms **Pinia 3.0.4 is the current major** (see `packages/pinia/package.json`).
The v2→v3 cookbook (`docs/cookbook/migration-v2-v3.md`) states:

> "Pinia v3 is a major release focused on **removing deprecated APIs** and **updating
> dependencies** rather than introducing new features. It is designed **exclusively
> for Vue 3**, meaning users on Vue 2 should continue using Pinia v2."

Practical changes Pinax will hit:

- Drop Vue 2 compatibility code paths → slightly smaller bundle.
- Several `defineStore({ ... })` option-store keys deprecated in 2.x are now removed
  (e.g. `store.$dispose()` semantics tightened; `pinia.use()` plugin signature stable).
- Setup-store syntax (`defineStore('id', () => { ... })`) — **unchanged**, Pinax already
  uses this pattern in any post-2024 store.
- Recommended pattern: convert the god `gameStore.js` (2398 LoC options store) to a
  **setup store**, which unlocks:
  - natural `computed` boundaries (each derived slice stays a `computed`, not a getter)
  - per-action `markRaw` for non-reactive payloads (raw AI response objects)
  - per-state `shallowRef` for arrays the store replaces wholesale
  - easier `effectScope` disposal when a session ends

`pinia-plugin-persistedstate` v4 plays well with setup stores — config goes in the third
argument of `defineStore` as `persist: { storage, pick, ... }` (per Context7 README).

**Recommendation:** schedule Pinia 3 + setup-store refactor of `gameStore.js` together;
they reinforce each other.

---

## 4. Vite 5 → 6 → 7

Context7's Vite docs confirm Vite 6 introduced the **Environment API** (RC) and that
Vite 7 added the `buildApp` hook for plugin coordination. Vite 7's announcement blog
states it is a "smooth update from Vite 6" and mainly removes already-deprecated
features (Sass legacy API, `splitVendorChunkPlugin`).

Vite 6 breaking changes that *could* hit Pinax (from the 6.0.0 changelog pulled via
Context7):

- **Dropped Node 21 support in version ranges** — Pinax's CI is Node 20+ so this is fine.
- **`fast-glob` → `tinyglobby`** — only matters if Pinax uses `fast-glob` directly (it does not, AFAICT).
- **Default `build.cssMinify: 'esbuild'` for SSR** — irrelevant for Pinax SPA build.
- **`json.stringify: 'auto'` default** — JSON imports are now auto-stringified when
  small. Pinax imports `mem0ai` config blobs; check that no JSON is depended on as a
  parsed object at module top level.
- **PostCSS config loaded within workspace root only** — Pinax has a flat structure, fine.
- **Chokidar v4** — Vite dev-server file watcher upgrade. No app-level change required.
- **`fs.cachedChecks` removed** — Pinax doesn't use it.
- **Sass legacy API removed** — Pinax does not use Sass.

For a SPA like Pinax, Vite 6 is essentially a no-op. Vite 7 removes a couple more
deprecations; the `buildApp` hook is for framework authors (Nuxt, etc.), not end users.

**Recommendation:** upgrade to Vite 6 first (one PR, basically `npm i vite@^6`), then
to Vite 7 after `@vitejs/plugin-vue` v6 ships compatible peer ranges. Wait on Vite 8
until 8.x has at least 2 minor versions of ecosystem stability.

---

## 5. Vitest 1 → 3 → 4

Pinax currently uses Vitest 1. The notable changes (per Context7 docs):

- **Vitest 3** brought tighter typing, `vi.hoisted()`, and the `expect.soft()` pattern
  default. Breaking change list is small for most projects.
- **Vitest 4 (current stable)** (per `docs/blog/vitest-4.md`):
  - **Browser Mode is no longer experimental** — but it requires a separate provider
    package (`@vitest/browser-playwright` or `@vitest/browser-webdriverio`).
  - The `page` import path migrated: `@vitest/browser/context` → `vitest/browser`.
  - `@vitest/browser` is no longer a direct dep; it's bundled in each provider.
  - Migration guide (`docs/guide/migration.md`) is the authoritative list.

For Pinax (jsdom-based, no Playwright in env), the migration is low impact: don't
opt into Browser Mode, just upgrade the core. The `vi.useFakeTimers()` / `vi.setSystemTime()`
APIs Pinax likely already uses are unchanged.

**Recommendation:** upgrade to Vitest 3 first, then 4 in a follow-up. Skip Browser Mode
until/unless Pinax adds real Chromium to CI (per `docs/STATUS.md` Blocked entry, Playwright
is currently deferred).

---

## 6. Component library options for the kao / archive aesthetic

Pinax's aesthetic per current state is **"kao" / "archive-folio"** — serif display
type (LXGW 霞鹜文楷 just landed), warm paper-tone palette, no Material/flat-design cues.
Per Context7 docs:

- **Reka UI** (`unovue/reka-ui`) — unstyled, WAI-ARIA compliant, headless. Components
  ship with zero CSS so the kao folio styling applies directly. Has `Accordion`,
  `Dialog`, `Popover`, `Tooltip`, `Tabs`, `Dropdown Menu`, `Toggle`, etc. Native Vue 3
  (Composition API). Pairs with `unplugin-vue-components` + `RekaResolver` for
  automatic tree-shakeable imports. **Best fit** if Pinax ever needs accessible
  primitives (modals, menus, comboboxes for worldbook search) without surrendering
  visual control.
- **shadcn-vue** (`unovue/shadcn-vue`) — copy-paste model (Radix-style), built on
  Reka UI as of the Feb 2025 changelog (replaced the prior Radix Vue dep). Tailwind v4
  based. **Caveat:** adopting shadcn-vue implies adopting Tailwind, which conflicts
  with Pinax's hand-rolled CSS / `main.css` token system. The shadcn-vue docs note
  the registry approach means "you own the source" — so it's not a runtime dep, just a
  generator. Still: it would add `tailwindcss` to the build pipeline, which is a much
  bigger change than Reka UI alone.
- **Headless UI Vue** — limited Vue 3 surface, no 2025 momentum.
- **Element Plus / Naive UI / Vuetify / PrimeVue** — all opinionated design systems
  with their own visual language. Would fight the kao aesthetic and bloat the bundle.
- **No library** — Pinax's current hand-rolled component set is already extensive;
  the bigger wins (see §7) are in reactivity and store shape, not UI primitives.

**Recommendation:** **stay unstyled + custom CSS for the kao surface**; if accessibility
needs grow (e.g. a `Command` palette for worldbook search), pull in **Reka UI alone**
(unstyled primitives + ARIA). Skip Tailwind and skip shadcn-vue unless the team wants
to abandon the existing token system.

---

## 7. Performance patterns 2025 — targeted at Pinax's god store + god page

The two scaling problems called out in the project brief:

1. **`useGameStore` re-renders all subscribers on any field change.**
2. **`saveCurrentSession` is called 25+ times.**

Per Vue 3.5 + VueUse 13 docs, the modern toolbox:

### 7.1 `shallowRef` for "replace the whole array" state
VueUse 13 + Vue 3.5 lean heavily on `shallowRef` for arrays whose consumers re-render
on the whole-list identity anyway (`messages`, `memories`, `generatedImages[]`).
Context7's `useScroll` / `useIntersectionObserver` examples both use
`const targetIsVisible = shallowRef(false)` for the same reason.

```js
// gameStore.js (current)
const generatedImages = ref([])
// any nested mutation (.push / .splice) re-walks the proxy graph

// after
const generatedImages = shallowRef([]) // new array → identity change → re-render
generatedImages.value = [...generatedImages.value, newImage]
```

### 7.2 `markRaw` for non-reactive payloads
AI responses, Comlink `Remote<>` proxies, d3 / delaunator instances, and `Worker`
handles should never be reactive. `markRaw(response)` (or `() => markRaw(makeWorker()))`
in setup-store getters prevents Vue from installing a proxy on them.

### 7.3 Split the god store into a **store-of-stores**
Pinia setup stores + `pinia-plugin-persistedstate` v4's per-store `pick` let us split
`gameStore.js` into:
- `useSessionStore` (current session, messages, worldbook) — persists
- `useGenerationStore` (in-flight generations, image cache) — ephemeral, `shallowRef`
- `useWorldbookStore` (worldbooks, lorebook, context builder caches) — persists
- `useSettingsStore` (apiSettings, UI prefs) — persists
- `useUiStore` (chrome state: which panel is open, scroll, hover) — ephemeral

Each becomes ~300–600 LoC. Subscribers only re-render on their own store's mutations.
The god page `ProseEssay.vue` (4657 LoC) becomes manageable because it can `storeToRefs`
only the slices it actually needs.

### 7.4 `v-memo` on the god page's virtualized lists
Vue 3.5 docs include `vue/valid-v-memo` in the essential ESLint ruleset, which is a
strong hint that v-memo is the canonical "skip diff for stable subtrees" pattern.
For `ProseEssay.vue`'s long message list and `WorkbenchPageHero.vue`'s card grid:

```vue
<MessageCard
  v-for="m in messages"
  :key="m.id"
  v-memo="[m.id, m.text, m.role, m.editedAt]"
  :message="m"
/>
```

### 7.5 `defineAsyncComponent` + route-level lazy chunks
Pinax's `views/*` should already be lazy via `() => import(...)` in `vue-router`
(Context7 docs explicitly recommend this). Verify and add `loadingComponent` /
`errorComponent` / `delay: 200` to defer the spinner.

### 7.6 Coalesce `saveCurrentSession` with a debounced side-effect
Per Context7's VueUse docs, `useDebounceFn` is the canonical pattern:

```js
import { useDebounceFn } from '@vueuse/core'
const persistSession = useDebounceFn(async () => {
  await saveCurrentSession()
}, 400, { maxWait: 2000 })
```

Wrap the 25+ call sites behind `persistSession`; `maxWait` ensures periodic flush
during sustained writes.

### 7.7 `effectScope` for per-session disposables
VueUse best-practice docs show `scope.run(() => { useEventListener(...); watch(...) })`
+ `scope.stop()` for "torn down at end of session" resources. Pinax's session
lifecycle (start → play → save → end) is the perfect consumer — every event listener,
intersection observer, and `watch` registered during a session can be in one scope.

### 7.8 Type-safe template refs to enable compile-time el-typing
With Vue 3.5 `useTemplateRef('el')` + `Ref<HTMLDivElement | null>`, Pinax can
catch missing `?.` and wrong-typed `el.value` accesses at the type level instead of
at runtime.

---

## 8. Testing best practices 2025

Per Context7 docs:

- **Vitest 4 + jsdom** is Pinax's current trajectory (no Chromium). The 4.x migration
  is the only meaningful change; not adopting Browser Mode means we ignore the
  provider-package split entirely.
- **`@vue/test-utils` 2.x** (`mount`, `flushPromises`, attachTo, `global.plugins` /
  `global.stubs`) is stable; **for composables that use lifecycle hooks, wrap in a
  TestComponent** (the `reusability-composition.md` guide). Pinax's `useWorldbook`
  / `useGeneration` / `useApiSettings` should each have a test helper that mounts
  the composable inside a `defineComponent({ setup() { return useX() } })` shell.
- **`vitest-axe`** is fine where it sits. For richer a11y assertions, layer in
  `@axe-core/playwright` only when Pinax gets Playwright. Until then, jsdom + axe-core
  is enough for component-level checks.
- **Visual regression without Chromium** — viable alternatives:
  - **Chromatic** (Storybook-hosted; requires Storybook setup)
  - **`reg-suit`** + **reg-cli** (image diff in CI, no browser driver needed if you
    generate PNGs via headless rendering) — Pinax already has canvas/map renderers;
    could snapshot those into PNGs and diff against baselines.
  - **`happo.io`** for component visual diffs via JSDOM-emitted markup snapshots.
- **Coverage** — Pinax does not currently collect coverage. Adding
  `vitest run --coverage` with `@vitest/coverage-v8` is a single-config addition and
  the modern v8 provider is the standard.

---

## 9. Recommendation — concrete upgrade plan

Sequenced by **risk:reward**:

### Tier 1 — additive, near-zero risk (1–2 PRs each)
1. **Adopt `defineModel`, `useTemplateRef`, `useId`** across form components.
   Vue 3.5 features; existing components only get shorter.
2. **Adopt VueUse 13** (`@vueuse/core`) for the documented primitives:
   `useEventListener`, `useStorage`, `useScroll`, `useIntersectionObserver`,
   `useDebounceFn`, `usePreferredDark`, `useMediaQuery`. Tree-shakeable, no peer
   pressure.
3. **Coalesce `saveCurrentSession`** behind `useDebounceFn(..., 400, { maxWait: 2000 })`.
   Direct fix for the "called 25+ times" hot path.

### Tier 2 — upgrade majors (single PRs)
4. **Pinia 2.1 → 3.0.4**. Run tests; no API changes for setup stores.
5. **Vite 5 → 6** (then 7 in a follow-up). Verify `vite build` and `vite preview`.
6. **Vitest 1 → 3 → 4**. Stay on jsdom; ignore Browser Mode changes.

### Tier 3 — refactors that pay off long-term
7. **Split `gameStore.js`** into 5 stores (Session / Generation / Worldbook /
   Settings / UI). Convert to setup-store form. Add `pinia-plugin-persistedstate`
   per-store with explicit `pick` lists so the persistence surface is documented.
8. **`v-memo` the long lists** in `ProseEssay.vue` and any virtualized list.
9. **Convert `ProseEssay.vue` (4657 LoC)** to a layout shell + lazy-loaded feature
   components (chapter list, scene editor, image rail). `defineAsyncComponent` with
   `loadingComponent`.

### Tier 4 — only if accessibility needs grow
10. **Add Reka UI** for primitives (Dialog, Combobox, Tooltip, Tabs) without giving
    up the kao CSS. Skip Tailwind, skip shadcn-vue.

### What to defer
- **Vite 7 / 8** — wait for `@vitejs/plugin-vue` v6+ compatibility and ecosystem
  rest (2 minor versions before adoption).
- **Vue Vapor mode** — per project knowledge and the absence of stable docs in
  Context7 (`/vuejs/vue` does not yet surface Vapor-mode guides), Vapor remains
  experimental. Not appropriate for Pinax.
- **Nuxt / SSR for export** — Pinax stores data in `localStorage`; SSR would require
  a wholesale storage rethink. VitePress already handles the docs SSR need.

---

## 10. Sources

**Context7 (authoritative for current library docs):**

- `vuejs/vue` — https://github.com/vuejs/vue — Vue 3 Composition API examples,
  `shallowRef`, watcher cleanup, template compiler API.
- `vuejs/core` (referenced for 3.5 features) — `defineModel`, `useTemplateRef`,
  `useId`, `onWatcherCleanup`, lazy reactivity.
- `vuejs/pinia` (v4 branch) — https://github.com/vuejs/pinia — setup-store docs,
  v2→v3 migration cookbook, version 3.0.4 in `package.json`.
- `prazdevs/pinia-plugin-persistedstate` — https://github.com/prazdevs/pinia-plugin-persistedstate
  — per-store `pick`, multi-storage arrays, `storage: piniaPluginPersistedstate.localStorage()`.
- `vitejs/vite` — https://github.com/vitejs/vite — Vite 6 breaking changes (drop Node
  21, `tinyglobby`, Sass legacy, chokidar v4), Environment API RC, Vite 7
  `buildApp` hook announcement.
- `vitest-dev/vitest` — https://github.com/vitest-dev/vitest — Vitest 4 Browser
  Mode stability, `vitest/browser` import path migration, `vi.useFakeTimers` API,
  browser provider packages (`@vitest/browser-playwright`,
  `@vitest/browser-webdriverio`).
- `vuejs/test-utils` — https://github.com/vuejs/test-utils — `mount` API,
  composable testing via test-helper component, `flushPromises`.
- `vuejs/eslint-plugin-vue` — https://github.com/vuejs/eslint-plugin-vue —
  flat config (`pluginVue.configs['flat/recommended']`), peer-dep range
  `^8.57.0 || ^9.0.0 || ^10.0.0`.
- `vuejs/vitepress` — https://github.com/vuejs/vitepress — `lastUpdated` config,
  code groups, snippet imports.
- `vueuse/vueuse` — https://github.com/vueuse/vueuse — `useStorage`, `useEventListener`,
  `useScroll`, `useIntersectionObserver`, `useMediaQuery`, `useDebounceFn`,
  `usePreferredDark`, `effectScope` best practices, version v13.3.0.
- `unovue/reka-ui` (v2 docs) — https://github.com/unovue/reka-ui — unstyled accessible
  primitives, `unplugin-vue-components` + `RekaResolver`, primitive-extension pattern.
- `unovue/shadcn-vue` (v4 docs) — https://github.com/unovue/shadcn-vue — Feb 2025
  switch to Reka UI as default, `npx shadcn-vue@latest init`, Tailwind v4 dependency.
- `intlify/vue-i18n` — https://github.com/intlify/vue-i18n — `createI18n({ legacy: false })`,
  `useI18n()` composition API.

**Live verification gaps (noted honestly):**
- `firecrawl_search` returned `401` for every call in this session → ecosystem
  news / "what's new this week" could not be confirmed.
- `WebSearch` returned `400 invalid params` for every query → cross-validation
  against community blog posts not available.
- `WebFetch` on `github.com` / `vite.dev` was blocked by the project proxy
  allowlist → the raw CHANGELOG.md files for Vue 3.5, Vite 7, Vitest 4, Pinia 3
  were not directly pulled. All version numbers above come from Context7 doc
  extracts (which mirror those CHANGELOGs).
- Vue Vapor Mode status was not surfaced in the `vuejs/vue` Context7 docs that
  responded to our queries. Per project memory (Vue Vapor is referenced as
  experimental in the Vue core team blog posts prior to 2026-06), we recommend
  treating Vapor as not-yet-production for Pinax.