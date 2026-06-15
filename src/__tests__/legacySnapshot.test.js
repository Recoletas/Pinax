import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

const LEGACY_FILES = [
  'src/views/legacy/WelcomeView.vue',
  'src/pages/legacy/OpeningPage.vue',
  'src/pages/legacy/Experience.vue',
  'src/components/worldbook/legacy/StructuredSettingsPanel.vue',
  'src/styles/themes/legacy.css',
]

describe('legacy snapshot files exist', () => {
  it.each(LEGACY_FILES)('%s exists at the expected path', (relPath) => {
    const abs = resolve(ROOT, relPath)
    expect(existsSync(abs)).toBe(true)
  })

  it.each(LEGACY_FILES)('%s carries the Frozen snapshot header', (relPath) => {
    if (relPath.endsWith('.css')) return
    const abs = resolve(ROOT, relPath)
    const head = readFileSync(abs, 'utf8').split('\n').slice(0, 6).join('\n')
    // WelcomeView/Experience/StructuredSettingsPanel snapshot from 4e779d2;
    // OpeningPage predates the 4e779d2 boundary, snapshotted from 424fe28
    // (its first standalone commit) with a deviation note in the header.
    expect(head).toMatch(/Frozen snapshot from (4e779d2|424fe28)/)
  })

  it('legacy.css exists and is empty or minimal', () => {
    const abs = resolve(ROOT, 'src/styles/themes/legacy.css')
    const content = readFileSync(abs, 'utf8').trim()
    expect(content.length).toBeLessThan(200)
  })
})
