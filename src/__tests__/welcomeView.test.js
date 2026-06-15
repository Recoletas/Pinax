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
    expect(welcomeView).toContain('aria-label="进入世界入口"')
    expect(welcomeView).toContain('aria-label="继续当前故事"')
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

  it('routes the poster CTAs through OpeningPage before the current adventure surface', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    const primaryCta =
      welcomeView.match(/<BookmarkButton[\s\S]*?class="welcome-primary-link"[\s\S]*?\/>/)?.[0] || ''
    const secondaryCta =
      welcomeView.match(/<BookmarkButton[\s\S]*?class="welcome-secondary-link"[\s\S]*?\/>/)?.[0] || ''
    const tertiaryCta =
      welcomeView.match(/<BookmarkButton[\s\S]*?class="welcome-tertiary-link"[\s\S]*?\/>/)?.[0] || ''

    expect(primaryCta).toContain('label="进入世界"')
    expect(primaryCta).toContain('to="/opening"')
    expect(secondaryCta).toContain('label="继续"')
    expect(secondaryCta).toContain('to="/experience"')
    expect(tertiaryCta).toContain('label="新卷"')
    expect(tertiaryCta).toContain('to="/experience/worldbook"')
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
