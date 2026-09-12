import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  buildBackup,
  createRestorePlan,
  exportAllBackup,
  exportLegacyMigrationBundle,
  PINAX_BACKUP_KEYS,
  restoreBackup
} from '../utils/backupExport'
import { STORAGE_KEYS } from '../composables/useStorage'
import { buildBetaDiagnosticReport } from '../utils/betaDiagnosticExport.js'

describe('backupExport', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("buildBackup returns version + timestamp + keys（合并4例）", async () => {
{

    localStorage.clear()

localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"sk-test"}')
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, '[]')
    const b = buildBackup()
    expect(b.version).toBe(2)
    expect(b.schemaVersion).toBe(2)
    expect(b.app).toBe('Pinax')
    expect(typeof b.exportedAt).toBe('string')
    expect(b.keyCount).toBeGreaterThanOrEqual(1)
    expect(b.keys[STORAGE_KEYS.API_SETTINGS]).toBeUndefined()
    expect(b.excludedSecretKeys).toContain(STORAGE_KEYS.API_SETTINGS)
    expect(b.includesIndexedDb).toBe(false)
    expect(b.keys[STORAGE_KEYS.WRITING_BOOKS]).toBe('[]')
}
{

    localStorage.clear()

const books = [{
      id: 'book-1',
      title: '海港书稿',
      worldbookId: 'wb-harbor',
      chapters: [{ id: 'ch-1', title: '第一章', worldbookId: undefined, sceneAnchors: [] }]
    }]
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, JSON.stringify(books))
    const b = buildBackup()
    const exportedBook = JSON.parse(b.keys[STORAGE_KEYS.WRITING_BOOKS])[0]
    // 绑定与新字段原样进出备份：不做迁移剥离、不回填全局 active 世界书。
    expect(exportedBook.worldbookId).toBe('wb-harbor')
    expect(exportedBook.chapters[0].sceneAnchors).toEqual([])
    // 恢复计划同样保留字段（round-trip）。
    const plan = createRestorePlan(b)
    expect(plan.valid).toBe(true)
    restoreBackup(b)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.WRITING_BOOKS))[0].worldbookId).toBe('wb-harbor')
}
{

    localStorage.clear()

localStorage.setItem('worldbook_wb-1', '{"id":"wb-1"}')
    localStorage.setItem('worldbook:brief:wb-1:story', 'brief text')
    localStorage.setItem('active_worldbook_id', 'wb-1')
    localStorage.setItem('dialogue_characters', '[]')

    const b = buildBackup()

    expect(b.keys['worldbook_wb-1']).toBe('{"id":"wb-1"}')
    expect(b.keys['worldbook:brief:wb-1:story']).toBe('brief text')
    expect(b.keys.active_worldbook_id).toBe('wb-1')
    expect(b.keys.dialogue_characters).toBe('[]')
}
{

    localStorage.clear()

localStorage.setItem('same-key', 'same')
    localStorage.setItem('overwrite-key', 'old')

    const plan = createRestorePlan({
      app: 'Pinax',
      schemaVersion: 1,
      keys: {
        'same-key': 'same',
        'overwrite-key': 'new',
        'new-key': 'new value'
      }
    })

    expect(plan.valid).toBe(true)
    expect(plan.add).toEqual(['new-key'])
    expect(plan.overwrite).toEqual(['overwrite-key'])
    expect(plan.skip).toEqual(['same-key'])
    expect(plan.incompatible).toEqual([])
    expect(localStorage.getItem('overwrite-key')).toBe('old')
}
{
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, JSON.stringify([{
      id: 'private-book-id',
      title: '不能出现在诊断里的书名',
      chapters: [{ id: 'private-chapter-id', title: '隐私章名', content: '隐私正文' }]
    }]))
    localStorage.setItem(STORAGE_KEYS.API_SETTINGS, JSON.stringify({ apiKey: 'sk-private' }))

    const report = await buildBetaDiagnosticReport({
      navigatorRef: {
        language: 'zh-CN',
        onLine: true,
        userAgent: 'Pinax test browser',
        storage: {
          estimate: async () => ({ usage: 1024, quota: 4096 }),
          persisted: async () => false
        }
      },
      locationRef: { pathname: '/authoring' },
      windowRef: { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1 },
      now: () => new Date('2026-09-12T00:00:00.000Z')
    })
    const serialized = JSON.stringify(report)
    expect(report).toMatchObject({
      schemaVersion: 1,
      writing: { bookCount: 1, chapterCount: 1 },
      storage: { estimatedOriginUsageBytes: 1024, persistentStorage: false },
      privacy: { includesManuscriptText: false, includesApiKeys: false }
    })
    expect(serialized).not.toContain('隐私')
    expect(serialized).not.toContain('private-book-id')
    expect(serialized).not.toContain('sk-private')
}
})

  it("rejects malformed or future-version backups without touching storage（合并4例）", async () => {
{

    localStorage.clear()

localStorage.setItem('protected-key', 'keep')

    const malformed = createRestorePlan('{"app":"Pinax"}')
    const future = createRestorePlan({
      app: 'Pinax',
      schemaVersion: 99,
      keys: { 'protected-key': 'replace' }
    })

    expect(malformed.valid).toBe(false)
    expect(malformed.incompatible.length).toBeGreaterThan(0)
    expect(future.valid).toBe(false)
    expect(future.incompatible).toContain('不支持的备份版本：99')
    expect(localStorage.getItem('protected-key')).toBe('keep')
}
{

    localStorage.clear()

localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '"x"')
    const b = buildBackup()
    expect(b.keys[STORAGE_KEYS.API_SETTINGS]).toBeUndefined()
    expect('undefined' in b.keys).toBe(false)
    expect(b.keys[STORAGE_KEYS.WRITING_BOOKS]).toBeUndefined()
}
{

    localStorage.clear()

for (const v of Object.values(STORAGE_KEYS)) {
      expect(PINAX_BACKUP_KEYS).toContain(v)
    }
}
{

    localStorage.clear()

// jsdom doesn't ship URL.createObjectURL/revokeObjectURL — stub them
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = () => 'blob:mock'
    URL.revokeObjectURL = () => {}

    const fakeAnchor = { click: vi.fn(), href: '', download: '' }
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor)

    try {
      localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"abc"}')
      localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, '[]')
      const { filename, keyCount, excludedSecretKeyCount } = exportAllBackup()

      expect(filename.startsWith('pinax-backup-')).toBe(true)
      expect(filename.endsWith('.json')).toBe(true)
      expect(keyCount).toBe(1)
      expect(excludedSecretKeyCount).toBe(1)
      expect(fakeAnchor.click).toHaveBeenCalled()
    } finally {
      createElementSpy.mockRestore()
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
}
})

  it("exports a project-only desktop migration bundle without changing backup v2（合并4例）", async () => {
{

    localStorage.clear()

const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    let downloadedBlob = null
    URL.createObjectURL = (blob) => {
      downloadedBlob = blob
      return 'blob:migration'
    }
    URL.revokeObjectURL = () => {}
    const fakeAnchor = { click: vi.fn(), href: '', download: '' }
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor)

    try {
      localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, '[{"id":"book-1"}]')
      localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"sk-private"}')

      const result = await exportLegacyMigrationBundle({
        now: () => new Date('2026-08-21T12:00:00.000Z')
      })
      const downloaded = JSON.parse(await downloadedBlob.text())

      expect(buildBackup().schemaVersion).toBe(2)
      expect(result.filename).toMatch(/^pinax-desktop-migration-.+\.json$/)
      expect(result.recordCount).toBe(1)
      expect(downloaded.schemaVersion).toBe(3)
      expect(downloaded.records[0].sourceRecordId).toBe(STORAGE_KEYS.WRITING_BOOKS)
      expect(JSON.stringify(downloaded)).not.toContain('sk-private')
      expect(fakeAnchor.click).toHaveBeenCalledOnce()
    } finally {
      createElementSpy.mockRestore()
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
}
{

    localStorage.clear()

localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"abc"}')
    const b = buildBackup()
    const round = JSON.parse(JSON.stringify(b))
    expect(round.version).toBe(2)
    expect(round.keys[STORAGE_KEYS.API_SETTINGS]).toBeUndefined()
    expect(JSON.stringify(round)).not.toContain('abc')
}
{

    localStorage.clear()

localStorage.setItem('existing-key', 'old')

    const result = restoreBackup({
      app: 'Pinax',
      schemaVersion: 1,
      keys: {
        'existing-key': 'new',
        'new-key': 'value'
      }
    }, { overwrite: false })

    expect(result.success).toBe(true)
    expect(result.written).toEqual(['new-key'])
    expect(localStorage.getItem('existing-key')).toBe('old')
    expect(localStorage.getItem('new-key')).toBe('value')
}
{

    localStorage.clear()

const values = new Map([['stable-key', 'old']])
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (key === 'blocked-key') throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
        values.set(key, value)
      },
      removeItem: (key) => values.delete(key),
      get length() { return values.size },
      key: (index) => [...values.keys()][index] ?? null
    }

    const result = restoreBackup({
      app: 'Pinax',
      schemaVersion: 1,
      keys: {
        'stable-key': 'new',
        'blocked-key': 'value'
      }
    }, { storage })

    expect(result.success).toBe(false)
    expect(result.reason).toBe('quota')
    expect(result.rolledBack).toBe(true)
    expect(values.get('stable-key')).toBe('old')
}
})
})
