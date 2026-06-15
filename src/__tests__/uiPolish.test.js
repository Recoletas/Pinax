import { existsSync, readFileSync } from 'node:fs'
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

  it('exposes the archive-folio utilities and mounts them across the core chrome surfaces', () => {
    // The archive-folio utility classes (`.is-folio`, `.is-bookmark`,
    // `.is-archive-strip`) live in src/styles/themes/kao.css and are
    // gated by `.theme-kao` (per theme-system Task 3 split). They are
    // not in main.css.
    const kaoCss = readProjectFile('src/styles/themes/kao.css')
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')
    const appShell = readProjectFile('src/layouts/AppShell.vue')
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(kaoCss).toContain('.is-folio')
    expect(kaoCss).toContain('.is-bookmark')
    expect(kaoCss).toContain('.is-archive-strip')
    // Each utility must be gated by `.theme-kao` so it only applies
    // when the kao variant is loaded (legacy snapshot owns its own chrome).
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-folio/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-bookmark/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-strip/)
    expect(welcomeView).toContain('<PosterStage')
    expect(welcomeView).toContain('<FolioSurface')
    expect(welcomeView).toContain('<BookmarkButton')
    expect(welcomeView).toContain('<ArchiveStrip')
    expect(appShell).toContain('<FolioSurface')
    expect(appShell).toContain('class="shell-drawer"')
    expect(openingPage).toContain('<BookmarkButton')
    expect(openingPage).toContain('<ArchiveStrip')
    expect(openingPage).toContain('class="opening-archive-strip"')
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
    expect(openingPage).toContain('class="playable-world-opening-page"')
    expect(openingPage).toContain('class="opening-briefing"')
    expect(openingPage).toContain('class="opening-mission"')
    expect(openingPage).toContain('class="opening-pressure-grid"')
    expect(openingPage).toContain('class="opening-page-lead"')
    expect(openingPage).toContain('class="opening-page-facts"')
    expect(openingPage).toContain('playableWorldOpeningFacts')
    expect(openingPage).toContain('label="开局"')
    expect(openingPage).toContain('label="改写"')
    expect(openingPage).toContain("router.push({ name: 'experience' })")
    expect(experience).not.toContain('class="playable-world-opening-page"')
    expect(experience).not.toContain('class="opening-page-lead"')
    expect(experience).not.toContain('class="opening-page-facts"')
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

  it('exposes .is-archive-prop utility with 3 modifiers in kao.css (gated by .theme-kao)', () => {
    const kaoCss = readProjectFile('src/styles/themes/kao.css')

    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-prop\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-prop--tape\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-prop--fold\b/)
    expect(kaoCss).toMatch(/\.theme-kao\s+\.is-archive-prop--stain\b/)
  })

  it('main.css does not reference kao-only .is-archive-* utilities', () => {
    const mainCss = readProjectFile('src/styles/main.css')
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

  it('OpeningPage world hero uses kao grammar: isolation + mix-blend + background-image var', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const heroMatches = openingPage.match(/\.opening-stage-poster\s*\{[^}]*\}/gs) || []
    const heroRule =
      heroMatches.find((rule) => /isolation:\s*isolate/.test(rule)) || ''
    expect(heroRule).toMatch(/isolation:\s*isolate/)
    expect(heroRule).toMatch(/mix-blend-mode:\s*multiply/)
    expect(heroRule).toMatch(/background-image:\s*var\(--hero-image/)
  })

  it('Experience no longer carries the opening strip while OpeningPage isolates its shell', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const shellRule =
      openingPage.match(/\.opening-shell\s*\{[^}]*\}/s)?.[0] || ''
    expect(experience).not.toContain('class="playable-world-strip"')
    expect(shellRule).toMatch(/isolation:\s*isolate/)
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

  it('Only OpeningPage.vue owns stage-command BookmarkButton usages and they use size="micro"', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const experienceMatches = experience.match(/size="micro"/g) || []
    const openingMatches = openingPage.match(/size="micro"/g) || []
    expect(experienceMatches.length).toBe(0)
    expect(openingMatches.length).toBe(2)
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

  it('OpeningPage.vue .stage-command base remains a micro action tab, not a large bookmark block', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const baseRule =
      openingPage.match(/^[ \t]*\.stage-command\s*\{[^}]*\}/m)?.[0] || ''
    expect(baseRule).toMatch(/min-height:\s*40px/)
    expect(baseRule).toMatch(/min-width:\s*144px/)
    expect(baseRule).toMatch(/grid-template-columns:\s*38px\s+minmax\(0,\s*1fr\)/)
    expect(baseRule).not.toMatch(/min-height:\s*62px/)
    expect(baseRule).not.toMatch(/min-width:\s*216px/)
    expect(baseRule).not.toMatch(/grid-template-columns:\s*68px/)
  })

  it('OpeningPage.vue .stage-command--compact remains a smaller opening-action tab', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const compactRule =
      openingPage.match(/^[ \t]*\.stage-command--compact\s*\{[^}]*\}/m)?.[0] || ''
    expect(compactRule).toMatch(/min-height:\s*28px/)
    expect(compactRule).toMatch(/min-width:\s*88px/)
    expect(compactRule).toMatch(/grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\)/)
    expect(compactRule).not.toMatch(/min-height:\s*50px/)
    expect(compactRule).not.toMatch(/min-height:\s*36px/)
    expect(compactRule).not.toMatch(/min-height:\s*32px/)
    expect(compactRule).not.toMatch(/min-width:\s*100%/)
  })

  it('OpeningPage.vue opening action stage buttons keep the same micro width', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const openingRule =
      openingPage.match(/^[ \t]*\.opening-action-actions \.stage-command\s*\{[^}]*\}/m)?.[0] || ''
    expect(openingRule).toMatch(/width:\s*88px/)
    expect(openingRule).toMatch(/min-width:\s*88px/)
    expect(openingRule).toMatch(/flex:\s*0\s+0\s+88px/)
    expect(openingRule).not.toMatch(/min-width:\s*180px/)
    expect(openingRule).not.toMatch(/min-width:\s*144px/)
    expect(openingRule).not.toMatch(/min-width:\s*112px/)
    expect(openingRule).not.toMatch(/flex:\s*1\s+1\s+180px/)
  })

  it('OpeningPage.vue owns opening action buttons and sends hidden command before returning to /experience', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')
    const experience = readProjectFile('src/pages/Experience.vue')

    const pageStart = openingPage.indexOf('<section v-if="hasSelectedWorldbook" class="playable-world-opening-page"')
    const pageEnd = openingPage.indexOf('</section>', pageStart)
    const pageBlock = pageStart >= 0 && pageEnd > pageStart
      ? openingPage.slice(pageStart, pageEnd)
      : ''
    const sendBlock =
      openingPage.match(/async function sendOpeningAction\(\) \{[\s\S]*?\n\}/)?.[0] || ''
    expect(pageBlock).toContain('class="opening-action-head"')
    expect(pageBlock).toContain('class="opening-action-actions"')
    expect(pageBlock).toContain('class="opening-page-lead"')
    expect(pageBlock).toContain('class="opening-page-facts"')
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
    // The LXGW @font-face moved to src/styles/themes/kao.css in
    // theme-system Task 3; main.js no longer preloads it (Task 5 owns
    // the dynamic injection in ThemeAssets).
    const kaoCss = readProjectFile('src/styles/themes/kao.css')

    const faceBlock = kaoCss.match(/@font-face\s*\{[\s\S]*?\}/)?.[0] || ''
    expect(faceBlock).toContain('font-family: \'LXGW WenKai\'')
    expect(faceBlock).toContain('font-display: swap')
    expect(faceBlock).toMatch(/url\(['"]?\.\.\/\.\.\/assets\/fonts\/LXGWWenKai-Regular\.woff2['"]?\)/)
    expect(faceBlock).toMatch(/format\(['"]woff2['"]\)/)
  })

  it('exposes --font-display / --font-serif / --font-sans / --font-mono tokens', () => {
    // `--font-display` is kao-specific (paired with the LXGW @font-face
    // in kao.css); the other three stay in main.css as shared tokens.
    const mainCss = readProjectFile('src/styles/main.css')
    const kaoCss = readProjectFile('src/styles/themes/kao.css')

    expect(kaoCss).toMatch(/--font-display:\s*"LXGW WenKai"/)
    expect(mainCss).toMatch(/--font-serif:\s*"Iowan Old Style"/)
    expect(mainCss).toMatch(/--font-sans:\s*"Segoe UI Variable"/)
    expect(mainCss).toMatch(/--font-mono:/)
  })

  it('routes the OpeningPage title block through var(--font-display), not raw Iowan', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    const titleBlock = openingPage.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(titleBlock).toContain('font-family: var(--font-display)')
    // Defensive: the title block must NOT regress to the raw Iowan stack
    expect(titleBlock).not.toMatch(/font-family:\s*"Iowan Old Style"/)
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

describe('theme system CSS contracts', () => {
  const ROOT = resolve(__dirname, '../..')

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

  it('AppShell.vue mounts AppearanceControls inside shell-drawer__body (not nested in shell-drawer__activity)', () => {
    // Spec §6: "Primary placement inside shell-drawer__body, preferably below
    // navigation groups." Mounting inside shell-drawer__activity would constrain
    // the 4-radio fieldset to the 168px activity column on desktop >= 1040px.
    const appShell = readFileSync(resolve(ROOT, 'src/layouts/AppShell.vue'), 'utf8')

    // Balance <div> / </div> starting at a marker so nested child divs
    // (shell-drawer__activity, shell-drawer__panel) are included.
    function extractBalancedDiv(source, marker) {
      const start = source.indexOf(marker)
      if (start < 0) return ''
      const afterMarker = start + marker.length
      let depth = 1
      const divRe = /<\/?div\b[^>]*>/g
      divRe.lastIndex = afterMarker
      let m
      while ((m = divRe.exec(source)) !== null) {
        const isClose = m[0].startsWith('</div')
        depth += isClose ? -1 : 1
        if (depth === 0) return source.slice(start, m.index + m[0].length)
      }
      return ''
    }

    const bodyBlock = extractBalancedDiv(appShell, '<div class="shell-drawer__body">')
    const activityBlock = extractBalancedDiv(appShell, '<div class="shell-drawer__activity">')

    // Positive: <AppearanceControls /> must live inside shell-drawer__body.
    expect(bodyBlock).toMatch(/<AppearanceControls\s*\/>/)

    // Negative: <AppearanceControls /> must NOT live inside shell-drawer__activity.
    expect(activityBlock).not.toMatch(/<AppearanceControls\s*\/>/)
  })

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
})
