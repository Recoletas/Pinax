/* eslint-disable no-console */
import { chromium } from 'playwright'

// M12（2026-09-18 夜间 A 线）：记忆规模混合查询反例。真实 IndexedDB。
//   S1 10 万事实混合作用域：无过滤分页——每页扫描有界、p50/p95 与扫描量
//      如实报告（时延不设门槛，只报实测；扫描上限是硬断言）
//   S2 单主体 2 万版本：首页有界 + 堆增量
//   S3 分页中更正：冻结快照不被中途写入污染；ledgerAdvanced 如实上报；
//      新版本只出现在"重新发起的当前视图"里
//   S4 超限诚实：深埋匹配超过扫描上限 → partial-scan-limit（G1 语义复验）
const BASE_URL = process.env.PINAX_SCALE_EVAL_URL || 'http://127.0.0.1:5179'
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
    const F = await import('/src/services/memory/ledger/factLedger.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : null)
    const percentile = (values, p) => {
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0
    }
    const noiseVersion = (scopeKey, seq, subjectKey, subjectLabel, extra = {}) => ({
      id: `fv-${scopeKey.replace(/\u001f/g, '_')}-${seq}`,
      schemaVersion: 2,
      factKey: extra.factKey || `fact:${subjectKey}:状态`,
      scopeKey,
      subjectKey,
      subjectLabel,
      predicate: '状态',
      object: extra.object || `常规事项 ${seq}`,
      evidenceIds: [],
      validInterval: null,
      recordedAt: 1_700_000_000_000 + seq,
      recordedSeq: seq,
      supersedes: null,
      invalidatedSeq: null,
      supersedesKind: null,
      authority: 'author-confirmed',
      origin: 'author',
      legacyRefs: null
    })

    const opened = await L.openLedgerDb()
    check(opened.ok, 'open failed')
    const db = opened.db
    const results = {}

    // ---------- S1: 10 万混合（9 个常规主体 + 1 个 2 万热主体） ----------
    const scopeKey = C.encodeScopeKey(C.normalizeScopeRef({ domain: 'book', bookId: 'book-scale' }).scope)
    const scope = { domain: 'book', bookId: 'book-scale' }
    const subjects = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬']
    const rows = []
    let seq = 0
    const perSubject = 8888 // 9 × 8888 = 79,992 常规 + 20,008 热 = 100,000
    for (const subjectKey of subjects) {
      for (let i = 0; i < perSubject; i += 1) {
        seq += 1
        rows.push(noiseVersion(scopeKey, seq, subjectKey, subjectKey))
      }
    }
    const hotBase = seq
    for (let i = 0; i < 20008; i += 1) {
      seq += 1
      rows.push(noiseVersion(scopeKey, seq, '癸', '癸'))
    }
    for (let i = 0; i < rows.length; i += 4000) await db.table('factVersions').bulkPut(rows.slice(i, i + 4000))
    await db.table('ledgerMeta').put({ id: `seq:${scopeKey}`, seq })
    results.seeded = rows.length

    // S1 混合分页：p50/p95 与扫描
    {
      const heapBefore = heap()
      const latencies = []
      const scannedPerPage = []
      const seen = new Set()
      let cursor = null
      let pages = 0
      let orderOk = true
      let lastSeq = Infinity
      let completeness = null
      while (pages < 600) {
        const startedAt = Date.now()
        const p = await Q.queryFacts(db, { scope, limit: 200, ...(cursor ? { cursor } : {}) })
        latencies.push(Date.now() - startedAt)
        scannedPerPage.push(p.scanned)
        check(p.scanned <= 600, `S1 每页扫描应有界（≤600），got ${p.scanned}`)
        for (const item of p.items) {
          if (seen.has(item.factVersionId)) orderOk = false
          if (item.recordedSeq >= lastSeq) orderOk = false
          seen.add(item.factVersionId)
          lastSeq = item.recordedSeq
        }
        pages += 1
        completeness = p.completeness
        cursor = p.nextCursor
        if (!p.nextCursor) break
      }
      check(!cursor && seen.size === rows.length, `S1 必须走查到底：${seen.size}/${rows.length}`)
      results.s1 = {
        pages,
        unique: seen.size,
        orderOk,
        scannedP50: percentile(scannedPerPage, 0.5),
        scannedP95: percentile(scannedPerPage, 0.95),
        latencyP50Ms: percentile(latencies, 0.5),
        latencyP95Ms: percentile(latencies, 0.95),
        heapDeltaBytes: heap() ? heap() - heapBefore : null,
        completenessOfLastPage: completeness
      }
      check(orderOk, 'S1 全量走查应严格降序且不重复')
    }

    // ---------- S2: 单主体（癸，2 万版本）首页有界 ----------
    {
      const heapBefore = heap()
      const startedAt = Date.now()
      const first = await Q.queryFacts(db, { scope, subjectKeys: ['癸'], limit: 200 })
      const elapsedMs = Date.now() - startedAt
      check(first.ok && first.items.length === 200, 'S2 首页应满页')
      check(first.scanned <= 1000, `S2 首页扫描应有界，got ${first.scanned}`)
      results.s2 = { scanned: first.scanned, elapsedMs, completeness: first.completeness, heapDeltaBytes: heap() ? heap() - heapBefore : null }
    }

    // ---------- S3: 分页中更正（冻结快照） ----------
    {
      // 第一页后经生产更正链造新版本，验证冻结续页及重新发起的当前视图
      const p1 = await Q.queryFacts(db, { scope, limit: 200 })
      const corrected = await F.correctFact(db, {
        scope, factKey: 'fact:甲:状态', object: '更正后事项', commandId: 'scale-correct-1', actorRef: 'eval'
      })
      check(corrected.ok, 'S3 更正应成功')
      const p2 = await Q.queryFacts(db, { scope, limit: 200, cursor: p1.nextCursor })
      check(p2.ledgerAdvanced === true, 'S3 续页应如实上报 ledgerAdvanced')
      const seenIds = new Set([...p1.items, ...p2.items].map(item => item.factVersionId))
      check(!seenIds.has(corrected.result.factVersionId), 'S3 冻结快照不得混入中途更正的新版本')
      // 重新发起的当前视图可以看到新版本
      const fresh = await Q.queryFacts(db, { scope, subjectKeys: ['甲'], limit: 50 })
      check(fresh.ok && fresh.items.some(item => item.factVersionId === corrected.result.factVersionId), 'S3 当前视图应包含更正后版本')
      results.s3 = { ledgerAdvanced: p2.ledgerAdvanced, frozen: true, currentSeesCorrection: true }
    }

    // ---------- S4: 超限诚实（匹配项深于扫描上限） ----------
    {
      const deepScopeKey = C.encodeScopeKey(C.normalizeScopeRef({ domain: 'book', bookId: 'book-scale-deep' }).scope)
      const deepScope = { domain: 'book', bookId: 'book-scale-deep' }
      const deepRows = []
      for (let i = 2; i <= 20500; i += 1) deepRows.push(noiseVersion(deepScopeKey, i, '背景', '背景'))
      deepRows.push(noiseVersion(deepScopeKey, 1, '深埋', '深埋', { object: '冬至祭坛之下', factKey: 'fact:深埋:位置' }))
      for (let i = 0; i < deepRows.length; i += 4000) await db.table('factVersions').bulkPut(deepRows.slice(i, i + 4000))
      await db.table('ledgerMeta').put({ id: `seq:${deepScopeKey}`, seq: 20501 })
      const startedAt = Date.now()
      const q = await Q.queryFacts(db, { scope: deepScope, textTerms: ['冬至祭坛'], limit: 10 })
      check(q.ok && q.items.length === 0 && q.completeness === 'partial-scan-limit' && q.scanBudgetExhausted === true, `S4 应诚实 partial-scan-limit，got ${q.completeness}`)
      results.s4 = { completeness: q.completeness, scanned: q.scanned, elapsedMs: Date.now() - startedAt }
    }

    await L.closeLedgerDb(db)
    return results
  })
  console.log('[memory-scale-query-eval] ok')
  console.log(JSON.stringify(report, null, 2))
  if (pageErrors.length) {
    console.error('[memory-scale-query-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
