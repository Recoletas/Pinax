#!/usr/bin/env node
/**
 * K-D1 fault cross deepening: 36 seeded deterministic mutation/attack
 * combinations, verified against an INDEPENDENT oracle.
 *   node scripts/knowledge-read-model/eval-deepening.mjs [--json <path>] [--seed <n>]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const seedArg = process.argv.indexOf('--seed')
const SEED = seedArg > -1 ? (Number(process.argv[seedArg + 1]) >>> 0 || 20260908) : 20260908
const NOW = 1757289600000
const PROJECT = 'deepen-book'
const WB = 'deepen-world'
const ENTRY_IDS = ['entry_alpha', 'entry_beta', 'entry_gamma', 'entry_delta']
const FLAG_KEY = 'pinax_knowledge_read_model_enabled'

// Seed polyfill for Node (no browser localStorage)
const storageMap = new Map()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => { storageMap.set(k, String(v)) },
    removeItem: (k) => { storageMap.delete(k) },
    clear: () => storageMap.clear()
  }
}
if (typeof globalThis.window === 'undefined') { globalThis.window = globalThis }

const { createAuthoringKnowledgeQuerySession } = await import(
  new URL('../../src/services/agents/authoring/authoringKnowledgeQuerySession.js', `file://${scriptDir}/`).href
)
const { createWritingDocument } = await import(
  new URL('../../src/services/writing/writingDocumentSchema.js', `file://${scriptDir}/`).href
)

let rngState = SEED
function rng() {
  rngState = (rngState + 0x6d2b79f5) | 0
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function buildRepositories({ removeEntry, duplicateEntry }) {
  let entries = ENTRY_IDS.map((id, i) => ({
    id, name: `条目${i + 1}`, type: 'item',
    content: `条目${i + 1}的有界正文内容，用于深化交叉测试。包含关键词以便检索匹配。`
  }))
  if (duplicateEntry) {
    const orig = entries.find((e) => e.id === duplicateEntry)
    if (orig) entries.push({ ...orig, name: orig.name + '冲突', content: orig.content + '冲突文本。' })
  }
  if (removeEntry) entries = entries.filter((e) => e.id !== removeEntry)
  return {
    getBook: async () => ({
      id: PROJECT, title: '深化书', worldbookId: WB,
      chapters: [{ id: 'deepen-ch-1', title: '一', editorDocument: createWritingDocument('艾德加在钟楼下把钥匙交给莉娜。') }]
    }),
    getBoundWorldbook: async () => ({
      projectId: PROJECT, worldbookId: WB,
      worldbook: { id: WB, entries }
    }),
    listExplorations: async () => [],
    listOutlineNodes: async () => [],
    listOutlineEdges: async () => [],
    listMemories: async () => []
  }
}

// Generate 36 scenarios
const scenarios = []
for (let i = 0; i < 36; i++) {
  const r = () => rng()
  const budgetItems = r() < 0.25 ? 1 : r() < 0.5 ? 2 : r() < 0.75 ? 3 : 12
  const budgetChars = r() < 0.2 ? 1 : r() < 0.4 ? 100 : r() < 0.7 ? 2000 : 12000
  const reqN = Math.max(1, Math.min(4, Math.floor(r() * 4) + 1))
  const requested = ENTRY_IDS.slice(0, reqCountParam(reqN))
  const reqN2 = Math.min(reqN, Math.floor(r() * 4) + 1)
  const required = requested.slice(0, reqN2)
  const cancel = r() < 0.3 ? 'pre' : r() < 0.5 ? 'mid' : 'none'
  const mutR = r()
  const mutation = mutR < 0.15 ? 'remove' : mutR < 0.3 ? 'duplicate' : mutR < 0.4 ? 'no-binding' : 'none'
  scenarios.push({ id: `D1-${String(i + 1).padStart(2, '0')}`, budgetItems, budgetChars, requested, required, cancel, mutation })
}
function reqCountParam(n) { return n }

// Independent oracle
function oracle(sc) {
  let catalogIds = [...ENTRY_IDS]
  if (sc.mutation === 'remove') catalogIds = catalogIds.filter((id) => id !== 'entry_alpha')
  const catalogRefs = catalogIds.map((id) => `worldbook-entry:${id}`)
  if (sc.budgetItems <= 0 || sc.budgetChars <= 0) return { klass: 'typed-stop', zero: true }
  if (sc.requested.length === 0) return { klass: 'typed-stop', zero: true }
  const unauthorized = sc.requested.filter((ref) => !catalogRefs.includes(ref))
  if (unauthorized.length > 0) return { klass: 'typed-stop', zero: true }
  const missingRequired = sc.required.filter((ref) => !sc.requested.includes(ref))
  if (missingRequired.length > 0) return { klass: 'typed-stop', zero: true }
  if (sc.cancel !== 'none') return { klass: 'typed-aborted', zero: true }
  if (sc.mutation === 'no-binding') return { klass: 'typed-stop', zero: true }
  if (sc.mutation === 'duplicate') {
    // duplicated entry_alpha creates ambiguous catalog → both dropped → if required includes it, required missing
    if (sc.required.includes('worldbook-entry:entry_alpha')) return { klass: 'typed-stop', zero: true }
  }
  if (sc.budgetItems < sc.required.length) return { klass: 'typed-stop', zero: true }
  if (sc.budgetChars <= 1 && sc.required.length > 0) return { klass: 'typed-stop', zero: true }
  return { klass: 'success', zero: false }
}

const results = []
let mismatches = 0
let passCount = 0

for (const sc of scenarios) {
  const expected = oracle(sc)
  const repositories = buildRepositories({
    removeEntry: sc.mutation === 'remove' ? 'entry_alpha' : null,
    duplicateEntry: sc.mutation === 'duplicate' ? 'entry_alpha' : null
  })
  const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })
  const controller = new AbortController()
  if (sc.cancel === 'pre') controller.abort()
  const signal = sc.cancel !== 'none' ? controller.signal : undefined

  let outcome = false, reason = 'unknown', refs = []
  try {
    const prepared = await session.prepare({
      projectId: PROJECT, queryIntent: 'whole-book', question: '钥匙', now: NOW,
      requiredSourceRefs: sc.required,
      knowledgeReadModel: {
        enabled: true, sourceRefs: sc.requested,
        budget: { maxOutputItems: sc.budgetItems, maxOutputChars: sc.budgetChars },
        ...(signal ? { signal } : {})
      }
    })
    outcome = prepared.ok === true
    reason = prepared.ok ? 'ready' : prepared.reason
    refs = prepared.ok ? prepared.session.evidenceEnvelope.evidence.map((e) => e.sourceRef) : []
  } catch (e) {
    outcome = false; reason = e.message; refs = []
  }

  const refsZero = refs.length === 0
  let ok = false
  if (expected.klass === 'typed-stop') {
    ok = outcome === false && refsZero && (reason.startsWith('knowledge-') || reason === 'knowledge-required-source-missing')
  } else if (expected.klass === 'typed-aborted') {
    ok = outcome === false && refsZero && reason.includes('aborted')
  } else {
    ok = outcome === true && refs.every((ref) => sc.requested.includes(ref)) && refs.length <= sc.budgetItems
  }

  results.push({ id: sc.id, ok, expected: expected.klass, outcome, reason, refs })
  if (!ok) {
    mismatches += 1
    console.log(`FAIL [D1] ${sc.id} — expected=${expected.klass} outcome=${outcome} reason=${reason} refs=${JSON.stringify(refs)}`)
  }
}

const passed = results.filter((r) => r.ok).length
console.log(`\n=== K-D1 深化故障交叉汇总（seed=${SEED}）===`)
console.log(`通过 ${passed}/${results.length}`)
const jsonArgs = process.argv.indexOf('--json')
if (jsonArgs > -1 && process.argv[jsonArgs + 1]) {
  const outPath = resolve(process.argv[jsonArgs + 1])
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), seed: SEED, passCount, total: results.length, results }, null, 2))
  console.log(`JSON 已写入 ${outPath}`)
}
process.exit(mismatches > 0 ? 1 : 0)
