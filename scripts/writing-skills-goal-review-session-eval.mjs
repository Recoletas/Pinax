#!/usr/bin/env node
/* eslint-disable no-console */
// S04（助手写作 Skills 接入计划 §6.A）完成证据 eval：
// 已读范围可核查（coverage 计划/批次状态/报告），不把 Top-K 当全量
// （evidence 明示 top-k 检索来源、点名未授权来源如实列为 missing）。
// 同时验证作者目标+技能解析、显式选区 scope、风格消解三段接线，
// 以及不传新字段时既有校对 session 行为保持不变。
import {
  createAuthoringReviewSession,
  createAuthoringReviewBatchContext,
  markAuthoringReviewBatchStatus,
  resetAuthoringReviewCoverage,
  buildAuthoringReviewCoverageReport,
  summarizeAuthoringReviewCoverage,
  resolveAuthoringReviewStyleDirectives,
  collectLocalAuthoringProofingFindings
} from '../src/services/agents/authoring/authoringReviewSession.js'
import { createWritingDocument } from '../src/services/writing/writingDocumentSchema.js'

let failures = 0
function check(label, pass, detail = '') {
  if (!pass) failures += 1
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${!pass ? ` — ${String(detail).slice(0, 300)}` : ''}`)
}

const paragraphs = [
  '雾在黄昏时涨得最快，等莉娜数完第三盏航灯，码头石阶已经只剩顶端一线。',
  '抄表员的规矩是黄昏起雾时数航灯，灯亮一盏记一盏，灯灭一盏也记一盏。',
  '旧港的钟楼在雾里敲了七下，第七下拖得很长，像有人按住了钟舌。',
  '莉娜记得清清楚楚，钟楼的钟三年前就裂了，簿册上也早就把它除了名。',
  '更奇怪的是灯塔，塔顶的灯没有转，光柱直直指着海湾深处的黑石礁。',
  '有渔夫从雾里跑出来，嘴里反复念叨着石柱又亮了，根本没有看她一眼。',
  '莉娜跟着人群往旧港深处去，石柱立在税务所后的空场上，刻痕正在发亮。',
  '回家的路上她数了七次心跳，雾才重新合拢，只有抄表册上被她攥出的褶皱提醒她今晚不一样。'
]
const document = createWritingDocument(paragraphs.join('\n\n'))
const source = {
  projectId: 'eval-book',
  documentRole: 'manuscript',
  documentId: 'eval-ch-1',
  chapterId: 'eval-ch-1',
  documentRevision: '7',
  title: '魔力异常',
  document
}

function nodeIdsOf(session) {
  return session.windows.flatMap((window) => window.blocks.map((block) => block.nodeId))
}

// 1) 既有行为保持：不传新字段，session 照常可建，coverage 全 planned
const plain = createAuthoringReviewSession({ source, maxNodesPerWindow: 3, windowOverlap: 0 })
check('不传新字段时既有 session 照常可建', Boolean(plain?.windows?.length) && plain.goal === null)
check('默认 scope 为章级且窗口全部 planned',
  plain.coverage.scopeKind === 'chapter'
  && plain.coverage.windows.length === plain.windows.length
  && plain.coverage.windows.every((window) => window.status === 'planned'))

// 2) 作者目标 + 技能解析（精确版本，未知 fail closed）
const goalSession = createAuthoringReviewSession({
  source,
  maxNodesPerWindow: 3,
  windowOverlap: 0,
  goal: {
    text: '看主角为什么突然信任对方，别改台词。',
    skillId: 'motivation-causality',
    skillVersion: 1,
    invocationId: 'inv-eval-0001'
  }
})
check('目标与方法写入 session', goalSession.goal?.skill?.skillId === 'motivation-causality'
  && goalSession.goal?.skill?.skillVersion === 1 && goalSession.goal?.skill?.outputSchema === 'writing-skill-findings.v1')
check('未知 skillId 的 session 拒绝创建', createAuthoringReviewSession({
  source, goal: { text: 'x', skillId: 'no-such', skillVersion: 1 }
}) === null)
check('未知 skillVersion 的 session 拒绝创建', createAuthoringReviewSession({
  source, goal: { text: 'x', skillId: 'setup-payoff', skillVersion: 3 }
}) === null)
check('空目标文本拒绝', createAuthoringReviewSession({ source, goal: { text: '  ' } }) === null)

// 3) 显式选区 scope：窗口只覆盖点名的节点
const allNodeIds = nodeIdsOf(plain)
const scopeNodeIds = allNodeIds.slice(0, 2)
const scoped = createAuthoringReviewSession({
  source, maxNodesPerWindow: 3, windowOverlap: 0, scopeNodeIds
})
check('选区 scope 收窄窗口节点', nodeIdsOf(scoped).every((nodeId) => scopeNodeIds.includes(nodeId))
  && nodeIdsOf(scoped).length === 2 && scoped.coverage.scopeKind === 'selection')
check('coverage 区分 scope 字数与整章字数', scoped.coverage.totalChars < scoped.coverage.documentChars
  && plain.coverage.documentChars === scoped.coverage.documentChars)
check('不存在节点组成的 scope 拒绝建 session', createAuthoringReviewSession({
  source, scopeNodeIds: ['missing-node']
}) === null)

// 4) 批次状态推进与汇总语义
const windowIds = plain.coverage.windows.map((window) => window.windowId)
check('未开始汇总', summarizeAuthoringReviewCoverage(plain, { findingsCount: 0 }).status === 'not-started')
let working = markAuthoringReviewBatchStatus(plain, windowIds[0], 'completed')
working = markAuthoringReviewBatchStatus(working, windowIds[1], 'failed')
check('未知窗口 fail closed', markAuthoringReviewBatchStatus(plain, 'no-such-window', 'completed') === null)
check('非法状态 fail closed', markAuthoringReviewBatchStatus(plain, windowIds[0], 'applied') === null)
const inProgress = summarizeAuthoringReviewCoverage(working, { findingsCount: 2 })
check('仍有 planned 窗口时为 in-progress', inProgress.status === 'in-progress'
  && inProgress.prose.completed === 1 && inProgress.prose.failed === 1)
working = markAuthoringReviewBatchStatus(working, windowIds[2], 'skipped')
const partial = summarizeAuthoringReviewCoverage(working, { findingsCount: 2 })
check('收尾含失败/跳过 → partial', partial.status === 'partial'
  && partial.prose.completed === 1 && partial.prose.failed === 1 && partial.prose.skipped === 1)
check('partial 且零 finding 语义为材料不足', summarizeAuthoringReviewCoverage(working, { findingsCount: 0 }).outcome
  === 'partial-insufficient-coverage')
check('partial 且有 finding 语义保留', summarizeAuthoringReviewCoverage(working, { findingsCount: 4 }).outcome
  === 'partial-with-findings')
const reset = resetAuthoringReviewCoverage(working)
check('复位回 planned', reset.coverage.windows.every((window) => window.status === 'planned'))
let full = reset
for (const id of windowIds) full = markAuthoringReviewBatchStatus(full, id, 'completed')
check('全部完成 → clean-complete / complete-with-findings',
  summarizeAuthoringReviewCoverage(full, { findingsCount: 0 }).outcome === 'clean-complete'
  && summarizeAuthoringReviewCoverage(full, { findingsCount: 3 }).outcome === 'complete-with-findings')
check('已读字符按 completed 窗口累计可核查',
  summarizeAuthoringReviewCoverage(full).prose.readChars === full.coverage.totalChars
  && summarizeAuthoringReviewCoverage(working).prose.readChars < full.coverage.totalChars)

// 5) evidence 明示 Top-K、点名缺失来源如实呈报
const report = buildAuthoringReviewCoverageReport(full, {
  requestedSourceRefs: ['worldbook-entry:lighthouse', 'memory:missing-arc']
})
check('evidence 标注 top-k 检索而非全量', report.evidence.selectionBasis === 'top-k-retrieval')
const knownRef = (plain.allowedEvidenceRefs || [])[0]
check('点名但未授权的来源列入 missing', knownRef
  ? !report.evidence.missingRequested.includes(knownRef) && report.evidence.missingRequested.includes('memory:missing-arc')
  : report.evidence.missingRequested.includes('memory:missing-arc'), JSON.stringify(report.evidence))

// 6) 风格消解：显式约束 > 本书规则 > 方法默认
const directives = resolveAuthoringReviewStyleDirectives({
  bookRules: [{ dimension: 'pacing', directive: '本书节奏偏慢热。' }],
  invocationConstraints: [{ dimension: 'pacing', directive: '本次只看对话节奏。' }, { dimension: 'pov', directive: '别改台词。' }],
  methodDefaults: [{ dimension: 'pacing', directive: '默认检查重复句。' }, { dimension: '', directive: '缺维度跳过。' }]
})
check('同维度取高优先级并记录被覆盖来源',
  directives.find((item) => item.dimension === 'pacing')?.directive === '本次只看对话节奏。'
  && JSON.stringify(directives.find((item) => item.dimension === 'pacing')?.supersededSources) === JSON.stringify(['book-rule', 'method-default']))
check('低优先级新维度仍进入结果', directives.some((item) => item.dimension === 'pov' && item.source === 'invocation'))

// 7) 重叠窗口的字符覆盖必须按唯一节点计（验收反例：文档 830、旧算法读出 949）
const overlapped = createAuthoringReviewSession({ source, maxNodesPerWindow: 3, windowOverlap: 1 })
const overlappedWindowNodeEntries = new Map()
for (const window of overlapped.windows) {
  for (const block of window.blocks) {
    if (!overlappedWindowNodeEntries.has(block.nodeId)) overlappedWindowNodeEntries.set(block.nodeId, block.text.length)
  }
}
const uniqueChars = [...overlappedWindowNodeEntries.values()].reduce((sum, length) => sum + length, 0)
const naiveWindowChars = overlapped.windows.reduce((sum, window) => sum + window.usedChars, 0)
check('重叠窗口的 totalChars 按唯一节点计且不超过全文',
  overlapped.coverage.totalChars === uniqueChars
  && overlapped.coverage.totalChars < naiveWindowChars
  && overlapped.coverage.totalChars <= overlapped.coverage.documentChars,
  JSON.stringify({ total: overlapped.coverage.totalChars, uniqueChars, naive: naiveWindowChars, doc: overlapped.coverage.documentChars }))
check('uniqueNodeCount 与窗口节点一致', overlapped.coverage.uniqueNodeCount === overlappedWindowNodeEntries.size)
let overlappedWorking = overlapped
for (const window of overlapped.coverage.windows) {
  overlappedWorking = markAuthoringReviewBatchStatus(overlappedWorking, window.windowId, 'completed')
}
const overlappedReport = summarizeAuthoringReviewCoverage(overlappedWorking)
check('全部完成后 readChars 等于唯一字符总量且 documentRatio 不超过 1',
  overlappedReport.prose.readChars === uniqueChars
  && overlappedReport.prose.documentRatio <= 1
  && overlappedReport.prose.uniqueNodeRead === overlappedReport.prose.uniqueNodeCount,
  JSON.stringify(overlappedReport.prose))
check('部分完成时 readChars 只计已完成窗口的唯一节点', (() => {
  let half = overlapped
  half = markAuthoringReviewBatchStatus(half, overlapped.coverage.windows[0].windowId, 'completed')
  const report = buildAuthoringReviewCoverageReport(half)
  const firstWindowNodes = new Set(overlapped.coverage.windows[0].nodeIds)
  const expected = [...firstWindowNodes].reduce((sum, nodeId) => sum + (overlapped.coverage.nodeChars[nodeId] || 0), 0)
  return report.prose.readChars === expected && report.prose.documentRatio < 1
})())

// 8) 本地校对受冻结 scope 约束（验收反例：选第一段，第二段的错误不得上报）
const scopedProofDoc = createWritingDocument([
  '第一段完全干净，只有雾和灯光，没有任何本地可查的问题。',
  '她说：‘这话我只告诉你一个人。”然后收起册子。'
].join('\n\n'))
const scopedProofSource = { ...source, document: scopedProofDoc, documentId: 'eval-ch-scope', chapterId: 'eval-ch-scope' }
const proofNodes = (() => {
  const session = createAuthoringReviewSession({ source: scopedProofSource, maxNodesPerWindow: 3, windowOverlap: 0 })
  return session.windows.flatMap((window) => window.blocks.map((block) => block.nodeId))
})()
const unscopedProofSession = createAuthoringReviewSession({ source: scopedProofSource, maxNodesPerWindow: 3, windowOverlap: 0 })
const unscopedFindings = collectLocalAuthoringProofingFindings(unscopedProofSession)
check('不设 scope 时第二段引号错误如实上报', unscopedFindings.length >= 1)
const scopedProofSession = createAuthoringReviewSession({
  source: scopedProofSource, maxNodesPerWindow: 3, windowOverlap: 0,
  scopeNodeIds: [proofNodes[0]]
})
const scopedFindings = collectLocalAuthoringProofingFindings(scopedProofSession)
check('选区 scope 外的本地错误不上报', scopedFindings.length === 0, JSON.stringify(scopedFindings.map((f) => f.target.exact)))
check('scope 内正确定位仍然可用', (() => {
  const inner = createAuthoringReviewSession({
    source: scopedProofSource, maxNodesPerWindow: 3, windowOverlap: 0,
    scopeNodeIds: [proofNodes[1]]
  })
  return collectLocalAuthoringProofingFindings(inner).length >= 1
})())

// 9) 批次上下文携带目标/风格/覆盖位置
const batch = createAuthoringReviewBatchContext(goalSession, goalSession.windows[0].id)
check('批次上下文携带目标与风格', batch.goal?.skill?.skillId === 'motivation-causality'
  && Array.isArray(batch.styleDirectives))
check('批次上下文携带覆盖位置', batch.coverageWindow.index === 0 && batch.coverageWindow.total === goalSession.windows.length)

if (failures) {
  console.log(`writing-skills goal-review session eval: ${failures} 个失败`)
  process.exitCode = 1
} else {
  console.log('writing-skills goal-review session eval: 全部通过')
}
