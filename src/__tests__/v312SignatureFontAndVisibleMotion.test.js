import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

// 5C v3.12 — ZCOOL XiaoWei 签名体 (signature style with connected
// strokes) + 不可不见的上半屏动态 (art breathing 6% / drift ±10px /
// title shimmer / title glow / kicker 1.5s).
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

  it('bumps art breathing amplitude to 6% via @keyframes artBreathe', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // Whole-art breathing keyframe
    expect(characterBackdrop).toMatch(/@keyframes\s+artBreathe\b/)
    // 6% amplitude (vs v3.11's 4% — 50% bigger)
    expect(characterBackdrop).toContain('scale(1.06)')
  })

  it('widens art horizontal drift to ±10px via @keyframes artDrift', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // Horizontal drift keyframe
    expect(characterBackdrop).toMatch(/@keyframes\s+artDrift\b/)
    // ±10px horizontal motion (vs v3.11's ±4px — 2.5x bigger)
    expect(characterBackdrop).toContain('translateX(-10px)')
    expect(characterBackdrop).toContain('translateX(10px)')
  })

  it('adds a moving title shimmer via @keyframes titleShimmer + background-clip', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    // Title shimmer keyframe (sweeping gold highlight across the text)
    expect(openingPage).toMatch(/@keyframes\s+titleShimmer\b/)
    // The title strong element uses background-clip: text to mask the
    // gradient onto the glyphs (otherwise the gradient renders behind)
    expect(openingPage).toContain('background-clip: text')
  })
})
