import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// U1：控件契约 —— workbench-controls.css 静态检查。
// 断言核心 class、:focus-visible、coarse pointer 命中区，并防止 transition: all 回潮。
const css = readFileSync(resolve(__dirname, '../../src/styles/workbench-controls.css'), 'utf8')
const themeAssets = readFileSync(resolve(__dirname, '../components/theme/ThemeAssets.vue'), 'utf8')

describe('workbench control contract (U1)', () => {
  it('defines the six control semantics with shared focus, hit areas, and no transition:all', () => {
    for (const cls of ['control-primary', 'control-secondary', 'control-quiet', 'control-icon', 'control-toggle', 'control-danger', 'control-group']) {
      expect(css).toContain(`.${cls}`)
    }
    // 共享基座：disabled / focus-visible / coarse pointer 命中区
    expect(css).toContain("[class*='control-']:focus-visible")
    expect(css).toContain("[class*='control-']:disabled")
    expect(css).toMatch(/@media \(pointer: coarse\)/)
    expect(css.match(/min-height: 44px/g)?.length).toBeGreaterThanOrEqual(1)
    // 禁止 transition: all（只允许 color/background/opacity/transform）
    expect(css).not.toMatch(/transition:\s*all/)
    for (const transition of css.match(/transition:[^;]+;/g) || []) {
      expect(transition).toMatch(/color|background|opacity|transform|none/)
    }
    // toggle 激活态走 aria-pressed，不用框
    expect(css).toContain(".control-toggle[aria-pressed='true']")
    // 输入安全 token
    expect(css).toContain('--control-focus')
    expect(css).toContain('--control-danger')
    // ThemeAssets 只在主题2（legacy）加载控件层
    expect(themeAssets).toContain('workbench-controls.css')
  })
})
