import assert from 'node:assert/strict'

// Measure returned rows in a real settings panel. Counts of metadata, open
// requests and index-only count() requests are intentionally not row reads.
export async function checkLedgerWorkspace(browser, base) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.route('**/api/**', route => route.fulfill({ json: { ok: true, projects: [] } }))
    await page.route('**/__ledger_fixture__', route => route.fulfill({ contentType: 'text/html', body: '<title>Fixture</title>' }))
    await page.goto(base + '/__ledger_fixture__')
    await page.evaluate(async () => {
      const { openLedgerDb } = await import('/src/services/memory/ledger/ledgerDb.js')
      const { encodeScopeKey } = await import('/src/services/memory/ledger/ledgerContract.js')
      const { queueMemoryCandidate } = await import('/src/services/memory/memoryCandidates.js')
      const { flushMemoryHistory } = await import('/src/services/memory/memoryHistoryStore.js')
      const scope = { domain: 'book', bookId: 'workspace-book' }
      const scopeKey = encodeScopeKey(scope)
      localStorage.setItem('writing_books', JSON.stringify([{ id: scope.bookId, title: '雾港', chapters: [] }]))
      queueMemoryCandidate({ id: 'seed', content: '工作区归档', scope: 'project', scopeId: scope.bookId, sourceRefs: ['source'], sourceRevision: '1' })
      await flushMemoryHistory()
      const { db } = await openLedgerDb()
      try {
        const versions = Array.from({ length: 160 }, (_, i) => ({
          id: 'fv-' + i, schemaVersion: 2, factKey: 'fact:' + i, scope, scopeKey,
          subjectKey: '灯' + i, subjectLabel: '灯' + i, predicate: '状态', object: '灯塔记录' + i,
          recordedSeq: i + 1, recordedAt: i + 1, evidenceIds: ['ev-' + i], supersedes: null,
          validInterval: null, authority: 'author-confirmed', origin: 'author'
        }))
        await db.factVersions.bulkPut(versions)
        await db.evidenceSnapshots.bulkPut(versions.map((row, i) => ({
          id: 'ev-' + i, scope, scopeKey, sourceKind: 'chapter-quote', sourceId: 'ch', sourceRevision: '1', quote: '灯塔原文' + i
        })))
        await db.factDecisions.bulkPut(versions.map((row, i) => ({
          id: 'd-' + i, scope, scopeKey, operation: 'adopt-proposal', recordedAt: i + 1, recordedSeq: i + 1, result: { factKey: row.factKey }
        })))
        await db.ledgerMeta.put({ id: 'seq:' + scopeKey, seq: versions.length })
      } finally { db.close() }
    })
    await page.goto(base)
    await page.locator('.library-quick-actions').getByRole('button', { name: '备份与恢复' }).click()
    await page.evaluate(() => {
      const tracked = new Set(['factVersions', 'factProposals', 'factDecisions', 'evidenceSnapshots', 'rejectionMarks'])
      window.ledgerProbe = { reads: 0, writes: 0, open: 0 }
      const live = new WeakSet()
      const open = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (...args) {
        const req = open.apply(this, args)
        if (args[0] === 'pinax-memory-history') req.addEventListener('success', () => {
          live.add(req.result); window.ledgerProbe.open++
        })
        return req
      }
      const close = IDBDatabase.prototype.close
      IDBDatabase.prototype.close = function () {
        if (live.delete(this)) window.ledgerProbe.open--
        return close.call(this)
      }
      for (const proto of [IDBIndex.prototype, IDBObjectStore.prototype]) {
        for (const method of ['get', 'getAll', 'openCursor']) {
          const original = proto[method]
          proto[method] = function (...args) {
            const request = original.apply(this, args)
            if (tracked.has((this.objectStore || this).name)) request.addEventListener('success', () => {
              if (request.result) window.ledgerProbe.reads += method === 'getAll' ? request.result.length : 1
            })
            return request
          }
        }
      }
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === 'memory_candidates_v1') window.ledgerProbe.writes++
        return set.call(this, key, value)
      }
    })
    await page.getByRole('tab', { name: '记忆与历史' }).click()
    await page.getByRole('region', { name: '自动记录的记忆修订' }).getByText('工作区归档').waitFor()
    await page.waitForLoadState('networkidle')
    const activity = await page.evaluate(() => ({ ...window.ledgerProbe }))
    console.log('ledger workspace, activity', activity)
    assert.deepEqual(activity, { reads: 0, writes: 0, open: 0 })
    await page.getByRole('button', { name: '事实账本' }).click()
    const ledger = page.getByRole('region', { name: '事实账本' })
    await ledger.getByText(/数据库正常/).waitFor()
    assert.equal(await page.evaluate(() => window.ledgerProbe.reads), 0)
    await ledger.getByLabel('视图').selectOption('facts')
    const cards = ledger.locator('article.memory-ledger__card')
    await cards.nth(49).waitFor()
    assert.equal(await cards.count(), 50)
    await ledger.getByRole('button', { name: '加载更多事实' }).click()
    await cards.nth(99).waitFor()
    const first = cards.first()
    await first.getByRole('button', { name: '更正', exact: true }).click()
    await first.locator('textarea').fill('此页仍显示旧版本')
    await page.evaluate(async () => {
      const { withLedgerDb } = await import('/src/services/memory/ledger/ledgerDb.js')
      const { correctFact } = await import('/src/services/memory/ledger/factLedger.js')
      const changed = await withLedgerDb(db => correctFact(db, {
        scope: { domain: 'book', bookId: 'workspace-book' }, factKey: 'fact:159',
        expectedHead: 'fv-159', object: '另一页已确认的更正', commandId: 'peer-correction', actorRef: 'peer'
      }))
      if (!changed.ok) throw new Error(changed.reason)
    })
    await first.getByRole('button', { name: '提交更正' }).click()
    await page.getByText(/事实已在别处更新/).waitFor()
    await cards.filter({ hasText: '另一页已确认的更正' }).waitFor()
    await ledger.getByLabel('视图').selectOption('decisions')
    await ledger.getByRole('button', { name: '加载更早的决定' }).click()
    await ledger.locator('.memory-ledger__decision-group').nth(75).waitFor({ state: 'attached' })
    await page.waitForFunction(() => window.ledgerProbe.open === 0)
    assert.equal(await page.evaluate(() => window.ledgerProbe.writes), 0)
    const metadata = await page.evaluate(async () => {
      const { createLedgerDb, openLedgerDbNamed } = await import('/src/services/memory/ledger/ledgerDb.js')
      const name = 'ledger-fixture-version'
      const seed = createLedgerDb(name).db
      await seed.open()
      await seed.ledgerMeta.put({ id: 'schema', schemaVersion: 1, createdAt: 17, source: 'legacy' })
      seed.close()
      const [a, b] = await Promise.all([openLedgerDbNamed(name), openLedgerDbNamed(name)])
      if (!a.ok || !b.ok) throw new Error('Concurrent legacy opens failed')
      const legacy = await a.db.ledgerMeta.get('schema')
      a.db.close()
      const future = { id: 'schema', schemaVersion: 99, source: 'newer-app' }
      await b.db.ledgerMeta.put(future)
      b.db.close()
      const blocked = await openLedgerDbNamed(name)
      blocked.db?.close()
      await seed.open()
      try {
        return { source: legacy.source, createdAt: legacy.createdAt, version: legacy.schemaVersion,
          error: blocked.reason, kept: JSON.stringify(await seed.ledgerMeta.get('schema')) === JSON.stringify(future) }
      } finally { seed.close() }
    })
    assert.deepEqual(metadata, { source: 'legacy', createdAt: 17, version: 2, error: 'schema-unsupported', kept: true })
    console.log('ledger workspace, paged facts/decisions, stale correction and released connections passed')
  } finally { await context.close() }
}
