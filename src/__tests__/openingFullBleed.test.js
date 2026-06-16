// 5C v3.5: kill the card frame on /opening.
//
// v3 fixed panel-slot, micro-lean, head-turn, CTA slant, min-height —
// but did NOT remove the .opening-shell card (clip-path polygon + cream
// gradient + box-shadow + min(1240px, 100%) width). User feedback has
// called this out 4 times. v3.5 makes CharacterBackdrop the page
// background so the art IS the page, with translucent panels overlaid.
//
// This file pins the structural contract with source-string assertions,
// matching the uiPolish / panelSlots convention.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('5C v3.5 — /opening full-bleed (no card frame)', () => {
  const src = readProjectFile('src/pages/OpeningPage.vue')

  it('Test 1: the .opening-shell clip-path polygon is gone', () => {
    expect(src).not.toMatch(/clip-path:\s*polygon\(0 24px,\s*26px 0,/)
  })

  it('Test 2: .opening-view no longer constrains to min(1240px, 100%)', () => {
    // The .opening-view rule should not carry a width cap; the shell is gone
    // and the view is now full-bleed (the 1240 max-width lives on inner
    // .opening-orbit / .opening-toolbar content, not on the view).
    const viewRuleMatch = src.match(/\.opening-view\s*\{[\s\S]*?\}/)
    expect(viewRuleMatch).not.toBeNull()
    expect(viewRuleMatch[0]).not.toMatch(/min\(\s*1240px/)
  })

  it('Test 3: the .opening-shell rule itself is deleted', () => {
    expect(src).not.toMatch(/\.opening-shell\s*\{/)
  })

  it('Test 6: <CharacterBackdrop> appears BEFORE <header class="opening-toolbar"> in the template', () => {
    const backdropIdx = src.indexOf('<CharacterBackdrop')
    const toolbarIdx = src.indexOf('<header class="opening-toolbar"')
    expect(backdropIdx).toBeGreaterThan(-1)
    expect(toolbarIdx).toBeGreaterThan(-1)
    expect(backdropIdx).toBeLessThan(toolbarIdx)
  })

  it('Test 7: .opening-orbit fills the backdrop (position: absolute; inset: 0;)', () => {
    expect(src).toMatch(/\.opening-orbit\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/)
  })

  it('Test 8: .opening-orbit has padding: 88px 40px 40px (top reserves toolbar space)', () => {
    expect(src).toMatch(/padding:\s*88px 40px 40px/)
  })
})
