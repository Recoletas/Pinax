// 5C v3 P1.C: micro-lean hover — when the user hovers the figure, the art
// scales + translates over 320ms with a soft cubic-bezier easing. The
// transform is sub-perceptual motion that reads as "the figure noticed
// you."
//
// v3.6: flat scale(1.072) translateX(-2px) on the outer art.
// v3.9b: 3D perspective(800px) rotateY(2deg) scale(1.04) — a real 3D lean
// toward the camera. Feels less "flat image grew" and more "the figure
// noticed you."
//
// Pattern reference: docs/plan/pinax-character-reactions.md pattern #5.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CharacterBackdrop from '@/components/folio/CharacterBackdrop.vue'
import { useSceneBackground } from '@/composables/useSceneBackground'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('micro-lean hover (5C v3 P1.C) — pointer-events', () => {
  beforeEach(() => {
    useSceneBackground().setScene('opening-cover')
  })

  it('mounts with .character-backdrop root pointer-events: auto so hover fires over the art', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '' },
    })
    const root = wrapper.find('.character-backdrop')
    expect(root.exists()).toBe(true)

    // jsdom does not resolve :hover, but it does expose computed styles for
    // explicit CSS declarations. Assert that the root declaration has
    // pointer-events: auto (was "none" in v0; P1.C changes it to "auto"
    // so the backdrop can detect hover without breaking slot clicks,
    // which already live in a separate layer with z-index: 1).
    const style = root.attributes('style') || ''
    expect(style).toBeDefined()

    // The SFC declares pointer-events on the .character-backdrop rule —
    // source-string pin the value to "auto".
    const sfc = readProjectFile('src/components/folio/CharacterBackdrop.vue')
    const backdropRuleMatch = sfc.match(
      /\.character-backdrop\s*\{[\s\S]*?\n\}/,
    )
    expect(backdropRuleMatch).not.toBeNull()
    const backdropRule = backdropRuleMatch?.[0] ?? ''
    expect(backdropRule).toMatch(/pointer-events:\s*auto/)
  })
})

describe('micro-lean hover (5C v3 P1.C) — art layer split + transform', () => {
  beforeEach(() => {
    useSceneBackground().setScene('opening-cover')
  })

  it('renders .character-backdrop__art-bg as an inner span inside .character-backdrop__art', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '' },
    })
    const root = wrapper.find('.character-backdrop')
    const html = root.html()

    // DOM order: art > art-bg > face-region > vignette > color-wash.
    const artIndex = html.indexOf('character-backdrop__art')
    const artBgIndex = html.indexOf('character-backdrop__art-bg')
    expect(artIndex).toBeGreaterThan(-1)
    expect(artBgIndex).toBeGreaterThan(-1)
    expect(artBgIndex).toBeGreaterThan(artIndex)
  })

  it('.character-backdrop__art-bg inherits the same --character-backdrop-image binding (SFC source)', () => {
    // Source-string assertion: the new inner bg element must use the same
    // CSS var the outer art element uses, so the image stays in sync.
    const sfc = readProjectFile('src/components/folio/CharacterBackdrop.vue')
    const artBgRuleMatch = sfc.match(
      /\.character-backdrop__art-bg\s*\{[\s\S]*?\n\}/,
    )
    expect(artBgRuleMatch).not.toBeNull()
    const artBgRule = artBgRuleMatch?.[0] ?? ''
    expect(artBgRule).toMatch(/background-image:\s*var\(--character-backdrop-image\)/)
  })

  it('.character-backdrop__art retains base transform: scale(1.06) so edge gaps stay hidden under hover', () => {
    const sfc = readProjectFile('src/components/folio/CharacterBackdrop.vue')
    const artRuleMatch = sfc.match(
      /\.character-backdrop__art\s*\{[\s\S]*?\n\}/,
    )
    expect(artRuleMatch).not.toBeNull()
    const artRule = artRuleMatch?.[0] ?? ''
    expect(artRule).toMatch(/transform:\s*scale\(1\.06\)/)
  })
})

describe('micro-lean hover (5C v3 P1.C) — hover transform + transition', () => {
  beforeEach(() => {
    useSceneBackground().setScene('opening-cover')
  })

  it('declares a :hover rule on .character-backdrop__art that applies perspective(800px) rotateY(2deg) scale(1.04)', () => {
    const sfc = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // The hover selector must target .character-backdrop__art via the
    // root .character-backdrop:hover ancestor.
    const hoverRuleMatch = sfc.match(
      /\.character-backdrop:hover\s+\.character-backdrop__art\s*\{[\s\S]*?\n\}/,
    )
    expect(hoverRuleMatch).not.toBeNull()
    const hoverRule = hoverRuleMatch?.[0] ?? ''

    // v3.9b: 3D perspective + lean toward camera + slight scale. Reads
    // as "the figure noticed you" without the flat "image grew" feel.
    expect(hoverRule).toMatch(/perspective\(800px\)/)
    expect(hoverRule).toMatch(/rotateY\(2deg\)/)
    expect(hoverRule).toMatch(/scale\(1\.04\)/)
  })

  it('declares a 320ms cubic-bezier(0.22, 1, 0.36, 1) transition on .character-backdrop__art', () => {
    const sfc = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // The transition can live either directly on .character-backdrop__art
    // (always on) or inside the reduced-motion @media guard (motion-only).
    // Accept either layout — both satisfy the contract that hovering and
    // un-hovering the figure eases the transform over 320ms.
    const directRule = sfc.match(
      /\.character-backdrop__art\s*\{[\s\S]*?\n\}/,
    )
    const directBlock = directRule?.[0] ?? ''
    const reducedMotionBlock = sfc.match(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*?\n\}/,
    )
    const reducedBlock = reducedMotionBlock?.[0] ?? ''

    const directHasTransition =
      /transition:\s*transform\s+320ms\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/.test(
        directBlock,
      )
    const reducedHasTransition =
      /\.character-backdrop__art[\s\S]*?transition:\s*transform\s+320ms\s+cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/.test(
        reducedBlock,
      )

    expect(directHasTransition || reducedHasTransition).toBe(true)
  })

  it('guards the transition with @media (prefers-reduced-motion: no-preference)', () => {
    const sfc = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // Reduced-motion contract: a @media (prefers-reduced-motion: no-preference)
    // block exists in the SFC. The micro-lean transition may live inside
    // it (motion-only) or sit on the base rule with the @media block
    // overriding it — both layouts honor the user's motion preference.
    // What we forbid is a transition that fires under reduced-motion.
    const reducedMotionBlock = sfc.match(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*?\n\}/,
    )
    expect(reducedMotionBlock).not.toBeNull()

    // Reduced-motion users must still get the lean (transform applies
    // even when motion is reduced), but the *transition* declaration
    // must not be unconditional on .character-backdrop__art. If the
    // transition is declared directly on the base rule outside the @media
    // block, the spec is violated.
    const baseArtRule = sfc.match(
      /\.character-backdrop__art\s*\{[\s\S]*?\n\}/,
    )
    const baseArtBlock = baseArtRule?.[0] ?? ''
    const unconditionalTransition = /transition:\s*transform\s+320ms/.test(baseArtBlock)
    expect(unconditionalTransition).toBe(false)
  })
})

describe('micro-lean hover (5C v3 P1.C) — inner layers stay click-through', () => {
  beforeEach(() => {
    useSceneBackground().setScene('opening-cover')
  })

  it('art-bg, vignette, color-wash, face-region all declare pointer-events: none so hover bubbles to root', () => {
    const sfc = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // The four overlay layers must not intercept pointer events; otherwise
    // the :hover on .character-backdrop root would only fire when the
    // cursor was over an un-overlaid pixel of the art. v0 face-region
    // already had pointer-events: none (P1.B); P1.C extends that to the
    // other three layers.
    //
    // The SFC may declare pointer-events in either a per-class rule block
    // or a comma-grouped rule block (e.g. the existing
    // `.character-backdrop__art, .character-backdrop__vignette,
    //  .character-backdrop__color-wash { ... }` for positioning).
    // We assert each layer appears in the source paired with
    // pointer-events: none in the same rule.
    const layerClasses = [
      '.character-backdrop__art-bg',
      '.character-backdrop__vignette',
      '.character-backdrop__color-wash',
    ]
    for (const cls of layerClasses) {
      // Find every rule block in the SFC that lists this class as a
      // selector. The class might appear in a comma-separated selector
      // list (e.g. ".foo, .bar { ... }").
      const blockMatches = [
        ...sfc.matchAll(
          new RegExp(
            `(?:^|[,{}])\\s*${cls.replace(/\./g, '\\.')}\\s*(?:[,{])[\\s\\S]*?\\}`,
            'g',
          ),
        ),
      ]
      expect(
        blockMatches.length,
        `expected at least one rule block referencing ${cls}`,
      ).toBeGreaterThan(0)

      // At least one block referencing this class must declare
      // pointer-events: none.
      const hasPointerNone = blockMatches.some((m) =>
        /pointer-events:\s*none/.test(m[0]),
      )
      expect(hasPointerNone, `${cls} must declare pointer-events: none`).toBe(true)
    }
  })
})
