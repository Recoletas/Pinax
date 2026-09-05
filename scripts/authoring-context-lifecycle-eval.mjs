import { buildNarrativeKernel } from '../src/services/agents/narrativeKernel.js'
import { buildAuthorOverrideCandidate } from '../src/services/agents/context/contextCandidateContract.js'
import { compileWritingContext } from '../src/services/agents/context/writingContextCompiler.js'
import {
  aggregateWritingFactIndexes,
  buildContinuitySummaryRequest,
  buildUnitFactIndex,
  commitContinuityProjection,
  queryWritingFacts
} from '../src/services/agents/context/writingFactIndex.js'
import { createContextRunBudget } from '../src/services/agents/context/contextRunBudget.js'
import { buildModelCallReceipt, reconcileManifestWithReceipt } from '../src/services/agents/context/contextReceipt.js'

const target = { projectId: 'book-eval', chapterId: 'chapter-5', unitId: 'unit-current' }

function candidate(id, overrides = {}) {
  return {
    id,
    kind: 'manuscript-unit',
    projectId: target.projectId,
    sourceAuthority: 'canonical-manuscript',
    narrativeStatus: 'fact',
    temporalRelation: 'before-target',
    scope: 'writing-unit',
    position: { chapterId: target.chapterId, unitId: id },
    sourceRefs: [`chapter:${target.chapterId}:${id}`],
    revision: `${id}-r1`,
    representations: { full: `正文事实 ${id}` },
    ...overrides
  }
}

const legalCandidates = [
  candidate('unit-before'),
  candidate('wb-rule', {
    kind: 'worldbook-entry',
    sourceAuthority: 'imported-reference',
    temporalRelation: 'atemporal',
    scope: 'project',
    sourceRefs: ['worldbook-entry:rule-star'],
    representations: { full: '移动石柱每次只能校准一颗星。' }
  })
]
const inlineManifest = compileWritingContext({ candidates: legalCandidates, target, profile: 'inline-fast' })
const narrativeManifest = compileWritingContext({ candidates: legalCandidates, target, profile: 'narrative-long' })
const inlineIds = inlineManifest.blocks.map((block) => block.candidateId).sort()
const narrativeIds = narrativeManifest.blocks.map((block) => block.candidateId).sort()
const kernel = buildNarrativeKernel({
  worldbook: {
    id: 'wb-eval',
    entries: [{ id: 'rogue-entry', name: '越权资料', type: 'lore', content: '不得进入 Kernel', keys: ['正文'] }]
  },
  projectId: target.projectId,
  messages: [{ id: 'turn-1', role: 'user', content: '继续写。' }],
  contextManifest: narrativeManifest
})
const kernelRefs = [...new Set(kernel.blocks.flatMap((block) => block.sourceRefs || []))]
const manifestRefs = [...new Set(narrativeManifest.blocks.flatMap((block) => block.sourceRefs || []))]
const ownership = {
  inlineIds,
  narrativeIds,
  kernelManifestRefs: manifestRefs.filter((ref) => kernelRefs.includes(ref)),
  rogueWorldbookSelected: kernelRefs.includes('worldbook-entry:rogue-entry')
}

const future = candidate('unit-future', {
  temporalRelation: 'after-target',
  representations: { full: '第十章揭晓的未来事实。' }
})
const futureExcluded = compileWritingContext({ candidates: [future], target, profile: 'narrative-long' })
const futureIntended = compileWritingContext({ candidates: [{ ...future, id: 'unit-future-pinned', pinned: true }], target, profile: 'narrative-long' })
const temporal = {
  excludedReason: futureExcluded.excluded.find((item) => item.candidateId === 'unit-future')?.reason,
  pinnedStatus: futureIntended.blocks[0]?.narrativeStatus,
  pinnedIntended: futureIntended.blocks[0]?.intendedReference
}

const importedClaim = candidate('claim-imported', {
  kind: 'worldbook-entry',
  sourceAuthority: 'imported-reference',
  temporalRelation: 'atemporal',
  sourceRefs: ['worldbook-entry:edgar-water'],
  claimKey: 'character:edgar:can-swim',
  claimType: 'state',
  representations: { full: '艾德加不会游泳。' }
})
const manuscriptClaim = candidate('claim-manuscript', {
  claimKey: 'character:edgar:can-swim',
  claimType: 'state',
  representations: { full: '艾德加会游泳。' }
})
const authorOverride = buildAuthorOverrideCandidate({
  id: 'claim-author',
  projectId: target.projectId,
  claimKey: 'character:edgar:can-swim',
  claimType: 'state',
  content: '本轮按作者设定：艾德加不会游泳。',
  revision: 'override-r1',
  sourceRefs: ['author-note:edgar-water'],
  overrideOf: 'claim-manuscript'
})
const manuscriptConflict = compileWritingContext({ candidates: [importedClaim, manuscriptClaim], target, profile: 'narrative-long' })
const auditConflict = compileWritingContext({ candidates: [importedClaim, manuscriptClaim], target, profile: 'narrative-long', taskKind: 'conflict-check' })
const overriddenConflict = compileWritingContext({ candidates: [importedClaim, authorOverride], target, profile: 'narrative-long' })
const conflicts = {
  manuscriptWinner: manuscriptConflict.blocks[0]?.candidateId,
  auditVisible: auditConflict.blocks.map((block) => block.candidateId).sort(),
  overrideWinner: overriddenConflict.blocks[0]?.candidateId
}

const exactFacts = [
  ['safe-code', '保险箱密码是 7319。', 'secret'],
  ['edgar-hand', '艾德加左手缺少小指。', 'identity'],
  ['star-rule', '穹顶每次只能亮起一颗星。', 'mechanism'],
  ['return-deadline', '莉娜日落前必须返回码头。', 'time'],
  ['key-location', '钥匙藏在北墙第三块砖后。', 'location']
].map(([claimKey, value, facet]) => ({ claimKey, value, facet, status: 'fact', evidenceRefs: [`chapter:${target.chapterId}:unit-facts`] }))
const unitFacts = buildUnitFactIndex({
  projectId: target.projectId,
  chapterId: target.chapterId,
  unitId: 'unit-facts',
  unitRevision: 'facts-r1',
  facts: exactFacts
})
const aggregateFacts = aggregateWritingFactIndexes({ projectId: target.projectId, chapterId: target.chapterId, indexes: [unitFacts] })
const summaryRequest = buildContinuitySummaryRequest({ aggregateIndex: aggregateFacts })
const projection = commitContinuityProjection({
  aggregateIndex: aggregateFacts,
  request: summaryRequest,
  result: { summary: '保险箱密码是 7319。', summarizedClaimKeys: ['safe-code'], facets: ['secret'] }
})
const factRetention = {
  queried: queryWritingFacts(projection, { claimKeys: exactFacts.map((fact) => fact.claimKey) }).length,
  total: exactFacts.length,
  knownOmissions: projection.summary.knownOmissions.length,
  evidenceComplete: projection.facts.every((fact) => fact.evidenceRefs.length > 0)
}

const runBudget = createContextRunBudget('inline-fast')
const estimatedCall = runBudget.recordCall({ inputChars: 100, outputChars: 20, phase: 'inline' })
const rejectedCall = runBudget.canStartCall({ inputChars: 10000, maxOutputTokens: 600 })
const budget = {
  estimatedSource: estimatedCall.source,
  cumulativeUsage: runBudget.usage,
  projectedOverrunAllowed: rejectedCall.allowed,
  tools: runBudget.limits.tools,
  summaries: runBudget.limits.summaries
}

const serializedBlocks = Object.fromEntries(narrativeManifest.blocks.map((block) => [block.candidateId, block.text]))
const receipt = buildModelCallReceipt({ manifest: narrativeManifest, serializedBlocks, callIndex: 0 })
const reconciliation = reconcileManifestWithReceipt(narrativeManifest, receipt)
const receipts = {
  callIndex: receipt.callIndex,
  entryCount: receipt.entries.length,
  actualChars: receipt.totalActualChars,
  tokenSource: receipt.tokens.source,
  reconciliation
}

const gates = {
  pipelinesAligned: JSON.stringify(inlineIds) === JSON.stringify(narrativeIds)
    && manifestRefs.every((ref) => kernelRefs.includes(ref))
    && !ownership.rogueWorldbookSelected,
  futureLeakBlocked: temporal.excludedReason === 'after-target-excluded'
    && temporal.pinnedStatus === 'intent'
    && temporal.pinnedIntended === true,
  conflictsResolved: conflicts.manuscriptWinner === 'claim-manuscript'
    && conflicts.auditVisible.length === 2
    && conflicts.overrideWinner === 'claim-author',
  summaryFactsRetained: factRetention.queried === factRetention.total
    && factRetention.knownOmissions === 4
    && factRetention.evidenceComplete,
  cumulativeBudgetEnforced: budget.estimatedSource === 'estimated'
    && !budget.projectedOverrunAllowed
    && budget.tools === false
    && budget.summaries === false,
  ledgerMatchesActual: receipts.callIndex === 0
    && receipts.entryCount === narrativeManifest.blocks.length
    && receipts.tokenSource === 'estimated'
    && receipts.reconciliation.length === 0
}

const result = {
  schemaVersion: 2,
  fixture: 'authoring-context-lifecycle.v2',
  ownership,
  temporal,
  conflicts,
  factRetention,
  budget,
  receipts,
  gates,
  passed: Object.values(gates).filter(Boolean).length,
  failed: Object.values(gates).filter((value) => !value).length
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (result.failed > 0 && process.argv.includes('--gate')) process.exitCode = 2
