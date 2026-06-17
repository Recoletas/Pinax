import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

// 5C v3.12 — ZCOOL XiaoWei 签名体 (signature style with connected
// strokes) + 不可不见的上半屏动态.
// Current opening polish keeps visible motion but moves it to localized
// wallpaper overlays, and changes the title from shimmer text into a
// serif glyph mark embedded into the background curve.
// Source-string contract tests: read the project files, assert the
// expected CSS / preload markers exist (and the old Liu Jian Mao Cao
// is gone).
describe('5C v3.12 signature font + visible motion', () => {
  it('loads ZCOOL XiaoWei and removes Liu Jian Mao Cao from Google Fonts in index.html', () => {
    const indexHtml = readProjectFile('index.html')

    // New signature font added to the Google Fonts stylesheet
    expect(indexHtml).toContain('ZCOOL+XiaoWei')
    // Old dramatic 草书 is removed (rejected as "too professional cursive")
    expect(indexHtml).not.toContain('Liu+Jian+Mao+Cao')
  })

  it('wires --font-display and --font-serif to ZCOOL XiaoWei as primary in main.css', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    // v3.14: --font-display and --font-serif both ZCOOL XiaoWei
    // (v3.13 tried QingKe HuangYou for display but user said the
    // font looked "weird" — v3.12 baseline restored).
    expect(mainCss).toMatch(/--font-display:\s*"ZCOOL XiaoWei"[\s\S]*?;/)
    expect(mainCss).toMatch(/--font-serif:\s*"ZCOOL XiaoWei"[\s\S]*?;/)
  })

  it('keeps visible motion through dynamic-wallpaper overlays instead of artBreathe', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperMist\b/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperGrain\b/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperLight\b/)
    expect(characterBackdrop).not.toMatch(/@keyframes\s+artBreathe\b/)
  })

  it('does not reintroduce whole-art horizontal drift via @keyframes artDrift', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')
    const artBgRule = characterBackdrop.match(/\.character-backdrop__art-bg\s*\{[\s\S]*?\n\}/)?.[0] || ''

    expect(characterBackdrop).not.toMatch(/@keyframes\s+artDrift\b/)
    expect(artBgRule).not.toMatch(/animation:\s*artDrift/)
  })

  it('renders the opening title as embedded curved serif glyphs, not masked shimmer text (5C v3.15+ stronger wall perspective)', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')
    const titleRule = openingPage.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\n\}/)?.[0] || ''
    const glyphRule = openingPage.match(/\.opening-embedded-title__glyph\s*\{[\s\S]*?\n\}/)?.[0] || ''

    expect(openingPage).toContain('embeddedTitleGlyphs')
    expect(titleRule).toContain('"Iowan Old Style"')
    expect(titleRule).toMatch(/font-style:\s*italic/)
    expect(titleRule).toMatch(/perspective\(900px\) rotateY\(-16deg\) rotateZ\(2deg\) skewX\(-5deg\)/)
    expect(titleRule).toMatch(/mix-blend-mode:\s*soft-light/)
    expect(glyphRule).toMatch(/translateY\(var\(--glyph-y\)\) rotate\(var\(--glyph-rotate\)\)/)
    expect(openingPage).not.toMatch(/@keyframes\s+titleShimmer\b/)
    expect(titleRule).not.toContain('background-clip: text')
  })
})
