import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import {
  buildBackup,
  createRestorePlan,
  exportAllBackup,
  exportLegacyMigrationBundle,
  PINAX_BACKUP_KEYS,
  restoreBackup
} from '../utils/backupExport'
import { readStoredText, writeStoredText } from '../services/storage/writingStorageCodec.js'
import { getMirrorReceipt, updateMirrorReceipt } from '../services/localMirrorSettings.js'
import { mirrorEpochKey } from '../services/storage/mirrorReceiptEpoch.js'
import { STORAGE_KEYS } from '../composables/useStorage'
import { buildBetaDiagnosticReport } from '../utils/betaDiagnosticExport.js'
import { sha256HexOfBytes, sha256HexOfText } from '../services/storage/backupHash'
import {
  buildWorkspaceBackupBundle,
  inspectWorkspaceBackup,
  restoreWorkspaceBackupBundle
} from '../services/storage/workspaceBackupBundle.js'
import { loadAllSourceArchiveRecords, restoreSourceArchiveRecords } from '../services/worldbook/worldbookSourceArchive'

// jsdom has no IndexedDB. These ZIP contract fixtures carry an empty ledger;
// real Dexie transactions/failures are exercised by abc-integration-smoke.mjs.
vi.mock('../services/memory/ledger/ledgerDb', () => {
  const emptyTable = {
    toArray: async () => [], get: async () => undefined, bulkGet: async keys => keys.map(() => undefined),
    add: async () => {}, bulkDelete: async () => {}
  }
  const table = () => emptyTable
  const db = { table, transaction: async (_mode, _tables, fn) => fn({ table }) }
  return { openLedgerDb: async () => ({ ok: true, db }), closeLedgerDb: async () => {} }
})

// 测试用二进制 store（Map 兜底，替代 jsdom 缺失的 IndexedDB）
function createFakeBinaryStore() {
  const store = new Map()
  return {
    store,
    keys: async () => [...store.keys()],
    get: async (id) => store.get(id) ?? null,
    put: async (id, value) => {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(await value.arrayBuffer())
      store.set(id, bytes)
    },
    delete: async (id) => { store.delete(id) }
  }
}

async function readZipText(bytes, path) {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file(path)?.async('string') ?? null
}

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

    // Simulate a quota-limited origin. Validate old plain JSON, compact reads,
    // rejection of a damaged record, and exact preservation on failed writes.
    let physical = '[]'
    const extraKeys = new Map()
    const limited = {
      length: 1,
      key: () => 'writing_books',
      getItem: key => key === 'writing_books' ? physical : extraKeys.get(key) ?? null,
      removeItem: key => extraKeys.delete(key),
      setItem: (key, value) => {
        if (key !== 'writing_books') { extraKeys.set(key, value); return }
        if (value.length > 32000) throw new DOMException('full', 'QuotaExceededError')
        physical = value
      }
    }
    const logical = JSON.stringify([{ id: 'long', content: '诸岛之间的风向🪶'.repeat(6000) }])
    expect(readStoredText(limited, 'writing_books')).toBe('[]')
    writeStoredText(limited, 'writing_books', logical)
    expect(physical.length).toBeLessThan(logical.length)
    expect(buildBackup({ storage: limited }).keys.writing_books).toBe(logical)
    expect(createRestorePlan(buildBackup({ storage: limited }), limited).skip).toContain('writing_books')
    const intact = physical
    const denied = { ...limited, setItem: () => { throw new DOMException('full', 'QuotaExceededError') } }
    expect(() => writeStoredText(denied, 'writing_books', logical)).toThrow()
    expect(physical).toBe(intact)
    physical = intact.slice(0, -12)
    expect(() => readStoredText(limited, 'writing_books')).toThrow(/校验失败/)
    const damagedBackup = { app: 'Pinax', schemaVersion: 2, keys: { writing_books: physical } }
    expect(createRestorePlan(damagedBackup, limited).valid).toBe(false)
    const cleanBackup = { ...damagedBackup, keys: { writing_books: logical } }
    expect(createRestorePlan(cleanBackup, limited).overwrite).toEqual(['writing_books'])
    expect(restoreBackup(cleanBackup, { storage: limited }).success).toBe(true)
    expect(readStoredText(limited, 'writing_books')).toBe(logical)

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
{
    // C1/C6：v3 完整工作区导出——manifest/SHA-256/secret 排除/来源与媒体计数；哈希对拍
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '{"apiKey":"sk-test"}')
    localStorage.setItem(STORAGE_KEYS.WRITING_BOOKS, JSON.stringify([{ id: 'b1', title: '工作区书', chapters: [] }]))

    expect(sha256HexOfText('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const binary = Uint8Array.from({ length: 8200 }, (_, i) => i % 247)
    for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 8192]) {
      const slice = binary.subarray(7, 7 + length)
      const expected = createHash('sha256').update(Buffer.from(slice)).digest('hex')
      expect(sha256HexOfBytes(slice)).toBe(expected)
    }

    localStorage.setItem(STORAGE_KEYS.MEDIA_ASSETS, JSON.stringify([
      { id: 'm-1', schemaVersion: 1, kind: 'image', mimeType: 'image/png', storageRef: 'pinax-media://m-1', title: '参考图' }
    ]))
    const sourceRecords = {
      artifacts: [{ id: 'sa-1', schemaVersion: 1, title: '来源', contentHash: 'hash-a', chunkIds: ['sc-1'] }],
      chunks: [{ id: 'sc-1', schemaVersion: 1, artifactId: 'sa-1', text: '来源正文片段' }],
      workspaces: []
    }
    expect((await restoreSourceArchiveRecords(sourceRecords)).ok).toBe(true)

    const binaryStore = createFakeBinaryStore()
    binaryStore.store.set('m-1', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]))
    const bundle = await buildWorkspaceBackupBundle({ storage: localStorage, binaryStore })
    expect(bundle.manifest.format).toBe('pinax-workspace-backup')
    expect(bundle.manifest.version).toBe(3)
    expect(bundle.manifest.app).toBe('Pinax')
    expect(bundle.manifest.files['local-storage.json']).toMatch(/^[0-9a-f]{64}$/)
    expect(bundle.manifest.domains.media.missingBinaryIds).toEqual([])
    expect(bundle.manifest.domains.sourceArchive.artifactCount).toBe(1)
    expect(bundle.manifest.excludedSecretKeys).toContain(STORAGE_KEYS.API_SETTINGS)
    expect(bundle.stats.mediaBinaryCount).toBe(1)

    const lsParsed = JSON.parse(await readZipText(bundle.bytes, 'local-storage.json'))
    expect(lsParsed.keys[STORAGE_KEYS.API_SETTINGS]).toBeUndefined()
    expect(lsParsed.keys[STORAGE_KEYS.MEDIA_ASSETS]).toContain('m-1')

    localStorage.setItem(STORAGE_KEYS.MEDIA_ASSETS, JSON.stringify([
      { id: 'm-1', schemaVersion: 1, kind: 'image', mimeType: 'image/png', storageRef: 'pinax-media://m-1', title: '参考图' },
      { id: 'm-ext', schemaVersion: 1, kind: 'image', mimeType: 'image/png', externalUrl: 'https://example.com/a.png', title: '外链图' },
      { id: 'm-missing', schemaVersion: 1, kind: 'image', mimeType: 'image/png', storageRef: 'pinax-media://m-missing', title: '缺失图' }
    ]))
    const bundleWithGaps = await buildWorkspaceBackupBundle({ storage: localStorage, binaryStore: createFakeBinaryStore() })
    expect(bundleWithGaps.manifest.domains.media.missingBinaryIds).toContain('m-missing')
    expect(bundleWithGaps.manifest.domains.media.externalCount).toBe(1)
    const zippedManifest = JSON.parse(await readZipText(bundleWithGaps.bytes, 'manifest.json'))
    expect(zippedManifest.warnings).toEqual(bundleWithGaps.manifest.warnings)
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
      if (v === STORAGE_KEYS.LOCAL_MIRROR_RECEIPTS) expect(PINAX_BACKUP_KEYS).not.toContain(v)
      else expect(PINAX_BACKUP_KEYS).toContain(v)
    }
    const receipt = STORAGE_KEYS.LOCAL_MIRROR_RECEIPTS
    localStorage.setItem(receipt, 'current-device')
    expect(buildBackup().keys[receipt]).toBeUndefined()
    const result = restoreBackup({ app: 'Pinax', version: 2, keys: { [receipt]: 'foreign-device' } })
    expect(result.success).toBe(true)
    expect(localStorage.getItem(receipt)).toBe('current-device')

    const shelf = STORAGE_KEYS.WRITING_BOOKS
    const other = { id: 'other', title: '同一作品' }
    const newer = JSON.stringify([{ id: 'a', title: '在盘新版' }, other])
    const older = JSON.stringify([{ title: '同一作品', id: 'other' }, { id: 'a', title: '备份旧版' }])
    localStorage.setItem(shelf, newer)
    updateMirrorReceipt('p', 'a', { revision: 8 })
    updateMirrorReceipt('q', 'other', { revision: 6 })
    const originalEpoch = getMirrorReceipt('p', 'a').epoch
    const restore = { app: 'Pinax', version: 2, keys: { [shelf]: older, [mirrorEpochKey('a')]: 'foreign' } }
    const preview = createRestorePlan(restore, localStorage, { review: true })
    const newDraft = JSON.stringify([{ id: 'a', title: '预览后编辑' }, other])
    localStorage.setItem(shelf, newDraft)
    const stale = restoreBackup(restore, { expectedReviewRevision: preview.reviewRevision, acceptRestoreRisk: true })
    expect(stale).toMatchObject({ success: false, reason: 'restore-review-changed', written: [] })
    expect(localStorage.getItem(shelf)).toBe(newDraft)
    expect(stale.plan.reviewRevision).not.toBe(preview.reviewRevision)
    localStorage.setItem(shelf, newer)
    expect(restoreBackup(restore, { overwrite: false }).written).toEqual([])
    expect(getMirrorReceipt('p', 'a').revision).toBe(8)

    const failing = (duringFailure = () => {}) => ({
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => {
        if (key === 'blocked') { duringFailure(); throw new DOMException('full', 'QuotaExceededError') }
        localStorage.setItem(key, value)
      },
      removeItem: key => localStorage.removeItem(key)
    })
    const interrupted = { ...restore, keys: { ...restore.keys, blocked: 'replace' } }
    // Existing keys are overwritten in insertion order after all additions.
    localStorage.setItem('blocked', 'initial')
    expect(restoreBackup(interrupted, { storage: failing() })).toMatchObject({ success: false, rolledBack: true })
    expect(localStorage.getItem(shelf)).toBe(newer)
    expect(getMirrorReceipt('p', 'a').revision).toBe(8)

    expect(restoreBackup(restore).written).toEqual([shelf])
    expect(getMirrorReceipt('p', 'a').revision).toBe(0)
    updateMirrorReceipt('p', 'a', { revision: 9 }, originalEpoch)
    expect(getMirrorReceipt('p', 'a').revision).toBe(0)
    expect(getMirrorReceipt('q', 'other').revision).toBe(6)
    expect(buildBackup().keys[mirrorEpochKey('a')]).toBeUndefined()
    localStorage.setItem(mirrorEpochKey('a'), 'pending:interrupted')
    expect(restoreBackup(restore).written).toEqual([])
    expect(getMirrorReceipt('p', 'a').epoch).not.toMatch(/^pending:/)

    localStorage.setItem(shelf, newer)
    updateMirrorReceipt('p', 'a', { revision: 11 })
    const concurrent = JSON.stringify([{ id: 'a', title: '另一页刚刚保存的内容' }, other])
    const raced = restoreBackup(interrupted, { storage: failing(() => localStorage.setItem(shelf, concurrent)) })
    expect(raced).toMatchObject({ success: false, rolledBack: false, rollbackFailed: true })
    expect(localStorage.getItem(shelf)).toBe(concurrent)
    expect(getMirrorReceipt('p', 'a').revision).toBe(0)
    expect(getMirrorReceipt('q', 'other').revision).toBe(6)

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
{
    // C3：v3 校验拒绝（text-only ZIP，jsdom 可靠）；哈希篡改/往返/幂等在浏览器 Gate 覆盖
    localStorage.clear()
    const fakeManifest = {
      format: 'pinax-workspace-backup', version: 3, app: 'NotPinax', createdAt: '', files: {}, domains: {}
    }
    const wrongApp = new JSZip()
    wrongApp.file('manifest.json', JSON.stringify(fakeManifest))
    wrongApp.file('local-storage.json', '{"app":"Pinax","schemaVersion":2,"keys":{}}')
    const wrongAppInspection = await inspectWorkspaceBackup(
      await wrongApp.generateAsync({ type: 'uint8array' }), { storage: localStorage }
    )
    expect(wrongAppInspection.valid).toBe(false)
    expect(wrongAppInspection.errors[0]).toContain('不是 Pinax')

    const wrongVersionManifest = { ...fakeManifest, app: 'Pinax', version: 99 }
    const wrongVersionZip = new JSZip()
    wrongVersionZip.file('manifest.json', JSON.stringify(wrongVersionManifest))
    wrongVersionZip.file('local-storage.json', '{}')
    const wrongVersionInspection = await inspectWorkspaceBackup(
      await wrongVersionZip.generateAsync({ type: 'uint8array' }), { storage: localStorage }
    )
    expect(wrongVersionInspection.valid).toBe(false)
    expect(wrongVersionInspection.errors[0]).toContain('版本')

    const missingFilesZip = new JSZip()
    missingFilesZip.file('manifest.json', JSON.stringify({
      format: 'pinax-workspace-backup', version: 3, app: 'Pinax', createdAt: '', files: {}, domains: {}
    }))
    const missingFilesInspection = await inspectWorkspaceBackup(
      await missingFilesZip.generateAsync({ type: 'uint8array' }), { storage: localStorage }
    )
    expect(missingFilesInspection.valid).toBe(false)
    expect(missingFilesInspection.errors[0]).toContain('local-storage.json')

    const wrongSchemaZip = new JSZip()
    wrongSchemaZip.file('manifest.json', JSON.stringify({
      format: 'pinax-workspace-backup',
      version: 3,
      app: 'Pinax',
      files: {},
      domains: { sourceArchive: { schemaVersion: 99 }, media: { schemaVersion: 1 } }
    }))
    wrongSchemaZip.file('local-storage.json', '{}')
    const wrongSchemaInspection = await inspectWorkspaceBackup(
      await wrongSchemaZip.generateAsync({ type: 'uint8array' }), { storage: localStorage }
    )
    expect(wrongSchemaInspection.valid).toBe(false)
    expect(wrongSchemaInspection.errors[0]).toContain('schema')

    const traversalZip = new JSZip()
    traversalZip.file('../manifest.json', '{}')
    traversalZip.file('local-storage.json', '{}')
    const traversalInspection = await inspectWorkspaceBackup(
      await traversalZip.generateAsync({ type: 'uint8array' }), { storage: localStorage }
    )
    expect(traversalInspection.valid).toBe(false)
    expect(traversalInspection.errors[0]).toContain('未知文件')
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
{
    // C2/C4：缺二进制进 missingBinaryIds（构建侧）；写入失败回滚/幂等在浏览器 Gate 以真实 Chromium 覆盖
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.MEDIA_ASSETS, JSON.stringify([
      { id: 'mb-1', schemaVersion: 1, kind: 'image', mimeType: 'image/png', storageRef: 'pinax-media://mb-1', title: '缺原件图' }
    ]))
    const bundleMissing = await buildWorkspaceBackupBundle({ storage: localStorage, binaryStore: createFakeBinaryStore() })
    expect(bundleMissing.manifest.domains.media.missingBinaryIds).toEqual(['mb-1'])
    expect(bundleMissing.manifest.domains.media.binaryCount).toBe(0)
    const missingInspection = await inspectWorkspaceBackup(bundleMissing.bytes, { storage: localStorage })
    expect(missingInspection.valid).toBe(true)
    expect(missingInspection.counts.missingBinary).toBe(1)

    localStorage.setItem(STORAGE_KEYS.MEDIA_ASSETS, JSON.stringify([
      { id: 'rb-1', schemaVersion: 1, kind: 'image', mimeType: 'image/png', storageRef: 'pinax-media://rb-1' },
      { id: 'rb-2', schemaVersion: 1, kind: 'image', mimeType: 'image/png', storageRef: 'pinax-media://rb-2' }
    ]))
    const exportStore = createFakeBinaryStore()
    exportStore.store.set('rb-1', new Uint8Array([1]))
    exportStore.store.set('rb-2', new Uint8Array([2]))
    const rollbackBundle = await buildWorkspaceBackupBundle({ storage: localStorage, binaryStore: exportStore })
    const restoreStore = createFakeBinaryStore()
    const originalPut = restoreStore.put
    restoreStore.put = async (id, value) => {
      if (id === 'rb-2') throw new Error('injected media write failure')
      return originalPut(id, value)
    }
    const workspace = title => ({ id: 'shared-id', schemaVersion: 1, title })
    await restoreSourceArchiveRecords({ workspaces: [workspace('备份中的工作区')], chunks: [workspace('同 ID 的资料片段')] })
    localStorage.setItem(STORAGE_KEYS.API_SETTINGS, '排除的设置')
    const mergedBundle = await buildWorkspaceBackupBundle({ storage: localStorage, includeSecrets: true, binaryStore: exportStore })
    localStorage.removeItem(STORAGE_KEYS.API_SETTINGS)
    await restoreSourceArchiveRecords({ workspaces: [workspace('编辑后的工作区')] })
    const keepStore = createFakeBinaryStore()
    keepStore.store.set('rb-1', new Uint8Array([9]))
    keepStore.store.set('rb-2', new Uint8Array([2]))
    const inspected = await inspectWorkspaceBackup(mergedBundle.bytes, { storage: localStorage, binaryStore: keepStore })
    expect(inspected.requiresRiskConfirmation).toBe(true)
    expect(inspected.media.overwrite.map(asset => asset.id)).toEqual(['rb-1'])
    const kept = await restoreWorkspaceBackupBundle(mergedBundle.bytes, { storage: localStorage, overwrite: false, binaryStore: keepStore })
    expect(kept.success, kept.domains?.factLedger?.reason || kept.reason).toBe(true)
    expect(localStorage.getItem(STORAGE_KEYS.API_SETTINGS)).toBeNull()
    expect((await loadAllSourceArchiveRecords()).workspaces.find(row => row.id === 'shared-id').title).toBe('编辑后的工作区')
    expect([...keepStore.store.get('rb-1')]).toEqual([9])

    // A later edit to a source record during another domain's failure belongs
    // to the author. Compensation must preserve both it and unrelated rows.
    restoreStore.put = async () => {
      await restoreSourceArchiveRecords({ workspaces: [workspace('同时修改'), { id: 'unrelated', title: '并发新建' }] })
      throw new Error('media failure after concurrent edit')
    }
    const interrupted = await restoreWorkspaceBackupBundle(mergedBundle.bytes, { storage: localStorage, binaryStore: restoreStore, acceptRestoreRisk: true })
    expect(interrupted.success).toBe(false)
    expect(interrupted.domains.sourceArchive.rollbackFailed).toBe(true)
    const workspaces = (await loadAllSourceArchiveRecords()).workspaces
    expect(workspaces.find(row => row.id === 'shared-id').title).toBe('同时修改')
    expect(workspaces.some(row => row.id === 'unrelated')).toBe(true)
    restoreStore.put = async (id, value) => {
      if (id === 'rb-2') throw new Error('injected media write failure')
      return originalPut(id, value)
    }
    const failedRestore = await restoreWorkspaceBackupBundle(rollbackBundle.bytes, {
      storage: localStorage,
      binaryStore: restoreStore,
      acceptRestoreRisk: true
    })
    expect(failedRestore.success).toBe(false)
    expect(failedRestore.reason).toBe('media-restore-failed')
    expect([...restoreStore.store.keys()]).toEqual([])
}
})
})
