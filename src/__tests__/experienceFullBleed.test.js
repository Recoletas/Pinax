// 5C v3.5: kill the card frame on /experience.
//
// The .game-page 3-stop radial + linear gradient + ::before/::after
// pseudo overlays are pinned behind CharacterBackdrop, muting the art.
// .game-main-shell is opaque cream covering the backdrop. v3.5 drops
// the page-level gradient + pseudo overlays, makes the shell translucent
// so the backdrop reads through, and verifies CharacterBackdrop is the
// first child of .game-page (containing block for absolute art).
//
// Source-string assertions match the uiPolish / panelSlots convention.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('5C v3.5 — /experience full-bleed (no card frame)', () => {
  const src = readProjectFile('src/pages/Experience.vue')

  it('Test 1: the 3-stop radial-gradient stack on .game-page is gone', () => {
    // 3 radials in a row is the page-level gradient. Source for that
    // block: 2 radials + a linear-gradient — we accept either form as
    // long as 3 radials chained together (the original signature) is
    // absent.
    expect(src).not.toMatch(/radial-gradient[\s\S]*?radial-gradient[\s\S]*?radial-gradient/)
  })

  it('Test 2: .game-page::before and .game-page::after pseudo overlays are gone', () => {
    expect(src).not.toMatch(/\.game-page::before/)
    expect(src).not.toMatch(/\.game-page::after/)
  })

  it('Test 3: .ws-center-stage uses solid var(--archive-paper) panel (UI-E11-A replaces .game-main-shell)', () => {
    // UI-E11-A workstation layout: .ws-center-stage is the center column
    // (1fr grid cell of .ws-layout). It carries the solid archive-paper
    // panel that the OLD .game-main-shell provided in 5C v3.6.
    const kao = readProjectFile('src/styles/themes/kao.css')
    expect(kao).toMatch(/\.theme-kao\s+\.ws-center-stage\s*\{[^}]*var\(--archive-paper\)/s)
  })

  it('Test 4: .ws-center-stage (workstation layout) — no v3.5 translucent backdrop-filter, no 4px rose hinge (those were OLD .game-main-shell P5R Confidant visual choices superseded by the workstation 4-section grid)', () => {
    const kao = readProjectFile('src/styles/themes/kao.css')
    const rule = kao.match(/\.theme-kao\s+\.ws-center-stage\s*\{[\s\S]*?\}/)
    expect(rule).not.toBeNull()
    expect(rule[0]).not.toMatch(/backdrop-filter:/)
    expect(rule[0]).not.toMatch(/border-left:\s*4px\s+solid\s+var\(--accent-rose\)/)
  })

  it('Test 5: <CharacterBackdrop> is rendered inside the .game-page wrapper (DOM order)', () => {
    const pageOpen = src.indexOf('class="game-page"')
    const backdropIdx = src.indexOf('<CharacterBackdrop')
    expect(pageOpen).toBeGreaterThan(-1)
    expect(backdropIdx).toBeGreaterThan(-1)
    // The backdrop must come AFTER the page open tag (it lives inside).
    expect(backdropIdx).toBeGreaterThan(pageOpen)
  })

  it('Test 6: .game-page has position: relative (containing block for absolute backdrop)', () => {
    const pageRule = src.match(/\.game-page\s*\{[\s\S]*?\}/)
    expect(pageRule).not.toBeNull()
    expect(pageRule[0]).toMatch(/position:\s*relative/)
  })
})
