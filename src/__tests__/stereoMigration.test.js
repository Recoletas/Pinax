import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { characterArt } from '@/config/characterArt'
import { useCharacterArt } from '@/composables/useCharacterArt'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('stereo migration — character-art skeleton + real (pass 5B commit: ship gate)', () => {
  it('characterArt.js exposes 6 real poses with status="real" (3 character + 3 scene)', () => {
    expect(Array.isArray(characterArt)).toBe(true)
    expect(characterArt).toHaveLength(6)

    const realEntries = characterArt.filter((entry) => entry.status === 'real')
    expect(realEntries).toHaveLength(6)

    const characterIds = ['opening-cover', 'narrator', 'speaker-thumb']
    const sceneIds = ['opening-scene-01', 'opening-scene-02', 'opening-scene-03']
    const actualIds = characterArt.map((entry) => entry.id).sort()
    expect(actualIds).toEqual([...characterIds, ...sceneIds].sort())

    for (const entry of characterArt) {
      expect(entry).toHaveProperty('id')
      expect(entry).toHaveProperty('label')
      expect(entry).toHaveProperty('src')
      expect(entry).toHaveProperty('status')
      // 5B 末态: src 是 kao-archive-*.webp 静态 import URL,非空字符串
      expect(typeof entry.src).toBe('string')
      expect(entry.src).not.toBe('')
    }
  })

  it('useCharacterArt returns a non-empty image src for every pose (5A: stub silhouette; 5B: real webp)', () => {
    const composable = useCharacterArt()
    const poseIds = characterArt.map((entry) => entry.id)

    for (const id of poseIds) {
      const resolved = composable.resolveArt({ poseId: id })
      expect(resolved).toHaveProperty('src')
      expect(resolved.src).not.toBe('')
      // 5A: stub-silhouette.svg; 5B: kao-archive-*.webp. Both valid image paths.
      expect(resolved.src).toMatch(/\.(svg|webp|png|jpg)(\?.*)?$/)
      expect(resolved).toHaveProperty('status')
      expect(['stub', 'real']).toContain(resolved.status)
      expect(resolved).toHaveProperty('label')
      expect(typeof resolved.label).toBe('string')
    }
  })
})

// NOTE: page wiring tests (test 3 OpeningPage + test 4 Experience + test 5-6 regressions)
// are added in commit 2. Commit 1 has no vue page changes yet.
describe('stereo migration — page wiring (pass 5A commit 2 + 5C refactor)', () => {
  it('OpeningPage cover is bound via <CharacterBackdrop> (5C step 3 + 5C v3.5: no .opening-shell card) + 开局/改写 buttons moved to main .opening-copy + CharacterArchiveStrip for 3 scene tiles', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    // 5C step 3 + 5C v3.5: cover is a full-page background via
    // <CharacterBackdrop> as a direct child of .opening-view, not a 360px
    // .opening-stage-poster card and not wrapped in an .opening-shell
    // card (which is now deleted).
    const viewMatch = openingPage.match(
      /<div\s+class="opening-view"[\s\S]*?<\/div>\s*<\/template>/,
    )
    expect(viewMatch).not.toBeNull()
    const openingView = viewMatch?.[0] ?? ''
    expect(openingView).toMatch(/<CharacterBackdrop\b/)
    expect(openingView).not.toContain('opening-stage-poster')
    expect(openingView).not.toContain('class="opening-shell"')
    expect(openingView).toContain('<CharacterArchiveStrip')

    // 开局/改写 buttons moved from the duplicate playable-world-opening-page
    // section into the main .opening-copy, where the user reads the briefing.
    const copyMatch = openingPage.match(
      /<section\s+class="opening-copy"[\s\S]*?<\/section>/,
    )
    expect(copyMatch).not.toBeNull()
    const copySection = copyMatch?.[0] ?? ''
    expect(copySection).toMatch(/label="开局"/)
    expect(copySection).toMatch(/label="改写"/)

    // 5A patterns removed: card wrapper + duplicate content section + --hero-image var
    expect(openingPage).not.toMatch(/<div\s+class="opening-stage-poster"/)
    expect(openingPage).not.toMatch(/playable-world-opening-page/)
    expect(openingPage).not.toMatch(/--hero-image/)

    // Scene strip still wired (3 scene tiles)
    expect(openingPage).toContain('openingActionStubTiles')
    expect(openingPage).toMatch(
      /openingActionStubTiles\s*=\s*[\s\S]*?\{ poseId: 'opening-scene-01'[\s\S]*?\{ poseId: 'opening-scene-02'[\s\S]*?\{ poseId: 'opening-scene-03'/,
    )
  })

  it('Experience wraps inline-detail-card in <FolioSurface> and quick-note-workspace header in FolioSurface variant="paper" (nested structure)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')

    const inlineCardSection = experience.match(
      /<FolioSurface[\s\S]*?<div\s+class="inline-detail-card"[\s\S]*?<\/div>[\s\S]*?<\/FolioSurface>/,
    )
    expect(inlineCardSection).not.toBeNull()
    expect(experience).toContain('<CharacterPortrait')

    // nested structure: FolioSurface as="div" 是 wrapper,内含 <header class="quick-note-workspace-header">
    const quickNoteHeader = experience.match(
      /<FolioSurface[^>]*variant="paper"[\s\S]*?<header\s+class="quick-note-workspace-header"/,
    )
    expect(quickNoteHeader).not.toBeNull()
  })

  it('regression: Experience BookmarkButton size="micro" count === 0 (5A must not add any)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const matches = experience.match(/size="micro"/g) || []
    expect(matches).toHaveLength(0)
  })

  it('regression: Experience v-if="hasSelectedWorldbook" count === 0 (5A must not re-introduce any)', () => {
    const experience = readProjectFile('src/pages/Experience.vue')
    const matches = experience.match(/v-if="hasSelectedWorldbook"/g) || []
    expect(matches).toHaveLength(0)
  })
})
