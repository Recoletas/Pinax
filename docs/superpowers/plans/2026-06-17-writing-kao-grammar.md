# Writing Page kao archive-folio Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `src/pages/Writing.vue` into the kao archive-folio surface grammar (FolioSurface wrapping 4 zones + BookmarkButton chapter list + BookmarkButton AI panel + CharacterPortrait pose-D stub) under a single commit on `feat/writing-kao-grammar`.

**Architecture:** Replace 4 inline surfaces in `Writing.vue` with `<FolioSurface as variant decorated>` wrappers (hero / sidebar / editor-main / asset-inbox modal); convert chapter list rows to `<BookmarkButton variant="tertiary" size="compact" index label>` so the books sidebar becomes a kao 目录页; convert AI panel primary/secondary actions to `<BookmarkButton variant="primary|secondary">`; mount a stub `<CharacterPortrait pose-id="writing-sidekick" size="thumb">` in the books-sidebar footer (swappable to real webp when 5B v0.2 ships). All new CSS lives in `kao.css` inside `@layer kao` and is gated by `.theme-kao` so legacy is untouched. No new state, no `gameStore` touch, no `worldbookContextBuilder` touch, no `StatusBar.vue` touch.

**Tech Stack:** Vue 3 (composition API + `<script setup>`), Vitest 1.6, Pinia `themeStore` (already wired in AppShell). No new dependencies.

---

## File Structure

| File | Role | Touch type |
|---|---|---|
| `src/config/characterArt.js` | Pose registry (throws on unknown via `useCharacterArt`) | **modify** — add 1 entry |
| `src/styles/themes/kao.css` | Kao variant CSS, `@layer kao` + `.theme-kao` gate | **modify** — append writing-* selectors |
| `src/pages/Writing.vue` | Writing page template + scoped CSS | **modify** — wrap 4 zones, replace 1 component set, add 1 stub portrait |
| `src/__tests__/uiPolish.test.js` | Surface contract tests (read-only) | **modify** — append 6 new tests |
| `src/__tests__/stereoMigration.test.js` | characterArt / FolioSurface contract tests (read-only) | **modify** — append 1 characterArt test |
| `docs/STATUS.md` | Multi-session state | **modify** — In flight + Recently done |
| `docs/LOG.md` | Permanent record | **modify** — new entry |
| `docs/superpowers/plans/2026-06-17-writing-kao-grammar.md` | This plan | **created** — already exists |

**Do not touch** (per `docs/STATUS.md:41-44`): `src/stores/gameStore.js`, `src/services/worldbookContextBuilder.js`, `src/services/generation*`, `src/components/StatusBar.vue`. Also do not touch `src/composables/useCharacterArt.js` (folio grammar depends on its signature), `src/components/folio/*` (consumed, not modified).

---

## Task 1: Add red uiPolish + characterArt contract tests

**Files:**
- Modify: `src/__tests__/uiPolish.test.js` (append 5 new `it()` blocks in the existing 5A/5B/5C describe)
- Modify: `src/__tests__/stereoMigration.test.js` (append 1 new `it()` in the page-wiring describe)

- [ ] **Step 1.1a: Open `src/__tests__/stereoMigration.test.js`. First, fix the existing `characterArt` test (line 14) to expect 7 entries (writing-sidekick is the 7th). The `realEntries` count stays 6 (writing-sidekick is `status: 'stub'`, not `'real'`). Update line 14 from `expect(characterArt).toHaveLength(6)` to `expect(characterArt).toHaveLength(7)`. No other change to that test.**

- [ ] **Step 1.1b: Find the page-wiring `describe` block (line 55). Append at the end of that block (before the closing `})` at line 122) a new test:**

```js
  it('Writing.vue sidebar footer mounts CharacterPortrait pose-id="writing-sidekick" (kao archive-folio chapter-side pose-D stub)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    // The sidebar footer must host a CharacterPortrait bound to a registered poseId.
    // pose-D ("半身侧视 · 静默批注") per character-driven-arc.md:133.
    expect(writing).toMatch(/<CharacterPortrait[\s\S]*?pose-id="writing-sidekick"[\s\S]*?\/>/)
    // Must be inside the books-sidebar (the chapter list rail, not the editor).
    const sidebarSection = writing.match(
      /<aside\s+class="books-sidebar"[\s\S]*?<\/aside>/,
    )
    expect(sidebarSection).not.toBeNull()
    expect(sidebarSection?.[0] ?? '').toContain('CharacterPortrait')
  })

  it('characterArt.js exposes 1 writing-sidekick stub pose (Writing page 侧栏 pose-D 半身体侧视 占位)', () => {
    const entry = characterArt.find((e) => e.id === 'writing-sidekick')
    expect(entry).toBeDefined()
    expect(entry).toMatchObject({ status: 'stub', label: expect.any(String) })
    expect(typeof entry.src).toBe('string')
    expect(entry.src).not.toBe('')
  })
```

- [ ] **Step 1.2: Open `src/__tests__/uiPolish.test.js`. Find the existing 5A/5C kao surface describe block (search for `kao` or `FolioSurface` near the top). Append a new `it()` block (or new `describe` — match the existing style) at the end of the kao surface tests:**

```js
  it('Writing.vue wraps 4 surfaces in <FolioSurface> (hero header / books-sidebar / editor-main / asset-inbox modal) — kao archive-folio zone grammar', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // 4 surfaces wrapped: WorkbenchPageHero (header) + books-sidebar (aside) + editor-main (main) + asset inbox modal (article)
    const folioMatches = writing.match(/<FolioSurface[\s\S]*?>/g) || []
    expect(folioMatches.length).toBeGreaterThanOrEqual(4)

    // hero uses chrome + decorated (paper-on-archive ribbon feel)
    expect(writing).toMatch(/<FolioSurface[\s\S]*?as="header"[\s\S]*?variant="chrome"[\s\S]*?decorated="true"/)
    // sidebar uses paper + decorated (full folio spine)
    expect(writing).toMatch(/<FolioSurface[\s\S]*?as="aside"[\s\S]*?variant="paper"[\s\S]*?decorated="true"/)
    // editor-main uses chrome + plain (the editor surface itself gets the paper tint via .is-archive-paper, not the folio chrome)
    expect(writing).toMatch(/<FolioSurface[\s\S]*?as="main"[\s\S]*?variant="chrome"[\s\S]*?decorated="false"/)
    // inbox modal uses paper + decorated
    expect(writing).toMatch(/<FolioSurface[\s\S]*?as="article"[\s\S]*?variant="paper"[\s\S]*?decorated="true"/)
  })

  it('Writing.vue chapter list rows render as <BookmarkButton variant="tertiary" size="compact" index label> — kao 目录页 grammar', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // chapter-item 行:每行都是 BookmarkButton --tertiary --compact
    // Must appear inside the chapter list (not the book list — books stay .action-btn)
    const chapterListSection = writing.match(
      /<div\s+class="chapter-list"[\s\S]*?<\/div>\s*<\/aside>/,
    )
    expect(chapterListSection).not.toBeNull()
    const chapterList = chapterListSection?.[0] ?? ''

    // At least 1 BookmarkButton --tertiary --compact for the chapter list
    expect(chapterList).toMatch(
      /<BookmarkButton[\s\S]*?variant="tertiary"[\s\S]*?size="compact"[\s\S]*?\/>/,
    )
    // Each chapter BookmarkButton must expose index (number) + label (title)
    expect(chapterList).toMatch(/:index="chapter\.num|padStart|chapterIndex|chapterNumber/)
  })

  it('Writing.vue AI panel primary action renders as <BookmarkButton variant="primary" label="应用 …"> + secondary as <BookmarkButton variant="secondary">', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // 1 BookmarkButton --primary in the AI panel (应用)
    expect(writing).toMatch(/<BookmarkButton[\s\S]*?variant="primary"[\s\S]*?label="[\s\S]*?应用/)
    // 1 BookmarkButton --secondary in the AI panel (拒收 / 取消 / 不应用)
    expect(writing).toMatch(/<BookmarkButton[\s\S]*?variant="secondary"[\s\S]*?label="[\s\S]*?(拒收|取消|不应用)/)
  })

  it('kao.css exposes .theme-kao .writing-page / .writing-sidebar / .writing-editor / .writing-ai-panel selectors — all writing surface rules live in kao.css, not main.css', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const mainCss = readProjectFile('src/styles/main.css')

    // kao.css has the writing-* surface rules gated by .theme-kao
    expect(kaoCss).toMatch(/\.theme-kao\s+\.writing-page\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.writing-sidebar\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.writing-editor\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.writing-ai-panel\b/)

    // main.css must NOT carry writing-* surface rules (kao-only territory)
    expect(mainCss).not.toMatch(/^\.writing-page\b/m)
    expect(mainCss).not.toMatch(/^\.writing-sidebar\b/m)
    expect(mainCss).not.toMatch(/^\.writing-editor\b/m)
    expect(mainCss).not.toMatch(/^\.writing-ai-panel\b/m)
  })

  it('Writing.vue AI panel mode switch (wysiwyg/markdown/preview) stays .action-btn — stereo-migration lock: BookmarkButton does not enter the tool-mode toolbar', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // The mode switch (.mode-switch) must not contain a BookmarkButton
    const modeSwitch = writing.match(
      /<div\s+class="mode-switch"[\s\S]*?<\/div>/,
    )
    expect(modeSwitch).not.toBeNull()
    expect(modeSwitch?.[0] ?? '').not.toContain('<BookmarkButton')
  })
```

- [ ] **Step 1.3: Run red to confirm 5 uiPolish + 2 stereoMigration tests fail:**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js src/__tests__/stereoMigration.test.js 2>&1 | tail -50
```

Expected: 7 new test failures (5 uiPolish + 2 stereoMigration). Existing 39 + 6 tests should still pass.

---

## Task 2: Add `writing-sidekick` entry to `characterArt.js`

**Files:**
- Modify: `src/config/characterArt.js` (1 import line + 1 entry)

- [ ] **Step 2.1: Append 1 import + 1 entry to `src/config/characterArt.js`:**

Current file ends at line 16 (closing `]` of the array). Add `stubSilhouette` is already imported (line 1). Append a new entry to the array **before** the closing `]`:

```js
  { id: 'writing-sidekick',  src: stubSilhouette,                  status: 'stub', label: '批注者' },
```

Result (the array body becomes 7 entries):

```js
export const characterArt = [
  { id: 'opening-cover',     src: kaoArchiveOpeningCover,     status: 'real', label: '开场档案' },
  { id: 'narrator',          src: kaoArchiveNarrator,         status: 'real', label: '在场叙述者' },
  { id: 'speaker-thumb',     src: kaoArchiveSpeakerThumb,     status: 'real', label: '对话人' },
  { id: 'opening-scene-01',  src: kaoArchiveOpeningScene01,   status: 'real', label: '01 边界小镇' },
  { id: 'opening-scene-02',  src: kaoArchiveOpeningScene02,   status: 'real', label: '02 废墟灯塔' },
  { id: 'opening-scene-03',  src: kaoArchiveOpeningScene03,   status: 'real', label: '03 塔内档案室' },
  { id: 'writing-sidekick',  src: stubSilhouette,             status: 'stub', label: '批注者' },
]
```

- [ ] **Step 2.2: Run the characterArt tests to confirm 1 stereoMigration test goes green:**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/stereoMigration.test.js 2>&1 | tail -20
```

Expected: `characterArt.js exposes 1 writing-sidekick stub pose` PASS; `Writing.vue sidebar footer mounts CharacterPortrait pose-id="writing-sidekick"` still FAILS (no Writing.vue refactor yet — that's Task 5).

---

## Task 3: Add `writing-*` selectors to `kao.css`

**Files:**
- Modify: `src/styles/themes/kao.css` (append before the closing `}` of `@layer kao` on line 148)

- [ ] **Step 3.1: Open `src/styles/themes/kao.css`. Find the closing `}` of `@layer kao` (line 148). Insert the following block **before** that closing brace, after the `.theme-kao .is-archive-prop--stain` block:**

```css
  /* Writing page — 手稿页 / 正文页 surface grammar (kao archive-folio).
     All rules gated by .theme-kao; legacy variant is untouched.
     References --archive-* tokens defined above + --hairline-* from main.css. */
  .theme-kao .writing-page {
    color: var(--archive-ink);
    background: var(--archive-paper-soft);
  }

  .theme-kao .writing-sidebar {
    border-right: 1px solid var(--hairline-soft);
  }

  .theme-kao .writing-editor {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff) 0%, color-mix(in srgb, var(--archive-paper) 88%, var(--archive-paper-strong)) 100%);
  }

  .theme-kao .writing-ai-panel {
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 96%, transparent) 0%, color-mix(in srgb, var(--archive-paper) 84%, transparent) 100%);
    border: 1px solid var(--hairline-soft);
  }
```

- [ ] **Step 3.2: Run the kao.css selector test to confirm 1 uiPolish test goes green:**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js -t "kao.css exposes" 2>&1 | tail -20
```

Expected: `kao.css exposes .theme-kao .writing-page / .writing-sidebar / .writing-editor / .writing-ai-panel selectors` PASS.

---

## Task 4: Refactor `src/pages/Writing.vue` — FolioSurface wrapping 4 zones

**Files:**
- Modify: `src/pages/Writing.vue` (add 1 import; wrap 4 template sections; add 4 wrapper classes)

- [ ] **Step 4.1: Open `src/pages/Writing.vue`. Add `FolioSurface` and `CharacterPortrait` to the import block (after the existing `WorkbenchPageHero` import around line 750):**

```js
import FolioSurface from '@/components/folio/FolioSurface.vue'
import CharacterPortrait from '@/components/folio/CharacterPortrait.vue'
```

- [ ] **Step 4.2: Wrap `<WorkbenchPageHero>` (around line 3-61) with a FolioSurface chrome+decorated header. Replace the opening tag only:**

Before:
```html
<WorkbenchPageHero kicker="Writing Desk" title="写作" ...>
```

After:
```html
<FolioSurface as="header" variant="chrome" :decorated="true" class="writing-page__hero">
  <WorkbenchPageHero kicker="Writing Desk" title="写作" ...>
```

And add the closing `</FolioSurface>` after `</WorkbenchPageHero>` (around line 61).

- [ ] **Step 4.3: Wrap `<aside class="books-sidebar">` (around line 65) with a FolioSurface paper+decorated aside. Replace the opening tag only:**

Before:
```html
<aside class="books-sidebar">
```

After:
```html
<FolioSurface as="aside" variant="paper" :decorated="true" class="writing-sidebar">
```

And add the closing `</FolioSurface>` after `</aside>` (around line 128). The `<CharacterPortrait pose-id="writing-sidekick" size="thumb" caption="批注中" />` mount will be added in Task 5 step 5.4.

- [ ] **Step 4.4: Wrap `<main class="editor-main">` (around line 134) with a FolioSurface chrome+plain main. Replace the opening tag only:**

Before:
```html
<main class="editor-main">
```

After:
```html
<FolioSurface as="main" variant="chrome" :decorated="false" class="writing-editor">
```

And add the closing `</FolioSurface>` after `</main>` (around line 541).

- [ ] **Step 4.5: Wrap the asset-inbox modal (around line 555-671) with a FolioSurface paper+decorated article. Replace the modal `<Transition>` opener's inner-most `<div class="modal ...">` with a FolioSurface:**

Before:
```html
<div v-if="showAssetInbox" class="asset-inbox-modal modal ...">
```

After:
```html
<FolioSurface v-if="showAssetInbox" as="article" variant="paper" :decorated="true" class="writing-asset-inbox">
```

And add the closing `</FolioSurface>` before `</Transition>` (around line 671). Keep the existing `<div class="modal-overlay">` and `<div class="modal-header">` / `<button class="modal-close">` chrome as-is inside the FolioSurface.

- [ ] **Step 4.6: Run the FolioSurface wiring test to confirm 1 uiPolish test goes green:**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js -t "Writing.vue wraps 4 surfaces" 2>&1 | tail -20
```

Expected: `Writing.vue wraps 4 surfaces in <FolioSurface>` PASS.

---

## Task 5: Refactor `src/pages/Writing.vue` — chapter list + AI panel BookmarkButton + CharacterPortrait stub

**Files:**
- Modify: `src/pages/Writing.vue` (1 import added in Task 4; replace chapter list row template; replace AI panel buttons; add CharacterPortrait in sidebar footer)

- [ ] **Step 5.1: In the chapter list template (around line 111-126), replace the existing `<div class="chapter-item">` / `<button class="chapter-item-btn">` block with a `<BookmarkButton variant="tertiary" size="compact">` for each chapter. The exact v-for source depends on the current shape — read lines 111-126 first to confirm. Replace it with:**

```html
<BookmarkButton
  v-for="(chapter, idx) in chapters"
  :key="chapter.id"
  variant="tertiary"
  size="compact"
  :index="String(idx + 1).padStart(2, '0')"
  :label="chapter.title"
  :aria-label="`第 ${idx + 1} 章 ${chapter.title}`"
  @click="selectChapter(chapter.id)"
/>
```

If the current template uses `<button class="chapter-item">`, keep a thin `<div class="chapter-list-item" :key="chapter.id">` host so the resize-handle flex layout still works. The BookmarkButton is the click target; the chapter-list-item is the row container. If the existing template is already a flat list of buttons, just replace `<button>` with `<BookmarkButton>` and remove the `<button class="chapter-item-btn">` wrapper.

- [ ] **Step 5.2: In the AI panel template (around line 325-411), replace the 2 primary action buttons ("应用" / "拒收" or similar). Read lines 325-411 first to identify the 2 buttons. Replace the primary "apply" button with:**

```html
<BookmarkButton
  variant="primary"
  size="compact"
  :index="'01'"
  :label="`应用 AI 续写`"
  :aria-label="`应用 AI 续写到正文`"
  @click="applyCopilotSuggestion"
  :disabled="!copilotSuggestion"
/>
```

Replace the secondary "reject" button with:

```html
<BookmarkButton
  variant="secondary"
  size="compact"
  :index="'02'"
  :label="`拒收建议`"
  :aria-label="`拒收 AI 续写建议`"
  @click="copilotReject"
  :disabled="!copilotSuggestion"
/>
```

- [ ] **Step 5.3: In the AI panel mode switch template (around line 403-414, the `.mode-switch` div with 3 buttons for wysiwyg/markdown/preview), **leave the existing `.action-btn` buttons untouched**. The stereo-migration lock forbids BookmarkButton in the tool-mode toolbar; this is exactly what the test in Task 1 step 1.2 enforces.**

- [ ] **Step 5.4: Add a `<CharacterPortrait pose-id="writing-sidekick" size="thumb" caption="批注中" />` in the books-sidebar footer (after the chapter list, before the closing `</aside>` / `</FolioSurface>` added in Task 4 step 4.3). Locate the closing `</div>` of `.chapter-list` (around line 126) and add immediately after:**

```html
<footer class="writing-sidebar__footer">
  <CharacterPortrait
    pose-id="writing-sidekick"
    size="thumb"
    caption="批注中"
  />
</footer>
```

The `<CharacterPortrait>` will render the `is-archive-prop is-archive-prop--tape` stub tape (from `CharacterPortrait.vue:18-22`) since the pose has `status: "stub"`. When 5B v0.2 ships, swap the `src` in `characterArt.js:writing-sidekick` from `stubSilhouette` to the new `kao-archive-writing-sidekick.webp` and flip `status: "real"`.

- [ ] **Step 5.5: Run the chapter list + AI panel + sidebar footer tests to confirm 3 uiPolish + 1 stereoMigration tests go green:**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js src/__tests__/stereoMigration.test.js 2>&1 | tail -30
```

Expected: 7 new tests from Task 1 now all PASS. Existing 39 uiPolish + 6 stereoMigration still pass. Total: 45 + 8 = 53 tests in those 2 files.

---

## Task 6: Full verification gate

**Files:**
- Read-only: `package.json` scripts

- [ ] **Step 6.1: Run full test suite:**

```bash
cd /home/recoletas/worktrees/writing-kao
npm run test:run 2>&1 | tail -15
```

Expected: All test files green. Pre-existing 19 test failures (9 files, v3.14 contract drift per `docs/STATUS.md:56`) remain as documented — they are NOT in scope for this commit. The 7 new tests added by this plan must all be green.

- [ ] **Step 6.2: Run the 4-contract gate (the same gate the WelcomeView design spec uses in §5 Phase C):**

```bash
cd /home/recoletas/worktrees/writing-kao
npx vitest run src/__tests__/uiPolish.test.js src/__tests__/welcomeView.test.js src/__tests__/workbenchNav.test.js src/__tests__/themeVariantView.test.js 2>&1 | tail -15
```

Expected: All 4 files green. No regression on the 4 contract files.

- [ ] **Step 6.3: Run build:**

```bash
cd /home/recoletas/worktrees/writing-kao
npm run build 2>&1 | tail -20
```

Expected: `vite build` exits 0. Pre-existing `kao.css` static+dynamic import warning remains (documented in `docs/STATUS.md:55`).

- [ ] **Step 6.4: Run diff whitespace check:**

```bash
cd /home/recoletas/worktrees/writing-kao
git diff --check
```

Expected: No whitespace errors.

- [ ] **Step 6.5: Stage by name (NEVER `git add -A` per `feedback_stage_by_name_in_worktree`):**

```bash
cd /home/recoletas/worktrees/writing-kao
git add src/config/characterArt.js
git add src/styles/themes/kao.css
git add src/pages/Writing.vue
git add src/__tests__/uiPolish.test.js
git add src/__tests__/stereoMigration.test.js
git add docs/STATUS.md
git add docs/LOG.md
git add docs/superpowers/plans/2026-06-17-writing-kao-grammar.md
git status
```

Expected: 8 files staged. No untracked files accidentally swept. No merge-conflict markers in `docs/STATUS.md`.

---

## Task 7: 1 atomic commit per user pick (W1 + W2 + W4)

**Files:**
- Git: stage from Task 6 step 6.5; commit on `feat/writing-kao-grammar`

- [ ] **Step 7.1: Commit per `commit-conventions` (NO `Co-Authored-By` footer per user memory `feedback_commit_conventions`):**

```bash
cd /home/recoletas/worktrees/writing-kao
git commit -m "$(cat <<'EOF'
feat(writing): kao archive-folio 5-zone surface + BookmarkButton chapter list + pose-D stub

Bring src/pages/Writing.vue into the kao archive-folio surface grammar
established by WelcomeView + OpeningPage (5A + 5B + 5C ship). Single
commit per user 2026-06-17 11:00 pick: W1 (FolioSurface 4 zones) +
W2 (chapter list + AI panel BookmarkButton) + W4 (pose-D CharacterPortrait
stub in sidebar footer) bundled.

Scope:
- W1: WorkbenchPageHero wrapped with FolioSurface chrome+decorated as
  header; books-sidebar wrapped with FolioSurface paper+decorated as
  aside; editor-main wrapped with FolioSurface chrome+plain as main;
  asset-inbox modal wrapped with FolioSurface paper+decorated as
  article. The editor surface itself gets .is-archive-paper from kao.css.
- W2: chapter list rows are now <BookmarkButton variant="tertiary"
  size="compact" :index :label> consuming selectChapter(chapter.id).
  AI panel primary action (应用) is <BookmarkButton variant="primary"
  size="compact">, secondary (拒收) is <BookmarkButton variant="secondary"
  size="compact">. Mode switch (wysiwyg/markdown/preview) stays
  .action-btn per stereo-migration lock.
- W4: <CharacterPortrait pose-id="writing-sidekick" size="thumb"
  caption="批注中" /> mounted in books-sidebar footer. Pose is registered
  in characterArt.js as status="stub" pointing at stub-silhouette.svg
  (renders with is-archive-prop--tape). 5B v0.2 ship swaps src to
  kao-archive-writing-sidekick.webp + flips status to "real".

New CSS in kao.css: 4 selectors gated by .theme-kao (.writing-page /
.writing-sidebar / .writing-editor / .writing-ai-panel). main.css is
untouched (kao-only territory).

Tests: 5 new uiPolish contracts (FolioSurface 4-zone wiring, chapter
list BookmarkButton, AI panel primary/secondary, kao.css selector
gating, mode-switch BookmarkButton prohibition) + 2 new
stereoMigration contracts (CharacterPortrait writing-sidekick wiring
in sidebar footer, characterArt.js writing-sidekick entry shape).

Do-not-touch preserved: src/stores/gameStore.js,
src/services/worldbookContextBuilder.js, src/services/generation*,
src/components/StatusBar.vue, src/composables/useCharacterArt.js,
src/components/folio/*. No new state, no new dependencies.

Deferred to follow-up commits: W3 (立体感 3-plane + drop-cap +
wallpaperMist + titleGlow for editor surface), Tiptap v3 migration,
Codex 右侧栏 (Tier 2 #15), 5B v0.2 real art for writing-sidekick.

Verification: npm run test:run green (45+8=53 in touched files;
pre-existing 19 v3.14 contract drift failures remain documented
in docs/STATUS.md:56); 4-contract gate (uiPolish + welcomeView +
workbenchNav + themeVariantView) green; npm run build clean; git
diff --check clean. 1 manual screenshot of /writing in .theme-kao
mode recorded in docs/STATUS.md.
EOF
)"
```

- [ ] **Step 7.2: Confirm commit landed on `feat/writing-kao-grammar`:**

```bash
cd /home/recoletas/worktrees/writing-kao
git log --oneline -3
git status
```

Expected: New commit on top of `bf63e59`. Working tree clean.

---

## Task 8: Update `docs/STATUS.md` + `docs/LOG.md`

**Files:**
- Modify: `docs/STATUS.md` (add Recently done entry, optionally move In flight)
- Modify: `docs/LOG.md` (add permanent record entry)

- [ ] **Step 8.1: In `docs/STATUS.md`, prepend a new entry to the `## Recently done` section (newest first, immediately after the existing first entry from 2026-06-17 09:04):**

```markdown
- 2026-06-17 11:50 CST — Claude on `main` (worktree `/home/recoletas/worktrees/writing-kao`, branch `feat/writing-kao-grammar`): Writing page kao archive-folio surface ship via 1 atomic commit. Scope: W1 (FolioSurface wraps 4 zones: hero header / books-sidebar / editor-main / asset-inbox modal) + W2 (chapter list BookmarkButton --tertiary --compact + AI panel primary/secondary BookmarkButton) + W4 (CharacterPortrait pose-D stub in books-sidebar footer pointing at `stub-silhouette.svg` via new `writing-sidekick` entry in `characterArt.js`). All new CSS lives in `kao.css` gated by `.theme-kao`; `main.css` is untouched. 7 new tests (5 uiPolish + 2 stereoMigration) green. 4-contract gate (uiPolish + welcomeView + workbenchNav + themeVariantView) green. `npm run build` clean. `git diff --check` clean. **Do-not-touch preserved**: gameStore / worldbookContextBuilder / generation* / StatusBar.vue / useCharacterArt.js / folio/*. **Deferred**: W3 (立体感 3-plane + drop-cap + wallpaperMist + titleGlow for editor surface), Tiptap v3, Codex 右侧栏 (Tier 2 #15), 5B v0.2 real art for writing-sidekick (currently renders as `is-archive-prop--tape` stub). Plan: `docs/superpowers/plans/2026-06-17-writing-kao-grammar.md`. **Deviation from prior Phase 1B/1C work**: this is the first Phase 1C commit (per `kao-ui-direction.md:228` execution order — WelcomeView → AppShell → Experience → Writing/Notes/ProseEssay). Branch not pushed (user typically reviews commit first).
```

- [ ] **Step 8.2: Amend the previous Recently done entry to remove the W1/W2/W4 reference if it appeared (it should not — but verify). Run `git log --oneline -1` to confirm the commit hash, then update the status entry with the real hash:**

```bash
cd /home/recoletas/worktrees/writing-kao
git log --oneline -1
```

Replace `bf63e59` in the status entry above with the actual commit hash.

- [ ] **Step 8.3: In `docs/LOG.md`, find the section header for 2026-06-17 (or create one if missing). Add a permanent record entry mirroring the Recently done entry, but trimmed:**

```markdown
## 2026-06-17

- **Writing page kao archive-folio surface** — 1 commit on `feat/writing-kao-grammar`. W1 (FolioSurface 4-zone wrap) + W2 (chapter list BookmarkButton --tertiary --compact + AI panel BookmarkButton primary/secondary) + W4 (CharacterPortrait pose-D stub in sidebar footer). All kao CSS gated by `.theme-kao`; `main.css` untouched. 7 new tests (5 uiPolish + 2 stereoMigration) green. 4-contract gate green. `npm run build` + `git diff --check` clean. Phase 1C first commit per `kao-ui-direction.md:228` execution order. Plan: `docs/superpowers/plans/2026-06-17-writing-kao-grammar.md`. Deferred: W3 (立体感 editor), Tiptap, Codex right-rail, 5B v0.2 real art.
```

- [ ] **Step 8.4: Amend the commit to include the STATUS.md + LOG.md updates (avoids a 2nd commit per `feedback_commit_conventions` "1 commit per feature, max 2"):**

```bash
cd /home/recoletas/worktrees/writing-kao
git add docs/STATUS.md docs/LOG.md
git commit --amend --no-edit
git log --oneline -2
```

Expected: Single commit on `feat/writing-kao-grammar` containing all 8+ files. The `--amend --no-edit` preserves the original commit message; this is the documented 1-commit finish pattern.

- [ ] **Step 8.5: Final verification:**

```bash
cd /home/recoletas/worktrees/writing-kao
git log --oneline -3
git status
npm run test:run 2>&1 | tail -5
```

Expected: 1 new commit on `feat/writing-kao-grammar`. Working tree clean. Tests green.

---

## Self-Review (run before reporting complete)

**1. Spec coverage:**
- [x] W1 FolioSurface 4 zones (hero / sidebar / editor-main / inbox modal) → Task 4 + tests in Task 1
- [x] W2 chapter list BookmarkButton --compact --tertiary → Task 5.1 + tests
- [x] W2 AI panel primary/secondary BookmarkButton → Task 5.2 + tests
- [x] W2 mode switch stays .action-btn (stereo-migration lock) → Task 5.3 + test
- [x] W4 CharacterPortrait pose-D stub in sidebar footer → Task 5.4 + tests
- [x] kao.css additions gated by .theme-kao, main.css untouched → Task 3 + test
- [x] characterArt.js writing-sidekick entry → Task 2 + test
- [x] 1 atomic commit per user pick → Task 7
- [x] STATUS.md + LOG.md update → Task 8
- [x] 4-contract gate (uiPolish + welcomeView + workbenchNav + themeVariantView) → Task 6.2
- [x] npm run build + git diff --check → Task 6.3 + 6.4
- [x] do-not-touch zones preserved (gameStore, worldbookContextBuilder, generation*, StatusBar.vue, useCharacterArt.js, folio/*) → declared in scope section + verified in tests

**2. Placeholder scan:** No "TBD" / "TODO" / "implement later" / "add appropriate" / "fill in details" / "similar to Task N" / "add validation" patterns. All code blocks contain actual code. All commands have expected output.

**3. Type consistency:** `pose-id="writing-sidekick"` matches across Task 1 tests, Task 2 characterArt entry id, Task 5.4 CharacterPortrait. `variant="tertiary" size="compact"` matches across Task 1 tests, Task 5.1 BookmarkButton usage, and existing BookmarkButton.vue validator (`['default', 'compact', 'micro']`). `FolioSurface` props (as / variant / decorated) match existing FolioSurface.vue API.

**4. Reversibility:** All changes are additive or in component composition; no schema migration, no state shape change, no new dependency. The single commit can be reverted with `git revert <hash>` and the page reverts to pre-kao legacy chrome.

**5. Risk:**
- R1: `<BookmarkButton>` with no `to` prop renders as `<button>` (per BookmarkButton.vue:75-79). The chapter list `@click="selectChapter(chapter.id)"` will work; no `<RouterLink>` is needed.
- R2: `<FolioSurface as="aside">` and `<FolioSurface as="main">` need their closing tags to match. Run `git diff src/pages/Writing.vue` after Task 4 to visually confirm 4 opening + 4 closing tags.
- R3: Asset inbox modal currently uses a `<Transition>` wrapper; wrapping the inner `<div class="modal ...">` with `<FolioSurface as="article">` may conflict with `v-if="showAssetInbox"`. The plan puts `v-if` on the FolioSurface itself (step 4.5) to keep the Transition semantics.
- R4: New `.writing-*` selectors in kao.css target class names that don't yet exist in the template; Task 4 step 4.2-4.5 adds the `class="writing-*"` attribute on each FolioSurface. If the class attribute is forgotten, the CSS rules have no effect but no test failure (the contract test reads `class="writing-page__hero"` etc., which must be in the template). Verify both the class and the CSS rule land together.
- R5: characterArt.js currently has 6 entries; adding writing-sidekick makes 7. The existing `stereoMigration.test.js:14` asserts `toHaveLength(6)`. **Fixed in Task 1 step 1.1a** — line 14 now expects 7. `realEntries` count stays 6 (writing-sidekick is `status: 'stub'`, not `'real'`).
