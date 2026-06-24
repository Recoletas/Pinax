# UI-U2: Persistent top-bar mast + StructuredSettings entry points

**Date**: 2026-06-24
**Worker**: UI-U2 (Claude)
**Branch**: main
**Depends on**: UI-U1 (route path realignment)

## Summary

Two availability fixes:
1. Added a persistent sticky `shell-mast` top bar to AppShell with integrated hamburger, 5 activity tabs, and a settings chip — reusing existing CSS that was already defined but not rendered.
2. Added 2 redundant StructuredSettings entry points (Experience.vue topstrip + WelcomeView.vue command stack) so users can reach the structured settings page without opening the drawer.

## Mast structure

```
<header class="shell-mast">       ← sticky top:0 z-index:260 (existing CSS)
  <div class="shell-mast__brand"> ← left column
    <button class="shell-menu-btn"> ← hamburger (moved from fixed .shell-nav-trigger)
    <strong>route caption</strong>
  </div>
  <nav class="shell-tabbar" role="tablist"> ← center column
    <button class="shell-tab" v-for="ACTIVITY_ITEMS"> ← 5 tabs (体验/设定/写作/素材/画布)
  </nav>
  <div class="shell-mast__meta"> ← right column
    <router-link class="shell-meta-chip" to="/settings/structured">设定</router-link>
  </div>
</header>
```

### Visibility
- Mast hidden when `route.meta.hideActivityBar` is true (welcome, opening, settings/worldbook quick import)
- Mast shown on all other routes (experience, settings/structured, settings/worldbook/advanced, settings/world-map, writing, materials, prose-essay)
- Drawer preserved — hamburger inside mast still opens the ActivityBar + SidePanel drawer

### a11y
- Tabbar: `role="tablist"` with `role="tab"` buttons, each has `aria-selected` and `aria-label`
- Mast hamburger: `aria-expanded` syncs with drawer state, `aria-label="打开工作区导航"`
- Settings chip: `aria-label="打开结构化设定"`
- Settings chip on Experience topstrip: `aria-label="打开结构化设定"`

## Entry points to StructuredSettings

| Location | Element | Target |
|---|---|---|
| AppShell mast right | `shell-meta-chip` router-link | `/settings/structured` |
| Experience.vue topstrip | `ws-topstrip__settings-link` router-link | `/settings/structured` |
| WelcomeView command stack | BookmarkButton (index "04", label="设定") | `/settings/structured` |

## Files changed

### Template changes
- `src/layouts/AppShell.vue` — Added `<header class="shell-mast">` replacing standalone fixed hamburger
- `src/pages/Experience.vue` — Added `ws-topstrip__settings-link` in pagetitle div
- `src/views/WelcomeView.vue` — Added 4th BookmarkButton (welcome-quaternary-link)

### CSS changes
- `src/styles/themes/kao.css` — Updated z-index overrides from `.shell-nav-trigger` → `.shell-mast` + `.shell-mast .shell-menu-btn`; added `.ws-topstrip__settings-link` rules; bump mast z-index to 260 (above ws-topstrip 240)

### Test changes
- `src/__tests__/uiPolish.test.js` — Updated AppShell mast/tabbar assertions (positive instead of negative); updated W2 contract tests to match new mast selectors
- `src/__tests__/welcomeView.test.js` — Added quaternaryCTA assertions for new settings button
- `src/__tests__/legacySnapshot.test.js` — (from U1)

### Not changed
- ActivityBar.vue, SidePanel.vue — 0 visual changes
- Store / service / composable — 0 logic changes
- legacy/ directory — only U1 route name updates in legacy/OpeningPage.vue
- router/index.js — 0 changes (U1 only)

## Test results

```
 Test Files  112 passed | 1 failed (113)
      Tests  1020 passed | 1 failed (1021)
```

- 1 failure: uiPolish BIG1-5 (`v-if="isDemoMode"` → `v-if="meta.isDemoMode.value"`). Pre-existing, not caused by this change.
- workbenchNav.test.js ✓ (2 tests)
- welcomeView.test.js ✓ (4 tests)
- legacySnapshot.test.js ✓ (16 tests)
- uiPolish.test.js ✓ (250/251 tests pass)

## Build

```
npm run build — ✓ built in 3.63s, clean
git diff --check — clean
```

## Diff stat

```
24 files changed, 644 insertions(+), 108 deletions(-)
```

(U1 + U2 combined diff; many insertions from pre-existing uncommitted workstation changes)

## Constraints compliance

- [x] 0 store / service / router changes
- [x] 0 ActivityBar/SidePanel visual changes
- [x] Mast reuses existing CSS (shell-mast/shell-tab/shell-meta-chip)
- [x] New CSS uses archive-folio tokens only (0 raw hex, 0 !important)
- [x] 0 :global(.theme-kao) additions
- [x] Immersive shell routes still hide mast (hideActivityBar gate)
- [x] a11y: aria-label, aria-expanded, role="tablist"/"tab", aria-selected
- [x] 0 legacy/ changes beyond U1 route names
- [x] 0 commit / 0 push
