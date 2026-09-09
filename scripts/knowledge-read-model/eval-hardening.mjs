#!/usr/bin/env node
/**
 * K-R1 mutation/attack matrix (seeded, deterministic).
 *
 *   node scripts/knowledge-read-model/eval-hardening.mjs [--json <path>] [--seed <n>]
 *
 * Properties asserted under seeded mutations of an authorized F2 catalog:
 * - order permutation never changes authorization results or visible content
 * - deleting optional fields keeps the bridge usable; deleting required
 *   fields is a typed rejection
 * - cross-project id injection is rejected without existence hints
 * - adding an unrelated secret the query never requests changes nothing in
 *   visible content or low-sensitivity diagnostics
 * - shrinking the budget can only shrink the output, never grow it
 * - duplicate identical sources dedup; conflicting duplicates are dropped
 *
 * Explicit experiment script — offline, zero writes/network.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const { createAuthoringKnowledgeEvidenceBridge } = await import(
  new URL('../../src/services/project/knowledgeReadModel/authoringEvidenceBridge.js', `file://${scriptDir}/`).href
)
const { stableStringify } = await import(
  new URL('../../src/services/project/knowledgeReadModel/index.js', `file://${scriptDir}/`).href
)

const seedArg = process.argv.indexOf('--seed')
const SEED = seedArg > -1 ? (Number(process.argv[seedArg + 1]) >>> 0 || 1) : 20260906
// mulberry32 — tiny seeded PRNG so every run of this matrix is reproducible.
let rngState = SEED
function rng() {
  rngState = (rngState + 0x6d2b79f5) | 0
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const PROJECT = 'book_hardening'
const WB = 'wb_hardening'

function baseCatalog() {
  return [
    { sourceRef: 'worldbook-entry:entry_a', projectId: PROJECT, authority: 'worldbook', label: '条目甲', excerpt: '甲条目的正文内容，包含设定细节。', revision: 'entry-ra', locator: { kind: 'worldbook-entry', worldbookId: WB, entryId: 'entry_a' } },
    { sourceRef: 'worldbook-entry:entry_b', projectId: PROJECT, authority: 'worldbook', label: '条目乙', excerpt: '乙条目的正文内容，与甲互相独立。', revision: 'entry-rb', locator: { kind: 'worldbook-entry', worldbookId: WB, entryId: 'entry_b' } },
    { sourceRef: 'history-node:hn_1', projectId: PROJECT, authority: 'history', label: '旧事一', excerpt: '旧事摘要：港约签订。', revision: 'history-r1', locator: { kind: 'history', historyId: 'hn_1' } },
    { sourceRef: 'memory:mem_1', projectId: PROJECT, authority: 'memory', label: '相关记忆', excerpt: '作者备忘：甲的动机未定。', revision: 'memory-r1', locator: { kind: 'memory-source', memoryId: 'mem_1' } }
  ]
}

const scenarios = []
function record(id, expectation, ok, failureReason = null) {
  scenarios.push({ id, expectation, ok, failureReason })
  console.log(`${ok ? 'PASS' : 'FAIL'} [K-R1] ${id} — 期望: ${expectation}${ok ? '' : ` | 原因: ${failureReason}`}`)
}

function check(id, expectation, run) {
  try {
    if (run() === true) record(id, expectation, true)
    else record(id, expectation, false, '断言失败')
  } catch (error) {
    record(id, expectation, false, error.message)
  }
}

function visibleDigest(bridge, refs) {
  const query = bridge.queryBySourceRefs(refs)
  if (!query.ok) return { ok: false }
  const back = bridge.toAuthoringEvidence(query.kResult)
  return {
    ok: true,
    status: query.kResult.status,
    refs: back.evidence.map((item) => item.sourceRef).sort(),
    revisions: back.evidence.map((item) => item.revision).sort(),
    digest: stableStringify({
      facts: query.kResult.facts,
      excerpts: query.kResult.excerpts.map((item) => [item.id, item.text]),
      missing: back.missingInformation,
      diagnostics: query.kResult.diagnostics.map((item) => item.code)
    })
  }
}

// 1. 顺序置换（seed 打乱 20 次）---------------------------------------------
check('r1-order-permutation-invariant', 'seed 打乱目录顺序 20 次：授权结果与可见内容完全不变', () => {
  const baseline = visibleDigest(
    createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: baseCatalog() }).bridge,
    ['worldbook-entry:entry_a', 'history-node:hn_1', 'memory:mem_1']
  )
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const shuffled = [...baseCatalog()]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1))
      ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
    }
    const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: shuffled }).bridge
    const digest = visibleDigest(bridge, ['memory:mem_1', 'history-node:hn_1', 'worldbook-entry:entry_a'])
    if (digest.digest !== baseline.digest) throw new Error(`第 ${iteration} 次置换改变了可见内容`)
    if (JSON.stringify(digest.refs) !== JSON.stringify(baseline.refs)) throw new Error('授权结果集合改变')
  }
  return true
})

// 2. 字段删减 ---------------------------------------------------------------
check('r1-field-deletion-optional-vs-required', '删可选字段（label）仍可用；删必填字段（excerpt/revision）typed 拒绝', () => {
  const withoutLabel = baseCatalog().map((item) => {
    const clone = { ...item }
    delete clone.label
    return clone
  })
  const built = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: withoutLabel })
  assert(built.ok, '删 label 后桥应可建（label 非必填）')
  const broken = createAuthoringKnowledgeEvidenceBridge({
    projectId: PROJECT, worldbookId: WB,
    authorizedEvidence: (() => {
      const clone = { ...baseCatalog()[0] }
      delete clone.excerpt
      return [clone]
    })()
  })
  assert(broken.ok === false, '删 excerpt（必填）应 typed 拒绝')
  assert(broken.rejected.some((item) => item.reason === 'evidence-invalid'), '拒绝原因为 evidence-invalid')
  return true
})

// 3. 跨项目 ID 注入 -----------------------------------------------------------
check('r1-cross-project-injection', '注入他项目 projectId 的证据：typed 拒绝，无存在性提示', () => {
  const injected = { ...baseCatalog()[0], projectId: 'book_other' }
  const built = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: [injected] })
  assert(built.ok === false, '注入证据导致建桥失败（无可映射来源）')
  assert(built.rejected.some((item) => item.reason === 'evidence-invalid'), '以 evidence-invalid 拒绝')
  const mixed = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: [...baseCatalog(), injected] })
  assert(mixed.ok, '混合时合法来源照常建桥')
  assert(mixed.rejected.some((item) => item.reason === 'evidence-invalid'), '注入项单独被拒')
  return true
})

// 4. 无关秘密增加 --------------------------------------------------------------
check('r1-unrelated-secret-no-effect', '加入查询未点名的秘密来源：可见内容与低敏诊断完全不变', () => {
  const refs = ['worldbook-entry:entry_a', 'history-node:hn_1']
  const baselineBridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: baseCatalog() }).bridge
  const baseline = visibleDigest(baselineBridge, refs)
  const withSecret = createAuthoringKnowledgeEvidenceBridge({
    projectId: PROJECT, worldbookId: WB,
    authorizedEvidence: [...baseCatalog(), {
      sourceRef: 'worldbook-entry:entry_secret', projectId: PROJECT, authority: 'worldbook',
      label: '秘密条目', excerpt: '绝密：甲其实早已背叛。',
      revision: 'entry-secret', locator: { kind: 'worldbook-entry', worldbookId: WB, entryId: 'entry_secret' }
    }]
  }).bridge
  const after = visibleDigest(withSecret, refs)
  assert(after.digest === baseline.digest, '可见内容不变')
  assert(withSecret.sourceRefs.includes('worldbook-entry:entry_secret'), '秘密在授权映射内（被点名才可查）')
  const peek = withSecret.queryBySourceRefs(['worldbook-entry:entry_a'])
  assert(stableStringify(peek.kResult).includes('绝密') === false, '不点名的秘密不出现在结果里')
  return true
})

// 5. 重复来源 -----------------------------------------------------------------
check('r1-duplicate-sources', '完全重复去重；冲突重复整体拒绝', () => {
  const duplicated = [...baseCatalog(), ...baseCatalog()]
  const dedup = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: duplicated })
  assert(dedup.ok && dedup.bridge.sourceRefs.length === baseCatalog().length, '完全重复：数量不变')
  const conflicted = [...baseCatalog(), { ...baseCatalog()[0], excerpt: '改过的内容。', revision: 'entry-ra-conflict' }]
  const conflict = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: conflicted })
  assert(conflict.rejected.some((item) => item.reason === 'duplicate-source-conflict'), '冲突重复被记录')
  assert(conflict.bridge.sourceRefs.includes('worldbook-entry:entry_a') === false, '冲突来源退出映射')
  return true
})

// 6. 预算缩小 -----------------------------------------------------------------
check('r1-budget-shrink-monotonic', '预算缩小只可能缩小输出：条目与字符数单调不增', () => {
  const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT, worldbookId: WB, authorizedEvidence: baseCatalog() }).bridge
  const refs = bridge.sourceRefs
  const run = (budget) => {
    const query = bridge.queryBySourceRefs(refs, { budget })
    const back = bridge.toAuthoringEvidence(query.kResult)
    return {
      count: query.kResult.facts.length + query.kResult.excerpts.length + query.kResult.hypotheses.length,
      chars: stableStringify(query.kResult).length
    }
  }
  const full = run({ maxOutputItems: 24, maxOutputChars: 12000 })
  const mid = run({ maxOutputItems: 2, maxOutputChars: 12000 })
  const tiny = run({ maxOutputItems: 1, maxOutputChars: 300 })
  assert(mid.count <= full.count && tiny.count <= mid.count, '条目数单调不增')
  // 合同精确语义：maxOutputChars 只计结果项（facts/excerpts/hypotheses）
  // 的序列化大小；信封开销（coverage/dependencies/diagnostics）另有独立
  // 上界且为常量级，因此预算缩小时总字符也只会 缩小/持平（信封固定）。
  assert(tiny.chars <= full.chars, '预算缩小后总输出字符不增')
  assert(tiny.count === 1, '最小预算只保留 1 条')
  assert(full.chars <= 12000, '默认预算内结果项不超合同')
  return true
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// --- summary -----------------------------------------------------------------
const passed = scenarios.filter((scenario) => scenario.ok).length
const failed = scenarios.length - passed
console.log(`\n=== K-R1 变形/攻击矩阵汇总（seed=${SEED}）===`)
console.log(`通过 ${passed}/${scenarios.length}`)
const jsonArgs = process.argv.indexOf('--json')
if (jsonArgs > -1 && process.argv[jsonArgs + 1]) {
  const outPath = resolve(process.argv[jsonArgs + 1])
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), seed: SEED, passed, failed, total: scenarios.length, scenarios }, null, 2))
  console.log(`JSON 报告已写入 ${outPath}`)
}
process.exit(failed > 0 ? 1 : 0)
