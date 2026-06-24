import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('page route transition contract', () => {
  it('wraps the shell RouterView with an out-in page-route transition keyed by route identity', () => {
    const appShell = readProjectFile('src/layouts/AppShell.vue')

    expect(appShell).toContain('<RouterView v-slot="{ Component, route: routeInfo }">')
    expect(appShell).toMatch(/<transition\s+name="page-route"\s+mode="out-in"/)
    expect(appShell).toContain('@before-enter="onPageBeforeEnter"')
    expect(appShell).toContain('@before-leave="onPageBeforeLeave"')
    expect(appShell).toContain(':key="routeInfo.name || routeInfo.fullPath"')
  })

  it('keeps page-route transition timing and reduced-motion rules in the global stylesheet', () => {
    const appShell = readProjectFile('src/layouts/AppShell.vue')
    const mainCss = readProjectFile('src/styles/main.css')

    expect(appShell).not.toMatch(/\.page-route-(enter|leave)-/)
    expect(mainCss).toMatch(/\.page-route-enter-active\s*\{[^}]*transition:\s*opacity 0\.32s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\),\s*transform 0\.32s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);[^}]*will-change:\s*opacity,\s*transform;/s)
    expect(mainCss).toMatch(/\.page-route-leave-active\s*\{[^}]*transition:\s*opacity 0\.18s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\),\s*transform 0\.18s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/s)
    expect(mainCss).toMatch(/\.page-route-enter-from\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateX\(calc\(var\(--page-direction,\s*1\)\s*\*\s*16px\)\)\s*translateY\(4px\);/s)
    expect(mainCss).toMatch(/\.page-route-leave-to\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateX\(calc\(var\(--page-direction,\s*1\)\s*\*\s*10px\)\);/s)
    expect(mainCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.page-route-enter-from\s*\{[^}]*transform:\s*none;/)
  })

  it('wires AppShell.vue direction state + JS hooks so the CSS var is set per phase', () => {
    const appShell = readProjectFile('src/layouts/AppShell.vue')

    // State: prevActivityKey ref + transitionDirection ref, both reactive
    expect(appShell).toMatch(/const\s+prevActivityKey\s*=\s*ref\(currentActivityKey\.value\)/)
    expect(appShell).toMatch(/const\s+transitionDirection\s*=\s*ref\(1\)/)

    // Watch: computes direction from ACTIVITY_ITEMS index delta
    expect(appShell).toMatch(/watch\(currentActivityKey,\s*\(nextKey,\s*previousKey\)\s*=>/)
    expect(appShell).toMatch(/transitionDirection\.value\s*=\s*safeNext\s*>\s*safePrev\s*\?\s*1\s*:\s*-1/)

    // Hooks write the CSS var onto the element before each phase
    expect(appShell).toMatch(/function\s+onPageBeforeEnter\(el\)/)
    expect(appShell).toMatch(/function\s+onPageBeforeLeave\(el\)/)
    expect(appShell).toMatch(/onPageBeforeEnter[\s\S]{0,200}setProperty\('--page-direction'/)
    expect(appShell).toMatch(/onPageBeforeLeave[\s\S]{0,200}setProperty\('--page-direction'/)
  })

  it('animates the shell-tab ◆ stamp with opacity + transform + cubic-bezier (V4 micro-motion)', () => {
    const appShell = readProjectFile('src/layouts/AppShell.vue')

    // Base rule: glyph lives in the DOM as an empty box, opacity 0 +
    // translateY -4px so the stamp can slide-in on activation.
    const baseRule = appShell.match(/\.shell-tab::before\s*\{[^}]*\}/s)?.[0] || ''
    expect(baseRule).toMatch(/content:\s*""/)
    expect(baseRule).toMatch(/opacity:\s*0/)
    expect(baseRule).toMatch(/transform:\s*translateY\(-4px\)/)
    // Cubic-bezier(0.22, 1, 0.36, 1) on opacity + transform, 0.2s.
    expect(baseRule).toMatch(/transition:[^;]*opacity 0\.2s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/)
    expect(baseRule).toMatch(/transition:[^;]*transform 0\.2s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/)

    // Active rule: stamp glyph ◆ in archive-rose, slides down to translateY(0).
    const stampRule = appShell.match(/\.shell-tab\.active::before\s*\{[^}]*\}/s)?.[0] || ''
    expect(stampRule).toMatch(/content:\s*"◆"/)
    expect(stampRule).toMatch(/opacity:\s*1/)
    expect(stampRule).toMatch(/transform:\s*translateY\(0\)/)
    expect(stampRule).toMatch(/var\(--accent-rose\)|--archive-rose/)
  })

  it('disables the stamp micro-animation under prefers-reduced-motion', () => {
    const appShell = readProjectFile('src/layouts/AppShell.vue')

    expect(appShell).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.shell-tab::before\s*\{[^}]*transform:\s*none;/)
    // The reduced-motion block must collapse the transition timing too,
    // not just the transform — otherwise the opacity animation still plays.
    const reducedBlock = appShell.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.shell-tab::before\s*\{[^}]*\}/s)?.[0] || ''
    expect(reducedBlock).toMatch(/transition:\s*opacity 0\.01s ease/)
  })
})