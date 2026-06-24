# UI-U3: Bidirectional navigation — context-aware back-links

**Date**: 2026-06-24
**Worker**: UI-U3 (Claude)
**Branch**: main
**Depends on**: UI-U1 (route names), UI-U2 (mast + welcome quaternary)

## Summary

Added 7 bidirectional exit buttons across 5 pages, completing the navigation graph so users can move between activities without returning to Welcome or opening the drawer. Context-aware logic disables the settings link when no worldbook is selected.

## Navigation pairs completed

| From | To | Label | Location | Context-aware |
|---|---|---|---|---|
| ProseEssay | Materials | `素材库` | WorkbenchPageHero #actions row | — |
| Experience | Settings | `设定` | ws-topstrip pagetitle | disabled if no active worldbook |
| WelcomeView | Writing | `写作` | welcome-command-stack (index 05) | — |
| WelcomeView | Materials | `素材` | welcome-command-stack (index 06) | — |
| WelcomeView | Storyboard | `画布` | welcome-command-stack (index 07) | — |
| Writing | Adventure | `冒险` | wall__tabs | session→experience, else→opening |
| Notes | Adventure | `冒险` | manuscript-top__right | session→experience, else→opening |

## Existing pairs preserved

- Writing → Materials ✓ (wall__tab `素材库`)
- Notes → Writing ✓ (manuscript-top__tab `写作`)
- Notes → ProseEssay ✓ (goToProseEssay)
- Experience → worldbook ✓ (openWorldbookQuickImport)
- StructuredSettings → Experience ✓

## Context-aware logic detail

### Experience settings button
```js
:disabled="!hasSelectedWorldbook"
:title="hasSelectedWorldbook ? '修改当前世界设定' : '先选择世界'"
:aria-disabled="(!hasSelectedWorldbook).toString()"
```
Converted from `<router-link>` to `<button>` so `:disabled` works. Same CSS class preserved. The global mast chip (U2) remains a simple router-link — the context-aware disable is on the in-page button only.

### Writing / Notes adventure back-link
```js
function goToAdventure() {
  const hasSession = gameStore.currentSessionId
    && gameStore.sessions.some(s => s.id === gameStore.currentSessionId)
  if (hasSession) {
    router.push({ name: 'experience' })
  } else {
    router.push({ name: 'opening' })
  }
}
```

## Files changed

| File | Change |
|---|---|
| `src/pages/ProseEssay.vue` | +1 router-link in #actions row |
| `src/pages/Experience.vue` | router-link→button with disable/tooltip/aria-disabled |
| `src/views/WelcomeView.vue` | +3 BookmarkButtons (05/06/07) |
| `src/pages/Writing.vue` | +gameStore import + `wall__tab` 冒险 + goToAdventure() |
| `src/pages/Notes.vue` | +gameStore import + `manuscript-top__tab` 冒险 + goToAdventure() |
| `src/__tests__/welcomeView.test.js` | +assertions for quinary/senary/septenary CTAs |

## Test results

```
 Test Files  112 passed | 1 failed (113)
      Tests  1020 passed | 1 failed (1021)
```

- 1 failure: uiPolish BIG1-5 (pre-existing `v-if="isDemoMode"` → `v-if="meta.isDemoMode.value"`)
- welcomeView.test.js ✓ (4 tests, 6 new assertions)
- workbenchNav.test.js ✓
- uiPolish.test.js ✓ (250/251 tests pass)

## Build

```
npm run build — ✓ built in 3.62s, clean
git diff --check — clean
```

## U3-scoped diff stat

```
6 files changed, 185 insertions(+), 18 deletions(-)
```

## Constraints compliance

- [x] 0 store / service / router logic changes (consume existing getters only)
- [x] 0 main visual structure changes — buttons added to existing strips only
- [x] Reuse existing classes (wall__tab, manuscript-top__tab, theme-toggle, BookmarkButton)
- [x] 0 raw hex / 0 !important / 0 :global(.theme-kao)
- [x] Context-aware disable: aria-disabled + title tooltip
- [x] 0 legacy/ changes
- [x] 0 U1/U2 structural changes (mast/router intact)
- [x] 0 commit / 0 push
