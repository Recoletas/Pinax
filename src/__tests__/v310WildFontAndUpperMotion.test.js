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
//   - motion upgrade: face-region breathing replaced by WHOLE-art
//     breathing (6% amplitude on the outer .character-backdrop__art,
//     3s period) + horizontal ±10px drift on the inner art-bg (4s)
//
// These tests verify the v3.10 STRUCTURAL guarantees still hold:
//   - Google Fonts preconnect + stylesheet are wired (with ZCOOL
//     XiaoWei as the single signature font)
//   - LXGW WenKai @font-face still ships (last-resort fallback)
//   - The dust-motes utility still ships and is reduced-motion gated
//   - The OpeningPage still mounts .dust-motes inside CharacterBackdrop
//   - Some form of breathing animation is still on the art (now whole-art
//     rather than face-region; see v311WholeArtMotionAndBolderFont.test.js
//     for the v3.12-specific contract)
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

  it('keeps a breathing animation on the art (whole-art now, was face-region in v3.10)', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // v3.12: the face-region breathing was replaced by whole-art
    // breathing on the outer .character-backdrop__art layer.
    expect(characterBackdrop).toMatch(/@keyframes\s+artBreathe\b/)
    // Whole-art 6% amplitude (was 4% in v3.11, 3% in v3.10)
    expect(characterBackdrop).toContain('scale(1.06)')
    // The outer art layer carries the animation, anchored lower so the
    // upper half "rises" more visibly (50% 60% instead of v3.10's 50% 30%)
    expect(characterBackdrop).toContain('transform-origin: 50% 60%')
    // Applied to the outer .character-backdrop__art (whole-art motion)
    expect(characterBackdrop).toMatch(/character-backdrop__art\s*\{[\s\S]*?artBreathe/s)
  })
})
