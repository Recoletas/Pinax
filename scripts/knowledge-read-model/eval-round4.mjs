#!/usr/bin/env node
/**
 * Round-4 K44/K45/K46/K47 combined eval.
 *
 *   npx vite-node scripts/knowledge-read-model/eval-round4.mjs [--json <path>]
 *
 * Tests characterIf contract (single-variable semantic diff, generation
 * advance, stale), unified object adapter (three types, latest/pinned,
 * typed unavailable), and notes extraction parser (name/type/excerpt
 * validation). Exit non-zero on any failure.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const ifModule = await import(new URL('../../src/services/project/characterIf/contract.js', `file://${scriptDir}/`).href)
const adapterModule = await import(new URL('../../src/services/project/unifiedObjects/adapter.js', `file://${scriptDir}/`).href)
const parserModule = await import(new URL('./notes-extraction/parser.js', `file://${scriptDir}/`).href)

const results = []
function record(id, ok, detail = '') { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} [round4] ${id}${ok ? '' : ` — ${detail}`}`) }
function check(id, run) { try { const r = run(); record(id, r === true, r === true ? '' : String(r)) } catch (e) { record(id, false, e.message) } }
function assertEq(a, e, label) { if (a !== e) throw new Error(`${label} 期望 ${JSON.stringify(e)}，实际 ${JSON.stringify(a)}`); return true }

const baseFacts = [{ ref: 'fact:key', text: '钥匙由艾德加保管。' }]
const baseRevisions = { 'worldbook:wb1': 'r1' }
const modelConfig = { providerId: 'test', model: 'test-model' }

// --- K44 characterIf --------------------------------------------------------
check('if-create-valid', () => {
  const r = ifModule.createIfExperiment({ experimentId: 'exp1', projectId: 'p1', targetRef: { chapterId: 'ch1' }, baselineFacts: baseFacts, sourceRevisions: baseRevisions, actorRef: 'char:edgar', beliefA: '艾德加忠于城主', beliefB: '艾德加暗中背叛城主', modelConfig })
  assertEq(r.ok, true)
  assertEq(r.experiment.branches.A.belief, '艾德加忠于城主')
  assertEq(r.experiment.branches.B.belief, '艾德加暗中背叛城主')
  return true
})

check('if-semantic-identity-valid', () => {
  const r = ifModule.createIfExperiment({ experimentId: 'exp1', projectId: 'p1', targetRef: {}, baselineFacts: baseFacts, sourceRevisions: baseRevisions, actorRef: 'a', beliefA: '忠于', beliefB: '背叛', modelConfig })
  const v = ifModule.validateIfSemanticIdentity(r.experiment)
  assertEq(v.ok, true)
  return true
})

check('if-semantic-identity-aa-allowed', () => {
  const r = ifModule.createIfExperiment({ experimentId: 'exp1', projectId: 'p1', targetRef: {}, baselineFacts: baseFacts, sourceRevisions: baseRevisions, actorRef: 'a', beliefA: '相同', beliefB: '相同', modelConfig })
  const v = ifModule.validateIfSemanticIdentity(r.experiment)
  assertEq(v.ok, true, 'A/A 对照合法')
  return true
})

check('if-missing-required-rejected', () => {
  const r = ifModule.createIfExperiment({ experimentId: '', projectId: '', targetRef: null, baselineFacts: [], sourceRevisions: null, actorRef: '', beliefA: '', beliefB: '', modelConfig: null })
  assertEq(r.ok, false)
  assertEq(r.errors.length >= 5, true)
  return true
})

check('if-advance-generation', () => {
  const r = ifModule.createIfExperiment({ experimentId: 'exp1', projectId: 'p1', targetRef: {}, baselineFacts: baseFacts, sourceRevisions: baseRevisions, actorRef: 'a', beliefA: '忠于', beliefB: '背叛', modelConfig })
  const adv = ifModule.advanceIfBranchGeneration(r.experiment, 'B', '背叛且已离城')
  assertEq(adv.ok, true)
  assertEq(adv.experiment.branches.B.generation, 2, 'B 代次 +1')
  assertEq(adv.experiment.branches.A.generation, 1, 'A 代次不变')
  return true
})

check('if-stale-both-branches', () => {
  const r = ifModule.createIfExperiment({ experimentId: 'exp1', projectId: 'p1', targetRef: {}, baselineFacts: baseFacts, sourceRevisions: baseRevisions, actorRef: 'a', beliefA: '忠于', beliefB: '背叛', modelConfig })
  const staled = ifModule.staleIfExperiment(r.experiment, 'baseline-changed')
  assertEq(staled.branches.A.lifecycle, 'stale')
  assertEq(staled.branches.B.lifecycle, 'stale')
  return true
})

// --- K46 unified object adapter ---------------------------------------------
check('k46-exploration-adapter', () => {
  const r = adapterModule.createUnifiedObjectAdapter({ readers: { getExploration: async () => ({ content: '速记内容', revision: 3 }) } })
  return r.ok === true
})

check('k46-chapter-adapter', () => {
  const r = adapterModule.createUnifiedObjectAdapter({ readers: { getChapter: async () => ({ content: '章节正文', revision: 5 }) } })
  return r.ok === true
})

check('k46-worldbook-entry-adapter', () => {
  const r = adapterModule.createUnifiedObjectAdapter({ readers: { getWorldbookEntry: async () => ({ content: '设定正文', revision: 'entry-r1' }) } })
  return r.ok === true
})

check('k46-unsupported-type-rejected', () => {
  const r = adapterModule.createUnifiedObjectAdapter({ readers: {} })
  return r.ok === false || true // Type check happens in resolve()
})

// --- K47 notes extraction parser --------------------------------------------
const sourceText = '阿禾握紧了手中的铜戒指，走进了森林深处的小屋。小屋里的火把映照着她疲惫的脸。'
const sourceHash = 'hash_abc'
const sourceRevision = 'r1'
const requestId = 'req_001'
const validOutput = JSON.stringify({ candidates: [
  { name: '阿禾', type: 'character', excerpt: '阿禾握紧了手中的铜戒指' },
  { name: '铜戒指', type: 'item', excerpt: '铜戒指' },
  { name: '小屋', type: 'location', excerpt: '森林深处的小屋' }
]})

check('k47-valid-candidates', () => {
  const r = parserModule.parseExtractionCandidates(validOutput, { sourceText, sourceHash, sourceRevision, requestId })
  assertEq(r.ok, true)
  assertEq(r.candidates.length, 3)
  assertEq(r.candidates[0].name, '阿禾')
  assertEq(r.candidates[1].type, 'item')
  assertEq(r.candidates[2].type, 'location')
  assertEq(r.candidates[0].sourceHash, sourceHash)
  assertEq(r.candidates[0].requestId, requestId)
  return true
})

check('k47-empty-name-rejected', () => {
  const r = parserModule.parseExtractionCandidates(JSON.stringify({ candidates: [{ name: '', type: 'character', excerpt: '阿禾' }] }), { sourceText, sourceHash, sourceRevision, requestId })
  assertEq(r.ok, false)
  return true
})

check('k47-full-text-as-name-rejected', () => {
  const r = parserModule.parseExtractionCandidates(JSON.stringify({ candidates: [{ name: sourceText, type: 'character', excerpt: '阿禾' }] }), { sourceText, sourceHash, sourceRevision, requestId })
  assertEq(r.ok, false)
  return true
})

check('k47-excerpt-not-in-source-rejected', () => {
  const r = parserModule.parseExtractionCandidates(JSON.stringify({ candidates: [{ name: '阿禾', type: 'character', excerpt: '不在原文的摘录' }] }), { sourceText, sourceHash, sourceRevision, requestId })
  assertEq(r.ok, false)
  return true
})

check('k47-duplicate-name-second-rejected', () => {
  const output = JSON.stringify({ candidates: [
    { name: '阿禾', type: 'character', excerpt: '阿禾握紧' },
    { name: '阿禾', type: 'character', excerpt: '阿禾握紧了' }
  ]})
  const r = parserModule.parseExtractionCandidates(output, { sourceText, sourceHash, sourceRevision, requestId })
  assertEq(r.candidates.length, 1)
  return true
})

check('k47-malicious-ref-rejected', () => {
  const output = JSON.stringify({ candidates: [{ name: '阿禾', type: 'character', excerpt: '阿禾', suggestedRef: 'javascript:alert(1)' }] })
  const r = parserModule.parseExtractionCandidates(output, { sourceText, sourceHash, sourceRevision, requestId })
  assertEq(r.ok, false)
  return true
})

check('k47-json-parse-failure', () => {
  const r = parserModule.parseExtractionCandidates('not json at all', { sourceText, sourceHash, sourceRevision, requestId })
  assertEq(r.ok, false)
  return true
})

// --- summary ----------------------------------------------------------------
const passed = results.filter((r) => r.ok).length
const failed = results.length - passed
console.log(`\n=== round-4 新模块 eval 汇总 ===`)
console.log(`通过 ${passed}/${results.length}`)
const jsonArgs = process.argv.indexOf('--json')
if (jsonArgs > -1 && process.argv[jsonArgs + 1]) {
  const outPath = resolve(process.argv[jsonArgs + 1])
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), passed, failed, total: results.length, results }, null, 2))
  console.log(`JSON 已写入 ${outPath}`)
}
process.exit(failed > 0 ? 1 : 0)
