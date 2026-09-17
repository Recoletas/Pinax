/* eslint-disable no-console */
// NC01：生产 UI 复现「随便打字母也进历史」的写入链。
// 在隔离 vite + 隔离 profile 中执行 a → asdfgh → 删除 → 中文短句 → 切章 → 刷新，
// 逐层记录增量：恢复副本 / 正文版本(block history+快照) / 记忆候选 / 记忆修订 /
// 事实账本(proposals·facts·decisions) / provider 请求。
// 本脚本是「修前反例」取证：只量化并报告，不做正确性断言；修后门禁见 memory-quality-check.mjs。
// 用法：node scripts/memory-quality-repro.mjs（自起隔离 vite）或 BASE=http://127.0.0.1:5317 …
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || ''
const PORT = Number(process.env.MEMQ_PORT || 5317)
const URL_BASE = BASE || `http://127.0.0.1:${PORT}`
const OUT_DIR = path.resolve(process.env.OUT_DIR || '/tmp/pinax-memq-20260917')
fs.mkdirSync(OUT_DIR, { recursive: true })

const now = Date.now()
const iso = new Date(now).toISOString()
const INITIAL_1 = '雨从傍晚开始就没有停过。旅人推开门，把湿透的斗篷挂在门边的铁钩上。\n\n掌柜从柜台后抬起头，把一盏油灯往桌边推了推。'
const INITIAL_2 = '清晨的早市挤满了收网回来的人。鱼贩把木桶排开，喊价声盖过了海浪。'

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

async function measure(page, label, providerCount) {
  const layers = await page.evaluate(async () => {
    const readJson = (key, fallback = []) => {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null')
        return Array.isArray(parsed) ? parsed : fallback
      } catch {
        return fallback
      }
    }
    const out = {}
    out.blockHistory = readJson('writing_block_history_v1')
    out.snapshots = readJson('writing_snapshots_v1')
    out.recoveryDrafts = readJson('writing_recovery_drafts_v1')
    const candidates = readJson('memory_candidates_v1')
    out.candidates = candidates
    try {
      const history = await import('/src/services/memory/memoryHistoryStore.js')
      const rows = await history.readMemoryHistory({})
      out.memoryHistoryRows = Array.isArray(rows) ? rows.length : -1
    } catch {
      out.memoryHistoryRows = -1
    }
    try {
      const { createLedgerDb } = await import('/src/services/memory/ledger/ledgerDb.js')
      const opened = createLedgerDb()
      if (opened.ok) {
        const { db } = opened
        await db.open()
        const count = async (name) => {
          try {
            return await db.table(name).count()
          } catch {
            return -1
          }
        }
        out.ledger = {
          proposals: await count('factProposals'),
          facts: await count('factVersions'),
          decisions: await count('factDecisions'),
          evidence: await count('evidenceSnapshots'),
          rejections: await count('rejectionMarks'),
          revisions: await count('revisions')
        }
        db.close()
      } else {
        out.ledger = { error: opened.reason }
      }
    } catch {
      out.ledger = { error: 'import-failed' }
    }
    return out
  }).catch((error) => ({ error: String(error.message || error).slice(0, 200) }))

  const summary = {
    label,
    blockHistory: Array.isArray(layers.blockHistory) ? layers.blockHistory.length : -1,
    snapshots: Array.isArray(layers.snapshots) ? layers.snapshots.length : -1,
    recoveryDrafts: Array.isArray(layers.recoveryDrafts) ? layers.recoveryDrafts.length : -1,
    candidates: Array.isArray(layers.candidates) ? layers.candidates.length : -1,
    candidateHeads: (Array.isArray(layers.candidates) ? layers.candidates : [])
      .slice(0, 6)
      .map((candidate) => `${candidate.status || '?'}:${String(candidate.content || '').slice(0, 18)}`),
    memoryHistoryRows: layers.memoryHistoryRows ?? -1,
    ledger: layers.ledger || {},
    providerRequests: providerCount(),
    blockHistorySources: (Array.isArray(layers.blockHistory) ? layers.blockHistory : [])
      .slice(0, 8)
      .map((entry) => entry.source || '?'),
    raw: layers
  }
  console.log(JSON.stringify(summary))
  return summary
}

const browser = await chromium.launch({ headless: true })
const server = await startVite()
const providerRequests = { count: 0 }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const fixture = buildFixture()
  await context.addInitScript((snap) => {
    if (sessionStorage.getItem('memq-seeded')) return
    localStorage.clear()
    for (const [key, value] of Object.entries(snap)) localStorage.setItem(key, value)
    sessionStorage.setItem('memq-seeded', '1')
  }, fixture)
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/api/**', async (route) => {
    providerRequests.count += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  }).catch(() => {})
  const providerCount = () => providerRequests.count

  await page.goto(`${URL_BASE}/authoring?bookId=bookA`)
  await page.locator('.ProseMirror').first().waitFor({ timeout: 45_000 })
  await page.waitForTimeout(1200)

  const timeline = []
  timeline.push(await measure(page, 'baseline', providerCount))

  const editor = page.locator('.ProseMirror').first()
  // 步骤 1：单个字母 a
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('End')
  await page.keyboard.type('a')
  await page.waitForTimeout(2200)
  timeline.push(await measure(page, 'after-a', providerCount))

  // 步骤 2：字母串 asdfgh
  await page.keyboard.type('sdfgh')
  await page.waitForTimeout(2200)
  timeline.push(await measure(page, 'after-asdfgh', providerCount))

  // 步骤 3：删除 asdfgh
  for (let index = 0; index < 6; index += 1) await page.keyboard.press('Backspace')
  await page.waitForTimeout(2200)
  timeline.push(await measure(page, 'after-delete', providerCount))

  // 步骤 4：中文短句
  await page.keyboard.type('莉娜在钟楼下面的铺子买了一小袋盐。')
  await page.waitForTimeout(2600)
  timeline.push(await measure(page, 'after-chinese', providerCount))

  // 步骤 5：切章（触发 boundary）；桌面端章节在左侧书架
  const chapterRow = page.locator('.authoring-chapter-row').filter({ hasText: '第二章' }).first()
  if (await chapterRow.count() && await chapterRow.isVisible()) {
    await chapterRow.click()
    await page.waitForTimeout(6500)
  } else {
    console.log('WARN chapter row not visible; waiting idle observer window')
    await page.waitForTimeout(6500)
  }
  timeline.push(await measure(page, 'after-chapter-switch', providerCount))

  // 步骤 6：刷新（真实浏览器刷新触发 beforeunload flush）
  await page.reload({ runBeforeUnload: true })
  await page.locator('.ProseMirror').first().waitFor({ timeout: 45_000 })
  await page.waitForTimeout(1500)
  timeline.push(await measure(page, 'after-reload', providerCount))

  const report = {
    generatedAt: new Date().toISOString(),
    base: 'c445dd4',
    steps: timeline,
    pageErrors: pageErrors.slice(0, 10),
    notes: []
  }
  const first = timeline[0]
  const last = timeline[timeline.length - 1]
  const delta = (key) => (last[key] ?? -1) - (first[key] ?? -1)
  report.notes.push(`blockHistory Δ=${delta('blockHistory')}（打字 4 步 + 切章 + 刷新）`)
  report.notes.push(`candidates Δ=${delta('candidates')}；候选内容：${JSON.stringify(last.candidateHeads)}`)
  report.notes.push(`memoryHistoryRows Δ=${delta('memoryHistoryRows')}`)
  report.notes.push(`providerRequests Δ=${delta('providerRequests')}（本地摘句应为 0）`)
  report.noiseVerdict = {
    asdfghCandidate: JSON.stringify(last.candidateHeads).includes('asdfgh') || JSON.stringify(timeline.map((item) => item.candidateHeads)).includes('asdfgh'),
    microEditHistoryFlood: delta('blockHistory') >= 3,
    providerCalls: last.providerRequests
  }
  fs.writeFileSync(path.join(OUT_DIR, 'repro.json'), JSON.stringify(report, null, 2))
  console.log('\n=== NC01 复现结论 ===')
  for (const note of report.notes) console.log(note)
  console.log(`noiseVerdict: ${JSON.stringify(report.noiseVerdict)}`)
  console.log(`pageErrors: ${pageErrors.length}`)
} finally {
  await browser.close()
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
  }
}
