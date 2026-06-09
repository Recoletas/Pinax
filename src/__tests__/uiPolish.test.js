import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('ui polish contract', () => {
  it('defines accent text and modal transition tokens in the global stylesheet', () => {
    const mainCss = readProjectFile('src/styles/main.css')

    expect(mainCss).toMatch(/--accent-text:\s*#ffffff;/)
    expect(mainCss).toMatch(/\.theme-dark\s*\{[\s\S]*--accent-text:\s*#0d1117;/)
    expect(mainCss).toMatch(/\.btn-primary\s*\{[\s\S]*color:\s*var\(--accent-text\);/s)
    expect(mainCss).toMatch(/\.modal-fade-enter-active,\s*\.modal-fade-leave-active/);
    expect(mainCss).toMatch(/\.modal-scale-enter-active,\s*\.modal-scale-leave-active/);
  })

  it('uses modal fade/scale transitions for existing content overlays', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const writing = readProjectFile('src/pages/Writing.vue')
    const notes = readProjectFile('src/pages/Notes.vue')
    const proseEssay = readProjectFile('src/pages/ProseEssay.vue')

    expect(experience).toContain('<Transition name="modal-fade">')
    expect(experience).not.toContain('<Transition name="fade">')
    expect(writing).toContain('<Transition name="modal-fade">')
    expect(notes).toContain('<Transition name="modal-fade">')
    expect(proseEssay).toContain('<Transition name="modal-fade">')
    expect(proseEssay).toContain('<Transition name="modal-scale" appear>')
  })

  it('adds a subtle workbench texture to the card wall', () => {
    const proseEssay = readProjectFile('src/pages/ProseEssay.vue')

    expect(proseEssay).toMatch(/\.card-wall\s*\{[\s\S]*radial-gradient/);
    expect(proseEssay).toMatch(/\.card-wall\s*\{[\s\S]*background-size:/);
  })

  it('keeps material bulk actions in the checked-selection toolbar', () => {
    const notes = readProjectFile('src/pages/Notes.vue')

    expect(notes).toContain('class="material-selection-bar"')
    expect(notes).toContain('@click="importCheckedToCanvas">导入</button>')
    expect(notes).toContain('@click="setCheckedAssetsState(\'accepted\')">采纳</button>')
    expect(notes).toContain('@click="setCheckedAssetsState(\'archived\')">归档</button>')
    expect(notes).toContain('@click="deleteCheckedAssets">删除</button>')
    expect(notes).not.toContain('class="asset-status-control"')
    expect(notes).not.toContain('function setSelectedAssetState')
  })

  it('keeps the playable-worldbook entry path visible before heavy editor exits', () => {
    const home = readProjectFile('src/pages/Home.vue')
    const experience = readProjectFile('src/pages/Experience.vue')
    const quickImport = readProjectFile('src/pages/WorldBookQuickImport.vue')

    expect(home).toContain('Pinax · 可玩的世界书')
    expect(home).toContain('to="/experience"')
    expect(home).toContain('进入世界')
    expect(experience).toContain('可玩的世界书')
    expect(experience).toContain('导入种子世界')
    expect(experience).toContain('选择世界')
    expect(experience).toContain('开始冒险')
    expect(experience).toContain('写成作品')
    expect(quickImport).toContain('今晚进入一个世界')
    expect(quickImport).toContain('默认只给一个世界')
    expect(quickImport).toContain('今晚推荐开局')
    expect(quickImport).toContain('今晚的困境')
    expect(quickImport).toContain('class="world-action-card"')
    expect(experience).toContain('今晚开场')
    expect(experience).toContain('用这个行动开局')
  })
})
