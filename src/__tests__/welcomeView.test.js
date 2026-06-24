import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('welcome view redesign', () => {
  it('uses the routed Pinax welcome surface and keeps the entry narrative focused', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toContain('Pinax')
    expect(welcomeView).toContain('class="welcome-stage-poster"')
    expect(welcomeView).toContain('class="welcome-poster-shell"')
    expect(welcomeView).toContain('class="welcome-poster-frame"')
    expect(welcomeView).toContain('class="welcome-poster-stage"')
    expect(welcomeView).toContain('class="welcome-poster-meta__brand">Pinax')
    expect(welcomeView).toContain('featuredPreset.name')
    expect(welcomeView).toContain('featuredPreset.genreLabel')
    // W2 (2026-06-26): primary action is now state-aware. The literal
    // "进入世界入口" / "继续当前故事" aria-labels are gone — they
    // become 4 dynamic states (setup / choose-world / start / resume).
    // The contract is the 4 dynamic labels exist in primaryAction.
    expect(welcomeView).toMatch(/label:\s*['"]开始配置['"]/)
    expect(welcomeView).toMatch(/label:\s*['"]选择世界['"]/)
    expect(welcomeView).toMatch(/label:\s*['"]开始冒险['"]/)
    expect(welcomeView).toMatch(/label:\s*['"]继续冒险['"]/)
    expect(welcomeView).toContain('<PosterStage')
    expect(welcomeView).toContain('<FolioSurface')
    expect(welcomeView).toContain('<BookmarkButton')
    expect(welcomeView).toContain('<ArchiveStrip')
    expect(welcomeView).toContain('index-class="welcome-command-index"')
    expect(welcomeView).toContain('label-class="welcome-command-label"')
    expect(welcomeView).toContain('welcome-persona-note')
    expect(welcomeView).toContain('welcome-dossier')
    expect(welcomeView).toContain('welcome-briefing')
    expect(welcomeView).toContain('welcome-mission-card')
    expect(welcomeView).toContain('welcome-pressure-grid')
    expect(welcomeView).toContain('welcome-dossier-route')
    expect(welcomeView).toContain('welcome-exit-strip')
    expect(welcomeView).not.toContain('welcome-workbench-rail')
    expect(welcomeView).not.toContain('让剧情先发生')
    expect(welcomeView).not.toContain('虚构集</h1>')
    expect(welcomeView).not.toContain('WriterHelper 欢迎页')
    expect(welcomeView).not.toContain('Playable Worldbook')
  })

  it('routes the primary + secondary + tertiary actions through 3 layers (state-aware primary + 3 secondary + 2 tertiary)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    // W2 (2026-06-26): the 7-static-button contract is gone. The
    // welcomeCommandStack now renders 1 primary (state-aware) + 3
    // secondary (新世界 / 写作 / 素材) + 2 tertiary (设定 / 画布).
    // Verify the v-for loops exist and route the right targets.

    // Primary: state-aware, picked from primaryAction computed
    expect(welcomeView).toMatch(/const\s+primaryAction\s*=\s*computed/)
    expect(welcomeView).toContain(':to="primaryAction.to"')
    expect(welcomeView).toContain(':label="primaryAction.label"')
    expect(welcomeView).toContain(':aria-label="primaryAction.ariaLabel"')
    expect(welcomeView).toContain('class="welcome-primary-link"')

    // Secondary actions: 3 always-on (新世界 / 写作 / 素材)
    expect(welcomeView).toMatch(/const\s+secondaryActions\s*=\s*computed/)
    expect(welcomeView).toMatch(/secondaryActions/)
    expect(welcomeView).toMatch(/welcome-secondary-link--\$\{action\.key\}/)
    expect(welcomeView).toMatch(/'new-world'/)
    expect(welcomeView).toMatch(/'writing'/)
    expect(welcomeView).toMatch(/'materials'/)

    // Tertiary actions: 2 always-on (设定 / 画布)
    expect(welcomeView).toMatch(/const\s+tertiaryActions\s*=\s*computed/)
    expect(welcomeView).toMatch(/tertiaryActions/)
    expect(welcomeView).toMatch(/welcome-tertiary-link--\$\{action\.key\}/)
    expect(welcomeView).toMatch(/'settings'/)
    expect(welcomeView).toMatch(/'canvas'/)

    // 4 dynamic primary action states. Setup opens the shared settings
    // popup on the AI tab; the other 3 states route to their work surfaces.
    expect(welcomeView).toContain("to: null")
    expect(welcomeView).toContain('settingsPopup.open(\'ai\')')
    expect(welcomeView).toContain("to: '/settings/worldbook'")
    expect(welcomeView).toContain("to: '/opening'")
    expect(welcomeView).toContain("to: '/experience'")
  })
})

describe('welcome view pass 2 — 6-tile staggered collage', () => {
  it('renders 6 collage tiles (--1, --3, --4, --5, --7, --8) and 4 archive props', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toContain('welcome-collage-tile--1')
    expect(welcomeView).toContain('welcome-collage-tile--3')
    expect(welcomeView).toContain('welcome-collage-tile--4')
    expect(welcomeView).toContain('welcome-collage-tile--5')
    expect(welcomeView).toContain('welcome-collage-tile--7')
    expect(welcomeView).toContain('welcome-collage-tile--8')

    expect(welcomeView).not.toContain('welcome-collage-tile--2')
    expect(welcomeView).not.toContain('welcome-collage-tile--6')
    expect(welcomeView).not.toContain('welcome-collage-tile--9')

    expect(welcomeView).toContain('is-archive-prop--tape')
    expect(welcomeView).toContain('is-archive-prop--fold')
    expect(welcomeView).toContain('is-archive-prop--stain')
    // 2 tapes + 1 fold + 1 stain = 4 props, but tape class appears twice
    const tapeMatches = welcomeView.match(/is-archive-prop--tape/g) || []
    expect(tapeMatches.length).toBe(2)
  })

  it('removes legacy 3-tile classes (--a/--b/--c)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).not.toContain('welcome-collage-tile--a')
    expect(welcomeView).not.toContain('welcome-collage-tile--b')
    expect(welcomeView).not.toContain('welcome-collage-tile--c')
  })
})

describe('welcome view — first-run onboarding', () => {
  it('renders onboarding strip with 3 steps and correct aria', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toContain('class="welcome-onboarding"')
    expect(welcomeView).toContain('role="region"')
    expect(welcomeView).toContain('aria-label="首次启动引导"')
    expect(welcomeView).toContain('首次启动 · 3 步就绪')
  })

  it('step 1 opens the settings popup on the AI tab', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toMatch(/步骤 1[^<]*配置 AI/)
    expect(welcomeView).toContain('@click="openApiSettings"')
    expect(welcomeView).toContain('settingsPopup.open(\'ai\')')
    expect(welcomeView).toContain('aria-label="步骤 1：配置 AI"')
    expect(welcomeView).toContain('step1Done')
    expect(welcomeView).toContain('hasApiKey')
  })

  it('step 2 links to worldbook quick import', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toMatch(/步骤 2[^<]*选择世界/)
    expect(welcomeView).toContain('to="/settings/worldbook"')
    expect(welcomeView).toContain('aria-label="步骤 2：选择世界"')
    expect(welcomeView).toContain('step2Done')
  })

  it('step 3 links to opening page', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toMatch(/步骤 3[^<]*开始开场/)
    expect(welcomeView).toContain('to="/opening"')
    expect(welcomeView).toContain('aria-label="步骤 3：开始开场"')
    expect(welcomeView).toContain('step3Done')
  })

  it('onboarding is gated by isOnboarding (all 3 conditions)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toContain('v-if="isOnboarding"')
    expect(welcomeView).toContain('const isOnboarding = computed(() => !allStepsDone.value)')
    expect(welcomeView).toContain('const allStepsDone = computed(() => step1Done.value && step2Done.value && step3Done.value)')
    expect(welcomeView).toContain('hasApiKey')
    expect(welcomeView).toContain('hasWorldbooks')
    expect(welcomeView).toContain('hasSessions')
  })

  it('renders 3-layer command stack (1 primary + 3 secondary + 2 tertiary BookmarkButtons)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    // W2 (2026-06-26): 7 static buttons replaced by 3-layer v-for loops
    // over computed arrays. The 3 visual class hooks (welcome-primary-link
    // / welcome-secondary-link / welcome-tertiary-link) are still used as
    // base classes — the welcome-secondary-link--{key} / --{key} modifier
    // classes are visual offsets within the same layer.
    expect(welcomeView).toContain('class="welcome-primary-link"')
    expect(welcomeView).toMatch(/class="`welcome-secondary-link welcome-secondary-link/)
    expect(welcomeView).toMatch(/class="`welcome-tertiary-link welcome-tertiary-link/)
    // 3 + 2 = 5 v-for items; the old quaternary/quinary/senary/septenary
    // index-style classes are no longer needed (replaced by --key modifier).
    expect(welcomeView).not.toContain('class="welcome-quaternary-link"')
    expect(welcomeView).not.toContain('class="welcome-quinary-link"')
    expect(welcomeView).not.toContain('class="welcome-senary-link"')
    expect(welcomeView).not.toContain('class="welcome-septenary-link"')
  })
})

// V2 (W2 2026-06-26): state-aware surface — 3 new contracts.
describe('welcome view — V2 state-aware surface (W2)', () => {
  it('computes 4 welcomeState values from hasApiKey/hasWorldbooks/hasSessions', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    // welcomeState machine: setup / choose-world / start / resume
    expect(welcomeView).toMatch(/const\s+welcomeState\s*=\s*computed/)
    expect(welcomeView).toContain("return 'setup'")
    expect(welcomeView).toContain("return 'choose-world'")
    expect(welcomeView).toContain("return 'start'")
    expect(welcomeView).toContain("return 'resume'")
  })

  it('renders the recent-session card only when hasSessions is true (no empty promise)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    // The card is gated by v-if="hasSessions && lastSession" — not by
    // static "show always", which is the previous broken contract.
    expect(welcomeView).toContain('v-if="hasSessions && lastSession"')
    expect(welcomeView).toContain('class="welcome-recent-session"')
    expect(welcomeView).toContain('role="region"')
    expect(welcomeView).toContain('aria-label="最近会话续接"')
    expect(welcomeView).toContain('lastSession.title')
    expect(welcomeView).toContain('lastSession.worldbookName')
    expect(welcomeView).toContain('lastSession.messageCount')
    expect(welcomeView).toContain('lastSession.updatedAt')
    // Enter button reads "进入" + aria-label interpolates session title
    expect(welcomeView).toMatch(/aria-label="`进入最近会话/)
    expect(welcomeView).toContain('enterLastSession')
    expect(welcomeView).toContain("router.push('/experience')")
  })

  it('shows the onboarding done seal when isOnboarding is false (no "page went blank" gap)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    // After all 3 onboarding steps complete, the strip v-if="isOnboarding"
    // hides. W2 adds a v-else done seal so the page doesn't read as empty.
    expect(welcomeView).toContain('class="welcome-onboarding-done"')
    expect(welcomeView).toContain('aria-label="已就绪"')
    expect(welcomeView).toContain('已就绪 · 可以开始')
    // archive-olive done color is used to mark completion
    expect(welcomeView).toContain('var(--archive-olive)')
  })

  it('gates featuredPreset chip behind "no worldbook" state (not always-on)', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    // Old contract: v-if="featuredPreset" (always on)
    // New contract: v-if="showFeaturedPreset" which is gated by !hasWorldbooks
    expect(welcomeView).toContain('v-if="showFeaturedPreset"')
    expect(welcomeView).not.toContain('v-if="featuredPreset"')
    expect(welcomeView).toMatch(/const\s+showFeaturedPreset\s*=\s*computed/)
  })
})
