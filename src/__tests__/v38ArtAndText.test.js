import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 5C v3.8: three minimal fixes — source-string assertions pin each one.
// 1. Art not cropped → fit default is now 'contain' (was 'cover').
// 2. Text on art now cream → .opening-title-block strong uses
//    var(--archive-paper) (was var(--text-primary)).
// 3. 3D feel via mouse parallax → mousemove listener + 600ms transition.

const projectRoot = resolve(__dirname, '..', '..')
const backdropPath = resolve(projectRoot, 'src/components/folio/CharacterBackdrop.vue')
const openingPath = resolve(projectRoot, 'src/pages/OpeningPage.vue')

const backdropSource = readFileSync(backdropPath, 'utf-8')
const openingSource = readFileSync(openingPath, 'utf-8')

describe('5C v3.8 — art not cropped, cream text on art, mouse parallax', () => {
  it('CharacterBackdrop defaults fit to contain (no cover cropping)', () => {
    expect(backdropSource).toMatch(/default:\s*'contain'/)
  })

  it('OpeningPage hero title is cream (var(--archive-paper)), not dark text-primary', () => {
    // Locate the .opening-title-block strong rule and assert it now
    // uses cream — not the v3.7 var(--text-primary).
    const ruleMatch = openingSource.match(/\.opening-title-block\s+strong\s*\{[^}]+\}/m)
    expect(ruleMatch, '.opening-title-block strong rule should exist').toBeTruthy()
    expect(ruleMatch[0]).toMatch(/color:\s*var\(--archive-paper\)/)
  })

  it('CharacterBackdrop wires a mousemove parallax with a 600ms smooth follow', () => {
    expect(backdropSource).toMatch(/mousemove/)
    expect(backdropSource).toMatch(/transition:\s*transform\s+600ms/)
  })
})
