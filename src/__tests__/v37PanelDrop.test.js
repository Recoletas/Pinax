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

  it('Test 3: .opening-title-block strong has the text-shadow halo for legibility on art', () => {
    // Cream text on dark art needs a dark halo. The hero title gets the
    // 0 0 12px / 0 0 32px stack from the spec. Locate the .opening-title-block
    // strong rule and confirm text-shadow + 0 0 12px both appear in it.
    const titleStrongRule = src.match(/\.opening-title-block\s+strong\s*\{[\s\S]*?\}/)?.[0] || ''
    expect(titleStrongRule).toMatch(/text-shadow:/)
    expect(titleStrongRule).toMatch(/0 0 12px/)
  })

  it('Test 4: .stage-command carries the postage-stamp clip-path (notched corners)', () => {
    // Postage stamp signature: clip-path polygon with 8px notches on all
    // 4 corners (top-right, bottom-right, bottom-left). The 6-point
    // polygon from the spec must appear on the .stage-command rule.
    const stageCommandRule = src.match(/\.stage-command\s*\{[\s\S]*?\}/)?.[0] || ''
    expect(stageCommandRule).toMatch(
      /clip-path:\s*polygon\(0 0,\s*calc\(100% - 8px\) 0,\s*100% 8px,\s*100% 100%,\s*8px 100%,\s*0 calc\(100% - 8px\)\)/
    )
  })
})
