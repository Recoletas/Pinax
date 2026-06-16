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
    expect(rule).toMatch(/min-width:\s*210px/)
    expect(rule).toMatch(/min-height:\s*72px/)
    expect(rule).toMatch(/grid-template-columns:\s*64px minmax\(0,\s*1fr\)/)
  })

  it('styles the world/theme controls as an archive right rail instead of default form buttons', () => {
    expect(openingPage).toContain('class="opening-world-card"')
    expect(openingPage).toContain('class="opening-rail-btn opening-rail-btn--primary" type="button" data-rail-index="01"')
    expect(openingPage).toContain('class="opening-rail-btn" type="button" data-rail-index="02"')

    const actionsRule = openingPage.match(/\.opening-toolbar__actions\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(actionsRule).toMatch(/display:\s*grid/)
    expect(actionsRule).toMatch(/justify-items:\s*end/)
    expect(openingPage).toMatch(/\.opening-toolbar__actions::before\s*\{[\s\S]*?linear-gradient/s)
    expect(openingPage).toMatch(/\.opening-rail-btn::after\s*\{[\s\S]*?content:\s*attr\(data-rail-index\)/s)

    const railRule = openingPage.match(/\.opening-world-card,\n\.opening-rail-btn\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(railRule).toMatch(/clip-path:\s*polygon/)
    expect(railRule).toMatch(/backdrop-filter:\s*blur\(12px\) saturate\(1\.08\)/)
  })

  it('keeps the top-left world title unique, serif, and slightly italic instead of repeating it in the toolbar', () => {
    expect(openingPage).not.toContain('opening-toolbar__copy')

    const titleRule = openingPage.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\n\}/)?.[0] || ''
    expect(titleRule).toContain('"Iowan Old Style"')
    expect(titleRule).toMatch(/font-style:\s*italic/)
    expect(titleRule).toMatch(/transform:\s*skewX\(-4deg\)/)
    expect(titleRule).not.toContain('-webkit-text-fill-color: transparent')
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
