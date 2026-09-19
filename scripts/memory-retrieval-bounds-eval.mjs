/* eslint-disable no-console */
import { chromium } from 'playwright'

// G1（2026-09-18 夜间 A 线）：记忆检索有界性与"先截断再过滤"反例。
// 真实 IndexedDB/Dexie、真实 queryFacts / ledgerProductionAdapter 生产链。
// 场景：
//   S1 单主体 2 万版本：分页有界（旧实现 .toArray() 全量物化）。
//   S2 同 scope 2 万 decisions：recordedAt 截止有界解析；早于一切记录 → 空 complete 视图。
//   S3 生产链 2 万量级新无关记录下旧相关事实召回（先过滤后截断）。
//   S4 匹配项深于扫描上限：诚实 partial-scan-limit，不假称 complete。
//   S5 多主体交错：跨页严格降序、不重不漏。
const BASE_URL = process.env.PINAX_BOUNDS_EVAL_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const report = await page.evaluate(async () => {
    const L = await import('/src/services/memory/ledger/ledgerDb.js')
    const C = await import('/src/services/memory/ledger/ledgerContract.js')
    const Q = await import('/src/services/memory/ledger/queryFacts.js')
    const P = await import('/src/services/memory/ledger/ledgerProductionAdapter.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : null)
    const scopeOf = bookId => C.normalizeScopeRef({ domain: 'book', bookId }).scope
    const keyOf = bookId => C.encodeScopeKey(scopeOf(bookId))
    const metaSeq = async (db, scopeKey, seq) => db.table('ledgerMeta').put({ id: `seq:${scopeKey}`, seq })
    const seedVersions = async (db, rows) => {
      for (let i = 0; i < rows.length; i += 2000) await db.table('factVersions').bulkPut(rows.slice(i, i + 2000))
    }
    const noiseVersion = (scopeKey, seq, extra = {}) => ({
      id: `fv-${scopeKey}-${seq}`,
      schemaVersion: 2,
      factKey: extra.factKey || `noise/${seq}`,
      scopeKey,
      subjectKey: extra.subjectKey || '背景板',
      subjectLabel: extra.subjectLabel || '背景板',
      predicate: extra.predicate || '状态',
      object: extra.object || `无关注事项 ${seq}`,
      evidenceIds: [],
      validInterval: null,
      recordedAt: 1_700_000_000_000 + seq * 1000,
      recordedSeq: seq,
      supersedes: null,
      invalidatedSeq: null,
      authority: 'author-confirmed',
      origin: 'author',
      legacyRefs: null,
      ...extra.row
    })

    const opened = await L.openLedgerDb()
    check(opened.ok, `ledger open failed: ${opened.detail || opened.reason}`)
    const db = opened.db
    const results = {}

    // ---------- S1: 单主体 2 万版本，分页有界 ----------
    {
      const scopeKey = keyOf('book-bounds')
      const scope = scopeOf('book-bounds')
      const N = 20000
      const rows = []
      for (let seq = 1; seq <= N; seq += 1) rows.push(noiseVersion(scopeKey, seq, { subjectKey: 'solo', subjectLabel: '独白角色' }))
      await seedVersions(db, rows)
      await metaSeq(db, scopeKey, N)
      const heapBefore = heap()
      const startedAt = Date.now()
      const first = await Q.queryFacts(db, { scope, subjectKeys: ['solo'], limit: 200 })
      const firstPageMs = Date.now() - startedAt
      check(first.ok && first.items.length === 200, `S1 首页应满页，got ${first.items?.length}`)
      check(first.scanned <= 1000, `S1 首页扫描应有界（一个 500 行带内），got ${first.scanned}`)
      check(first.completeness === 'partial-cursor', `S1 首页 completeness，got ${first.completeness}`)
      const seen = new Set(first.items.map(item => item.factVersionId))
      let last = first.items[0].recordedSeq
      let cursor = first.nextCursor
      let pages = 1
      let totalScanned = first.scanned
      while (cursor) {
        const p = await Q.queryFacts(db, { scope, subjectKeys: ['solo'], limit: 200, cursor })
        check(p.ok, 'S1 续页应成功')
        pages += 1
        totalScanned += p.scanned
        for (const item of p.items) {
          check(!seen.has(item.factVersionId), `S1 续页重复：${item.factVersionId}`)
          check(item.recordedSeq < last, `S1 跨页乱序：${item.recordedSeq} !< ${last}`)
          seen.add(item.factVersionId)
          last = item.recordedSeq
        }
        cursor = p.nextCursor
      }
      check(seen.size === N, `S1 全量走查应收回 2 万版本，got ${seen.size}`)
      results.s1 = { pages, firstPageScanned: first.scanned, firstPageMs, totalScanned, heapDeltaBytes: heap() ? heap() - heapBefore : null, fullWalkMs: Date.now() - startedAt }
    }

    // ---------- S2: 同 scope 2 万 decisions 的 recordedAt 截止 ----------
    {
      const scopeKey = keyOf('book-decisions')
      const scope = scopeOf('book-decisions')
      const N = 20000
      const t0 = 1_600_000_000_000
      const decisions = []
      for (let seq = 1; seq <= N; seq += 1) decisions.push({ id: `fd-${scopeKey}-${seq}`, scopeKey, commandId: `cmd-${seq}`, recordedSeq: seq, recordedAt: t0 + seq * 1000 })
      for (let i = 0; i < decisions.length; i += 2000) await db.table('factDecisions').bulkPut(decisions.slice(i, i + 2000))
      // 三个可见版本：seq 500 / 9999（截止前）与 15000（截止后）
      const versions = [500, 9999, 15000].map(seq => noiseVersion(scopeKey, seq, { object: `决定前事项 ${seq}` }))
      await seedVersions(db, versions)
      await metaSeq(db, scopeKey, N)
      const mid = t0 + 10000 * 1000 + 500
      const heapBefore = heap()
      const startedAt = Date.now()
      const q = await Q.queryFacts(db, { scope, recordedAsOf: { recordedAt: mid }, limit: 10 })
      const elapsedMs = Date.now() - startedAt
      check(q.ok, `S2 查询应成功：${q.reason || ''}`)
      const ids = q.items.map(item => item.recordedSeq).sort((a, b) => a - b)
      check(JSON.stringify(ids) === '[500,9999]', `S2 截止前可见版本应为 [500,9999]，got ${JSON.stringify(ids)}`)
      check(q.scanned <= 11000, `S2 截止解析+读取应有界（<1.1 万），got ${q.scanned}`)
      // 早于一切记录 → 空 complete 视图（有界走查证明无更早记录）
      const early = await Q.queryFacts(db, { scope, recordedAsOf: { recordedAt: t0 - 5000 }, limit: 10 })
      check(early.ok && early.items.length === 0 && early.completeness === 'complete', `S2 早于一切应为空 complete，got ${early.completeness}/${early.items?.length}`)
      check(early.scanned === N, `S2 排除性走查应扫满 2 万决定，got ${early.scanned}`)
      results.s2 = { scannedMid: q.scanned, scannedEarly: early.scanned, elapsedMs, heapDeltaBytes: heap() ? heap() - heapBefore : null }
    }

    // ---------- S3: 生产链召回——1.9 万新无关记录之下的旧相关事实 ----------
    {
      const scopeKey = keyOf('book-recall')
      const N_NOISE = 19000
      const rows = []
      for (let seq = 1; seq <= N_NOISE; seq += 1) rows.push(noiseVersion(scopeKey, seq))
      const relevant = noiseVersion(scopeKey, N_NOISE + 1, {
        factKey: 'clocktower/hours',
        subjectKey: '钟楼',
        subjectLabel: '钟楼',
        predicate: '开放时间',
        object: '冬至 06:00–18:00',
        row: { recordedAt: 1_700_000_000_000 + (N_NOISE + 1) * 1000 }
      })
      rows.push(relevant)
      await seedVersions(db, rows)
      await metaSeq(db, scopeKey, N_NOISE + 1)
      const heapBefore = heap()
      const startedAt = Date.now()
      const out = await P.readProductionLedgerFacts({ context: { projectId: 'book-recall' }, query: '钟楼 冬至' })
      const elapsedMs = Date.now() - startedAt
      const included = out.blocks.filter(block => block.included)
      check(included.length === 1 && included[0].factVersionId === relevant.id, `S3 生产链应召回旧相关事实，got ${JSON.stringify(included.map(b => b.factVersionId))}`)
      check((out.blocks.find(b => b.id === 'fact-ledger-audit')?.recallAudit?.excludedByReason?.textFilterMiss || 0) === N_NOISE, 'S3 审计块应记录 textFilterMiss=19000')
      check(out.completeness === 'complete', `S3 completeness 应 complete，got ${out.completeness}`)
      results.s3 = { found: included[0].factVersionId, scanned: out.scanned, elapsedMs, completeness: out.completeness, heapDeltaBytes: heap() ? heap() - heapBefore : null }
    }

    // ---------- S4: 匹配项深于扫描上限 → 诚实 partial-scan-limit ----------
    {
      const scopeKey = keyOf('book-deep')
      const N_NOISE = 20500
      const rows = []
      for (let seq = 2; seq <= N_NOISE; seq += 1) rows.push(noiseVersion(scopeKey, seq))
      const deep = noiseVersion(scopeKey, 1, {
        factKey: 'deep/secret',
        subjectKey: '深埋者',
        subjectLabel: '深埋者',
        predicate: '位置',
        object: '冬至祭坛之下',
        row: { recordedAt: 1_700_000_000_000 + 1000 }
      })
      rows.push(deep)
      await seedVersions(db, rows)
      await metaSeq(db, scopeKey, N_NOISE)
      const startedAt = Date.now()
      const out = await P.readProductionLedgerFacts({ context: { projectId: 'book-deep' }, query: '深埋者 冬至祭坛' })
      const elapsedMs = Date.now() - startedAt
      const included = out.blocks.filter(block => block.included)
      check(included.length === 0, `S4 超限匹配不应在本页出现，got ${included.length}`)
      check(out.completeness === 'partial-scan-limit', `S4 应诚实报告 partial-scan-limit，got ${out.completeness}`)
      results.s4 = { completeness: out.completeness, scanned: out.scanned, elapsedMs }
    }

    // ---------- S5: 多主体交错——跨页严格降序、不重不漏 ----------
    {
      const scopeKey = keyOf('book-multi')
      const scope = scopeOf('book-multi')
      const subjects = ['甲', '乙', '丙']
      const rows = []
      let seq = 0
      for (let round = 0; round < 300; round += 1) {
        for (const subjectKey of subjects) {
          seq += 1
          rows.push(noiseVersion(scopeKey, seq, { subjectKey, subjectLabel: subjectKey, object: `${subjectKey}的事项 ${round}` }))
        }
      }
      await seedVersions(db, rows)
      await metaSeq(db, scopeKey, seq)
      const first = await Q.queryFacts(db, { scope, subjectKeys: subjects, limit: 100 })
      check(first.ok && first.items.length === 100, 'S5 首页应满页')
      const all = [...first.items]
      let cursor = first.nextCursor
      while (cursor) {
        const p = await Q.queryFacts(db, { scope, subjectKeys: subjects, limit: 100, cursor })
        all.push(...p.items)
        cursor = p.nextCursor
      }
      check(all.length === 900, `S5 应收回 900 版本，got ${all.length}`)
      const uniq = new Set(all.map(item => item.factVersionId))
      check(uniq.size === 900, 'S5 不应重复')
      for (let i = 1; i < all.length; i += 1) check(all[i].recordedSeq < all[i - 1].recordedSeq, `S5 全局应严格降序 @${i}`)
      results.s5 = { total: all.length, pages: Math.ceil(all.length / 100) }
    }

    await L.closeLedgerDb(db)
    return results
  })

  console.log('[memory-retrieval-bounds-eval] ok')
  console.log(JSON.stringify(report, null, 2))
  if (pageErrors.length) {
    console.error('[memory-retrieval-bounds-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
