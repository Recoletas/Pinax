import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

const LEGACY_FILES = [
  'src/views/legacy/WelcomeView.vue',
  'src/pages/legacy/OpeningPage.vue',
  'src/pages/legacy/Experience.vue',
  'src/components/worldbook/legacy/StructuredSettingsPanel.vue',
  'src/styles/themes/legacy.css',
]

// Frozen-snapshot sha256 hashes recorded when these files were extracted
// (4e779d2 for the .vue files, 424fe28 for legacy/OpeningPage.vue per its
// header comment). If a file is modified the test fails — that's the point.
// To regenerate after a legitimate change: `git hash-object <file>` (which
// also hashes the header) and update the entry below.
const LEGACY_VUE_HASHES = {
  'src/views/legacy/WelcomeView.vue':
    'de1e6244cad3dcf07aef3a7861a4a0f5a4aad50761194004c7d21c1f84236169',
  'src/pages/legacy/OpeningPage.vue':
    '9021942a718051252e693e11971b08324cf8c63e817c3fff945b0da5c293478c',
  'src/pages/legacy/Experience.vue':
    'f2a90f51c31c0b0aa0bcac2f675c2bf392cccb966faac9ccabc8dccb0df38d65',
  'src/components/worldbook/legacy/StructuredSettingsPanel.vue':
    'b5dc61cd23645e39f353ee047d8a0ceff00bca4622b4be1bfdccf982ff20d2f2',
}

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

describe('legacy snapshot integrity (frozen content)', () => {
  it.each(Object.entries(LEGACY_VUE_HASHES))(
    '%s sha256 matches recorded hash',
    (relPath, expected) => {
      const abs = resolve(ROOT, relPath)
      const content = readFileSync(abs)
      const actual = createHash('sha256').update(content).digest('hex')
      expect(actual).toBe(expected)
    }
  )
})
