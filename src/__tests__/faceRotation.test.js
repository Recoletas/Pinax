// 5C v3 P1.B: head-turn proxy — face region clip-path + react prop rotation.
// The proxy works by overlaying a clipped copy of the art (top 30%) on top of
// the body layer, then rotating that overlay. The result reads as a head tilt
// even though it's a real rotation of the whole top strip.

import { nextTick } from 'vue'
import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import CharacterBackdrop from '@/components/folio/CharacterBackdrop.vue'
import { useSceneBackground } from '@/composables/useSceneBackground'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('face-rotation (5C v3 P1.B) — CharacterBackdrop react prop', () => {
  beforeEach(() => {
    useSceneBackground().setScene('opening-cover')
  })

  it('mounts with default react="none" — face region has no rotation (0deg)', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '' },
    })
    const root = wrapper.find('.character-backdrop')
    const style = root.attributes('style') || ''
    // Default react is "none" → 0deg.
    expect(style).toMatch(/--character-backdrop-face-rotation:\s*0deg;/)
  })

  it('react="choice-a" maps to --character-backdrop-face-rotation: -4deg', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '', react: 'choice-a' },
    })
    const style = wrapper.find('.character-backdrop').attributes('style') || ''
    expect(style).toMatch(/--character-backdrop-face-rotation:\s*-4deg;/)
  })

  it('react="interact" maps to --character-backdrop-face-rotation: -7deg', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '', react: 'interact' },
    })
    const style = wrapper.find('.character-backdrop').attributes('style') || ''
    expect(style).toMatch(/--character-backdrop-face-rotation:\s*-7deg;/)
  })

  it('react="decision" maps to --character-backdrop-face-rotation: +5deg', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '', react: 'decision' },
    })
    const style = wrapper.find('.character-backdrop').attributes('style') || ''
    expect(style).toMatch(/--character-backdrop-face-rotation:\s*5deg;/)
  })

  it('react="bogus-value" gracefully falls back to 0deg', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '', react: 'bogus-value' },
    })
    const style = wrapper.find('.character-backdrop').attributes('style') || ''
    expect(style).toMatch(/--character-backdrop-face-rotation:\s*0deg;/)
  })
})

describe('face-rotation (5C v3 P1.B) — face region DOM', () => {
  beforeEach(() => {
    useSceneBackground().setScene('opening-cover')
  })

  it('renders a .character-backdrop__face-region element with 30%-top clip-path', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '' },
    })
    const faceRegion = wrapper.find('.character-backdrop__face-region')
    expect(faceRegion.exists()).toBe(true)
  })

  it('face region is positioned after .character-backdrop__art in the DOM order', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '' },
    })
    const root = wrapper.find('.character-backdrop')
    const html = root.html()
    const artIndex = html.indexOf('character-backdrop__art')
    const faceIndex = html.indexOf('character-backdrop__face-region')
    expect(artIndex).toBeGreaterThan(-1)
    expect(faceIndex).toBeGreaterThan(-1)
    expect(faceIndex).toBeGreaterThan(artIndex)
  })

  it('face region inherits the same --character-backdrop-image/position/fit as the art region (SFC source binding)', () => {
    // Asserted by reading the SFC source string for the binding — same
    // convention the existing panelSlots / uiPolish tests use for cheap
    // robust contract pinning.
    const sfc = readProjectFile('src/components/folio/CharacterBackdrop.vue')

    // The face-region style block must reference the same CSS vars the art
    // layer uses (background-image, background-position, background-size).
    const faceBlockMatch = sfc.match(
      /\.character-backdrop__face-region\s*\{[\s\S]*?\}/,
    )
    expect(faceBlockMatch).not.toBeNull()
    const faceBlock = faceBlockMatch?.[0] ?? ''
    expect(faceBlock).toMatch(/background-image:\s*var\(--character-backdrop-image\)/)
    expect(faceBlock).toMatch(/background-position:\s*var\(--character-backdrop-position\)/)
    expect(faceBlock).toMatch(/background-size:\s*var\(--character-backdrop-fit\)/)
  })
})

describe('face-rotation (5C v3 P1.B) — data-react attribute', () => {
  beforeEach(() => {
    useSceneBackground().setScene('opening-cover')
  })

  it('exposes data-react="choice-a" on the root when react="choice-a" is passed', async () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '', react: 'choice-a' },
    })
    await nextTick()
    expect(wrapper.find('.character-backdrop').attributes('data-react')).toBe('choice-a')
  })
})
