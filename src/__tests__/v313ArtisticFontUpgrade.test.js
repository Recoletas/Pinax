import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

// 5C v3.14 — v3.13 的 "黄油体 + text-stroke + brush 下划线" 反馈太
// "装饰 / 廉价" (font 怪 + 金色 shimmer 太快)。v3.14 把字体回退到 v3.12
// baseline (ZCOOL XiaoWei 唯一字体), 删 text-stroke + brush underline,
// 把 titleShimmer 4s linear 改成 10s ease-in-out (premium timing)。
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

  it('OpeningPage.vue has no -webkit-text-stroke and no brush ::after on the title', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    // v3.13 artification removed
    expect(openingPage).not.toContain('-webkit-text-stroke')
    expect(openingPage).not.toMatch(/\.opening-title-block\s+strong::after\s*\{/)
  })

  it('titleShimmer is 10s ease-in-out (premium timing, was 4s linear in v3.12)', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    // Slow, eased shimmer (premium feel — was 4s linear in v3.12)
    expect(openingPage).toMatch(/titleShimmer\s+10s\s+ease-in-out\s+infinite/)
    // Old v3.12 4s linear timing is gone
    expect(openingPage).not.toMatch(/titleShimmer\s+4s\s+linear/)
  })
})
