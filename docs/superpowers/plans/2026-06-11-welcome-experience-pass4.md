# WelcomeView + Experience Pass 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land 2 surgical fixes from `2026-06-11-welcome-experience-pass4-resume-and-density-design.md` (commit `1b4236a`) — 1-click resume of most recent session via `getLatestSessionForWorldbook` + `isStarting` double-click guard, and stage-command button density drop to 40px / 36px via new `size="micro"` tier on `BookmarkButton` — into `wip/map-realism-render-docs-20260608` with **1 single commit** (per spec §3 + §5.3).

**Architecture:** Sub-fix A (1-click resume) — 1 new Pinia action `getLatestSessionForWorldbook(id)` in `gameStore.js` sorts `sessions` by `updatedAt` desc then finds by `worldbookId || worldId`; 1 refactored async function `startWorldAdventure` in `Experience.vue` does find-or-create with a sync `isStarting` ref guard and a `loadSession` → `setActiveWorldbook` order swap to keep state consistent. Sub-fix B (button density) — 1 new string prop `size: 'default' | 'compact' | 'micro'` on `BookmarkButton.vue` with new `.bookmark-button--size-micro` CSS tier (40px / 36px mobile); 4 `size="micro"` instances on Experience stage-command; 6 `.stage-command` min-height overrides dropped to 40px / 36px. Zero new components, zero new deps, **0 template v-if changes** (5 `v-if="hasSelectedWorldbook"` sites preserved). WelcomeView 82px default unchanged (G6).

**Tech Stack:** Vue 3 + Vite + Pinia (action in `gameStore.js`), CSS (font-size/grid-template/min-height numeric changes only, no new tokens), Vitest contract tests, Playwright screenshots.

**Spec reference**: `docs/superpowers/specs/2026-06-11-welcome-experience-pass4-resume-and-density-design.md` (commit `1b4236a`)
**Branch**: `wip/map-realism-render-docs-20260608`
**Commits**: 1 (per spec §3 + §5.3)

---

## File Structure

| File | Action | Lines | Responsibility |
|---|---|---|---|
| `src/stores/gameStore.js` | Modify | After L951 (after `loadSessions`/`saveSessions`), before `createSession` L957 | +1 Pinia action `getLatestSessionForWorldbook(id)` — sort by `updatedAt` desc then find by `worldbookId \|\| worldId` |
| `src/components/folio/BookmarkButton.vue` | Modify | L5-9 (template), L46-49 (props), L195+ (CSS append) | +1 string prop `size` with validator; template class binding; new `.bookmark-button--size-micro` CSS + 760px media query variant |
| `src/pages/Experience.vue` | Modify | L73-92, L167-186 (4 template `size="micro"`), L569+ (new `isStarting` ref), L670-697 (`startWorldAdventure` rewrite), L2077, L2175, L3633, L4001, L4326, L4368 (6 min-height CSS) | 1-click resume logic; 4 micro button usages; 6 min-height drops |
| `src/__tests__/uiPolish.test.js` | Modify | Append new describe block at end of file | +9 contract tests (see Task 1) |
| `docs/STATUS.md` | Modify | "Recently done" top +1 line | Pass 4 landing entry |
| `docs/LOG.md` | Modify | New 2026-06-11 Pass 4 section | Landing log |
| `docs/demo/pass4-screenshots/` | Create | (new dir) | 7 verification screenshots (experience-1280-resume/create/doubleclick/state-sync, welcome-1280, experience-980, experience-640) |

---

## Pre-flight (read once before starting)

- **Spec** (authoritative): `docs/superpowers/specs/2026-06-11-welcome-experience-pass4-resume-and-density-design.md` (commit `1b4236a`)
- **Spec R1 mitigation** (loadSession + setActiveWorldbook order): In sub-fix A, the new `startWorldAdventure` MUST `loadSession(existing.id)` BEFORE `setActiveWorldbook(existing.worldbookId || existing.worldId)` so the watcher's `if (selectedWorldbookId.value !== normalized)` guard (L634) sees consistent state on the next tick.
- **Spec R6 mitigation** (`.stage-command` in `Experience redo` scoped block L4290-4368 uses `:deep(.stage-command)`): This block sets `min-height: 78px` (L4326) and `.stage-command--compact { min-height: 72px }` (L4368). It may be dead code if no `:deep` consumer references it. Use `grep -n "playable-world-actions" src/pages/Experience.vue` to verify. If un-referenced, the min-height drops are hygiene and harmless. If referenced, the new 40px / 36px still applies (the `:deep` selector has the same specificity as the base, so the later-written rule wins).
- **Spec R11 mitigation** (980px folio spread 主题 + 40px stage-command): If 980px viewport shows visual breakage after the min-height drop, fallback is to keep the 980px media query at 58px (do not change L3633). The contract test in Task 1 only locks base + compact, not 980px variant.
- **Spec R7 mitigation** (try/finally pattern): `isStarting` MUST be released in a `finally` block — never let an exception during `initGame` leave the lock held (would block all future "进入世界" clicks).
- **AGENTS.md hard rules**: invoke skills in this order:
  - Before Task 1 (test changes) → `testing-verification`
  - Before Task 2-5 (UI/CSS/JS changes) → `ui-style-check`
  - Before Task 6-7 (full validation + screenshots) → `testing-verification`
  - Before Task 8-9 (docs sync + commit) → `docs-status-handoff` + `commit-conventions`
- **Test runner**: `npm run test:run -- src/__tests__/uiPolish.test.js` (Vitest, not `npm test` which is watch mode)
- **Dev server**: `npm run dev` (Vite, port 5177 default; auto-bumps if occupied)
- **Build**: `npm run build` (Vite production build)
- **Docs build**: `npm run docs:build` (VitePress)
- **Hairline check**: `git diff --check` (whitespace / merge marker safety)
- **WelcomeView verification**: `grep "size=" src/views/WelcomeView.vue` should return 0 matches after all tasks complete (zero `size=` props on Welcome's 3 BookmarkButton calls).

---

## Task 1: Write 9 failing contract tests (TDD red)

**Files:**
- Modify: `src/__tests__/uiPolish.test.js` (append new describe block at end of file)

- [ ] **Step 1: Read the end of `uiPolish.test.js` to find the right append point**

Run: `wc -l src/__tests__/uiPolish.test.js && tail -5 src/__tests__/uiPolish.test.js`
Expected: file is ~268 lines, ends with the closing of the "pass 3" describe block. Note the last `})` indentation level (currently 0 spaces — top level).

- [ ] **Step 2: Append 9 contract tests**

Append the following block to the end of `src/__tests__/uiPolish.test.js` (after the last `})` of the existing pass 3 block, preserving the file's no-trailing-newline state — match existing style):

```js

describe('welcome + experience pass 4 — 1-click resume + micro button density', () => {
  it('gameStore exposes getLatestSessionForWorldbook action that sorts by updatedAt desc', () => {
    const gameStore = readProjectFile('src/stores/gameStore.js')

    expect(gameStore).toMatch(/getLatestSessionForWorldbook\s*\(/)
    // Body must sort by updatedAt desc before find
    expect(gameStore).toMatch(
      /\(b\.updatedAt \|\| 0\) - \(a\.updatedAt \|\| 0\)/,
    )
  })

  it('startWorldAdventure uses getLatestSessionForWorldbook (not just currentSessionId find)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    // New find-by-worldbook call site
    expect(experience).toMatch(/getLatestSessionForWorldbook\s*\(/)
    // Old buggy predicate (find by currentSessionId) is gone from the find branch
    expect(experience).not.toMatch(
      /session\.id\s*===\s*gameStore\.currentSessionId\s*\?\s*gameStore\.sessions\.find/
    )
  })

  it('startWorldAdventure guards against double-click via isStarting ref with try/finally', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    expect(experience).toContain('isStarting')
    // try/finally pattern: lock acquired at start, released in finally
    expect(experience).toMatch(
      /try\s*\{[\s\S]*?isStarting\.value\s*=\s*true[\s\S]*?finally\s*\{[\s\S]*?isStarting\.value\s*=\s*false/
    )
  })

  it('BookmarkButton accepts size prop with 3 values and adds --size-micro class', () => {
    const bookmark = readProjectFile('src/components/folio/BookmarkButton.vue')

    expect(bookmark).toMatch(/size:\s*\{[^}]*default:\s*'default'/)
    expect(bookmark).toMatch(
      /validator:\s*\(v\)\s*=>\s*\[\s*'default'\s*,\s*'compact'\s*,\s*'micro'\s*\]\.includes/
    )
    expect(bookmark).toContain('.bookmark-button--size-micro')
    // 760px mobile variant
    expect(bookmark).toMatch(
      /@media \(max-width: 760px\)\s*\{[\s\S]*?\.bookmark-button--size-micro\s*\{[\s\S]*?min-height:\s*36px/
    )
  })

  it('Experience.vue 4 stage-command BookmarkButton usages all use size="micro"', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const matches = experience.match(/size="micro"/g) || []
    expect(matches.length).toBe(4)
  })

  it('Experience.vue .stage-command base min-height drops to 40px (was 62px)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const baseRule =
      experience.match(/^[ \t]*\.stage-command\s*\{[^}]*\}/m)?.[0] || ''
    expect(baseRule).toMatch(/min-height:\s*40px/)
    expect(baseRule).not.toMatch(/min-height:\s*62px/)
  })

  it('Experience.vue .stage-command--compact min-height drops to 36px (was 50px)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const compactRule =
      experience.match(/^[ \t]*\.stage-command--compact\s*\{[^}]*\}/m)?.[0] || ''
    expect(compactRule).toMatch(/min-height:\s*36px/)
    expect(compactRule).not.toMatch(/min-height:\s*50px/)
  })

  it('WelcomeView 3 BookmarkButton calls preserve 82px default (no size="compact|micro" anywhere)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    // No size="..." on any BookmarkButton in WelcomeView
    expect(welcomeView).not.toMatch(/size="(compact|micro)"/)
    // compact boolean still present on the 3rd button (tertiary)
    expect(welcomeView).toMatch(
      /<BookmarkButton[\s\S]*?variant="tertiary"[\s\S]*?compact[\s\S]*?\/>/,
    )
  })

  it('onMounted else branch still auto-opens showSessionPicker for first-time users', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    // The else branch (after currentSession check) must still set showSessionPicker = true
    const elseBlock =
      experience.match(
        /\}\s*else\s*\{[\s\S]*?showSessionPicker\.value\s*=\s*true\s*;?\s*\}/,
      )?.[0] || ''
    expect(elseBlock).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run the new tests and confirm they all fail (TDD red)**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "pass 4"`
Expected: All 9 new tests in the "pass 4" describe block FAIL. Output shows 9 `FAIL` lines with specific assertion errors. The pre-existing 18+ tests in the file continue to pass.

If a test passes already (TDD was not "red" first), STOP and investigate — the spec item is already in the code from an earlier session, OR the test regex is too loose.

- [ ] **Step 4: Verify file syntax**

Run: `node -e "require('fs').readFileSync('src/__tests__/uiPolish.test.js', 'utf-8'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: No commit yet (per 1-commit rule)**

The TDD-red state stays in the working tree. The final commit happens in Task 9 with all code + tests together.

---

## Task 2: gameStore.js — add `getLatestSessionForWorldbook` action

**Files:**
- Modify: `src/stores/gameStore.js` (insert new action between `saveSessions` and `createSession`)

- [ ] **Step 1: Locate the insertion point**

Run: `grep -n "saveSessions\|createSession" src/stores/gameStore.js | head -5`
Expected output:
```
953:    saveSessions() {
955:    },
957:    createSession(options = {}) {
```
The new action goes between L955 (end of `saveSessions`) and L957 (start of `createSession`), at L956.

- [ ] **Step 2: Insert the new action**

Open `src/stores/gameStore.js` and locate the `saveSessions` action (L953-955):
```js
    saveSessions() {
      setItem(STORAGE_KEYS.WRITING_SESSIONS, this.sessions)
    },
```

Immediately after the closing `},` of `saveSessions` and before `createSession(options = {}) {`, insert:

```js

    getLatestSessionForWorldbook(worldbookId) {
      if (!worldbookId) return null
      const target = worldbookId
      const sorted = [...this.sessions].sort(
        (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
      )
      return (
        sorted.find((s) => (s.worldbookId || s.worldId) === target) || null
      )
    },
```

- [ ] **Step 3: Run the new gameStore contract test (TDD green for test 1)**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "getLatestSessionForWorldbook action"`
Expected: PASS (1 test). The other 8 pass 4 tests still fail (they test Experience.vue / BookmarkButton.vue, not gameStore).

- [ ] **Step 4: No commit yet**

---

## Task 3: BookmarkButton.vue — add `size` prop + `.bookmark-button--size-micro` CSS

**Files:**
- Modify: `src/components/folio/BookmarkButton.vue` (L5-9 template, L46-49 props, L195+ CSS)

- [ ] **Step 1: Update template class binding (L5-9)**

Open `src/components/folio/BookmarkButton.vue`. Find the template class binding (L5-9):
```html
    :class="[
      `bookmark-button--${variant}`,
      compact ? 'bookmark-button--compact' : '',
      disabled ? 'bookmark-button--disabled' : ''
    ]"
```

Replace with:
```html
    :class="[
      `bookmark-button--${variant}`,
      compact ? 'bookmark-button--compact' : '',
      size !== 'default' ? `bookmark-button--size-${size}` : '',
      disabled ? 'bookmark-button--disabled' : ''
    ]"
```

- [ ] **Step 2: Add `size` prop after `compact` (after L49)**

Find the `compact` prop:
```js
  compact: {
    type: Boolean,
    default: false
  },
```

Immediately after, insert:
```js
  // TODO(2.0): deprecate compact in favor of size
  size: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'compact', 'micro'].includes(v)
  },
```

- [ ] **Step 3: Append `.bookmark-button--size-micro` CSS**

Find the existing `.bookmark-button--compact` rule (L184-195):
```css
.bookmark-button--compact {
  min-height: 72px;
  grid-template-columns: 60px minmax(0, 1fr);
}

.bookmark-button--compact .bookmark-button__index {
  font-size: 24px;
}

.bookmark-button--compact .bookmark-button__label {
  font-size: 18px;
}
```

Immediately after (L195, the closing `}` of `.bookmark-button--compact .bookmark-button__label`), insert (preserving 2-space indent inside the `<style scoped>` block):

```css
.bookmark-button--size-micro {
  min-height: 40px;
  grid-template-columns: 44px minmax(0, 1fr);
}

.bookmark-button--size-micro .bookmark-button__index {
  font-size: 16px;
}

.bookmark-button--size-micro .bookmark-button__label {
  font-size: 13px;
  padding: 0 8px 0 14px;
}
```

- [ ] **Step 4: Append 760px media query variant for `--size-micro`**

Find the existing `@media (max-width: 760px)` block (L202-221):
```css
@media (max-width: 760px) {
  .bookmark-button {
    min-height: 72px;
    grid-template-columns: 58px minmax(0, 1fr);
    padding-right: 18px;
    transform: none;
  }

  .bookmark-button:hover:not(.bookmark-button--disabled) {
    transform: translateY(-2px);
  }

  .bookmark-button__index {
    font-size: 22px;
  }

  .bookmark-button__label {
    font-size: 20px;
  }
}
```

Replace this media query block with (adding the `--size-micro` variant at the end):
```css
@media (max-width: 760px) {
  .bookmark-button {
    min-height: 72px;
    grid-template-columns: 58px minmax(0, 1fr);
    padding-right: 18px;
    transform: none;
  }

  .bookmark-button:hover:not(.bookmark-button--disabled) {
    transform: translateY(-2px);
  }

  .bookmark-button__index {
    font-size: 22px;
  }

  .bookmark-button__label {
    font-size: 20px;
  }

  .bookmark-button--size-micro {
    min-height: 36px;
    grid-template-columns: 40px minmax(0, 1fr);
  }
}
```

- [ ] **Step 5: Run the 2 BookmarkButton contract tests (TDD green for tests 4)**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "BookmarkButton accepts size prop"`
Expected: PASS (1 test). Also run the "WelcomeView 3 BookmarkButton calls preserve 82px" test — should PASS already (WelcomeView was not modified yet, so it inherently has no `size="..."` props).

- [ ] **Step 6: No commit yet**

---

## Task 4: Experience.vue — add `isStarting` ref + rewrite `startWorldAdventure` + keep onMounted else branch unchanged

**Files:**
- Modify: `src/pages/Experience.vue` (L569+ ref, L670-697 function)

- [ ] **Step 1: Add `isStarting` ref**

Find the line `const showSessionPicker = ref(false)` (L569). Immediately after, insert:

```js
const isStarting = ref(false)
```

- [ ] **Step 2: Replace `startWorldAdventure` (L670-697)**

Find the current function:
```js
async function startWorldAdventure() {
  const worldbookId = selectedWorldbookId.value || worldStore.activeWorldbookId || ''
  if (!worldbookId) {
    openWorldbookQuickImport()
    return
  }
  await worldStore.setActiveWorldbook(worldbookId)
  selectedWorldbookId.value = worldbookId

  const currentSession = gameStore.currentSessionId
    ? gameStore.sessions.find((session) => session.id === gameStore.currentSessionId)
    : null
  const sessionWorldbookId = currentSession?.worldbookId || currentSession?.worldId || ''

  if (!currentSession || sessionWorldbookId !== worldbookId) {
    gameStore.createSession({
      title: `${worldStore.activeWorldbook?.name || '世界'} · 冒险`,
      worldbookId,
      inheritRuntimeState: false
    })
  }

  showSessionPicker.value = false
  if (!gameStore.messages || gameStore.messages.length === 0) {
    await gameStore.initGame()
  }
  refreshOpeningIntent()
}
```

Replace with:
```js
async function startWorldAdventure() {
  if (isStarting.value) return
  isStarting.value = true
  try {
    const worldbookId = selectedWorldbookId.value || worldStore.activeWorldbookId || ''
    if (!worldbookId) {
      openWorldbookQuickImport()
      return
    }

    // 1) Find the most-recent session for this worldbook (sorted by updatedAt desc)
    const existing = gameStore.getLatestSessionForWorldbook(worldbookId)

    if (existing) {
      // 2a) Resume — loadSession first, then sync active worldbook to keep state consistent
      gameStore.loadSession(existing.id)
      await worldStore.setActiveWorldbook(
        existing.worldbookId || existing.worldId || worldbookId,
      )
      selectedWorldbookId.value = existing.worldbookId || existing.worldId || worldbookId
    } else {
      // 2b) Fallback: create a new session
      await worldStore.setActiveWorldbook(worldbookId)
      selectedWorldbookId.value = worldbookId
      gameStore.createSession({
        title: `${worldStore.activeWorldbook?.name || '世界'} · 冒险`,
        worldbookId,
        inheritRuntimeState: false,
      })
    }

    showSessionPicker.value = false
    if (!gameStore.messages || gameStore.messages.length === 0) {
      await gameStore.initGame()
    }
    refreshOpeningIntent()
  } finally {
    isStarting.value = false
  }
}
```

- [ ] **Step 3: Verify the onMounted else branch is unchanged**

Run: `grep -n "showSessionPicker.value = true" src/pages/Experience.vue`
Expected: at least 2 matches — one inside `handleStageSecondaryAction` (L654) and one inside the onMounted else branch (L614). Both must still be present.

If the onMounted line is missing, the spec user decision (保留 auto-open picker) has been broken. STOP and restore from git:
```bash
git checkout HEAD -- src/pages/Experience.vue
# then redo Task 4 steps 1-2 only, leaving onMounted untouched
```

- [ ] **Step 4: Run the 3 Experience function contract tests (TDD green for tests 2, 3, 9)**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "pass 4"`
Expected: 5 of 9 pass 4 tests now pass (tests 1 gameStore, 2 startWorldAdventure predicate, 3 isStarting try/finally, 4 size prop, 9 onMounted else branch). Tests 5 (4 size="micro" count), 6 (base 40px), 7 (compact 36px), 8 (WelcomeView unchanged — already passing since we haven't touched WelcomeView) remain.

- [ ] **Step 5: No commit yet**

---

## Task 5: Experience.vue — add `size="micro"` to 4 stage-command BookmarkButton usages

**Files:**
- Modify: `src/pages/Experience.vue` (L73-92, L167-186 — 4 template invocations)

- [ ] **Step 1: Add `size="micro"` to "进入世界" button (L73-82)**

Find:
```html
              <BookmarkButton
                class="action-btn stage-command stage-command--primary"
                type="button"
                :disabled="!hasSelectedWorldbook"
                index="01"
                label="进入世界"
                index-class="stage-command__index"
                label-class="stage-command__label"
                @click="startWorldAdventure"
              />
```

Add `size="micro"` after the closing quote of `class="..."` line, before the `type="button"` line. The result (only `size` line added):
```html
              <BookmarkButton
                class="action-btn stage-command stage-command--primary"
                type="button"
                size="micro"
                :disabled="!hasSelectedWorldbook"
                index="01"
                label="进入世界"
                index-class="stage-command__index"
                label-class="stage-command__label"
                @click="startWorldAdventure"
              />
```

- [ ] **Step 2: Add `size="micro"` to "会话" button (L83-92)**

Find:
```html
              <BookmarkButton
                class="action-btn stage-command stage-command--secondary"
                type="button"
                index="02"
                label="会话"
                variant="secondary"
                index-class="stage-command__index"
                label-class="stage-command__label"
                @click="handleStageSecondaryAction"
              />
```

Add `size="micro"` after `type="button"`. Result:
```html
              <BookmarkButton
                class="action-btn stage-command stage-command--secondary"
                type="button"
                size="micro"
                index="02"
                label="会话"
                variant="secondary"
                index-class="stage-command__index"
                label-class="stage-command__label"
                @click="handleStageSecondaryAction"
              />
```

- [ ] **Step 3: Add `size="micro"` to "从这里开局" button (L167-176)**

Find:
```html
                <BookmarkButton
                  class="action-btn stage-command stage-command--compact stage-command--primary"
                  type="button"
                  :disabled="gameStore.isLoading"
                  index="01"
                  label="从这里开局"
                  index-class="stage-command__index"
                  label-class="stage-command__label"
                  @click="sendOpeningAction"
                />
```

Add `size="micro"` after `type="button"`. Result:
```html
                <BookmarkButton
                  class="action-btn stage-command stage-command--compact stage-command--primary"
                  type="button"
                  size="micro"
                  :disabled="gameStore.isLoading"
                  index="01"
                  label="从这里开局"
                  index-class="stage-command__index"
                  label-class="stage-command__label"
                  @click="sendOpeningAction"
                />
```

- [ ] **Step 4: Add `size="micro"` to "改成自己写" button (L177-186)**

Find:
```html
                <BookmarkButton
                  class="action-btn stage-command stage-command--compact stage-command--secondary"
                  type="button"
                  index="02"
                  label="改成自己写"
                  variant="secondary"
                  index-class="stage-command__index"
                  label-class="stage-command__label"
                  @click="dismissOpeningActionCard"
                />
```

Add `size="micro"` after `type="button"`. Result:
```html
                <BookmarkButton
                  class="action-btn stage-command stage-command--compact stage-command--secondary"
                  type="button"
                  size="micro"
                  index="02"
                  label="改成自己写"
                  variant="secondary"
                  index-class="stage-command__index"
                  label-class="stage-command__label"
                  @click="dismissOpeningActionCard"
                />
```

- [ ] **Step 5: Run the 4 size="micro" count test (TDD green for test 5)**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "4 stage-command BookmarkButton usages"`
Expected: PASS (1 test).

- [ ] **Step 6: No commit yet**

---

## Task 6: Experience.vue — drop 6 `.stage-command` min-height values

**Files:**
- Modify: `src/pages/Experience.vue` (L2077, L2175, L3633, L4001, L4326, L4368)

- [ ] **Step 1: Drop base `.stage-command` min-height (L2077)**

Find:
```css
.stage-command {
  position: relative;
  min-width: 240px;
  min-height: 62px;
  display: grid;
```

Change `min-height: 62px;` to `min-height: 40px;`. Result:
```css
.stage-command {
  position: relative;
  min-width: 240px;
  min-height: 40px;
  display: grid;
```

- [ ] **Step 2: Drop `.stage-command--compact` min-height (L2175)**

Find:
```css
.stage-command--compact {
  min-width: 100%;
  min-height: 50px;
}
```

Change `min-height: 50px;` to `min-height: 36px;`. Result:
```css
.stage-command--compact {
  min-width: 100%;
  min-height: 36px;
}
```

- [ ] **Step 3: Drop 980px media query `.stage-command` min-height (L3633)**

Find the block (L3626-3641):
```css
.stage-command {
  min-width: 220px;
  min-height: 58px;
  border-color: color-mix(in srgb, var(--archive-gold) 24%, var(--border));
```

Change `min-height: 58px;` to `min-height: 40px;`. Result:
```css
.stage-command {
  min-width: 220px;
  min-height: 40px;
  border-color: color-mix(in srgb, var(--archive-gold) 24%, var(--border));
```

- [ ] **Step 4: Drop 640px media query `.stage-command` min-height (L4001)**

Find the block (L3999-4002):
```css
.stage-command {
  min-height: 56px;
}
```

Change `min-height: 56px;` to `min-height: 40px;`. Result:
```css
.stage-command {
  min-height: 40px;
}
```

- [ ] **Step 5: Drop `Experience redo` scoped block `.stage-command` min-height (L4326)**

Find the block (L4322-4328):
```css
.stage-command {
  --command-tilt: -3deg;
  min-width: 216px;
  min-height: 78px;
  padding: 0 18px 0 0;
```

Change `min-height: 78px;` to `min-height: 40px;`. Result:
```css
.stage-command {
  --command-tilt: -3deg;
  min-width: 216px;
  min-height: 40px;
  padding: 0 18px 0 0;
```

- [ ] **Step 6: Drop `Experience redo` `.stage-command--compact` min-height (L4368)**

Find:
```css
.stage-command--compact {
  min-height: 72px;
}
```

Change `min-height: 72px;` to `min-height: 36px;`. Result:
```css
.stage-command--compact {
  min-height: 36px;
}
```

- [ ] **Step 7: Run the 2 min-height contract tests (TDD green for tests 6, 7)**

Run: `npm run test:run -- src/__tests__/uiPolish.test.js -t "pass 4"`
Expected: ALL 9 pass 4 tests now PASS. Output: 9 ✓ in the "pass 4" describe block.

- [ ] **Step 8: No commit yet**

---

## Task 7: Run full test suite + build + docs build

**Files:** (no edits)

- [ ] **Step 1: Run full Vitest suite**

Run: `npm run test:run`
Expected: all tests pass — 9 pass 4 + 18+ pre-existing. Exit 0.

If any pre-existing test fails, STOP and investigate — the Pass 4 changes should not regress anything.

- [ ] **Step 2: Run Vite production build**

Run: `npm run build`
Expected: `vite vX.X.X building for production...` then `✓ built in Xms`. Exit 0.

- [ ] **Step 3: Run VitePress docs build**

Run: `npm run docs:build`
Expected: `vitepress vX.X.X building...` then success. Exit 0.

- [ ] **Step 4: Hairline check**

Run: `git diff --check`
Expected: no output (clean whitespace, no merge markers).

- [ ] **Step 5: No commit yet**

---

## Task 8: 7 Playwright acceptance screenshots

**Files:**
- Create: `docs/demo/pass4-screenshots/` directory + 7 PNG files

- [ ] **Step 1: Start dev server in background**

Run: `npm run dev`
Expected: Vite reports `Local: http://localhost:5177/` (or higher port if 5177 occupied). Note the actual port.

Run-in-background: yes (use the `run_in_background: true` flag on the Bash call).

- [ ] **Step 2: Wait for server to be ready**

Run: `sleep 3 && curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:5177/`
Expected: `200` (or `304`).

- [ ] **Step 3: Create the screenshots directory**

Run: `mkdir -p docs/demo/pass4-screenshots`

- [ ] **Step 4: Locate or install Playwright**

Run: `which playwright 2>/dev/null; ls node_modules/playwright 2>/dev/null; ls node_modules/.bin/playwright 2>/dev/null`
Expected: at least one path returns. If none, install:
```bash
npm install --no-save playwright@latest
npx playwright install chromium
```

- [ ] **Step 5: Write the capture script**

Create `docs/demo/pass4-screenshots/_capture.mjs` (will be deleted after — gitignored, NOT committed):

```js
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const PORT = process.env.PORT || 5177
const BASE = `http://localhost:${PORT}`
const OUT = 'docs/demo/pass4-screenshots'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 800 },
  { name: '980', width: 980, height: 800 },
  { name: '640', width: 640, height: 800 },
]

const browser = await chromium.launch()

// --- experience-1280-resume.png: pre-seed 3 sessions for one worldbook, click "进入世界" once, screenshot ---
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS[0] })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/experience`, { waitUntil: 'networkidle' })
  // Seed localStorage with a worldbook and 3 sessions
  await page.evaluate(() => {
    const wbId = 'wb_test'
    const now = Date.now()
    const sessions = [
      { id: 's_old', schemaVersion: 1, title: 'old', createdAt: now - 7 * 86400_000, updatedAt: now - 7 * 86400_000, worldbookId: wbId, worldId: wbId, messages: [{ role: 'user', content: 'old session' }, { role: 'assistant', content: 'old reply' }], chatHistory: [], worldState: {}, runtimeState: { messages: [], chatHistory: [] } },
      { id: 's_mid', schemaVersion: 1, title: 'mid', createdAt: now - 86400_000, updatedAt: now - 86400_000, worldbookId: wbId, worldId: wbId, messages: [{ role: 'user', content: 'mid session' }, { role: 'assistant', content: 'mid reply' }], chatHistory: [], worldState: {}, runtimeState: { messages: [], chatHistory: [] } },
      { id: 's_new', schemaVersion: 1, title: 'new', createdAt: now - 3600_000, updatedAt: now - 3600_000, worldbookId: wbId, worldId: wbId, messages: [{ role: 'user', content: 'recent session' }, { role: 'assistant', content: 'recent reply' }], chatHistory: [], worldState: {}, runtimeState: { messages: [], chatHistory: [] } },
    ]
    localStorage.setItem('pinax.writing.sessions', JSON.stringify(sessions))
    // Mark this worldbook as active
    localStorage.setItem('pinax.worldbook.active', wbId)
    // Seed worldbooks index
    localStorage.setItem('pinax.worldbooks', JSON.stringify([{ id: wbId, name: '边境王国', genreLabel: 'Border Kingdom' }]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.click('text=进入世界')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/experience-1280-resume.png`, fullPage: false })
  await ctx.close()
}

// --- experience-1280-create.png: worldbook but no sessions, click "进入世界", screenshot ---
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS[0] })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/experience`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    const wbId = 'wb_create'
    localStorage.setItem('pinax.worldbook.active', wbId)
    localStorage.setItem('pinax.writing.sessions', JSON.stringify([]))
    localStorage.setItem('pinax.worldbooks', JSON.stringify([{ id: wbId, name: '边境王国', genreLabel: 'Border Kingdom' }]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.click('text=进入世界')
  await page.waitForTimeout(2000) // wait for initGame
  await page.screenshot({ path: `${OUT}/experience-1280-create.png`, fullPage: false })
  await ctx.close()
}

// --- experience-1280-doubleclick.png: triple-click "进入世界" during initGame, screenshot mid-stream ---
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS[0] })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/experience`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    const wbId = 'wb_dbl'
    localStorage.setItem('pinax.worldbook.active', wbId)
    localStorage.setItem('pinax.writing.sessions', JSON.stringify([]))
    localStorage.setItem('pinax.worldbooks', JSON.stringify([{ id: wbId, name: '边境王国', genreLabel: 'Border Kingdom' }]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  const btn = page.locator('text=进入世界')
  await btn.click()
  await page.waitForTimeout(200)
  await btn.click({ force: true })
  await page.waitForTimeout(200)
  await btn.click({ force: true })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/experience-1280-doubleclick.png`, fullPage: false })
  await ctx.close()
}

// --- experience-1280-state-sync.png: worldbook X session + worldbook Y session, switch, screenshot ---
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS[0] })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/experience`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    const now = Date.now()
    localStorage.setItem('pinax.writing.sessions', JSON.stringify([
      { id: 's_x', schemaVersion: 1, title: 'X session', createdAt: now - 3600_000, updatedAt: now - 3600_000, worldbookId: 'wb_x', worldId: 'wb_x', messages: [{ role: 'user', content: 'X' }, { role: 'assistant', content: 'X reply' }], chatHistory: [], worldState: {}, runtimeState: { messages: [], chatHistory: [] } },
      { id: 's_y', schemaVersion: 1, title: 'Y session', createdAt: now - 1800_000, updatedAt: now - 1800_000, worldbookId: 'wb_y', worldId: 'wb_y', messages: [{ role: 'user', content: 'Y' }, { role: 'assistant', content: 'Y reply' }], chatHistory: [], worldState: {}, runtimeState: { messages: [], chatHistory: [] } },
    ]))
    localStorage.setItem('pinax.worldbook.active', 'wb_y')
    localStorage.setItem('pinax.worldbooks', JSON.stringify([
      { id: 'wb_x', name: 'X 王国', genreLabel: 'X' },
      { id: 'wb_y', name: 'Y 王国', genreLabel: 'Y' },
    ]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.click('text=进入世界')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/experience-1280-state-sync.png`, fullPage: false })
  await ctx.close()
}

// --- welcome-1280.png: zero regressions in WelcomeView ---
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS[0] })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/welcome-1280.png`, fullPage: false })
  await ctx.close()
}

// --- experience-980.png: 980px viewport (folio spread 主题) ---
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS[1] })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/experience`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/experience-980.png`, fullPage: false })
  await ctx.close()
}

// --- experience-640.png: 640px viewport ---
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS[2] })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/experience`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/experience-640.png`, fullPage: false })
  await ctx.close()
}

await browser.close()
console.log('7 screenshots written to', OUT)
```

- [ ] **Step 6: Run the capture script**

Run: `PORT=<actual-port> node docs/demo/pass4-screenshots/_capture.mjs`
Expected: `7 screenshots written to docs/demo/pass4-screenshots`. Files exist:
- `experience-1280-resume.png`
- `experience-1280-create.png`
- `experience-1280-doubleclick.png`
- `experience-1280-state-sync.png`
- `welcome-1280.png`
- `experience-980.png`
- `experience-640.png`

If the localStorage key names differ from the script's assumptions (`pinax.writing.sessions`, `pinax.worldbook.active`, `pinax.worldbooks`), use TaskOutput to inspect the dev server logs for the actual keys, then update the script and re-run. Common alternative: `pinax:writing:sessions`, `pinax:worldbook:active`. Verify by:
```bash
grep -n "STORAGE_KEYS" src/stores/gameStore.js | head -5
grep -n "STORAGE_KEYS" src/stores/worldStore.js 2>/dev/null | head -5
```

- [ ] **Step 7: Eyeball the screenshots**

Open the 7 PNGs and verify:
- `experience-1280-resume.png`: "进入世界" + "会话" buttons are 40px tall (visually shorter than Pass 3); 切口目录 (opening action) 区 "从这里开局" / "改成自己写" are 36px tall; session message shows "recent session" / "recent reply" (the 1h-old s_new, not 7d-old s_old) — G1 verified
- `experience-1280-create.png`: a new session is created and the page shows the opening scene (no error, no blank) — G2 verified
- `experience-1280-doubleclick.png`: only 1 initGame ran (page shows one stream of GM text, not 3 stacked); no "Wiped stream" indicator — G3 verified
- `experience-1280-state-sync.png`: dropdown / scene / session title all show "Y 王国" / "Y session" — G4 verified
- `welcome-1280.png`: 3 BookmarkButton calls (进入世界 / 继续 / 新卷) are all 82px tall (NOT 40px); no visual regression — G6 verified
- `experience-980.png`: 40px stage-command does not visually break the folio spread 主题 (per R11 fallback, if it does, undo the L3633 change in Task 6 step 3)
- `experience-640.png`: 40px stage-command fits the mobile layout

- [ ] **Step 8: Delete the capture script (gitignored, hygiene)**

Run: `rm docs/demo/pass4-screenshots/_capture.mjs`

- [ ] **Step 9: Stop the dev server**

Stop the background bash task running `npm run dev` (use TaskStop with the task id from Step 1).

- [ ] **Step 10: No commit yet**

---

## Task 9: Update docs/STATUS.md + docs/LOG.md, then 1 final commit

**Files:**
- Modify: `docs/STATUS.md` (top of "Recently done")
- Modify: `docs/LOG.md` (new Pass 4 section)
- All 4 code/test files + 7 screenshots staged together

- [ ] **Step 1: Add Pass 4 entry to docs/STATUS.md**

Open `docs/STATUS.md`. Find the "Recently done" section (or wherever Pass 3 is recorded). Add a new top entry for Pass 4:

```markdown
- 2026-06-11 — Pass 4: 1-click 续最近 session + stage-command 密度 40px/36px (spec `1b4236a`, plan `2026-06-11-welcome-experience-pass4.md`)
```

(Use the project's existing entry style — match indentation, formatting, and surrounding context exactly.)

- [ ] **Step 2: Add Pass 4 section to docs/LOG.md**

Open `docs/LOG.md`. Append a new section at the top (under any pre-existing header) following the project's existing log style. Suggested content (adapt to match project conventions):

```markdown
## 2026-06-11 — Pass 4: 1-click 续最近 session + stage-command 密度

**Spec**: `docs/superpowers/specs/2026-06-11-welcome-experience-pass4-resume-and-density-design.md` (commit `1b4236a`)
**Plan**: `docs/superpowers/plans/2026-06-11-welcome-experience-pass4.md`
**Branch**: `wip/map-realism-render-docs-20260608`

**Sub-fix A — 1-click resume:**
- `src/stores/gameStore.js` +1 action `getLatestSessionForWorldbook(id)` — sort by `updatedAt` desc then find
- `src/pages/Experience.vue` `startWorldAdventure` rewrite — find-or-create; `loadSession` then `setActiveWorldbook` (G4 state sync); `isStarting` ref + try/finally (G3 double-click guard); onMounted else branch kept `showSessionPicker = true` (per user decision)

**Sub-fix B — button density:**
- `src/components/folio/BookmarkButton.vue` +1 prop `size: 'default' | 'compact' | 'micro'` with validator; template class binding; new `.bookmark-button--size-micro` CSS tier (40px / 36px mobile)
- `src/pages/Experience.vue` 4 `size="micro"` instances; 6 `.stage-command` min-height drops (62→40, 50→36, 58→40, 56→40, 78→40, 72→36)
- WelcomeView 3 BookmarkButton calls unchanged (82px default preserved)

**Acceptance:** 9 new contract tests in `src/__tests__/uiPolish.test.js` (all green); 7 Playwright screenshots in `docs/demo/pass4-screenshots/`; full test suite + build + docs:build all green.

**3-review feedback applied:** 12 critical/important issues from parallel code / architecture / edge-cases review subagents incorporated into spec.
```

(Adjust wording/format to match the project's existing log style — read 1-2 prior entries first.)

- [ ] **Step 3: Stage all Pass 4 changes**

Run: `git add src/stores/gameStore.js src/components/folio/BookmarkButton.vue src/pages/Experience.vue src/__tests__/uiPolish.test.js docs/STATUS.md docs/LOG.md docs/demo/pass4-screenshots/`

Verify with `git status -s`. Expected staged files (6 + 1 dir):
```
M  src/components/folio/BookmarkButton.vue
M  src/pages/Experience.vue
M  src/stores/gameStore.js
M  src/__tests__/uiPolish.test.js
M  docs/STATUS.md
M  docs/LOG.md
A  docs/demo/pass4-screenshots/experience-1280-create.png
A  docs/demo/pass4-screenshots/experience-1280-doubleclick.png
A  docs/demo/pass4-screenshots/experience-1280-resume.png
A  docs/demo/pass4-screenshots/experience-1280-state-sync.png
A  docs/demo/pass4-screenshots/experience-640.png
A  docs/demo/pass4-screenshots/experience-980.png
A  docs/demo/pass4-screenshots/welcome-1280.png
```

(Should NOT include the capture script — it was deleted in Task 8 step 8. Should NOT include any pre-existing 30+ uncommitted changes from the user's broader work.)

- [ ] **Step 4: Verify no `Co-Authored-By` footer in commit history convention**

Run: `git log --format="%B" -5 docs/ | grep -c "Co-Authored-By"`
Expected: 0. The project convention is no `Co-Authored-By` footer.

- [ ] **Step 5: Commit (1 commit per feature rule)**

Run:
```bash
git commit -m "$(cat <<'EOF'
ui(experience): apply pass 4 — 1-click resume + tighten stage-command buttons

Sub-fix A — 1-click resume:
- gameStore.js: +1 action getLatestSessionForWorldbook (sort by updatedAt
  desc, then find by worldbookId || worldId)
- Experience.vue: startWorldAdventure rewritten to find-or-create;
  loadSession then setActiveWorldbook order keeps active/selected/current
  worldbook consistent (G4); isStarting ref + try/finally guards
  against double-click during initGame (G3)
- onMounted else branch unchanged — showSessionPicker auto-open preserved
  for first-time users (per user decision)

Sub-fix B — button density:
- BookmarkButton.vue: +1 prop size (default | compact | micro) with
  validator; new .bookmark-button--size-micro CSS tier (40px desktop,
  36px mobile)
- Experience.vue: 4 stage-command BookmarkButton calls get size="micro";
  6 .stage-command min-height overrides dropped to 40px / 36px
  (base 62→40, compact 50→36, 980px 58→40, 640px 56→40, redo block
  78→40, redo compact 72→36)
- WelcomeView unchanged — 3 BookmarkButton calls still default 82px
  (G6 zero regression verified)

9 new contract tests in uiPolish.test.js; 7 Playwright screenshots in
docs/demo/pass4-screenshots/ for visual acceptance.
EOF
)"
```

Expected: 1 new commit, 13 files changed, no `Co-Authored-By` footer.

- [ ] **Step 6: Verify commit landed correctly**

Run: `git log --oneline -3`
Expected output:
```
<new-sha> ui(experience): apply pass 4 — 1-click resume + tighten stage-command buttons
1b4236a docs(ui-redesign): add Pass 4 spec for 1-click resume + button density
224b69f docs(ui-redesign): add Pass 3 spec for 4 Pass 2 regression fixes
```

Run: `git show HEAD --stat | tail -20`
Expected: 6 source files + 7 PNG screenshots committed.

Run: `git show HEAD | grep -i "co-authored-by"`
Expected: no output.

Run: `git status`
Expected: clean (other than the pre-existing 30+ uncommitted changes from the user's broader work — those are out of scope for Pass 4).

---

## Self-Review Checklist (controller's inline check)

- [x] **Spec coverage**: §3.1 (gameStore action) → Task 2; §3.2 (startWorldAdventure rewrite + isStarting) → Task 4; §3.3 (onMounted else keep) → Task 4 step 3 + test 9 in Task 1; §3.4 (BookmarkButton size prop + CSS) → Task 3; §3.5 (4 size="micro" + 6 min-height) → Task 5 + Task 6; §3.6 (WelcomeView unchanged) → Task 1 test 8 + Task 8 step 7 welcome-1280 screenshot; §5.1 acceptance → Task 8; §5.2 contracts → Task 1; §5.3 1-commit → Task 9; R1 mitigation → Task 4 step 2 (loadSession order); R6 mitigation → Pre-flight; R7 mitigation → Pre-flight; R11 mitigation → Pre-flight + Task 8 step 7.
- [x] **Placeholder scan**: no `TBD` / `TODO` (the `TODO(2.0)` in BookmarkButton is the spec's explicit deprecation marker) / 「later」 / 「fill in」. All code blocks are complete.
- [x] **Type/identifier consistency**: `getLatestSessionForWorldbook` (Task 2 step 2 body ↔ Task 4 step 2 call site ↔ Task 1 test 1 regex ↔ Task 1 test 2 regex). `isStarting` (Task 4 step 1 ↔ Task 4 step 2 try/finally ↔ Task 1 test 3 regex). `size="micro"` (Task 3 step 1 template ↔ Task 5 steps 1-4 ↔ Task 1 test 4 regex ↔ Task 1 test 5 count). `--size-micro` class (Task 3 step 3 + step 4 ↔ Task 1 test 4 regex). All match.
- [x] **TDD adherence**: Task 1 = red (9 tests fail), Tasks 2-6 = green per subtask. Task 7 = full suite green.
- [x] **Frequent commits**: ZERO intermediate commits (per user "1 commit per feature" rule). Final state is 1 commit.
- [x] **Risk mitigations baked in**: R1 (loadSession order) embedded in Task 4 step 2; R6 (redo block may be dead code) is Pre-flight; R7 (try/finally pattern) is Pre-flight + Task 4 step 2; R11 (980px visual breakage fallback) is Pre-flight + Task 8 step 7.
- [x] **No destructive operations**: no git reset, no force-push, no rebases, no `git checkout --` of uncommitted changes.
- [x] **Cascade / scope preservation**: 5 `v-if="hasSelectedWorldbook"` sites preserved (not in any task). `compact` boolean prop preserved on BookmarkButton (TODO comment marks deprecation, not removal). onMounted else branch `showSessionPicker = true` preserved (Task 4 step 3 enforces). WelcomeView 3 BookmarkButton calls unchanged (Task 1 test 8 + Task 8 step 7 verify).

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-11-welcome-experience-pass4.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints
