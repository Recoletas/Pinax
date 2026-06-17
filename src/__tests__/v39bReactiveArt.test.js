import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 5C v3.9b — Arknights联动 (3 patterns) + improved hover.
// Source-string assertions pin the new behaviors:
//   1. Status text overlays (kicker / statusLine) on CharacterBackdrop,
//      wired from OpeningPage's active scene pose.
//   2. 3D perspective mouse tilt via useMouseTilt composable.
//   3. Continuous breathing (4s) + kicker underline pulse (2.4s).
//   4. New hover transform: perspective(800px) rotateY(2deg) scale(1.04)
//      (replaces v3.6 scale(1.072) translateX(-2px)).

const projectRoot = resolve(__dirname, '..', '..')
const backdropPath = resolve(projectRoot, 'src/components/folio/CharacterBackdrop.vue')
const openingPath = resolve(projectRoot, 'src/pages/OpeningPage.vue')
const mouseTiltPath = resolve(projectRoot, 'src/composables/useMouseTilt.js')

const backdropSource = readFileSync(backdropPath, 'utf-8')
const openingSource = readFileSync(openingPath, 'utf-8')
const mouseTiltSource = readFileSync(mouseTiltPath, 'utf-8')

describe('5C v3.9b — Arknights reactive art patterns', () => {
  it('CharacterBackdrop accepts kicker and statusLine props for status text overlays', () => {
    // The two new text-overlay props. Default '' so existing callers
    // (e.g. preview surfaces) keep working.
    expect(backdropSource).toMatch(/kicker:\s*\{\s*type:\s*String,\s*default:\s*''/)
    expect(backdropSource).toMatch(/statusLine:\s*\{\s*type:\s*String,\s*default:\s*''/)
  })

  it('CharacterBackdrop applies 3D perspective tilt via useMouseTilt + CSS vars', () => {
    // Composable import + the exact transform expression from the spec.
    expect(backdropSource).toMatch(/useMouseTilt/)
    expect(backdropSource).toMatch(/perspective\(800px\)/)
    expect(backdropSource).toMatch(/rotateY\(calc\(var\(--parallax-x,\s*0\)\s*\*\s*3deg\)\)/)
  })

  it('useMouseTilt composable exposes tiltX / tiltY refs (degrees, range', () => {
    // The composable must declare both refs so the spec can compose
    // them into the 3D transform on CharacterBackdrop.
    expect(mouseTiltSource).toMatch(/tiltX/)
    expect(mouseTiltSource).toMatch(/tiltY/)
  })

  it('CharacterBackdrop runs dynamic-wallpaper overlays (wallpaperMist 14s) instead of whole-art breathing', () => {
    // 5C v3.15+ supersedes the v3.10-v3.12 whole-art breathing
    // (`faceBreathe` → `artBreathe`) with localized dynamic-wallpaper
    // overlays on the CharacterBackdrop's ::before / ::after pseudo
    // elements (wallpaperMist / wallpaperGrain / wallpaperLight). The
    // image itself stays fixed; the mist / grain / light layers move.
    expect(backdropSource).toMatch(/@keyframes\s+wallpaperMist\b/)
    expect(backdropSource).toMatch(/animation:\s*wallpaperMist\s+14s/)
    // Old whole-art motion is fully retired (no artBreathe, no artDrift).
    expect(backdropSource).not.toMatch(/@keyframes\s+artBreathe\b/)
    expect(backdropSource).not.toMatch(/@keyframes\s+artDrift\b/)
  })

  it('CharacterBackdrop runs a status underline pulse keyframe (1.5s) on the kicker', () => {
    // v3.12: kicker period shortened 2.4s → 1.5s so the pulse reads
    // as "alive" rather than "slow".
    expect(backdropSource).toMatch(/@keyframes\s+kickerPulse/)
    expect(backdropSource).toMatch(/animation:\s*kickerPulse\s+1\.5s/)
  })

  it('OpeningPage derives kicker + statusLine from the 3 scene poseIds and passes them to CharacterBackdrop', () => {
    // 3 scene tiles are already declared (opening-scene-01..03).
    // The new computed must reference all 3 poseIds.
    expect(openingSource).toMatch(/opening-scene-01/)
    expect(openingSource).toMatch(/opening-scene-02/)
    expect(openingSource).toMatch(/opening-scene-03/)
    // Computed properties for the two overlay texts.
    expect(openingSource).toMatch(/const\s+kicker\s*=/)
    expect(openingSource).toMatch(/const\s+statusLine\s*=/)
    // Passed through to <CharacterBackdrop>.
    expect(openingSource).toMatch(/:kicker="kicker"/)
    expect(openingSource).toMatch(/:status-line="statusLine"/)
  })

  it('CharacterBackdrop hover micro-lean uses 3D rotateY + scale(1.04) (replaces v3.6 flat scale)', () => {
    // The new hover rule.
    expect(backdropSource).toMatch(/rotateY\(2deg\)\s+scale\(1\.04\)/)
    // The old flat rule is gone.
    expect(backdropSource).not.toMatch(/scale\(1\.072\)\s+translateX\(-2px\)/)
  })

  it('all new animations are gated by prefers-reduced-motion', () => {
    // Reduced motion must still kill the new breathe / kickerPulse /
    // 3D tilt transforms. The existing reduce block on art-bg stays.
    const reduceBlock =
      backdropSource.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)
    expect(reduceBlock, 'prefers-reduced-motion reduce block should exist').toBeTruthy()
  })
})
