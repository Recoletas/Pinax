import { computed, onBeforeUnmount, ref } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService'
import {
  addBlock,
  BLOCK_KINDS,
  buildContextEnvelope,
  clipContextEnvelope
} from '../services/agents/agentContextEnvelope'
import { buildWritingAgentContext } from '../services/writingAgentContext'
import { buildReferenceContext } from '../services/writingAgentReferences'
import { buildWorldbookContext } from '../services/worldbookContextBuilder'
import {
  appendContextLedgerPart,
  createContextLedger,
  mergeContextLedgers
} from '../services/contextLedger'
import { normalizeWritingSuggestion } from '../services/writingSuggestion'
import { sourceRefsToEvidenceRefs } from '../services/narrativeAssets'
import {
  PASSIVE_HINT_TYPES,
  canRequestPassiveHint,
  getAgentRuntimePolicy,
  recordAgentRuntimeEvent,
  setAgentRuntimeEnabled
} from '../services/agents/agentRuntimePolicy'

const DEFAULT_DEBOUNCE_MS = 900
const DEFAULT_FAILURE_LIMIT = 3
const DEFAULT_COOLDOWN_MS = 60000
const SUPPRESSED_INPUT_TYPES = new Set([
  'insertFromPaste',
  'insertFromDrop',
  'historyUndo',
  'historyRedo'
])

export function createWritingRevision(content, cursorPos = 0) {
  const text = String(content || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `writing-${(hash >>> 0).toString(36)}-${text.length.toString(36)}-${Number(cursorPos).toString(36)}`
}

export function shouldTriggerWritingAgent(input = {}) {
  const content = String(input.content || '')
  const cursorPos = Math.max(0, Math.min(content.length, Number(input.cursorPos) || 0))
  const before = content.slice(Math.max(0, cursorPos - 180), cursorPos)
  if (
    input.enabled === false
    || input.composing
    || input.hasSelection
    || input.coolingDown
    || SUPPRESSED_INPUT_TYPES.has(input.inputType)
    || cursorPos < 40
    || before.trim().length < 32
  ) return false

  const last = before.slice(-1)
  return /[\u3002\uff01\uff1f\uff0c\uff1b\uff1a\u201d\u300d\u300fA-Za-z0-9]$/.test(last)
}

function firstSuggestionUnit(suggestion) {
  const text = String(suggestion || '')
  const match = text.match(/^.*?[。！？!?\n](?:[”」』])?/)
  return match?.[0] || text
}

export function applyWritingSuggestion(content, cursorPos, suggestion, mode = 'all') {
  const text = String(content || '')
  const cursor = Math.max(0, Math.min(text.length, Number(cursorPos) || 0))
  const inserted = mode === 'unit' ? firstSuggestionUnit(suggestion) : String(suggestion || '')
  return {
    content: text.slice(0, cursor) + inserted + text.slice(cursor),
    inserted,
    start: cursor,
    end: cursor + inserted.length,
    newCursorPos: cursor + inserted.length
  }
}

export function undoWritingSuggestion(content, receipt) {
  const text = String(content || '')
  if (!receipt || createWritingRevision(text, receipt.cursorAfter) !== receipt.afterRevision) {
    return { ok: false, content: text, reason: 'revision-changed' }
  }
  return {
    ok: true,
    content: receipt.before,
    cursorPos: receipt.cursorBefore
  }
}

export function buildWritingAgentInput(snapshot, cursorPos) {
  const content = String(snapshot.content || '')
  const blockTarget = snapshot.blockTarget && typeof snapshot.blockTarget === 'object'
    ? snapshot.blockTarget
    : null
  const writingContext = buildWritingAgentContext({
    book: { id: snapshot.bookId, title: snapshot.bookTitle },
    chapter: {
      id: snapshot.chapterId,
      title: snapshot.chapterTitle,
      wordCount: content.replace(/\s/g, '').length
    },
    editorContent: content,
    cursorPosition: cursorPos,
    outlineItems: snapshot.outlineItems,
    referenceAsset: snapshot.referenceAsset,
    inboxAssets: snapshot.inboxAssets,
    selectedInboxIds: snapshot.selectedInboxIds,
    worldbook: snapshot.worldbook
  })
  const references = buildReferenceContext({
    referenceAsset: snapshot.referenceAsset,
    inboxAssets: snapshot.inboxAssets,
    selectedInboxIds: snapshot.selectedInboxIds,
    outlineContext: writingContext.outline.contextText,
    currentChapterId: snapshot.chapterId,
    currentBookId: snapshot.bookId
  })
  const selectedReferenceAssets = [
    snapshot.referenceAsset,
    ...(snapshot.inboxAssets || [])
      .filter((asset) => (snapshot.selectedInboxIds || []).includes(asset.id))
  ].filter(Boolean)
  const referenceSourceRefs = [...new Set(selectedReferenceAssets.flatMap((asset) => [
    asset.id ? `narrative-asset:${asset.id}` : '',
    ...sourceRefsToEvidenceRefs(asset.sourceRefs || [])
  ]).filter(Boolean))]
  const chapterSourceRefs = [...new Set([
    snapshot.chapterId ? `chapter:${snapshot.chapterId}` : '',
    ...(Array.isArray(snapshot.sourceRefs) ? snapshot.sourceRefs : [])
  ].filter(Boolean))]
  const worldbook = buildWorldbookContext({
    worldbook: snapshot.worldbook,
    chatHistory: [{
      role: 'user',
      content: [references.contextText, writingContext.cursor.before, writingContext.cursor.after]
        .filter(Boolean)
        .join('\n\n')
    }],
    runtimeState: {
      activities: snapshot.chapterTitle ? [{ title: snapshot.chapterTitle }] : []
    },
    tokenBudget: 520,
    scanDepth: 1
  })

  const revision = createWritingRevision(content, cursorPos)
  let envelope = buildContextEnvelope({
    surface: 'writing',
    projectId: snapshot.bookId || null,
    target: {
      type: 'cursor-window',
      id: snapshot.chapterId || null,
      revision
    },
    budget: { maxChars: 12000 }
  })
  envelope = addBlock(envelope, BLOCK_KINDS.RULES, [
    '只返回可直接插入光标处的中文正文，不解释、不加标题、不使用 Markdown。',
    '保持当前叙事视角、称谓、时态和标点；不得重复光标前文本。',
    '光标后有正文时必须自然衔接。建议控制在 20-160 字。'
  ].join('\n'), { priority: 900 })
  envelope = addBlock(envelope, BLOCK_KINDS.SCENE, {
    text: [
      snapshot.chapterTitle ? `章节：${snapshot.chapterTitle}` : '',
      blockTarget?.blockId ? `当前块：${blockTarget.blockId}（revision ${blockTarget.blockRevision}）` : '',
      blockTarget ? `当前块范围：${blockTarget.start}-${blockTarget.end}` : '',
      '【光标前】',
      writingContext.cursor.before || '（空）',
      '【光标后】',
      writingContext.cursor.after || '（空）'
    ].filter(Boolean).join('\n')
  }, {
    priority: 700,
    sourceRefs: chapterSourceRefs
  })
  if (references.contextText) {
    envelope = addBlock(envelope, BLOCK_KINDS.REFERENCES, references.contextText, {
      priority: 350,
      sourceRefs: referenceSourceRefs
    })
  }
  const worldbookText = worldbook.messages.map((message) => message.content).join('\n\n')
  if (worldbookText) {
    envelope = addBlock(envelope, BLOCK_KINDS.WORLD_BOOK, worldbookText, {
      priority: 250,
      sourceRefs: worldbook.matchedEntries.map((entry) => `worldbook:${entry.id}`)
    })
  }
  envelope = clipContextEnvelope(envelope)

  let writingLedger = createContextLedger({
    runId: revision,
    worldbookId: snapshot.worldbook?.id || ''
  })
  writingLedger = appendContextLedgerPart(writingLedger, {
    source: 'generation',
    title: snapshot.chapterTitle || '当前章节',
    purpose: 'writing-cursor-window',
    content: `${writingContext.cursor.before}${writingContext.cursor.after}`,
    included: true,
    limit: 760,
    sourceRefs: chapterSourceRefs
  })
  if (references.contextText) {
    writingLedger = appendContextLedgerPart(writingLedger, {
      source: 'generation',
      title: '写作引用',
      purpose: 'writing-references',
      content: references.contextText,
      included: true,
      limit: references.budgetReport.totalChars,
      truncated: references.budgetReport.overflowed,
      sourceRefs: referenceSourceRefs
    })
  }

  return {
    envelope,
    ledger: mergeContextLedgers(worldbook.contextLedger, writingLedger),
    revision,
    blockTarget,
    documentRevision: Number(snapshot.documentRevision || 0),
    matchedEntries: worldbook.matchedEntries,
    warnings: worldbook.warnings
  }
}

export function useWritingAgent(options = {}) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const failureLimit = options.failureLimit ?? DEFAULT_FAILURE_LIMIT
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const enabled = ref(options.enabled !== false && getAgentRuntimePolicy().enabled)
  const generating = ref(false)
  const suggestion = ref('')
  const error = ref('')
  const matchedEntries = ref([])
  const warnings = ref([])
  const contextLedger = ref(null)
  const lastReceipt = ref(null)
  const failureCount = ref(0)
  const cooldownUntil = ref(0)
  const composing = ref(false)
  let timer = null
  let requestVersion = 0

  const visible = computed(() => Boolean(suggestion.value))
  const coolingDown = computed(() => cooldownUntil.value > Date.now())
  const canUndoApply = computed(() => Boolean(lastReceipt.value))

  function cancel() {
    if (suggestion.value) {
      recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'dismissed', {
        chars: suggestion.value.length
      })
    }
    requestVersion += 1
    if (timer) clearTimeout(timer)
    timer = null
    generating.value = false
    suggestion.value = ''
  }

  function suppress(reason = '') {
    cancel()
    if (reason === 'composition') composing.value = true
  }

  function finishComposition() {
    composing.value = false
  }

  function markFailure(message) {
    failureCount.value += 1
    error.value = message || '补全失败'
    if (failureCount.value >= failureLimit) {
      cooldownUntil.value = Date.now() + cooldownMs
      failureCount.value = 0
    }
  }

  function hasActiveCooldown() {
    if (cooldownUntil.value && cooldownUntil.value <= Date.now()) {
      cooldownUntil.value = 0
      error.value = ''
    }
    return cooldownUntil.value > Date.now()
  }

  async function generate(snapshot, cursorPos, manual = false) {
    if (!enabled.value || !snapshot?.chapterId || (!manual && hasActiveCooldown())) return
    if (!manual) {
      const permission = canRequestPassiveHint(PASSIVE_HINT_TYPES.WRITING_INLINE)
      if (!permission.allowed) return
    }
    const input = buildWritingAgentInput(snapshot, cursorPos)
    const startedAt = Date.now()
    recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'requested', {
      chars: String(snapshot.content || '').length,
      at: startedAt
    })
    const version = ++requestVersion
    generating.value = true
    suggestion.value = ''
    error.value = ''
    contextLedger.value = input.ledger
    matchedEntries.value = input.matchedEntries
    warnings.value = input.warnings

    try {
      const result = await requestAdvisorTask({
        envelope: input.envelope,
        question: '续写光标处的下一句正文，只返回正文。',
        taskType: 'writing.continue.light',
        scope: 'continue',
        options: { contextLedgerVersion: input.ledger?.schemaVersion || 1 }
      })
      if (version !== requestVersion) return
      const latest = options.getSnapshot?.()
      const latestRevision = createWritingRevision(latest?.content, latest?.cursorPos)
      if (latestRevision !== input.revision) return
      const normalized = normalizeWritingSuggestion(result.advice, 160)
      if (!normalized) {
        recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'empty', {
          latencyMs: Date.now() - startedAt
        })
        markFailure('模型未返回可插入正文')
        return
      }
      suggestion.value = normalized
      failureCount.value = 0
      recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'shown', {
        chars: normalized.length,
        latencyMs: Date.now() - startedAt
      })
    } catch (requestError) {
      if (version !== requestVersion) return
      recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'failed', {
        latencyMs: Date.now() - startedAt,
        reason: requestError?.message
      })
      markFailure(requestError?.message)
    } finally {
      if (version === requestVersion) generating.value = false
    }
  }

  function onInput(input = {}) {
    if (
      lastReceipt.value
      && createWritingRevision(input.content, lastReceipt.value.cursorAfter) !== lastReceipt.value.afterRevision
    ) {
      lastReceipt.value = null
    }
    if (suggestion.value || generating.value) cancel()
    if (timer) clearTimeout(timer)
    timer = null
    if (!shouldTriggerWritingAgent({
      ...input,
      enabled: enabled.value,
      composing: composing.value || input.composing,
      coolingDown: hasActiveCooldown()
    })) {
      if (SUPPRESSED_INPUT_TYPES.has(input.inputType) || input.composing) cancel()
      return
    }
    const snapshot = options.getContext?.()
    timer = setTimeout(() => generate(snapshot, input.cursorPos, false), debounceMs)
  }

  function manualTrigger() {
    const snapshot = options.getContext?.()
    const cursorPos = options.getSnapshot?.()?.cursorPos ?? 0
    cooldownUntil.value = 0
    return generate(snapshot, cursorPos, true)
  }

  function accept(content, cursorPos, mode = 'all') {
    if (!suggestion.value) return null
    const result = applyWritingSuggestion(content, cursorPos, suggestion.value, mode)
    const receipt = {
      before: String(content || ''),
      cursorBefore: cursorPos,
      cursorAfter: result.newCursorPos,
      afterRevision: createWritingRevision(result.content, result.newCursorPos)
    }
    lastReceipt.value = receipt
    suggestion.value = mode === 'unit'
      ? suggestion.value.slice(result.inserted.length)
      : ''
    recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'accepted', {
      chars: result.inserted.length,
      reason: mode
    })
    return result
  }

  function setEnabled(nextEnabled) {
    enabled.value = Boolean(nextEnabled)
    setAgentRuntimeEnabled(enabled.value)
    if (!enabled.value) cancel()
  }

  function undoLastApply(content) {
    const result = undoWritingSuggestion(content, lastReceipt.value)
    if (result.ok) lastReceipt.value = null
    return result
  }

  onBeforeUnmount(cancel)

  return {
    enabled,
    setEnabled,
    generating,
    suggestion,
    visible,
    error,
    matchedEntries,
    warnings,
    contextLedger,
    coolingDown,
    canUndoApply,
    onInput,
    manualTrigger,
    accept,
    cancel,
    suppress,
    finishComposition,
    undoLastApply
  }
}
