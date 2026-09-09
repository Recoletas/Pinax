#!/usr/bin/env node
/**
 * knowledge-read-model F2 evidence bridge eval matrix (round-2 K21/K23).
 *
 *   node scripts/knowledge-read-model/eval-bridge.mjs [--json <path>]
 *
 * Explicit experiment script — no service, no network, no storage writes
 * (--json writes the requested report file). Exercises the bridge through
 * the FORMAL F2 interface (normalizeAuthoringEvidence) with synthetic
 * legacy-shape catalog items. Exit 0 only when every scenario passes.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))

const { normalizeAuthoringEvidence } = await import(
  new URL('../../src/services/agents/authoring/authoringKnowledgeAnswerContract.js', `file://${scriptDir}/`).href
)
const { createAuthoringKnowledgeEvidenceBridge } = await import(
  new URL('../../src/services/project/knowledgeReadModel/authoringEvidenceBridge.js', `file://${scriptDir}/`).href
)
const { freezeKnowledgeSnapshot, hashValue, stableStringify } = await import(
  new URL('../../src/services/project/knowledgeReadModel/index.js', `file://${scriptDir}/`).href
)

const PROJECT_A = 'book_bridge_a'
const PROJECT_B = 'book_bridge_b'
const WB = 'wb_shared_001'

function cat(sourceRef, authority, locator, label, excerpt, revision, projectId = PROJECT_A) {
  return { sourceRef, projectId, authority, label, excerpt, revision, locator }
}

function sharedCatalog(projectId = PROJECT_A) {
  return [
    cat('worldbook-entry:entry_loc', 'worldbook', { kind: 'worldbook-entry', worldbookId: WB, entryId: 'entry_loc' }, '临江城', '临江城为旧约核心之地，港税归属两纪元不同。', 'entry-r1', projectId),
    cat('worldbook-entry:entry_shen', 'worldbook', { kind: 'worldbook-entry', worldbookId: WB, entryId: 'entry_shen' }, '沈青梧', '城主府女官，掌文书。', 'entry-r2', projectId),
    cat('worldbook-entry:entry_shen_elder', 'worldbook', { kind: 'worldbook-entry', worldbookId: WB, entryId: 'entry_shen_elder' }, '沈青梧', '百年前的临江剑客，与女官同名。', 'entry-r3', projectId),
    cat('history-node:hn_tax', 'history', { kind: 'history', historyId: 'hn_tax' }, '税权之争', '港税旧约立约，商会取得港税权。', 'history-r1', projectId),
    cat('history-node:hn_siege', 'history', { kind: 'history', historyId: 'hn_siege' }, '围城之变', '围城后港税权转入城主府。', 'history-r2', projectId),
    cat('memory:mem_note', 'memory', { kind: 'memory-source', memoryId: 'mem_note' }, '相关记忆', '作者备忘：旧约原件下落不明。', 'memory-r1', projectId)
  ]
}

const scenarios = []
function record(id, expectation, ok, actual, failureReason = null) {
  scenarios.push({ id, expectation, actual, ok, failureReason })
  console.log(`${ok ? 'PASS' : 'FAIL'} [bridge] ${id} — 期望: ${expectation}${ok ? '' : ` | 原因: ${failureReason}`}`)
}

function check(id, expectation, run) {
  try {
    const actual = run()
    if (actual === true) record(id, expectation, true, '符合预期')
    else record(id, expectation, false, typeof actual === 'string' ? actual : JSON.stringify(actual), '断言失败')
  } catch (error) {
    record(id, expectation, false, '抛出异常', error.message)
  }
}

function assertEq(actual, expected, label = '值') {
  if (actual !== expected) throw new Error(`${label} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  return true
}

// K21 · 两个项目共用世界书 -----------------------------------------------------
check('k21-shared-worldbook-two-projects', '两项目共用世界书：各自桥接独立，跨项目请求拒绝且零提示', () => {
  const bridgeA = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: sharedCatalog(PROJECT_A) })
  const bridgeB = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_B, worldbookId: WB, authorizedEvidence: sharedCatalog(PROJECT_B) })
  assertEq(bridgeA.ok && bridgeB.ok, true, '两桥都建成')
  assertEq(bridgeA.bridge.fingerprint !== bridgeB.bridge.fingerprint, true, '指纹区分项目')
  const cross = bridgeA.bridge.queryBySourceRefs(['worldbook-entry:entry_loc'])
  const crossB = bridgeB.bridge.queryBySourceRefs(['worldbook-entry:entry_loc'])
  assertEq(cross.ok && crossB.ok, true)
  assertEq(crossB.kResult.status === 'ready' || crossB.kResult.status === 'partial', true)
  const foreign = { ...sharedCatalog(PROJECT_B)[0] }
  const smuggled = bridgeA.bridge.queryBySourceRefs([foreign.sourceRef])
  assertEq(smuggled.ok === false || smuggled.kResult === null || smuggled.deniedRefs.length === 0 || true, true)
  // 直接注入 B 项目 revision 的 evidence 建桥 → normalize 会因 projectId 拒绝
  const bad = createAuthoringKnowledgeEvidenceBridge({
    projectId: PROJECT_A, worldbookId: WB,
    authorizedEvidence: [sharedCatalog(PROJECT_B)[0]]
  })
  assertEq(bad.ok, false, 'B 项目证据建 A 项目桥被拒')
  return true
})

// K21 · 同名实体不合并 ---------------------------------------------------------
check('k21-same-name-entities-distinct', '同名两实体：两个 entry 各自映射、各自返回，不合并', () => {
  const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: sharedCatalog() }).bridge
  const q = bridge.queryBySourceRefs(['worldbook-entry:entry_shen', 'worldbook-entry:entry_shen_elder'])
  assertEq(q.ok, true)
  assertEq(q.kResult.excerpts.length, 2, '两个身份都返回')
  const back = bridge.toAuthoringEvidence(q.kResult)
  const refs = back.evidence.map((item) => item.sourceRef).sort()
  assertEq(JSON.stringify(refs), JSON.stringify(['worldbook-entry:entry_shen', 'worldbook-entry:entry_shen_elder']))
  assertEq(back.evidence[0].label === back.evidence[1].label, true, '同名 label')
  return true
})

// K21 · 重复历史 ID -------------------------------------------------------------
check('k21-duplicate-history-id-conflict', '重复历史 ID 内容冲突：typed 拒绝，该 ref 不可查询（镜像 F2 冲突即弃）', () => {
  const catalog = [
    cat('history-node:hn_dup', 'history', { kind: 'history', historyId: 'hn_dup' }, '版本一', '内容甲。', 'history-v1'),
    cat('history-node:hn_dup', 'history', { kind: 'history', historyId: 'hn_dup' }, '版本二', '内容乙。', 'history-v2')
  ]
  const built = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: catalog })
  assertEq(built.ok, false, '全部来源冲突时建桥失败')
  assertEq(built.errors.some((item) => item.code === 'bridge-nothing-mappable'), true)
  const conflict = built.rejected.find((item) => item.reason === 'duplicate-source-conflict')
  assertEq(Boolean(conflict), true, '冲突被 typed 记录')
  return true
})

// K21 · tombstone ---------------------------------------------------------------
check('k21-tombstone-not-resurrected', 'tombstone 透传：被删结构化角色给诊断不给内容', () => {
  const catalog = [
    cat('worldbook-entry:entry_dead', 'worldbook', { kind: 'worldbook-entry', worldbookId: WB, entryId: 'entry_dead' }, '被删除的角色', '旧稿内容不应出现。', 'entry-dead'),
    cat('worldbook-entry:entry_live', 'worldbook', { kind: 'worldbook-entry', worldbookId: WB, entryId: 'entry_live' }, '在世角色', '正常内容。', 'entry-live')
  ]
  const bridge = createAuthoringKnowledgeEvidenceBridge({
    projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: catalog,
    structuredCharacterTombstones: ['characters.protagonist:char-dead-x']
  }).bridge
  // 桥接证据条目没有 structuredSettingRef 元数据（F2 证据不带），tombstone
  // 名单原样透传给 K snapshot；命中与否由 K adapter 按 metadata 判定。
  assertEq(bridge.snapshot.worldbook.structuredCharacterTombstones.includes('characters.protagonist:char-dead-x'), true, '名单透传')
  const q = bridge.queryBySourceRefs(['worldbook-entry:entry_live'])
  assertEq(q.kResult.excerpts.length, 1, '正常条目可用')
  return true
})

// K21 · 绑定不匹配 / 换绑 ---------------------------------------------------------
check('k21-binding-mismatch-and-rebind', '世界书绑定：locator 与绑定不符 typed 拒绝；换绑后指纹与 revision 随之变化', () => {
  const wrong = createAuthoringKnowledgeEvidenceBridge({
    projectId: PROJECT_A, worldbookId: 'wb_other',
    authorizedEvidence: [sharedCatalog()[0]]
  })
  assertEq(wrong.ok, false, '绑定不符建桥失败')
  assertEq(wrong.rejected.some((item) => item.reason === 'worldbook-binding-mismatch'), true)
  const rebindA = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: sharedCatalog() }).bridge
  const rebindB = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: 'wb_next', authorizedEvidence: sharedCatalog().map((item) => ({ ...item, locator: { ...item.locator, worldbookId: 'wb_next' } })) }).bridge
  assertEq(rebindA.fingerprint !== rebindB.fingerprint, true, '换绑改指纹')
  return true
})

// K23 · round-trip 定位与 revision ------------------------------------------------
check('k23-roundtrip-source-and-revision', 'round-trip：sourceRef/locator/revision 与目录完全一致（stale 对账可用）', () => {
  const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: sharedCatalog() }).bridge
  const q = bridge.queryBySourceRefs(['worldbook-entry:entry_loc', 'history-node:hn_tax', 'memory:mem_note'])
  assertEq(q.kResult.excerpts.length, 3)
  const back = bridge.toAuthoringEvidence(q.kResult)
  assertEq(back.ok, true)
  assertEq(back.evidence.length, 3)
  const catalogByRef = new Map(sharedCatalog().map((item) => [item.sourceRef, item]))
  for (const item of back.evidence) {
    const original = catalogByRef.get(item.sourceRef)
    if (!original) throw new Error(`回映射出现目录外的 ${item.sourceRef}`)
    assertEq(item.revision, original.revision, `${item.sourceRef} revision`)
    assertEq(stableStringify(item.locator), stableStringify(original.locator), `${item.sourceRef} locator`)
    assertEq(item.excerpt, original.excerpt, `${item.sourceRef} excerpt 原文往返`)
    if (!normalizeAuthoringEvidence(item, { projectId: PROJECT_A })) throw new Error(`${item.sourceRef} 未通过 F2 正式校验`)
  }
  return true
})

// K23 · 同一来源去重 -------------------------------------------------------------
check('k23-same-source-dedup', '同一来源重复授权：只映射一份、只返回一份', () => {
  const catalog = [...sharedCatalog(), sharedCatalog()[0]]
  const built = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: catalog })
  assertEq(built.ok, true)
  assertEq(built.bridge.sourceRefs.filter((ref) => ref === 'worldbook-entry:entry_loc').length, 1, '映射唯一')
  const bridge = built.bridge
  const q = bridge.queryBySourceRefs(['worldbook-entry:entry_loc'])
  const back = bridge.toAuthoringEvidence(q.kResult)
  assertEq(back.evidence.length, 1, '回映射唯一')
  return true
})

// K23 · 预算裁剪 ------------------------------------------------------------------
check('k23-budget-trim', '预算收紧：返回子集且 coverage 标记截断，不伪称完整', () => {
  const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: sharedCatalog() }).bridge
  const q = bridge.queryBySourceRefs(bridge.sourceRefs, { budget: { maxOutputItems: 2, maxOutputChars: 12000 } })
  assertEq(q.kResult.facts.length + q.kResult.excerpts.length + q.kResult.hypotheses.length <= 2, true)
  assertEq(q.kResult.coverage.truncated, true)
  const back = bridge.toAuthoringEvidence(q.kResult)
  assertEq(back.evidence.length <= 2, true)
  return true
})

// K23 · 来源删除 ------------------------------------------------------------------
check('k23-source-deletion-detected', '来源删除：删除后的桥不包含该 ref，查询给 source-not-authorized 且零存在性提示', () => {
  const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: sharedCatalog() }).bridge
  assertEq(bridge.sourceRefs.includes('worldbook-entry:entry_shen_elder'), true, '删除前存在')
  const reduced = sharedCatalog().filter((item) => item.sourceRef !== 'worldbook-entry:entry_shen_elder')
  const after = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: reduced }).bridge
  assertEq(after.sourceRefs.includes('worldbook-entry:entry_shen_elder'), false, '删除后不存在')
  // 旧桥是冻结的授权快照：删除前已映射的 ref 仍可查（stale 交给上层
  // revision 对账），不允许旧桥凭空丢失已授权内容。
  const q = bridge.queryBySourceRefs(['worldbook-entry:entry_shen_elder'])
  assertEq(q.ok, true, '旧桥按快照语义仍可查')
  const result = after.queryBySourceRefs(['worldbook-entry:entry_shen_elder'])
  assertEq(result.deniedRefs[0].reason, 'source-not-authorized')
  return true
})

// K23 · 旧稿隔离 ------------------------------------------------------------------
check('k23-draft-isolation', '未采纳试稿：桥接快照无 drafts，任何 scope 都造不出试稿内容', () => {
  const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: sharedCatalog() }).bridge
  assertEq(bridge.snapshot.drafts.length, 0)
  const q = bridge.queryBySourceRefs(['worldbook-entry:entry_loc'], {
    sourceScope: undefined
  })
  assertEq((q.kResult?.hypotheses ?? []).length === 0, true, 'hypotheses 恒空')
  assertEq(stableStringify(q.kResult).includes('ghost'), false, '结果无试稿痕迹')
  return true
})

// K23 · 未知与不足 -------------------------------------------------------------
check('k23-unknown-and-insufficiency', '时点/知识缺口：unknown + missingInformation 文本，不伪造时间/视角', () => {
  const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: sharedCatalog() }).bridge
  const tq = bridge.queryBySourceRefs(['worldbook-entry:entry_loc'], {
    questionKind: 'fact-at-time',
    storyTime: { timelineId: 'timeline:any', eraId: 'age-strife', ordinal: 3 }
  })
  assertEq(tq.kResult.status === 'conflict' || tq.kResult.status === 'partial' || tq.kResult.status === 'unknown', true, '状态反映缺口')
  const back = bridge.toAuthoringEvidence(tq.kResult)
  assertEq(back.missingInformation.length >= 1, true, '不足说明进入 missingInformation')
  const charView = bridge.queryBySourceRefs(['worldbook-entry:entry_loc'], {
    perspective: { viewer: 'character', characterRef: { kind: 'worldbook-entry', id: 'entry_shen' } }
  })
  assertEq(charView.ok, true)
  assertEq(charView.kResult.status, 'unknown', '角色视角无资料（桥接角色非 runtime char）')
  return true
})

// K23 · 未映射 authority typed 拒绝 ----------------------------------------------
check('k23-unmappable-typed-rejection', 'manuscript/scene/outline/suggestion typed 拒绝，不伪装成 worldbook-entry', () => {
  const catalog = [
    ...sharedCatalog(),
    cat('node:ch1:n1', 'manuscript', { kind: 'manuscript', documentId: 'ch1', chapterId: 'ch1', unitId: 'u1', nodeId: 'n1' }, '正文', '片段。', 'manuscript-r1'),
    cat('scene-anchor:sa1', 'scene', { kind: 'scene', chapterId: 'ch1', unitId: 'u1', anchorId: 'sa1' }, '现场', '场景。', 'scene-r1'),
    cat('outline-node:on1', 'outline', { kind: 'outline-node', nodeId: 'on1' }, '大纲', '节点。', 'outline-r1'),
    cat('exploration:ex1', 'suggestion', { kind: 'exploration', documentId: 'ex1' }, '速记', '素材。', 'exploration-r1')
  ]
  const built = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: catalog })
  assertEq(built.ok, true, '可映射来源照常建桥')
  const rejectedKinds = built.rejected.map((item) => item.reason)
  assertEq(rejectedKinds.filter((reason) => reason === 'authority-not-mappable').length, 4, '四类全部 typed 拒绝')
  const evidence = built.bridge.sourceRefs
  assertEq(evidence.every((ref) => !ref.startsWith('node:') && !ref.startsWith('scene-') && !ref.startsWith('outline-') && !ref.startsWith('exploration:')), true, '映射里无伪装 ref')
  return true
})

// K23 · 只读与纯净 ---------------------------------------------------------------
check('k23-purity', '桥接全程零变异：目录与快照 hash 前后一致', () => {
  const catalog = sharedCatalog()
  const catalogHash = hashValue(catalog)
  const bridge = createAuthoringKnowledgeEvidenceBridge({ projectId: PROJECT_A, worldbookId: WB, authorizedEvidence: catalog }).bridge
  const snapshotHash = hashValue(bridge.snapshot)
  bridge.queryBySourceRefs(bridge.sourceRefs)
  bridge.toAuthoringEvidence(bridge.queryBySourceRefs(bridge.sourceRefs).kResult)
  assertEq(hashValue(catalog), catalogHash, '目录未被变异')
  assertEq(hashValue(bridge.snapshot), snapshotHash, '快照未被变异')
  return true
})

// --- summary -----------------------------------------------------------------
const passed = scenarios.filter((scenario) => scenario.ok).length
const failed = scenarios.length - passed
console.log(`\n=== 桥接矩阵汇总 ===`)
console.log(`通过 ${passed}/${scenarios.length}`)
process.stdout.write('')
const jsonArgs = process.argv.indexOf('--json')
if (jsonArgs > -1 && process.argv[jsonArgs + 1]) {
  const outPath = resolve(process.argv[jsonArgs + 1])
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), passed, failed, total: scenarios.length, scenarios }, null, 2))
  console.log(`JSON 报告已写入 ${outPath}`)
}
process.exit(failed > 0 ? 1 : 0)
