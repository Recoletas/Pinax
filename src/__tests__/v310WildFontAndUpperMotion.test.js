import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

// 5C v3.10 — 张扬字体 (Ma Shan Zheng + Long Cang from Google Fonts) +
// 上半屏动态 (face region breathing + dust motes).
//
// 5C v3.12 supersedes v3.10 (and v3.11) with:
//   - font upgrade: ZCOOL XiaoWei (signature style with connected
//     strokes) replaces Liu Jian Mao Cao / Long Cang / Ma Shan Zheng
//     as the only Google Fonts primary; the old calligraphic CJK
//     fonts are dropped from the Google Fonts stylesheet
//   - motion upgrade: face-region/whole-art breathing replaced by
//     localized wallpaper overlays (mist, grain, light) so only parts
//     of the background move.
//
// These tests verify the v3.10 STRUCTURAL guarantees still hold:
//   - Google Fonts preconnect + stylesheet are wired (with ZCOOL
//     XiaoWei as the single signature font)
//   - LXGW WenKai @font-face still ships (last-resort fallback)
//   - The dust-motes utility still ships and is reduced-motion gated
//   - The OpeningPage still mounts .dust-motes inside CharacterBackdrop
//   - Some visible background motion remains without moving the whole art
describe('5C v3.10 wild font + upper-half motion (carried forward into v3.12)', () => {
  it('loads ZCOOL XiaoWei from Google Fonts CDN in index.html', () => {
    const indexHtml = readProjectFile('index.html')

    // Preconnect + stylesheet still wired
    expect(indexHtml).toContain('rel="preconnect" href="https://fonts.googleapis.com"')
    expect(indexHtml).toContain('rel="preconnect" href="https://fonts.gstatic.com" crossorigin')
    // v3.12: single signature font (replaces v3.10's Ma Shan Zheng +
    // Long Cang + v3.11's Liu Jian Mao Cao)
    expect(indexHtml).toMatch(/family=ZCOOL\+XiaoWei/)
  })

  it('wires --font-display + --font-serif to ZCOOL XiaoWei in main.css (LXGW WenKai as @font-face fallback)', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    // v3.14: --font-display reverted to ZCOOL XiaoWei (v3.13 tried
    // QingKe HuangYou but user said the font looked "weird"). Both
    // --font-display and --font-serif are ZCOOL XiaoWei (signature
    // direction locked). LXGW WenKai @font-face still ships as
    // last-resort fallback if Google Fonts CDN is down.
    expect(mainCss).toMatch(/--font-display:\s*"ZCOOL XiaoWei"/)
    expect(mainCss).toMatch(/--font-serif:\s*"ZCOOL XiaoWei"/)
    // LXGW WenKai @font-face still ships (fallback if Google Fonts CDN is down)
    expect(mainCss).toContain('@font-face')
    expect(mainCss).toContain('"LXGW WenKai"')
  })

  it('ships a reduced-motion-gated .dust-motes utility for the upper half', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    // Utility class
    expect(mainCss).toContain('.dust-motes')
    // CSS-only keyframe animation
    expect(mainCss).toMatch(/@keyframes\s+dustFloat\b/)
    // prefers-reduced-motion gate hides the motes
    expect(mainCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.dust-motes[\s\S]*display:\s*none;/s)
  })

  it('mounts the .dust-motes element in the OpeningPage template', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    expect(openingPage).toContain('<div class="dust-motes" aria-hidden="true">')
  })

  it('keeps visible motion through localized wallpaper overlays, not whole-art breathing', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperMist\b/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperGrain\b/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperLight\b/)
    expect(characterBackdrop).not.toMatch(/@keyframes\s+artBreathe\b/)
    expect(characterBackdrop).not.toMatch(/@keyframes\s+artDrift\b/)
    expect(characterBackdrop).toContain('transform-origin: 50% 60%')
  })
})
