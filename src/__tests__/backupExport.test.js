import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  buildBackup,
  createRestorePlan,
  exportAllBackup,
  PINAX_BACKUP_KEYS,
  restoreBackup
} from '../utils/backupExport'
import { STORAGE_KEYS } from '../composables/useStorage'

describe('backupExport', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('buildBackup returns version + timestamp + keys', () => {
    localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"sk-test"}')
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, '[]')
    const b = buildBackup()
    expect(b.version).toBe(2)
    expect(b.schemaVersion).toBe(2)
    expect(b.app).toBe('Pinax')
    expect(typeof b.exportedAt).toBe('string')
    expect(b.keyCount).toBeGreaterThanOrEqual(2)
    expect(b.keys[STORAGE_KEYS.API_SETTINGS]).toBe('{"apiKey":"sk-test"}')
    expect(b.keys[STORAGE_KEYS.WRITING_BOOKS]).toBe('[]')
  })

  it('discovers dynamic worldbook and runtime keys', () => {
    localStorage.setItem('worldbook_wb-1', '{"id":"wb-1"}')
    localStorage.setItem('worldbook:brief:wb-1:story', 'brief text')
    localStorage.setItem('active_worldbook_id', 'wb-1')
    localStorage.setItem('dialogue_characters', '[]')

    const b = buildBackup()

    expect(b.keys['worldbook_wb-1']).toBe('{"id":"wb-1"}')
    expect(b.keys['worldbook:brief:wb-1:story']).toBe('brief text')
    expect(b.keys.active_worldbook_id).toBe('wb-1')
    expect(b.keys.dialogue_characters).toBe('[]')
  })

  it('builds a side-effect-free restore plan', () => {
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
  })

  it('rejects malformed or future-version backups without touching storage', () => {
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
    expect(round.version).toBe(2)
    expect(round.keys[STORAGE_KEYS.API_SETTINGS]).toBe('{"apiKey":"abc"}')
  })

  it('writes a confirmed restore and leaves overwrite keys untouched when disabled', () => {
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
  })

  it('rolls back already written keys when storage throws quota error', () => {
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
  })

  it('P1-3: 备份含 experience checkpoint 摘要，恢复计划读取并校验', () => {
    // 构造带 experience 摘要的 backup（模拟 buildBackup 的 v2 输出）
    const backup = {
      version: 2,
      schemaVersion: 2,
      app: 'Pinax',
      keys: { apiSettings: '{"apiKey":"x"}' },
      experience: {
        sessionCount: 1,
        branchCount: 1,
        turnCount: 1,
        hasTurnData: true,
        memoryRevision: 0,
        checkpoint: { turnId: 'narrative_turn_1', committedAt: 100 }
      }
    }
    // 当前会话 checkpoint 更新（200 > 100）→ checkpointNotice 提示回退
    localStorage.setItem('writing_sessions', JSON.stringify([{
      id: 'sess-1',
      turnRecords: {
        'narrative_turn_1': { id: 'narrative_turn_1', branchId: 'main', committedAt: 200, status: 'committed' }
      },
      lastCommittedTurnId: 'narrative_turn_1'
    }]))
    const plan = createRestorePlan(backup)
    expect(plan.valid).toBe(true)
    expect(plan.checkpoint.turnId).toBe('narrative_turn_1')
    expect(plan.checkpointNotice).toContain('早于当前会话')

    // 备份 checkpoint 与当前一致 → 无提示
    localStorage.setItem('writing_sessions', JSON.stringify([{
      id: 'sess-1',
      turnRecords: {
        'narrative_turn_1': { id: 'narrative_turn_1', branchId: 'main', committedAt: 100, status: 'committed' }
      },
      lastCommittedTurnId: 'narrative_turn_1'
    }]))
    const planSame = createRestorePlan(backup)
    expect(planSame.checkpointNotice).toBeNull()
  })
})
