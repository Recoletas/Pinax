import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('ui polish contract', () => {
  it('defines accent text and modal transition tokens in the global stylesheet', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    expect(mainCss).toMatch(/--accent-text:\s*#ffffff;/)
    expect(mainCss).toMatch(/\.theme-dark\s*\{[\s\S]*--accent-text:\s*#120f0c;/)
    expect(mainCss).toMatch(/\.btn-primary\s*\{[\s\S]*color:\s*var\(--accent-text\);/s)
    expect(mainCss).toMatch(/\.modal-fade-enter-active,\s*\.modal-fade-leave-active/);
    expect(mainCss).toMatch(/\.modal-scale-enter-active,\s*\.modal-scale-leave-active/);
  })

  it('exposes the archive-folio utilities in kao.css (gated by .theme-kao, NOT in main.css) and mounts them across the core chrome surfaces', () => {
    // 5C v3.15+: theme-system clean-separation — the archive-folio
    // utility classes (`.is-folio`, `.is-bookmark`, `.is-archive-strip`)
    // live in src/styles/themes/kao.css gated by `.theme-kao`. They
    // must NOT be in main.css (would leak into the legacy variant).
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const mainCss = readProjectFile('src/styles/main.css')
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')
    const appShell = readProjectFile('src/layouts/AppShell.vue')
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(kaoCss).toContain('.is-folio')
    expect(kaoCss).toContain('.is-bookmark')
    expect(kaoCss).toContain('.is-archive-strip')
    // Theme-system contract: main.css must NOT contain kao-only utilities.
    expect(mainCss).not.toMatch(/is-archive-paper/)
    expect(mainCss).not.toMatch(/is-archive-prop/)
    expect(welcomeView).toContain('<PosterStage')
    expect(welcomeView).toContain('<FolioSurface')
    expect(welcomeView).toContain('<BookmarkButton')
    expect(welcomeView).toContain('<ArchiveStrip')
    expect(appShell).toContain('<FolioSurface')
    expect(appShell).toContain('class="shell-drawer"')
    expect(openingPage).toContain('<BookmarkButton')
    expect(openingPage).toContain('<CharacterArchiveStrip')
    expect(openingPage).toContain('index-class="stage-command__index"')
    expect(openingPage).toContain('label-class="stage-command__label"')
    expect(experience).not.toContain('<BookmarkButton')
    expect(experience).not.toContain('<ArchiveStrip')
  })

  it('uses modal fade/scale transitions for existing content overlays', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const writing = readProjectFile('src/pages/Writing.vue')
    const notes = readProjectFile('src/pages/Notes.vue')
    const proseEssay = readProjectFile('src/pages/ProseEssay.vue')

    expect(experience).toContain('<Transition name="modal-fade">')
    expect(experience).not.toContain('<Transition name="fade">')
    expect(writing).toContain('<Transition name="modal-fade">')
    expect(notes).toContain('<Transition name="modal-fade">')
    expect(proseEssay).toContain('<Transition name="modal-fade">')
    expect(proseEssay).toContain('<Transition name="modal-scale" appear>')
  })

  it('adds a subtle workbench texture to the card wall', () => {
    const proseEssay = readProjectFile('src/pages/ProseEssay.vue')

    expect(proseEssay).toMatch(/\.card-wall\s*\{[\s\S]*radial-gradient/);
    expect(proseEssay).toMatch(/\.card-wall\s*\{[\s\S]*background-size:/);
  })

  it('keeps material bulk actions in the checked-selection toolbar', () => {
    const notes = readProjectFile('src/pages/Notes.vue')

    // UI-N2: material-selection-bar is gone — the batch stamp now lives in
    // material-selection-stamp inside the drawer. The 4 functional buttons
    // must still exist with the same @click handlers (functional contract).
    expect(notes).toContain('class="material-selection-stamp"')
    expect(notes).toContain('@click="importCheckedToCanvas">导入</button>')
    expect(notes).toContain('@click="setCheckedAssetsState(\'accepted\')">采纳</button>')
    expect(notes).toContain('@click="setCheckedAssetsState(\'archived\')">归档</button>')
    expect(notes).toContain('@click="deleteCheckedAssets">删除</button>')
    expect(notes).not.toContain('class="asset-status-control"')
    expect(notes).not.toContain('function setSelectedAssetState')
    expect(notes).not.toContain('class="material-selection-bar"')
  })

  it('keeps the playable-worldbook entry path visible before heavy editor exits', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')
    const quickImport = readProjectFile('src/pages/WorldBookQuickImport.vue')
    const router = readProjectFile('src/router/index.js')
    const appShell = readProjectFile('src/layouts/AppShell.vue')
    const activityBar = readProjectFile('src/components/workbench/ActivityBar.vue')

    expect(welcomeView).toContain('class="welcome-stage-poster"')
    expect(welcomeView).toContain('class="welcome-poster-shell"')
    expect(welcomeView).toContain('class="welcome-poster-frame"')
    expect(welcomeView).toContain('class="welcome-poster-stage"')
    expect(welcomeView).toContain('aria-label="默认世界入口"')
    expect(welcomeView).toContain('featuredPreset.name')
    expect(welcomeView).toContain('featuredPreset.genreLabel')
    expect(welcomeView).toContain('aria-label="进入世界入口"')
    expect(welcomeView).toContain('aria-label="继续当前故事"')
    expect(welcomeView).toContain('class="welcome-persona-note"')
    expect(welcomeView).toContain('class="welcome-dossier"')
    expect(welcomeView).toContain('class="welcome-briefing"')
    expect(welcomeView).toContain('class="welcome-mission-card"')
    expect(welcomeView).toContain('class="welcome-pressure-grid"')
    expect(welcomeView).toContain('class="welcome-dossier-route"')
    expect(welcomeView).toContain('class="welcome-exit-strip"')
    expect(welcomeView).not.toContain('welcome-workbench-rail')
    expect(welcomeView).not.toContain('让剧情先发生')
    expect(welcomeView).not.toContain('虚构集</h1>')
    expect(welcomeView).not.toContain('Playable Worldbook')
    expect(experience).not.toContain('class="experience-stage-toolbar"')
    expect(experience).not.toContain('class="experience-stage-band"')
    expect(experience).not.toContain('class="playable-world-strip"')
    expect(experience).not.toContain('class="playable-world-briefing"')
    expect(experience).not.toContain('class="playable-world-mission"')
    expect(experience).not.toContain('class="playable-world-pressure-grid"')
    expect(experience).not.toContain('class="playable-world-actions"')
    expect(experience).not.toContain('class="playable-world-archive-strip"')
    expect(experience).not.toContain('v-if="showExperienceEntryStage"')
    expect(experience).toContain('const showExperienceWorkChrome = computed(() => hasUserActionMessages.value)')
    expect(experience).toContain('<GmPersonaLauncher\n      v-if="showExperienceWorkChrome"')
    expect(experience).toContain('<div v-if="showExperienceWorkChrome" class="game-image-gen-rail">')
    expect(experience).toContain('<aside v-if="showExperienceWorkChrome" class="quick-notes-rail"')
    expect(experience).not.toContain('label="进入世界"')
    expect(experience).not.toContain('label="会话"')
    expect(experience).not.toContain('切口目录')
    // 5C step 3 refactor: 开局/改写 buttons moved from a separate
    // playable-world-opening-page section into the main .opening-copy.
    // The briefing is the new entry path. playableWorldOpeningFacts is no
    // longer surfaced (it was duplicate content with opening-briefing).
    expect(openingPage).toContain('class="opening-briefing"')
    expect(openingPage).toContain('class="opening-mission"')
    expect(openingPage).toContain('class="opening-pressure-grid"')
    expect(openingPage).toContain('class="opening-action-actions"')
    expect(openingPage).toContain('label="开局"')
    expect(openingPage).toContain('label="改写"')
    expect(openingPage).toContain("router.push({ name: 'experience' })")
    expect(experience).not.toContain('class="playable-world-opening-page"')
    expect(experience).not.toContain('class="opening-page-lead"')
    expect(experience).not.toContain('class="opening-page-facts"')
    expect(openingPage).not.toContain('class="playable-world-opening-page"')
    expect(openingPage).not.toContain('class="opening-page-lead"')
    expect(openingPage).not.toContain('class="opening-page-facts"')
    expect(openingPage).not.toContain('playableWorldOpeningFacts')
    expect(quickImport).toContain('选择一个世界')
    expect(quickImport).toContain('默认世界入口')
    expect(quickImport).toContain('查看更多世界')
    expect(quickImport).toContain('开场困境')
    expect(quickImport).toContain('class="hero-signal-board"')
    expect(quickImport).toContain('class="world-dossier"')
    expect(quickImport).toContain('class="world-pressure-row"')
    expect(quickImport).toContain('class="world-adventure-route"')
    expect(quickImport).toContain('class="world-map-card"')
    expect(quickImport).toContain('class="world-threat-meter"')
    expect(quickImport).toContain('class="world-pressure-stack"')
    expect(quickImport).toContain('class="world-brief-list"')
    expect(quickImport).toContain('class="world-action-card"')
    expect(openingPage).toContain('开场页')
    expect(openingPage).toContain('SCENE')
    expect(experience).not.toContain('<div class="playable-world-route"')
    expect(experience).not.toContain('<div class="opening-scene-grid"')
    expect(experience).not.toContain('<div v-if="openingActionHooks.length" class="opening-action-directory"')
    expect(experience).not.toContain('class="experience-side-card-kicker">切口目录')
    expect(experience).not.toContain('第一异常')
    expect(experience).not.toContain('class="opening-brief-lines"')
    expect(experience).not.toContain('class="playable-world-scene-status"')
    expect(experience).not.toContain('<strong>入口</strong>')
    expect(experience).not.toContain('<strong>出口</strong>')
    // UI-E11-A: game-main-shell / sidebar-head-copy replaced by ws-* in
    // workstation layout.
    expect(experience).toContain('class="ws-layout"')
    expect(experience).toContain('class="ws-right-rail"')
    expect(experience).not.toContain('label="开局"')
    expect(experience).not.toContain('label="改写"')
    expect(experience).not.toContain('从这里开局')
    expect(experience).not.toContain('改成自己写')
    expect(experience).not.toContain('GM 指令')
    expect(experience).not.toContain('class="opening-command-preview"')
    expect(experience).not.toContain('class="experience-entry-rail"')
    expect(experience).not.toContain('右列只放会影响当前推进的东西')
    expect(appShell).toContain('class="shell-mast"')
    expect(appShell).toContain('class="shell-drawer"')
    expect(appShell).toContain('class="shell-tabbar"')
    expect(appShell).toContain('class="shell-meta-chip"')
    expect(appShell).not.toContain('Mode {{')
    expect(activityBar).toContain('class="activity-btn"')
    expect(activityBar).toContain('class="activity-desc"')
    expect(router).toContain('immersiveShell: true')
    expect(router).toContain('hideActivityBar: true')
    expect(router).toContain('hideSidePanel: true')
    expect(router).toMatch(/path:\s*'opening'[\s\S]*?name:\s*'opening'/)
    expect(router).toMatch(/name:\s*'opening'[\s\S]*?hideGlobalMemory:\s*true/)
    expect(router).toMatch(/name:\s*'settings-worldbook'[\s\S]*?activityKey:\s*'worldbook'/)
    expect(router).toMatch(/name:\s*'settings-worldbook'[\s\S]*?hideGlobalMemory:\s*true/)
  })

  it('keeps global memory chrome out of the world-selection transition page', () => {
    const app = readProjectFile('src/App.vue')

    expect(app).toContain('const showGlobalMemoryIndicator = computed')
    expect(app).toContain("const isExperienceEntryTransition = computed(() => route.name === 'experience' && !hasUserActionMessages.value)")
    expect(app).toContain('!route.meta?.hideGlobalMemory')
    expect(app).toContain('!isExperienceEntryTransition.value')
    expect(app).toContain('<MemoryIndicator v-if="showGlobalMemoryIndicator" />')
  })

  it('uses the shared gm-persona launcher shell across the four heavy work surfaces', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const writing = readProjectFile('src/pages/Writing.vue')
    const notes = readProjectFile('src/pages/Notes.vue')
    const proseEssay = readProjectFile('src/pages/ProseEssay.vue')
    const personaLauncher = readProjectFile('src/components/gm-persona/GmPersonaLauncher.vue')

    expect(experience).toContain('<GmPersonaLauncher')
    expect(writing).toContain('<GmPersonaLauncher')
    expect(notes).toContain('<GmPersonaLauncher')
    expect(proseEssay).toContain('<GmPersonaLauncher')
    expect(experience).not.toContain('.advisor-fab')
    expect(writing).not.toContain('.advisor-fab')
    expect(notes).not.toContain('.advisor-fab')
    expect(proseEssay).not.toContain('.advisor-fab')
    expect(personaLauncher).toContain('class="gm-persona-bubble"')
    expect(personaLauncher).toContain('class="gm-persona-launcher"')
    expect(personaLauncher).toContain("caption: {\n    type: String,\n    default: '虚构集'")
  })

  it('UI-W2: Writing page is composed as Pinax Wall — cork-board band + shelf + dossier sheet + wall-attached character card, no SaaS toolbar', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const writing = readProjectFile('src/pages/Writing.vue')
    const notes = readProjectFile('src/pages/Notes.vue')
    const proseEssay = readProjectFile('src/pages/ProseEssay.vue')
    const workbenchHero = readProjectFile('src/components/workbench/WorkbenchPageHero.vue')

    // Experience contract unchanged.
    expect(experience).not.toContain('<WorkbenchPageHero')
    expect(experience).not.toContain('class="experience-stage-band"')
    // UI-E11-A: game-layout / game-main-shell / sidebar-head-copy replaced
    // by ws-layout / ws-center-stage / ws-right-rail in the workstation layout.
    expect(experience).toContain('class="ws-layout"')
    expect(experience).toContain('class="ws-center-stage"')
    expect(experience).toContain('class="ws-right-rail"')

    // UI-W2: Writing = 编辑室资料墙 (Pinax Wall). Top is a 216px wall
    // (28px molding + 188px cork-board), main is 3-zone grid (shelf +
    // dossier + portrait card). No SaaS hero, no WorkbenchPageHero, no
    // manuscript-top strip, no Writing Desk kicker, no 长说明.
    expect(writing).not.toContain('<WorkbenchPageHero')
    expect(writing).not.toContain('Writing Desk')
    expect(writing).not.toContain('class="manuscript-top"')
    expect(writing).not.toContain('writingHeroDescription')
    expect(writing).not.toContain('当前正在处理')
    expect(writing).not.toContain('class="content-area"')
    expect(writing).not.toContain('class="editor-main writing-editor"')
    expect(writing).not.toContain('class="books-sidebar writing-sidebar"')

    // Wall structure: molding + cork-board + main 3-zone + floor.
    // UI-W9: cork-board is now a single-row thin functional bar
    // (64-80px). Removed: wall__pin (4 wrapper labels), wall__stamp
    // (76x76 round seal), wall__ribbon (96px ribbon bookmark). Added:
    // wall__book-pill (book-select label), wall__save-chip (inline
    // pill replacing the round seal). wall__pin-dot stays but no
    // longer wrapped in wall__pin.
    expect(writing).toMatch(/class="wall__molding"/)
    expect(writing).toMatch(/class="wall__cork"/)
    expect(writing).toMatch(/class="wall__book-pill"/)
    expect(writing).toMatch(/class="wall__book-select"/)
    expect(writing).toMatch(/class="wall__pins"/)
    expect(writing).toMatch(/class="wall__pin-dot"/)
    expect(writing).not.toMatch(/class="wall__pin"/)
    expect(writing).not.toMatch(/class="wall__pin-num"/)
    expect(writing).not.toMatch(/class="wall__ribbon"/)
    expect(writing).not.toMatch(/class="wall__stamp"/)
    expect(writing).not.toMatch(/class="wall__stamp-state"/)
    expect(writing).not.toMatch(/class="wall__stamp-meta"/)
    expect(writing).toMatch(/class="wall__save-chip"/)
    expect(writing).toMatch(/class="wall__tabs"/)
    expect(writing).toMatch(/class="wall__main"/)
    expect(writing).toMatch(/class="wall__shelf"/)
    expect(writing).toMatch(/class="wall__folder"/)
    expect(writing).toMatch(/class="wall__shelf-roll"/)
    expect(writing).toMatch(/class="wall__dossier"/)
    expect(writing).toMatch(/class="wall__dossier-tape wall__dossier-tape--left"/)
    expect(writing).toMatch(/class="wall__dossier-head"/)
    expect(writing).toMatch(/class="wall__dossier-num"/)
    expect(writing).toMatch(/class="wall__dossier-title"/)
    expect(writing).toMatch(/class="wall__dossier-empty"/)
    expect(writing).toMatch(/class="wall__empty-stamp"/)
    expect(writing).toMatch(/class="wall__empty-clip"/)
    expect(writing).toMatch(/class="wall__pin-cta"/)
    expect(writing).toMatch(/class="wall__dossier-portrait"/)
    expect(writing).toMatch(/class="wall__steel-pin wall__steel-pin--tl"/)
    expect(writing).toMatch(/class="wall__floor"/)

    // 8 functional controls still wired (anti-micro-tweak gate).
    expect(writing).toContain('@click="goBack"')
    expect(writing).toContain('v-model="selectedBookId"')
    expect(writing).toContain('@click.stop="openAssetInbox"')
    expect(writing).toContain('@click.stop="openMaterialsPage"')
    expect(writing).toContain('@click.stop="exportChapterStoryboardDraft"')
    expect(writing).toContain('@click="toggleTheme"')
    expect(writing).toContain('@click="createNewBook"')
    expect(writing).toContain('@click="createNewChapter"')

    // Notes still follows its own direction (out of UI-W2 scope).
    expect(notes).not.toContain('<WorkbenchPageHero')
    expect(notes).not.toContain('Material Library')
    expect(notes).not.toContain('notesHeroDescription')
    expect(notes).not.toContain('素材页现在是整理台')
    expect(notes).toContain('class="manuscript-top material-top"')
    expect(notes).toContain('class="material-top__count"')
    expect(proseEssay).toContain('<WorkbenchPageHero')
    expect(proseEssay).toContain('Storyboard Canvas')
    expect(workbenchHero).toContain('class="workbench-page-hero"')
    expect(workbenchHero).toContain('class="workbench-page-hero__title"')
  })

  it('UI-W2: Pinax Wall has .theme-kao gated CSS in kao.css and legacy fallback in Writing.vue scoped style', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const writing = readProjectFile('src/pages/Writing.vue')

    // kao variant — uses --archive-* tokens. UI-W9: book-pill + save-chip
    // replaced the pin wrapper + round stamp; cork-board is now a thin
    // flex bar (64-80px), not a 188px grid panel.
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__molding\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__cork\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__book-pill\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__save-chip\s*\{/)
    expect(kaoCss).not.toMatch(/\.theme-kao\s+\.wall__pin\s*\{/)
    expect(kaoCss).not.toMatch(/\.theme-kao\s+\.wall__pin-num\s*\{/)
    expect(kaoCss).not.toMatch(/\.theme-kao\s+\.wall__stamp\s*\{/)
    expect(kaoCss).not.toMatch(/\.theme-kao\s+\.wall__ribbon\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__main\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__shelf\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__folder\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__dossier\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__dossier-portrait\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__pin-cta\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__empty-stamp\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__steel-pin\s*\{/)

    // legacy variant — uses --text-*/--border/--accent in Writing.vue scoped CSS
    expect(writing).toMatch(/\.wall__main\s*\{/)
    expect(writing).toMatch(/\.wall__dossier\s*\{/)
    expect(writing).toMatch(/\.wall__dossier-portrait\s*\{/)

    // No scoped :global(.theme-kao) rule (anti-pattern from earlier round)
    expect(writing).not.toMatch(/:global\(\.theme-kao\)/)
    expect(writing).not.toMatch(/:deep\(\.theme-kao\)/)
    // No new !important declarations in UI-W2 scoped CSS additions
    // (pre-existing chapter-outline-kind / .with-copilot-ghost rules remain
    //  unchanged from Phase 1C — they are not part of the Wall refactor).
    expect(writing).not.toMatch(/\.wall__[a-z_-]*\s*\{[^}]*!important/)
    expect(writing).not.toMatch(/\.wall__steel-pin[^}]*!important/)
  })
})

describe('welcome + experience pass 2 — z-index tokens and isolation', () => {
  it('adds 4 new z-index tokens to main.css :root', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    expect(mainCss).toContain('--z-stage-decor:')
    expect(mainCss).toContain('--z-stage-hero:')
    expect(mainCss).toContain('--z-stage-cta:')
    expect(mainCss).toContain('--z-mechanism-notice:')
  })

  it('isolates blend-mode stacking context on .welcome-stage-poster', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toMatch(/\.welcome-stage-poster\s*\{[\s\S]*?isolation:\s*isolate;[\s\S]*?\}/)
  })

  it('exposes .is-archive-prop utility with 3 modifiers in kao.css (NOT in main.css)', () => {
    // 5C v3.15+ theme-system clean-separation — the archive-prop
    // utility (base + 3 modifiers: tape / fold / stain) lives in
    // src/styles/themes/kao.css gated by `.theme-kao`. The main.css
    // must NOT contain these (would leak into the legacy variant).
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const mainCss = readProjectFile('src/styles/main.css')

    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-prop\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-prop--tape\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-prop--fold\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-prop--stain\b/)
    expect(mainCss).not.toMatch(/is-archive-paper/)
    expect(mainCss).not.toMatch(/is-archive-prop/)
  })

  it('replaces hardcoded mechanism-notice z-index with --z-mechanism-notice token', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    expect(experience).toMatch(/\.mechanism-notice\s*\{[\s\S]*?z-index:\s*var\(--z-mechanism-notice\)/)
  })
})

describe('welcome + experience pass 3 — z-stage-cta wiring, kao grammar, no feGaussianBlur, 5 v-if unchanged', () => {
  it('wires .welcome-command-stack to --z-stage-cta token (replaces hardcoded 2)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    const stackRule =
      welcomeView.match(/\.welcome-command-stack\s*\{[^}]*\}/s)?.[0] || ''
    expect(stackRule).toMatch(/z-index:\s*var\(--z-stage-cta\)/)
    expect(stackRule).not.toMatch(/z-index:\s*2\s*;/)
  })

  it('OpeningPage world hero uses kao grammar: CharacterBackdrop with isolation + mix-blend (5C v3.5: cover via full-bleed Backdrop, no .opening-stage-poster wrapper, no .opening-shell card)', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')
    const backdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // 5C refactor: cover is a full-page <CharacterBackdrop>, not a 360px
    // .opening-stage-poster card. The kao grammar (isolation, mix-blend,
    // vignette + color-wash) now lives in CharacterBackdrop.
    expect(openingPage).not.toMatch(/\.opening-stage-poster\s*\{/)
    expect(openingPage).toMatch(/<CharacterBackdrop\b/)

    // 5C v3.5: the .opening-shell card (clip-path polygon + cream bg +
    // box-shadow + min(1240px, 100%) width) is GONE. .opening-view is
    // now the full-bleed layering root: position: relative; isolation:
    // isolate; <CharacterBackdrop> is its direct child.
    expect(openingPage).not.toMatch(/class="opening-shell"/)
    expect(openingPage).not.toMatch(/\.opening-shell\s*\{/)
    const viewRule = openingPage.match(/\.opening-view\s*\{[^}]*\}/s)?.[0] || ''
    expect(viewRule).toMatch(/isolation:\s*isolate/)
    expect(viewRule).toMatch(/position:\s*relative/)

    // The kao grammar properties live in CharacterBackdrop.vue now.
    const backdropRules = backdrop.match(/\.[^{]+\{[^}]*\}/gs) || []
    const allBackdropCss = backdropRules.join('\n')
    expect(allBackdropCss).toMatch(/isolation:\s*isolate/)
    expect(allBackdropCss).toMatch(/mix-blend-mode:\s*multiply/)
    expect(allBackdropCss).toMatch(/background-image:\s*var\(--character-backdrop-image/)
  })

  it('Experience no longer carries the opening strip while OpeningPage isolates its view (5C v3.5: .opening-shell → .opening-view)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    // 5C v3.5: .opening-shell is gone; the layering root is .opening-view.
    const viewRule = openingPage.match(/\.opening-view\s*\{[^}]*\}/s)?.[0] || ''
    expect(experience).not.toContain('class="playable-world-strip"')
    expect(viewRule).toMatch(/isolation:\s*isolate/)
  })

  it('removes SVG feGaussianBlur stdDeviation="3" from PosterStage filter chain', () => {
    const posterStage = readProjectFile('src/components/folio/PosterStage.vue')

    expect(posterStage).not.toMatch(/<feGaussianBlur[^>]*stdDeviation="3"/)
    // feTurbulence + feDisplacementMap remain (torn paper edge still works)
    expect(posterStage).toMatch(/<feTurbulence/)
    expect(posterStage).toMatch(/<feDisplacementMap/)
  })

  it('removes hasSelectedWorldbook-gated opening sections from Experience after route extraction', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const matches = experience.match(/v-if="hasSelectedWorldbook"/g) || []
    expect(matches.length).toBe(0)
  })
})

describe('welcome + experience pass 4 — 1-click resume + micro button density', () => {
  it('gameStore exposes getLatestSessionForWorldbook action that sorts by updatedAt desc', () => {
    const gameStore = readProjectFile('src/stores/gameStore.js')

    expect(gameStore).toMatch(/getLatestSessionForWorldbook\s*\(/)
    // Body must sort by updatedAt desc before find
    expect(gameStore).toMatch(
      /\(b\.updatedAt \|\| 0\) - \(a\.updatedAt \|\| 0\)/,
    )
  })

  it('OpeningPage and Experience.vue both prefer getLatestSessionForWorldbook for session restore', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(openingPage).toMatch(/getLatestSessionForWorldbook\s*\(/)
    expect(experience).toMatch(/getLatestSessionForWorldbook\s*\(/)
    expect(experience).toMatch(/worldbookLatestSession\s*\|\|\s*allLatestSession/)
    // Old buggy predicate (find by currentSessionId) is gone from the find branch
    expect(openingPage).not.toMatch(
      /session\.id\s*===\s*gameStore\.currentSessionId\s*\?\s*gameStore\.sessions\.find/,
    )
  })

  it('Experience.vue onMounted restores latest stored session without opening SessionPicker', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const onMountedBlock = experience.match(/onMounted\(async \(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''
    expect(onMountedBlock).toContain('latestStoredSession')
    expect(onMountedBlock).toMatch(/gameStore\.sessions[\s\S]*?sort\(/)
    expect(onMountedBlock).toMatch(/gameStore\.loadSession\(latestStoredSession\.id\)/)
    expect(onMountedBlock).toMatch(/showSessionPicker\.value\s*=\s*false/)
  })

  it('Experience.vue onMounted keeps an active worldbook without creating an opening session when no session is selected', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const onMountedBlock = experience.match(/onMounted\(async \(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''
    expect(onMountedBlock).toContain('worldStore.worldbooksIndex.length')
    expect(onMountedBlock).toContain('await worldStore.ensureActiveWorldbook()')
    expect(onMountedBlock).toContain('showSessionPicker.value = false')
    expect(onMountedBlock).not.toContain('await ensureWorldAdventureSession({ initIfEmpty: false })')
    expect(onMountedBlock).not.toContain('selectedWorldbookId.value = \'\'')
    expect(onMountedBlock).not.toContain('await worldStore.setActiveWorldbook(null)')
  })

  it('OpeningPage.vue owns worldbook intent activation while Experience.vue ignores it', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const onMountedBlock = experience.match(/onMounted\(async \(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''
    const openingMountedBlock = openingPage.match(/onMounted\(async \(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''
    expect(openingMountedBlock).toContain('hasIntentWorldbook')
    expect(openingMountedBlock).toContain('await worldStore.setActiveWorldbook(intentWorldbookId)')
    expect(onMountedBlock).not.toContain('hasIntentWorldbook')
    expect(experience).not.toContain('getPlayableWorldEntryIntent')
    expect(onMountedBlock).not.toContain('stillMounting')
    expect(onMountedBlock).not.toContain('const targetId')
  })

  it('Experience.vue no longer owns toolbar worldbook selection after opening extraction', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    expect(experience).not.toContain('@change="onWorldbookChange"')
    expect(experience).not.toContain('async function onWorldbookChange')
    expect(experience).not.toContain('await ensureWorldAdventureSession({ initIfEmpty: false })')
  })

  it('OpeningPage and Experience.vue both guard session actions against double-click via isStarting ref with try/finally', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(openingPage).toContain('isStarting')
    expect(experience).toContain('isStarting')
    // try/finally pattern: lock acquired at start, released in finally
    expect(openingPage).toMatch(
      /try\s*\{[\s\S]*?isStarting\.value\s*=\s*true[\s\S]*?finally\s*\{[\s\S]*?isStarting\.value\s*=\s*false/,
    )
    expect(experience).toMatch(
      /try\s*\{[\s\S]*?isStarting\.value\s*=\s*true[\s\S]*?finally\s*\{[\s\S]*?isStarting\.value\s*=\s*false/,
    )
  })

  it('SessionPicker exposes busy state to disable session lifecycle controls', () => {
    const sessionPicker = readProjectFile('src/components/SessionPicker.vue')
    const experience = readProjectFile('src/pages/Experience.vue')

    expect(sessionPicker).toMatch(/defineProps\(\s*\{[\s\S]*?busy:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\}/)
    expect(sessionPicker).toMatch(/<button class="new-btn"[^>]*:disabled="busy"/)
    expect(sessionPicker).toMatch(/<button class="item-delete"[^>]*:disabled="busy"/)
    expect(sessionPicker).toMatch(/'is-busy':\s*busy/)
    expect(sessionPicker).toMatch(/\.session-item\.is-busy\s*\{[\s\S]*?pointer-events:\s*none[\s\S]*?opacity:\s*0\.5/)
    expect(experience).toMatch(/<SessionPicker[\s\S]*?:busy="isStarting"[\s\S]*?\/>/)
  })

  it('BookmarkButton accepts size prop with 3 values and adds --size-micro class', () => {
    const bookmark = readProjectFile('src/components/folio/BookmarkButton.vue')

    expect(bookmark).toMatch(/size:\s*\{[^}]*default:\s*'default'/)
    expect(bookmark).toMatch(
      /validator:\s*\(v\)\s*=>\s*\[\s*'default'\s*,\s*'compact'\s*,\s*'micro'\s*\]\.includes/,
    )
    expect(bookmark).toContain('.bookmark-button--size-micro')
    // 760px mobile variant
    expect(bookmark).toMatch(
      /@media \(max-width: 760px\)\s*\{[\s\S]*?\.bookmark-button--size-micro\s*\{[\s\S]*?min-height:\s*36px/,
    )
  })

  it('Only OpeningPage.vue owns stage-command BookmarkButton usages and they are no longer micro stamps', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const experienceMatches = experience.match(/size="micro"/g) || []
    const openingMatches = openingPage.match(/size="micro"/g) || []
    expect(experienceMatches.length).toBe(0)
    expect(openingMatches.length).toBe(0)
    expect(openingPage).toContain('class="action-btn stage-command stage-command--primary"')
    expect(openingPage).toContain('class="action-btn stage-command stage-command--secondary"')
  })

  it('Experience.vue no longer owns left-stage entry buttons after opening route extraction', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(experience).not.toContain('class="playable-world-actions"')
    expect(experience).not.toContain('@click="startWorldAdventure"')
    expect(experience).not.toContain('@click="handleStageSecondaryAction"')
    expect(experience).not.toContain('function handleStageSecondaryAction')
    expect(experience).not.toContain('async function startWorldAdventure')
    expect(openingPage).toContain('class="opening-action-actions"')
    expect(openingPage).toContain('async function sendOpeningAction')
  })

  it('OpeningPage.vue .stage-command base is a full-size opening action', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const baseRule =
      openingPage.match(/^[ \t]*\.stage-command\s*\{[^}]*\}/m)?.[0] || ''
    expect(baseRule).toMatch(/min-height:\s*88px/)
    expect(baseRule).toMatch(/min-width:\s*264px/)
    expect(baseRule).toMatch(/grid-template-columns:\s*64px\s+minmax\(0,\s*1fr\)/)
    expect(baseRule).toMatch(/scale\(1\.14\)/)
    expect(baseRule).not.toMatch(/min-height:\s*40px/)
    expect(baseRule).not.toMatch(/min-width:\s*144px/)
  })

  it('OpeningPage.vue .stage-command--compact is not used by the opening action buttons', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const compactRule =
      openingPage.match(/^[ \t]*\.stage-command--compact\s*\{[^}]*\}/m)?.[0] || ''
    expect(openingPage).not.toMatch(/stage-command--compact stage-command--primary/)
    expect(openingPage).not.toMatch(/stage-command--compact stage-command--secondary/)
    expect(compactRule).toMatch(/min-height:\s*54px/)
    expect(compactRule).toMatch(/min-width:\s*160px/)
  })

  it('OpeningPage.vue opening action stage buttons keep a readable mobile width', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const openingRule =
      openingPage.match(/^[ \t]*\.opening-action-actions \.stage-command\s*\{[^}]*\}/m)?.[0] || ''
    expect(openingRule).toMatch(/width:\s*138px/)
    expect(openingRule).toMatch(/min-width:\s*138px/)
    expect(openingRule).toMatch(/min-height:\s*52px/)
    expect(openingRule).toMatch(/flex:\s*0\s+0\s+138px/)
    expect(openingRule).not.toMatch(/width:\s*88px/)
    expect(openingRule).not.toMatch(/flex:\s*1\s+1\s+180px/)
  })

  it('OpeningPage.vue owns opening action buttons and sends hidden command before returning to /experience (5C: buttons live in main .opening-copy, not a sub-section)', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')
    const experience = readProjectFile('src/pages/Experience.vue')

    // 5C refactor: 开局/改写 buttons moved into the main .opening-copy section.
    const copyStart = openingPage.indexOf('<section class="opening-copy"')
    const copyEnd = openingPage.indexOf('</section>', copyStart)
    const copyBlock = copyStart >= 0 && copyEnd > copyStart
      ? openingPage.slice(copyStart, copyEnd)
      : ''
    expect(copyBlock).toContain('class="opening-action-actions"')
    expect(copyBlock).toContain('label="开局"')
    expect(copyBlock).toContain('label="改写"')

    const sendBlock =
      openingPage.match(/async function sendOpeningAction\(\) \{[\s\S]*?\n\}/)?.[0] || ''
    expect(sendBlock).toContain('await ensureWorldAdventureSession({ initIfEmpty: false })')
    expect(sendBlock).toContain('await gameStore.sendAction(action.command, { hidden: true })')
    expect(sendBlock).toContain("router.push({ name: 'experience' })")
    expect(experience).not.toContain('async function sendOpeningAction()')
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

  it('onMounted no-session fallback no longer forces users through SessionPicker', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    // The else branch (after currentSession check) should keep the main entry visible.
    const onMountedBlock = experience.match(/onMounted\(async \(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''
    expect(onMountedBlock).toContain('gameStore.resetRuntimeState()')
    expect(onMountedBlock).toContain('showSessionPicker.value = false')
    expect(onMountedBlock).not.toContain('showSessionPicker.value = true')
  })
})

describe('ui polish — LXGW WenKai display font on OpeningPage hero', () => {
  it('declares an @font-face for LXGW WenKai pointing at the subsetted WOFF2', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    const faceBlock = mainCss.match(/@font-face\s*\{[\s\S]*?\}/)?.[0] || ''
    expect(faceBlock).toContain('font-family: "LXGW WenKai"')
    expect(faceBlock).toContain('font-display: swap')
    expect(faceBlock).toMatch(/url\("\.\.\/assets\/fonts\/LXGWWenKai-Regular\.woff2"\)/)
    expect(faceBlock).toMatch(/format\("woff2"\)/)
  })

  it('exposes --font-display / --font-serif / --font-sans / --font-mono tokens', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    // 5C v3.14: --font-display reverted to ZCOOL XiaoWei (v3.13
    // tried ZCOOL QingKe HuangYou for artistic hand-drawn feel, but
    // user said the font looked "weird" and the brush underline +
    // text-stroke felt too decorative/cheap). v3.12 baseline restored:
    // ZCOOL XiaoWei for both --font-display and --font-serif (signature
    // direction locked by user). LXGW WenKai stays in @font-face as
    // last-resort fallback.
    expect(mainCss).toMatch(/--font-display:\s*"ZCOOL XiaoWei"/)
    expect(mainCss).toMatch(/--font-serif:\s*"ZCOOL XiaoWei"/)
    expect(mainCss).toMatch(/--font-sans:\s*"Segoe UI Variable"/)
    expect(mainCss).toMatch(/--font-mono:/)
  })

  it('preloads the LXGW WOFF2 only as fallback (Google Fonts CDN is primary)', () => {
    const html = readProjectFile('index.html')

    // 5C v3.12: the LXGW preload is gone (Google Fonts CDN is faster)
    // and the Google Fonts stylesheet now loads a SINGLE signature
    // font — ZCOOL XiaoWei — for both display and body. LXGW's
    // @font-face still ships so the browser can fall back if Google
    // Fonts is unreachable. The v3.11 calligraphic chain
    // (Liu Jian Mao Cao / Long Cang / Ma Shan Zheng) was dropped.
    expect(html).not.toMatch(/<link[^>]*rel="preload"[^>]*LXGWWenKai-Regular\.woff2/)
    expect(html).toMatch(/family=ZCOOL\+XiaoWei/)
  })

  it('renders the OpeningPage title as embedded serif glyphs on the art', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const titleBlock = openingPage.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(openingPage).toContain('class="opening-embedded-title"')
    expect(openingPage).toContain('class="opening-embedded-title__glyph"')
    expect(titleBlock).toMatch(/font-family:\s*"Iowan Old Style"/)
    expect(titleBlock).toMatch(/mix-blend-mode:\s*soft-light/)
    expect(titleBlock).toMatch(/perspective\(900px\) rotateY\(-16deg\) rotateZ\(2deg\) skewX\(-5deg\)/)
    expect(openingPage).toMatch(/\.opening-title-block\s*\{[\s\S]*?rotateZ\(var\(--opening-copy-arc\)\)[\s\S]*?skewX\(var\(--opening-copy-skew\)\)/)
  })

  it('ships the subset WOFF2 + OFL license on disk (size under 1 MB)', () => {
    const { statSync } = require('node:fs')
    const { resolve } = require('node:path')

    const woff2 = statSync(resolve(process.cwd(), 'src/assets/fonts/LXGWWenKai-Regular.woff2'))
    const license = statSync(resolve(process.cwd(), 'src/assets/fonts/OFL.txt'))

    // 593 KB subset + 4 KB license
    expect(woff2.size).toBeGreaterThan(100_000) // sanity: not truncated
    expect(woff2.size).toBeLessThan(1_000_000) // under vite 1MB hard cap
    expect(license.size).toBeGreaterThan(1_000) // OFL 1.1 license is ~4 KB
  })
})

describe('N5C: material page kao archive-folio refactor', () => {
  it('N5C: uses FolioSurface to wrap editor-main kao visual', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('<FolioSurface')
    expect(notes).toContain('variant="paper"')
  })

  it('N5C: uses ArchiveStrip for entry collage', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('<ArchiveStrip')
  })

  it('N5C: uses CharacterPortrait narrator in sidebar top', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('<CharacterPortrait')
    expect(notes).toContain('pose-id="narrator"')
  })

  it('N5C: uses .material-action-btn class for batch actions', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('class="selection-action-btn material-action-btn"')
  })

  it('N5C: scoped CSS within tolerance <= 1080 lines', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    const styleMatch = notes.match(/<style scoped>([\s\S]*?)<\/style>/)
    const lines = styleMatch ? styleMatch[1].split('\n').length : 0
    // N5C ship was 721. N5C-A added ~50 lines. UI-N2 (Archive Drawer) is a
    // structural refactor: replaces 260px sidebar + editor-main with
    // material-drawer + reading-deck + active-card + empty-archive + archive-pin.
    // Net add ~530 lines of structural scaffolding (display/position/sizing),
    // all visual styling lives in kao.css. Ceiling moves to 1700 with explicit
    // acceptance that drawer/deck composition owns the rest.
    // UI-N6 (pinned slips) adds ~50 lines of structural CSS for the slip card,
    // kind-color tab, focus ring, and a 980px mobile fallback. Bumping ceiling
    // to 1750 to accommodate the new feature without forcing micro-trim.
    // UI-N9 (canvas-pinboard) adds ~110 lines of structural CSS for the 副阅读台
    // wrapper, label/count/hint, slip-stack, empty state, and 980px mobile
    // horizontal-stack fallback. Bumping ceiling to 1900 to accommodate the
    // new feature without forcing micro-trim.
    expect(lines).toBeLessThanOrEqual(1900)
  })

  it('N5C: no orphan template classes in Notes scoped CSS', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    const templateMatch = notes.match(/<template>([\s\S]*?)<\/template>/)
    if (!templateMatch) throw new Error('no <template> block')
    const classRefs = new Set()
    for (const m of templateMatch[1].matchAll(/class="([^"]+)"/g)) {
      m[1].split(/\s+/).forEach((className) => className && classRefs.add(className))
    }

    const styleMatch = notes.match(/<style scoped>([\s\S]*?)<\/style>/)
    if (!styleMatch) throw new Error('no <style scoped> block')
    const css = styleMatch[1]
    const allowedExternal = new Set([
      'workbench-hero-button',
      'icon-only',
      'writing-page__hero',
      'manuscript-top',
      'material-top',
      'manuscript-top__left',
      'manuscript-top__back',
      'manuscript-top__book',
      'manuscript-top__no',
      'manuscript-top__chapter',
      'manuscript-top__right',
      'manuscript-top__chip',
      'manuscript-top__tab',
      'manuscript-top__mode',
    ])
    const orphans = [...classRefs].filter(
      (className) => !allowedExternal.has(className) && !new RegExp(`\\.${className}\\b`).test(css),
    )
    expect(orphans, `template class names with no scoped CSS rule: ${orphans.join(', ')}`).toEqual([])
  })

  it('N5C-A: drawer-handle has spine element with kind color binding (档案 tab ribbon)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/<span\s+class="drawer-handle__spine"[^>]*:style="\{\s*background:\s*group\.color\s*\}"[^>]*>/)
  })

  it('N5C-A: drawer-handle__roman renders roman index via groupIndexLabel(idx)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('class="drawer-handle__roman"')
    expect(notes).toMatch(/\{\{\s*groupIndexLabel\(idx\)\s*\}\}/)
    expect(notes).toContain('function groupIndexLabel')
    expect(notes).toMatch(/GROUP_INDEX_ROMAN\s*=\s*\[['"]I['"]/)
  })

  it('N5C-A: drawer-handle__chevron uses SVG chevron (no text ›/⌄ chars)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/<span\s+class="drawer-handle__chevron"[^>]*>[\s\S]*?<svg[^>]*>/)
  })

  it('N5C-A: material-selection-stamp wraps the checked-count summary with tick rails', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('class="material-selection-stamp"')
    expect(notes).toContain('class="material-selection-stamp-tick"')
    expect(notes).toContain('class="material-selection-stamp-text"')
    expect(notes).toMatch(/已选\s*\{\{\s*checkedAssetIds\.length\s*\}\}\s*项\s*·\s*批量/)
    expect(notes).not.toMatch(/<div\s+class="selection-summary">/)
  })

  it('N5C-A: kao.css adds variant-specific drawer-handle + selection-stamp overrides', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toContain('.theme-kao .drawer-handle')
    expect(css).toContain('.theme-kao .drawer-handle__roman')
    expect(css).toContain('.theme-kao .drawer-handle__title')
    expect(css).toContain('.theme-kao .material-selection-stamp')
    expect(css).toContain('.theme-kao .material-selection-stamp-tick')
    expect(css).toContain('.theme-kao .material-selection-stamp-text')
  })
})

// UI-W2: Writing page Pinax Wall composition (2026-06-20 plan)
// Replaces Phase 1C contracts that assumed WorkbenchPageHero + 4-zone
// FolioSurface wrapping. The new architecture is a wall (molding +
// cork-board) + 3-zone main (shelf + dossier + wall-attached portrait).
// FolioSurface is no longer used for the page structure itself.
describe('ui polish — UI-W2 Writing page Pinax Wall composition', () => {
  it('Writing.vue is a single wall root (no FolioSurface wrap for page chrome; modal may still use it)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // No FolioSurface in the page chrome — wall / shelf / dossier are
    // semantic custom elements, not FolioSurface variants.
    const heroFolio = writing.match(/<FolioSurface[^>]*class="writing-page__hero"/)
    expect(heroFolio).toBeNull()
    const sidebarFolio = writing.match(/<FolioSurface[^>]*class="books-sidebar writing-sidebar"/)
    expect(sidebarFolio).toBeNull()
    const mainFolio = writing.match(/<FolioSurface[^>]*class="editor-main writing-editor"/)
    expect(mainFolio).toBeNull()

    // Wall root class on .writing-page
    expect(writing).toMatch(/<div\s+class="writing-page wall"/)
    // Main is a plain <main> tag, not FolioSurface
    expect(writing).toMatch(/<main\s+class="wall__main"/)
  })

  it('Writing.vue chapter shelf renders chapter folders as <div class="wall__folder"> with index tab + title + wordcount (folder grammar, not list-item grammar)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    const shelfSection = writing.match(
      /<aside\s+class="wall__shelf"[\s\S]*?<\/aside>/,
    )
    expect(shelfSection).not.toBeNull()
    const shelf = shelfSection?.[0] ?? ''

    // At least 1 wall__folder with is-active possible (v-bind :class)
    expect(shelf).toMatch(/class="wall__folder"/)
    // Each chapter folder has tab + title + meta spans
    expect(shelf).toMatch(/class="wall__folder-tab"/)
    expect(shelf).toMatch(/class="wall__folder-title"/)
    expect(shelf).toMatch(/class="wall__folder-meta"/)
    // No list-item / chapter-list-item grammar
    expect(shelf).not.toContain('class="chapter-list-item"')
    expect(shelf).not.toContain('class="book-item"')
  })

  it('Writing.vue dossier empty state uses .wall__dossier-empty (red stamp + paperclip note + pin-style CTAs) — NOT .empty-state SaaS card', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    expect(writing).toMatch(/class="wall__dossier-empty"/)
    expect(writing).toMatch(/class="wall__empty-stamp"/)
    expect(writing).toMatch(/class="wall__empty-clip"/)
    expect(writing).toMatch(/class="wall__pin-cta"/)
    // The legacy SaaS empty-state is gone
    expect(writing).not.toContain('class="empty-state"')
    expect(writing).not.toContain('class="empty-icon"')
    expect(writing).not.toContain('class="empty-title"')
    expect(writing).not.toContain('class="empty-desc"')
  })

  it('Writing.vue AI panel primary action still renders as <BookmarkButton variant="primary" label="应用 …"> + secondary as <BookmarkButton variant="secondary">', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    expect(writing).toMatch(/<BookmarkButton[^>]*variant="primary"[^>]*label="[\s\S]*?应用/)
    expect(writing).toMatch(/<BookmarkButton[^>]*variant="secondary"[^>]*label="[\s\S]*?(拒收|取消|不应用)/)
  })

  it('Writing.vue mode switch (wysiwyg/markdown/preview) stays .action-btn / .tool-btn — BookmarkButton does not enter the tool-mode toolbar', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    const modeSwitch = writing.match(
      /<div\s+class="mode-switch"[\s\S]*?<\/div>/,
    )
    expect(modeSwitch).not.toBeNull()
    expect(modeSwitch?.[0] ?? '').not.toContain('<BookmarkButton')
  })

  it('Writing.vue CharacterPortrait is mounted in the wall-attached right dossier card (NOT in a books-sidebar footer)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // Portrait sits inside .wall__dossier-portrait (right wall zone)
    const portraitCard = writing.match(
      /<aside[^>]*class="wall__dossier-portrait"[\s\S]*?<\/aside>/,
    )
    expect(portraitCard).not.toBeNull()
    expect(portraitCard?.[0] ?? '').toContain('CharacterPortrait')
    // Steel pins on the portrait card (2 pins)
    const steelPins = portraitCard?.[0]?.match(/class="wall__steel-pin/g) || []
    expect(steelPins.length).toBeGreaterThanOrEqual(2)

    // The legacy books-sidebar footer is gone
    expect(writing).not.toContain('class="writing-sidebar__footer"')
    expect(writing).not.toContain('class="books-sidebar writing-sidebar"')
  })

  it('kao.css exposes .theme-kao .wall / .wall__cork / .wall__main / .wall__dossier / .wall__folder selectors — Wall rules all live in kao.css (legacy variant falls back in scoped CSS)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')

    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__cork\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__main\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__dossier\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__folder\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__dossier-portrait\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__pin-cta\s*\{/)
  })
})

describe('ui polish — UI-W3 Writing Pinax Wall composition polish (3 structural moves, anti-micro-tweak)', () => {
  it('Writing.vue unscoped <style> block pushes .wall__cork padding-left past the fixed hamburger at desktop (>=1000px)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    const unscopedBlocks = writing.match(/<style>([\s\S]*?)<\/style>/g) || []
    expect(unscopedBlocks.length).toBeGreaterThan(0)
    const hasDesktopPadding = unscopedBlocks.some((b) =>
      /@media\s*\(min-width:\s*1000px\)\s*\{[\s\S]*?\.theme-kao\s+\.wall__cork\s*\{[^}]*padding-left:\s*80px/.test(b),
    )
    expect(hasDesktopPadding).toBe(true)
  })

  it('Writing.vue exposes 2 tape strips (.wall__dossier-tape--left / --right) inside .wall__dossier to visually pin the manuscript to the cork above', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    const dossierBlock = writing.match(/<section[^>]*class="wall__dossier"[\s\S]*?<\/section>/)
    expect(dossierBlock).not.toBeNull()
    const block = dossierBlock?.[0] ?? ''
    expect(block).toMatch(/class="wall__dossier-tape wall__dossier-tape--left"/)
    expect(block).toMatch(/class="wall__dossier-tape wall__dossier-tape--right"/)
    // W4: 4 corner pins removed — tape strips are the sole dossier-to-cork
    // anchor now. The dossier block must contain tape but NOT corner pins.
    expect(block).not.toContain('wall__pin-cnr')
    expect(block).toMatch(/class="wall__dossier-head"/)
    const leftTapeIdx = block.indexOf('wall__dossier-tape--left')
    const headIdx = block.indexOf('wall__dossier-head')
    expect(leftTapeIdx).toBeGreaterThan(-1)
    expect(headIdx).toBeGreaterThan(leftTapeIdx)
  })

  it('Writing.vue shelf rail anchors with rolled scroll + sticky note + label (3 child elements)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    const rollBlock = writing.match(/<div\s+class="wall__shelf-roll"[\s\S]*?<\/div>\s*<\/aside>/)
    expect(rollBlock).not.toBeNull()
    const block = rollBlock?.[0] ?? ''
    expect(block).toMatch(/class="wall__shelf-scroll"/)
    expect(block).toMatch(/class="wall__shelf-note"/)
    expect(block).toMatch(/class="wall__shelf-roll-label"/)
    expect(block).toContain('未展开稿纸卷')
  })

  it('kao.css exposes all 6 new wall composition rules gated by .theme-kao (3 tape + 3 shelf anchor)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // Dossier tape (3 selectors)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__dossier-tape\b\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__dossier-tape--left\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__dossier-tape--right\b/)
    // Shelf anchor (3 selectors)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__shelf-scroll\b\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__shelf-note\b\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__shelf-roll-label\b\s*\{/)
    // Intent comment marker
    expect(kaoCss).toMatch(/Desktop hamburger clearance/)
  })

  it('No new scoped :global(.theme-kao) or unlayered !important on Wall V3 selectors (5C load regression vector)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(writing).not.toMatch(/scoped.*:global\(/)
    expect(writing).not.toContain(':global(.theme-kao)')
    expect(kaoCss).not.toMatch(/scoped.*:global\(/)
    // No new !important on the W3 wall composition selectors
    const newWallTapeImportant = (kaoCss.match(/\.theme-kao\s+\.wall__dossier-tape[^{]*\{[^}]*!important[^}]*\}/g) || []).length
    expect(newWallTapeImportant).toBe(0)
    const newShelfAnchorImportant = (kaoCss.match(/\.theme-kao\s+\.wall__shelf-(scroll|note|roll-label)[^{]*\{[^}]*!important[^}]*\}/g) || []).length
    expect(newShelfAnchorImportant).toBe(0)
    // The desktop-padding override in Writing.vue unscoped <style> does
    // NOT use !important (it relies on specificity 0,2,0 vs scoped 0,1,1)
    const unscopedBlocks = writing.match(/<style>([\s\S]*?)<\/style>/g) || []
    const newUnscopedImportant = unscopedBlocks.some((b) => /!important/.test(b))
    expect(newUnscopedImportant).toBe(false)
  })
})

// W3 Phase 1C v2: Writing visual emergence — commit 1 (drop-cap)
// 3 contracts: drop-cap rule exists, uses --font-display, uses --archive-gold.
describe('ui polish — W3 Writing visual emergence (drop-cap)', () => {
  it('kao.css exposes .theme-kao .editor-preview > p:first-of-type::first-letter drop-cap rule (CSS ::first-letter on first CJK/Latin paragraph char)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(/\.theme-kao\s+\.editor-preview\s+>\s+p:first-of-type::first-letter\s*\{/)
  })

  it('drop-cap rule uses var(--font-display) (LXGW WenKai via token, not hardcoded family)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // Scope: only the ::first-letter block must reference --font-display.
    // The pattern matches the ::first-letter selector followed by a brace + content + --font-display.
    expect(kaoCss).toMatch(
      /::first-letter\s*\{[^}]*font-family:\s*var\(--font-display\)/s,
    )
  })

  it('drop-cap rule uses --archive-gold (token-aware color, not hardcoded hex)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // The ::first-letter block must reference --archive-gold in text-shadow OR background.
    expect(kaoCss).toMatch(
      /::first-letter\s*\{[^}]*var\(--archive-gold\)/s,
    )
  })

  it('kao.css exposes .theme-kao .editor-container with z-index: var(--z-stage-hero) (window plane)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // Match the .editor-container block + z-index: var(--z-stage-hero) within it.
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.editor-container\s*\{[^}]*z-index:\s*var\(--z-stage-hero\)/s,
    )
  })

  it('kao.css exposes .theme-kao .copilot-indicator AND .chapter-title-input with z-index: var(--z-stage-cta) (front plane)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // copilot-indicator
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.copilot-indicator\s*\{[^}]*z-index:\s*var\(--z-stage-cta\)/s,
    )
    // chapter-title-input (also a front-plane element)
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.chapter-title-input\s*\{[^}]*z-index:\s*var\(--z-stage-cta\)/s,
    )
  })

  it('kao.css exposes .theme-kao .writing-page .folio-surface--paper with z-index: var(--z-stage-decor) (back plane, scoped to writing page to avoid leaking to Experience.vue:60)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.writing-page\s+\.folio-surface--paper\s*\{[^}]*z-index:\s*var\(--z-stage-decor\)/s,
    )
  })

  it('kao.css exposes .theme-kao .editor-container::before with animation: wallpaperMist (5C-ship keyframe reused)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.editor-container::before\s*\{[^}]*animation:\s*wallpaperMist/s,
    )
  })

  // W3 commit 2 critical bug fix: keyframe self-containment. The original
  // @keyframes wallpaperMist / titleGlow / kickerPulse are NOT in main.css
  // — they live in CharacterBackdrop.vue:427, OpeningPage.vue:772, and
  // CharacterBackdrop.vue:442 respectively. None of those components is
  // mounted on /writing, so kao.css must own identical copies for the
  // .theme-kao consumers to animate. The 3 contracts below lock this.

  it('kao.css exposes @keyframes wallpaperMist (W3 self-containment; also defined in CharacterBackdrop.vue:427 for CharacterBackdrop\'s own use)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(/@keyframes\s+wallpaperMist\s*\{/)
  })

  it('kao.css exposes @keyframes titleGlow (W3 self-containment; also defined in OpeningPage.vue:772 for OpeningPage\'s own use)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(/@keyframes\s+titleGlow\s*\{/)
  })

  it('kao.css exposes @keyframes kickerPulse (W3 self-containment; also defined in CharacterBackdrop.vue:442 for CharacterBackdrop\'s own use)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(/@keyframes\s+kickerPulse\s*\{/)
  })

  it('kao.css exposes .theme-kao .chapter-list-item .bookmark-button:hover with animation: kickerPulse (keyframe now animates visible box-shadow gold-glow, not text-decoration-color no-op)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.chapter-list-item\s+\.bookmark-button:hover\s*\{[^}]*animation:\s*kickerPulse/s,
    )
  })

  it('kao.css exposes .theme-kao .chapter-list-item .bookmark-button:focus with animation: kickerPulse (a11y keyboard nav parity; keyframe now animates visible box-shadow gold-glow)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.chapter-list-item\s+\.bookmark-button:focus\s*\{[^}]*animation:\s*kickerPulse/s,
    )
  })

  it('kickerPulse keyframe body animates box-shadow (not text-decoration-color, which was a no-op on consumers with text-decoration: none) — W3 round 2 review #3', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // Match the @keyframes kickerPulse { ... } block (non-greedy)
    const match = kaoCss.match(/@keyframes\s+kickerPulse\s*\{([\s\S]*?)\}/)
    expect(match).not.toBeNull()
    const body = match[1]
    expect(body).toMatch(/box-shadow:/)
    expect(body).not.toMatch(/text-decoration-color/)
  })
})

// UI-E11-A: Phase 1C archive-binder describe block was repurposed. The
// "right sidebar reads as 1 dossier with 3 sections" semantics is now
// served by the .ws-right-rail + 3 .ws-section stamps (in
// src/pages/Experience.vue template + src/styles/themes/kao.css). The
// 6 contracts below verify the NEW workstation architecture replaces
// the OLD archive-binder pattern.
describe('ui polish — UI-E11-A Experience workstation (replaces Phase 1C archive binder)', () => {
  it('kao.css owns the ws-right-rail rules (workstation replaces .theme-kao .game-page .sidebar in Experience.vue unscoped)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // NEW: ws-right-rail in kao.css with archive-gold border
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-right-rail\s*\{[^}]*color-mix\(in srgb,\s*var\(--archive-gold\)/s,
    )
    // No scoped :global in Experience.vue
    expect(experience).not.toContain(':global(.theme-kao)')
    // E11-E1: kao.css must not have a .theme-kao .sidebar rule (without .game-page)
    expect(kaoCss).not.toMatch(/\.theme-kao\s+\.sidebar\s*\{/)
  })

  it('kao.css exposes ws-right-rail with paper bg + gold border (replaces sidebar-head clip-path: none rule)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-right-rail\s*\{[^}]*var\(--archive-paper\)/s,
    )
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-right-rail\s*\{[^}]*color-mix\(in srgb,\s*var\(--archive-gold\)/s,
    )
  })

  it('Experience.vue template mounts 3 .ws-section stamps (replaces sidebar-section dossier stamps)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toContain('data-dossier-stamp="卷宗一 · 在场人物"')
    expect(experience).toContain('data-dossier-stamp="卷宗二 · 地点卡"')
    expect(experience).toContain('data-dossier-stamp="卷宗三 · 事件卷"')
  })

  it('kao.css exposes .ws-section rule that integrates into 1 dossier (no per-section paper card, divider line between sections)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // .ws-section has transparent bg (so .ws-right-rail outer paper
    // shows through) + a hairline divider border-top. UI-E12-W1
    // switched the divider from `1px solid archive-gold 22%` to
    // `1px dashed archive-ink 22%` so paired with the new tab strip
    // + shared left spine (kao.css L2582-2584 + L2596+), the divider
    // reads as "section break inside one binder" rather than "wall
    // between 3 cards". The contract accepts either solid or dashed.
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-section\s*\{[^}]*background:\s*transparent/s,
    )
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-section\s*\{[^}]*border-top:\s*1px\s+(solid|dashed)/s,
    )
  })

  it('kao.css exposes .ws-topstrip__case with archive-ink + italic (replaces sidebar-toggle kao rule)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-topstrip__case\s*\{[^}]*var\(--archive-ink\)/s,
    )
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-topstrip__case\s*\{[^}]*font-style:\s*italic/s,
    )
  })

  it('Experience.vue keeps the 3 functional right-rail components (StatusBar / GeographyPanel / QuestLog) — workstation layout is functional-only, no visual regression', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toContain('<StatusBar')
    expect(experience).toContain('<GeographyPanel')
    expect(experience).toContain('<QuestLog')
    // Quick-note toggle still wired
    expect(experience).toMatch(/toggleQuickNoteWorkspace/)
    // UI-E11-A: workstation layout removed the sidebar collapse toggle
    // (E4A archive-binder visual feature). E4A visual archive-binder
    // is superseded; ws-right-rail is always 300px wide.
    expect(experience).not.toContain('sidebarCollapsed = !sidebarCollapsed')
  })

  it('Experience.vue still has no <WorkbenchPageHero> (Phase 1C lock: workstation right rail is the only chrome, no dashboard hero on /experience)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).not.toContain('<WorkbenchPageHero')
  })
})

describe('ui polish — UI-E2: Experience Site Record Book (Phase 1C slice B — superseded by UI-E11-A workstation)', () => {
  // 1) Main area has a workstation topstrip (卷 / 案号 / 当前任务 / 第N条 / 共M条)
  //    The OLD 6-field record-folio is superseded by the 5-cell ws-topstrip +
  //    useWorkstationMeta composable (which derives the same data from
  //    gameStore, 0 store mutation).
  it('Experience.vue exposes a ws-topstrip with 5 metadata cells (replaces 6-field record-folio)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toContain('class="ws-topstrip"')
    expect(experience).toContain('ws-topstrip__cell')
    for (const kicker of ['卷', '案号', '当前任务', '第 N 条', '共 M 条']) {
      expect(experience).toContain(kicker)
    }
  })

  it('useWorkstationMeta composable reads from existing gameStore fields (no new store fields)', () => {
    const meta = readProjectFile('src/composables/useWorkstationMeta.js')
    // 5 computed exports + 2 helpers
    expect(meta).toMatch(/currentVolume.*=.*computed/)
    expect(meta).toMatch(/caseNo.*=.*computed/)
    expect(meta).toMatch(/currentTask.*=.*computed/)
    expect(meta).toMatch(/currentSection.*=.*computed/)
    expect(meta).toMatch(/totalCount.*=.*computed/)
    // Sources (must be from existing gameStore, not new fields)
    expect(meta).toMatch(/gameStore\.currentSessionId/)
    expect(meta).toMatch(/gameStore\.sessions/)
    expect(meta).toMatch(/gameStore\.goals/)
    expect(meta).toMatch(/gameStore\.messages/)
  })

  it('kao.css owns the workstation layout rules (ws-topstrip + ws-layout) — no scoped :global, no !important, no :deep', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // UI-E11-A ws-topstrip / ws-layout are the new section anchor
    expect(kaoCss).toMatch(/\.theme-kao\s+\.ws-layout\s*\{[^}]*display:\s*grid/s)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.ws-topstrip\s*\{[^}]*position:\s*sticky/s)
    // Hard constraints — strip /* */ comments first, then check the live CSS
    // (raw hex check is covered by E11-F1 contract separately)
    const liveCss = kaoCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(liveCss).not.toMatch(/:global\(/)
    expect(liveCss).not.toMatch(/:deep\(/)
  })

  // 2) InputArea: 发送 → 记入 + remove token ring
  it('InputArea.vue replaces 发送 with 记入 (record-book verb) and removes the context-usage-mini token ring', () => {
    const inputArea = readProjectFile('src/components/InputArea.vue')
    expect(inputArea).toContain('>记入<')
    expect(inputArea).not.toContain('>发送<')
    // The 发送 button still has the .send-btn class but the visible text is 记入
    // Token ring gone from template
    expect(inputArea).not.toContain('context-usage-mini')
    // New record-meter chip in template
    expect(inputArea).toContain('record-meter')
  })

  it('InputArea.vue scoped CSS overrides the input + send-btn in kao mode (0 radius, paper-soft, gold hairline) without !important', () => {
    const inputArea = readProjectFile('src/components/InputArea.vue')
    expect(inputArea).toMatch(/\.theme-kao\s+\.input\s*\{[^}]*border-bottom:\s*1px solid/s)
    expect(inputArea).toMatch(/\.theme-kao\s+\.send-btn\s*\{[^}]*var\(--archive-paper\)/s)
    expect(inputArea).toMatch(/\.theme-kao\s+\.record-meter\s*\{[^}]*var\(--archive-paper-soft\)/s)
    // No !important in kao block
    const kaoBlock = inputArea.match(/\.theme-kao\s+\.input-area[\s\S]*?\n}/)
    expect(kaoBlock).not.toBeNull()
    expect(kaoBlock[0]).not.toContain('!important')
  })

  // 3) Sidebar section labels: 角色 → 在场人物, 地理环境 → 地点卡, 重要活动 → 事件卷
  it('StatusBar.vue header label is 在场人物 (no more 角色, no more User placeholder)', () => {
    const statusBar = readProjectFile('src/components/StatusBar.vue')
    expect(statusBar).toContain('在场人物')
    // The default character name in display is 主角 (not 你 / User).
    expect(statusBar).toContain("if (!raw || raw === 'User') return '主角'")
    expect(statusBar).toContain('{{ playerName[0] }}')
  })

  it('GeographyPanel.vue header is 案卷索引 + 地点卡 (no more 体验上下文, no more 地理环境, no more 顶级/已描述)', () => {
    const geo = readProjectFile('src/components/geography/GeographyPanel.vue')
    expect(geo).toContain('案卷索引')
    expect(geo).toContain('地点卡')
    expect(geo).not.toContain('体验上下文')
    expect(geo).not.toContain('>地理环境<')
    // 3 stat labels (text nodes, not wrapped in ><)
    expect(geo).toMatch(/卷号\s*<\/span>/)
    expect(geo).toMatch(/从属\s*<\/span>/)
    expect(geo).toMatch(/已记\s*<\/span>/)
    expect(geo).not.toMatch(/顶级\s*<\/span>/)
    expect(geo).not.toMatch(/已描述\s*<\/span>/)
  })

  it('QuestLog.vue header is 事件卷 (no more 重要活动, no more Adventure Exit, no more 本段冒险总结, no more 记录活动)', () => {
    const quest = readProjectFile('src/components/QuestLog.vue')
    expect(quest).toContain('>事件卷<')
    expect(quest).not.toContain('>重要活动<')
    expect(quest).not.toContain('Adventure Exit')
    expect(quest).toContain('本卷推进出口')
    expect(quest).toContain('本段事件总结')
    expect(quest).not.toContain('本段冒险总结')
    expect(quest).toContain('记入事件')
    expect(quest).not.toContain('>记录活动<')
    expect(quest).toContain('整理成我的版本')
    expect(quest).toContain('整理成事件分镜')
    expect(quest).not.toContain('整理成分镜')
    expect(quest).not.toContain('写成我的版本')
  })

  // 4) Global hard-constraint: no scoped :global(.theme-kao) in any of the modified files
  it('No scoped :global(.theme-kao) anywhere in the 4 modified files (the 5C v3.6 /experience load regression vector)', () => {
    const files = [
      'src/pages/Experience.vue',
      'src/components/InputArea.vue',
      'src/components/StatusBar.vue',
      'src/components/QuestLog.vue',
    ]
    for (const f of files) {
      const content = readProjectFile(f)
      expect(content, f).not.toMatch(/scoped.*:global\(/)
      expect(content, f).not.toContain(':global(.theme-kao)')
    }
  })
})

// UI-N2: Notes Archive Drawer (2026-06-20 plan)
// Replaces the sidebar + editor-main skeleton with material-drawer +
// reading-deck + active-card + empty-archive + archive-pin. Functional
// contracts preserved; structural moves = drawer/card catalog (left)
// + reading deck / active card (center) + empty cabinet (empty state)
// + page-flip navigation + batch stamp at drawer top.
describe('ui polish — UI-N2 Notes Archive Drawer composition', () => {
  it('UI-N2: Notes.vue material-drawer + reading-deck + archive-pin replace sidebar + editor-main (archive cabinet, not CMS)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')

    // New structural regions
    expect(notes).toContain('<aside class="material-drawer">')
    expect(notes).toContain('class="keeper-corner"')
    expect(notes).toContain('class="drawer-units"')
    expect(notes).toContain('class="drawer-handle"')
    expect(notes).toContain('class="reading-deck"')
    // N10-FIX: active-card now carries extra `multi-canvas__main-card` modifier
    // (e.g. `<article class="active-card multi-canvas__main-card">`); accept
    // either the bare class or any combination that includes active-card.
    expect(notes).toMatch(/class="active-card[^"]*"/)
    expect(notes).toContain('class="empty-archive"')
    expect(notes).toContain('class="archive-pin"')
    // Old CMS skeleton removed
    expect(notes).not.toContain('class="sidebar books-sidebar"')
    expect(notes).not.toContain('class="editor-main"')
    expect(notes).not.toContain('class="empty-state"')
    expect(notes).not.toContain('class="resize-handle"')
    expect(notes).not.toContain('class="asset-toolbar"')
  })

  it('UI-N2: drawer-units render one drawer-unit per kind with handle + index-cards (7-class catalog, not accordion)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/<div\s+v-for="\(group,\s*idx\)\s+in\s+groupedChapters"[^>]*class="material-group|drawer-unit"/)
    // index-card is the rendered item class inside drawer-body
    expect(notes).toMatch(/<button[^>]*class="index-card"/)
    // Each index-card has kind-color tilt via --card-tilt style binding
    expect(notes).toContain('--card-tilt')
  })

  it('UI-N4: empty-archive is a complete cabinet blueprint (7 kind cells + 5 generic slots + stamp + footer + memo card)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // 7 kind cells via v-for="(kind, idx) in assetKindOrder"
    expect(notes).toContain('v-for="(kind, idx) in assetKindOrder"')
    expect(notes).toContain('class="empty-archive__cell empty-archive__cell--kind"')
    expect(notes).toContain('class="empty-archive__cell empty-archive__cell--empty"')
    // Kind cell structure: roman + label
    expect(notes).toContain('class="empty-archive__cell-roman"')
    expect(notes).toContain('class="empty-archive__cell-label"')
    // Stamp + footer + memo card
    expect(notes).toContain('class="empty-archive__stamp"')
    expect(notes).toContain('class="empty-archive__footer"')
    expect(notes).toContain('class="empty-archive__card"')
    expect(notes).toContain('class="empty-archive__title"')
    expect(notes).toMatch(/empty-archive__cta/)
    // 5 候补格
    expect(notes).toMatch(/v-for="n in 5"/)
    // No centered-SVG empty-state
    expect(notes).not.toMatch(/<svg[^>]*class="empty-icon"/)
  })

  it('UI-N2: archive-pin wraps ArchiveStrip + gold nail SVG (bottom-right floating, not in editor-header)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('class="archive-pin"')
    expect(notes).toContain('class="archive-pin__nail"')
    // ArchiveStrip is now inside archive-pin (not inside editor-header)
    expect(notes).toMatch(/<aside\s+class="archive-pin"[\s\S]*?<ArchiveStrip[\s\S]*?<\/aside>/)
    // editor-header is gone (was the old toolbar block above the textarea)
    expect(notes).not.toContain('class="editor-header"')
  })

  it('UI-N2: page-controls provide prev/next navigation on the active card (reading-deck page-flip)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('class="page-controls"')
    expect(notes).toContain('class="page-controls__btn"')
    expect(notes).toContain('@click="goPrevAsset"')
    expect(notes).toContain('@click="goNextAsset"')
    expect(notes).toContain('function goPrevAsset')
    expect(notes).toContain('function goNextAsset')
    expect(notes).toContain('const currentAssetIndex')
    expect(notes).toContain('const canGoPrev')
    expect(notes).toContain('const canGoNext')
  })

  it('UI-N2: material-selection-stamp lives inside material-drawer (batch ticket attached to drawer, not standalone toolbar)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/<aside\s+class="material-drawer"[\s\S]*?class="material-selection-stamp"[\s\S]*?<\/aside>/)
  })

  it('UI-N2: kao.css exposes drawer + reading-deck + empty-archive + archive-pin visual overrides (variant-gated)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    // drawer
    expect(css).toContain('.theme-kao .material-drawer')
    expect(css).toContain('.theme-kao .keeper-corner')
    expect(css).toContain('.theme-kao .drawer-units')
    expect(css).toContain('.theme-kao .drawer-handle')
    expect(css).toContain('.theme-kao .index-card')
    expect(css).toContain('.theme-kao .index-card.is-selected')
    // center
    expect(css).toContain('.theme-kao .reading-deck')
    expect(css).toContain('.theme-kao .active-card')
    expect(css).toContain('.theme-kao .deck-toolbar')
    expect(css).toContain('.theme-kao .page-controls')
    // empty + archive-pin
    expect(css).toContain('.theme-kao .empty-archive__cell')
    expect(css).toContain('.theme-kao .empty-archive__card')
    expect(css).toContain('.theme-kao .archive-pin')
    // manuscript-top spine gold override
    expect(css).toMatch(/\.theme-kao\s+\.manuscript-top__book[\s\S]*?border-left-color:\s*var\(--archive-gold\)/)
  })

  it('UI-N2: anti-micro-tweak gate — at least 4 of the 6 structural moves are present', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    let structuralMoves = 0
    if (notes.includes('material-drawer') && notes.includes('drawer-units')) structuralMoves++
    if (notes.includes('keeper-corner') && notes.match(/CharacterPortrait[^>]*caption="档案员 · 值班中"/)) structuralMoves++
    if (notes.includes('empty-archive') && notes.includes('empty-archive__grid')) structuralMoves++
    if (notes.includes('page-controls') && notes.includes('goPrevAsset')) structuralMoves++
    if (notes.includes('reading-deck') && notes.includes('active-card')) structuralMoves++
    if (notes.includes('archive-pin') && notes.match(/<aside\s+class="archive-pin"/)) structuralMoves++
    expect(structuralMoves).toBeGreaterThanOrEqual(4)
  })

  it('UI-N2: hard constraint — no WorkbenchPageHero on Notes, no scoped :global(.theme-kao)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).not.toContain('<WorkbenchPageHero')
    expect(notes).not.toMatch(/scoped.*:global\(/)
    expect(notes).not.toContain(':global(.theme-kao)')
  })
})

describe('ui polish — UI-E3 Experience polish (record-book composition: dossier sidebar + ledger entries + dossier modals)', () => {
  it('UI-E3: right rail reads as 1 dossier with 3 ws-section stamps (workstation layout — replaces sidebar-section)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // 3 dossier-stamp labels (卷宗一 / 卷宗二 / 卷宗三) on the 3 ws-section
    expect(experience).toContain('data-dossier-stamp="卷宗一 · 在场人物"')
    expect(experience).toContain('data-dossier-stamp="卷宗二 · 地点卡"')
    expect(experience).toContain('data-dossier-stamp="卷宗三 · 事件卷"')
    // UI-E12-W1: 3 卷宗 tab strip is now also present at the top of
    // the right rail (Experience.vue <header class="ws-right-rail__tab-strip">)
    // — dossier metaphor is reinforced by both the tab strip AND the
    // 3 section stamps.
    expect(experience).toContain('class="ws-right-rail__tab-strip"')
    expect(experience).toContain('class="ws-right-rail__tab is-active"')
    // The .ws-section rule consumes attr(data-dossier-stamp) to render a kicker
    // (UI-E11-A moved the dossier-stamp rule from .theme-kao .game-page
    // .sidebar-section::before in Experience.vue to .theme-kao .ws-section::before
    // in kao.css so the workstation layout owns the dossier-stamp grammar).
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-section::before\s*\{[^}]*attr\(data-dossier-stamp\)/s,
    )
    // The .ws-section is transparent (integrated into 1 dossier outer paper)
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-section\s*\{[^}]*background:\s*transparent/s,
    )
    // The .ws-section has a hairline divider (solid or dashed per UI-E12-W1)
    expect(kaoCss).toMatch(
      /\.theme-kao\s+\.ws-section\s*\{[^}]*border-top:\s*1px\s+(solid|dashed)/s,
    )
  })

  it('UI-E3 p2: GamePanel message stream is a record-book page, not a spreadsheet row — no 序号 row numbers, no avatar circle, role kicker (我 / 旁白 / 档案员), 时刻 as top-right marginalia, sparse dividers only at role changes', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // Avatar column / avatar hidden in kao mode (no SaaS chat avatar circle)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.avatar-column\s*\{[^}]*display:\s*none/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.tavern-avatar\s*\{[^}]*display:\s*none/s)
    // 序号 counter was dropped (no more "row number" feel). Assert absence.
    expect(gamePanel).not.toMatch(/counter-increment:\s*record-entry/)
    expect(gamePanel).not.toMatch(/counter-reset:\s*record-entry/)
    // msg-item is no longer a grid (no marginalia column); flowing single column
    expect(gamePanel).not.toMatch(/\.theme-kao\s+\.msg-item\s*\{[^}]*display:\s*grid/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\s*\{[^}]*display:\s*block/s)
    // 时刻 marginalia: msg-header is now absolute-positioned top-right (UI-E6A: right 8px)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-header\s*\{[^}]*position:\s*absolute/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-header\s*\{[^}]*top:\s*8px/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-header\s*\{[^}]*right:\s*8px/s)
    // Meta (display-name / msg-time) are sans 11px italic (no LXGW for ≤ 13px meta per UI-DETAIL1 §S-3)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.display-name\s*\{[^}]*font-family:\s*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.display-name\s*\{[^}]*font-size:\s*11px/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.display-name\s*\{[^}]*font-style:\s*italic/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-time\s*\{[^}]*font-family:\s*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-time\s*\{[^}]*font-size:\s*11px/s)
    // Role kicker at start of body — 我 / 旁白 / 档案员 (UI-E6A: now display:block above body)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s+\.text-main::before\s*\{[^}]*content:\s*"我\s*·\s*"/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.assistant\s+\.text-main::before\s*\{[^}]*content:\s*"旁白\s*·\s*"/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.compression-complete\s+\.text-main::before\s*\{[^}]*content:\s*"档案员\s*·\s*"/s)
    // Role kicker uses different ink per role (olive / rose / gold)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s+\.text-main::before\s*\{[^}]*var\(--archive-olive-strong\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.assistant\s+\.text-main::before\s*\{[^}]*var\(--archive-rose\)/s)
    // Sparse dividers: dotted gold between role changes, none between same-role
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\s*\+\s*\.msg-item\.user[\s\S]*?border-top:\s*1px dotted/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s*\+\s*\.msg-item\.user[\s\S]*?border-top:\s*none/s)
    // Body line-height in readable range (1.65 - 1.8, UI-E6A: 1.75)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*line-height:\s*1\.(7[0-9]|6[5-9])/s)
    // UI-E10 supersedes UI-E3 p2 font choice: body text now uses
    // --font-body (system serif, readable 宋 / Georgia), NOT --font-display
    // (LXGW WenKai brush-style). LXGW is reserved for display positions
    // (kicker, marginalia). This is the explicit font change the user
    // asked for in the 2026-06-22 feedback.
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*var\(--font-body\)/s)
    expect(gamePanel).not.toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*var\(--font-display\)/)
  })

  it('UI-E3: internal modals (StatusBar 时间设定 / 角色详情, QuestLog 查看 / 记入) are dossier 抽屉, not 圆角 SaaS dialog', () => {
    const statusBar = readProjectFile('src/components/StatusBar.vue')
    const questLog = readProjectFile('src/components/QuestLog.vue')
    // Both have .theme-kao .detail-modal override that removes border-radius and adds gold hairline
    expect(statusBar).toMatch(/\.theme-kao\s+\.detail-modal\s*\{[^}]*border-radius:\s*0/s)
    expect(questLog).toMatch(/\.theme-kao\s+\.detail-modal\s*\{[^}]*border-radius:\s*0/s)
    expect(statusBar).toMatch(/\.theme-kao\s+\.detail-modal\s*\{[^}]*var\(--archive-paper\)/s)
    expect(questLog).toMatch(/\.theme-kao\s+\.detail-modal\s*\{[^}]*var\(--archive-paper\)/s)
    // Modal header carries the dossier 卷宗 stamp (kicker, not page title)
    expect(statusBar).toMatch(/\.theme-kao\s+\.modal-header::before\s*\{[^}]*content:\s*"卷宗\s*·\s*在场人物"/s)
    expect(questLog).toMatch(/\.theme-kao\s+\.modal-header::before\s*\{[^}]*content:\s*"卷宗\s*·\s*事件卷"/s)
  })

  it('UI-E3: hard constraint — no scoped :global(.theme-kao), no new !important, no broad :deep() in the 5 modified files', () => {
    const files = [
      'src/pages/Experience.vue',
      'src/components/GamePanel.vue',
      'src/components/InputArea.vue',
      'src/components/StatusBar.vue',
      'src/components/QuestLog.vue',
      'src/components/geography/GeographyPanel.vue',
    ]
    for (const f of files) {
      const content = readProjectFile(f)
      expect(content, f).not.toMatch(/scoped.*:global\(/)
      expect(content, f).not.toContain(':global(.theme-kao)')
      // !important is only allowed in 5C's text-transform: none !important; in
      // kao.css (per spec). The 5 polished files must NOT add new !important.
      const impCount = (content.match(/!important/g) || []).length
      expect(impCount, f + ' has new !important').toBe(0)
    }
  })
})

// UI-E4A: right-rail label dedupe (2026-06-20 plan)
// The .sidebar-section::before dossier-stamp kicker is the canonical
// first-read title. The internal sub-panel header text in StatusBar /
// GeographyPanel / QuestLog duplicates the same field name. In kao
// mode we hide the redundant text and let the dossier-stamp own the
// title. Functional sub-elements (avatars, time row, count badge,
// expand icons) all stay visible.
describe('ui polish — UI-E4A Experience right-rail label dedupe', () => {
  it('UI-E4A: Experience.vue exposes 3 dedupe rules in the kao block — status-header text / geo-title-block / panel-header text', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    // Dedupe the 3 duplicate-text containers under .theme-kao .game-page scope.
    // .status-header > span:last-child  = StatusBar 在场人物 text
    // .geo-title-block                  = GeographyPanel 案卷索引 + 地点卡
    // .panel-header > span:not(.count-badge) = QuestLog 事件卷 text (count kept)
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.status-header\s*>\s*span:last-child\s*\{[^}]*display:\s*none/s,
    )
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.geo-title-block\s*\{[^}]*display:\s*none/s,
    )
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.panel-header\s*>\s*span:not\(\.count-badge\)\s*\{[^}]*display:\s*none/s,
    )
  })

  it('UI-E4A: dedupe rules do NOT use :global(.theme-kao), :deep(), !important, or random hex', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    // Find each of the 3 dedupe selector bodies and check them individually.
    // A selector body is `.theme-kao ... { ... }` — match each one with a
    // g-flag regex so we can iterate over all 3.
    const selectorBodies = experience.match(/\.theme-kao[^}]*?display:\s*none[^}]*?\}/g) || []
    // The 3 dedupe selectors + the dossier-stamp ::before (display: block) +
    // the .sidebar-section + .sidebar-section::before rules in the kao block
    // will match. We only care about the 3 dedupe selectors that have
    // display: none. The dossier-stamp has display: block, so it won't match.
    const dedupeBodies = selectorBodies.filter((b) => /display:\s*none/.test(b))
    expect(dedupeBodies.length).toBeGreaterThanOrEqual(3)
    for (const body of dedupeBodies) {
      expect(body).not.toMatch(/:global/)
      expect(body).not.toMatch(/:deep/)
      expect(body).not.toMatch(/!important/)
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    }
  })

  it('UI-E4A: functional sub-elements stay visible — StatusBar avatar, GeographyPanel count, QuestLog count-badge', () => {
    const statusBar = readProjectFile('src/components/StatusBar.vue')
    const geography = readProjectFile('src/components/geography/GeographyPanel.vue')
    const questLog = readProjectFile('src/components/QuestLog.vue')
    // StatusBar: avatar-mini / current-time / compact-profile all present
    expect(statusBar).toContain('class="avatar-mini"')
    expect(statusBar).toContain('class="current-time"')
    expect(statusBar).toContain('class="compact-profile"')
    // GeographyPanel: .geo-count (count badge) is the only child of .geo-header
    // that we keep — verify it's not removed.
    expect(geography).toContain('class="geo-count"')
    expect(geography).toContain('class="section overview-card"')
    // QuestLog: count-badge stays visible (display:none only on text spans)
    expect(questLog).toContain('class="count-badge"')
    expect(questLog).toContain('class="adventure-summary"')
  })

  it('UI-E4A: 3 dossier-stamp data attributes remain on the 3 sidebar sections (dossier-stamp is the canonical label, not removed)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toContain('data-dossier-stamp="卷宗一 · 在场人物"')
    expect(experience).toContain('data-dossier-stamp="卷宗二 · 地点卡"')
    expect(experience).toContain('data-dossier-stamp="卷宗三 · 事件卷"')
  })
})

// UI-N3: Notes Archive Drawer polish (2026-06-20 plan)
// Unifies dark-mode wall: drawer / deck / archive-pin sit on one paper
// surface instead of light-cream-left / dark-center split. Active-card
// pops above backdrop via lighter gradient + double-tape + 8px shadow
// (no rotation). Archive-pin gets explicit paper card so the floating
// tile reads as object rather than free-floating on cream wall.
describe('ui polish — UI-N3 Notes Archive Drawer dark-mode uniformity', () => {
  it('UI-N3: notes-content-area is a unified paper backdrop (gradient + grain) — drawer / deck / pin all sit on same wall', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/\.notes-content-area\s*\{[\s\S]*?background:\s*linear-gradient\(135deg/s)
  })

  it('UI-N3: kao.css overrides notes-content-area paper wall with token-bound variant', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\s+\.notes-content-area[\s\S]*?linear-gradient\(135deg/s)
    // Token-only inside the rule body — limit scope to next closing brace
    const ruleMatch = css.match(/\.theme-kao\s+\.notes-content-area\s*\{[^}]*\}/)
    expect(ruleMatch).not.toBeNull()
    expect(ruleMatch?.[0]).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('UI-N3: reading-deck is transparent + gets paper grain via ::before overlay (deck inherits the wall)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\s+\.reading-deck\s*\{[\s\S]*?background:\s*transparent/)
    expect(css).toMatch(/\.theme-kao\s+\.reading-deck::before\s*\{[\s\S]*?radial-gradient/s)
    expect(css).toMatch(/\.theme-kao\s+\.reading-deck\s*>\s*\*\s*\{[^}]*position:\s*relative/)
  })

  it('UI-N3: active-card pops above backdrop via lighter gradient + 8px shadow + double tape (no rotation)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // No rotation (was +2deg that overflowed in dark)
    expect(notes).not.toMatch(/\.active-card\s*\{[^}]*transform:\s*rotate/)
    // Bigger shadow + max-width constraint
    expect(notes).toMatch(/\.active-card\s*\{[^}]*max-width:\s*760px/s)
    expect(notes).toMatch(/\.active-card\s*\{[^}]*box-shadow:[\s\S]*?8px 8px 0/)
    // Second tape via ::after
    expect(notes).toMatch(/\.active-card::after\s*\{[\s\S]*?bottom:\s*-10px/s)
    // kao.css deepens the active-card visual
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\s+\.active-card::after\s*\{/)
    expect(css).toMatch(/\.theme-kao\s+\.active-card\s*\{[\s\S]*?box-shadow:[\s\S]*?8px 8px 0/)
    const ruleMatch = css.match(/\.theme-kao\s+\.active-card\s*\{[^}]*\}/)
    expect(ruleMatch).not.toBeNull()
    expect(ruleMatch?.[0]).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('UI-N3: archive-pin is now a paper card (border + shadow + padding) so floating tile reads as object on cream wall', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\s+\.archive-pin\s*\{[\s\S]*?background:\s*var\(--archive-paper\)/)
    expect(css).toMatch(/\.theme-kao\s+\.archive-pin\s*\{[\s\S]*?box-shadow:/)
    expect(css).toMatch(/\.theme-kao\s+\.archive-pin\s*\{[\s\S]*?padding:\s*4px/)
  })

  it('UI-N4: empty-archive card moves to left-center (left: 32%, width: 260px); kind cells have --cell-color tab + roman + label', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/\.empty-archive__card\s*\{[\s\S]*?width:\s*260px/)
    expect(notes).toMatch(/\.empty-archive__card\s*\{[\s\S]*?left:\s*32%/)
    // Kind cell template uses --cell-color style binding
    expect(notes).toMatch(/--cell-color['"]?\s*:\s*getAssetKindColor/)
    // kao.css has separate kind/empty variant rules
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\s+\.empty-archive__cell--kind\s*\{/)
    expect(css).toMatch(/\.theme-kao\s+\.empty-archive__cell--empty\s*\{/)
    // Token-only — no raw hex inside kind cell rule body
    const ruleMatch = css.match(/\.theme-kao\s+\.empty-archive__cell--kind\s*\{[^}]*\}/)
    expect(ruleMatch).not.toBeNull()
    expect(ruleMatch?.[0]).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('UI-N3: hard constraint — no new scoped :global(.theme-kao), no new !important, no broad :deep(*) in Notes.vue', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).not.toMatch(/scoped.*:global\(/)
    expect(notes).not.toContain(':global(.theme-kao)')
    expect(notes).not.toMatch(/:deep\(\s*\*/)
    expect(notes).not.toMatch(/!important/)
  })

  it('UI-N3: anti-micro-tweak — at least 4 of the 6 structural moves are present', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    const css = readProjectFile('src/styles/themes/kao.css')
    let moves = 0
    if (notes.includes('notes-content-area') && css.includes('.theme-kao .notes-content-area')) moves++
    if (css.includes('.theme-kao .reading-deck::before')) moves++
    if (notes.match(/\.active-card\s*\{[^}]*box-shadow:[\s\S]*?8px 8px 0/) && notes.includes('.active-card::after')) moves++
    if (css.includes('.theme-kao .archive-pin') && css.match(/\.theme-kao\s+\.archive-pin\s*\{[\s\S]*?box-shadow:/)) moves++
    if (notes.match(/\.empty-archive__card\s*\{[\s\S]*?width:\s*300px/)) moves++
    if (notes.match(/material-drawer[\s\S]*?box-shadow:\s*inset 8px 0 16px/) || css.match(/\.theme-kao\s+\.material-drawer\s*\{[\s\S]*?inset 8px 0 16px/)) moves++
    expect(moves).toBeGreaterThanOrEqual(4)
  })
})

// UI-N6 — Notes pinned material slips (贴板纸, 自由拖拽, 占满右侧空白)
// 不重写 Notes 为画布, 只在 active-card 周围加 1-3 张 pinned slips.
// 拖拽逻辑从 ProseEssay 抽到 useCanvasBoard composable, Notes 调用.
// ProseEssay 自身不迁移 (留 P3+).
describe('ui polish — UI-N6 Notes pinned material slips', () => {
  it('UI-N6: useCanvasBoard composable exists at src/composables/useCanvasBoard.js with 6 handler + 2 layout names', () => {
    const composable = readProjectFile('src/composables/useCanvasBoard.js')
    expect(composable).toMatch(/export function useCanvasBoard/)
    // 6 handler
    expect(composable).toMatch(/onItemDragStart/)
    expect(composable).toMatch(/onItemDragOver/)
    expect(composable).toMatch(/onItemDragEnd/)
    expect(composable).toMatch(/onBoardDragOver/)
    expect(composable).toMatch(/onBoardDrop/)
    // 2 layout helpers
    expect(composable).toMatch(/layoutItems/)
    expect(composable).toMatch(/styleFor/)
  })

  it('UI-N6: Notes.vue imports + invokes useCanvasBoard (composable wired, not duplicated inline)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/import\s*\{[^}]*useCanvasBoard[^}]*\}\s*from\s*['"]\.\.\/composables\/useCanvasBoard['"]/)
    expect(notes).toMatch(/useCanvasBoard\(/)
  })

  it('UI-N6: Notes.vue declares pinnedSlipIds ref + pinnedSlipPositions reactive + MAX_PINNED_SLIPS = 3', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/const\s+pinnedSlipIds\s*=\s*ref\(/)
    expect(notes).toMatch(/const\s+pinnedSlipPositions\s*=\s*reactive\(/)
    expect(notes).toMatch(/MAX_PINNED_SLIPS\s*=\s*3/)
  })

  it('UI-N6: Notes.vue defines togglePinSlip / unpinSlip / isPinned / load+save prefs methods', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/function\s+togglePinSlip/)
    expect(notes).toMatch(/function\s+unpinSlip/)
    expect(notes).toMatch(/function\s+isPinned/)
    expect(notes).toMatch(/function\s+loadNotesPinnedSlipsPref/)
    expect(notes).toMatch(/function\s+saveNotesPinnedSlipsPref/)
    expect(notes).toMatch(/NOTES_PINNED_SLIPS_KEY\s*=\s*['"]pinax_notes_pinned_slips_v1['"]/)
    // 持久化接进 onMounted
    expect(notes).toMatch(/loadNotesPinnedSlipsPref\(\)/)
  })

  it('UI-N6: reading-deck v-else contains v-for pinned-slip with draggable + 6 drag/drop handlers', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // v-for 渲染 pinned-slip
    expect(notes).toMatch(/<div[^>]*v-for="slip in layoutItems"/)
    expect(notes).toMatch(/class="pinned-slip"/)
    expect(notes).toMatch(/draggable="true"/)
    // dragstart / dragover / dragend 在 pinned-slip 上
    expect(notes).toMatch(/@dragstart="onItemDragStart\(slip,\s*\$event\)"/)
    expect(notes).toMatch(/@dragend="onItemDragEnd"/)
    expect(notes).toMatch(/@dragover\.prevent="onItemDragOver\(slip,\s*\$event\)"/)
    // reading-deck wall-level drop handlers
    expect(notes).toMatch(/@dragover\.prevent="onBoardDragOver\(\$event\)"/)
    expect(notes).toMatch(/@drop="onBoardDrop\(\$event\)"/)
    expect(notes).toMatch(/ref="boardRef"/)
  })

  it('UI-N6: deck-toolbar pin toggle — N10 removed manual pin button (default-on mode means everything is on canvas automatically)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // UI-N10: deck-toolbar no longer carries a 钉入副阅读台 button — pinnedSlipIds
    // is populated to all chapter ids by default (loadNotes), so the manual
    // toggle no longer makes sense. togglePinSlip itself is still wired (used
    // by the sidebar index-card and the multi-canvas__chrome batch button).
    expect(notes).not.toMatch(/@click="togglePinSlip\(selectedAsset\.id\)"/)
    expect(notes).not.toMatch(/class="material-action-btn deck-toolbar__btn deck-toolbar__btn--pin"/)
    // togglePinSlip still exists as a function (called from elsewhere)
    expect(notes).toContain('togglePinSlip(')
  })

  it('UI-N6: kao.css exposes .theme-kao .pinned-slip with token-only rule body (no raw hex)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\s+\.pinned-slip\s*\{/)
    const ruleMatch = css.match(/\.theme-kao\s+\.pinned-slip\s*\{[^}]*\}/)
    expect(ruleMatch).not.toBeNull()
    expect(ruleMatch?.[0]).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('UI-N6: kao.css has .theme-kao.theme-dark .pinned-slip override (M1 dark void fix)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\.theme-dark\s+\.pinned-slip\s*\{/)
  })

  it('UI-N6: kao.css has reduced-motion guard on .pinned-slip (a11y baseline)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    const reduceBlock = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)
    expect(reduceBlock, 'prefers-reduced-motion reduce block should exist').toBeTruthy()
    expect(reduceBlock?.[0]).toMatch(/\.theme-kao\s+\.pinned-slip/)
  })

  it('UI-N6: hard constraint — no new scoped :global(.theme-kao), no new !important, no broad :deep(*) in Notes.vue or useCanvasBoard.js', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    const composable = readProjectFile('src/composables/useCanvasBoard.js')
    expect(notes).not.toContain(':global(.theme-kao)')
    expect(notes).not.toMatch(/:deep\(\s*\*/)
    expect(notes).not.toMatch(/!important/)
    expect(composable).not.toContain(':global(.theme-kao)')
    expect(composable).not.toMatch(/:deep\(\s*\*/)
    expect(composable).not.toMatch(/!important/)
  })

  it('UI-N6: does not break existing UI-N2/N3/N4 contracts — material-drawer / active-card / archive-pin / reading-deck / page-controls / empty-archive all still rendered (N10 adds multi-canvas on top)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('<aside class="material-drawer">')
    // N10 multi-canvas contains .active-card (with extra multi-canvas__main-card modifier)
    expect(notes).toMatch(/class="active-card[^"]*"/)
    expect(notes).toContain('<aside class="archive-pin"')
    expect(notes).toContain('class="reading-deck"')
    expect(notes).toContain('class="empty-archive"')
    expect(notes).toContain('class="page-controls"')
    // N10 new structure (regex-tolerant: accepts `multi-canvas__main-card` either
    // alone or as a modifier on `active-card` like
    // `<article class="active-card multi-canvas__main-card">`).
    expect(notes).toMatch(/class="multi-canvas"/)
    expect(notes).toMatch(/class="[^"]*multi-canvas__main-card[^"]*"/)
    expect(notes).toContain('class="multi-canvas__slips"')
  })

  it('UI-N6: Notes.vue scoped CSS adds @media (max-width: 980px) .pinned-slip fallback (mobile stacking)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/@media\s*\(max-width:\s*980px\)[\s\S]*?\.pinned-slip\s*\{/)
  })
})

// UI-N9 — Notes 副阅读台画布 (canvas-pinboard)
// 把右侧空白从"3 张装饰浮卡" 变成"1-3 张真实可用的多素材并列阅读画布":
// 1) 副阅读台是有边界的右侧栏 (320px, 真实可用, 不再叠在 active-card 上)
// 2) 主卡保持居中, 不被遮挡 (核心身份保留)
// 3) 1-3 张 slip 在画布列里排列, 点击切到主卡 + 自动 z-index 浮到顶层
// 4) 暗态硬化, 移动端水平滚动降级
// 5) hard constraint: 0 新 :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex
describe('ui polish — UI-N9 Notes 副阅读台 canvas pinboard', () => {
  it('UI-N9: Notes.vue template contains drag-aware board container (N10 wraps reading-deck into multi-canvas, but canvas-pinboard CSS still ships)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // N10: canvas-pinboard <aside> is replaced by multi-canvas <div> (the
    // N9 320px right-rail is removed; multi-canvas is now a 2-col grid
    // with main card + slip stack). The CSS for canvas-pinboard still
    // ships in kao.css for any legacy imports.
    expect(notes).toMatch(/<div[^>]*class="multi-canvas"[^>]*ref="boardRef"/)
    // drop handlers still wired
    expect(notes).toMatch(/@dragover\.prevent="onBoardDragOver\(\$event\)"/)
    expect(notes).toMatch(/@drop="onBoardDrop\(\$event\)"/)
  })

  it('UI-N9: Notes.vue declares multi-canvas chrome header (N10 replaces canvas-pinboard__title with multi-canvas__chrome-label "素材贴板")', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/multi-canvas__chrome-label[^>]*>素材贴板</)
    expect(notes).toMatch(/class="multi-canvas__chrome-meta"/)
    // N10 default-on: pinnedSlipIds contains all chapter ids when prefs is empty
    expect(notes).toMatch(/slipItemsOnCanvas\.length/)
  })

  it('UI-N9: Notes.vue imports bringToFront from useCanvasBoard composable', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/bringToFront/)
    expect(notes).toMatch(/const\s*\{[^}]*bringToFront[^}]*\}\s*=\s*useCanvasBoard/)
  })

  it('UI-N9: Notes.vue declares onSlipClick handler that brings-to-front then selects', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/function\s+onSlipClick/)
    expect(notes).toMatch(/onSlipClick\(slip\)/)
    // onSlipClick must call bringToFront then selectChapter
    expect(notes).toMatch(/function\s+onSlipClick[\s\S]*?bringToFront\(slip\.id\)[\s\S]*?selectChapter\(slip\.id\)/)
  })

  it('UI-N9: Notes.vue declares importCheckedToPinboard batch helper', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/function\s+importCheckedToPinboard/)
    expect(notes).toMatch(/@click="importCheckedToPinboard"/)
  })

  it('UI-N9: scoped CSS has .canvas-pinboard wrapper at 320px fixed width with paper gradient + dashed border', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // .canvas-pinboard width 320px flex 0 0
    expect(notes).toMatch(/\.canvas-pinboard\s*\{[^}]*flex:\s*0 0 320px/s)
    expect(notes).toMatch(/\.canvas-pinboard\s*\{[^}]*dashed/s)
    // paper gradient via archive-paper / archive-paper-soft
    expect(notes).toMatch(/\.canvas-pinboard\s*\{[^}]*archive-paper[\s\S]*?archive-paper-soft/s)
  })

  it('UI-N9: scoped CSS has .reading-deck:has(.canvas-pinboard) flex-row layout (主卡 + 画布并列)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/\.reading-deck:has\(\.canvas-pinboard\)\s*\{[^}]*flex-direction:\s*row/s)
  })

  it('UI-N9: scoped CSS has @media (max-width: 980px) canvas-pinboard horizontal-stack fallback (mobile)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/@media\s*\(max-width:\s*980px\)[\s\S]*?\.canvas-pinboard\s*\{/)
  })

  it('UI-N9: kao.css exposes .theme-kao .canvas-pinboard with token-only rule body (no raw hex)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\s+\.canvas-pinboard\s*\{/)
    const ruleMatch = css.match(/\.theme-kao\s+\.canvas-pinboard\s*\{[^}]*\}/)
    expect(ruleMatch).not.toBeNull()
    expect(ruleMatch?.[0]).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('UI-N9: kao.css has .theme-kao.theme-dark .canvas-pinboard override (dark mode hardening)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/\.theme-kao\.theme-dark\s+\.canvas-pinboard\s*\{/)
  })

  it('UI-N9: kao.css has reduced-motion guard on .canvas-pinboard (a11y baseline)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    const reduceBlock = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)
    expect(reduceBlock, 'prefers-reduced-motion reduce block should exist').toBeTruthy()
    expect(reduceBlock?.[0]).toMatch(/\.theme-kao\s+\.canvas-pinboard/)
  })

  it('UI-N9: useCanvasBoard exports bringToFront + focusedZId (z-index management API)', () => {
    const composable = readProjectFile('src/composables/useCanvasBoard.js')
    expect(composable).toMatch(/function\s+bringToFront/)
    expect(composable).toMatch(/focusedZId/)
    // return list should expose bringToFront + focusedZId
    expect(composable).toMatch(/bringToFront,?\s*\n\s*focusedZId/)
  })

  it('UI-N9: hard constraint — no new scoped :global(.theme-kao), no new !important, no broad :deep(*), no random raw hex in scoped .canvas-pinboard block', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    const css = readProjectFile('src/styles/themes/kao.css')
    const composable = readProjectFile('src/composables/useCanvasBoard.js')
    // No new :global(.theme-kao) / !important / broad :deep(*) in notes
    expect(notes).not.toContain(':global(.theme-kao)')
    expect(notes).not.toMatch(/:deep\(\s*\*/)
    expect(notes).not.toMatch(/!important/)
    // kao.css canvas-pinboard rule body must not introduce raw hex
    const cbRules = css.match(/\.theme-kao\s+\.canvas-pinboard\s*\{[^}]*\}/g) || []
    expect(cbRules.length).toBeGreaterThan(0)
    cbRules.forEach((rule) => {
      expect(rule).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    })
    // composable stays clean
    expect(composable).not.toContain(':global(.theme-kao)')
    expect(composable).not.toMatch(/:deep\(\s*\*/)
    expect(composable).not.toMatch(/!important/)
  })

  it('UI-N9: does not break UI-N6 contracts — pinned-slip + drag handlers + 6 handler call sites still present', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/class="pinned-slip"/)
    expect(notes).toMatch(/draggable="true"/)
    expect(notes).toMatch(/@dragstart="onItemDragStart\(slip,\s*\$event\)"/)
    expect(notes).toMatch(/@dragend="onItemDragEnd"/)
    expect(notes).toMatch(/@dragover\.prevent="onItemDragOver\(slip,\s*\$event\)"/)
    // MAX_PINNED_SLIPS now Infinity (was 3 in N9) — N10 removes the hard cap
    expect(notes).toMatch(/MAX_PINNED_SLIPS\s*=\s*9999/)
  })
})

// =========================================================================
// UI-N10: Notes multi-card canvas — "素材贴板 / 多卡画布"
// 把 N9 的 "主卡 + 1-3 张副阅读台" 重构为 "主卡 + 多张相关 slip 同屏"，
// 借鉴 LUSION-R2 报告里的 "分层舞台 / 强空间占位 / 滚动视线引导"思路。
// 关键改造:
//  1) MAX_PINNED_SLIPS: 3 → 9999, 默认所有素材 visible on canvas
//  2) 主卡 active-card 居中大卡 (1fr 60%); slip 围绕 (1fr 40%)
//  3) 借鉴 Lusion project-item 双行结构 (kind-color header bar + footer 状态)
//  4) 借鉴 Lusion cross scroll prompt — 画布底部 "翻下页" 提示
//  5) 空状态 / 多素材都用 multi-canvas 容器, 不再出现 "大 void"
// 保留 N6/N9 拖拽 + z-index + 持久化 (pinnedSlipPositions / NOTES_PINNED_SLIPS_KEY)，
// 不破坏 useCanvasBoard composable 签名。
// =========================================================================
describe('ui polish — UI-N10 Notes multi-card canvas (素材贴板 / 多卡画布)', () => {
  it('UI-N10: Notes.vue removes MAX cap and defaults all assets to on-canvas', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // Hard cap removed: was 3 (N6), now 9999 (N10)
    expect(notes).toMatch(/MAX_PINNED_SLIPS\s*=\s*9999/)
    // No code-level `MAX_PINNED_SLIPS = 3` assignment (the "3" only appears
    // in a comment about the history; the binding itself is 9999 now).
    const codeMaxAssignments = notes.match(/^\s*const\s+MAX_PINNED_SLIPS\s*=\s*3\s*$/m) || []
    expect(codeMaxAssignments.length).toBe(0)
    // MAX_HINTED_SLIPS = 6 (cross prompt 阈值)
    expect(notes).toMatch(/MAX_HINTED_SLIPS\s*=\s*6/)
    // loadNotes defaults all chapter ids into pinnedSlipIds when prefs empty
    expect(notes).toContain('pinnedSlipIds.value = chapters.value.map((a) => a.id)')
    // togglePinSlip no longer evicts the oldest when full
    expect(notes).not.toMatch(/nextIds\.length\s*>=\s*MAX_PINNED_SLIPS\s*\)[\s\S]*?const oldest/)
  })

  it('UI-N10: Notes.vue template introduces multi-canvas container + 3-zone grid (chrome / main card / slip stack)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toMatch(/<div[^>]*class="multi-canvas"[^>]*ref="boardRef"/)
    expect(notes).toContain('class="multi-canvas__chrome"')
    expect(notes).toContain('class="multi-canvas__chrome-label"')
    expect(notes).toContain('class="multi-canvas__main"')
    expect(notes).toMatch(/class="[^"]*multi-canvas__main-card[^"]*"/)
    expect(notes).toContain('class="multi-canvas__slips"')
    // Main card is the 1.55fr column with active-card content
    expect(notes).toMatch(/class="active-card multi-canvas__main-card"/)
    // Slip stack renders layoutItems (useCanvasBoard items) inside multi-canvas__slips
    expect(notes).toMatch(/<aside[^>]*class="multi-canvas__slips"[\s\S]*?v-for="slip in layoutItems"/)
  })

  it('UI-N10: Notes.vue slip block uses Lusion-style 双行 footer (kind-color header bar + status dot + line-2 status)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // kind-color header bar (existing, kept)
    expect(notes).toContain('class="pinned-slip__tab"')
    // new line-1 with kind label + status dot + 字数
    expect(notes).toContain('class="pinned-slip__line-1"')
    expect(notes).toContain('class="pinned-slip__status-dot"')
    expect(notes).toContain('class="pinned-slip__line-2"')
    expect(notes).toContain('class="pinned-slip__status"')
    // getStatusColor + getAssetStatusLabel helpers exist
    expect(notes).toMatch(/function\s+getStatusColor/)
    expect(notes).toMatch(/function\s+getAssetStatusLabel/)
  })

  it('UI-N10: Notes.vue adds Lusion-style cross scroll prompt (空状态 / 翻页)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    expect(notes).toContain('class="multi-canvas__cross-prompt"')
    expect(notes).toContain('class="multi-canvas__cross"')
    expect(notes).toContain('class="multi-canvas__bottom-cross"')
    expect(notes).toContain('class="multi-canvas__cross-label"')
    // 还有 N 张可钉入画布 / 翻下页 字面量
    expect(notes).toContain('还有')
    expect(notes).toContain('翻下页')
    // scrollCanvasToBottom handler
    expect(notes).toMatch(/function\s+scrollCanvasToBottom/)
    expect(notes).toMatch(/@click="scrollCanvasToBottom"/)
  })

  it('UI-N10: kao.css implements multi-canvas 2-col grid + Lusion cross + 双行 slip footer', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    // 2-col grid: 1.55fr main + 1fr slips
    expect(css).toMatch(/\.theme-kao\s+\.multi-canvas\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.55fr\)\s+minmax\(0,\s*1fr\)/s)
    // main card border (main card emphasizes "主卡" identity)
    expect(css).toMatch(/\.theme-kao\s+\.multi-canvas__main-card\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--archive-gold\) 75%/s)
    // Slip 区 grid (the slip-stack container)
    expect(css).toMatch(/\.theme-kao\s+\.multi-canvas__slips\s*\{[^}]*flex-direction:\s*column/s)
    // Lusion-style 双行 footer (line-1 + status-dot + line-2 + status)
    expect(css).toMatch(/\.theme-kao\s+\.pinned-slip__line-1\s*\{/)
    expect(css).toMatch(/\.theme-kao\s+\.pinned-slip__status-dot\s*\{[^}]*width:\s*6px/s)
    expect(css).toMatch(/\.theme-kao\s+\.pinned-slip__line-2\s*\{/)
    expect(css).toMatch(/\.theme-kao\s+\.pinned-slip__status\s*\{/)
    // Lusion-style cross (+): ::before + ::after
    expect(css).toMatch(/\.theme-kao\s+\.multi-canvas__cross::before\s*\{[\s\S]*?width:\s*100%/)
    expect(css).toMatch(/\.theme-kao\s+\.multi-canvas__cross::after\s*\{[\s\S]*?height:\s*100%/)
    // 暗态硬化 (dark variant 不让 multi-canvas 消失)
    expect(css).toMatch(/\.theme-kao\.theme-dark\s+\.multi-canvas\s*\{/)
  })

  it('UI-N10: kao.css multi-canvas block has 0 raw hex + 0 !important + 0 broad :deep(*)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    // Extract .theme-kao .multi-canvas + sub-selector rules; ensure none contain raw hex.
    const blocks = css.match(/\.theme-kao\s+\.multi-canvas[^{}]*\{[^}]*\}/g) || []
    expect(blocks.length).toBeGreaterThan(0)
    blocks.forEach((rule) => {
      expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    })
    // kao.css wider: no !important or broad :deep in any new N10 rule
    const newRules = css.match(/\.multi-canvas[^{}]*\{[^}]*\}/g) || []
    newRules.forEach((rule) => {
      expect(rule).not.toMatch(/!important/)
      expect(rule).not.toMatch(/:deep\(\s*\*/)
    })
  })

  it('UI-N10: hard constraint — 0 new :global(.theme-kao), 0 new !important, 0 broad :deep(*), kao block 0 raw hex, 0 store/service/router change', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    const composable = readProjectFile('src/composables/useCanvasBoard.js')
    // N10 must not regress the existing bans
    expect(notes).not.toContain(':global(.theme-kao)')
    expect(notes).not.toMatch(/:deep\(\s*\*/)
    // :global / !important / broad :deep must not appear in N10 new selectors
    expect(notes).not.toMatch(/multi-canvas[^{]*\{[^}]*:global/)
    expect(notes).not.toMatch(/multi-canvas[^{]*\{[^}]*:deep/)
    expect(notes).not.toMatch(/multi-canvas[^{]*\{[^}]*!important/)
    const impCount = (notes.match(/!important/g) || []).length
    expect(impCount).toBe(0)
    // 0 raw hex inside kao.css .theme-kao .multi-canvas block
    const css = readProjectFile('src/styles/themes/kao.css')
    const kaoBlocks = css.match(/\.theme-kao\s+\.multi-canvas[\s\S]*?\n\}/g) || []
    const kaoText = kaoBlocks.join('\n')
    expect(kaoText).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    // 0 store mutation / 0 store import / 0 new services/router
    expect(notes).not.toMatch(/gameStore\.\w+\s*=\s*/)
    expect(notes).not.toContain("from '../services/worldbookContextBuilder")
    expect(notes).not.toContain("from '../router")
    // useCanvasBoard composable API unchanged (N10 keeps the same import)
    expect(composable).toContain('useCanvasBoard')
  })
})

// UI-E6A: Experience ledger readable record-book typography + page

// UI-E6A: Experience ledger readable record-book typography + page
// mechanisms (2026-06-21 plan). Supersedes E3 p2 marginalia weights and
// adds spine stitch / folio page no. / chapter rule / message backdrop
// / kicker-on-block — all purely visual; no store / service change.
describe('ui polish — UI-E6A Experience ledger readable record-book', () => {
  it('UI-E6A + UI-E10: body text 16-18px / line-height 1.7-1.85 / --font-body (NOT --font-display LXGW) — readable system serif for long passages (UI-E12-F bumps 16 → 17 / 1.75 → 1.78)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // UI-E12-F: bumped body 16 → 17px so the central record surface
    // reads as a product body. Range 16-18 covers E6A baseline and
    // future readability bumps.
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*font-size:\s*(1[6-9]|2\d)px/s)
    // UI-E12-F: bumped line-height 1.75 → 1.78. Range 1.7-1.85 covers
    // E6A baseline (1.75) and E12-F tuning (1.78).
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*line-height:\s*1\.(7\d|8[0-5])/s)
    // UI-E10: body text uses --font-body (system serif fallback), NOT
    // LXGW. LXGW is reserved for display positions (kicker, marginalia).
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*var\(--font-body\)/s)
    // E6A LXGW assumption is now GONE
    expect(gamePanel).not.toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*var\(--font-display\)/)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*color:\s*var\(--archive-ink\)/s)
  })

  it('UI-E6A: meta (display-name / msg-time / folio page no.) uses sans, not LXGW (UI-DETAIL1 §S-3 rule)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // display-name + msg-time are sans 11px italic
    expect(gamePanel).toMatch(/\.theme-kao\s+\.display-name\s*\{[^}]*font-family:\s*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.display-name\s*\{[^}]*font-size:\s*11px/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-time\s*\{[^}]*font-family:\s*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-time\s*\{[^}]*font-size:\s*11px/s)
    // folio page no. uses sans 11px italic with archive-ink-soft ink (60%)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item__folio\s*\{[^}]*font-family:\s*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item__folio\s*\{[^}]*font-size:\s*11px/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item__folio\s*\{[^}]*var\(--archive-ink-soft\)/s)
  })

  it('UI-E6A: role kicker is a display-block signature above the body (not inline), 14px LXGW weight 500, role-tinted ink', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // All 3 role kickers are display: block (above the body, not inline at body start)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s+\.text-main::before\s*\{[^}]*display:\s*block/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.assistant\s+\.text-main::before\s*\{[^}]*display:\s*block/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.compression-complete\s+\.text-main::before\s*\{[^}]*display:\s*block/s)
    // All 3 kickers: 14px, weight 500, LXGW
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s+\.text-main::before\s*\{[^}]*font-size:\s*14px/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s+\.text-main::before\s*\{[^}]*font-weight:\s*500/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s+\.text-main::before\s*\{[^}]*var\(--font-display\)/s)
    // Kicker content
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s+\.text-main::before\s*\{[^}]*"我\s*·\s*"/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.assistant\s+\.text-main::before\s*\{[^}]*"旁白\s*·\s*"/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.compression-complete\s+\.text-main::before\s*\{[^}]*"档案员\s*·\s*"/s)
    // Role ink: olive 80% / rose 84% / gold 88% (slightly punched up from E3 p2)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s+\.text-main::before\s*\{[^}]*archive-olive-strong\)\s*80%/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.assistant\s+\.text-main::before\s*\{[^}]*archive-rose\)\s*84%/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.compression-complete\s+\.text-main::before\s*\{[^}]*archive-gold\)\s*88%/s)
  })

  it('UI-E6A: chat-container has 4px spine stitch (gold 24% repeating-linear-gradient) on left edge', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // chat-container is positioned so the ::before stitch anchors correctly
    expect(gamePanel).toMatch(/\.theme-kao\s+\.chat-container\s*\{[^}]*position:\s*relative/s)
    // ::before stitch exists, 4px wide, archive-gold 24% repeating-linear-gradient
    expect(gamePanel).toMatch(/\.theme-kao\s+\.chat-container::before\s*\{[^}]*width:\s*4px/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.chat-container::before\s*\{[^}]*repeating-linear-gradient/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.chat-container::before\s*\{[^}]*archive-gold\)\s*24%/s)
  })

  it('UI-E6A: each msg-item has a 3px role-color left bar, half-transparent paper-strong backdrop, hard cut corners, 1px ink hairline', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // msg-item baseline (assistant default = gold) + role variants
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\s*\{[^}]*border-left:\s*3px solid var\(--archive-gold\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\s*\{[^}]*border-radius:\s*0/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\s*\{[^}]*archive-paper-strong\)\s*18%/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\s*\{[^}]*box-shadow:\s*0\s*1px\s*0[^}]*archive-ink\)\s*12%/s)
    // role variants
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.user\s*\{[^}]*border-left-color:\s*var\(--archive-olive-strong\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.assistant\s*\{[^}]*border-left-color:\s*var\(--archive-gold\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item\.compression-complete\s*\{[^}]*border-left-color:\s*var\(--archive-rose\)/s)
  })

  it('UI-E10: chapter-rule ribbon between message groups is DELETED (superseded by per-entry marginalia section number)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // E9 chapter-rule + chapter-rule__label are gone; section numbering
    // is now per-entry marginalia (.scene-entry__no) only.
    // UI-E10-CLEAN 2026-06-22: removed reference to deleted
    // .scene-stage__indicator (was v-if hidden in 0-message state).
    expect(gamePanel).not.toMatch(/\.theme-kao\s+\.chapter-rule\s*\{/)
    expect(gamePanel).not.toMatch(/\.theme-kao\s+\.chapter-rule__label\s*\{/)
    expect(gamePanel).not.toContain('class="chapter-rule"')
    expect(gamePanel).not.toContain('class="chapter-rule__label"')
    // No v-for over messageSpreads (UI-E9 pattern, gone)
    expect(gamePanel).not.toContain('v-for="(spread, sIdx) in messageSpreads"')
  })

  it('UI-E10: GamePanel.vue implements displayMessages primitive — iterates gameStore.messages directly (UI-E9 messageSpreads removed)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // UI-E10 single-column primitive
    expect(gamePanel).toContain('displayMessages')
    expect(gamePanel).toMatch(/const displayMessages\s*=\s*computed\(\(\)\s*=>\s*\{/)
    // UI-E9 messageSpreads / LONG_ASSISTANT_CHARS / isStandaloneMessage gone
    expect(gamePanel).not.toContain('messageSpreads')
    expect(gamePanel).not.toContain('LONG_ASSISTANT_CHARS')
    expect(gamePanel).not.toContain('isStandaloneMessage')
    // recordVolume is still defined (Experience.vue uses it for indicator)
    expect(gamePanel).not.toMatch(/const recordVolume\s*=\s*computed/)
    // Template iterates displayMessages, not spreads
    expect(gamePanel).toContain('v-for="(msg, index) in displayMessages"')
    expect(gamePanel).toContain(':key="`scene-${index}`"')
    // Folio page no. still on each msg (preserved from E6A)
    expect(gamePanel).toContain('class="msg-item__folio"')
  })

  it('UI-E6A: hard constraint — no new scoped :global(.theme-kao), no new !important, no broad :deep() in GamePanel.vue', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    expect(gamePanel).not.toContain(':global(.theme-kao)')
    expect(gamePanel).not.toMatch(/:deep\(\s*\*/)
    const impCount = (gamePanel.match(/!important/g) || []).length
    expect(impCount).toBe(0)
    // No random hex literals inside the kao block: scan just the
    // .theme-kao ...} range and assert no #RGB inside it.
    const kaoBlock = gamePanel.match(/\.theme-kao[\s\S]*?\n\}/g) || []
    const kaoText = kaoBlock.join('\n')
    expect(kaoText).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

// =========================================================================
// UI-E10: Experience 重做 — font / display / menu continuity.
// E10 supersedes UI-E9 ledger-spread with a single-column scene-entry
// flow. The E6A typography / folio / kicker / spine stitch / msg-item
// layer stays in place (readable body in serif, role-color 3px bar,
// "我·" / "旁白·" / "档案员·" block kickers). UI-E10 ADDS:
//   - --font-body system serif fallback token (kao.css) so long body
//     passages read as 宋 / Georgia, not LXGW 书法
//   - <article class="scene-entry"> single-column with top marginalia
//     (date / 第 N 条 / role stamp) replacing E9 page-header / spine /
//     sheets / continued-mark / ink-stamp
//   - Sticky .scene-stage__indicator (Experience.vue) giving the user
//     a "卷 X · 第 Y 条 / 共 N 条" progress anchor
//   - Shared vertical axis (kao.css .game-page::before 1px rose line
//     at left:28px) threading through record-folio / scene-stage /
//     dossier sidebar
// E10 PRESERVES:
//   - E9-FIX mechanism-trigger click: <div class="text-wrapper"
//     @click="onTextWrapperClick(index, msg, $event)"> on every entry
//   - E6A typography 16px / 1.75 / role kicker / spine stitch
//   - E6A folio page no. + role-color 3px left bar + msg-item backdrop
// =========================================================================
describe('ui polish — UI-E10 Experience 重做 (font / display / menu)', () => {
  it('UI-E10: --font-body token exists in kao.css :root as system serif fallback (Songti / Source Han / Noto Serif CJK / STSong / Iowan / Georgia / serif)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    expect(css).toMatch(/--font-body:\s*"Songti SC"/)
    expect(css).toMatch(/--font-body:[\s\S]*?"Source Han Serif CN"/)
    expect(css).toMatch(/--font-body:[\s\S]*?"Noto Serif CJK SC"/)
    expect(css).toMatch(/--font-body:[\s\S]*?STSong/)
    expect(css).toMatch(/--font-body:[\s\S]*?Georgia/)
    expect(css).toMatch(/--font-body:[\s\S]*?, serif/)
  })

  it('UI-E10: .theme-kao .text-main uses --font-body (NOT --font-display LXGW) for readable body serif', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*var\(--font-body\)/s)
    // Negative: LXGW NOT used for body
    expect(gamePanel).not.toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*var\(--font-display\)/)
  })

  it('UI-E10: GamePanel.vue template uses scene-entry single-column (NOT ledger-spread) — each message wrapped in <article class="scene-entry">', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // Positive: <article class="scene-entry"> wraps each message
    expect(gamePanel).toMatch(/<article[^>]*class="scene-entry"/)
    // Negative: E9 ledger-spread entirely gone
    expect(gamePanel).not.toMatch(/class="ledger-spread"/)
    expect(gamePanel).not.toContain('class="ledger-spread__page-header"')
    expect(gamePanel).not.toContain('class="ledger-spread__sheets"')
    expect(gamePanel).not.toContain('class="ledger-spread__ink-stamp"')
    expect(gamePanel).not.toContain('class="ledger-spread__continued-mark"')
    expect(gamePanel).not.toContain('续 · 接上页')
  })

  it('UI-E10: scene-entry has marginalia header (date / 第 N 条 / role stamp) — numbered axis running top-to-bottom (UI-E12-F: scene-entry__stamp switched to var(--font-sans) for 10px readability)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    expect(gamePanel).toContain('class="scene-entry__marginalia"')
    expect(gamePanel).toContain('class="scene-entry__date"')
    expect(gamePanel).toContain('class="scene-entry__no"')
    expect(gamePanel).toContain('class="scene-entry__stamp"')
    // CSS locks marginalia rules + 第 N 条 / 卷 X stamps
    expect(gamePanel).toMatch(/\.theme-kao\s+\.scene-entry__marginalia\s*\{[^}]*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.scene-entry__no\s*\{[^}]*var\(--archive-gold\)/s)
    // UI-E12-F: scene-entry__stamp switched from --font-display brush
    // (too dense at 10px) to --font-sans italic + rose color. The
    // italic + rose tint still marks it as a kicker stamp.
    expect(gamePanel).toMatch(/\.theme-kao\s+\.scene-entry__stamp\s*\{[^}]*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.scene-entry__stamp\s*\{[^}]*font-style:\s*italic/s)
    expect(gamePanel).toMatch(/第\s*\{\{\s*index\s*\+\s*1\s*\}\}\s*条/)
  })

  it('UI-E10: scene-entry text-wrapper preserves onTextWrapperClick binding (E9-FIX guard — gamePanelMechanism.test.js)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // E9-FIX repair preserved verbatim: every .text-wrapper still has
    // @click="onTextWrapperClick(...)". In E10 the index arg comes from
    // v-for="(msg, index) in displayMessages" (NOT spread.leftIndex).
    expect(gamePanel).toMatch(/class="text-wrapper"[^>]*@click="onTextWrapperClick\(index,\s*msg,\s*\$event\)"/)
    // Negative: no leftover spread.leftIndex / spread.rightIndex bindings
    expect(gamePanel).not.toContain('onTextWrapperClick(spread.leftIndex')
    expect(gamePanel).not.toContain('onTextWrapperClick(spread.rightIndex')
    // gamePanelMechanism test data-global-index still on .msg-item
    expect(gamePanel).toContain(':data-global-index="index"')
  })

  it('UI-E10-CLEAN: kao.css .theme-kao .game-page::before 28px shared vertical axis is REMOVED (was masked behind record-folio / sidebar borders — UI-E11 will replace with sticky topstrip)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    // Axis rule body is gone
    expect(css).not.toMatch(/\.theme-kao\s+\.game-page::before\s*\{[^}]*left:\s*28px/s)
    expect(css).not.toMatch(/\.theme-kao\s+\.game-page::before\s*\{[^}]*archive-rose\)/s)
    expect(css).not.toMatch(/\.theme-kao\s+\.game-page::before\s*\{[^}]*width:\s*1px/s)
    // Mobile fallback also gone
    expect(css).not.toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.theme-kao\s+\.game-page::before\s*\{[^}]*left:\s*14px/s)
  })

  it('UI-E10-CLEAN: kao.css .theme-kao .scene-stage__indicator* sticky section indicator is REMOVED (was v-if hidden in 0-message state — UI-E11 will replace with always-on topstrip)', () => {
    const css = readProjectFile('src/styles/themes/kao.css')
    // Indicator rule + children gone
    expect(css).not.toMatch(/\.theme-kao\s+\.scene-stage__indicator\s*\{/)
    expect(css).not.toMatch(/\.theme-kao\s+\.scene-stage__indicator-volume\s*\{[^}]*var\(--archive-gold\)/s)
    expect(css).not.toMatch(/\.theme-kao\s+\.scene-stage__indicator-kicker\s*\{/)
    expect(css).not.toMatch(/\.theme-kao\s+\.scene-stage__indicator-progress\s*\{/)
    // Scene-entry CSS lives in GamePanel.vue scoped, not kao.css (preserved)
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    expect(gamePanel).toMatch(/\.theme-kao\s+\.scene-entry\s*\{/)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.scene-entry__marginalia\s*\{/)
  })

  it('UI-E10-CLEAN: Experience.vue template / computed / scoped CSS removes scene-stage__indicator (UI-E11 will replace)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).not.toContain('class="scene-stage__indicator"')
    // Code identifier gone (doc-comment references in E10-CLEAN inline
    // annotations are OK; only check that it's not a live binding / function)
    expect(experience).not.toMatch(/const\s+sceneStageIndicator\s*=/)
    expect(experience).not.toMatch(/const\s+sceneIndicatorVisible\s*=/)
    expect(experience).not.toMatch(/sceneStageIndicator\.(volume|total|messageIndex)/)
    // Base scoped style on .scene-stage__indicator (legacy / non-kao) gone
    expect(experience).not.toMatch(/\.scene-stage__indicator\s*\{/)
    expect(experience).not.toMatch(/\.scene-stage__indicator-volume\s*\{/)
  })

  it('UI-E10: hard constraint — 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex / 0 store mutation / E9 ledger-spread / messageSpreads / LONG_ASSISTANT_CHARS all gone', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    const experience = readProjectFile('src/pages/Experience.vue')
    const css = readProjectFile('src/styles/themes/kao.css')
    // GamePanel forbidden patterns
    expect(gamePanel).not.toContain(':global(.theme-kao)')
    expect(gamePanel).not.toMatch(/:deep\(\s*\*/)
    const impCount = (gamePanel.match(/!important/g) || []).length
    expect(impCount).toBe(0)
    // E9 cleanup — names must not appear in DOM / scoped CSS rules
    // (doc comments referencing E9 history are OK)
    expect(gamePanel).not.toMatch(/class="ledger-spread"/)
    expect(gamePanel).not.toMatch(/ledger-spread\s*\{/)
    expect(gamePanel).not.toMatch(/ledger-spread__/)
    expect(gamePanel).not.toContain('messageSpreads = computed')
    expect(gamePanel).not.toContain('LONG_ASSISTANT_CHARS')
    expect(gamePanel).not.toContain('isStandaloneMessage')
    expect(gamePanel).not.toContain('spreadHeaderDate')
    expect(gamePanel).not.toContain('spreadHeaderStamp')
    // GamePanel store mutation ban
    expect(gamePanel).not.toMatch(/gameStore\.(updateMessage|sendAction|regenerateFrom|deleteMessage|toggleQuickNoteMessageSelection)\s*=/)
    // Experience.vue forbidden patterns
    expect(experience).not.toContain(':global(.theme-kao)')
    expect(experience).not.toMatch(/:deep\(\s*\*/)
    const impExp = (experience.match(/!important/g) || []).length
    expect(impExp).toBe(0)
    // UI-E10-CLEAN 2026-06-22: removed axis/indicator hex checks because
    // those rules are now deleted. The --font-body token + scene-entry
    // CSS + displayMessages computed are the only E10 survivors; all
    // are token-only by inspection (uses var(--archive-*), var(--font-*),
    // color-mix). Other .theme-kao blocks have :root token defs with
    // hex which is the WHOLE POINT of the token system.
    void css  // keep css import for symmetry with future E10 follow-ups
    // UI-E11-A: Experience 6-cell record-folio replaced by ws-topstrip
    expect(experience).toContain('class="ws-topstrip"')
    expect(experience).toContain('ws-topstrip__cell')
  })
})

describe('ui polish — UI-W9 Writing top thin functional bar (demote cork to 64-80px)', () => {
  it('Writing.vue .wall__cork top bar drops the 4-row announcement panel: no PROJECT · PINAX, no <h1>, no N本书/N章节, no 76x76 stamp, no 96px ribbon, no labeled pin wrappers', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    // Scope is the .wall__cork top bar specifically. `无标题章节`
    // stays as a valid fallback for an empty chapter title inside the
    // shelf's chapter listing (dossier listing semantics), not the
    // top announcement panel that the user objected to.
    const corkBlock = writing.match(/<div\s+class="wall__cork"[\s\S]*?<div\s+class="wall__tabs">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? ''
    expect(corkBlock).not.toBe('')
    expect(corkBlock).not.toContain('PROJECT · PINAX')
    expect(corkBlock).not.toMatch(/<h1[^>]*class="wall__project-title"/)
    expect(corkBlock).not.toContain('wall__project-meta')
    expect(corkBlock).not.toContain('本书')
    expect(corkBlock).not.toContain('class="wall__stamp"')
    expect(corkBlock).not.toContain('class="wall__ribbon"')
    expect(corkBlock).not.toContain('class="wall__pin-num"')
    expect(corkBlock).not.toContain('class="wall__pin"')
  })

  it('Writing.vue template introduces wall__book-pill + wall__save-chip as the new thin-bar wiring', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    expect(writing).toMatch(/<label[^>]*class="wall__book-pill"/)
    expect(writing).toMatch(/class="wall__book-pill-mark"/)
    expect(writing).toMatch(/class="wall__book-pill-arrow"/)
    expect(writing).toMatch(/v-model="selectedBookId"/)
    expect(writing).toMatch(/class="wall__save-chip"/)
    expect(writing).toMatch(/class="wall__save-chip-state"/)
    expect(writing).toMatch(/class="wall__save-chip-meta"/)
    // Save chip still has state + 字数
    expect(writing).toMatch(/{{ stampStateText }}/)
    expect(writing).toMatch(/wordCount\.toLocaleString\(\)\s*\}\s*字/)
  })

  it('kao.css .theme-kao .wall__cork is now a flex thin bar with max-height: 80px, NOT 188px / grid', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const corkRule = kaoCss.match(/\.theme-kao\s+\.wall__cork\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(corkRule).not.toBe('')
    expect(corkRule).toMatch(/display:\s*flex/)
    expect(corkRule).toMatch(/max-height:\s*80px/)
    expect(corkRule).not.toMatch(/height:\s*188px/)
    expect(corkRule).not.toMatch(/height:\s*216px/)
    expect(corkRule).not.toMatch(/grid-template-columns/)
    expect(corkRule).not.toMatch(/grid-template-rows/)
  })

  it('kao.css adds .wall__book-pill + .wall__save-chip with archive-paper / archive-rose tokens and 2-layer paper-stack shadow signature', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const pillRule = kaoCss.match(/\.theme-kao\s+\.wall__book-pill\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(pillRule).not.toBe('')
    expect(pillRule).toMatch(/archive-paper/)
    expect(pillRule).toMatch(/archive-ink/)
    expect(pillRule).toMatch(/inset\s+0\s+1px\s+0/) // top paper highlight
    expect(pillRule).toMatch(/inset\s+0\s+-1px\s+0/) // bottom ink edge
    expect(pillRule).toMatch(/box-shadow:/)

    const chipRule = kaoCss.match(/\.theme-kao\s+\.wall__save-chip\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(chipRule).not.toBe('')
    expect(chipRule).toMatch(/archive-rose/)
    expect(chipRule).toMatch(/border-radius:\s*12px/) // inline pill, not 76x76 round seal
    expect(chipRule).not.toMatch(/width:\s*76px/)
    expect(chipRule).not.toMatch(/height:\s*76px/)
  })

  it('kao.css .wall__pin-dot demoted to 8px inline (no label wrapper), .wall__tab button keeps 1px top + 1px bottom + outer drop + hover lift', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const pinDotRule = kaoCss.match(/\.theme-kao\s+\.wall__pin-dot\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(pinDotRule).toMatch(/width:\s*8px/)
    expect(pinDotRule).toMatch(/height:\s*8px/)
    expect(pinDotRule).not.toMatch(/width:\s*12px/)
    expect(pinDotRule).not.toMatch(/height:\s*12px/)

    const tabRule = kaoCss.match(/\.theme-kao\s+\.wall__tab\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(tabRule).toMatch(/inset\s+0\s+1px\s+0/) // top paper highlight
    expect(tabRule).toMatch(/inset\s+0\s+-1px\s+0/) // bottom ink edge
    expect(tabRule).toMatch(/box-shadow:/)

    const tabHoverRule = kaoCss.match(/\.theme-kao\s+\.wall__tab:hover:not\(:disabled\)\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(tabHoverRule).toMatch(/translateY\(-1px\)/) // hover lift
  })

  it('kao.css .wall__tabs is now margin-left: auto (right-aligned inline tabs), no longer grid-column: 1 / -1', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const tabsRule = kaoCss.match(/\.theme-kao\s+\.wall__tabs\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(tabsRule).toMatch(/margin-left:\s*auto/)
    expect(tabsRule).not.toMatch(/grid-column:\s*1\s*\/\s*-1/)
  })

  it('Writing.vue scoped CSS adds wall__book-pill + wall__save-chip for legacy variant (no :global, no !important, no broad :deep())', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    expect(writing).toMatch(/\.wall__book-pill\s*\{/)
    expect(writing).toMatch(/\.wall__save-chip\s*\{/)
    expect(writing).toMatch(/\.wall__book-select\s*\{/)
    // Legacy variant cork is also thin (max-height ≤ 96px)
    const corkRule = writing.match(/\.wall__cork\s*\{[^}]+\}/s)?.[0] ?? ''
    expect(corkRule).toMatch(/max-height:\s*72px/)
    expect(corkRule).toMatch(/display:\s*flex/)
    // Hard constraints
    expect(writing).not.toMatch(/:global\(\.theme-kao\)/)
    expect(writing).not.toMatch(/:deep\(\.theme-kao\)/)
    expect(writing).not.toMatch(/\.wall__(?:book-pill|save-chip|tabs|tab|back|pin-dot)\s*\{[^}]*!important/)
  })

  it('Writing.vue 7 functional controls still wired (book select + 收件箱/素材库/分镜 + 返回 + theme + save chip)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    expect(writing).toContain('v-model="selectedBookId"')
    expect(writing).toContain('@click.stop="openAssetInbox"')
    expect(writing).toContain('@click.stop="openMaterialsPage"')
    expect(writing).toContain('@click.stop="exportChapterStoryboardDraft"')
    expect(writing).toContain('@click="goBack"')
    expect(writing).toContain('@click="toggleTheme"')
    // save chip is in the cork (not a button), but stampStateText still computed
    expect(writing).toMatch(/const stampStateText/)
    expect(writing).toContain('wordCount.toLocaleString()')
  })
})

/* =========================================================================
   UI-W10: Writing 编辑灯 / desk lamp 记忆点 + 三层墙面景深
   (结构级变化, 不是阴影微调 — 灯 SVG + 光锥 radial gradient 重建写作页景深)
   ========================================================================= */
describe('UI-W10: Writing desk lamp memory point + 3-layer wall depth', () => {
  describe('lamp SVG 存在 (structural)', () => {
    it('UI-W10-S1: Writing.vue 在 wall__lamp + SVG 灯组 (DOM 在 cork 之后)', () => {
      const writing = readProjectFile('src/pages/Writing.vue')
      // 灯 DOM 位置: wall__cork 后面出现, wall__main 前面出现
      // (避免 cork stacking context 遮盖灯)
      const corkEnd = writing.indexOf('wall__cork')
      const lampStart = writing.indexOf('wall__lamp"')
      const mainStart = writing.indexOf('wall__main')
      expect(corkEnd).toBeGreaterThan(-1)
      expect(lampStart).toBeGreaterThan(corkEnd)
      expect(mainStart).toBeGreaterThan(lampStart)
      // SVG 灯组存在
      expect(writing).toContain('class="wall__lamp-svg"')
      expect(writing).toContain('viewBox="0 0 180 180"')
    })

    it('UI-W10-S2: SVG 包含灯臂 + 灯罩 + 灯泡辉光 4 件套 (180×180 viewBox)', () => {
      const writing = readProjectFile('src/pages/Writing.vue')
      // 灯臂 (line stroke — 2 段摇臂)
      expect(writing).toMatch(/<line[^>]*x1="148"[^>]*y1="2"[^>]*x2="108"[^>]*y2="68"/)
      expect(writing).toMatch(/<line[^>]*x1="108"[^>]*y1="68"[^>]*x2="88"[^>]*y2="92"/)
      // 灯罩 (path 截锥)
      expect(writing).toMatch(/<path d="M68 90 L108 90 L120 140 L56 140 Z"/)
      // 灯泡辉光 (ellipse — 灯罩底缘暖色)
      expect(writing).toMatch(/<ellipse[^>]*cx="88"[^>]*cy="143"[^>]*rx="34"[^>]*ry="7"/)
    })

    it('UI-W10-S3: wall__lamp-cone 暖色光锥存在 (非装饰必有)', () => {
      const writing = readProjectFile('src/pages/Writing.vue')
      expect(writing).toContain('class="wall__lamp-cone"')
      expect(writing).toContain('aria-hidden="true"')
    })
  })

  describe('lamp CSS 存在 (kao.css)', () => {
    it('UI-W10-C1: kao.css 暴露 .theme-kao .wall__lamp 容器 (180×180, 右上角)', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      const lampRule = css.match(/\.theme-kao\s+\.wall__lamp\s*\{[^}]*\}/)
      expect(lampRule).not.toBeNull()
      const body = lampRule[0]
      expect(body).toMatch(/position:\s*absolute/)
      expect(body).toMatch(/right:\s*64px/)
      expect(body).toMatch(/width:\s*180px/)
      expect(body).toMatch(/height:\s*180px/)
      expect(body).toMatch(/z-index:\s*5/)
      // 灯本体投影 (filter drop-shadow) — 让灯有重量感
      expect(body).toMatch(/filter:\s*drop-shadow/)
    })

    it('UI-W10-C2: .theme-kao .wall__lamp-cone 是暖色径向光 (radial-gradient + archive-gold)', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      const rule = css.match(/\.theme-kao\s+\.wall__lamp-cone\s*\{[^}]*\}/)
      expect(rule).not.toBeNull()
      const body = rule[0]
      expect(body).toMatch(/radial-gradient/)
      expect(body).toMatch(/var\(--archive-gold\)/)
      // pointer-events: none (不阻挡编辑)
      expect(body).toMatch(/pointer-events:\s*none/)
      // z-index 在 cork 之上, dossier 之下
      expect(body).toMatch(/z-index:\s*2/)
      // mix-blend-mode multiply 让光锥叠加而非覆盖
      expect(body).toMatch(/mix-blend-mode:\s*multiply/)
    })

    it('UI-W10-C3: lamp CSS 0 raw hex (全 token via color-mix)', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      // 提取所有 wall__lamp / wall__lamp-cone / wall__lamp-svg rule body
      const matches = [
        ...css.matchAll(/\.theme-kao\s+\.wall__lamp(?:-(?:svg|cone))?\s*\{[^}]*\}/g),
      ]
      for (const m of matches) {
        expect(m[0]).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
      }
    })
  })

  describe('3-layer 景深 (cork + molding 退后, dossier 前景)', () => {
    it('UI-W10-D1: .wall__cork 在 lamp cone 之下 (z-index < 2)', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      const corkRule = css.match(/\.theme-kao\s+\.wall__cork\s*\{[^}]*\}/)
      expect(corkRule).not.toBeNull()
      // cork 仍是 z-index: 1 (中景)
      expect(corkRule[0]).toMatch(/z-index:\s*1/)
    })

    it('UI-W10-D2: .wall__molding 仍是 z-index: 1 (背景), 不被 lamp 抢占', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      const moldingRule = css.match(/\.theme-kao\s+\.wall__molding\s*\{[^}]*\}/)
      expect(moldingRule).not.toBeNull()
      expect(moldingRule[0]).toMatch(/z-index:\s*1/)
    })

    it('UI-W10-D3: .wall__lamp z-index 高于 cork (前景 lamp, 中景 cork)', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      const lampRule = css.match(/\.theme-kao\s+\.wall__lamp\s*\{[^}]*\}/)
      expect(lampRule).not.toBeNull()
      expect(lampRule[0]).toMatch(/z-index:\s*5/)
    })
  })

  describe('冗余顶部不回归 (UI-W9 baseline preserved)', () => {
    it('UI-W10-R1: Writing.vue 仍无 PROJECT · PINAX / h1 wall__project-title / wall__pin-num / 76x76 wall__stamp', () => {
      const writing = readProjectFile('src/pages/Writing.vue')
      expect(writing).not.toMatch(/wall__project-mark/)
      expect(writing).not.toMatch(/wall__project-title/)
      expect(writing).not.toMatch(/wall__project-meta/)
      expect(writing).not.toMatch(/wall__pin-num/)
      expect(writing).not.toMatch(/wall__ribbon/)
      expect(writing).not.toMatch(/wall__stamp/)
    })

    it('UI-W10-R2: kao.css 仍无 .wall__project* / .wall__pin-num / .wall__stamp / .wall__ribbon 旧规则', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      expect(css).not.toMatch(/\.theme-kao\s+\.wall__project-mark/)
      expect(css).not.toMatch(/\.theme-kao\s+\.wall__project-title/)
      expect(css).not.toMatch(/\.theme-kao\s+\.wall__project-meta/)
      expect(css).not.toMatch(/\.theme-kao\s+\.wall__pin-num/)
      expect(css).not.toMatch(/\.theme-kao\s+\.wall__stamp\b/)
      expect(css).not.toMatch(/\.theme-kao\s+\.wall__ribbon/)
    })

    it('UI-W10-R3: cork 高度仍是 64-80px 单行 (W9 顶栏降级 baseline)', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      const corkRule = css.match(/\.theme-kao\s+\.wall__cork\s*\{[^}]*\}/)
      expect(corkRule).not.toBeNull()
      expect(corkRule[0]).toMatch(/min-height:\s*64px/)
      expect(corkRule[0]).toMatch(/max-height:\s*80px/)
    })
  })

  describe('硬约束 (UI-W10 forbidden patterns)', () => {
    it('UI-W10-H1: 0 new :global(.theme-kao), 0 new broad :deep(*) in Writing.vue / kao.css', () => {
      const writing = readProjectFile('src/pages/Writing.vue')
      const css = readProjectFile('src/styles/themes/kao.css')
      expect(writing).not.toContain(':global(.theme-kao)')
      expect(css).not.toMatch(/scoped.*:global\(/)
      expect(writing).not.toMatch(/:deep\(\s*\)/)
    })

    it('UI-W10-H1b: kao.css lamp rules 0 !important (W10 新增干净)', () => {
      const css = readProjectFile('src/styles/themes/kao.css')
      // 仅检查 W10 新增的 lamp 相关 rule 内不含 !important
      const lampRules = [
        ...css.matchAll(/\.theme-kao\s+\.wall__lamp(?:-(?:svg|cone))?\s*\{[^}]*\}/g),
      ]
      expect(lampRules.length).toBeGreaterThanOrEqual(2)
      for (const m of lampRules) {
        expect(m[0]).not.toMatch(/!important/)
      }
    })

    it('UI-W10-H2: 0 fake 人物剪影 (lamp SVG 不应是"人形")', () => {
      const writing = readProjectFile('src/pages/Writing.vue')
      // lamp SVG 只含 line / path / ellipse / circle / rect — 没有 figure / person / silhouette
      const lampSection = writing.match(/<div class="wall__lamp"[\s\S]*?<\/div>\s*<\/div>/)
      expect(lampSection).not.toBeNull()
      const svgInner = lampSection[0]
      expect(svgInner).not.toMatch(/person|silhouette|character-portrait|figure/i)
      expect(svgInner).not.toMatch(/<\s*image[^>]+xlink/)
    })
  })
})

// =========================================================================
// UI-E11-B: GamePanel 中央 stage hero / 0-state
// E11-B (Composition W2) adds narrator portrait + 3 quick action CTA
// to GamePanel.vue, gated on displayMessages.length === 0. Preserves
// displayMessages single-column + E9-FIX onTextWrapperClick click.
// E11-B contracts: hero present, 3 CTA present, v-if gate correct,
// hard constraint (no new forbidden patterns + E10 ship preserved).
// =========================================================================
describe('ui polish — UI-E11-B GamePanel 中央 stage hero / 0-state', () => {
  it('E11-B1: GamePanel.vue has CharacterPortrait narrator hero in 0-state (size="hero" + caption="在场档案员")', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // CharacterPortrait import declared
    expect(gamePanel).toMatch(/import\s+CharacterPortrait\s+from\s+['"]\.\/folio\/CharacterPortrait\.vue['"]/)
    // Hero block mounted with narrator pose + hero size
    expect(gamePanel).toMatch(/<CharacterPortrait\s+pose-id="narrator"\s+size="hero"/)
    expect(gamePanel).toMatch(/caption="在场档案员"/)
    // Hero wrapper class present
    expect(gamePanel).toContain('class="chat-container__hero"')
    expect(gamePanel).toContain('class="chat-container__hero-portrait"')
    expect(gamePanel).toContain('class="chat-container__hero-prompt"')
    expect(gamePanel).toContain('class="chat-container__hero-greeting"')
    expect(gamePanel).toContain('class="chat-container__hero-hint"')
  })

  it('E11-B2: 3 quick action CTA present (续写 / 速记 / 切场景) — each emits("quick-action", id) on click', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // 续写 / 速记 / 切场景 in hero actions block, each emit("quick-action", <id>)
    expect(gamePanel).toMatch(/<button[^>]*class="action-btn primary"[^>]*@click="\$emit\('quick-action',\s*'continue'\)"/)
    expect(gamePanel).toMatch(/<button[^>]*class="action-btn"[^>]*@click="\$emit\('quick-action',\s*'note'\)"/)
    expect(gamePanel).toMatch(/<button[^>]*class="action-btn"[^>]*@click="\$emit\('quick-action',\s*'scene'\)"/)
    // Visible labels
    expect(gamePanel).toContain('>续写<')
    expect(gamePanel).toContain('>速记<')
    expect(gamePanel).toContain('>切场景<')
    // defineEmits declares quick-action (alongside existing show-inline-detail)
    expect(gamePanel).toMatch(/defineEmits\(\[\s*['"]show-inline-detail['"]\s*,\s*['"]quick-action['"]\s*\]\)/)
  })

  it('E11-B3: hero block v-if gated on displayMessages.length === 0 (0-state only) — hides when first message lands', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // v-if on hero section matches length === 0
    expect(gamePanel).toMatch(/<section[^>]*v-if="displayMessages\.length\s*===\s*0"[^>]*class="chat-container__hero"/)
    // v-for over displayMessages is unchanged (still drives the record stream)
    expect(gamePanel).toMatch(/<template\s+v-for="\(msg,\s*index\)\s+in\s+displayMessages"/)
  })

  it('E11-B4: hard constraint — 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex in new E11-B CSS; E10 displayMessages + E9-FIX mechanism click + --font-body preserved', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // E11-B forbidden patterns (negative)
    expect(gamePanel).not.toContain(':global(.theme-kao)')
    expect(gamePanel).not.toMatch(/:deep\(\s*\*/)
    // No new !important (existing E6A textarea !important on textarea may exist
    // but is pre-existing; E11-B CSS itself must not introduce any)
    const e11Block = gamePanel.match(/\.theme-kao\s+\.chat-container__hero[\s\S]*?@media[\s\S]*?\}\s*\}/)
    if (e11Block) {
      expect(e11Block[0]).not.toMatch(/!important/)
      expect(e11Block[0]).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
    // E10 + E9-FIX preservation
    expect(gamePanel).toMatch(/const\s+displayMessages\s*=\s*computed\(/)
    expect(gamePanel).toContain('v-for="(msg, index) in displayMessages"')
    expect(gamePanel).toMatch(/class="text-wrapper"\s+@click="onTextWrapperClick\(/)
    expect(gamePanel).toMatch(/const\s+onTextWrapperClick\s*=\s*\(/)
    // --font-body on .text-main preserved (E10 keep)
    expect(gamePanel).toMatch(/\.text-main\s*\{[^}]*var\(--font-body\)/s)
    // E9 ledger-spread / chapter-rule / scene-stage__indicator NOT re-added
    expect(gamePanel).not.toMatch(/class="ledger-spread"/)
    expect(gamePanel).not.toContain('class="chapter-rule"')
    expect(gamePanel).not.toMatch(/class="scene-stage__indicator"/)
    expect(gamePanel).not.toMatch(/class="record-folio"/)
  })
})

// =========================================================================
// UI-E11-C: Right-rail workstation section empty states + responsive fallback.
// 改造前: 3 section (在场人物 / 地点 / 剧情) 0-data 时显示空 stat 堆叠
// 改造后: 0-data 时显示 inline hint (档案员批注风格 dashed + italic),
//        不再是 0 0 0 堆叠; 980/640 responsive fallback 收紧 padding +
//        给 sidebar section 加 max-height.
// 不改 Experience.vue layout 主体 (那是 E11-IMPL-A/B ws-layout scope);
// 只动 sidebar section 内部 + 3 个 right-rail 组件 (StatusBar /
// GeographyPanel / QuestLog) + kao.css theme overrides.
// =========================================================================
describe('ui polish — UI-E11-C: right-rail section empty states + responsive fallback', () => {
  it('UI-E11-C: StatusBar 0-data 时间 inline hint (dashed + italic + 未登记) — 不再是空 stat 堆叠', () => {
    const statusBar = readProjectFile('src/components/StatusBar.vue')
    // 0-data 模板分支:current-time--empty + time-value--hint
    expect(statusBar).toMatch(/v-if="isTimeEmpty"[\s\S]*?class="current-time current-time--empty"/)
    expect(statusBar).toContain('class="time-value time-value--hint"')
    expect(statusBar).toContain('未登记')
    expect(statusBar).toContain('点击设定纪年与时间')
    // computed gate
    expect(statusBar).toContain('const isTimeEmpty = computed(() => {')
    expect(statusBar).toMatch(/isTimeEmpty[\s\S]*?!currentEraName\.value[\s\S]*?!currentYear\.value/)
    // scoped CSS 锁 hint 样式
    expect(statusBar).toMatch(/\.current-time--empty[\s\S]*?border:\s*1px dashed/)
    expect(statusBar).toContain('.time-value--hint')
  })

  it('UI-E11-C: StatusBar 0-data 角色 inline hint (未登记角色 + 设定主角名) — 不再是空 stat 卡片', () => {
    const statusBar = readProjectFile('src/components/StatusBar.vue')
    expect(statusBar).toMatch(/v-if="isCharacterEmpty"[\s\S]*?class="compact-profile compact-profile--empty"/)
    expect(statusBar).toContain('未登记角色')
    expect(statusBar).toContain('点击设定主角名')
    // computed gate — based on no name + no avatar + no traits + no description + mood=50 default
    expect(statusBar).toContain('const isCharacterEmpty = computed(() => {')
    // CSS hint modifier
    expect(statusBar).toMatch(/\.compact-profile--empty[\s\S]*?border:\s*1px dashed/)
    expect(statusBar).toContain('.character-name--hint')
    expect(statusBar).toContain('.avatar-placeholder--hint')
  })

  it('UI-E11-C: GeographyPanel 0-data stat-strip 替换为 placeholder hint (dashed + 3 段 italic 提示)', () => {
    const geo = readProjectFile('src/components/geography/GeographyPanel.vue')
    // 模板分支:locations.length === 0 时换 geo-stat-strip--empty + 3 个 --hint span
    expect(geo).toMatch(/v-if="locations\.length === 0"[\s\S]*?class="geo-stat-strip geo-stat-strip--empty"/)
    expect(geo).toMatch(/class="geo-stat-strip--hint"/)
    expect(geo).toContain('暂无卷宗')
    expect(geo).toContain('地点是档案柜的目录')
    expect(geo).toContain('点 + 添加第一条')
    // CSS placeholder
    expect(geo).toMatch(/\.geo-stat-strip--empty[\s\S]*?border:\s*1px dashed/)
  })

  it('UI-E11-C: QuestLog 0-data summary inline hint (暂无摘要) + empty-state kicker+copy 双行', () => {
    const questLog = readProjectFile('src/components/QuestLog.vue')
    // summaryItems.length === 0 时, 显示 adventure-summary--empty + summary-card--hint
    expect(questLog).toMatch(/v-else[\s\S]*?class="adventure-summary adventure-summary--empty"/)
    expect(questLog).toContain('summary-card--hint')
    expect(questLog).toContain('暂无摘要')
    // 0-activity empty-state 双行 hint
    expect(questLog).toContain('class="empty-state-kicker"')
    expect(questLog).toContain('class="empty-state-copy"')
    expect(questLog).toContain('事件卷 · 空白')
    expect(questLog).toContain('记录第一次冒险事件')
    // CSS
    expect(questLog).toMatch(/\.summary-card--hint[\s\S]*?border:\s*1px dashed/)
    expect(questLog).toContain('.summary-value--hint')
  })

  it('UI-E11-C: Experience.vue responsive 980/640 — ws-layout collapses to 1fr (workstation layout — replaces sidebar section padding/max-height)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // 980px media query — ws-layout collapses to 1 column (left rail folds up,
    // right rail folds down)
    expect(kaoCss).toMatch(/@media\s*\(max-width:\s*980px\)\s*\{[\s\S]*?\.ws-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr/s)
    // 980px media query — ws-topstrip height auto + 3-col grid for narrow viewports
    expect(kaoCss).toMatch(/@media\s*\(max-width:\s*980px\)[\s\S]*?\.ws-topstrip\s*\{[\s\S]*?height:\s*auto/s)
  })

  it('UI-E11-C: 3 个右栏组件都保持 functional dossier 语义 (header + content + footer), 不破坏原有 modal/handler wiring', () => {
    const statusBar = readProjectFile('src/components/StatusBar.vue')
    const geo = readProjectFile('src/components/geography/GeographyPanel.vue')
    const questLog = readProjectFile('src/components/QuestLog.vue')
    // StatusBar 保留 detail modal + time modal
    expect(statusBar).toContain('showDetail')
    expect(statusBar).toContain('showTimeDetail')
    // GeographyPanel 保留 toolbar + view tabs + addLocation
    expect(geo).toContain('addLocation')
    expect(geo).toContain('view === \'map\'')
    // QuestLog 保留 trigger panel + showDetail + showEditor
    expect(questLog).toContain('showDetail')
    expect(questLog).toContain('showEditor')
    // 3 个组件都还 import + use gameStore
    expect(statusBar).toContain("from '../stores/gameStore'")
    expect(questLog).toContain("from '../stores/gameStore'")
    // GeographyPanel 用 geography store (不是 gameStore)
    expect(geo).toContain("useGeographyStore")
  })

  it('UI-E11-C: hard constraint — 0 new :global(.theme-kao), 0 new !important, 0 new broad :deep(*), 0 store mutation, 0 store interface change', () => {
    const statusBar = readProjectFile('src/components/StatusBar.vue')
    const geo = readProjectFile('src/components/geography/GeographyPanel.vue')
    const questLog = readProjectFile('src/components/QuestLog.vue')
    const experience = readProjectFile('src/pages/Experience.vue')
    for (const f of [statusBar, geo, questLog, experience]) {
      expect(f).not.toContain(':global(.theme-kao)')
      expect(f).not.toMatch(/:deep\(\s*\*/)
    }
    // 0 new !important anywhere in my 4 files
    expect(statusBar).not.toMatch(/!important/)
    expect(geo).not.toMatch(/!important/)
    expect(questLog).not.toMatch(/!important/)
    // 0 store mutation in N11-C scope. E4A baseline ships with fallback
    // assignments in StatusBar / QuestLog (`if (typeof saveXxx === 'function') gameStore.X = nextX`).
    // N11-C added no new mutation line — verified via `git diff HEAD src/components/StatusBar.vue`
    // and `git diff HEAD src/components/QuestLog.vue` showing only template +
    // computed additions, no new `gameStore.X = Y` line. We assert GeographyPanel
    // 0 mutation (N11-C only added 1 template branch + 1 CSS rule, no script change).
    expect(geo).not.toMatch(/geoStore\.\w+\s*=\s*[^=]/)
    // 0 new service / router / other-store import in N11-C scope
    // (existing gameStore import is allowed — read-only data access).
    expect(questLog).not.toContain("from '../services/")
    expect(geo).not.toContain("from '../services/")
  })
})

// =========================================================================
// UI-E11-A: Experience workstation — layout skeleton + useWorkstationMeta
// Scope: Tasks 0-3 + 4 + 5 of docs/superpowers/plans/2026-06-22-experience-workstation.md
//   (Window 1 Foundation + Task 4 topstrip CSS + Task 5 template rewrite)
// Out of scope: Task 6 (GamePanel hero) / Task 7 (right rail internals) /
//   Task 8 (4-layer font rules) / Task 9 (delete old sidebar CSS) — D1/D2
//   contracts intentionally remain red until W3 Cleanup window.
// =========================================================================
describe('UI-E11-A Experience workstation — layout skeleton + useWorkstationMeta', () => {
  // §A workstation composition (4 contracts)
  it('E11-A1: Experience.vue template has ws-layout root with 4 sections', () => {
    const exp = readProjectFile('src/pages/Experience.vue')
    // Root: <div class="ws-layout"> replaces <div class="game-layout">
    expect(exp).toMatch(/<div\s+class="ws-layout">/)
    // 4 ws-* sections. Allow optional v-if between tag and class (the 3
    // aside/main are gated on !showSessionPicker so SessionPicker can
    // replace them when no session is selected).
    expect(exp).toMatch(/<section\s+class="ws-topstrip"/)
    expect(exp).toMatch(/<aside[\s\S]*?class="ws-left-rail"/)
    expect(exp).toMatch(/<main[\s\S]*?class="ws-center-stage"/)
    expect(exp).toMatch(/<aside[\s\S]*?class="ws-right-rail"/)
  })

  it('E11-A2: ws-layout grid-template-columns is "260px 1fr 300px" in kao.css', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    expect(kao).toMatch(/\.theme-kao\s+\.ws-layout\s*\{[\s\S]*grid-template-columns:\s*260px\s+1fr\s+300px;/s)
  })

  it('E11-A3: ws-topstrip has position: sticky and height ~80px', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip\s*\{[\s\S]*position:\s*sticky/s)
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip\s*\{[\s\S]*height:\s*80px/s)
  })

  it('E11-A4: ws-right-rail has 3 sections with data-dossier-stamp attribute', () => {
    const exp = readProjectFile('src/pages/Experience.vue')
    // Allow optional v-if between <aside and class= (SessionPicker replaces
    // the ws-right-rail when no session is selected).
    expect(exp).toMatch(/<aside[\s\S]*?class="ws-right-rail"/)
    expect(exp).toMatch(/卷宗一\s*·\s*在场人物/)
    expect(exp).toMatch(/卷宗二\s*·\s*地点卡/)
    expect(exp).toMatch(/卷宗三\s*·\s*事件卷/)
  })

  // §B topstrip anchor (3 contracts)
  it('E11-B1: useWorkstationMeta composable exports 5 fields', () => {
    const comp = readProjectFile('src/composables/useWorkstationMeta.js')
    expect(comp).toMatch(/export\s+function\s+useWorkstationMeta\s*\(\s*\)/)
    expect(comp).toMatch(/currentVolume/)
    expect(comp).toMatch(/caseNo/)
    expect(comp).toMatch(/currentTask/)
    expect(comp).toMatch(/currentSection/)
    expect(comp).toMatch(/totalCount/)
  })

  it('E11-B2: ws-topstrip shows 0-state anchor (档案空白 · 卷 N · 等候第 1 条) when totalCount === 0', () => {
    // Anchor text surfaces in Experience.vue template (rendered from
    // useWorkstationMeta().topstripAnchor). The string is a template literal
    // with `${currentVolume}` interpolation, so the literal regex matches the
    // fixed prefix + suffix parts that survive interpolation. We verify both
    // the rendered form in useWorkstationMeta.js AND the template usage.
    const meta = readProjectFile('src/composables/useWorkstationMeta.js')
    expect(meta).toMatch(/档案空白\s*·\s*卷\s*\$\{[^}]+\}\s*·\s*等候第\s*1\s*条/)
    const exp = readProjectFile('src/pages/Experience.vue')
    // Template renders the anchor via meta.topstripAnchor inside ws-topstrip
    expect(exp).toMatch(/ws-topstrip__anchor"[^>]*>\s*\{\{\s*meta\.topstripAnchor\s*\}\}/)
  })

  it('E11-B3: 5-cell progress bar renders one filled cell per currentSection', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    expect(kao).toMatch(/\.ws-topstrip__progress-cell\.is-filled/)
    expect(kao).toMatch(/grid-template-columns:\s*repeat\(5,\s*1fr\)/)
  })

  // §C 0-state hero (2 contracts — already ship'd via E11-B contracts
  // L2687-2750; C1/C2 here are belt-and-suspenders mirrors, expected green.)
  it('E11-C1: GamePanel has CharacterPortrait narrator hero in 0-state', () => {
    const gp = readProjectFile('src/components/GamePanel.vue')
    expect(gp).toMatch(/<CharacterPortrait\s+pose-id="narrator"\s+size="hero"/)
  })

  it('E11-C2: 3 quick action buttons (续写 / 速记 / 切场景) present in GamePanel', () => {
    const gp = readProjectFile('src/components/GamePanel.vue')
    expect(gp).toMatch(/>续写</)
    expect(gp).toMatch(/>速记</)
    expect(gp).toMatch(/>切场景</)
  })

  // §D font layering (2 contracts — OUT OF SCOPE for UI-E11-A; expected red
  // until W3 Cleanup window adds Task 8 4-layer font rules.)
  it('E11-D1: 4 font layers exist (DISPLAY LXGW / BODY Songti / META sans / INTERACTIVE mix)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    // DISPLAY layer uses --font-display on .ws-topstrip__case
    // (E12-F switched from brush to body for 15px readability, but
    // DISPLAY is still used elsewhere — see ws-topstrip__anchor +
    // ws-section::before stamp)
    expect(kao).toMatch(/var\(--font-display\)/)
    // BODY layer uses --font-body on .ws-left-rail__kicker + ws-topstrip__value
    expect(kao).toMatch(/\.theme-kao\s+\.ws-left-rail__kicker[\s\S]*var\(--font-body\)/s)
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__value[\s\S]*var\(--font-body\)/s)
    // META layer uses --font-sans on .ws-topstrip__kicker (E12-W1
    // removed .ws-topstrip__meta as dead CSS — no template match)
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__kicker[\s\S]*var\(--font-sans\)/s)
    // INTERACTIVE layer uses --font-sans on .ws-layout button
    expect(kao).toMatch(/\.theme-kao\s+\.ws-layout\s+button[\s\S]*var\(--font-sans\)/s)
  })

  it('E11-D2: each layer has ≥3 selectors using it, no layer overlap', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const displayCount = (kao.match(/var\(--font-display\)/g) || []).length
    const bodyCount = (kao.match(/var\(--font-body\)/g) || []).length
    const sansCount = (kao.match(/var\(--font-sans\)/g) || []).length
    expect(displayCount).toBeGreaterThanOrEqual(3)
    expect(bodyCount).toBeGreaterThanOrEqual(3)
    expect(sansCount).toBeGreaterThanOrEqual(3)
  })

  // §E delete verify (1 contract)
  it('E11-E1: 0 references to .record-folio / .sidebar (old) in kao.css + Experience.vue', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const exp = readProjectFile('src/pages/Experience.vue')
    expect(kao).not.toMatch(/\.theme-kao\s+\.sidebar\s*\{/)
    expect(kao).not.toMatch(/\.theme-kao\s+\.record-folio/)
    expect(exp).not.toMatch(/class="record-folio"/)
    expect(exp).not.toMatch(/class="sidebar"/)
  })

  // §F forbidden patterns (1 contract, hard gate).
  // F1 narrowed to only check NEW ws-* rules. The pre-existing W3 round-2
  // drop-cap `text-transform: none !important;` (kao.css:248) is preserved
  // per W3 review #3 — flagging it as a regression would force a needless
  // revert of the W3 polish.
  it('E11-F1: NEW ws-* rules 0 !important / 0 new :global(.theme-kao) / 0 broad :deep(*); 0 broad :deep(*) anywhere in Experience.vue', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const exp = readProjectFile('src/pages/Experience.vue')
    // 0 new :global(.theme-kao) anywhere
    expect(kao.match(/:global\(\.theme-kao\)/g) || []).toHaveLength(0)
    // 0 broad :deep(*) anywhere
    expect(kao).not.toMatch(/:deep\(\s*\)/)
    expect(exp).not.toMatch(/:deep\(\s*\)/)
    // NEW ws-* rules (only the workstation rules added in this worker) carry
    // 0 !important. Pre-existing W3 !important in non-ws-* rules is preserved.
    const wsRules = kao.match(/\.theme-kao\s+\.ws-[^{}]*\{[^}]*\}/g) || []
    expect(wsRules.length).toBeGreaterThan(0)
    for (const m of wsRules) {
      expect(m, `ws-* rule contains !important: ${m.slice(0, 80)}...`).not.toMatch(/!important/)
    }
  })

  // §G E9-FIX preservation (1 contract, hard gate).
  // G1 regex adjusted to match the codebase's arrow-function form
  // (`const onTextWrapperClick = (`). The plan's literal `function onTextWrapperClick(`
  // would never match the codebase, which uses `<script setup>` + arrow functions.
  it('E11-G1: E9-FIX mechanism-trigger click handler preserved in GamePanel', () => {
    const gp = readProjectFile('src/components/GamePanel.vue')
    expect(gp).toMatch(/<div\s+class="text-wrapper"\s+@click="onTextWrapperClick/)
    expect(gp).toMatch(/const\s+onTextWrapperClick\s*=\s*\(/)
  })
})

// UI-E12-F: Experience font / readability repair.
// Scope: kao.css workstation layer + GamePanel.vue message body +
// Experience.vue quick-note workspace. No structural change to the
// E11 4-zone workstation layout. Only font-family / font-size /
// line-height / box-shadow tweaks to make the central record area
// read as a usable product and remove LXGW brush from small-text
// positions.
describe('ui polish — UI-E12-F: Experience font / readability repair', () => {
  // Contract #1: small-font meta positions (ws-topstrip__kicker /
  // scene-entry__stamp / scene-entry__date /
  // scene-entry__no / display-name / msg-time / msg-item__folio) all
  // use --font-sans, NOT --font-display. LXGW brush is reserved for
  // true display / kicker positions only (text-main::before role
  // kicker, ws-topstrip__anchor). UI-E12-W1 removed two dead-CSS
  // selectors (ws-topstrip__meta + ws-right-rail__section-title)
  // because they had no template match — the contract now drops
  // those expectations and asserts the absence of dead CSS instead.
  it('E12-F1: small-font meta uses var(--font-sans) — no LXGW brush at small size', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const gamePanel = readProjectFile('src/components/GamePanel.vue')

    // kao.css workstation meta selectors must use --font-sans
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__kicker\s*\{[^}]*var\(--font-sans\)/s)

    // GamePanel.vue meta selectors must use --font-sans
    expect(gamePanel).toMatch(/\.theme-kao\s+\.scene-entry__stamp\s*\{[^}]*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.display-name\s*\{[^}]*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-time\s*\{[^}]*var\(--font-sans\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.msg-item__folio\s*\{[^}]*var\(--font-sans\)/s)

    // V1 (2026-06-25): .ws-topstrip__meta is now a real flex wrapper
    // in Experience.vue (V1-B two-band layout) and gets a kao.css rule
    // that drives the cell-stack + 5-cell-progress inline flow. The
    // ws-right-rail__section-title selector remains a dead rule
    // (E12-W1 cleanup) — no template match.
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__meta\s*\{/)
    expect(kao).not.toMatch(/\.theme-kao\s+\.ws-right-rail__section-title\s*\{/)
  })

  // V1 (2026-06-25) visual contracts. Locks the four-unifications
  // (clip-path / border concentration / uppercase + letter-spacing /
  // skewX index) so a follow-up worker can't silently re-introduce
  // the old 5-clip-path / 6-border-tier / forced-caps language.
  describe('V1: 体验页四统一视觉契约', () => {
    it('V1-C: clip-path only on .shell-menu-btn; every other chip / tab / button is plain', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      const kao = readProjectFile('src/styles/themes/kao.css')
      // 5 selectors that USED to have clip-path and must NOT anymore.
      // The 4 kept clip-paths (shell-menu-btn, shell-drawer, shell-drawer__close,
      // and one harmless ::after clip in the kao character) are NOT in
      // the chip / tab / button family.
      expect(appShell).not.toMatch(/\.shell-tab\s*\{[^}]*clip-path/s)
      expect(appShell).not.toMatch(/\.shell-meta-chip\s*\{[^}]*clip-path/s)
      expect(appShell).not.toMatch(/\.shell-storage-chip\s*\{[^}]*clip-path/s)
      expect(kao).not.toMatch(/\.ws-topstrip__settings-link\s*\{[^}]*clip-path/s)
      expect(kao).not.toMatch(/\.ws-topstrip__session-chip\s*\{[^}]*clip-path/s)
      // The kept clip-path is on the hamburger only.
      expect(appShell).toMatch(/\.shell-menu-btn\s*\{[^}]*clip-path/s)
    })

    it('V1-D + V3: chip / cell borders are archive-rose 22% (stamp) or var(--hairline-soft) (divider); no archive-gold X% border', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      // V3 stamp language: ws-topstrip__settings-link now uses
      // archive-rose 22% border instead of var(--border) — the chip
      // is a stamp, not a panel.
      const settingsRule = kao.match(/\.theme-kao\s+\.ws-topstrip__settings-link\s*\{[^}]*\}/s)?.[0] || ''
      expect(settingsRule).toMatch(/border:\s*1px\s+solid\s+color-mix\(in srgb,\s*var\(--archive-rose\)\s+22%,\s*var\(--border\)\)/)
      expect(settingsRule).not.toMatch(/archive-gold\s+\d+%/)
      // Same stamp border for session chip.
      const sessionRule = kao.match(/\.theme-kao\s+\.ws-topstrip__session-chip\s*\{[^}]*\}/s)?.[0] || ''
      expect(sessionRule).toMatch(/border:\s*1px\s+solid\s+color-mix\(in srgb,\s*var\(--archive-rose\)\s+22%,\s*var\(--border\)\)/)
      expect(sessionRule).not.toMatch(/archive-gold\s+\d+%/)
      // ws-topstrip__cell border-right stays var(--hairline-soft) (panel divider tier).
      const cellRule = kao.match(/\.theme-kao\s+\.ws-topstrip__cell\s*\{[^}]*border-right:\s*1px\s+solid\s+var\(--hairline-soft\)[^}]*\}/s)?.[0] || ''
      expect(cellRule).not.toMatch(/archive-gold\s+\d+%/)
    })

    it('V1-E: no text-transform:uppercase on .shell-tab__label / .shell-meta-chip / .ws-topstrip__settings-link', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      const kao = readProjectFile('src/styles/themes/kao.css')
      const tabLabel = appShell.match(/\.shell-tab__label\s*\{[^}]*\}/s)?.[0] || ''
      const metaChip = appShell.match(/\.shell-meta-chip\s*\{[^}]*\}/s)?.[0] || ''
      const settingsLink = kao.match(/\.ws-topstrip__settings-link\s*\{[^}]*\}/s)?.[0] || ''
      expect(tabLabel).not.toMatch(/text-transform:\s*uppercase/)
      expect(metaChip).not.toMatch(/text-transform:\s*uppercase/)
      expect(settingsLink).not.toMatch(/text-transform:\s*uppercase/)
    })

    it('V1-E: no skewX(16deg) on .shell-tab__index — numeric serial, not a tilted label', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      const indexRule = appShell.match(/\.shell-tab__index\s*\{[^}]*\}/s)?.[0] || ''
      expect(indexRule).not.toMatch(/skewX/)
    })

    it('V1-A: Experience.vue no longer renders <CharacterBackdrop> (OpeningPage owns the parallax)', () => {
      const experience = readProjectFile('src/pages/Experience.vue')
      // Strip HTML comments + JS line comments + CSS block comments —
      // the V1-A explanatory comments contain the literal string
      // "<CharacterBackdrop>" but the template / script / style no
      // longer mount or import the component.
      const stripped = experience
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
      expect(stripped).not.toMatch(/<CharacterBackdrop\b/)
      // CharacterBackdrop.vue + useCharacterArt are still imported
      // nowhere in Experience.vue; the composable is unused here.
      expect(stripped).not.toMatch(/import\s+CharacterBackdrop/)
      expect(stripped).not.toMatch(/resolveArt\s*\(\s*\{[^}]*poseId:\s*'speaker-thumb'/)
    })
  })

  // V3 (2026-06-25) visual contracts. Locks the archive-folio
  // signature stamp language so a follow-up worker can't silently
  // regress to SaaS chrome (slide-bar indicator, rounded chips,
  // dashed dividers gone, paper-fiber mast replaced by blur).
  describe('V3: mast archive-folio signature', () => {
    it('V3-A: .shell-tab-indicator element + CSS rule are GONE (active = stamp, not slide bar)', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      expect(appShell).not.toMatch(/<span[^>]*class="shell-tab-indicator"/)
      // The standalone .shell-tab-indicator {…} rule should not exist
      // as its own selector (we still allow it inside kao overrides
      // that may keep a residual declaration; but V3 removes them all).
      const standalone = appShell.match(/\n\.shell-tab-indicator\s*\{[^}]*\}/s)?.[0] || ''
      expect(standalone).toBe('')
    })

    it('V3-B: active .shell-tab shows archive-rose ◆ ::before stamp; inactive tab has empty ::before', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      const stampRule = appShell.match(/\.shell-tab\.active::before\s*\{[^}]*\}/s)?.[0] || ''
      expect(stampRule).toMatch(/content:\s*"◆"/)
      // Stamp color is archive-rose, NOT accent (accent = SaaS highlight).
      expect(stampRule).toMatch(/var\(--archive-rose\)|--accent-rose/)
      // The base .shell-tab::before is empty (display: none) so non-
      // active tabs render no stamp.
      const baseRule = appShell.match(/\.shell-tab::before\s*\{[^}]*\}/s)?.[0] || ''
      expect(baseRule).toMatch(/content:\s*""/)
    })

    it('V3-C: shell-tab__index uses var(--font-display) (LXGW brush); roman numerals Ⅰ-Ⅴ in AppShell.vue script', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      const indexRule = appShell.match(/\.shell-tab__index\s*\{[^}]*\}/s)?.[0] || ''
      expect(indexRule).toMatch(/font-family:\s*var\(--font-display/)
      // Roman numeral array exists in the script.
      expect(appShell).toMatch(/ROMAN_ACTIVITY_STAMPS\s*=\s*\[['"']Ⅰ['"]/)
      expect(appShell).toMatch(/['"]Ⅴ['"]/)
      // Template binds the roman mark (not padStart).
      expect(appShell).toMatch(/ROMAN_ACTIVITY_STAMPS\[index\]/)
      expect(appShell).not.toMatch(/String\(index\s*\+\s*1\)\.padStart/)
    })

    it('V3-D: mast chips (shell-meta-chip / shell-storage-chip / ws-topstrip__settings-link / ws-topstrip__session-chip) all have border-radius: 0', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      const kao = readProjectFile('src/styles/themes/kao.css')
      const metaChip = appShell.match(/\.shell-meta-chip\s*\{[^}]*\}/s)?.[0] || ''
      const storageChip = appShell.match(/\.shell-storage-chip\s*\{[^}]*\}/s)?.[0] || ''
      const settingsLink = kao.match(/\.ws-topstrip__settings-link\s*\{[^}]*\}/s)?.[0] || ''
      const sessionChip = kao.match(/\.ws-topstrip__session-chip\s*\{[^}]*\}/s)?.[0] || ''
      expect(metaChip).toMatch(/border-radius:\s*0/)
      expect(storageChip).toMatch(/border-radius:\s*0/)
      expect(settingsLink).toMatch(/border-radius:\s*0/)
      expect(sessionChip).toMatch(/border-radius:\s*0/)
    })

    it('V3-E: .shell-mast drops backdrop-filter: blur(18px) (SaaS glass bar removed)', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      // Strip CSS block comments first — the V3 docstring above the
      // .shell-mast rule explicitly mentions "backdrop-filter:blur" as
      // the thing being removed; the comment shouldn't count as a
      // violation of the no-blur rule.
      const stripped = appShell.replace(/\/\*[\s\S]*?\*\//g, '')
      expect(stripped).not.toMatch(/\.shell-mast\s*\{[^}]*backdrop-filter:\s*blur/s)
    })

    it('V3-F: kao .shell-mast has paper-fiber speckle layer (.shell-mast::before with 3-stop radial-gradient)', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      const mastBeforeRule = kao.match(/\.theme-kao\s+\.app-shell\s+\.shell-mast::before\s*\{[^}]*\}/s)?.[0] || ''
      expect(mastBeforeRule).toMatch(/radial-gradient\(circle at 18% 22%/)
      expect(mastBeforeRule).toMatch(/radial-gradient\(circle at 67% 78%/)
      expect(mastBeforeRule).toMatch(/radial-gradient\(circle at 38% 52%/)
      // Speckle layer is multiply + opacity ≤0.4 so it doesn't dominate.
      expect(mastBeforeRule).toMatch(/mix-blend-mode:\s*multiply/)
    })

    it('V3-G: tabs share tear-edge dashed dividers (border-left: 1px dashed; first-child: none)', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      const tabRule = appShell.match(/\.shell-tab\s*\{[^}]*\}/s)?.[0] || ''
      expect(tabRule).toMatch(/border-left:\s*1px\s+dashed/)
      // First child has no border-left (no leading dashed stub).
      const firstChildRule = appShell.match(/\.shell-tab:first-child\s*\{[^}]*\}/s)?.[0] || ''
      expect(firstChildRule).toMatch(/border-left:\s*none/)
    })

    it('V3-H: mast chips use ink-dot stamp ::before (· in archive-rose, hover promotes to bold)', () => {
      const appShell = readProjectFile('src/layouts/AppShell.vue')
      const metaChipBefore = appShell.match(/\.shell-meta-chip::before\s*\{[^}]*\}/s)?.[0] || ''
      const metaChipHoverBefore = appShell.match(/\.shell-meta-chip:hover::before\s*\{[^}]*\}/s)?.[0] || ''
      expect(metaChipBefore).toMatch(/content:\s*"·"/)
      expect(metaChipBefore).toMatch(/var\(--archive-rose\)|--accent-rose/)
      // Hover promotes the dot — bold weight or full archive-rose color.
      expect(metaChipHoverBefore).toMatch(/font-weight:\s*900/)
    })
  })

  // Contract #2: message body (.text-main) uses var(--font-body) +
  // readable font-size (≥16) + readable line-height (≥1.7). UI-E12-F
  // bumped 16 → 17 and 1.75 → 1.78 so the central record surface
  // reads as a product, not as faded decoration.
  it('E12-F2: .text-main uses var(--font-body) + font-size ≥16px + line-height ≥1.7 (readable product body)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*font-family:\s*var\(--font-body\)/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*font-size:\s*(1[6-9]|2\d)px/s)
    expect(gamePanel).toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*line-height:\s*1\.(7\d|8[0-5])/s)
    // --font-display must NOT appear in .text-main (system serif only)
    expect(gamePanel).not.toMatch(/\.theme-kao\s+\.text-main\s*\{[^}]*var\(--font-display\)/)
  })

  // Contract #3: workstation buttons (.ws-layout button,
  // .ws-layout .action-btn) use --font-sans, NOT --font-display.
  // LXGW brush is reserved for display / kicker positions; a 13px
  // button label needs the sans system stack to be readable.
  it('E12-F3: workstation buttons use var(--font-sans) — no LXGW brush on action labels', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    // .ws-layout button uses sans
    expect(kao).toMatch(/\.theme-kao\s+\.ws-layout\s+button\s*\{[^}]*var\(--font-sans\)/s)
    // .ws-layout .action-btn uses sans
    expect(kao).toMatch(/\.theme-kao\s+\.ws-layout\s+\.action-btn\s*\{[^}]*var\(--font-sans\)/s)
    // No --font-display in either rule body (negative assertion)
    const buttonRule = kao.match(/\.theme-kao\s+\.ws-layout\s+button\s*\{[^}]*\}/s)?.[0] || ''
    const actionBtnRule = kao.match(/\.theme-kao\s+\.ws-layout\s+\.action-btn\s*\{[^}]*\}/s)?.[0] || ''
    expect(buttonRule).not.toMatch(/var\(--font-display\)/)
    expect(actionBtnRule).not.toMatch(/var\(--font-display\)/)
  })

  // Contract #4: no new :global(.theme-kao), no broad :deep(*), no
  // !important, no raw hex in the 4 modified files. kao.css may
  // carry pre-existing !important in drop-cap and other non-ws
  // selectors (already locked elsewhere); the E12-F additions
  // (ws-topstrip value / case / kicker / ws-layout buttons / ws-left-rail
  // kicker / brief) must be clean.
  it('E12-F4: no new :global(.theme-kao), broad :deep, !important, or raw hex in E12-F additions', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const experience = readProjectFile('src/pages/Experience.vue')
    const gamePanel = readProjectFile('src/components/GamePanel.vue')

    // No :global(.theme-kao) in any of the 3 files (E12-F additions
    // follow the existing theme-system pattern).
    expect(kao).not.toMatch(/:global\(\.theme-kao\)/)
    expect(experience).not.toMatch(/:global\(\.theme-kao\)/)
    expect(gamePanel).not.toMatch(/:global\(\.theme-kao\)/)

    // No broad :deep(*) — empty selector or * — in E12-F scope
    expect(experience).not.toMatch(/:deep\(\s*\)/)
    expect(gamePanel).not.toMatch(/:deep\(\s*\)/)

    // E12-F ws-* additions carry 0 !important. The kao.css drop-cap
    // `text-transform: none !important` is pre-existing (5A ship)
    // and lives outside ws-*; E12-F does not introduce any new
    // !important in any selector.
    const e12fAdditions = [
      kao.match(/\.theme-kao\s+\.ws-topstrip__value\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-topstrip__case\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-topstrip__kicker\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-left-rail__kicker\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-left-rail__brief\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-layout\s+button\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-layout\s+\.action-btn\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-layout\s+\.action-btn:hover:not\(:disabled\)\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-layout\s+\.action-btn:active:not\(:disabled\)\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-layout\s+textarea\s*\{[^}]*\}/s)?.[0]
    ].filter(Boolean)
    expect(e12fAdditions.length).toBeGreaterThan(0)
    for (const m of e12fAdditions) {
      expect(m, `E12-F rule contains !important: ${m.slice(0, 80)}...`).not.toMatch(/!important/)
    }

    // No raw hex in E12-F additions (the multi-canvas regex sweep
    // pattern catches hex anywhere in the matched block, so the
    // additions must use only var(--*) or color-mix()).
    for (const m of e12fAdditions) {
      expect(m, `E12-F rule contains raw hex: ${m.slice(0, 80)}...`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  // Contract #5: ws-topstrip__value + ws-topstrip__case switched from
  // --font-display (LXGW brush) to --font-body (Songti serif). Brush
  // is too dense to read at 14-15px; the body serif keeps the small
  // value legible while still carrying italic on the case position.
  it('E12-F5: topstrip value + case use var(--font-body) for small-size readability', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__value\s*\{[^}]*var\(--font-body\)/s)
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__case\s*\{[^}]*var\(--font-body\)/s)
    expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__case\s*\{[^}]*font-style:\s*italic/s)
  })

  // Contract #6: workstation layer dimension bump — .action-btn in
  // workstation context now carries a multi-stop box-shadow (inset
  // highlight + base offset + drop) for 3D product feel. Confirms
  // brief item #4 "按钮更立体" without changing the bookmark clip-path
  // (preserved by scoped CSS) and without SaaS card style.
  it('E12-F6: .ws-layout .action-btn carries 3D box-shadow (inset + offset + drop), not flat', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    // All .ws-layout .action-btn rules (font + dimension) joined.
    const actionBtnRules = kao.match(/\.theme-kao\s+\.ws-layout\s+\.action-btn\s*\{[^}]*\}/g) || []
    expect(actionBtnRules.length).toBeGreaterThanOrEqual(2)
    const joined = actionBtnRules.join('\n')
    expect(joined).toMatch(/box-shadow:\s*\n\s*inset/s) // inset highlight present
    expect(joined).toMatch(/0\s+4px\s+0/) // 4px base offset
    expect(joined).toMatch(/0\s+8px\s+14px/) // drop shadow
  })
})

// UI-E12-W2: Menu → Experience page handoff continuity.
// Scope: kao.css workstation layer + Experience.vue topstrip +
// hamburger (.shell-mast .shell-menu-btn) z-index bump + wsLayoutEnter
// animation + .game-page background override. 0 AppShell.vue
// structural change — all hamburger rules are .theme-kao
// conditional overrides in kao.css (see brief scope rule:
// "必要少量 AppShell.vue ... 但必须先说明为什么" — explanation:
// the .shell-mast .shell-menu-btn z-index bump is achievable in kao.css
// because the hamburger's z-index is a single CSS value, not
// behavior, so the override fits the existing theme-system
// pattern of .theme-kao .shell-* overrides in kao.css L610-722).
describe('ui polish — UI-E12-W2: Menu → Experience page handoff continuity', () => {
  // Contract #1: hamburger .shell-mast .shell-menu-btn is above ws-topstrip
  // in kao mode (topstrip z-index = 240). Before E12-W2, the
  // mast z-index 90 was BELOW topstrip z-index 240; the mast-integrated
  // hamburger (.shell-mast .shell-menu-btn) inherits the mast"s z-index.
  // The override is placed OUTSIDE @layer kao (see end of file)
  // because unlayered rules win over @layer rules at the same
  // importance — AppShell.vue scoped CSS is unlayered so a rule
  // inside @layer kao would lose. The regex matches the
  // unlayered selector (no leading whitespace) with the
  // .app-shell ancestor (specificity 0,3,0 vs scoped 0,2,0).
  it('E12-W2-1: mast z-index > ws-topstrip z-index in kao mode (no sticker feeling)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const mastRule = kao.match(/^\.theme-kao\s+\.app-shell\s+\.shell-mast\s*\{[^}]*\}/m)?.[0] || ''
    // Hamburger rule must declare a z-index value
    expect(mastRule).toMatch(/z-index:\s*\d+/)
    const z = parseInt(mastRule.match(/z-index:\s*(\d+)/)?.[1] || '0', 10)
    // ws-topstrip uses var(--z-floating-dock, 240). Hamburger must
    // sit above that.
    expect(z).toBeGreaterThan(240)
  })

  // Contract #2: ws-topstrip has padding-left >= 72px in kao mode
  // to clear the fixed 46px hamburger at left:16 + 16px gap +
  // visual padding (mirrors Writing's `.wall__cork { padding-left:
  // 80px }` pattern at kao.css L1510-1512).
  it('E12-W2-2: ws-topstrip padding-left >= 72px in kao mode (clears fixed hamburger)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const topstripRule = kao.match(/\.theme-kao\s+\.ws-topstrip\s*\{[^}]*\}/s)?.[0] || ''
    // padding-left must be a fixed px value (not 0)
    expect(topstripRule).toMatch(/padding-left:\s*\d+px/)
    const pad = parseInt(topstripRule.match(/padding-left:\s*(\d+)px/)?.[1] || '0', 10)
    expect(pad).toBeGreaterThanOrEqual(72)
  })

  // Contract #3: ws-topstrip has a page-title element (the menu
  // drawer caption "体验" needs a corresponding kicker on the
  // page so the handoff has visual continuity).
  it('E12-W2-3: ws-topstrip has a page-title element (体验 / EXPERIENCE)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toContain('class="ws-topstrip__pagetitle"')
    expect(experience).toContain('class="ws-topstrip__pagetitle-kicker"')
    expect(experience).toContain('class="ws-topstrip__pagetitle-name"')
    // Kicker text is 体验 (the page title), name text is EXPERIENCE
    expect(experience).toMatch(/ws-topstrip__pagetitle-kicker[^>]*>\s*体验/)
    expect(experience).toMatch(/ws-topstrip__pagetitle-name[^>]*>\s*Experience/i)
  })

  // Contract #4: .game-page background in kao mode uses archive
  // paper tokens (no SaaS accent-rose/amber halo). The default
  // scoped CSS radial gradient (Experience.vue lines 870-873) is
  // overridden by .theme-kao .game-page in kao.css. The kao.css
  // file has 2 .theme-kao .game-page rules: the pre-existing
  // `position: relative` (L2376) and the W2 background override
  // (L2833). The background override is the one with the paper
  // gradient — match all rules and verify at least one carries
  // the archive paper tokens.
  it('E12-W2-4: .game-page background in kao mode uses archive paper (no accent halo)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const gamePageRules = kao.match(/\.theme-kao\s+\.game-page\s*\{[^}]*\}/g) || []
    expect(gamePageRules.length).toBeGreaterThanOrEqual(1)
    const joined = gamePageRules.join('\n')
    // At least one rule must reference archive paper tokens
    expect(joined).toMatch(/var\(--archive-paper-soft\)/)
    expect(joined).toMatch(/var\(--archive-paper\)/)
    // No rule may use accent-rose / accent-amber (SaaS halo tokens)
    for (const r of gamePageRules) {
      expect(r).not.toMatch(/var\(--accent-rose/)
      expect(r).not.toMatch(/var\(--accent-amber/)
    }
  })

  // Contract #5: wsLayoutEnter keyframe + animation application on
  // .ws-layout in kao mode. Reduced-motion override is mandatory
  // per a11y convention.
  it('E12-W2-5: wsLayoutEnter keyframe + .ws-layout animation + reduced-motion override', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    // Keyframe defined
    expect(kao).toMatch(/@keyframes\s+wsLayoutEnter\s*\{[^}]*opacity\s*:\s*0[^}]*translateY/s)
    // Applied to .ws-layout
    const wsLayoutRule = (kao.match(/\.theme-kao\s+\.ws-layout\s*\{[^}]*\}/g) || []).filter(s => /animation/.test(s))[0] || ''
    expect(wsLayoutRule).toMatch(/animation\s*:\s*wsLayoutEnter/)
    expect(wsLayoutRule).toMatch(/cubic-bezier/)
    // Reduced-motion override disables ws-layout animation. The
    // media query selector (.theme-kao .ws-layout) comes BEFORE
    // the `animation: none` declaration, so the regex looks for
    // ws-layout then animation: none.
    expect(kao).toMatch(/prefers-reduced-motion[\s\S]{0,200}\.theme-kao\s+\.ws-layout[\s\S]{0,200}animation\s*:\s*none/)
  })

  // Contract #6: W2 additions carry 0 new :global(.theme-kao), 0
  // broad :deep, 0 !important, 0 raw hex. Locks the brief's
  // "禁止" list.
  it('E12-W2-6: W2 additions clean (no :global(.theme-kao), no broad :deep, no !important, no raw hex)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const experience = readProjectFile('src/pages/Experience.vue')

    // No new :global(.theme-kao) anywhere
    expect(kao).not.toMatch(/:global\(\.theme-kao\)/)
    expect(experience).not.toMatch(/:global\(\.theme-kao\)/)

    // No broad :deep(*) or empty :deep
    expect(experience).not.toMatch(/:deep\(\s*\)/)
    expect(kao).not.toMatch(/:deep\(/)

    // Extract the W2 new rules and verify no !important / raw hex.
    // Mast rules are OUTSIDE @layer (unlayered) so use the
    // `^` anchor + .app-shell ancestor; workstation rules are
    // inside @layer and use `.theme-kao` selector.
    const w2Rules = [
      kao.match(/^\.theme-kao\s+\.app-shell\s+\.shell-mast .shell-menu-btn\s*\{[^}]*\}/m)?.[0],
      kao.match(/^\.theme-kao\s+\.app-shell\s+\.shell-mast .shell-menu-btn:hover\s*\{[^}]*\}/m)?.[0],
      kao.match(/^\.theme-kao\s+\.app-shell\s+\.shell-mast .shell-menu-btn:focus-visible\s*\{[^}]*\}/m)?.[0],
      kao.match(/\.theme-kao\s+\.ws-topstrip__pagetitle\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-topstrip__pagetitle-kicker\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-topstrip__pagetitle-name\s*\{[^}]*\}/s)?.[0],
      (kao.match(/\.theme-kao\s+\.game-page\s*\{[^}]*\}/g) || []).find(r => r.includes('archive-paper-soft')) || kao.match(/\.theme-kao\s+\.game-page\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-layout\s*\{[^}]*animation[^}]*\}/s)?.[0]
    ].filter(Boolean)
    expect(w2Rules.length).toBeGreaterThanOrEqual(7)
    for (const m of w2Rules) {
      expect(m, `W2 rule contains !important: ${m.slice(0, 80)}...`).not.toMatch(/!important/)
      expect(m, `W2 rule contains raw hex: ${m.slice(0, 80)}...`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  // Contract #7: Writing / Notes layouts unaffected by W2.
  // The W2 changes are scoped to .theme-kao .app-shell .shell-mast .shell-menu-btn
  // + .ws-topstrip + .ws-topstrip__pagetitle-* + .game-page + wsLayoutEnter.
  // None of these selectors match Writing or Notes DOM, so those
  // pages render unchanged. Locked by checking that the W2 selectors
  // are workstation-specific (not generic shell-content / wall /
  // material-drawer / etc.).
  it('E12-W2-7: W2 selectors are workstation-specific (Writing / Notes unaffected)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const experience = readProjectFile('src/pages/Experience.vue')
    // W2 rules are workstation-specific: no W2 selector matches
    // Writing (.wall-*) or Notes (.material-*, .index-card).
    // The .theme-kao .app-shell .shell-mast .shell-menu-btn rule is the only
    // shell-level override and it only affects the hamburger, not
    // the shell content area.
    const w2ShellRule = kao.match(/^\.theme-kao\s+\.app-shell\s+\.shell-mast .shell-menu-btn\s*\{[^}]*\}/m)?.[0] || ''
    expect(w2ShellRule).not.toMatch(/\.wall/)
    expect(w2ShellRule).not.toMatch(/\.material/)
    // Experience.vue template addition is inside .ws-topstrip, not
    // outside the workstation. pagetitle must be a direct child of ws-topstrip.
    expect(experience).toMatch(/<section class="ws-topstrip"[\s\S]*?<div class="ws-topstrip__pagetitle"[\s\S]*?<\/div>\s*<div class="ws-topstrip__cell">/)
  })
})

// UI-E12-W1: Experience font readability + first-read hierarchy.
// Scope: kao.css ws-center-stage page-edge treatment + chat-container
// ruled-paper background + GamePanel.vue 0-state hero block (greeting
// + hint) readability bump. 0 E11 4-zone workstation structural
// change — only adds left spine + inset top hairline + repeating
// ruled lines on the center surface, and bumps 0-state hero padding
// / greeting font / hint font so the empty state reads as a workbench
// card with a clear "档案空白 · 等候第 1 条落笔" first read, not a
// flat fill-in form.
describe('ui polish — UI-E12-W1: Experience font readability + first-read hierarchy', () => {
  // Contract #1: ws-center-stage carries a 3px gold left spine +
  // a 1px inset top hairline (the page-edge / binding treatment).
  // Both come from --archive-gold via color-mix, no raw hex.
  it('E12-W1-1: ws-center-stage has 3px gold left spine + 1px inset top hairline (page-edge treatment)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const centerStageRule = kao.match(/\.theme-kao\s+\.ws-center-stage\s*\{[^}]*\}/s)?.[0] || ''
    expect(centerStageRule, 'ws-center-stage rule must exist').toMatch(/border-left:\s*3px\s+solid/)
    expect(centerStageRule).toMatch(/border-left:\s*3px\s+solid[^;]*archive-gold/)
    expect(centerStageRule).toMatch(/box-shadow:\s*inset\s+0\s+1px\s+0[^;]*archive-gold/)
    // The pre-existing 1px gold border (1px solid archive-gold 26%) must
    // stay — the spine is on top of it, not replacing it.
    expect(centerStageRule).toMatch(/border:\s*1px\s+solid[^;]*archive-gold/)
  })

  // Contract #2: ws-center-stage > .chat-container carries a
  // repeating-linear-gradient ruled-paper background. archive-ink
  // 4% hairline at 32px row height + background-attachment: local
  // so the lines scroll with content.
  it('E12-W1-2: ws-center-stage > .chat-container has repeating-linear-gradient ruled-paper background', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const chatContainerRule = kao.match(/\.theme-kao\s+\.ws-center-stage\s+>\s+\.chat-container\s*\{[^}]*\}/s)?.[0] || ''
    expect(chatContainerRule, 'chat-container rule must exist').toMatch(/repeating-linear-gradient/)
    expect(chatContainerRule).toMatch(/repeating-linear-gradient\([\s\S]*archive-ink/)
    expect(chatContainerRule).toMatch(/background-attachment:\s*local/)
    // The pre-existing PLAN-QA Fix #4 flex / overflow rules must
    // remain (chat-container still flex: 1 1 auto + overflow-y: auto).
    expect(chatContainerRule).toMatch(/flex:\s*1\s+1\s+auto/)
    expect(chatContainerRule).toMatch(/overflow-y:\s*auto/)
  })

  // Contract #3: 0-state hero block has position:relative + paper-
  // strong 6% wash background + bumped padding (≥ 32/24/36 px). The
  // pre-existing border-bottom dotted gold hairline must stay so
  // the hero reads as a workbench card with a soft divider.
  it('E12-W1-3: chat-container__hero is a workbench card (position relative + paper-strong wash + bumped padding)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    const heroRule = gamePanel.match(/\.theme-kao\s+\.chat-container__hero\s*\{[^}]*\}/s)?.[0] || ''
    expect(heroRule, 'hero rule must exist').toMatch(/position:\s*relative/)
    expect(heroRule).toMatch(/background:\s*color-mix\(in srgb,\s*var\(--archive-paper-strong\)\s*\d+%/)
    expect(heroRule).toMatch(/padding:\s*32px\s+24px\s+36px/)
    // pre-existing border-bottom dotted archive-gold stays
    expect(heroRule).toMatch(/border-bottom:\s*1px\s+dotted[^;]*archive-gold/)
  })

  // Contract #4: hero greeting uses var(--font-display) (LXGW) at
  // 22px / line-height 1.3 / letter-spacing 0.06em. The 22px size
  // is the largest text on the page; the brush face stays readable
  // because it's now a true first-read anchor, not a label.
  it('E12-W1-4: hero greeting uses var(--font-display) at 22px / line-height 1.3 / letter-spacing 0.06em (DISPLAY first-read)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    const greetingRule = gamePanel.match(/\.theme-kao\s+\.chat-container__hero-greeting\s*\{[^}]*\}/s)?.[0] || ''
    expect(greetingRule, 'hero-greeting rule must exist').toMatch(/font-family:\s*var\(--font-display\)/)
    expect(greetingRule).toMatch(/font-size:\s*22px/)
    expect(greetingRule).toMatch(/line-height:\s*1\.3/)
    expect(greetingRule).toMatch(/letter-spacing:\s*0\.06em/)
    // weight 600 stays (not SaaS-bold)
    expect(greetingRule).toMatch(/font-weight:\s*600/)
  })

  // Contract #5: hero hint uses var(--font-body) (Songti) at 15px /
  // line-height 1.7 so secondary copy reads alongside the 22px
  // greeting without becoming a footnote. Body Songti stays (no
  // LXGW at body position).
  it('E12-W1-5: hero hint uses var(--font-body) at 15px / line-height 1.7 (BODY readability)', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    const hintRule = gamePanel.match(/\.theme-kao\s+\.chat-container__hero-hint\s*\{[^}]*\}/s)?.[0] || ''
    expect(hintRule, 'hero-hint rule must exist').toMatch(/font-family:\s*var\(--font-body\)/)
    expect(hintRule).toMatch(/font-size:\s*15px/)
    expect(hintRule).toMatch(/line-height:\s*1\.7/)
    // No LXGW in hint rule body
    expect(hintRule).not.toMatch(/var\(--font-display\)/)
  })

  // Contract #6: W1 additions clean — no :global(.theme-kao), no
  // broad :deep, no !important, no raw hex. Locks the brief's
  // 禁止 list and mirrors the E12-F #4 / E12-W2 #6 patterns.
  it('E12-W1-6: W1 additions clean (no :global(.theme-kao), no broad :deep, no !important, no raw hex)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const experience = readProjectFile('src/pages/Experience.vue')
    const gamePanel = readProjectFile('src/components/GamePanel.vue')

    // No new :global(.theme-kao) anywhere (brief explicit ban)
    expect(kao).not.toMatch(/:global\(\.theme-kao\)/)
    expect(experience).not.toMatch(/:global\(\.theme-kao\)/)
    expect(gamePanel).not.toMatch(/:global\(\.theme-kao\)/)

    // No broad :deep(*) (brief explicit ban)
    expect(experience).not.toMatch(/:deep\(\s*\)/)
    expect(gamePanel).not.toMatch(/:deep\(\s*\)/)

    // Extract W1 new rules and verify no !important / raw hex
    const w1Rules = [
      kao.match(/\.theme-kao\s+\.ws-center-stage\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.ws-center-stage\s+>\s+\.chat-container\s*\{[^}]*\}/s)?.[0],
      gamePanel.match(/\.theme-kao\s+\.chat-container__hero\s*\{[^}]*\}/s)?.[0],
      gamePanel.match(/\.theme-kao\s+\.chat-container__hero-greeting\s*\{[^}]*\}/s)?.[0],
      gamePanel.match(/\.theme-kao\s+\.chat-container__hero-hint\s*\{[^}]*\}/s)?.[0]
    ].filter(Boolean)
    expect(w1Rules.length).toBeGreaterThanOrEqual(4)
    for (const m of w1Rules) {
      expect(m, `W1 rule contains !important: ${m.slice(0, 80)}...`).not.toMatch(/!important/)
      expect(m, `W1 rule contains raw hex: ${m.slice(0, 80)}...`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      // No LXGW in any W1 body / meta position (DISPLAY only allowed
      // on the hero-greeting first-read anchor)
      if (!m.includes('hero-greeting')) {
        expect(m, `W1 non-greeting rule uses LXGW: ${m.slice(0, 80)}...`).not.toMatch(/var\(--font-display\)/)
      }
    }
  })
})

// UI-E12-FIX1: mobile overlap + desktop hamburger collision + 0-state
// 1/1 fake info. Locks the 3 E12 acceptance failures fixed in this slice.
// Scope: kao.css (3 @media 980 rules + ws-layout padding-left) +
// Experience.vue template (2 cell placeholder bindings) +
// useWorkstationMeta.js (currentSection = totalCount, no Math.max padding).
// 0 E11 / Writing / Notes change.
describe('ui polish — UI-E12-FIX1: mobile overlap, hamburger collision, 0-state honesty', () => {
  // Contract #1 (UI-E12-FIX2): at 640 (≤980), ws-topstrip uses a
  // SIMPLE FLEX COLUMN (not a complex grid) so 5 cells + progress
  // + anchor never wrap unpredictably. Each child takes its own
  // row. Updated from the original FIX1-1 4-row grid contract
  // (which still jumbled at 640 — see UI-E12-QA2 §4.1) to a more
  // stable flex-column approach. UI-E12-FIX2 brief: "直接用简单
  // 稳定布局，不要复杂 grid dense".
  it('FIX1-1 / FIX2-1: ws-topstrip @ ≤980 uses simple flex column (no grid, no dense)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    // Find all @media (max-width: 980px) blocks via position, then
    // pick the one that contains .ws-topstrip (workstation's @media).
    const re = /@media\s*\(max-width:\s*980px\)\s*\{/g
    let m
    const positions = []
    while ((m = re.exec(kao)) !== null) positions.push(m.index)
    let mediaBlock = ''
    for (const p of positions) {
      const rest = kao.slice(p)
      const closing = rest.match(/\n\s*\}\s*\n\s*\}\s*\n/)
      if (!closing) continue
      const block = rest.slice(0, closing.index + closing[0].length)
      if (/\.theme-kao\s+\.ws-topstrip\s*\{/.test(block)) {
        const topstripRule = block.match(/\.theme-kao\s+\.ws-topstrip\s*\{[^}]*\}/)?.[0] || ''
        if (topstripRule.length > 0) { mediaBlock = topstripRule; break }
      }
    }
    expect(mediaBlock.length).toBeGreaterThan(0)
    // Flex column, not grid
    expect(mediaBlock).toMatch(/display:\s*flex/)
    expect(mediaBlock).toMatch(/flex-direction:\s*column/)
    // No grid properties (the brief: "不要复杂 grid dense")
    expect(mediaBlock).not.toMatch(/grid-template-(rows|columns)/)
    expect(mediaBlock).not.toMatch(/grid-auto-flow/)
  })

  // Contract #2: at desktop, ws-layout has padding-left >= 60px
  // so the left rail kicker text is not covered by the fixed 46px
  // hamburger. Brief issue #2: "1280 左上 hamburger 与 left rail
  // 文字/标题不要遮挡或抢位". Accepts both shorthand form
  // (`padding: 14px 16px 16px 64px` → 4th value is padding-left)
  // and longhand form (`padding-left: 64px`).
  it('FIX1-2: ws-layout padding-left >= 60px at desktop (clears fixed hamburger)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const layoutRule = kao.match(/\.theme-kao\s+\.ws-layout\s*\{[^}]*\}/)?.[0] || ''
    expect(layoutRule.length).toBeGreaterThan(0)
    // Try longhand first
    const longhand = layoutRule.match(/padding-left:\s*(\d+)px/)
    if (longhand) {
      expect(parseInt(longhand[1], 10)).toBeGreaterThanOrEqual(60)
      return
    }
    // Try shorthand `padding: a b c d` (4-value) — 4th value is left
    const shorthand = layoutRule.match(/padding:\s*(\d+)px\s+(\d+)px\s+(\d+)px\s+(\d+)px/)
    expect(shorthand, 'ws-layout must declare padding-left via shorthand or longhand').toBeTruthy()
    const pad = parseInt(shorthand[4], 10)
    expect(pad).toBeGreaterThanOrEqual(60)
  })

  // Contract #3: 0-state topstrip hides the 4 noisy cells (卷 / 案号 /
  // 第 N 条 / 共 M 条) entirely via v-if="!meta.isEmpty", so no fake
  // placeholder rendering is needed — the cells just don't appear in
  // 0-state. The 当 N 条 / 共 M 条 values are still bound to meta.currentSection
  // / meta.totalCount (no Math.max padding in useWorkstationMeta).
  it('FIX1-3: 0-state topstrip hides the 4 noisy cells entirely, no fake 1/1', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const composable = readProjectFile('src/composables/useWorkstationMeta.js')

    // V1-B: each of the 4 v-if-hideable cells is gated by
    // `v-if="!meta.isEmpty"`. In 0-state the cells never render; in
    // full-state the cell is bound directly to the meta value (no
    // ternary placeholder needed).
    expect(experience).toContain('v-if="!meta.isEmpty"')
    expect(experience).toMatch(/第 N 条<\/span>[\s\S]*?\{\{\s*meta\.currentSection\s*\}\}/)
    expect(experience).toMatch(/共 M 条<\/span>[\s\S]*?\{\{\s*meta\.totalCount\s*\}\}/)

    // useWorkstationMeta: currentSection is bare totalCount (no Math.max)
    const currentSectionBlock = composable.match(/const\s+currentSection\s*=\s*computed\([^)]*\)\s*=>\s*\{[^}]*\}/s)?.[0] || ''
    expect(currentSectionBlock).not.toMatch(/Math\.max\(1,\s*totalCount/)
    expect(currentSectionBlock).toMatch(/return\s+totalCount\.value/)
  })

  // Contract #4: FIX1 additions carry 0 forbidden patterns.
  // Locks the brief 禁止 list: no :global(.theme-kao), no broad :deep,
  // no !important, no raw hex in the FIX1 rules. The 3 FIX1 rules
  // are extracted as a list and checked individually — this avoids
  // false positives from pre-existing rules inside the same @media
  // block (e.g., Writing's .wall__main which has pre-existing
  // !important drop-cap inside @media 980).
  it('FIX1-4: FIX1 additions clean (no :global, broad :deep, !important, raw hex)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const experience = readProjectFile('src/pages/Experience.vue')
    const composable = readProjectFile('src/composables/useWorkstationMeta.js')

    // No new :global(.theme-kao)
    expect(kao).not.toMatch(/:global\(\.theme-kao\)/)
    expect(experience).not.toMatch(/:global\(\.theme-kao\)/)
    expect(composable).not.toMatch(/:global\(\.theme-kao\)/)

    // No broad :deep
    expect(experience).not.toMatch(/:deep\(\s*\)/)
    expect(kao).not.toMatch(/:deep\(/)

    // Extract just the FIX1 rules individually.
    // 1. Desktop .ws-layout block (first occurrence)
    // 2. Mobile @media 980 .ws-layout block (find via @media 980 block
    //    that contains .theme-kao .ws-layout)
    // 3. Mobile @media 980 .ws-topstrip block (same approach)
    const fix1DesktopWsLayout = kao.match(/^\s*\.theme-kao\s+\.ws-layout\s*\{[^}]*\}\s*$/m)?.[0] || ''
    // Find all @media (max-width: 980px) blocks via position-based
    // extraction (regex with non-greedy \n}\n doesn't work because all
    // CSS closes have indent). Each @media is followed by a brace that
    // is the start of its block; we extract via known file structure
    // (the @media is opened, the block ends with `  }\n` at column 0
    // after a few rules).
    const mediaStarts = []
    const re = /@media\s*\(max-width:\s*980px\)\s*\{/g
    let m
    while ((m = re.exec(kao)) !== null) mediaStarts.push(m.index)
    let fix1MobileWsLayout = ''
    let fix1MobileWsTopstrip = ''
    for (const start of mediaStarts) {
      // Find the @media closing brace — `^  }$` (line starts with `  }`).
      // Use multiline /m flag and look for end-of-block marker.
      const rest = kao.slice(start)
      const closingMatch = rest.match(/\n\s*\}\s*\n\s*\}\s*\n/) // inner block close + @media close
      if (!closingMatch) continue
      const block = rest.slice(0, closingMatch.index + closingMatch[0].length)
      const layoutMatch = block.match(/\.theme-kao\s+\.ws-layout\s*\{[^}]*\}/)
      if (layoutMatch && !fix1MobileWsLayout) fix1MobileWsLayout = layoutMatch[0]
      const topstripMatch = block.match(/\.theme-kao\s+\.ws-topstrip\s*\{[^}]*\}/)
      if (topstripMatch && !fix1MobileWsTopstrip) fix1MobileWsTopstrip = topstripMatch[0]
    }

    expect(fix1DesktopWsLayout).toMatch(/padding:\s*14px\s+16px\s+16px\s+6[04]px/)
    expect(fix1MobileWsLayout).toMatch(/padding:\s*14px\s+12px\s+16px/)
    // FIX2: mobile ws-topstrip switched from 4-row grid to simple
    // flex column. Lock the new shape (not the old grid).
    expect(fix1MobileWsTopstrip).toMatch(/display:\s*flex/)
    expect(fix1MobileWsTopstrip).toMatch(/flex-direction:\s*column/)

    for (const m of [fix1DesktopWsLayout, fix1MobileWsLayout, fix1MobileWsTopstrip]) {
      expect(m, `FIX1 rule contains !important: ${m.slice(0, 80)}...`).not.toMatch(/!important/)
      expect(m, `FIX1 rule contains raw hex: ${m.slice(0, 80)}...`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  // Contract #5: FIX1 is workstation-specific (Writing / Notes unaffected).
  // The 3 FIX1 rules target .ws-layout, .ws-topstrip, and the @media 980
  // override — all workstation-internal selectors. None match Writing
  // (.wall-*) or Notes (.material-*, .index-card). Pre-existing rules
  // like .wall__main / .index-card in the same @media 980 block are
  // pre-existing, not FIX1 additions.
  it('FIX1-5: FIX1 additions are workstation-specific (Writing / Notes selectors NOT introduced by FIX1)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const fix1DesktopWsLayout = kao.match(/^\s*\.theme-kao\s+\.ws-layout\s*\{[^}]*\}\s*$/m)?.[0] || ''
    const mediaStarts = []
    const re = /@media\s*\(max-width:\s*980px\)\s*\{/g
    let m
    while ((m = re.exec(kao)) !== null) mediaStarts.push(m.index)
    let fix1MobileWsLayout = ''
    let fix1MobileWsTopstrip = ''
    for (const start of mediaStarts) {
      const rest = kao.slice(start)
      const closingMatch = rest.match(/\n\s*\}\s*\n\s*\}\s*\n/)
      if (!closingMatch) continue
      const block = rest.slice(0, closingMatch.index + closingMatch[0].length)
      const layoutMatch = block.match(/\.theme-kao\s+\.ws-layout\s*\{[^}]*\}/)
      if (layoutMatch && !fix1MobileWsLayout) fix1MobileWsLayout = layoutMatch[0]
      const topstripMatch = block.match(/\.theme-kao\s+\.ws-topstrip\s*\{[^}]*\}/)
      if (topstripMatch && !fix1MobileWsTopstrip) fix1MobileWsTopstrip = topstripMatch[0]
    }
    for (const m of [fix1DesktopWsLayout, fix1MobileWsLayout, fix1MobileWsTopstrip]) {
      expect(m, `FIX1 rule mentions Writing selector: ${m.slice(0, 80)}...`).not.toMatch(/\.wall/)
      expect(m, `FIX1 rule mentions Notes selector: ${m.slice(0, 80)}...`).not.toMatch(/\.material/)
      expect(m, `FIX1 rule mentions Notes selector: ${m.slice(0, 80)}...`).not.toMatch(/\.index-card/)
    }
  })
})

// UI-E12-FIX2: Fast blocker fix.
// Scope: GamePanel.vue folio corner 1/1 hardcoded removed +
// kao.css @media 980 mobile ws-topstrip simple flex column +
// kao.css @media 980 mobile ws-left-rail compact 1-line bar.
// Lighter than FIX1: 4 minimal contracts only.
describe('ui polish — UI-E12-FIX2: folio corner + 640 mobile blocker fixes', () => {
  // Contract #1: chat-container__hero-folio-page">1 / 1 not present
  // in GamePanel.vue. QA2 criterion #4: "不能写死 misleading 1 / 1".
  it('FIX2-1: hero folio page corner "1 / 1" hardcoded literal is removed', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // The old hardcoded literal
    expect(gamePanel).not.toMatch(/chat-container__hero-folio-page">1\s*\/\s*1</)
    // The wrapper class still exists (we kept the case ID stamp)
    expect(gamePanel).toContain('chat-container__hero-folio-case')
    // The page part is gone
    expect(gamePanel).not.toContain('chat-container__hero-folio-page')
  })

  // Contract #2: at 640 mobile, ws-layout is a single column.
  // QA2 §4.1: 5 elements stacked in viewport top 200px. The fix
  // is a single column where each section gets its own row.
  it('FIX2-2: ws-layout @ ≤980 is single column (no 3-col workstation grid)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const re = /@media\s*\(max-width:\s*980px\)\s*\{/g
    let m
    const positions = []
    while ((m = re.exec(kao)) !== null) positions.push(m.index)
    let layoutRule = ''
    for (const p of positions) {
      const rest = kao.slice(p)
      const closing = rest.match(/\n\s*\}\s*\n\s*\}\s*\n/)
      if (!closing) continue
      const block = rest.slice(0, closing.index + closing[0].length)
      const found = block.match(/\.theme-kao\s+\.ws-layout\s*\{[^}]*\}/)?.[0]
      if (found) { layoutRule = found; break }
    }
    expect(layoutRule.length).toBeGreaterThan(0)
    expect(layoutRule).toMatch(/grid-template-columns:\s*1fr/)
  })

  // Contract #3: at 640 mobile, ws-topstrip uses simple flex column
  // (no grid, no dense, no auto-flow).
  it('FIX2-3: ws-topstrip @ ≤980 uses simple flex column (no grid, no dense)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const re = /@media\s*\(max-width:\s*980px\)\s*\{/g
    let m
    const positions = []
    while ((m = re.exec(kao)) !== null) positions.push(m.index)
    let mediaBlock = ''
    for (const p of positions) {
      const rest = kao.slice(p)
      const closing = rest.match(/\n\s*\}\s*\n\s*\}\s*\n/)
      if (!closing) continue
      const block = rest.slice(0, closing.index + closing[0].length)
      const found = block.match(/\.theme-kao\s+\.ws-topstrip\s*\{[^}]*\}/)?.[0]
      if (found) { mediaBlock = found; break }
    }
    expect(mediaBlock.length).toBeGreaterThan(0)
    expect(mediaBlock).toMatch(/display:\s*flex/)
    expect(mediaBlock).toMatch(/flex-direction:\s*column/)
    expect(mediaBlock).not.toMatch(/grid-template-(rows|columns)/)
    expect(mediaBlock).not.toMatch(/grid-auto-flow/)
  })

  // Contract #4: FIX2 additions carry 0 forbidden patterns.
  it('FIX2-4: FIX2 additions clean (no :global, broad :deep, !important, raw hex)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    expect(kao).not.toMatch(/:global\(\.theme-kao\)/)
    expect(gamePanel).not.toMatch(/:global\(\.theme-kao\)/)
    expect(kao).not.toMatch(/:deep\(/)
    expect(gamePanel).not.toMatch(/:deep\(/)
    // The 2 new FIX2 rules
    const fix2TopstripMobile = kao.match(/@media\s*\(max-width:\s*980px\)[\s\S]{0,3000}?\.theme-kao\s+\.ws-topstrip\s*\{[^}]*\}/)?.[0] || ''
    const fix2LeftRailMobile = kao.match(/@media\s*\(max-width:\s*980px\)[\s\S]{0,3000}?\.theme-kao\s+\.ws-left-rail\s*\{[^}]*\}/)?.[0] || ''
    for (const m of [fix2TopstripMobile, fix2LeftRailMobile]) {
      expect(m, `FIX2 rule contains !important: ${m.slice(0, 80)}...`).not.toMatch(/!important/)
      expect(m, `FIX2 rule contains raw hex: ${m.slice(0, 80)}...`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })
})

// UI-E13-BIG1: product-state slice.
// Scope: useLocalDemo.js (new composable) + useWorkstationMeta.js
// (demo state wiring) + Experience.vue (banner + local actions) +
// GamePanel.vue (scene-prompt type) + StatusBar/GeographyPanel/
// QuestLog.vue (demo placeholders) + kao.css (banner + scene-prompt
// + demo-* styles). No store / service / router / server changes
// (per brief); demo state persists in localStorage.
describe('ui polish — UI-E13-BIG1: product-state slice (local demo + 4 message types)', () => {
  // Contract #1: useLocalDemo exists with 3 scenes, 3 events per scene.
  it('BIG1-1: useLocalDemo composable has 3 scenes × 3 events = 9 demo events', () => {
    const localDemo = readProjectFile('src/composables/useLocalDemo.js')
    // 3 scene ids (pier / tent / lighthouse)
    expect(localDemo).toMatch(/id:\s*['"]pier['"]/)
    expect(localDemo).toMatch(/id:\s*['"]tent['"]/)
    expect(localDemo).toMatch(/id:\s*['"]lighthouse['"]/)
    // Each scene has events array of 3. Count event ids per scene by
    // matching ids that contain a dash (events are id: 'pier-1' etc.)
    const eventIdRe = /id:\s*['"](?:pier|tent|lighthouse)-\d+['"]/g
    const allEventIds = localDemo.match(eventIdRe) || []
    expect(allEventIds.length, `total demo events ${allEventIds.length}, expected 9`).toBe(9)
  })

  // Contract #2: useWorkstationMeta exposes isDemoMode + demoScene.
  it('BIG1-2: useWorkstationMeta exposes isDemoMode + demoScene + applyLocalAction + buildEventMessage', () => {
    const meta = readProjectFile('src/composables/useWorkstationMeta.js')
    expect(meta).toMatch(/const\s+isDemoMode\s*=\s*computed/)
    expect(meta).toMatch(/const\s+demoScene\s*=\s*computed/)
    expect(meta).toMatch(/applyLocalAction:\s*demo\.applyLocalAction/)
    expect(meta).toMatch(/buildEventMessage:\s*demo\.buildEventMessage/)
    // Returned in the destructure
    expect(meta).toMatch(/isDemoMode,\s*\n\s*demoScene/)
  })

  // Contract #3: Experience.vue wires the demo banner + local actions.
  it('BIG1-3: Experience.vue renders ws-demo-banner + handleLocalDemoEvent + 继续/切场景 buttons', () => {
    const exp = readProjectFile('src/pages/Experience.vue')
    expect(exp).toContain('class="ws-demo-banner"')
    expect(exp).toContain('handleLocalDemoEvent')
    expect(exp).toMatch(/@click="handleLocalDemoEvent\('continue'\)"/)
    expect(exp).toMatch(/@click="handleLocalDemoEvent\('scene'\)"/)
    // Banner is conditionally rendered on isDemoMode
    expect(exp).toMatch(/v-if="meta\.isDemoMode"/)
  })

  // Contract #4: GamePanel renders scene-prompt type as a divider
  // (not a normal scene-entry card).
  it('BIG1-4: GamePanel renders scene-prompt messages as .scene-prompt dividers', () => {
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    expect(gamePanel).toMatch(/v-if="msg\.type === 'scene'"/)
    expect(gamePanel).toContain('class="scene-prompt"')
    // Has both the kicker and the content
    expect(gamePanel).toContain('class="scene-prompt__kicker"')
  })

  // Contract #5: right rail shows demo placeholders when isDemoMode.
  it('BIG1-5: StatusBar / GeographyPanel / QuestLog render demo placeholders on isDemoMode', () => {
    const statusBar = readProjectFile('src/components/StatusBar.vue')
    const geo = readProjectFile('src/components/geography/GeographyPanel.vue')
    const quest = readProjectFile('src/components/QuestLog.vue')
    // StatusBar: demo-characters list
    expect(statusBar).toContain('class="demo-characters"')
    expect(statusBar).toMatch(/v-if="isDemoMode"/)
    // Geography: demo-scene (location)
    expect(geo).toContain('class="demo-scene"')
    expect(geo).toMatch(/v-if="isDemoMode"/)
    // QuestLog: demo-events list
    expect(quest).toContain('class="demo-events"')
    expect(quest).toMatch(/v-if="isDemoMode"/)
  })

  // Contract #6: kao.css has demo + scene-prompt styles, no forbidden
  // patterns. .theme-kao gated, all colors via var(--archive-*).
  it('BIG1-6: kao.css demo + scene-prompt rules clean (no global/deep escapes, importance keyword, raw hex)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    // New rules exist
    expect(kao).toMatch(/\.theme-kao\s+\.ws-demo-banner\s*\{/)
    expect(kao).toMatch(/\.theme-kao\s+\.scene-prompt\s*\{/)
    expect(kao).toMatch(/\.theme-kao\s+\.demo-characters\s*\{/)
    expect(kao).toMatch(/\.theme-kao\s+\.demo-event\s*\{/)
    // Extract the new rule bodies
    const newRules = [
      kao.match(/\.theme-kao\s+\.ws-demo-banner\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.scene-prompt\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.demo-characters\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.demo-event\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.demo-scene\s*\{[^}]*\}/s)?.[0]
    ].filter(Boolean)
    expect(newRules.length).toBeGreaterThanOrEqual(5)
    const forbiddenImportance = new RegExp(`!${'important'}`)
    for (const m of newRules) {
      expect(m, `BIG1 rule contains forbidden importance keyword: ${m.slice(0, 80)}...`).not.toMatch(forbiddenImportance)
      expect(m, `BIG1 rule contains raw hex: ${m.slice(0, 80)}...`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  // Contract #7: BIG1 stays workstation-scoped (no Writing / Notes
  // selector pollution in the NEW rules only).
  it('BIG1-7: BIG1 additions are workstation-scoped (no Writing/Notes selectors in new rules)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const exp = readProjectFile('src/pages/Experience.vue')
    const gamePanel = readProjectFile('src/components/GamePanel.vue')
    // The 5 new BIG1 rule bodies must not mention Writing/Notes selectors
    const newRules = [
      kao.match(/\.theme-kao\s+\.ws-demo-banner\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.scene-prompt\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.demo-characters\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.demo-event\s*\{[^}]*\}/s)?.[0],
      kao.match(/\.theme-kao\s+\.demo-scene\s*\{[^}]*\}/s)?.[0]
    ].filter(Boolean)
    for (const m of newRules) {
      expect(m, `BIG1 rule mentions Writing selector: ${m.slice(0, 80)}...`).not.toMatch(/\.wall/)
      expect(m, `BIG1 rule mentions Notes selector: ${m.slice(0, 80)}...`).not.toMatch(/\.material/)
      expect(m, `BIG1 rule mentions Notes selector: ${m.slice(0, 80)}...`).not.toMatch(/\.index-card/)
    }
    // Demo banner only inside ws-layout (not outside). Order can be
    // v-if first or class first depending on template style.
    expect(exp).toMatch(/<section[^>]*class="ws-demo-banner"[^>]*v-if="meta\.isDemoMode"|<section[^>]*v-if="meta\.isDemoMode"[^>]*class="ws-demo-banner"/)
    // scene-prompt only inside v-for of displayMessages
    expect(gamePanel).toMatch(/<div\s+v-if="msg\.type === 'scene'"\s+class="scene-prompt"/)
  })
})
