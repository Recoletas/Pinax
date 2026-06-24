import { describe, expect, it, beforeEach, vi } from 'vitest'
import { buildBackup, exportAllBackup, PINAX_BACKUP_KEYS } from '../utils/backupExport'
import { STORAGE_KEYS } from '../composables/useStorage'

describe('backupExport', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('buildBackup returns version + timestamp + keys', () => {
    localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"sk-test"}')
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, '[]')
    const b = buildBackup()
    expect(b.version).toBe(1)
    expect(b.app).toBe('Pinax')
    expect(typeof b.exportedAt).toBe('string')
    expect(b.keyCount).toBeGreaterThanOrEqual(2)
    expect(b.keys[STORAGE_KEYS.API_SETTINGS]).toBe('{"apiKey":"sk-test"}')
    expect(b.keys[STORAGE_KEYS.WRITING_BOOKS]).toBe('[]')
  })

  it('excludes missing keys (does not store as null)', () => {
    localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '"x"')
    const b = buildBackup()
    expect(b.keys[STORAGE_KEYS.API_SETTINGS]).toBe('"x"')
    expect('undefined' in b.keys).toBe(false)
    expect(b.keys[STORAGE_KEYS.WRITING_BOOKS]).toBeUndefined()
  })

  it('PINAX_BACKUP_KEYS contains all STORAGE_KEYS values', () => {
    for (const v of Object.values(STORAGE_KEYS)) {
      expect(PINAX_BACKUP_KEYS).toContain(v)
    }
  })

  it('exportAllBackup triggers download via stubbed link', () => {
    // jsdom doesn't ship URL.createObjectURL/revokeObjectURL — stub them
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = () => 'blob:mock'
    URL.revokeObjectURL = () => {}

    const fakeAnchor = { click: vi.fn(), href: '', download: '' }
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor)

    try {
      localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"abc"}')
      const { filename, keyCount } = exportAllBackup()

      expect(filename.startsWith('pinax-backup-')).toBe(true)
      expect(filename.endsWith('.json')).toBe(true)
      expect(keyCount).toBe(1)
      expect(fakeAnchor.click).toHaveBeenCalled()
    } finally {
      createElementSpy.mockRestore()
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })

  it('backup JSON is parseable', () => {
    localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"abc"}')
    const b = buildBackup()
    const round = JSON.parse(JSON.stringify(b))
    expect(round.version).toBe(1)
    expect(round.keys[STORAGE_KEYS.API_SETTINGS]).toBe('{"apiKey":"abc"}')
  })
})