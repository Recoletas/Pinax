<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadWritingBooks } from '../../services/writing/writingBooksRepository'
import { listMemoryCandidates, confirmMemoryCandidate, rejectMemoryCandidate, updateMemoryCandidate } from '../../services/memory/memoryCandidates'
import { commitMemorySnapshot, flushMemoryHistory, readMemoryHistory, memoryHistoryHealth, historicalCandidatePatch } from '../../services/memory/memoryHistoryStore'
import { openLedgerDb, readLedgerHealth, closeLedgerDb } from '../../services/memory/ledger/ledgerDb'
import { adoptProposal, correctFact, retractFact, rejectProposal, reopenRejection, listProposals, listDecisionsPaged, listRejectionMarks, getFactHead } from '../../services/memory/ledger/factLedger'
import { queryFacts } from '../../services/memory/ledger/queryFacts'
import { describeInterval } from '../../services/memory/ledger/storyInterval'
import { listExtractionJobs, requeueExtractionJob } from '../../services/memory/extraction/extractionJobStore'
import { payloadHash } from '../../services/memory/ledger/ledgerContract'
import { previewLegacyMigration, migrateLegacyCandidate } from '../../services/memory/ledger/legacyMigration'
import { auditEvidenceCurrentness } from '../../services/memory/ledger/evidenceAudit'

const route = useRoute()
const books = loadWritingBooks()
const items = ref([])
const selectedScope = ref('')
const view = ref('activity')
const activity = ref([])
const activityError = ref('')
let activityGeneration = 0
async function refreshActivity() {
  const generation = ++activityGeneration
  activity.value = []
  activityError.value = ''
  if (!selectedScope.value) return
  try {
    const [scope, scopeId] = JSON.parse(selectedScope.value)
    const rows = await readMemoryHistory({ scope, scopeId })
    if (generation === activityGeneration) activity.value = rows
  } catch (cause) { if (generation === activityGeneration) activityError.value = cause.message }
}
watch([selectedScope, items], refreshActivity)
const mode = ref('pending')
const limit = ref(30)
const history = ref([])
const selectedId = ref('')
const busy = ref(false)
const error = ref('')
const feedback = ref('')
const draft = ref('')
const storyTime = ref('')
const statuses = { pending: '待审阅', active: '已确认', stale: '已归档', rejected: '已拒绝' }
const scopeKey = item => JSON.stringify([item.scope, item.scopeId || ''])
const scopes = computed(() => [...new Map([
  ...books.map(book => [JSON.stringify(['project', book.id]), { key: JSON.stringify(['project', book.id]), label: book.title || '未命名书稿' }]),
  ...items.value.map(item => [scopeKey(item), {
  key: scopeKey(item),
  label: item.scope === 'global-author' ? '作者偏好' : item.scope === 'project'
    ? books.find(book => book.id === item.scopeId)?.title || `未关联作品 · ${item.scopeId || '缺少归属'}`
    : `会话 · ${item.scopeId || '缺少归属'}`
}])]).values()])
const filtered = computed(() => items.value.filter(item => scopeKey(item) === selectedScope.value && item.status === mode.value))
const selected = computed(() => items.value.find(item => item.id === selectedId.value && scopeKey(item) === selectedScope.value))
const health = ref({ pending: 0, error: '' })

// ---- 事实账本（A 线 P0 纵向闭环）----
// M06：来源现时性。父级可通过 provide('memorySourceRevisionsProvider') 注入
// async (scope) => ({ currentRevisions, sourceDeleted })；未注入时不裁决、
// 不拦截（与既有行为一致），审计不会假装知道来源状态。
const sourceRevisionsProvider = inject('memorySourceRevisionsProvider', null)
  || (typeof globalThis !== 'undefined' ? globalThis.__pinaxMemorySourceRevisionsProvider : null)
  || null
const evidenceCurrentnessById = ref(null)
const staleConfirmProposalId = ref('')
function proposalStaleEvidenceIds(p) {
  const map = evidenceCurrentnessById.value
  if (!map) return []
  return (p.evidenceIds || []).filter(id => map[id])
}
async function refreshEvidenceCurrentness() {
  evidenceCurrentnessById.value = null
  staleConfirmProposalId.value = ''
  if (typeof sourceRevisionsProvider !== 'function' || !ledgerScope.value) return
  try {
    const state = await sourceRevisionsProvider(ledgerScope.value)
    if (!state || typeof state !== 'object') return
    const opened = await openLedgerDb()
    if (!opened.ok) return
    const audit = await auditEvidenceCurrentness(opened.db, {
      scope: ledgerScope.value,
      currentRevisions: state.currentRevisions || {},
      sourceDeleted: state.sourceDeleted || []
    })
    closeLedgerDb(opened.db)
    if (!audit.ok) return
    const map = {}
    for (const item of audit.items) map[item.evidenceId] = item.status
    evidenceCurrentnessById.value = map
  } catch {
    evidenceCurrentnessById.value = null
  }
}
const ledger = ref({
  ready: false,
  unavailable: '',
  health: null,
  view: 'proposals',
  proposals: [],
  facts: [],
  decisions: [],
  rejections: [],
  evidenceById: new Map(),
  audit: {},
  snapshotVersion: null,
  recordedAsOf: '',
  storyTimeline: '',
  storyEra: '',
  storyOrdinal: '',
  editingProposalId: '',
  editedObject: '',
  correctingFactKey: '',
  correctedObject: '',
  correctionReason: '',
  decisionsCursor: null,
  decisionsLoadingMore: false,
  extractionJobs: [],
  migrationOpen: false,
  migration: null
})

// NC05：审计决定按对象（factKey）分组汇总。组内保留全部决定（不隐藏、
// 不丢原不可变历史），分组只改变阅读顺序。
const decisionGroups = computed(() => {
  const groups = new Map()
  for (const decision of ledger.value.decisions) {
    const key = String(decision.result?.factKey || decision.afterIds?.[0] || decision.id)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(decision)
  }
  return [...groups.entries()].map(([key, items]) => {
    const counts = {}
    for (const item of items) {
      const label = decisionLabels[item.operation] || item.operation
      counts[label] = (counts[label] || 0) + 1
    }
    const summary = Object.entries(counts).map(([label, count]) => `${label}×${count}`).join(' · ')
    const latest = items.reduce((acc, item) => (Number(item.recordedSeq || 0) > Number(acc.recordedSeq || 0) ? item : acc), items[0])
    return {
      key,
      title: String(key).startsWith('fact:') ? `对象 ${String(key).replace(/^fact:/, '').slice(0, 40)}` : `关联 ${key.slice(0, 24)}`,
      summary,
      latestSeq: Number(latest.recordedSeq || 0),
      items
    }
  }).sort((left, right) => right.latestSeq - left.latestSeq)
})

async function loadMoreDecisions() {
  if (!ledger.value.decisionsCursor || ledger.value.decisionsLoadingMore) return
  ledger.value.decisionsLoadingMore = true
  const opened = await openLedgerDb({ openTimeoutMs: 1500 })
  if (opened.ok) {
    const page = await listDecisionsPaged(opened.db, {
      scope: ledgerScope.value,
      cursor: ledger.value.decisionsCursor,
      limit: 50
    })
    if (page.ok) {
      ledger.value.decisions = [...ledger.value.decisions, ...page.items]
      ledger.value.decisionsCursor = page.nextCursor || null
    }
  }
  ledger.value.decisionsLoadingMore = false
}
const decisionLabels = {
  'adopt-proposal': '接受为事实',
  'correct-fact': '更正',
  'retract-fact': '撤回',
  'reject-proposal': '拒绝提案',
  'reopen-rejection': '重新开启审阅',
  'migrate-legacy': '迁入旧记忆'
}
const originLabels = { author: '作者录入', ai: 'AI 提炼', 'legacy-migration': '旧记忆迁入' }
const extractionStatusLabels = {
  queued: '排队中',
  running: '处理中',
  completed: '已完成',
  partial: '部分完成',
  'no-fact': '没有可提取事实',
  failed: '失败',
  cancelled: '已取消',
  'source-changed': '来源已变化'
}
function jobStatusLabel(status) {
  return extractionStatusLabels[status] || status
}

// M11：失败/取消的提取任务显式重排队（attempts 归零、清错误）；只承诺
// 重新排队，不承诺成功。
async function retryExtractionJob(job) {
  if (busy.value) return
  busy.value = true
  feedback.value = ''
  try {
    const result = requeueExtractionJob(job.id)
    feedback.value = result.ok ? '已重新排队，等待下一轮提取。' : `重试失败：${result.reason}`
    await loadLedger()
  } finally {
    busy.value = false
  }
}

const ledgerScope = computed(() => {
  let parsed
  try { parsed = JSON.parse(selectedScope.value || '[]') } catch { return null }
  if (!Array.isArray(parsed)) return null
  if (parsed[0] === 'global-author') return { domain: 'author' }
  if (parsed[0] === 'project' && parsed[1]) return { domain: 'book', bookId: String(parsed[1]) }
  return null
})
const storyAtFromInput = computed(() => {
  const era = ledger.value.storyEra.trim()
  if (!era) return null
  const ordinalText = ledger.value.storyOrdinal.trim()
  const ordinal = ordinalText === '' ? null : Number(ordinalText)
  if (ordinal !== null && !Number.isFinite(ordinal)) return { invalid: true }
  return {
    timelineId: ledger.value.storyTimeline.trim() || 'default',
    eraId: era,
    ordinal,
    precision: ordinal === null ? 'era' : 'year'
  }
})
const recordedAsOfFromInput = computed(() => {
  const value = ledger.value.recordedAsOf
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? { recordedAt: ms } : { invalid: true }
})

let ledgerLoadGeneration = 0
async function loadLedger() {
  const generation = ++ledgerLoadGeneration
  const scope = ledgerScope.value
  // Clear previous book data immediately; late queries cannot repopulate it.
  ledger.value.proposals = []
  ledger.value.facts = []
  ledger.value.decisions = []
  ledger.value.rejections = []
  ledger.value.evidenceById = new Map()
  const opened = await openLedgerDb({ openTimeoutMs: 1500 })
  if (!opened.ok) {
    if (generation !== ledgerLoadGeneration) return
    ledger.value.ready = false
    ledger.value.unavailable = opened.detail || opened.reason
    return
  }
  const db = opened.db
  try {
    const health = await readLedgerHealth(db)
    if (generation !== ledgerLoadGeneration) return
    ledger.value.health = health
    const extractionScopeBook = ledgerScope.value && ledgerScope.value.domain === 'book' ? ledgerScope.value.bookId : ''
    ledger.value.extractionJobs = listExtractionJobs({ projectId: extractionScopeBook })
      .slice(0, 8)
      .map(job => ({
        id: job.id,
        status: job.status,
        retryable: ['failed', 'cancelled', 'source-changed', 'no-fact'].includes(job.status),
        blocks: job.blocks.length,
        attempts: job.attempts || 0,
        rejected: job.rejected || [],
        error: job.lastError ? `${job.lastError.code}: ${job.lastError.message}` : '',
        proposalCount: job.proposalIds?.length || 0,
        unextractableReason: job.unextractableReason || ''
      }))
    if (!scope) {
      ledger.value.ready = true
      ledger.value.unavailable = ''
      ledger.value.proposals = []
      ledger.value.facts = []
      ledger.value.decisions = []
      return
    }
    const [pendingProposals, decisionPage, marks] = await Promise.all([
      listProposals(db, { scope, status: 'pending' }),
      listDecisionsPaged(db, { scope, limit: 50 }),
      listRejectionMarks(db, { scope })
    ])
    const query = await queryFacts(db, {
      scope,
      recordedAsOf: recordedAsOfFromInput.value && !recordedAsOfFromInput.value.invalid ? recordedAsOfFromInput.value : null,
      storyAt: storyAtFromInput.value && !storyAtFromInput.value.invalid ? storyAtFromInput.value : null,
      timeline: storyAtFromInput.value && !storyAtFromInput.value.invalid ? {
        id: storyAtFromInput.value.timelineId,
        eras: [{ id: storyAtFromInput.value.eraId, order: 1 }]
      } : null
    })
    // M11：事实卡也要展示来源——证据集合并入本轮查询到的正式事实引用的证据。
    const factItems = query.ok ? query.items : []
    const evidenceIds = [...new Set([
      ...pendingProposals.flatMap(p => p.evidenceIds),
      ...factItems.flatMap(f => f.evidenceIds || [])
    ])]
    const evidenceRows = evidenceIds.length ? await db.table('evidenceSnapshots').bulkGet(evidenceIds) : []
    if (generation !== ledgerLoadGeneration) return
    const evidenceById = new Map()
    for (const row of evidenceRows) if (row) evidenceById.set(row.id, row)
    ledger.value.ready = true
    ledger.value.unavailable = ''
    ledger.value.proposals = pendingProposals
    ledger.value.decisions = decisionPage.items || []
    void refreshEvidenceCurrentness()
    ledger.value.decisionsCursor = decisionPage.nextCursor || null
    ledger.value.rejections = marks
    ledger.value.evidenceById = evidenceById
    if (query.ok) {
      ledger.value.facts = query.items
      ledger.value.audit = query.excludedReasonCounts
      ledger.value.snapshotVersion = query.snapshotVersion
    } else {
      ledger.value.facts = []
      ledger.value.audit = {}
      ledger.value.snapshotVersion = null
    }
  } catch (cause) {
    if (generation === ledgerLoadGeneration) {
      ledger.value.ready = false
      ledger.value.unavailable = cause.message || '读取失败'
    }
  } finally {
    closeLedgerDb(db)
  }
}

function toggleMigration() {
  ledger.value.migrationOpen = !ledger.value.migrationOpen
  if (ledger.value.migrationOpen) ledger.value.migration = previewLegacyMigration()
}

function beginEditProposal(p) {
  ledger.value.editingProposalId = p.id
  ledger.value.editedObject = p.object
}

function cancelEditProposal() {
  ledger.value.editingProposalId = ''
  ledger.value.editedObject = ''
}

async function acceptProposal(p, { manualAssertion = false, forceStaleEvidence = false } = {}) {
  if (!ledgerScope.value || busy.value) return
  // M06：证据来源已变化且未显式确认 → 先停在警告，不放行。
  if (!forceStaleEvidence && proposalStaleEvidenceIds(p).length) {
    staleConfirmProposalId.value = p.id
    feedback.value = '该提案引用的来源已修订或删除；请核对后选择「仍要接受」或先更新来源。'
    return
  }
  staleConfirmProposalId.value = ''
  busy.value = true
  feedback.value = ''
  try {
    const object = ledger.value.editingProposalId === p.id ? ledger.value.editedObject.trim() : ''
    const opened = await openLedgerDb()
    if (!opened.ok) throw new Error(opened.detail || opened.reason)
    const result = await adoptProposal(opened.db, {
      scope: ledgerScope.value,
      proposalId: p.id,
      commandId: `ui-adopt:${p.id}:${payloadHash({ object })}`,
      object: object || null,
      actorRef: 'memory-workspace',
      manualAssertion,
      // M06：来源现时性由外部接线（资料区状态）时透传；显式确认才放行旧引用。
      evidenceCurrentness: evidenceCurrentnessById.value,
      allowStaleEvidence: forceStaleEvidence === true
    })
    closeLedgerDb(opened.db)
    if (!result.ok) {
      if (result.reason === 'rejection-active') feedback.value = '该主张此前被拒绝且来源未变；请先在“被拒绝的主张”中显式重新开启。'
      else if (result.reason === 'evidence-missing') feedback.value = '缺少来源证据：AI 提炼不能直接提升为事实；可先补章节引文，或经“修改后接受”以手动断言明确记录为作者录入。'
      else if (result.reason === 'proposal-already-adopted') feedback.value = '该提案已被接受为事实。'
      else if (result.reason === 'no-change') feedback.value = '该主张与当前事实一致（含故事区间），未生成重复版本。'
      else error.value = `接受失败：${result.reason}`
    } else {
      feedback.value = result.replay ? '该操作此前已完成，未产生重复事实。' : '已接受为正式事实；旧版本保留在更正链中。'
    }
    cancelEditProposal()
  } catch (cause) {
    error.value = cause.message
  } finally {
    busy.value = false
    await loadLedger()
  }
}

async function dismissProposal(p) {
  if (!ledgerScope.value || busy.value) return
  busy.value = true
  error.value = ''
  feedback.value = ''
  try {
    const opened = await openLedgerDb()
    if (!opened.ok) throw new Error(opened.detail || opened.reason)
    const result = await rejectProposal(opened.db, {
      scope: ledgerScope.value,
      proposalId: p.id,
      commandId: `ui-reject:${p.id}`,
      actorRef: 'memory-workspace'
    })
    closeLedgerDb(opened.db)
    feedback.value = result.ok ? '已拒绝；相同内容与来源的重复提案将被抑制。' : `拒绝失败：${result.reason}`
  } catch (cause) {
    error.value = cause.message
  } finally {
    busy.value = false
    await loadLedger()
  }
}

async function reopen(mark) {
  if (!ledgerScope.value || busy.value) return
  busy.value = true
  error.value = ''
  feedback.value = ''
  try {
    const opened = await openLedgerDb()
    if (!opened.ok) throw new Error(opened.detail || opened.reason)
    const result = await reopenRejection(opened.db, {
      scope: ledgerScope.value,
      rejectionMarkId: mark.id,
      commandId: `ui-reopen:${mark.id}`,
      actorRef: 'memory-workspace'
    })
    closeLedgerDb(opened.db)
    feedback.value = result.ok ? '已重新开启；来源变更后的相同主张可以再次审阅。' : `重新开启失败：${result.reason}`
  } catch (cause) {
    error.value = cause.message
  } finally {
    busy.value = false
    await loadLedger()
  }
}

function beginCorrect(fact) {
  ledger.value.correctingFactKey = fact.factKey
  ledger.value.correctedObject = fact.object
  ledger.value.correctionReason = ''
}

function cancelCorrect() {
  ledger.value.correctingFactKey = ''
  ledger.value.correctedObject = ''
  ledger.value.correctionReason = ''
}

async function submitCorrection(fact) {
  if (!ledgerScope.value || busy.value) return
  busy.value = true
  error.value = ''
  feedback.value = ''
  try {
    const opened = await openLedgerDb()
    if (!opened.ok) throw new Error(opened.detail || opened.reason)
    const head = await getFactHead(opened.db, { scope: ledgerScope.value, factKey: fact.factKey })
    const result = await correctFact(opened.db, {
      scope: ledgerScope.value,
      factKey: fact.factKey,
      object: ledger.value.correctedObject.trim(),
      expectedHead: head?.id || null,
      commandId: `ui-correct:${fact.factKey}:${head?.id || ''}:${payloadHash({ object: ledger.value.correctedObject.trim() })}`,
      actorRef: 'memory-workspace',
      reason: ledger.value.correctionReason.trim()
    })
    closeLedgerDb(opened.db)
    if (!result.ok) {
      if (result.reason === 'head-conflict') feedback.value = '事实已在别处更新（与您看到的版本不一致）；请刷新后再试。'
      else if (result.reason === 'no-change') feedback.value = '内容没有变化，不会生成无意义的修订。'
      else error.value = `更正失败：${result.reason}`
    } else {
      feedback.value = '已更正；旧版本保留，可按“记录截至”回看。'
      cancelCorrect()
    }
  } catch (cause) {
    error.value = cause.message
  } finally {
    busy.value = false
    await loadLedger()
  }
}

async function submitRetract(fact) {
  if (!ledgerScope.value || busy.value) return
  busy.value = true
  error.value = ''
  feedback.value = ''
  try {
    const opened = await openLedgerDb()
    if (!opened.ok) throw new Error(opened.detail || opened.reason)
    const head = await getFactHead(opened.db, { scope: ledgerScope.value, factKey: fact.factKey })
    const result = await retractFact(opened.db, {
      scope: ledgerScope.value,
      factKey: fact.factKey,
      expectedHead: head?.id || null,
      commandId: `ui-retract:${fact.factKey}:${head?.id || ''}`,
      actorRef: 'memory-workspace',
      reason: '作者撤回'
    })
    closeLedgerDb(opened.db)
    if (!result.ok) {
      if (result.reason === 'head-conflict') feedback.value = '事实已在别处更新；请刷新后再试。'
      else error.value = `撤回失败：${result.reason}`
    } else {
      feedback.value = '已撤回；决定记录保留，可按“记录截至”回看撤回前状态。'
    }
  } catch (cause) {
    error.value = cause.message
  } finally {
    busy.value = false
    await loadLedger()
  }
}

async function migrateCandidate(claimable) {
  if (!ledgerScope.value || busy.value) return
  busy.value = true
  error.value = ''
  feedback.value = ''
  try {
    const opened = await openLedgerDb()
    if (!opened.ok) throw new Error(opened.detail || opened.reason)
    const result = await migrateLegacyCandidate(opened.db, {
      candidate: {
        id: claimable.id,
        scope: claimable.scope?.domain === 'author' ? 'global-author' : 'project',
        scopeId: claimable.scope?.bookId || '',
        content: claimable.content,
        kind: claimable.kind,
        sourceRefs: claimable.sourceRefs,
        sourceRevision: claimable.sourceRevision,
        metadata: { storyTime: claimable.storyTime }
      },
      commandId: `ui-migrate:${claimable.id}`,
      actorRef: 'memory-workspace'
    })
    closeLedgerDb(opened.db)
    if (!result.ok) throw new Error(result.reason)
    feedback.value = result.replay ? '该旧记忆此前已迁入，未重复生成事实。' : '已迁入为正式事实；原候选保留不变。'
    ledger.value.migration = previewLegacyMigration()
  } catch (cause) {
    error.value = cause.message
  } finally {
    busy.value = false
    await loadLedger()
  }
}

function reload() {
  items.value = listMemoryCandidates()
  health.value = memoryHistoryHealth()
}

async function initialize() {
  busy.value = true
  error.value = ''
  try {
    reload()
    if (!commitMemorySnapshot(items.value)) throw new Error('本地存储不足，旧记忆尚未迁移，请先备份')
    await flushMemoryHistory()
  } catch (cause) { error.value = cause.message }
  finally {
    reload()
    const preferred = scopes.value.find(scope => scope.key === JSON.stringify(['project', String(route.query.bookId || '')]))
    if (!selectedScope.value) selectedScope.value = preferred?.key || scopes.value[0]?.key || ''
    busy.value = false
  }
  await loadLedger()
}

function changeScope() { selectedId.value = ''; history.value = []; limit.value = 30; feedback.value = ''; return loadLedger() }

async function inspect(item) {
  busy.value = true
  error.value = ''
  selectedId.value = item.id
  draft.value = item.content
  storyTime.value = item.metadata?.storyTime?.label || ''
  history.value = []
  try {
    await flushMemoryHistory()
    history.value = await readMemoryHistory({ candidateId: item.id, scope: item.scope, scopeId: item.scopeId })
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false; health.value = memoryHistoryHealth() }
}

async function apply(action) {
  error.value = ''
  feedback.value = ''
  try {
    const result = action()
    if (!result) throw new Error('未能保存：请检查来源引用、来源版本和本地存储空间')
    reload()
    feedback.value = '已保存；修订保留在历史中。'
    if (selected.value) await inspect(selected.value)
  } catch (cause) { error.value = cause.message }
}

function saveDraft() {
  if (!selected.value || !draft.value.trim()) return
  const item = selected.value
  return apply(() => updateMemoryCandidate(item.id, {
    content: draft.value.trim(), status: 'pending', authority: 'derived', syncStatus: 'local-only',
    metadata: { ...item.metadata, storyTime: storyTime.value.trim()
      ? { precision: 'label', label: storyTime.value.trim() } : { precision: 'unknown' } }
  }))
}

function restore(row) {
  if (!selected.value || row.candidateId !== selected.value.id || scopeKey(row.after) !== selectedScope.value) return
  return apply(() => updateMemoryCandidate(selected.value.id, historicalCandidatePatch(row)))
}

onMounted(initialize)
</script>

<template>
  <div class="memory-workspace" aria-label="记忆与历史">
    <h2>记忆与历史</h2>
    <p class="memory-workspace__hint">记忆变更自动记录，无需逐条审阅。只有 AI 提炼的候选需要确认，才会作为可信记忆使用。</p>
    <nav class="memory-workspace__views" aria-label="记忆视图">
      <button v-for="tab in [{ key: 'activity', label: '修改记录' }, { key: 'candidates', label: 'AI 候选' }, { key: 'facts', label: '事实账本' }]" :key="tab.key" :aria-pressed="view === tab.key" @click="view = tab.key">{{ tab.label }}</button>
    </nav>
    <p v-if="error" role="alert">{{ error }} <button :disabled="busy" @click="initialize">重试归档</button></p>
    <p v-else-if="health.pending" role="status">{{ health.pending }} 次修订尚在本地恢复队列。</p>
    <p v-if="feedback" role="status">{{ feedback }}</p>
    <div class="memory-workspace__controls">
      <label>归属 <select v-model="selectedScope" :disabled="busy" @change="changeScope"><option v-for="scope in scopes" :key="scope.key" :value="scope.key">{{ scope.label }}</option></select></label>
      <label v-if="view === 'candidates'">状态 <select v-model="mode" :disabled="busy" @change="changeScope"><option v-for="(label, key) in statuses" :key="key" :value="key">{{ label }}</option></select></label>
    </div>
    <section v-if="view === 'activity'" aria-label="自动记录的记忆修订">
      <p class="memory-workspace__hint">这里记录记忆的创建与修改，不是正文版本。正文修订在工作台「批注 → 版本」中。旧数据只能保留迁移时快照，不重建不存在的历史。</p>
      <p v-if="activityError" role="alert">{{ activityError }} <button @click="refreshActivity">重试</button></p>
      <p v-else-if="!activity.length">当前作品尚无已归档的记忆变更。</p>
      <article v-for="row in activity.slice(0, limit)" :key="row.id" class="memory-workspace__item">
        <small>{{ new Date(row.recordedAt).toLocaleString() }} · {{ row.operation === 'created' ? '创建' : row.operation === 'legacy-baseline' ? '迁移快照' : '修改' }}</small>
        <p>{{ row.after.content }}</p>
        <details v-if="row.before"><summary>查看修改前</summary><p>{{ row.before.content }}</p></details>
      </article>
      <button v-if="activity.length > limit" @click="limit += 30">显示更多</button>
    </section>
    <template v-if="view === 'candidates'">
    <p v-if="!filtered.length && !busy">此范围内没有{{ statuses[mode] }}记忆。</p>
    <article v-for="item in filtered.slice(0, limit)" :key="item.id" class="memory-workspace__item">
      <p>{{ item.content }}<template v-if="item.metadata?.derivation === 'local-excerpt'"> <small class="memory-workspace__tag">本地摘录</small></template><template v-if="item.metadata?.extractionState === 'proposed'"> <small class="memory-workspace__tag">已提炼为提案，请在事实账本审阅</small></template><template v-else-if="item.metadata?.extractionState === 'no-fact'"> <small class="memory-workspace__tag">提取未产出事实</small></template></p>
      <small v-if="!item.sourceRefs?.length">缺少原文来源，不能作为作品事实确认。</small>
      <div class="memory-workspace__controls">
        <button :disabled="busy" @click="inspect(item)">查看来源与修订</button>
        <button v-if="item.status === 'pending'" :disabled="busy || (item.scope !== 'global-author' && (!item.sourceRefs?.length || !item.sourceRevision))" @click="apply(() => confirmMemoryCandidate(item.id))">确认</button>
        <button v-if="item.status === 'pending'" :disabled="busy" @click="apply(() => rejectMemoryCandidate(item.id))">拒绝</button>
      </div>
      <section v-if="selected?.id === item.id" class="memory-workspace__detail" aria-label="事实修订详情">
        <p>来源引用：{{ item.sourceRefs?.join('、') || '未记录' }}；来源版本：{{ item.sourceRevision || '未知' }}</p>
        <label>记忆内容<textarea v-model="draft" :disabled="busy" rows="3" /></label>
        <label>故事时间（可留空，例如“庆历三年冬”）<input v-model="storyTime" :disabled="busy" maxlength="160"></label>
        <button :disabled="busy || !draft.trim()" @click="saveDraft">保存为待确认修订</button>
        <ol aria-label="修订历史">
          <li v-for="row in history" :key="row.id">
            <strong>{{ row.operation === 'legacy-baseline' ? '旧记录迁移快照' : statuses[row.after.status] }}</strong>
            <small> · 记录于 {{ new Date(row.recordedAt).toLocaleString() }} · 故事时间：{{ row.storyTime?.label || '未知' }}</small>
            <p>{{ row.after.content }}</p>
            <button :disabled="busy" @click="restore(row)">以此版本创建待确认修订</button>
          </li>
        </ol>
      </section>
    </article>
    <button v-if="filtered.length > limit" @click="limit += 30">显示更多</button>
    </template>

    <section v-if="view === 'facts'" class="memory-ledger" aria-label="事实账本">
      <h2>事实账本</h2>
      <p class="memory-workspace__hint">正式事实与候选分开存放：这里只显示作者显式接受的世界/作品事实。每次接受、更正、撤回都有决定记录；“故事时间”是故事内时刻，“记录截至”是作者当时的认知，两者互不代表。</p>
      <p v-if="ledger.unavailable" role="alert">事实账本暂不可用：{{ ledger.unavailable }}。<button :disabled="busy" @click="loadLedger">重试</button>（数据未被改动或删除）</p>
      <template v-else>
        <p v-if="!ledgerScope" class="memory-workspace__hint">当前归属（会话记忆）暂不能登记正式事实；请选择一本书或作者偏好。</p>
        <p v-else-if="ledger.health" class="memory-workspace__hint">数据库正常：正式事实 {{ ledger.health.factVersionCount }} 条 · 决定记录 {{ ledger.health.decisionCount }} 条 · 旧历史修订 {{ ledger.health.v1RevisionCount }} 条。</p>
        <div class="memory-workspace__controls">
          <label>视图 <select v-model="ledger.view" :disabled="busy || !ledgerScope" @change="loadLedger">
            <option value="proposals">待审核提案</option>
            <option value="facts">当前事实</option>
            <option value="decisions">决定记录</option>
          </select></label>
          <button :disabled="busy || !ledgerScope" @click="loadLedger">刷新</button>
        </div>

        <template v-if="ledger.view === 'proposals' && ledgerScope">
          <p v-if="!ledger.proposals.length" class="memory-workspace__hint">没有待审核提案。</p>
          <article v-for="p in ledger.proposals" :key="p.id" class="memory-ledger__card">
            <p><strong>{{ p.subjectLabel || p.subjectKey }}</strong> · {{ p.predicate }} · {{ p.object }}</p>
            <small>{{ originLabels[p.origin] || p.origin }} · 提案来源版本：{{ p.sourceRevision || '无' }} · {{ describeInterval(p.storyInterval) }}</small>
            <div v-if="p.temporalPlanV1 && (p.temporalPlanV1.closes.length || p.temporalPlanV1.conflicts.length)" class="memory-ledger__evidence" data-test="temporal-plan">
              <p v-if="p.temporalPlanV1.closes.length" class="memory-workspace__hint">
                接受后将收口 {{ p.temporalPlanV1.closes.length }} 个旧版本（故事轴：<span v-for="close in p.temporalPlanV1.closes" :key="close.id">{{ close.proposedEnd.kind === 'unknown-end' ? '终点未知' : '止于新起点' }}；</span>）
              </p>
              <p v-if="p.temporalPlanV1.conflicts.length" class="memory-workspace__hint">
                需人工注意 {{ p.temporalPlanV1.conflicts.length }} 项：<span v-for="conflict in p.temporalPlanV1.conflicts" :key="conflict.oldId + conflict.reason">{{ conflict.reason === 'simultaneous' ? '同一时刻开始' : conflict.reason === 'no-time' ? '缺时间证据' : '接替者证据不足' }}；</span>
              </p>
              <small v-if="p.temporalPlanV1.truncated">收口/冲突清单超出上限，已截断显示。</small>
            </div>
            <div v-if="p.evidenceIds.length" class="memory-ledger__evidence">
              <details v-for="evidenceId in p.evidenceIds" :key="evidenceId">
                <summary>来源引文（{{ ledger.evidenceById.get(evidenceId)?.sourceKind === 'manual-assertion' ? '手动断言' : '章节原句' }} · 版本 {{ ledger.evidenceById.get(evidenceId)?.sourceRevision || '无' }}）</summary>
                <blockquote>{{ ledger.evidenceById.get(evidenceId)?.quote || '（无冻结引文）' }}</blockquote>
              </details>
            </div>
            <small v-else-if="p.origin === 'ai'">缺少来源证据，不能直接提升为事实。</small>
            <div v-if="proposalStaleEvidenceIds(p).length" class="memory-ledger__evidence" data-test="evidence-stale-warning">
              <small>来源已修订/删除：{{ proposalStaleEvidenceIds(p).length }} 条证据引用不再是现时版本。</small>
            </div>
            <div class="memory-workspace__controls">
              <template v-if="staleConfirmProposalId === p.id">
                <button :disabled="busy || (p.origin === 'ai' && !p.evidenceIds.length)" data-test="accept-stale" @click="acceptProposal(p, { forceStaleEvidence: true })">仍要接受（来源已变化）</button>
                <button :disabled="busy" @click="staleConfirmProposalId = ''">取消</button>
              </template>
              <template v-else>
                <button :disabled="busy || (p.origin === 'ai' && !p.evidenceIds.length)" @click="acceptProposal(p)">接受为事实</button>
                <button :disabled="busy" @click="beginEditProposal(p)">修改后接受</button>
                <button :disabled="busy" @click="dismissProposal(p)">拒绝</button>
              </template>
            </div>
            <div v-if="ledger.editingProposalId === p.id" class="memory-ledger__form">
              <label>修改后的内容<textarea v-model="ledger.editedObject" rows="2" /></label>
              <div class="memory-workspace__controls">
                <button :disabled="busy || !ledger.editedObject.trim()" @click="acceptProposal(p)">以此内容接受</button>
                <button v-if="p.origin === 'author' && !p.evidenceIds.length" :disabled="busy" @click="acceptProposal(p, { manualAssertion: true })">按作者手动断言接受</button>
                <button :disabled="busy" @click="cancelEditProposal">取消</button>
              </div>
            </div>
          </article>
          <section v-if="ledger.rejections.filter(m => !m.reopenedAt).length" aria-label="被拒绝的主张">
            <h3>被拒绝的主张</h3>
            <p class="memory-workspace__hint">相同内容与来源版本的提案不会再次出现；来源变化后会重新进入审阅。也可显式重新开启。</p>
            <p v-for="mark in ledger.rejections.filter(m => !m.reopenedAt)" :key="mark.id">
              指纹 {{ mark.fingerprint.slice(7, 26) }}… <button :disabled="busy" @click="reopen(mark)">重新开启审阅</button>
            </p>
          </section>
        </template>

        <template v-else-if="ledger.view === 'facts' && ledgerScope">
          <div class="memory-ledger__filters">
            <label>记录截至 <input v-model="ledger.recordedAsOf" type="datetime-local" :disabled="busy" @change="loadLedger">（留空为当前）</label>
            <div class="memory-workspace__controls">
              <label>时间线 <input v-model="ledger.storyTimeline" :disabled="busy" size="10" placeholder="可留空"></label>
              <label>纪元 <input v-model="ledger.storyEra" :disabled="busy" size="10" placeholder="如 帝国纪元"></label>
              <label>年序 <input v-model="ledger.storyOrdinal" :disabled="busy" size="4" placeholder="年"></label>
              <button :disabled="busy" @click="loadLedger">按故事时间查询</button>
            </div>
          </div>
          <p class="memory-workspace__hint">故事时间筛选需要事实带有明确纪年；没有纪年或纪元未声明的事实会计入“时间未知”，不会被当作“一直成立”。</p>
          <p v-if="Object.keys(ledger.audit).length" class="memory-workspace__hint">本次查询排除：{{ Object.entries(ledger.audit).map(([reason, count]) => `${reason === 'storyTimeUnknown' ? '故事时间未知' : '不在该故事时间'} ${count} 条`).join('；') }}。</p>
          <details v-if="ledger.extractionJobs.length" class="memory-ledger__decision-group" aria-label="提取任务">
            <summary>提取任务（{{ ledger.extractionJobs.length }}）— 排队/处理中/部分失败都会留痕，不自动重复提取</summary>
            <ul class="memory-ledger__job-list">
              <li v-for="job in ledger.extractionJobs" :key="job.id">
                <strong>{{ jobStatusLabel(job.status) }}</strong>
                <small> · {{ job.blocks }} 段 · 尝试 {{ job.attempts }} 次<template v-if="job.proposalCount"> · 产出提案 {{ job.proposalCount }} 条</template><template v-if="job.rejected.length"> · 校验拒绝 {{ job.rejected.length }} 条（{{ job.rejected.map(r => r.reason).join('、') }}）</template><template v-if="job.unextractableReason"> · 没有可提取事实：{{ job.unextractableReason }}</template><template v-if="job.error"> · {{ job.error }}</template></small>
                <button v-if="job.retryable" class="control-quiet" :disabled="busy" @click="retryExtractionJob(job)">重新排队</button>
              </li>
            </ul>
          </details>
          <p v-if="!ledger.facts.length" class="memory-workspace__hint">{{ ledger.recordedAsOf ? '该记录时点之前没有已登记的事实。' : '还没有正式事实。' }}</p>
          <article v-for="fact in ledger.facts" :key="fact.factVersionId" class="memory-ledger__card">
            <p><strong>{{ fact.subjectLabel || fact.subjectKey }}</strong> · {{ fact.predicate }} · {{ fact.object }}</p>
            <small>故事时间：{{ describeInterval(fact.validInterval) }} · 记录于 {{ new Date(fact.recordedAt).toLocaleString() }} · 版本 {{ fact.factVersionId.slice(-8) }}<template v-if="fact.supersedes"> · 更正自 {{ fact.supersedes.slice(-8) }}</template><template v-if="fact.supersedesKind"> · 引擎收口</template></small>
            <div v-if="fact.evidenceIds && fact.evidenceIds.length" class="memory-ledger__evidence" data-test="fact-evidence">
              <details v-for="evidenceId in fact.evidenceIds" :key="evidenceId">
                <summary>来源（{{ ledger.evidenceById.get(evidenceId)?.sourceKind === 'manual-assertion' ? '手动断言' : '章节原句' }} · 来源版本 {{ ledger.evidenceById.get(evidenceId)?.sourceRevision || '无' }}）</summary>
                <blockquote>{{ ledger.evidenceById.get(evidenceId)?.quote || '（无冻结引文）' }}</blockquote>
              </details>
            </div>
            <div class="memory-workspace__controls">
              <button :disabled="busy" @click="beginCorrect(fact)">更正</button>
              <button :disabled="busy" @click="submitRetract(fact)">撤回</button>
            </div>
            <div v-if="ledger.correctingFactKey === fact.factKey" class="memory-ledger__form">
              <p class="memory-workspace__hint">更正前：{{ fact.object }}</p>
              <label>更正为<textarea v-model="ledger.correctedObject" rows="2" /></label>
              <label>更正理由（可留空）<input v-model="ledger.correctionReason" maxlength="160"></label>
              <div class="memory-workspace__controls">
                <button :disabled="busy || !ledger.correctedObject.trim()" @click="submitCorrection(fact)">提交更正</button>
                <button :disabled="busy" @click="cancelCorrect">取消</button>
              </div>
            </div>
          </article>
        </template>

        <template v-else-if="ledger.view === 'decisions' && ledgerScope">
          <p class="memory-workspace__hint">状态对照：接受=事实生效 · 更正=作废旧值并立新值（旧值仍可追溯）· 撤回=事实失效但审计保留 · 迁入=旧记忆显式确认。所有决定不可改写，只按对象分组便于阅读。</p>
          <p v-if="!ledger.decisions.length" class="memory-workspace__hint">还没有决定记录。</p>
          <section aria-label="按对象分组的决定汇总">
            <details open v-for="group in decisionGroups" :key="group.key" class="memory-ledger__decision-group">
              <summary>{{ group.title }} — {{ group.summary }}</summary>
              <ol>
                <li v-for="decision in group.items" :key="decision.id">
                  <strong>{{ decisionLabels[decision.operation] || decision.operation }}</strong>
                  <small> · {{ new Date(decision.recordedAt).toLocaleString() }} · 序号 {{ decision.recordedSeq }}<template v-if="decision.reason"> · {{ decision.reason }}</template></small>
                </li>
              </ol>
            </details>
          </section>
          <button v-if="ledger.decisionsCursor" :disabled="ledger.decisionsLoadingMore" @click="loadMoreDecisions">
            {{ ledger.decisionsLoadingMore ? '加载中…' : '加载更早的决定' }}
          </button>
        </template>

        <section class="memory-ledger__migration">
          <h3>旧记忆迁入</h3>
          <p class="memory-workspace__hint">旧版“已确认”记忆不会自动成为正式事实；迁移需要逐条显式确认，并保留原候选与来源。会话记忆缺少分支归属，暂不能迁入。</p>
          <button :disabled="busy || !ledgerScope" @click="toggleMigration">{{ ledger.migrationOpen ? '收起迁入清单' : '查看可迁入的旧记忆' }}</button>
          <template v-if="ledger.migrationOpen && ledger.migration?.ok">
            <p class="memory-workspace__hint">共 {{ ledger.migration.total }} 条旧记忆：可迁入 {{ ledger.migration.claimable.length }} · 缺来源 {{ ledger.migration.missingSource.length }} · 待归属 {{ ledger.migration.unattributable.length }}。</p>
            <article v-for="claimable in ledger.migration.claimable" :key="claimable.id" class="memory-ledger__card">
              <p>{{ claimable.content }}</p>
              <small>来源：{{ claimable.sourceRefs.join('、') }} · 版本 {{ claimable.sourceRevision }}</small>
              <div class="memory-workspace__controls">
                <button :disabled="busy" @click="migrateCandidate(claimable)">迁为正式事实</button>
              </div>
            </article>
          </template>
        </section>
      </template>
    </section>
  </div>
</template>

<style scoped>
.memory-workspace { font-size: 16px; line-height: 1.7; color: var(--text-primary); }
.memory-workspace p { margin: 8px 0; overflow-wrap: anywhere; }
.memory-workspace__hint, small { color: var(--text-secondary); }
.memory-workspace__controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.memory-workspace__item { padding: 16px 0; border-bottom: 1px solid var(--border); }
.memory-workspace button, select, input, textarea { font: inherit; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--border); border-radius: 3px; padding: 8px; max-width: 100%; }
.memory-workspace button { min-height: 44px; cursor: pointer; }
.memory-workspace button:disabled { opacity: .5; cursor: default; }
.memory-workspace__detail { display: grid; gap: 12px; padding-top: 12px; }
.memory-workspace__detail label { display: grid; gap: 4px; }
.memory-workspace textarea { width: 100%; box-sizing: border-box; resize: vertical; }
.memory-workspace ol { padding-left: 22px; }
.memory-workspace li { padding: 10px 0; }
.memory-ledger { margin-top: 32px; padding-top: 16px; border-top: 2px solid var(--border); display: grid; gap: 8px; }
.memory-ledger h2 { font-size: 18px; margin: 0; }
.memory-ledger h3 { font-size: 16px; margin: 12px 0 0; }
.memory-ledger__card { padding: 12px 0; border-bottom: 1px dashed var(--border); display: grid; gap: 6px; }
.memory-ledger__evidence details { margin: 4px 0; }
.memory-ledger__evidence blockquote { margin: 6px 0; padding: 6px 10px; border-left: 3px solid var(--border); color: var(--text-secondary); white-space: pre-wrap; }
.memory-ledger__form { display: grid; gap: 8px; padding: 8px 0; }
.memory-ledger__form label { display: grid; gap: 4px; }
.memory-ledger__decision-group {
  margin-block: 6px;
  border: 1px solid color-mix(in srgb, var(--archive-ink, #1f2630) 14%, transparent);
  border-radius: 3px;
  background: color-mix(in srgb, var(--archive-paper-soft, #f7f4ed) 92%, transparent);
}
.memory-ledger__decision-group summary {
  min-height: 28px;
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  color: var(--archive-ink, #1f2630);
  font-weight: 600;
}
.memory-ledger__decision-group ol { margin: 0; padding-inline: 28px 12px; }
.memory-workspace__tag {
  display: inline-block;
  margin-inline-start: 6px;
  padding: 1px 6px;
  border: 1px solid color-mix(in srgb, var(--archive-ink, #1f2630) 22%, transparent);
  border-radius: 999px;
  color: var(--archive-ink-soft, #5d6470);
  font-size: 10px;
  white-space: nowrap;
}
.memory-ledger__filters { display: grid; gap: 8px; }
.memory-ledger__filters label { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.memory-workspace { font-size: 14px; }
.memory-workspace h2 { margin: 0 0 12px; font-size: 22px; }
.memory-workspace__views { display: flex; gap: 4px; margin: 18px 0; border-bottom: 1px solid var(--border); }
.memory-workspace__views button { border: 0; border-radius: 5px 5px 0 0; background: transparent; min-height: 36px; }
.memory-workspace__views button[aria-pressed='true'] { background: var(--bg-hover); color: var(--text-primary); }
.memory-workspace button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.memory-workspace .memory-ledger { margin-top: 20px; border-top: 0; padding-top: 0; }
</style>
