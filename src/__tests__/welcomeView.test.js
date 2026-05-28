import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readProjectFile(path) {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

describe('welcome view redesign', () => {
  it('uses a Pinax IDE-style split layout and removes the old product name from the homepage copy', () => {
    const welcomeView = readProjectFile('src/views/WelcomeView.vue')

    expect(welcomeView).toContain('<h1 class="welcome-title">Pinax</h1>')
    expect(welcomeView).toContain('welcome-layout')
    expect(welcomeView).toContain('welcome-brand-panel')
    expect(welcomeView).toContain('welcome-entry-panel')
    expect(welcomeView).toContain('welcome-status')
    expect(welcomeView).not.toContain('WriterHelper 欢迎页')
  })
})
