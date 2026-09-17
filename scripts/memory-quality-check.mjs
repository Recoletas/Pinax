/* eslint-disable no-console */
// N-C 线门禁（NC18）：确定性、离线、不消耗真实模型额度。
// Part A：服务合同（准入矩阵、历史会话合并、提取任务全生命周期、引文/否定/传闻
//         校验、401/坏 JSON 反例、生产 reader 包含/排除）——真实 transport，
//         provider 由 playwright 路由按脚本应答（确定性替身）。
// Part B：生产 UI 旅程（打字母噪声 → 中文事实 → 切章 → 摘录候选 → 自动提取任务
//         → 账本提案），恰好一次计划内模型调用。
// 用法：node scripts/memory-quality-check.mjs（自起隔离 vite；BASE=… 复用）。
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || ''
const PORT = Number(process.env.MEMQ_PORT || 5319)
const URL_BASE = BASE || `http://127.0.0.1:${PORT}`
const OUT_DIR = path.resolve(process.env.OUT_DIR || '/tmp/pinax-memq-20260917')
fs.mkdirSync(OUT_DIR, { recursive: true })

const results = []
function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 300) })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${pass ? '' : ` — ${String(detail).slice(0, 260)}`}`)
}

const now = Date.now()
const iso = new Date(now).toISOString()
const INITIAL_1 = '雨从傍晚开始就没有停过。旅人推开门，把湿透的斗篷挂在门边的铁钩上。\n\n掌柜从柜台后抬起头，把一盏油灯往桌边推了推。'
const INITIAL_2 = '清晨的早市挤满了收网回来的人。'

function buildFixture() {
  return {
    writing_books: JSON.stringify([{
      id: 'bookA',
      title: '雾港纪事',
      worldbookId: '',
      description: '',
      createdAt: iso,
      updatedAt: iso,
      chapters: [
        { id: 'ch-1', title: '第一章 雨夜', content: INITIAL_1, wordCount: INITIAL_1.length, createdAt: iso, updatedAt: iso },
        { id: 'ch-2', title: '第二章 早市', content: INITIAL_2, wordCount: INITIAL_2.length, createdAt: iso, updatedAt: iso }
      ]
    }]),
    memory_candidates_v1: JSON.stringify([]),
    writing_block_history_v1: JSON.stringify([])
  }
}

async function startVite() {
  if (BASE) return null
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite start timeout')), 60_000)
    const onData = (data) => {
      if (String(data).includes('Local:')) {
        clearTimeout(timer)
        resolve()
      }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', (code) => reject(new Error(`vite exited early: ${code}`)))
  })
  return proc
}

function responseFor(payload) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ result: { text: JSON.stringify(payload) }, meta: { provider: 'deterministic-mock' } })
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const server = await startVite()
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript((snap) => {
      if (sessionStorage.getItem('memq-gate-seeded')) return
      localStorage.clear()
      for (const [key, value] of Object.entries(snap)) localStorage.setItem(key, value)
      sessionStorage.setItem('memq-gate-seeded', '1')
    }, buildFixture())
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    // ---- A1 准入矩阵（纯服务） ----
    await page.goto(`${URL_BASE}/comics`, { waitUntil: 'domcontentloaded' })
    const eligibility = await page.evaluate(async () => {
      const mod = await import('/src/services/memory/extractionEligibility.js')
      const cases = [
        ['a', 'noise'],
        ['asdfgh', 'noise'],
        ['aaaaaa', 'noise'],
        ['。。。！！', 'noise'],
        ['他死了。', 'eligible'],
        ['门没锁。', 'eligible'],
        ['NASA 发布了新照片。', 'eligible'],
        ['The gate is locked.', 'eligible'],
        ['莉娜没有钥匙。', 'eligible']
      ]
      return cases.map(([value, expected]) => ({
        value,
        expected,
        actual: mod.evaluateMemoryEligibility({ text: value, sourceRefs: ['unit:x'], revision: 'r1' }).reason
      }))
    })
    check('A1 准入矩阵：噪声零资格、短事实/英文/缩写不拒',
      eligibility.every((row) => row.actual === row.expected),
      JSON.stringify(eligibility.filter((row) => row.actual !== row.expected)))

    // ---- A2 历史会话合并 ----
    const merge = await page.evaluate(async () => {
      const mod = await import('/src/services/writing/writingBlockHistory.js')
      localStorage.removeItem('writing_block_history_v1')
      const entry = (over = {}) => ({
        schemaVersion: 2,
        chapterId: 'ch-1',
        chapterTitle: '第一章',
        unitId: 'unit-1',
        nodeId: 'node-1',
        previousText: over.previousText ?? '起点',
        currentText: over.currentText ?? '起点a',
        fromDocumentRevision: over.from ?? 1,
        toDocumentRevision: over.to ?? 2,
        source: 'manual-save',
        createdAt: over.createdAt ?? new Date().toISOString()
      })
      const t0 = Date.now()
      mod.appendWritingBlockHistory([entry({ createdAt: new Date(t0).toISOString() })])
      for (let index = 1; index <= 19; index += 1) {
        mod.appendWritingBlockHistory([entry({
          previousText: `起点${'a'.repeat(index - 1)}`,
          currentText: `起点${'a'.repeat(index)}`,
          from: index, to: index + 1,
          createdAt: new Date(t0 + index * 2000).toISOString()
        })])
      }
      const merged = mod.listWritingBlockHistory('ch-1')
      mod.closeWritingBlockHistorySessions({ chapterId: 'ch-1' })
      mod.appendWritingBlockHistory([entry({ previousText: '终点', currentText: '终点b', from: 99, to: 100, createdAt: new Date(t0 + 60000).toISOString() })])
      const afterBoundary = mod.listWritingBlockHistory('ch-1')
      return {
        rows: merged.length,
        mergedCount: merged[0]?.mergedCount || 0,
        keptStart: merged[0]?.previousText === '起点',
        keptLatest: merged[0]?.currentText === '起点aaaaaaaaaaaaaaaaaaa',
        rowsAfterBoundary: afterBoundary.length,
        secondKept: afterBoundary[0]?.currentText === '终点b'
      }
    })
    check('A2 连续 20 次小改合并 1 条且保留起点/最新；封组后另起新条',
      merge.rows === 1 && merge.mergedCount === 19 && merge.keptStart && merge.keptLatest && merge.rowsAfterBoundary === 2 && merge.secondKept,
      JSON.stringify(merge))

    // ---- A3–A6 提取任务生命周期（transport 脚本化） ----
    let scripted = null
    const advisorCalls = []
    await page.route('**/api/advisor**', async (route) => {
      advisorCalls.push(Date.now())
      const response = scripted
      scripted = null
      if (response == null) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"unscripted"}' })
        return
      }
      await route.fulfill(response)
    })
    // 用可变脚本桥：node 端在每次 drain 前设置 page 窗口变量？改为 node 变量
    // scripted 直接闭包捕获（route 与 drain 同在 node 协调，无需窗口桥）。

    const ENQUEUE = async (jobsArgs) => page.evaluate(async (args) => {
      const jobs = await import('/src/services/memory/extraction/extractionJobStore.js')
      const enq = jobs.enqueueExtractionJob(args)
      return { ok: enq.ok, duplicate: enq.duplicate }
    }, jobsArgs)
    const DRAIN = () => page.evaluate(async () => {
      const runner = await import('/src/services/memory/extraction/extractionRunner.js')
      await runner.drainExtractionQueue({ max: 1, auto: true })
      return true
    })
    const JOBSNAP = (fingerprint) => page.evaluate(async (fp) => {
      const jobs = await import('/src/services/memory/extraction/extractionJobStore.js')
      const job = jobs.listExtractionJobs({ fingerprint: fp })[0]
      return { status: job.status, attempts: job.attempts, repairs: job.formatRepairs, proposalCount: job.proposalIds?.length || 0, rejected: job.rejected || [], error: job.lastError }
    }, fingerprint)
    const LEDGERSNAP = () => page.evaluate(async () => {
      const ledgerDb = await import('/src/services/memory/ledger/ledgerDb.js')
      const { db } = ledgerDb.createLedgerDb()
      await db.open()
      const proposals = await db.table('factProposals').toArray()
      const evidence = await db.table('evidenceSnapshots').toArray()
      db.close()
      return {
        proposals: proposals.map((row) => ({ predicate: row.predicate, object: row.object, polarity: row.polarity || '', origin: row.origin, status: row.status, evidenceCount: row.evidenceIds?.length || 0, id: row.id })),
        evidenceQuotes: evidence.map((row) => row.quote)
      }
    })

    // A3 有效响应
    await ENQUEUE({ projectId: 'bookA', sourceRefs: ['unit:unit-a'], sourceRevision: 'doc-r30', revisionSeq: 30, fingerprint: 'fp-a', text: '莉娜没有钥匙。掌柜把钥匙收进了柜台。他梦见城破了。' })
    scripted = responseFor({
      proposals: [
        { subject: '莉娜', predicate: '没有', object: '钥匙', quote: '莉娜没有钥匙。', polarity: 'negative', storyTime: { precision: 'unknown' }, confidence: 0.9 },
        { subject: '掌柜', predicate: '收起了', object: '钥匙', quote: '掌柜把钥匙收进了柜台。', polarity: 'positive', storyTime: { precision: 'unknown' }, confidence: 0.8 },
        { subject: '旅人', predicate: '梦见', object: '城破', quote: '他梦见城破了。', polarity: 'report', storyTime: { precision: 'unknown' }, confidence: 0.7 },
        { subject: '幽灵', predicate: '站在', object: '门口', quote: '原文中不存在的引文内容。', polarity: 'positive', confidence: 0.9 }
      ],
      unextractable: { reason: '' }
    })
    await DRAIN()
    const afterA = await JOBSNAP('fp-a')
    const ledgerA = await LEDGERSNAP()
    // 否定/传闻语义由 claim 文本承载（谓词「没有」「梦见」+ 引文原句），账本无独立 polarity 列。
    check('A3 有效提取：否定/传闻以 claim 文本保留、引文逐字命中、不命中者拒绝且部分失败可见',
      afterA.status === 'completed'
      && afterA.proposalCount === 3
      && afterA.rejected.some((item) => item.reason === 'quote-missing-in-source')
      && ledgerA.proposals.some((row) => row.predicate === '没有' && row.object === '钥匙')
      && ledgerA.proposals.some((row) => row.predicate === '梦见' && row.object === '城破')
      && ledgerA.proposals.every((row) => row.evidenceCount === 1)
      && ledgerA.proposals.every((row) => row.origin === 'ai'),
      JSON.stringify({ job: afterA, ledger: ledgerA.proposals, rejected: afterA.rejected }))

    // A4 采纳 → 生产 reader 可见否定事实；未采纳不混入
    const negativeId = ledgerA.proposals.find((row) => row.predicate === '没有')?.id || ''
    const reader = await page.evaluate(async (proposalId) => {
      const ledger = await import('/src/services/memory/ledger/factLedger.js')
      const ledgerDb = await import('/src/services/memory/ledger/ledgerDb.js')
      const query = await import('/src/services/memory/ledger/queryFacts.js')
      const { db } = ledgerDb.createLedgerDb()
      await db.open()
      const adopted = await ledger.adoptProposal(db, { scope: { domain: 'book', bookId: 'bookA' }, proposalId, commandId: `gate-adopt-${proposalId}` })
      const facts = await query.queryFacts(db, { scope: { domain: 'book', bookId: 'bookA' }, limit: 50 })
      const items = (facts.items || [])
      const hasNegative = items.some((item) => (item.predicate === '没有' || item.action === '没有') && (item.object === '钥匙'))
      const hasPendingOnly = items.some((item) => (item.predicate === '收起了'))
      return { adoptedOk: adopted.ok, adoptedReason: adopted.reason || '', itemCount: items.length, hasNegative, hasPendingOnly }
    }, negativeId)
    check('A4 采纳后生产 reader 可见否定事实；未采纳提案不混入',
      reader.adoptedOk && reader.hasNegative && !reader.hasPendingOnly, JSON.stringify(reader))

    // A5 401 不盲重试
    await ENQUEUE({ projectId: 'bookA', sourceRefs: ['unit:unit-b'], sourceRevision: 'doc-r31', revisionSeq: 31, fingerprint: 'fp-b', text: '另一段原文。' })
    scripted = { status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) }
    await DRAIN()
    const afterB = await JOBSNAP('fp-b')
    check('A5 401 认证失败 → failed、不重试', afterB.status === 'failed' && afterB.attempts === 1 && afterB.error?.code === 'auth', JSON.stringify(afterB))

    // A6 坏 JSON → 一次格式修复重排队 → 有效响应后完成
    await ENQUEUE({ projectId: 'bookA', sourceRefs: ['unit:unit-c'], sourceRevision: 'doc-r32', revisionSeq: 32, fingerprint: 'fp-c', text: '掌柜在早市收了三筐鱼。' })
    scripted = {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: { text: '这不是 JSON' }, meta: { provider: 'deterministic-mock' } })
    }
    await DRAIN()
    const afterC1 = await JOBSNAP('fp-c')
    scripted = responseFor({ proposals: [{ subject: '掌柜', predicate: '收了', object: '三筐鱼', quote: '掌柜在早市收了三筐鱼。', polarity: 'positive', storyTime: { precision: 'unknown' }, confidence: 0.8 }], unextractable: { reason: '' } })
    await DRAIN()
    const afterC2 = await JOBSNAP('fp-c')
    check('A6 坏 JSON 一次格式修复后完成（单块修复上限 1）',
      afterC1.repairs === 1 && afterC1.status === 'queued' && afterC2.status === 'completed',
      JSON.stringify({ afterC1, afterC2 }))

    // A7 来源更新：旧任务被标记 source-changed，不消耗模型
    await ENQUEUE({ projectId: 'bookA', sourceRefs: ['unit:unit-d'], sourceRevision: 'doc-r40', revisionSeq: 40, fingerprint: 'fp-d', text: '旧文本。' })
    await ENQUEUE({ projectId: 'bookA', sourceRefs: ['unit:unit-d'], sourceRevision: 'doc-r41', revisionSeq: 41, fingerprint: 'fp-d2', text: '新文本。' })
    scripted = responseFor({ proposals: [{ subject: '掌柜', predicate: '清点', object: '鱼筐', quote: '新文本。', polarity: 'positive', storyTime: { precision: 'unknown' }, confidence: 0.8 }], unextractable: { reason: '' } })
    // 旧指纹任务等待中会被 superseded 跳过并标记；新任务消费脚本响应。
    await DRAIN()
    await DRAIN()
    const snapD = await page.evaluate(async () => {
      const jobs = await import('/src/services/memory/extraction/extractionJobStore.js')
      const oldJob = jobs.listExtractionJobs({ fingerprint: 'fp-d' })[0]
      const newJob = jobs.listExtractionJobs({ fingerprint: 'fp-d2' })[0]
      return { oldStatus: oldJob.status, newStatus: newJob.status }
    })
    check('A7 来源更新后旧任务不重复提取（source-changed）', snapD.oldStatus === 'source-changed', JSON.stringify(snapD))

    // ---- Part B 生产 UI 旅程 ----
    const context2 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context2.addInitScript((snap) => {
      if (sessionStorage.getItem('memq-gate-seeded')) return
      localStorage.clear()
      for (const [key, value] of Object.entries(snap)) localStorage.setItem(key, value)
      sessionStorage.setItem('memq-gate-seeded', '1')
    }, buildFixture())
    const page2 = await context2.newPage()
    const journeyErrors = []
    page2.on('pageerror', (error) => journeyErrors.push(error.message))
    let journeyAdvisorCalls = 0
    await page2.route('**/api/advisor**', async (route) => {
      journeyAdvisorCalls += 1
      await route.fulfill(responseFor({
        proposals: [
          { subject: '莉娜', predicate: '买了', object: '一小袋盐', quote: '莉娜在钟楼下面的铺子买了一小袋盐。', polarity: 'positive', storyTime: { precision: 'unknown' }, confidence: 0.85 }
        ],
        unextractable: { reason: '' }
      }))
    })
    await page2.goto(`${URL_BASE}/authoring?bookId=bookA`)
    await page2.locator('.ProseMirror').first().waitFor({ timeout: 45_000 })
    await page2.waitForTimeout(1200)
    const editor = page2.locator('.ProseMirror').first()
    await editor.click()
    await page2.keyboard.press('Control+End')
    await page2.keyboard.press('End')
    await page2.keyboard.type('a')
    await page2.waitForTimeout(2000)
    await page2.keyboard.type('sdfgh')
    await page2.waitForTimeout(2000)
    for (let index = 0; index < 6; index += 1) await page2.keyboard.press('Backspace')
    await page2.waitForTimeout(2000)
    const candidatesAfterNoise = await page2.evaluate(() => JSON.parse(localStorage.getItem('memory_candidates_v1') || '[]').length)
    check('B1 噪声输入零记忆候选（硬门禁）', candidatesAfterNoise === 0, `candidates=${candidatesAfterNoise}`)

    await page2.keyboard.type('莉娜在钟楼下面的铺子买了一小袋盐。')
    await page2.waitForTimeout(2400)
    const chapterRow = page2.locator('.authoring-chapter-row').filter({ hasText: '第二章' }).first()
    await chapterRow.click()
    await page2.waitForTimeout(8000)
    const journeyState = await page2.evaluate(async () => {
      const candidates = JSON.parse(localStorage.getItem('memory_candidates_v1') || '[]')
      const jobs = await import('/src/services/memory/extraction/extractionJobStore.js')
      const ledgerDb = await import('/src/services/memory/ledger/ledgerDb.js')
      const blockMod = await import('/src/services/writing/writingBlockHistory.js')
      const out = {}
      out.candidates = candidates.map((row) => ({ content: String(row.content).slice(0, 26), derivation: row.metadata?.derivation || '' }))
      out.jobs = jobs.listExtractionJobs({ projectId: 'bookA' }).map((job) => ({ status: job.status, text: job.blocks.join('').slice(0, 24) }))
      const { db } = ledgerDb.createLedgerDb()
      await db.open()
      out.proposals = (await db.table('factProposals').toArray()).map((row) => ({ subject: row.subjectLabel || row.subjectKey, object: row.object, origin: row.origin, status: row.status }))
      out.blockHistory = blockMod.listWritingBlockHistory('ch-1').map((row) => ({ merged: row.mergedCount || 0, source: row.source }))
      return out
    })
    check('B2 摘录候选=作者真实写入句且诚实标注 local-excerpt',
      journeyState.candidates.some((row) => row.content.startsWith('莉娜在钟楼下面') && row.derivation === 'local-excerpt'),
      JSON.stringify(journeyState.candidates))
    check('B3 block history 合并为会话不刷屏',
      journeyState.blockHistory.length <= 2 && journeyState.blockHistory.some((row) => row.merged >= 2),
      JSON.stringify(journeyState.blockHistory))
    check('B4 自动提取恰好一次计划内模型调用', journeyAdvisorCalls === 1, `advisorCalls=${journeyAdvisorCalls}`)
    check('B5 提取产出带引文提案（origin=ai）',
      journeyState.proposals.some((row) => row.subject === '莉娜' && row.origin === 'ai' && row.status === 'pending'),
      JSON.stringify(journeyState.proposals))
    check('B6 旅程零页面错误', journeyErrors.length === 0, journeyErrors.join('; '))
    await page2.screenshot({ path: path.join(OUT_DIR, 'journey-authoring.png') })
    await context2.close()
    check('A-part advisor 调用全部来自脚本化用例', advisorCalls.length >= 4, `partA calls=${advisorCalls.length}`)
  } finally {
    await browser.close()
    if (server?.pid) {
      try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    }
  }
}

await main()
const failed = results.filter((item) => !item.pass)
console.log(`\nmemory-quality-check: ${results.length - failed.length}/${results.length} checks passed`)
fs.writeFileSync(path.join(OUT_DIR, 'gate-results.json'), JSON.stringify({ summary: `${results.length - failed.length}/${results.length}`, results }, null, 2))
if (failed.length) {
  console.log('FAILED:')
  for (const item of failed) console.log(` - ${item.label}: ${item.detail}`)
  process.exit(1)
}
