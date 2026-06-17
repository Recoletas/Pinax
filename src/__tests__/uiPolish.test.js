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

    expect(notes).toContain('class="material-selection-bar"')
    expect(notes).toContain('@click="importCheckedToCanvas">导入</button>')
    expect(notes).toContain('@click="setCheckedAssetsState(\'accepted\')">采纳</button>')
    expect(notes).toContain('@click="setCheckedAssetsState(\'archived\')">归档</button>')
    expect(notes).toContain('@click="deleteCheckedAssets">删除</button>')
    expect(notes).not.toContain('class="asset-status-control"')
    expect(notes).not.toContain('function setSelectedAssetState')
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

  it('uses the shared workbench page hero across the editor surfaces while Experience keeps only its work/session shell', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const writing = readProjectFile('src/pages/Writing.vue')
    const notes = readProjectFile('src/pages/Notes.vue')
    const proseEssay = readProjectFile('src/pages/ProseEssay.vue')
    const workbenchHero = readProjectFile('src/components/workbench/WorkbenchPageHero.vue')

    expect(experience).not.toContain('<WorkbenchPageHero')
    expect(experience).not.toContain('class="experience-stage-band"')
    expect(experience).toContain('class="game-layout"')
    expect(experience).toContain('class="game-main-shell"')
    expect(experience).toContain('class="sidebar-head-copy"')
    expect(writing).toContain('<WorkbenchPageHero')
    expect(writing).toContain('Writing Desk')
    expect(notes).toContain('<WorkbenchPageHero')
    expect(notes).toContain('Material Library')
    expect(proseEssay).toContain('<WorkbenchPageHero')
    expect(proseEssay).toContain('Storyboard Canvas')
    expect(workbenchHero).toContain('class="workbench-page-hero"')
    expect(workbenchHero).toContain('class="workbench-page-hero__title"')
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

  it('OpeningPage.vue session setup uses getLatestSessionForWorldbook (not just currentSessionId find)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(openingPage).toMatch(/getLatestSessionForWorldbook\s*\(/)
    expect(experience).not.toMatch(/getLatestSessionForWorldbook\s*\(/)
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

  it('OpeningPage ensureWorldAdventureSession guards against double-click via isStarting ref with try/finally', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(openingPage).toContain('isStarting')
    expect(experience).not.toContain('isStarting')
    // try/finally pattern: lock acquired at start, released in finally
    expect(openingPage).toMatch(
      /try\s*\{[\s\S]*?isStarting\.value\s*=\s*true[\s\S]*?finally\s*\{[\s\S]*?isStarting\.value\s*=\s*false/,
    )
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

// Phase 1C: Writing page kao archive-folio surface (2026-06-17 plan)
// 5 + 3 review-fix contracts: FolioSurface 4-zone wiring, chapter list
// BookmarkButton, AI panel primary/secondary, kao.css selector gating,
// mode-switch lock, sidebar collapse v-show, BookmarkButton .active,
// kao.css .theme-kao .ai-panel (renamed from .writing-ai-panel).
describe('ui polish — Phase 1C Writing page kao surface', () => {
  it('Writing.vue wraps 4 surfaces in <FolioSurface> (hero header / books-sidebar / editor-main / asset-inbox modal) — kao archive-folio zone grammar', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // 4 surfaces wrapped: WorkbenchPageHero (header) + books-sidebar (aside) + editor-main (main) + asset inbox modal (article)
    const folioMatches = writing.match(/<FolioSurface[^>]*>/g) || []
    expect(folioMatches.length).toBeGreaterThanOrEqual(4)

    // hero uses chrome + plain (decorated=false because WorkbenchPageHero
    // has its own ::before + border-bottom, double-frame is wrong)
    expect(writing).toMatch(/<FolioSurface[^>]*as="header"[^>]*variant="chrome"[^>]*decorated="false"/)
    // sidebar uses paper + decorated (full folio spine)
    expect(writing).toMatch(/<FolioSurface[^>]*as="aside"[^>]*variant="paper"[^>]*decorated="true"/)
    // editor-main uses chrome + plain (the editor surface itself gets the paper tint via .writing-editor rule, not the folio chrome)
    expect(writing).toMatch(/<FolioSurface[^>]*as="main"[^>]*variant="chrome"[^>]*decorated="false"/)
    // inbox modal uses paper + decorated
    expect(writing).toMatch(/<FolioSurface[^>]*as="article"[^>]*variant="paper"[^>]*decorated="true"/)
  })

  it('Writing.vue chapter list rows render as <BookmarkButton variant="tertiary" size="compact" index label> — kao 目录页 grammar', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // chapter list: each row is a BookmarkButton --tertiary --compact
    // must appear inside the chapter list (not the book list — books stay .action-btn)
    const chapterListSection = writing.match(
      /<div\s+class="chapter-list"[\s\S]*?<\/div>\s*<\/aside>/,
    )
    expect(chapterListSection).not.toBeNull()
    const chapterList = chapterListSection?.[0] ?? ''

    // At least 1 BookmarkButton --tertiary --compact for the chapter list
    expect(chapterList).toMatch(
      /<BookmarkButton[^>]*variant="tertiary"[^>]*size="compact"[^>]*\/>/,
    )
    // Each chapter BookmarkButton must expose index (number) + label (title)
    expect(chapterList).toMatch(/:index="chapter\.num|padStart|chapterIndex|chapterNumber/)
  })

  it('Writing.vue AI panel primary action renders as <BookmarkButton variant="primary" label="应用 …"> + secondary as <BookmarkButton variant="secondary">', () => {
    const writing = readProjectFile('src/pages/Writing.vue')

    // 1 BookmarkButton --primary in the AI panel (应用)
    expect(writing).toMatch(/<BookmarkButton[^>]*variant="primary"[^>]*label="[\s\S]*?应用/)
    // 1 BookmarkButton --secondary in the AI panel (拒收 / 取消 / 不应用)
    expect(writing).toMatch(/<BookmarkButton[^>]*variant="secondary"[^>]*label="[\s\S]*?(拒收|取消|不应用)/)
  })

  it('kao.css exposes .theme-kao .writing-page / .writing-sidebar / .writing-editor / .ai-panel selectors — all writing surface rules live in kao.css, not main.css', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const mainCss = readProjectFile('src/styles/main.css')

    // kao.css has the writing-* surface rules + .ai-panel all gated by .theme-kao
    expect(kaoCss).toMatch(/\.theme-kao\s+\.writing-page\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.writing-sidebar\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.writing-editor\b/)
    // .ai-panel replaces the dead .writing-ai-panel selector (rename: no DOM
    // element had `class="writing-ai-panel"`, the actual AI panel is
    // `<div class="ai-panel">` at Writing.vue:339).
    expect(kaoCss).toMatch(/\.theme-kao\s+\.ai-panel\b/)
    // The renamed-away selector must NOT still exist
    expect(kaoCss).not.toMatch(/\.theme-kao\s+\.writing-ai-panel\b/)

    // main.css must NOT carry writing-* surface rules (kao-only territory)
    expect(mainCss).not.toMatch(/^\.writing-page\b/m)
    expect(mainCss).not.toMatch(/^\.writing-sidebar\b/m)
    expect(mainCss).not.toMatch(/^\.writing-editor\b/m)
    expect(mainCss).not.toMatch(/^\.ai-panel\b/m)
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

  // --- review-fix contracts (2026-06-17 v2 amend) ---

  it('Writing.vue books-sidebar footer is v-show gated by !isRightCollapsed (review-fix: CharacterPortrait 256px must not leak when sidebar is 44px collapsed)', () => {
    const writing = readProjectFile('src/pages/Writing.vue')
    // The CharacterPortrait mount in the sidebar footer must be inside v-show="!isRightCollapsed".
    const footer = writing.match(
      /<footer[^>]*class="writing-sidebar__footer"[\s\S]*?<\/footer>/,
    )
    expect(footer).not.toBeNull()
    expect(footer?.[0] ?? '').toContain('v-show="!isRightCollapsed"')
    expect(footer?.[0] ?? '').toContain('CharacterPortrait')
    // CharacterPortrait must carry a max-width style attribute to constrain 256px → ≤180px
    expect(footer?.[0] ?? '').toMatch(/style="[^"]*max-width:\s*180px/)
  })

  it('kao.css exposes .theme-kao .bookmark-button.active rule (review-fix: chapter list active class was visually dead — BookmarkButton.vue has no .active state)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    expect(kaoCss).toMatch(/\.theme-kao\s+\.bookmark-button\.active\s*\{/)
  })

  it('kao.css rescues .theme-kao .books-sidebar flex layout (review-fix: scoped CSS can no longer reach the FolioSurface root <aside>, so flex/column must live in kao.css)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    // .books-sidebar is the root <aside> rendered by FolioSurface.vue, so
    // Writing.vue's scoped CSS for `.books-sidebar { display: flex; flex-direction: column }`
    // doesn't reach it. kao.css owns this rule (gated by .theme-kao).
    expect(kaoCss).toMatch(/\.theme-kao\s+\.books-sidebar\s*\{/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.books-sidebar\s*\{[^}]*display:\s*flex/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.books-sidebar\s*\{[^}]*flex-direction:\s*column/)
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
