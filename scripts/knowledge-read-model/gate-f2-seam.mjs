#!/usr/bin/env node
/**
 * Round-3 K gate: §2 portable combination probes for the F2 knowledge seam,
 * as a formal Gate (assertions; exit non-zero on ANY failure).
 *
 *   npx vite-node scripts/knowledge-read-model/gate-f2-seam.mjs [--json <path>]
 *
 * Fixtures are the frozen spec from the round-3 task book §2: in-memory
 * repositories, book=review-book, worldbook=review-world, entries key/other,
 * queryIntent=whole-book, question=钥匙, fixed now. The "off" probe compares
 * against the 05af532 main session captured below (deterministic: writing
 * document ids are content-hash derived, now is fixed).
 *
 * NOTE: probe 6 intentionally does NOT call page.evaluate/prepare from a
 * browser to replace click journeys (K34 owns the click Gate); this is the
 * offline combination-contract layer.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const { createAuthoringKnowledgeQuerySession } = await import(
  new URL('../../src/services/agents/authoring/authoringKnowledgeQuerySession.js', `file://${scriptDir}/`).href
)
const { createWritingDocument } = await import(
  new URL('../../src/services/writing/writingDocumentSchema.js', `file://${scriptDir}/`).href
)

const NOW = 1757289600000
const EXPECTED_OFF = Object.freeze({
  fingerprint: 'knowledge-session-jacfxk',
  evidence: [
    ['node:review-chapter-1:node-70ec2e6d', 'manuscript-ucrtiq'],
    ['worldbook-entry:key', 'entry-hrr0jc']
  ],
  projectRevision: 'knowledge-project-n5no4n',
  authorizationRefs: ['node:review-chapter-1:node-70ec2e6d', 'worldbook-entry:key'],
  authorizationMode: 'exact-read-only'
})

function buildRepositories() {
  return {
    getBook: async () => ({
      id: 'review-book', title: '评审用书', worldbookId: 'review-world',
      chapters: [{ id: 'review-chapter-1', title: '第一章', editorDocument: createWritingDocument('艾德加在钟楼下把钥匙交给莉娜。') }]
    }),
    getBoundWorldbook: async () => ({
      projectId: 'review-book', worldbookId: 'review-world',
      worldbook: {
        id: 'review-world',
        entries: [
          { id: 'key', name: '蓝铜钥匙', type: 'item', content: '旧港档案室的钥匙，艾德加保管多年，第二章后下落不明。' },
          { id: 'other', name: '旧港档案', type: 'location', content: '档案室位于钟楼地下，常年上锁。' }
        ]
      }
    }),
    listExplorations: async () => [],
    listOutlineNodes: async () => [],
    listOutlineEdges: async () => [],
    listMemories: async () => []
  }
}

const results = []
function record(id, ok, detail = '') {
  results.push({ id, ok, detail: String(detail).slice(0, 300) })
  console.log(`${ok ? 'PASS' : 'FAIL'} [gate] ${id}${ok ? '' : ` — ${detail}`}`)
}

async function probe(name, options) {
  const session = createAuthoringKnowledgeQuerySession({ repositories: buildRepositories(), maxEvidence: 12 })
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW, ...options
  })
  return prepared
}

function evidenceRefs(prepared) {
  return prepared.session.evidenceEnvelope.evidence.map((item) => item.sourceRef).sort()
}

// 1) normal：接缝 enabled、sourceRefs=[key]，只发布 key。
{
  const prepared = await probe('normal', {
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  })
  const ok = prepared.ok === true
    && prepared.session.knowledgeReadModel?.status === 'ready'
    && JSON.stringify(evidenceRefs(prepared)) === JSON.stringify(['worldbook-entry:key'])
  record('normal-only-key-published', ok, JSON.stringify(evidenceRefs(prepared)))
}

// 2) pre-abort：signal 已 abort → typed 终态失败，零证据发布。
{
  const controller = new AbortController()
  controller.abort()
  const prepared = await probe('pre-abort', {
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'], signal: controller.signal }
  })
  const ok = prepared.ok === false
    && prepared.reason === 'knowledge-read-model-aborted'
    && prepared.session === undefined
  record('pre-abort-typed-terminal', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason }))
}

// 3) zero-budget：items/chars 都 0 按合同属无效输入 → typed 拒绝。
{
  const prepared = await probe('zero-budget', {
    knowledgeReadModel: {
      enabled: true, sourceRefs: ['worldbook-entry:key'],
      budget: { maxOutputItems: 0, maxOutputChars: 0 }
    }
  })
  const ok = prepared.ok === false && typeof prepared.reason === 'string' && prepared.reason.startsWith('knowledge-read-model-')
  record('zero-budget-typed-rejection', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason }))
}

// 4) missing-required：required=[other]、requested=[key] → typed 拒绝。
{
  const prepared = await probe('missing-required', {
    requiredSourceRefs: ['worldbook-entry:other'],
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  })
  const ok = prepared.ok === false
    && prepared.reason === 'knowledge-read-model-required-source-not-requested'
  record('missing-required-typed-rejection', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason }))
}

// 5) required-tiny：required=requested=[key,other]，合法小预算 items=1/chars=1
//    → 必需来源无法容纳 → typed 拒绝（不能补回原文绕过，不能 ready 缺来源）。
{
  const prepared = await probe('required-tiny', {
    requiredSourceRefs: ['worldbook-entry:key', 'worldbook-entry:other'],
    knowledgeReadModel: {
      enabled: true, sourceRefs: ['worldbook-entry:key', 'worldbook-entry:other'],
      budget: { maxOutputItems: 1, maxOutputChars: 1 }
    }
  })
  const ok = prepared.ok === false
    && typeof prepared.reason === 'string'
    && prepared.reason.startsWith('knowledge-read-model-')
    && prepared.session === undefined
  record('required-tiny-typed-rejection', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason, refs: prepared.session ? evidenceRefs(prepared) : null }))
}

// 5b) required-fit-control：同引用、正常大预算 → ready 且两条都在（不回归）。
{
  const prepared = await probe('required-fit-control', {
    requiredSourceRefs: ['worldbook-entry:key', 'worldbook-entry:other'],
    knowledgeReadModel: {
      enabled: true, sourceRefs: ['worldbook-entry:key', 'worldbook-entry:other'],
      budget: { maxOutputItems: 12, maxOutputChars: 12000 }
    }
  })
  const refs = prepared.ok ? evidenceRefs(prepared) : []
  const ok = prepared.ok === true
    && prepared.session.knowledgeReadModel?.status === 'ready'
    && refs.includes('worldbook-entry:key')
    && refs.includes('worldbook-entry:other')
  record('required-fit-control-ready', ok, JSON.stringify(refs))
}

// 6) off：不传接缝参数 → 与 05af532 main 版规范化 session 全等。
{
  const prepared = await probe('off', {})
  let ok = prepared.ok === true && prepared.session.knowledgeReadModel === undefined
  const detail = []
  if (ok) {
    const s = prepared.session
    const actual = {
      fingerprint: s.fingerprint,
      evidence: s.evidenceEnvelope.evidence.map((item) => [item.sourceRef, item.revision]),
      projectRevision: s.projectRevision,
      authorizationRefs: (s.toolAuthorization?.sources ?? []).map((item) => item.sourceRef).sort(),
      authorizationMode: s.toolAuthorization?.mode ?? null
    }
    for (const key of Object.keys(EXPECTED_OFF)) {
      const same = JSON.stringify(actual[key]) === JSON.stringify(EXPECTED_OFF[key])
      if (!same) {
        ok = false
        detail.push(`${key}: 期望 ${JSON.stringify(EXPECTED_OFF[key])} 实际 ${JSON.stringify(actual[key])}`)
      }
    }
  } else {
    detail.push(`prepare 失败 ${prepared.reason ?? ''}`)
    ok = false
  }
  record('off-cross-version-identity', ok, detail.join('; ') || '与 05af532 main 全等')
}

// --- K33 终态/取消/降级边界矩阵 ---------------------------------------------

// 读取中取消：reader 挂起时 abort，完成后必须 typed aborted，不发布结果。
{
  let resolveBook
  const gate = new Promise((resolve) => { resolveBook = resolve })
  const repositories = buildRepositories()
  repositories.getBook = () => gate.then(() => repositories.__book)
  repositories.__book = await repositories.getBook ? null : null
  const real = buildRepositories()
  repositories.__book = await (async () => real.getBook())()
  const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })
  const controller = new AbortController()
  const pending = session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙',
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'], signal: controller.signal }
  })
  controller.abort()
  resolveBook()
  const prepared = await pending
  const ok = prepared.ok === false && prepared.reason === 'knowledge-read-model-aborted' && prepared.session === undefined
  record('cancel-during-read-terminal', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason }))
}

// 无绑定：book 无 worldbookId → 世界书来源不在授权目录 → typed 拒绝零提示。
{
  const repositories = buildRepositories()
  repositories.getBook = async () => {
    const book = await buildRepositories().getBook()
    return { ...book, worldbookId: '' }
  }
  const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙',
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  })
  const ok = prepared.ok === false
    && prepared.reason === 'knowledge-read-model-source-unauthorized'
    && prepared.session === undefined
  record('no-binding-typed-unauthorized', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason }))
}

// 不可映射：全部点名来源为 manuscript → typed 终态，不回退旧检索。
{
  const session = createAuthoringKnowledgeQuerySession({ repositories: buildRepositories(), maxEvidence: 12 })
  const base = await session.prepare({ projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW })
  const manuscriptRef = base.session.evidenceEnvelope.evidence.find((item) => item.authority === 'manuscript')?.sourceRef
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    knowledgeReadModel: { enabled: true, sourceRefs: [manuscriptRef] }
  })
  const ok = prepared.ok === false && prepared.reason === 'knowledge-read-model-no-mappable-source'
  record('unmappable-terminal-typed', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason }))
}

// 毒信号（访问即抛）= 内部故障 → 降级，且降级证据严格限于点名集合。
{
  const session = createAuthoringKnowledgeQuerySession({ repositories: buildRepositories(), maxEvidence: 12 })
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙',
    knowledgeReadModel: {
      enabled: true, sourceRefs: ['worldbook-entry:key'],
      signal: { get aborted() { throw new Error('poisoned') } }
    }
  })
  const refs = prepared.ok ? evidenceRefs(prepared) : []
  const ok = prepared.ok === true
    && prepared.session.knowledgeReadModel?.status === 'degraded'
    && JSON.stringify(refs) === JSON.stringify(['worldbook-entry:key'])
  record('poisoned-signal-degraded-in-scope', ok, JSON.stringify({ status: prepared.session?.knowledgeReadModel?.status, refs }))
}

// 绑定变化：换绑后 worldbook/history/scene 的 revision 对账被丢弃（既有机制仍生效）。
{
  const repositories = buildRepositories()
  const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })
  const prepared = await probeWithSession(session, 'worldbook-entry:key')
  const beforeRefs = Object.keys(await session.collectCurrentRevisions(prepared.session))
  repositories.getBoundWorldbook = async () => ({
    projectId: 'review-book', worldbookId: 'review-world-next',
    worldbook: { id: 'review-world-next', entries: [{ id: 'key', name: '蓝铜钥匙', type: 'item', content: '换绑后的内容。' }] }
  })
  repositories.getBook = async () => {
    const book = await buildRepositories().getBook()
    return { ...book, worldbookId: 'review-world-next' }
  }
  const after = await session.collectCurrentRevisions(prepared.session)
  const ok = beforeRefs.length > 0
    && Object.keys(after).length === 0
  record('binding-change-drops-revisions', ok, JSON.stringify({ before: beforeRefs.length, after: Object.keys(after).length }))
}

// 重复 ID × required：目录内冲突来源被弃 → required 引用 typed 拒绝零提示。
{
  const repositories = buildRepositories()
  repositories.getBoundWorldbook = async () => ({
    projectId: 'review-book', worldbookId: 'review-world',
    worldbook: {
      id: 'review-world',
      entries: [
        { id: 'dup', name: '甲版本', type: 'item', content: '内容甲。' },
        { id: 'dup', name: '乙版本', type: 'item', content: '内容乙，与甲冲突。' }
      ]
    }
  })
  const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    requiredSourceRefs: ['worldbook-entry:dup'],
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:dup'] }
  })
  // 目录层弃用冲突 ref 后，由 F2 既有 required 校验先行 typed 拒绝——
  // 这是正确层级（零内容零提示），接缝层无须也无权再给第二个理由。
  const ok = prepared.ok === false && prepared.reason === 'knowledge-required-source-missing'
  record('duplicate-id-x-required-typed', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason }))
}

async function probeWithSession(session, sourceRef) {
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    knowledgeReadModel: { enabled: true, sourceRefs: [sourceRef] }
  })
  if (!prepared.ok) throw new Error(`probeWithSession failed: ${prepared.reason}`)
  return prepared
}

// --- K35 接缝组合回归 -------------------------------------------------------

// 共用世界书：接缝请求只认本项目授权目录；他项目同名条目不存在于本项目。
{
  const repositories = buildRepositories()
  repositories.getBoundWorldbook = async () => ({
    projectId: 'review-book', worldbookId: 'review-world',
    worldbook: {
      id: 'review-world',
      entries: [{ id: 'shared', name: '共用条目（本项目版本）', type: 'item', content: '本项目内容。' }]
    }
  })
  const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:shared'] }
  })
  const ok = prepared.ok === true
    && JSON.stringify(evidenceRefs(prepared)) === JSON.stringify(['worldbook-entry:shared'])
    && prepared.session.evidenceEnvelope.evidence[0].excerpt.includes('本项目内容')
  record('k35-shared-worldbook-project-scoped', ok, JSON.stringify(prepared.ok ? evidenceRefs(prepared) : prepared.reason))
}

// 来源新增（无关条目）不改变接缝指纹；点名条目内容变化则必须改变。
{
  const session = createAuthoringKnowledgeQuerySession({ repositories: buildRepositories(), maxEvidence: 12 })
  const base = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  })
  const baseMarker = base.session.knowledgeReadModel
  const repositories2 = buildRepositories()
  repositories2.getBoundWorldbook = async () => ({
    projectId: 'review-book', worldbookId: 'review-world',
    worldbook: {
      id: 'review-world',
      entries: [
        { id: 'key', name: '蓝铜钥匙', type: 'item', content: '旧港档案室的钥匙，艾德加保管多年，第二章后下落不明。' },
        { id: 'other', name: '旧港档案', type: 'location', content: '档案室位于钟楼地下，常年上锁。' },
        { id: 'unrelated_new', name: '新增无关条目', type: 'item', content: '与本次查询无关的新条目。' }
      ]
    }
  })
  const session2 = createAuthoringKnowledgeQuerySession({ repositories: repositories2, maxEvidence: 12 })
  const afterAdd = await session2.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  })
  const stable = afterAdd.session.knowledgeReadModel.fingerprint === baseMarker.fingerprint
  const repositories3 = buildRepositories()
  repositories3.getBoundWorldbook = async () => ({
    projectId: 'review-book', worldbookId: 'review-world',
    worldbook: {
      id: 'review-world',
      entries: [
        { id: 'key', name: '蓝铜钥匙', type: 'item', content: '（作者已改写）钥匙被扔进海里。' },
        { id: 'other', name: '旧港档案', type: 'location', content: '档案室位于钟楼地下，常年上锁。' }
      ]
    }
  })
  const session3 = createAuthoringKnowledgeQuerySession({ repositories: repositories3, maxEvidence: 12 })
  const afterChange = await session3.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  })
  const changed = afterChange.session.knowledgeReadModel.fingerprint !== baseMarker.fingerprint
  const ok = stable && changed
  record('k35-scope-add-stable-change-invalidates', ok, JSON.stringify({ stable, changed }))
}

// liveSource（未保存正文）与接缝共存：live 校验失败仍整体 fail-closed。
{
  const session = createAuthoringKnowledgeQuerySession({ repositories: buildRepositories(), maxEvidence: 12 })
  const bad = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    liveSource: { projectId: 'review-book', role: 'manuscript', chapterId: 'review-chapter-1', documentId: 'mismatch', documentRevision: 'r1', document: createWritingDocument('正文') },
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  })
  record('k35-live-source-invalid-fail-closed', bad.ok === false && bad.reason === 'knowledge-live-source-invalid', JSON.stringify({ ok: bad.ok, reason: bad.reason ?? null }))
}

// 作者视角接缝不暴露视角参数：prepare 不接受 perspective——角色视角在接缝
// 路径上结构性地不可请求（仅作者视角）。
{
  const session = createAuthoringKnowledgeQuerySession({ repositories: buildRepositories(), maxEvidence: 12 })
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    perspective: { viewer: 'character', characterRef: { kind: 'worldbook-entry', id: 'key' } },
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  })
  const ok = prepared.ok === true
    && prepared.session.evidenceEnvelope.evidence.every((item) => item.authority !== 'character')
  record('k35-author-perspective-only', ok, '接缝无视角参数，结果恒为作者视角')
}

// --- K42 真实取消/焦点范围 ----------------------------------------------------

// 处理中途取消（计数信号翻转）：prepare 各阶段多次读取 signal，翻转后
// 必须终态 aborted 且零发布——不能只靠 provider 收到 abort。
{
  let signalReads = 0
  const midFlightSignal = { get aborted() { signalReads += 1; return signalReads > 3 } }
  const session = createAuthoringKnowledgeQuerySession({ repositories: buildRepositories(), maxEvidence: 12 })
  const prepared = await session.prepare({
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'], signal: midFlightSignal }
  })
  const ok = prepared.ok === false
    && prepared.reason === 'knowledge-read-model-aborted'
    && prepared.session === undefined
    && signalReads >= 3
  record('mid-processing-abort-zero-publish', ok, JSON.stringify({ ok: prepared.ok, reason: prepared.reason, signalReads }))
}

// 焦点单次消费（composable 层在单元用例覆盖）；此处验证会话层面同一
// 接缝请求重放：同一请求二次执行结果与指纹确定一致（无隐藏状态残留）。
{
  const session = createAuthoringKnowledgeQuerySession({ repositories: buildRepositories(), maxEvidence: 12 })
  const request = {
    projectId: 'review-book', queryIntent: 'whole-book', question: '钥匙', now: NOW,
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:key'] }
  }
  const first = await session.prepare(request)
  const second = await session.prepare(request)
  const ok = first.ok && second.ok
    && first.session.fingerprint === second.session.fingerprint
    && first.session.knowledgeReadModel.status === 'ready'
  record('seam-repeat-no-hidden-state', ok, JSON.stringify({ a: first.session?.fingerprint, b: second.session?.fingerprint }))
}

const passed = results.filter((item) => item.ok).length
const failed = results.length - passed
console.log(`\n=== gate-f2-seam 汇总 ===`)
console.log(`通过 ${passed}/${results.length}`)
const jsonArgs = process.argv.indexOf('--json')
if (jsonArgs > -1 && process.argv[jsonArgs + 1]) {
  const outPath = resolve(process.argv[jsonArgs + 1])
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), passed, failed, total: results.length, results }, null, 2))
  console.log(`JSON 报告已写入 ${outPath}`)
}
process.exit(failed > 0 ? 1 : 0)
