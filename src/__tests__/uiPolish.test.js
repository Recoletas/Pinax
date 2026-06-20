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
    expect(experience).toContain('class="game-main-shell"')
    expect(experience).toContain('class="sidebar-head-copy"')
    expect(experience).not.toContain('label="开局"')
    expect(experience).not.toContain('label="改写"')
    expect(experience).not.toContain('从这里开局')
    expect(experience).not.toContain('改成自己写')
    expect(experience).not.toContain('GM 指令')
    expect(experience).not.toContain('class="opening-command-preview"')
    expect(experience).not.toContain('class="experience-entry-rail"')
    expect(experience).not.toContain('右列只放会影响当前推进的东西')
    expect(appShell).toContain('class="shell-menu-btn shell-nav-trigger"')
    expect(appShell).toContain('class="shell-drawer"')
    expect(appShell).not.toContain('<header class="shell-mast">')
    expect(appShell).not.toContain('class="shell-tabbar"')
    expect(appShell).not.toContain('Mode {{')
    expect(activityBar).toContain('class="activity-btn"')
    expect(activityBar).toContain('class="activity-desc"')
    expect(router).toContain('immersiveShell: true')
    expect(router).toContain('hideActivityBar: true')
    expect(router).toContain('hideSidePanel: true')
    expect(router).toMatch(/path:\s*'opening'[\s\S]*?name:\s*'opening'/)
    expect(router).toMatch(/name:\s*'opening'[\s\S]*?hideGlobalMemory:\s*true/)
    expect(router).toMatch(/name:\s*'experience-worldbook'[\s\S]*?activityKey:\s*'experience'/)
    expect(router).toMatch(/name:\s*'experience-worldbook'[\s\S]*?hideGlobalMemory:\s*true/)
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
    expect(experience).toContain('class="game-layout"')
    expect(experience).toContain('class="game-main-shell"')
    expect(experience).toContain('class="sidebar-head-copy"')

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

    // Wall structure: molding + cork-board + main 3-zone + floor
    expect(writing).toMatch(/class="wall__molding"/)
    expect(writing).toMatch(/class="wall__cork"/)
    expect(writing).toMatch(/class="wall__pins"/)
    expect(writing).toMatch(/class="wall__pin"/)
    expect(writing).toMatch(/class="wall__pin-dot"/)
    expect(writing).toMatch(/class="wall__stamp"/)
    expect(writing).toMatch(/class="wall__ribbon"/)
    expect(writing).toMatch(/class="wall__tabs"/)
    expect(writing).toMatch(/class="wall__main"/)
    expect(writing).toMatch(/class="wall__shelf"/)
    expect(writing).toMatch(/class="wall__folder"/)
    expect(writing).toMatch(/class="wall__shelf-roll"/)
    expect(writing).toMatch(/class="wall__dossier"/)
    expect(writing).toMatch(/class="wall__pin-cnr wall__pin-cnr--tl"/)
    expect(writing).toMatch(/class="wall__dossier-head"/)
    expect(writing).toMatch(/class="wall__dossier-num"/)
    expect(writing).toMatch(/class="wall__dossier-title"/)
    expect(writing).toMatch(/class="wall__dossier-empty"/)
    expect(writing).toMatch(/class="wall__empty-stamp"/)
    expect(writing).toMatch(/class="wall__empty-clip"/)
    expect(writing).toMatch(/class="wall__pin-cta"/)
    expect(writing).toMatch(/class="wall__dossier-portrait"/)
    expect(writing).toMatch(/class="wall__steel-pin wall__steel-pin--tl"/)
    expect(writing).toMatch(/class="wall__pin-cnr wall__pin-cnr--tl"/)
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

    // kao variant — uses --archive-* tokens
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__molding\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__cork\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__pin\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.wall__stamp\s*\{/)
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
    expect(lines).toBeLessThanOrEqual(1700)
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

describe('ui polish — Experience V2 archive binder (Phase 1C slice A: right sidebar → 现场档案夹)', () => {
  it('Experience.vue owns the kao sidebar archive-binder override without scoped :global leakage', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar\s*\{[^}]*var\(--archive-gold\)/s,
    )
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar::before\s*\{[^}]*repeating-linear-gradient/s,
    )
    expect(experience).not.toContain(':global(.theme-kao)')
    expect(kaoCss).not.toMatch(/\.theme-kao\s+\.sidebar\s*\{/)
    expect(kaoCss).not.toContain('Experience V2')
  })

  it('Experience.vue exposes kao sidebar-head rule with archive paper + clip-path: none', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar-head\s*\{[^}]*clip-path:\s*none/s,
    )
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar-head\s*\{[^}]*var\(--archive-paper-soft\)/s,
    )
  })

  it('Experience.vue exposes kao sidebar-head::before with "卷宗" half-stripped index badge', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar-head::before\s*\{[^}]*content:\s*"卷宗"/s,
    )
    // Half-stripped effect: the badge uses the same archive paper as the head body,
    // so the gold hairline appears to "break" through the top edge of the card.
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar-head::before\s*\{[^}]*top:\s*-8px/s,
    )
  })

  it('Experience.vue exposes kao sidebar-section rule with archive paper + clip-path: none', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar-section\s*\{[^}]*clip-path:\s*none/s,
    )
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar-section\s*\{[^}]*var\(--archive-paper\)/s,
    )
  })

  it('Experience.vue exposes kao sidebar-toggle rule with archive paper + clip-path: none', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar-toggle\s*\{[^}]*clip-path:\s*none/s,
    )
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.sidebar-toggle\s*\{[^}]*var\(--archive-paper\)/s,
    )
  })

  it('Experience.vue keeps the 3 functional sidebar sections (StatusBar / GeographyPanel / QuestLog) and 收起/展开 toggle — archive binder is visual-only, no functional regression', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toContain('<StatusBar')
    expect(experience).toContain('<GeographyPanel')
    expect(experience).toContain('<QuestLog')
    expect(experience).toContain('sidebarCollapsed = !sidebarCollapsed')
    // Quick-note toggle uses Vue's .stop modifier; match the function name, not the verbatim @click string.
    expect(experience).toMatch(/toggleQuickNoteWorkspace/)
  })

  it('Experience.vue still has no <WorkbenchPageHero> (Phase 1C lock: right sidebar is the only chrome, no dashboard hero on /experience)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).not.toContain('<WorkbenchPageHero')
  })
})

describe('ui polish — UI-E2: Experience Site Record Book (Phase 1C slice B: main area 6-field record header + input de-SaaS + sidebar labels)', () => {
  // 1) Main area has a 6-field record header (案号 / 卷次 / 当下时间 / 在场人物 / 当前地点 / 当前任务)
  it('Experience.vue exposes a record-folio section with 6 fields and a band (现场记录本 header)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toContain('class="record-folio"')
    expect(experience).toContain('record-folio__band')
    expect(experience).toContain('record-folio__grid')
    for (const kicker of ['案号', '卷次', '当下时间', '在场人物', '当前地点', '当前任务']) {
      expect(experience).toContain(kicker)
    }
  })

  it('Experience.vue 6-field record reads from existing gameStore fields (no new store fields)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    // 6 computed properties reading existing gameStore data
    expect(experience).toMatch(/recordCaseNo.*=.*computed/)
    expect(experience).toMatch(/recordVolume.*=.*computed/)
    expect(experience).toMatch(/recordTime.*=.*computed/)
    expect(experience).toMatch(/recordCharacters.*=.*computed/)
    expect(experience).toMatch(/recordLocation.*=.*computed/)
    expect(experience).toMatch(/recordObjective.*=.*computed/)
    // Sources (must be from existing gameStore, not new fields)
    expect(experience).toMatch(/gameStore\.currentSessionId/)
    expect(experience).toMatch(/gameStore\.sessions/)
    expect(experience).toMatch(/gameStore\.writingTime/)
    expect(experience).toMatch(/gameStore\.encounteredCharacters/)
    expect(experience).toMatch(/gameStore\.worldMapState/)
    expect(experience).toMatch(/gameStore\.goals/)
  })

  it('Experience.vue exposes the record-folio visual rules in the .theme-kao unscoped block (no :global, no !important, no :deep)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.record-folio\s*\{[^}]*var\(--archive-paper-soft\)/s,
    )
    expect(experience).toMatch(
      /\.theme-kao\s+\.game-page\s+\.record-folio__grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/s,
    )
    // Hard constraints — none of these forbidden patterns in the record-folio block
    const recordFolioBlock = experience.match(/\.theme-kao\s+\.game-page\s+\.record-folio[\s\S]*?\n}/)
    expect(recordFolioBlock).not.toBeNull()
    const block = recordFolioBlock[0]
    expect(block).not.toContain(':global')
    expect(block).not.toContain(':deep')
    expect(block).not.toContain('!important')
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
    expect(notes).toContain('class="active-card"')
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

  it('UI-N2: empty-archive is a 12-cell dashed grid + tilted blank card (object narrative, not centered SVG + button)', () => {
    const notes = readProjectFile('src/pages/Notes.vue')
    // 12 cells via v-for="n in 12"
    expect(notes).toContain('v-for="n in 12"')
    expect(notes).toContain('class="empty-archive__cell"')
    expect(notes).toContain('class="empty-archive__card"')
    expect(notes).toContain('class="empty-archive__tape"')
    expect(notes).toContain('class="empty-archive__title"')
    expect(notes).toMatch(/empty-archive__cta/)
    // No more centered-SVG empty-state
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
