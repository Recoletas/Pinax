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
    expect(appShell).toContain('<transition name="page-route" mode="out-in">')
    expect(appShell).toContain(':key="routeInfo.name || routeInfo.fullPath"')
  })

  it('keeps page-route transition timing and reduced-motion rules in the global stylesheet', () => {
    const appShell = readProjectFile('src/layouts/AppShell.vue')
    const mainCss = readProjectFile('src/styles/main.css')

    expect(appShell).not.toMatch(/\.page-route-(enter|leave)-/)
    expect(mainCss).toMatch(/\.page-route-enter-active\s*\{[^}]*transition:\s*opacity 0\.16s ease,\s*transform 0\.16s ease;[^}]*will-change:\s*opacity,\s*transform;/s)
    expect(mainCss).toMatch(/\.page-route-leave-active\s*\{[^}]*transition:\s*opacity 0\.1s ease,\s*transform 0\.1s ease;/s)
    expect(mainCss).toMatch(/\.page-route-enter-from\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(4px\) scale\(0\.995\);/s)
    expect(mainCss).toMatch(/\.page-route-leave-to\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(-2px\) scale\(0\.998\);/s)
    expect(mainCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.page-route-enter-from\s*\{[^}]*transform:\s*none;/)
  })
})
