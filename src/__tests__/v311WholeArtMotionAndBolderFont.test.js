import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

// 5C v3.11 — 整张 art 动态 (later replaced by localized wallpaper motion) +
// Liu Jian Mao Cao font (极 dramatic 草书) + title 缩 30%.
//
// 5C v3.12 supersedes v3.11 with:
//   - font upgrade: Liu Jian Mao Cao replaced by ZCOOL XiaoWei
//     (signature style with connected strokes)
//   - motion upgrade: whole-art drift/breathing removed; mist/grain/light
//     overlays animate locally so the image reads like a dynamic wallpaper
//
// These tests verify visible motion still holds without reintroducing
// whole-image drift.
describe('5C v3.11 whole-art motion (carried forward into v3.12)', () => {
  it('animates localized wallpaper overlays instead of the whole art', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperMist\b/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperGrain\b/)
    expect(characterBackdrop).toMatch(/@keyframes\s+wallpaperLight\b/)
    expect(characterBackdrop).not.toMatch(/@keyframes\s+artBreathe\b/)
  })

  it('does not drift the inner art-bg horizontally via @keyframes artDrift', () => {
    const characterBackdrop = readProjectFile('src/components/folio/CharacterBackdrop.vue')
    const artBgRule = characterBackdrop.match(/\.character-backdrop__art-bg\s*\{[\s\S]*?\n\}/)?.[0] || ''

    expect(characterBackdrop).not.toMatch(/@keyframes\s+artDrift\b/)
    expect(artBgRule).not.toMatch(/animation:\s*artDrift/)
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
