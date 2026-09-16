import { chromium } from 'playwright'
import assert from 'node:assert/strict'

// Real IndexedDB/Dexie, isolated browser profile; never touches the author's data.
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(process.env.PINAX_SMOKE_URL || 'http://127.0.0.1:5173')
  await page.waitForSelector('.authoring-welcome')
  const result = await page.evaluate(async () => {
    const m = await import('/src/services/memory/memoryCandidates.js')
    const h = await import('/src/services/memory/memoryHistoryStore.js')
    const b = await import('/src/services/storage/workspaceBackupBundle.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const base = { id: 'history-smoke', content: '钟楼尚未开放。', scope: 'project', scopeId: 'book-smoke',
      sourceRefs: ['chapter:smoke:unit:1'], sourceRevision: 'r1' }
    m.queueMemoryCandidate(base)
    m.confirmMemoryCandidate(base.id)
    m.updateMemoryCandidate(base.id, { content: '钟楼在冬至开放。', status: 'pending', authority: 'derived',
      metadata: { storyTime: { precision: 'label', label: '庆历三年冬至' } } })
    await h.flushMemoryHistory()
    const first = await h.readMemoryHistory({ candidateId: base.id })
    check(first.length === 3, 'create/confirm/edit history missing')
    const confirmed = first.find(row => row.after.status === 'active')
    check(confirmed.before.status === 'pending', 'confirmation provenance missing')
    m.updateMemoryCandidate(base.id, h.historicalCandidatePatch(confirmed))
    check(m.listMemoryCandidates().find(row => row.id === base.id).status === 'pending', 'restore silently accepted')
    for (let i = 0; i < 205; i++) m.updateMemoryCandidate(base.id, { content: `第 ${i} 次修订。` })
    await h.flushMemoryHistory()
    check((await h.readMemoryHistory({ candidateId: base.id })).length === 209, 'history was capped')
    check(!(await h.readMemoryHistory({ scope: 'project', scopeId: 'other-book' })).length, 'cross-project leak')
    check(!('_historyPending' in m.listMemoryCandidates()[0]), 'outbox exposed through public candidate API')
    const all = await h.readMemoryHistory()
    await h.importMemoryHistory(all)
    check((await h.readMemoryHistory()).length === all.length, 'import not idempotent')
    let rejected = false
    try { await h.importMemoryHistory([{ ...all[0], id: 'must-roll-back' }, { ...all[0], recordedAt: 1 }]) }
    catch { rejected = true }
    check(rejected && !(await h.readMemoryHistory()).some(row => row.id === 'must-roll-back'), 'conflicting batch not atomic')
    const zip = await b.buildWorkspaceBackupBundle()
    check(zip.manifest.domains.memoryHistory.revisionCount === 209, 'backup omitted history')
    const inspection = await b.inspectWorkspaceBackup(zip.bytes)
    check(inspection.valid && inspection.memoryHistoryCount === 209, 'backup inspection failed')
    // Simulate empty database in this isolated profile, then restore full ZIP.
    await h.rollbackImportedMemoryHistory(all.map(row => row.id))
    localStorage.removeItem('memory_candidates_v1')
    const originalSet = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'memory_candidates_v1') throw new DOMException('full', 'QuotaExceededError')
      return originalSet.call(this, key, value)
    }
    try {
      const failed = await b.restoreWorkspaceBackupBundle(zip.bytes, { acceptRestoreRisk: true })
      check(!failed.success && failed.domains.memoryHistory.rolledBack, 'history restore compensation missing')
      check((await h.readMemoryHistory()).length === 0, 'failed restore left new history behind')
    } finally { Storage.prototype.setItem = originalSet }
    const restored = await b.restoreWorkspaceBackupBundle(zip.bytes, { acceptRestoreRisk: true })
    check(restored.success && (await h.readMemoryHistory()).length === 209, 'ZIP restore lost history')
    const again = await b.restoreWorkspaceBackupBundle(zip.bytes, { acceptRestoreRisk: true })
    check(again.success && again.domains.memoryHistory.written === 0, 'ZIP restore not idempotent')
    // Same source owner must not claim a mutation when local durable commit fails.
    const oldSet = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'memory_candidates_v1') throw new DOMException('full', 'QuotaExceededError')
      return oldSet.call(this, key, value)
    }
    try { check(m.updateMemoryCandidate(base.id, { content: '不能落盘的变更' }) === null, 'quota fake success') }
    finally { Storage.prototype.setItem = oldSet }
    check((await h.readMemoryHistory()).length === 209, 'failed write polluted history')
    return { revisions: 209, zipBytes: zip.bytes.length }
  })
  await page.reload()
  assert.equal(await page.locator('.memory-indicator').count(), 0)
  await page.getByRole('button', { name: '备份与恢复 为作品留一份副本', exact: true }).click()
  await page.getByRole('tab', { name: '记忆与历史' }).click()
  await page.getByRole('button', { name: '查看来源与修订' }).click()
  await page.getByRole('list', { name: '修订历史' }).waitFor()
  assert.equal(await page.getByRole('list', { name: '修订历史' }).locator('li').count(), 209)
  await page.screenshot({ path: '/tmp/pinax-memory-history-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/pinax-memory-history-mobile.png' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  console.log(JSON.stringify({ ok: true, ...result, refresh: true, scopeIsolation: true, immutableImport: true, backupRoundtrip: true, quota: true, noFloatingIndicator: true }))
} finally { await browser.close() }
