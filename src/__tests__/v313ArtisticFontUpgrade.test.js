import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

// 5C v3.14+ — v3.13 的 "黄油体 + brush 下划线" 反馈太
// "装饰 / 廉价"。Current opening polish keeps ZCOOL XiaoWei as the
// global signature font, but renders the /opening title as an embedded
// Iowan serif glyph mark with a light text stroke instead of shimmer text.
describe('5C v3.14 — revert v3.13 artification + slow premium shimmer', () => {
  it('index.html loads only ZCOOL XiaoWei (QingKe HuangYou removed)', () => {
    const indexHtml = readProjectFile('index.html')

    expect(indexHtml).toContain('ZCOOL+XiaoWei')
    // v3.13's artistic font is removed
    expect(indexHtml).not.toContain('ZCOOL+QingKe+HuangYou')
  })

  it('main.css --font-display is ZCOOL XiaoWei (QingKe HuangYou removed)', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    // v3.12 baseline restored: ZCOOL XiaoWei primary for display
    expect(mainCss).toMatch(/--font-display:\s*"ZCOOL XiaoWei"/)
    // v3.13's artistic font is gone
    expect(mainCss).not.toMatch(/ZCOOL QingKe HuangYou/)
  })

  it('OpeningPage.vue uses embedded serif glyphs and no brush ::after on the title', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')
    const titleRule = openingPage.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\n\}/)?.[0] || ''

    expect(openingPage).toContain('class="opening-embedded-title"')
    expect(titleRule).toMatch(/font-family:\s*"Iowan Old Style"/)
    expect(titleRule).toMatch(/-webkit-text-stroke/)
    expect(titleRule).toMatch(/mix-blend-mode:\s*soft-light/)
    expect(openingPage).not.toMatch(/\.opening-title-block\s+strong::after\s*\{/)
  })

  it('does not use titleShimmer; title depth comes from glyph transforms and drop-shadow', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')
    const titleRule = openingPage.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\n\}/)?.[0] || ''
    const glyphRule = openingPage.match(/\.opening-embedded-title__glyph\s*\{[\s\S]*?\n\}/)?.[0] || ''

    expect(openingPage).not.toMatch(/@keyframes\s+titleShimmer\b/)
    expect(titleRule).toMatch(/drop-shadow/)
    expect(glyphRule).toMatch(/translateY\(var\(--glyph-y\)\) rotate\(var\(--glyph-rotate\)\)/)
  })
})
