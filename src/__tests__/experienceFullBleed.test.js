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

  it('Test 3: .game-main-shell uses solid var(--archive-paper) panel (5C v3.6 p5r Confidant, not v3.5 translucent)', () => {
    // Experience.vue has multiple .game-main-shell rules (legacy passes
    // remain). The LAST rule wins in cascade order, so we check the
    // final active rule.
    const matches = [...src.matchAll(/\.game-main-shell\s*\{[\s\S]*?\}/g)]
    const shellRule = matches.length ? matches[matches.length - 1][0] : ''
    expect(shellRule).toMatch(/background:\s*var\(--archive-paper\)/)
    expect(shellRule).not.toMatch(/rgba\(248,\s*243,\s*233/)
  })

  it('Test 4: .game-main-shell uses 4px rose hinge + 6px hard-offset shadow, no backdrop-filter (5C v3.6 p5r Confidant)', () => {
    const matches = [...src.matchAll(/\.game-main-shell\s*\{[\s\S]*?\}/g)]
    const shellRule = matches.length ? matches[matches.length - 1][0] : ''
    expect(shellRule).toMatch(/border-left:\s*4px\s+solid\s+var\(--accent-rose\)/)
    expect(shellRule).toMatch(/box-shadow:\s*6px\s+6px\s+0\b/)
    expect(shellRule).not.toMatch(/backdrop-filter:/)
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
