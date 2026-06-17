// 5C v3.7 — drop panel chrome on /opening, buttons as postage stamps.
//
// v3.6's p5r Confidant solid panels still read as PPT-style flat blocks
// per user — the panel existence is the problem, not the styling.
// v3.7 drops the panels entirely on /opening: text and tiles sit directly
// on the art, cream text gets a dark text-shadow halo for legibility,
// and .stage-command becomes a postage stamp (notched clip-path + tilt
// + skew + 2px hard-offset shadow) that floats bottom-center of the page.
//
// Source-string assertions match the uiPolish / panelSlots / openingFullBleed
// convention.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('5C v3.7 — /opening panel drop + postage-stamp button', () => {
  const src = readProjectFile('src/pages/OpeningPage.vue')

  it('Test 1: .opening-copy no longer carries var(--archive-paper) panel background', () => {
    // The 5C v3.6 p5r panel used background: var(--archive-paper); on the
    // copy rule. v3.7 drops the panel — the rule must NOT match that
    // signature. (The button stamp does use var(--archive-paper) as its
    // background, but that's on .stage-command, not .opening-copy.)
    const copyRule = src.match(/\.opening-copy\s*\{[\s\S]*?\}/)?.[0] || ''
    expect(copyRule).not.toMatch(/background:\s*var\(--archive-paper\)/)
  })

  it('Test 2: .opening-copy no longer carries the 6px hard-offset panel shadow', () => {
    // The p5r Confidant signature was box-shadow: 6px 6px 0 .... v3.7
    // removes this from the panel rule. (Buttons may keep their own
    // shadows; the assertion targets the 6px 6px 0 pattern specifically.)
    const copyRule = src.match(/\.opening-copy\s*\{[\s\S]*?\}/)?.[0] || ''
    expect(copyRule).not.toMatch(/box-shadow:\s*6px\s+6px\s+0\b/)
  })

  it('Test 3: .opening-title-block strong has embedded shadowing for legibility on art', () => {
    // Cream text on dark art needs a dark embedded shadow. Current title
    // uses a pressed text-shadow + drop-shadow instead of the older halo.
    const titleStrongRule = src.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\}/)?.[0] || ''
    expect(titleStrongRule).toMatch(/text-shadow:/)
    expect(titleStrongRule).toMatch(/var\(--opening-surface-shadow\)/)
    expect(titleStrongRule).toMatch(/drop-shadow/)
  })

  it('Test 4: .stage-command carries an irregular foreground shard clip-path', () => {
    // Current opening actions are perspective foreground shards, not
    // regular postage rectangles.
    const stageCommandRule = src.match(/\.stage-command\s*\{[\s\S]*?\}/)?.[0] || ''
    expect(stageCommandRule).toMatch(
      /clip-path:\s*polygon\(0 8%,\s*78% 0,\s*100% 20%,\s*90% 100%,\s*10% 84%,\s*0 68%\)/
    )
  })
})
