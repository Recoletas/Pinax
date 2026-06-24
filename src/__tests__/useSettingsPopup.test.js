import { describe, expect, it } from 'vitest'
import { useSettingsPopup } from '../composables/useSettingsPopup'

describe('useSettingsPopup', () => {
  it('starts closed on first call', () => {
    const a = useSettingsPopup()
    a.close()
    const b = useSettingsPopup()
    expect(b.isOpen.value).toBe(false)
    expect(b.activeSection.value).toBe('appearance')
  })

  it('open() flips isOpen to true and defaults to appearance section', () => {
    const { isOpen, activeSection, open, close } = useSettingsPopup()
    close()
    open()
    expect(isOpen.value).toBe(true)
    expect(activeSection.value).toBe('appearance')
  })

  it('open(section) sets the requested section', () => {
    const { activeSection, open, close } = useSettingsPopup()
    close()
    open('ai')
    expect(activeSection.value).toBe('ai')
    open('storage')
    expect(activeSection.value).toBe('storage')
  })

  it('open() rejects unknown section names and falls back to appearance', () => {
    const { activeSection, open, close } = useSettingsPopup()
    close()
    open('bogus')
    expect(activeSection.value).toBe('appearance')
  })

  it('close() flips isOpen back to false but keeps activeSection', () => {
    const { isOpen, activeSection, open, close } = useSettingsPopup()
    close()
    open('ai')
    close()
    expect(isOpen.value).toBe(false)
    expect(activeSection.value).toBe('ai')
  })

  it('toggle() flips between open and closed', () => {
    const { isOpen, toggle, open, close } = useSettingsPopup()
    close()
    toggle()
    expect(isOpen.value).toBe(true)
    toggle()
    expect(isOpen.value).toBe(false)
  })

  it('shares state across independent callers (module-scope ref)', () => {
    const callerA = useSettingsPopup()
    const callerB = useSettingsPopup()
    callerA.close()
    callerB.open('storage')
    expect(callerA.isOpen.value).toBe(true)
    expect(callerA.activeSection.value).toBe('storage')
  })
})
