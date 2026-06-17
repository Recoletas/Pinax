import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('opening page visual fit — wallpaper motion, title identity, CTA scale, right rail', () => {
  const openingPage = readProjectFile('src/pages/OpeningPage.vue')
  const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

  it('does not render the static face-region overlay when react is none, so upper art motion is not covered', () => {
    expect(characterBackdrop).toContain('v-if="resolvedReact !== \'none\'"')
    expect(characterBackdrop).toMatch(/<span\s+v-if="resolvedReact !== 'none'"\s+class="character-backdrop__face-region">/)
  })

  it('uses full-size stage-command buttons for 开局 / 改写, not micro compact stamps', () => {
    expect(openingPage).not.toMatch(/stage-command--compact stage-command--primary/)
    expect(openingPage).not.toMatch(/stage-command--compact stage-command--secondary/)
    expect(openingPage).not.toMatch(/size="micro"[\s\S]*?label="开局"/)
    expect(openingPage).not.toMatch(/size="micro"[\s\S]*?label="改写"/)

    const rule = openingPage.match(/\.stage-command\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(rule).toMatch(/min-width:\s*264px/)
    expect(rule).toMatch(/min-height:\s*88px/)
    expect(rule).toMatch(/grid-template-columns:\s*64px minmax\(0,\s*1fr\)/)
    expect(rule).toMatch(/scale\(1\.14\)/)
  })

  it('styles the world/theme controls as an archive right rail instead of default form buttons', () => {
    expect(openingPage).toContain('class="opening-world-card"')
    expect(openingPage).toContain('class="opening-rail-btn opening-rail-btn--primary" type="button" data-rail-index="01"')
    expect(openingPage).toContain('class="opening-rail-btn" type="button" data-rail-index="02"')

    const actionsRule = openingPage.match(/\.opening-toolbar__actions\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(actionsRule).toMatch(/display:\s*grid/)
    expect(actionsRule).toMatch(/justify-items:\s*end/)
    expect(actionsRule).toMatch(/rotateZ\(var\(--opening-rail-slope\)\)/)
    expect(openingPage).toMatch(/\.opening-toolbar__actions::before\s*\{[\s\S]*?linear-gradient/s)
    expect(openingPage).toMatch(/\.opening-rail-btn::after\s*\{[\s\S]*?content:\s*attr\(data-rail-index\)/s)

    const railRule = openingPage.match(/\.opening-world-card,\n\.opening-rail-btn\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(railRule).toMatch(/clip-path:\s*polygon/)
    expect(railRule).toMatch(/backdrop-filter:\s*blur\(12px\) saturate\(1\.08\)/)
  })

  it('keeps the top-left world title unique and embeds it into the background curve', () => {
    expect(openingPage).not.toContain('opening-toolbar__copy')
    expect(openingPage).toContain('class="opening-embedded-title"')
    expect(openingPage).toContain('class="opening-embedded-title__glyph"')
    expect(openingPage).toContain('embeddedTitleGlyphs')

    const titleRule = openingPage.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\n\}/)?.[0] || ''
    const titleBlockRule = openingPage.match(/\.opening-title-block\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(titleRule).toContain('"Iowan Old Style"')
    expect(titleRule).toMatch(/font-style:\s*italic/)
    expect(titleBlockRule).toMatch(/rotateZ\(var\(--opening-copy-arc\)\)/)
    expect(titleBlockRule).toMatch(/skewX\(var\(--opening-copy-skew\)\)/)
    expect(titleRule).toMatch(/perspective\(900px\) rotateY\(-16deg\) rotateZ\(2deg\) skewX\(-5deg\)/)
    expect(titleRule).toMatch(/mix-blend-mode:\s*soft-light/)
    expect(titleRule).toContain('-webkit-text-stroke')
    expect(titleRule).not.toContain('-webkit-text-fill-color: transparent')

    const glyphRule = openingPage.match(/\.opening-embedded-title__glyph\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(glyphRule).toMatch(/translateY\(var\(--glyph-y\)\) rotate\(var\(--glyph-rotate\)\)/)
  })

  it('places the action buttons and scene switcher as perspective foreground pieces', () => {
    const actionsRule = openingPage.match(/\.opening-action-actions\s*\{[\s\S]*?\n\}/)?.[0] || ''
    const sceneRules = openingPage.match(/\.opening-scene\s*\{[\s\S]*?\n\}/g) || []
    const sceneRule = sceneRules.find((rule) => /position:\s*absolute/.test(rule)) || ''

    expect(actionsRule).toMatch(/bottom:\s*clamp\(132px,\s*15vh,\s*218px\)/)
    expect(actionsRule).toMatch(/left:\s*clamp\(92px,\s*7\.4vw,\s*190px\)/)
    expect(actionsRule).toMatch(/rotateX\(12deg\) rotateY\(-19deg\) rotateZ\(-8deg\)/)
    expect(openingPage).toMatch(/\.stage-command--secondary\s*\{[\s\S]*?scale\(0\.84\)/)

    expect(sceneRule).toMatch(/position:\s*absolute/)
    expect(sceneRule).toMatch(/right:\s*clamp\(-86px,\s*-3\.2vw,\s*-34px\)/)
    expect(sceneRule).toMatch(/width:\s*min\(720px,\s*39vw\)/)
    expect(openingPage).toMatch(/character-archive-strip__tile:nth-child\(1\)[\s\S]*?scale\(0\.66\)/)
    expect(openingPage).toMatch(/character-archive-strip__tile:nth-child\(2\)[\s\S]*?scale\(0\.9\)/)
    expect(openingPage).toMatch(/character-archive-strip__tile:nth-child\(3\)[\s\S]*?scale\(0\.66\)/)
  })

  it('uses localized dynamic-wallpaper overlays instead of idle whole-image animation', () => {
    const artRule = characterBackdrop.match(/\.character-backdrop__art\s*\{[\s\S]*?\n\}/)?.[0] || ''
    const artBgRule = characterBackdrop.match(/\.character-backdrop__art-bg\s*\{[\s\S]*?\n\}/)?.[0] || ''

    expect(characterBackdrop).toMatch(/\.character-backdrop::before,\n\.character-backdrop::after\s*\{/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperMist\b/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperGrain\b/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperLight\b/)
    expect(characterBackdrop).not.toMatch(/@keyframes\s+artBreathe\b/)
    expect(characterBackdrop).not.toMatch(/@keyframes\s+artDrift\b/)
    expect(artRule).not.toMatch(/animation:\s*artBreathe/)
    expect(artBgRule).not.toMatch(/animation:\s*artDrift/)
  })
})
