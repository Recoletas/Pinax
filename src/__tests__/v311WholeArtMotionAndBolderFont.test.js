import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

// 5C v3.11 — 整张 art 动态 (whole-art breathing + horizontal drift) +
// Liu Jian Mao Cao font (极 dramatic 草书) + title 缩 30%.
//
// 5C v3.12 supersedes v3.11 with:
//   - font upgrade: Liu Jian Mao Cao replaced by ZCOOL XiaoWei
//     (signature style with connected strokes)
//   - motion upgrade: artBreathe 1.04 → 1.06, artDrift ±4px → ±10px,
//     artDrift period 8s → 4s, artBreathe period 4s → 3s
//
// These tests verify the v3.11 structural guarantee (whole-art
// motion + visible drift) still holds; the amplitude/period
// numbers below are updated to the v3.12 contract.
describe('5C v3.11 whole-art motion (carried forward into v3.12)', () => {
  it('animates the WHOLE art with @keyframes artBreathe at 6% amplitude', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // Whole-art breathing keyframe (replaces v3.10 faceBreathe)
    expect(characterBackdrop).toMatch(/@keyframes\s+artBreathe\b/)
    // 6% amplitude (v3.12: 50% larger than v3.11's 4%) — impossible to miss
    expect(characterBackdrop).toContain('scale(1.06)')
    // Applied to the outer .character-backdrop__art (not the inner art-bg)
    expect(characterBackdrop).toMatch(/character-backdrop__art\s*\{[\s\S]*?artBreathe/s)
  })

  it('drifts the inner art-bg horizontally via @keyframes artDrift at ±10px', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // Horizontal drift keyframe
    expect(characterBackdrop).toMatch(/@keyframes\s+artDrift\b/)
    // ±10px horizontal motion (v3.12: 2.5x v3.11's ±4px) — scene area moves visibly
    expect(characterBackdrop).toContain('translateX(-10px)')
    expect(characterBackdrop).toContain('translateX(10px)')
    // Applied to the inner .character-backdrop__art-bg
    expect(characterBackdrop).toMatch(/character-backdrop__art-bg\s*\{[\s\S]*?artDrift/s)
  })

  it('loads ZCOOL XiaoWei (signature style) from Google Fonts CDN in index.html', () => {
    const indexHtml = readProjectFile('index.html')

    // v3.12: ZCOOL XiaoWei replaces Liu Jian Mao Cao (rejected as "too
    // professional cursive"). Single signature font for both display +
    // body; LXGW WenKai stays as @font-face fallback.
    expect(indexHtml).toContain('family=ZCOOL+XiaoWei')
  })

  it('wires --font-display to ZCOOL XiaoWei as primary in main.css', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    // v3.14: --font-display reverted to ZCOOL XiaoWei (v3.13 tried
    // QingKe HuangYou but user said the font looked "weird"). Both
    // --font-display and --font-serif are ZCOOL XiaoWei (signature
    // direction locked). v3.12 baseline restored.
    expect(mainCss).toMatch(/--font-display:\s*"ZCOOL XiaoWei"[\s\S]*?;/)
    expect(mainCss).toMatch(/--font-serif:\s*"ZCOOL XiaoWei"[\s\S]*?;/)
  })

  it('keeps the opening title size at v3.11\'s 30%-reduced clamp(48px, 6.5vw, 96px)', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    // Title rule with the v3.11 clamp values (unchanged in v3.12)
    expect(openingPage).toMatch(/\.opening-title-block\s+strong\s*\{[\s\S]*?clamp\(48px,\s*6\.5vw,\s*96px\)[\s\S]*?\}/)
  })
})
