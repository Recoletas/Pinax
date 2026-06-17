import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import { STORAGE_KEYS } from '../composables/useStorage'

describe('gameStore saveSessions debounce (trailing 500ms, 3-event flush)', () => {
  let setItemSpy

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    // Spy setItem on the prototype and only count calls whose first arg
    // is STORAGE_KEYS.WRITING_SESSIONS (other save* helpers in gameStore
    // also write localStorage; we only care about saveSessions).
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
  })

  afterEach(() => {
    vi.useRealTimers()
    setItemSpy.mockRestore()
  })

  function sessionsCalls() {
    return setItemSpy.mock.calls.filter(([key]) => key === STORAGE_KEYS.WRITING_SESSIONS)
  }

  it('debounces 5 saveSessions() calls into 1 WRITING_SESSIONS write after 500ms', () => {
    const store = useGameStore()
    store.sessions = [
      { id: 's1', messages: [{ role: 'user', content: 'hi' }] }
    ]

    for (let i = 0; i < 5; i++) store.saveSessions()
    expect(sessionsCalls()).toHaveLength(0)

    vi.advanceTimersByTime(400)
    expect(sessionsCalls()).toHaveLength(0)

    vi.advanceTimersByTime(200)  // total 600ms > 500ms
    expect(sessionsCalls()).toHaveLength(1)
  })

  it('flushSaveSessions() writes immediately (no 500ms wait)', () => {
    const store = useGameStore()
    store.sessions = [{ id: 's1', messages: [] }]

    store.saveSessions()
    expect(sessionsCalls()).toHaveLength(0)

    store.flushSaveSessions()
    expect(sessionsCalls()).toHaveLength(1)
  })

  it('beforeunload event triggers global flushPending (sync write)', () => {
    const store = useGameStore()
    store.sessions = [{ id: 's1', messages: [] }]

    store.saveSessions()
    expect(sessionsCalls()).toHaveLength(0)

    const event = new Event('beforeunload')
    window.dispatchEvent(event)

    expect(sessionsCalls().length).toBeGreaterThanOrEqual(1)
  })
})
