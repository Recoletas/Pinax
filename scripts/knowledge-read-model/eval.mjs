#!/usr/bin/env node
/**
 * knowledge-read-model offline eval matrix (K4).
 *
 *   node scripts/knowledge-read-model/eval.mjs [--json <path>]
 *
 * Explicit experiment script — NOT a Vitest suite, no service, no real
 * network, no storage writes (the only optional file write is the report
 * path given via --json). Exit code 0 only when every scenario passes and
 * the safety counters (storage writes / network calls) are zero.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(join(scriptDir, '..', '..'))
const modelDir = join(repoRoot, 'src', 'services', 'project', 'knowledgeReadModel')

// --- 1. purity guards (installed before any product code executes) ---------
const safety = {
  storageWrites: 0,
  networkCalls: 0
}
function installGuards() {
  const storageTrap = {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop)
      safety.storageWrites += 1
      return undefined
    },
    set() {
      safety.storageWrites += 1
      return true
    },
    deleteProperty() {
      safety.storageWrites += 1
      return true
    }
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() { return new Proxy({}, storageTrap) }
      })
    } catch { /* keep existing */ }
  }
  for (const name of ['indexedDB', 'caches']) {
    try {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() { throw new Error(`knowledge-read-model must not touch ${name}`) }
      })
    } catch { /* keep existing */ }
  }
  const originalFetch = globalThis.fetch?.bind(globalThis)
  globalThis.fetch = (...args) => {
    safety.networkCalls += 1
    return originalFetch?.(...args)
  }
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    try {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          safety.networkCalls += 1
          return function blocked() {}
        }
      })
    } catch { /* keep existing */ }
  }
}
installGuards()

// --- 2. product under test (pure ESM, safe to import after guards) ---------
const {
  freezeKnowledgeSnapshot,
  hashValue,
  queryKnowledge,
  stableStringify,
  KNOWLEDGE_LIMITS
} = await import(join(modelDir, 'index.js'))
const { isDeepFrozen } = await import(join(modelDir, 'contract.js'))
const { findCandidatesByName, buildAliasIndex } = await import(join(modelDir, 'identity.js'))
const { createKnowledgeScope } = await import(join(modelDir, 'query.js'))
const { createLegacySnapshotA, createLegacySnapshotB, LEGACY_FIXTURE_IDS: L } = await import(join(scriptDir, 'fixtures', 'legacySnapshot.js'))
const { createRichSnapshotA, RICH_FIXTURE_IDS: R } = await import(join(scriptDir, 'fixtures', 'richSnapshot.js'))

// --- 3. tiny scenario harness ---------------------------------------------
const scenarios = []
let scenarioCounter = 0

function record(id, category, expectation, actual, ok, failureReason = null) {
  scenarios.push({ id, category, expectation, actual, ok, failureReason })
  scenarioCounter += 1
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`${mark} [${category}] ${id} — 期望: ${expectation} | 实际: ${actual}${ok ? '' : ` | 原因: ${failureReason}`}`)
}

function check(id, category, expectation, run) {
  try {
    const actual = run()
    if (actual === true) {
      record(id, category, expectation, '符合预期', true)
    } else {
      record(id, category, expectation, typeof actual === 'string' ? actual : JSON.stringify(actual), false,
        typeof actual === 'string' ? actual : '断言失败')
    }
  } catch (error) {
    record(id, category, expectation, '抛出异常', false, error.message)
  }
}

function assertEq(actual, expected, label = '值') {
  if (actual !== expected) throw new Error(`${label} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  return true
}

function assertDeepEq(actual, expected, label = '结构') {
  if (stableStringify(actual) !== stableStringify(expected)) {
    throw new Error(`${label} 不一致：期望 ${stableStringify(expected)}，实际 ${stableStringify(actual)}`)
  }
  return true
}

function authRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    projectId: L.projectAId,
    entityRefs: [{ kind: 'worldbook-entry', id: L.entryLincheng }],
    questionKind: 'entity-context',
    perspective: { viewer: 'author' },
    ...overrides
  }
}

function freshLegacy() {
  return freezeKnowledgeSnapshot(createLegacySnapshotA())
}

function legacyFactsByIds(result) {
  return result.facts.map((fact) => fact.factId).sort()
}

// --- 4. scenarios -----------------------------------------------------------

// 身份 identity -------------------------------------------------------------
check('identity-exact-entry', '身份', '按 entryId 精确命中临江城条目', () => {
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  assertEq(result.coverage.resolvedEntities, 1)
  assertEq(result.excerpts.some((item) => item.id === `excerpt:worldbook-entry:${L.entryLincheng}`), true)
  return true
})

check('identity-same-name-no-merge', '身份', '同名三人（两个 entry + 一个 runtime）只给消歧候选，不合并', () => {
  const snapshot = freshLegacy()
  const aliasIndex = buildAliasIndex(snapshot)
  const candidates = findCandidatesByName('沈青梧', snapshot, aliasIndex)
  assertEq(candidates.entries.length, 2, '同名 entry 数')
  assertEq(candidates.runtimeCharacters.length, 1, '同名 runtime 角色数')
  const result = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'worldbook-entry', id: L.entryShenOfficial }]
  }), { snapshot })
  const shenExcerpts = result.excerpts.filter((item) => item.sourceKind === 'worldbook-entry')
  assertEq(shenExcerpts.length, 1, '返回的 entry 摘要数')
  assertEq(shenExcerpts[0].id, `excerpt:worldbook-entry:${L.entryShenOfficial}`)
  return true
})

check('identity-legacy-place-alias', '身份', '旧 place 字符串仅经显式映射解析到 entry_loc_001，且事实主体同链映射', () => {
  const snapshot = freshLegacy()
  const result = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'runtime-place', id: L.legacyPlaceId }]
  }), { snapshot })
  assertEq(result.coverage.resolvedEntities, 1, '解析数')
  assertEq(legacyFactsByIds(result).includes('fact_a_001'), true, 'place 主体事实命中')
  const entryExcerpt = result.excerpts.find((item) => item.sourceKind === 'worldbook-entry')
  assertEq(entryExcerpt?.id, `excerpt:worldbook-entry:${L.entryLincheng}`)
  return true
})

check('identity-legacy-place-unmapped', '身份', '无显式映射的旧地点保持 unresolved，不发明第三套地点 ID', () => {
  const result = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'runtime-place', id: 'place:wb_legacy_001:map_linjiang:site-nowhere' }]
  }), { snapshot: freshLegacy() })
  assertEq(result.coverage.unresolvedRefs.length, 1)
  assertEq(result.diagnostics.some((d) => d.code === 'legacy-alias-unmapped'), true)
  return true
})

check('identity-cross-project-ref-denied', '身份', '引用另一项目的实体整体拒绝，且不泄露任何内容/计数', () => {
  const result = queryKnowledge(authRequest({
    entityRefs: [
      { kind: 'worldbook-entry', id: L.entryLincheng },
      { kind: 'worldbook-entry', id: L.entryLincheng, projectId: L.projectBId }
    ]
  }), { snapshot: freshLegacy() })
  assertEq(result.status, 'denied')
  assertEq(result.facts.length + result.excerpts.length + result.coverage.requestedEntities, 0, '拒绝结果零内容零计数')
  assertDeepEq(result.diagnostics, [{ code: 'cross-project-ref' }])
  return true
})

check('identity-cross-project-request-denied', '身份', '请求自报其他 projectId → denied，零内容', () => {
  const result = queryKnowledge({ ...authRequest(), projectId: 'book_other_999' }, { snapshot: freshLegacy() })
  assertEq(result.status, 'denied')
  assertEq(result.facts.length + result.excerpts.length, 0)
  assertEq(result.coverage.requestedEntities, 0)
  return true
})

check('identity-tombstone-no-resurrection', '身份', '结构化角色 tombstone 不复活：给诊断不给内容', () => {
  const result = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'worldbook-entry', id: L.entryTombstoned }]
  }), { snapshot: freshLegacy() })
  assertEq(result.diagnostics.some((d) => d.code === 'tombstone-present'), true)
  assertEq(result.excerpts.length, 0, 'tombstone 条目零内容')
  return true
})

check('identity-missing-entry', '身份', '不存在的条目 entity-not-found，不猜测', () => {
  const result = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_ghost_999' }]
  }), { snapshot: freshLegacy() })
  assertEq(result.status, 'unknown')
  assertEq(result.diagnostics.some((d) => d.code === 'entity-not-found'), true)
  return true
})

// 来源 sources ---------------------------------------------------------------
check('source-prose-stays-excerpt', '来源', '世界书正文只作为 excerpt，不被拆成“已确认事实”', () => {
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  const entryExcerpt = result.excerpts.find((item) => item.sourceKind === 'worldbook-entry')
  assertEq(typeof entryExcerpt.text, 'string')
  assertEq(result.facts.every((fact) => fact.sourceKind === 'canonical-fact'), true)
  return true
})

check('source-research-claim-linked-and-stale-flag', '来源', '研究 claim 经 entry.metadata.claimIds 显式关联；stale claim 打标记', () => {
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  assertEq(result.excerpts.some((item) => item.id === 'excerpt:research-claim:C1'), true, 'C1 经临江城条目关联')
  const shenResult = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'worldbook-entry', id: L.entryShenOfficial }]
  }), { snapshot: freshLegacy() })
  assertEq(shenResult.excerpts.some((item) => item.id === 'excerpt:research-claim:C2'), true, 'C2 经沈青梧条目关联')
  assertEq(shenResult.diagnostics.some((d) => d.code === 'source-revision-stale'), true, 'stale 标记')
  return true
})

check('source-memory-explicit-ref-only', '来源', '记忆只能按显式 id 引用查询（v1.1）；不能借实体关联伪造归属', () => {
  const snapshot = freshLegacy()
  const byAssociation = queryKnowledge(authRequest({ sourceScope: { includeSources: ['worldbook-entry', 'canonical-fact', 'memory'] } }), { snapshot })
  assertEq(byAssociation.excerpts.some((item) => item.sourceKind === 'memory'), false, '实体查询不附带记忆')
  const explicit = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'memory', id: 'mem_001' }],
    sourceScope: { includeSources: ['worldbook-entry', 'canonical-fact', 'memory'] }
  }), { snapshot })
  const memoryItem = explicit.excerpts.find((item) => item.sourceKind === 'memory')
  if (!memoryItem) throw new Error('显式引用的记忆未返回')
  assertEq(memoryItem.id, 'excerpt:memory:mem_001')
  assertEq(explicit.coverage.resolvedEntities, 1, '精确解析')
  const inactive = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'memory', id: 'mem_002' }],
    sourceScope: { includeSources: ['memory'] }
  }), { snapshot })
  assertEq(inactive.excerpts.length, 0, '非 active 记忆不可查')
  assertEq(inactive.coverage.unresolvedRefs.length, 1)
  return true
})

check('source-draft-isolated-by-default', '来源', '未采纳试稿默认隔离：零 hypothesis、仅政策性计数', () => {
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  assertEq(result.hypotheses.length, 0)
  assertEq(result.coverage.excludedByPolicy.unadoptedDrafts, 1)
  assertEq(result.facts.every((fact) => fact.sourceKind !== 'unadopted-draft'), true)
  return true
})

check('source-draft-informal-only-when-allowed', '来源', '显式允许后试稿只进 hypotheses（非正式），永不升级为事实', () => {
  const result = queryKnowledge(authRequest({
    sourceScope: { includeUnadoptedDrafts: true, draftIds: [L.ghostDraftId] }
  }), { snapshot: freshLegacy() })
  assertEq(result.hypotheses.length, 1)
  assertEq(result.hypotheses[0].authority, 'informal')
  assertEq(result.facts.some((fact) => fact.sourceKind === 'unadopted-draft'), false)
  assertEq(result.diagnostics.some((d) => d.code === 'draft-informal-only'), true)
  return true
})

// 时间 time ------------------------------------------------------------------
check('time-legacy-undeclared-honest', '时间', 'legacy 无时间声明：fact-at-time 不伪造纪年，全部标记时间未知', () => {
  const result = queryKnowledge(authRequest({
    questionKind: 'fact-at-time',
    storyTime: { timelineId: 'timeline:any', eraId: 'age-strife', ordinal: 3 }
  }), { snapshot: freshLegacy() })
  assertEq(result.facts.every((fact) => fact.timeApplicability === 'unknown'), true)
  assertEq(result.coverage.timeUnknownCount, result.facts.length)
  assertEq(result.facts.every((fact) => !fact.validDuring), true)
  return true
})

check('time-rich-era-window', '时间', 'rich 纪元窗口：拓张纪元只命中商会事实；动荡纪元初商会事实仍有效（区间延续到 strife/1）且城主府 open 端生效', () => {
  const snapshot = freezeKnowledgeSnapshot(createRichSnapshotA())
  const expansion = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_loc_001' }],
    questionKind: 'fact-at-time',
    storyTime: { timelineId: R.timelineId, eraId: 'age-expansion' },
    perspective: { viewer: 'author' }
  }, { snapshot })
  assertDeepEq(expansion.facts.map((fact) => fact.factId), ['fact_r_taxguild'])
  const strife = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_loc_001' }],
    questionKind: 'fact-at-time',
    storyTime: { timelineId: R.timelineId, eraId: 'age-strife' },
    perspective: { viewer: 'author' }
  }, { snapshot })
  assertDeepEq(strife.facts.map((fact) => fact.factId).sort(), ['fact_r_taxguild', 'fact_r_taxmanor'], '动荡纪元事实')
  return true
})

check('time-half-open-boundaries', '时间', '半开区间边界：起点含、终点不含', () => {
  const snapshot = freezeKnowledgeSnapshot(createRichSnapshotA())
  const askAt = (eraId, ordinal) => queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_loc_001' }],
    questionKind: 'fact-at-time',
    storyTime: { timelineId: R.timelineId, eraId, ordinal },
    perspective: { viewer: 'author' }
  }, { snapshot })
  assertEq(askAt('age-expansion', 11).facts.some((fact) => fact.factId === 'fact_r_taxguild'), false, '起点前不含')
  assertEq(askAt('age-expansion', 12).facts.some((fact) => fact.factId === 'fact_r_taxguild'), true, '起点含')
  assertEq(askAt('age-strife', 1).facts.some((fact) => fact.factId === 'fact_r_taxguild'), false, '独占终点不含')
  assertEq(askAt('age-strife', 1).facts.some((fact) => fact.factId === 'fact_r_taxmanor'), true, 'open 端起点含')
  return true
})

check('time-unknown-end-not-open', '时间', 'unknown end ≠ open：起始早于窗口且终点未知 → 事实返回，但本窗口适用性计为未知', () => {
  const snapshot = freezeKnowledgeSnapshot(createRichSnapshotA())
  const result = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'runtime-character', id: R.runtimeShenId }],
    questionKind: 'fact-at-time',
    storyTime: { timelineId: R.timelineId, eraId: 'age-strife', ordinal: 50 },
    perspective: { viewer: 'author' }
  }, { snapshot })
  const secret = result.facts.find((fact) => fact.factId === 'fact_r_secret_alliance')
  if (!secret) throw new Error('秘密事实未返回')
  assertEq(secret.timeApplicability, 'evidenced', '证据存在（evidenced）')
  assertEq(result.coverage.timeUnknownCount >= 1, true, '窗口适用性未知计数')
  assertEq(result.diagnostics.some((d) => d.code === 'interval-end-unknown'), true, 'interval-end-unknown 诊断')
  assertEq(result.status === 'partial' || result.status === 'unknown', true, '状态反映时间缺口')
  return true
})

check('time-timeline-mismatch-unknown', '时间', '跨 timeline 查询不串纪年：诊断 timeline-mismatch，不给出该时间下的可用性断言', () => {
  const snapshot = freezeKnowledgeSnapshot(createRichSnapshotA())
  const result = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_loc_001' }],
    questionKind: 'fact-at-time',
    storyTime: { timelineId: 'timeline:elsewhere', eraId: 'age-strife', ordinal: 1 },
    perspective: { viewer: 'author' }
  }, { snapshot })
  assertEq(result.diagnostics.some((d) => d.code === 'timeline-mismatch'), true)
  assertEq(result.coverage.timeUnknownCount, result.facts.length, '时间问题整体不可答：coverage 记满')
  assertEq(result.status === 'partial' || result.status === 'unknown', true, '状态反映时间缺口')
  return true
})

check('time-author-revision-v1-current-only', '时间/版本', 'v1 只支持实际保存版本：旧作者版本 unsupported，当前版本可查', () => {
  const snapshot = freezeKnowledgeSnapshot(createRichSnapshotA())
  const stale = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_loc_001' }],
    questionKind: 'entity-context', authorRevision: 'rev_10'
  }, { snapshot })
  assertEq(stale.status, 'unsupported')
  assertEq(stale.diagnostics.some((d) => d.code === 'author-revision-unavailable'), true)
  assertEq(stale.facts.length + stale.excerpts.length, 0)
  const current = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_loc_001' }],
    questionKind: 'entity-context', authorRevision: 'rev_11'
  }, { snapshot })
  assertEq(current.status === 'ready' || current.status === 'partial', true)
  return true
})

check('time-manuscript-cutoff-unsupported-on-legacy', '时间/版本', 'legacy 无稿件版本 → manuscriptCutoff 一律 unsupported', () => {
  const result = queryKnowledge(authRequest({ manuscriptCutoff: 'ms_1' }), { snapshot: freshLegacy() })
  assertEq(result.status, 'unsupported')
  assertEq(result.diagnostics.some((d) => d.code === 'manuscript-cutoff-unavailable'), true)
  return true
})

// 视角 perspective -------------------------------------------------------------
check('perspective-author-sees-secret', '视角', '作者视角可见已授权秘密事实', () => {
  const result = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'runtime-character', id: R.runtimeShenId }],
    questionKind: 'entity-context'
  }, { snapshot: freezeKnowledgeSnapshot(createRichSnapshotA()) })
  assertEq(result.facts.some((fact) => fact.factId === 'fact_r_secret_alliance'), true)
  return true
})

check('perspective-informed-character-sees-secret', '视角', '被明确告知的白鹭可见秘密；私有条目对无依据者不可见', () => {
  const snapshot = freezeKnowledgeSnapshot(createRichSnapshotA())
  const bailu = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [
      { kind: 'runtime-character', id: R.runtimeShenId },
      { kind: 'worldbook-entry', id: R.entrySecretOrder }
    ],
    questionKind: 'entity-context',
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: R.runtimeBailuId } }
  }, { snapshot })
  assertEq(bailu.facts.some((fact) => fact.factId === 'fact_r_secret_alliance'), true, '白鹭知晓秘密')
  assertEq(bailu.excerpts.some((item) => item.id === `excerpt:worldbook-entry:${R.entrySecretOrder}`), false, '私有条目对白鹭不可见')
  const shen = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [
      { kind: 'runtime-character', id: R.runtimeShenId },
      { kind: 'worldbook-entry', id: R.entrySecretOrder }
    ],
    questionKind: 'entity-context',
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: R.runtimeShenId } }
  }, { snapshot })
  assertEq(shen.excerpts.some((item) => item.id === `excerpt:worldbook-entry:${R.entrySecretOrder}`), true, '沈青梧（成员依据）可见私有条目')
  return true
})

check('perspective-unaware-character-no-leak', '视角', '无依据的文行：秘密不可见，且不泄露数量/标题/ID', () => {
  const snapshot = freezeKnowledgeSnapshot(createRichSnapshotA())
  const result = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'runtime-character', id: R.runtimeShenId }],
    questionKind: 'entity-context',
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: R.runtimeUnawareId } }
  }, { snapshot })
  assertEq(result.facts.some((fact) => fact.factId === 'fact_r_secret_alliance'), false, '秘密不可见')
  const leaked = stableStringify(result).includes('secret-allegiance')
    || stableStringify(result).includes('fact_r_secret_alliance')
    || stableStringify(result).includes('密约残部')
  assertEq(leaked, false, '序列化结果不含秘密痕迹')
  assertEq(result.facts.some((fact) => fact.factId === 'fact_r_notemporal'), true, '公开事实可见')
  return true
})

check('perspective-legacy-unevidenced-not-negative', '视角', 'legacy 无知识依据：角色视角排除并标注 unrecorded，不冒称“他不知道”', () => {
  const snapshot = freshLegacy()
  const result = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'worldbook-entry', id: L.entryLincheng }],
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: L.runtimeShenId } }
  }), { snapshot })
  assertEq(result.facts.length, 0, '无依据不进入私有视角')
  assertEq(result.diagnostics.some((d) => d.code === 'character-knowledge-unrecorded'), true)
  const selfFacts = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'runtime-character', id: L.runtimeShenId }],
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: L.runtimeShenId } }
  }), { snapshot })
  assertDeepEq(legacyFactsByIds(selfFacts), ['fact_a_002'], '自身状态事实可见')
  return true
})

check('perspective-unknown-character', '视角', '不存在的视角角色 → unknown，不 fabricate', () => {
  const result = queryKnowledge(authRequest({
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: 'char_nobody' } }
  }), { snapshot: freshLegacy() })
  assertEq(result.status, 'unknown')
  assertEq(result.diagnostics.some((d) => d.code === 'perspective-entity-unknown'), true)
  return true
})

check('perspective-cross-project-denied', '视角', '视角角色引用另一项目 → denied', () => {
  const result = queryKnowledge(authRequest({
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: L.runtimeBailuId, projectId: L.projectBId } }
  }), { snapshot: freshLegacy() })
  assertEq(result.status, 'denied')
  return true
})

// 权限 permission --------------------------------------------------------------
check('perm-shared-worldbook-runtime-isolation', '权限', '共用世界书的两本书各自授权：B 看不到 A 的 runtime 事实', () => {
  const snapA = freshLegacy()
  const snapB = freezeKnowledgeSnapshot(createLegacySnapshotB())
  const fromA = queryKnowledge(authRequest(), { snapshot: snapA })
  const fromB = queryKnowledge({ ...authRequest(), projectId: L.projectBId }, { snapshot: snapB })
  assertDeepEq(legacyFactsByIds(fromA).filter((id) => id.startsWith('fact_a')), ['fact_a_001', 'fact_a_004'])
  assertDeepEq(legacyFactsByIds(fromB).filter((id) => id.startsWith('fact_a')), ['fact_a_001', 'fact_a_004'], 'B 有同构但独立的事实')
  assertEq(fromA.facts.find((fact) => fact.factId === 'fact_a_001').value, '商会', 'A 值')
  assertEq(fromB.facts.find((fact) => fact.factId === 'fact_a_001').value, '城主府', 'B 值不同')
  const fingerprintsDiffer = fromA.fingerprint !== fromB.fingerprint
  assertEq(fingerprintsDiffer, true, '指纹区分两本书')
  return true
})

check('perm-branch-mismatch-excludes-runtime', '权限', 'runtimeBranchId 与快照不符 → runtime 事实被排除（不报错不越权）', () => {
  const result = queryKnowledge(authRequest({
    sourceScope: { runtimeBranchId: 'branch_other' }
  }), { snapshot: freshLegacy() })
  assertEq(result.facts.length, 0)
  assertEq(result.diagnostics.some((d) => d.code === 'source-scope-excluded'), true)
  return true
})

check('perm-request-shape-cannot-escalate', '权限', '未知来源类型/未知字段 → 请求校验拒绝，不静默放宽', () => {
  const badKind = queryKnowledge(authRequest({
    sourceScope: { includeSources: ['worldbook-entry', 'secret-archive'] }
  }), { snapshot: freshLegacy() })
  assertEq(badKind.status, 'unsupported')
  const futureField = queryKnowledge({ ...authRequest({ entityRefs: [{ kind: 'worldbook-entry', id: L.entryLincheng, foo: 'bar' }] }) }, { snapshot: freshLegacy() })
  assertEq(futureField.status, 'unsupported', '未知 ref 字段被拒绝')
  const v2 = queryKnowledge({ ...authRequest(), schemaVersion: 2 }, { snapshot: freshLegacy() })
  assertEq(v2.status, 'unsupported')
  assertEq(v2.diagnostics.some((d) => d.code === 'schema-version-unsupported'), true)
  return true
})

// 冲突 conflicts ---------------------------------------------------------------
check('conflict-legacy-reported-not-absorbed', '冲突', '同主体同谓词矛盾事实：conflict 状态，双方都保留', () => {
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  assertEq(result.status, 'conflict')
  assertEq(result.conflicts.length, 1)
  assertEq(result.conflicts[0].values.length, 2)
  assertDeepEq(result.facts.filter((fact) => fact.predicate === 'controlled-by').map((fact) => fact.value), ['商会', '城主府'])
  return true
})

check('conflict-rich-disjoint-intervals-no-conflict', '冲突', 'rich 时间不重叠的同谓词事实不是冲突', () => {
  const result = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_loc_001' }],
    questionKind: 'entity-context'
  }, { snapshot: freezeKnowledgeSnapshot(createRichSnapshotA()) })
  assertEq(result.conflicts.length, 0)
  assertEq(result.status === 'ready', true)
  return true
})

check('conflict-disputed-not-confirmed-kept', '冲突', 'disputed 事实参与返回但不进冲突对、不冒充 confirmed', () => {
  const result = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'runtime-character', id: L.runtimeBailuId }]
  }), { snapshot: freshLegacy() })
  assertEq(result.status === 'ready' || result.status === 'partial', true)
  assertEq(result.facts.find((fact) => fact.factId === 'fact_a_003')?.status, 'disputed')
  assertEq(result.conflicts.length, 0)
  return true
})

// 因果 history-causes ----------------------------------------------------------
check('causes-explicit-edges-only', '因果', 'history-causes 只沿显式 leads-to 边，≤2 跳；环与孤儿分别报告', () => {
  const result = queryKnowledge(authRequest({
    questionKind: 'history-causes',
    entityRefs: [{ kind: 'geo-history-node', id: L.nodeHarbor }]
  }), { snapshot: freshLegacy() })
  assertEq(result.coverage.causalEdges.length >= 1, true, '显式因果边返回')
  assertEq(result.excerpts.every((item) => item.sourceKind === 'geo-history-node'), true)
  assertEq(result.diagnostics.some((d) => d.code === 'history-link-orphan'), true, '孤儿边报告')
  assertEq(result.diagnostics.some((d) => d.code === 'history-cycle-truncated'), true, '环报告')
  const textLabels = result.excerpts.filter((item) => item.causeLabels?.length > 0)
  assertEq(textLabels.length >= 1, true, 'causes 文本保留为标签而非遍历边')
  return true
})

// 生命周期 lifecycle -----------------------------------------------------------
check('lifecycle-cancel-before-start', '生命周期', '已取消的信号 → aborted，零内容发布', () => {
  const controller = new AbortController()
  controller.abort()
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy(), signal: controller.signal })
  assertEq(result.status, 'aborted')
  assertEq(result.facts.length + result.excerpts.length + result.hypotheses.length, 0)
  return true
})

check('lifecycle-cancel-midway', '生命周期', '中途取消 → aborted，不发布部分内容', () => {
  let checks = 0
  const signal = { get aborted() { checks += 1; return checks > 3 } }
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy(), signal })
  assertEq(result.status, 'aborted')
  assertEq(result.facts.length + result.excerpts.length, 0)
  return true
})

check('lifecycle-deterministic-output', '生命周期', '同输入两次查询结果与指纹完全一致', () => {
  const first = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  const second = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  assertEq(first.fingerprint, second.fingerprint)
  assertDeepEq(stableStringify(first), stableStringify(second))
  return true
})

check('lifecycle-new-conflict-invalidates', '生命周期', '新增矛盾事实改变有界范围 revision → 指纹变化', () => {
  const base = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  const mutated = createLegacySnapshotA()
  mutated.runtime.canonicalFacts.fact_new_001 = {
    subjectId: L.legacyPlaceId, predicate: 'gate-open', value: false, status: 'confirmed', sourceRefs: ['chapter:20']
  }
  const next = queryKnowledge(authRequest(), { snapshot: freezeKnowledgeSnapshot(mutated) })
  assertEq(next.dependencies.scopeRevisions.canonicalFacts !== base.dependencies.scopeRevisions.canonicalFacts, true)
  assertEq(next.fingerprint !== base.fingerprint, true)
  return true
})

check('lifecycle-unrelated-change-keeps-fingerprint', '生命周期', '无关条目变化不使本查询失效（有界范围）', () => {
  const base = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  const mutated = createLegacySnapshotA()
  const harbor = mutated.worldbook.entries.find((entry) => entry.id === L.entryHarbor)
  harbor.content = '临江港（内容更新，与查询实体无关）'
  harbor.metadata.updatedAt = 1700009999999
  const next = queryKnowledge(authRequest(), { snapshot: freezeKnowledgeSnapshot(mutated) })
  assertEq(next.fingerprint, base.fingerprint, '指纹稳定')
  return true
})

// 限制 limits -------------------------------------------------------------------
check('limits-entity-cap', '限制', '超过 8 个实体 → unsupported', () => {
  const refs = Array.from({ length: 9 }, (_, index) => ({ kind: 'worldbook-entry', id: `entry_x_${index}` }))
  const result = queryKnowledge({ ...authRequest({ entityRefs: refs }) }, { snapshot: freshLegacy() })
  assertEq(result.status, 'unsupported')
  assertEq(result.diagnostics.some((d) => d.code === 'entity-limit-exceeded'), true)
  return true
})

check('limits-truncation-reported', '限制', '预算内截断：coverage.truncated + 诊断，不伪称完整', () => {
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy(), budget: { maxOutputItems: 2, maxOutputChars: 12000 } })
  assertEq(result.coverage.truncated, true)
  assertEq(result.facts.length + result.excerpts.length + result.hypotheses.length <= 2, true)
  assertEq(result.diagnostics.some((d) => d.code === 'output-truncated'), true)
  return true
})

check('limits-budget-cannot-raise', '限制', '预算只能收紧不能放大：超上限 budget → denied', () => {
  const result = queryKnowledge(authRequest(), { snapshot: freshLegacy(), budget: { maxOutputItems: KNOWLEDGE_LIMITS.maxOutputItems + 1 } })
  assertEq(result.status, 'denied')
  assertEq(result.diagnostics.some((d) => d.code === 'context-invalid'), true)
  return true
})

// 兼容 compatibility -------------------------------------------------------------
check('compat-legacy-cannot-answer-secret', '兼容', 'legacy 存档诚实回答不了角色秘密（rich 能）——分开统计，不冒充', () => {
  const legacyResult = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'runtime-character', id: L.runtimeShenId }],
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: L.runtimeBailuId } }
  }), { snapshot: freshLegacy() })
  assertEq(legacyResult.facts.length, 0)
  assertEq(legacyResult.diagnostics.some((d) => d.code === 'character-knowledge-unrecorded'), true)
  const richResult = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'runtime-character', id: R.runtimeShenId }],
    questionKind: 'entity-context',
    perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: R.runtimeBailuId } }
  }, { snapshot: freezeKnowledgeSnapshot(createRichSnapshotA()) })
  assertEq(richResult.facts.some((fact) => fact.factId === 'fact_r_secret_alliance'), true)
  return true
})

check('compat-no-geohistory-safe', '兼容', '无 geoHistory 快照上做因果查询：只有条目摘要，无历史节点、不崩溃', () => {
  const result = queryKnowledge({
    schemaVersion: 1, projectId: R.projectId,
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_loc_001' }],
    questionKind: 'history-causes'
  }, { snapshot: freezeKnowledgeSnapshot(createRichSnapshotA()) })
  assertEq(result.excerpts.every((item) => item.sourceKind !== 'geo-history-node'), true)
  assertEq(result.coverage.causalEdges === undefined || result.coverage.causalEdges.length === 0, true)
  return true
})

// 纯净性 purity ------------------------------------------------------------------
check('purity-input-hash-invariant', '纯净性', '冻结与非冻结输入查询前后 hash 均不变（零变异）', () => {
  for (const [name, make] of [['legacy', createLegacySnapshotA], ['rich', createRichSnapshotA]]) {
    const frozen = make()
    const frozenHash = hashValue(frozen)
    freezeKnowledgeSnapshot(frozen)
    queryKnowledge(authRequest({
      questionKind: 'history-causes',
      entityRefs: [{ kind: 'runtime-place', id: L.legacyPlaceId }]
    }), { snapshot: frozen })
    if (hashValue(frozen) !== frozenHash) throw new Error(`${name} 冻结输入被变异`)
    const plain = make()
    const plainHash = hashValue(plain)
    const plainResult = queryKnowledge({
      schemaVersion: 1, projectId: name === 'legacy' ? L.projectAId : R.projectId,
      entityRefs: [{ kind: 'worldbook-entry', id: name === 'legacy' ? L.entryLincheng : 'entry_loc_001' }],
      questionKind: 'entity-context',
      storyTime: name === 'legacy' ? undefined : { timelineId: R.timelineId, eraId: 'age-strife', ordinal: 2 },
      perspective: { viewer: 'character', characterRef: { kind: 'runtime-character', id: name === 'legacy' ? L.runtimeBailuId : R.runtimeBailuId } }
    }, { snapshot: plain })
    if (hashValue(plain) !== plainHash) throw new Error(`${name} 非冻结输入被变异`)
    if (plainResult.status !== 'denied') throw new Error(`${name} 未冻结快照应被拒绝`)
  }
  return true
})

check('purity-no-storage-network-timers', '纯净性', '整个 eval 期间 storage 写入 0、真实网络调用 0', () => {
  assertEq(safety.storageWrites, 0, `storage 写入计数=${safety.storageWrites}`)
  assertEq(safety.networkCalls, 0, `网络调用计数=${safety.networkCalls}`)
  return true
})

check('purity-no-forbidden-imports', '纯净性', 'K 模块源码不引用存储/网络/activeWorldbook', () => {
  const files = readdirSync(modelDir).filter((name) => name.endsWith('.js'))
  const forbidden = ['localStorage', 'indexedDB', 'sessionStorage', 'XMLHttpRequest', 'worldStore', 'useStorage', 'setActiveWorldbook', 'document.cookie']
  for (const file of files) {
    const text = readFileSync(join(modelDir, file), 'utf8')
    for (const needle of forbidden) {
      if (text.includes(needle)) throw new Error(`${file} 含禁用引用 ${needle}`)
    }
  }
  return true
})

// 安全硬化（round-2 K22）--------------------------------------------------------
check('k22-output-budget-counts-full-item', '硬化', '输出预算按整条序列化计数：大字段撑不出超额输出', () => {
  const raw = createLegacySnapshotA()
  for (let i = 0; i < 10; i += 1) {
    raw.runtime.canonicalFacts['huge_' + i] = {
      subjectId: L.legacyPlaceId, predicate: 'x'.repeat(120), value: 'v' + i,
      status: 'confirmed', sourceRefs: Array.from({ length: 8 }, (_, j) => 'r'.repeat(159) + j)
    }
  }
  const result = queryKnowledge(authRequest({
    entityRefs: [{ kind: 'runtime-place', id: L.legacyPlaceId }]
  }), { snapshot: freezeKnowledgeSnapshot(raw) })
  assertEq(result.coverage.truncated, true, '预算触发截断')
  assertEq(stableStringify(result.facts).length <= KNOWLEDGE_LIMITS.maxOutputChars, true, '序列化总量不超预算')
  return true
})

check('k22-unfrozen-snapshot-rejected', '硬化', '未冻结快照被 typed 拒绝；模块不冻结也不克隆调用方对象', () => {
  const plain = createLegacySnapshotA()
  const direct = queryKnowledge(authRequest(), { snapshot: plain })
  assertEq(direct.status, 'denied')
  assertEq(direct.diagnostics.some((d) => d.code === 'snapshot-unfrozen'), true)
  assertEq(isDeepFrozen(plain), false, '调用方对象未被悄悄冻结')
  const scope = createKnowledgeScope(createLegacySnapshotB())
  assertEq(scope.ok, false)
  return true
})

check('k22-ordinal-cap-and-extremes', '硬化', '超大 ordinal 拒绝；0/负/超上限预算拒绝；1e6 边界可用', () => {
  const snapshot = freshLegacy()
  const huge = queryKnowledge(authRequest({
    questionKind: 'fact-at-time',
    storyTime: { timelineId: 'timeline:any', eraId: 'age-strife', ordinal: 9007199254740992 }
  }), { snapshot })
  assertEq(huge.status, 'unsupported', '2^53 ordinal 被拒')
  const edge = queryKnowledge(authRequest({
    questionKind: 'fact-at-time',
    storyTime: { timelineId: 'timeline:any', eraId: 'age-strife', ordinal: 1000000 }
  }), { snapshot })
  assertEq(edge.status === 'partial' || edge.status === 'conflict' || edge.status === 'ready' || edge.status === 'unknown', true, '1e6 边界可处理')
  for (const bad of [0, -5, KNOWLEDGE_LIMITS.maxOutputChars + 1]) {
    const r = queryKnowledge(authRequest(), { snapshot, budget: { maxOutputChars: bad } })
    assertEq(r.status, 'denied', '异常预算 denied: ' + bad)
  }
  return true
})

check('k22-unicode-and-long-refs', '硬化', 'Unicode id 精确匹配可用；超长 ref 请求被拒；指纹稳定', () => {
  const raw = createLegacySnapshotA()
  raw.worldbook.entries.push({
    id: 'entry_포션🧪', name: '포션🧪药水', content: 'Unicode 名称条目，含 emoji 与组合字符 é́。',
    keys: [], keysSecondary: [], type: 'item',
    injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
    relations: { tags: [], locations: [], characters: [], events: [] },
    metadata: { createdAt: 1, updatedAt: 2, reviewState: 'ready' }
  })
  const snapshot = freezeKnowledgeSnapshot(raw)
  const result = queryKnowledge({ ...authRequest(), entityRefs: [{ kind: 'worldbook-entry', id: 'entry_포션🧪' }] }, { snapshot })
  assertEq(result.coverage.resolvedEntities, 1, 'Unicode id 命中')
  assertEq(result.excerpts[0].title, '포션🧪药水')
  const longRef = queryKnowledge({ ...authRequest(), entityRefs: [{ kind: 'worldbook-entry', id: 'e'.repeat(161) }] }, { snapshot })
  assertEq(longRef.status, 'unsupported', '超长 id 请求被拒')
  return true
})

check('k22-diagnostic-budget-cap', '硬化', '诊断条目有硬上限，超量不泄露额外信息', () => {
  const refs = Array.from({ length: 8 }, (_, i) => ({ kind: 'worldbook-entry', id: 'entry_missing_' + i }))
  const result = queryKnowledge({ ...authRequest({ entityRefs: refs }), entityRefs: refs }, { snapshot: freshLegacy() })
  assertEq(result.coverage.requestedEntities, 8)
  assertEq(result.diagnostics.length <= KNOWLEDGE_LIMITS.maxDiagnosticEntries, true)
  const serialized = stableStringify(result)
  assertEq(serialized.includes('临江志'), false, '空结果不泄露世界书内容')
  return true
})

check('k22-new-claim-invalidates-scope', '硬化', '命中条目新增关联 claim → scope revision 与指纹变化；无关 claim 不影响', () => {
  const base = queryKnowledge(authRequest(), { snapshot: freshLegacy() })
  const mutated = createLegacySnapshotA()
  mutated.worldbook.research.claims.push({
    id: 'C3', type: 'history', text: '新增矛盾 claim：临江城从未有过港税旧约。',
    basis: 'research', sourceRefs: ['S1'], evidenceRefs: [], confidence: 0.3, status: 'ready'
  })
  const lincheng = mutated.worldbook.entries.find((entry) => entry.id === L.entryLincheng)
  lincheng.metadata.claimIds = [...(lincheng.metadata.claimIds ?? []), 'C3']
  const next = queryKnowledge(authRequest(), { snapshot: freezeKnowledgeSnapshot(mutated) })
  assertEq(next.fingerprint !== base.fingerprint, true, '新增关联 claim 改变指纹')
  const unrelated = createLegacySnapshotA()
  unrelated.worldbook.research.claims.push({
    id: 'C9', type: 'history', text: '无关条目的新 claim。', basis: 'research', sourceRefs: [], evidenceRefs: [], status: 'ready'
  })
  const harbor = unrelated.worldbook.entries.find((entry) => entry.id === L.entryHarbor)
  harbor.metadata.claimIds = ['C9']
  const keep = queryKnowledge(authRequest(), { snapshot: freezeKnowledgeSnapshot(unrelated) })
  assertEq(keep.fingerprint, base.fingerprint, '无关 claim 不改指纹')
  return true
})

// --- 5. summary -------------------------------------------------------------
const passed = scenarios.filter((scenario) => scenario.ok).length
const failed = scenarios.length - passed
const byCategory = {}
for (const scenario of scenarios) {
  byCategory[scenario.category] = byCategory[scenario.category] ?? { pass: 0, fail: 0 }
  byCategory[scenario.category][scenario.ok ? 'pass' : 'fail'] += 1
}

console.log('\n=== 汇总 ===')
console.log(`通过 ${passed}/${scenarios.length}`)
for (const [category, counts] of Object.entries(byCategory)) {
  console.log(`  ${category}: ${counts.pass} 通过 / ${counts.fail} 失败`)
}
console.log(`安全计数：storage 写入=${safety.storageWrites}，网络调用=${safety.networkCalls}`)
console.log('能力对照：legacy=现有存档形状；rich=拟议丰富形状（不代表现有数据）')

const jsonArgs = process.argv.indexOf('--json')
if (jsonArgs > -1 && process.argv[jsonArgs + 1]) {
  const outPath = resolve(process.argv[jsonArgs + 1])
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    passed,
    failed,
    total: scenarios.length,
    safety: { ...safety },
    byCategory,
    scenarios
  }, null, 2))
  console.log(`JSON 报告已写入 ${outPath}（显式请求的测试报告，非业务写入）`)
}

process.exit(failed > 0 || safety.storageWrites > 0 || safety.networkCalls > 0 ? 1 : 0)
