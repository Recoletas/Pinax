// 5C v3 P1.A: panel-slot system — figure bbox CSS vars + orbit-drift transition.
// The composable + backdrop is exercised via @vue/test-utils (mount);
// the OpeningPage wiring is verified by source-string assertion (matches the
// existing uiPolish / stereoMigration convention that the rest of the file
// uses for cheap, robust contract pinning).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CharacterBackdrop from '@/components/folio/CharacterBackdrop.vue'
import { useSceneBackground } from '@/composables/useSceneBackground'
import { usePoseSlots } from '@/composables/usePoseSlots'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('panel-slot system (5C v3 P1.A) — CharacterBackdrop', () => {
  beforeEach(() => {
    // Reset module-level scene state to the documented default before each test
    // so the same module ref is not carried across cases.
    useSceneBackground().setScene('opening-cover')
  })

  it('mounts with data-pose="opening-cover" by default (matches useSceneBackground default)', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '' },
    })
    const root = wrapper.find('.character-backdrop')
    expect(root.exists()).toBe(true)
    expect(root.attributes('data-pose')).toBe('opening-cover')
  })

  it('updates data-pose reactively when setScene() switches the pose', async () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '' },
    })
    expect(wrapper.find('.character-backdrop').attributes('data-pose')).toBe('opening-cover')

    useSceneBackground().setScene('opening-scene-02')
    await nextTick()

    expect(wrapper.find('.character-backdrop').attributes('data-pose')).toBe('opening-scene-02')
  })

  it('exposes --figure-bbox-{top,right,bottom,left} CSS vars on the backdrop (default 8/36/96/64)', () => {
    const wrapper = mount(CharacterBackdrop, {
      props: { src: '' },
    })
    const style = wrapper.find('.character-backdrop').attributes('style') || ''

    // The vars are set in a single :style binding; each must be present and
    // hold the v0 default value. Pattern: "--figure-bbox-top: 8%;"
    expect(style).toMatch(/--figure-bbox-top:\s*8%;/)
    expect(style).toMatch(/--figure-bbox-right:\s*36%;/)
    expect(style).toMatch(/--figure-bbox-bottom:\s*96%;/)
    expect(style).toMatch(/--figure-bbox-left:\s*64%;/)
  })
})

describe('panel-slot system (5C v3 P1.A) — usePoseSlots composable', () => {
  beforeEach(() => {
    useSceneBackground().setScene('opening-cover')
  })

  it('returns a reactive bbox object with top/right/bottom/left keys', () => {
    const { bbox } = usePoseSlots()
    expect(bbox.value).toBeTypeOf('object')
    expect(bbox.value).toHaveProperty('top')
    expect(bbox.value).toHaveProperty('right')
    expect(bbox.value).toHaveProperty('bottom')
    expect(bbox.value).toHaveProperty('left')
  })

  it('reflects the new pose coords when setScene() is called (v0 shares one default bbox)', async () => {
    const { bbox, currentScenePoseId } = usePoseSlots()
    expect(currentScenePoseId.value).toBe('opening-cover')
    expect(bbox.value).toEqual({ top: 8, right: 36, bottom: 96, left: 64 })

    useSceneBackground().setScene('opening-scene-02')
    await nextTick()

    expect(currentScenePoseId.value).toBe('opening-scene-02')
    // v0: all stub poses share the same default bbox; reactivity must
    // still re-emit so the orbit-drift transition is wired for v1.
    expect(bbox.value).toEqual({ top: 8, right: 36, bottom: 96, left: 64 })
  })
})

describe('panel-slot system (5C v3 P1.A) — OpeningPage orbit wrapper', () => {
  it('wraps .opening-copy / .opening-scene in an .opening-orbit layer under <Transition name="orbit-drift">', () => {
    const openingPage = readProjectFile('src/pages/OpeningPage.vue')

    // The orbit wrapper must exist as a Vue class.
    expect(openingPage).toContain('class="opening-orbit"')

    // The transition must be named orbit-drift. Two equally-valid
    // renderings exist (with or without :duration attribute) so accept both.
    expect(openingPage).toMatch(/<Transition\s+name="orbit-drift"/)

    // The orbit layer must contain the two children it orients.
    // Match from the orbit <div ...class="opening-orbit"...> through the
    // </Transition> that wraps it (allow :key or other bind attrs first).
    const orbitMatch = openingPage.match(
      /<div[^>]*class="opening-orbit"[\s\S]*?<\/Transition>/,
    )
    expect(orbitMatch).not.toBeNull()
    const orbitBlock = orbitMatch?.[0] ?? ''
    expect(orbitBlock).toContain('class="opening-copy"')
    expect(orbitBlock).toContain('class="opening-scene"')
  })
})
