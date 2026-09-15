import { computed, onBeforeUnmount, ref } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService'
import { getResolvedApiSettings } from '../services/api'
import { worldbookEntryRef } from '../services/writing/writingSourceRefs.js'
import { compileWritingContext } from '../services/agents/context/writingContextCompiler.js'
import { isContextManifestStale } from '../services/agents/context/contextManifestLifecycle.js'
import {
  addBlock,
  BLOCK_KINDS,
  buildContextEnvelope,
  clipContextEnvelope
} from '../services/agents/agentContextEnvelope'
import {
  appendContextLedgerPart,
  createContextLedger
} from '../services/contextLedger'
import { extractWritingSuggestionWindow, normalizeWritingSuggestions } from '../services/agents/authoring/writingSuggestion'
import {
  PASSIVE_HINT_TYPES,
  canRequestPassiveHint,
  getAgentRuntimePolicy,
  recordAgentRuntimeEvent,
} from '../services/agents/agentRuntimePolicy'
import { canArmPassiveInlineSuggestion } from '../services/writing/writingInteractionPolicy.js'

const DEFAULT_DEBOUNCE_MS = 2800
const INLINE_CONTEXT_LIMITS = Object.freeze({ upstream: 720, downstream: 80, worldbookEntries: 4 })
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

export function createWritingRequestFingerprint(snapshot = {}, cursorPos = snapshot.cursorPos || 0) {
  const nodeTarget = snapshot.nodeTarget || snapshot
  return [
    String(snapshot.bookId || snapshot.projectId || ''),
    String(snapshot.documentRole || snapshot.role || 'manuscript'),
    String(snapshot.documentId || snapshot.chapterId || ''),
    String(snapshot.chapterId || ''),
    String(snapshot.bookTitle || ''),
    String(snapshot.chapterTitle || snapshot.documentTitle || ''),
    String(nodeTarget?.unitId || ''),
    String(nodeTarget?.unitRevision ?? ''),
    String(nodeTarget?.nodeId || ''),
    String(nodeTarget?.nodeRevision ?? ''),
    String(snapshot.documentRevision ?? ''),
    createWritingRevision(snapshot.content, cursorPos)
  ].join('\u0000')
}

export function shouldTriggerWritingAgent(input = {}) {
  const content = String(input.content || '')
  if (
    input.enabled === false
    || input.composing
    || input.editorFocused === false
    || input.hasSelection
    || input.coolingDown
    || !canArmPassiveInlineSuggestion(input)
    || SUPPRESSED_INPUT_TYPES.has(input.inputType)
    || content.trim().length < 12
  ) return false
  return true
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
  const inlineWindow = extractWritingSuggestionWindow(content, cursorPos, INLINE_CONTEXT_LIMITS)
  const nodeTarget = snapshot.nodeTarget && typeof snapshot.nodeTarget === 'object'
    ? snapshot.nodeTarget
    : null
  const chapterSourceRefs = [...new Set([
    snapshot.chapterId ? `chapter:${snapshot.chapterId}` : '',
    snapshot.documentRole === 'exploration' && snapshot.documentId ? `exploration:${snapshot.documentId}` : '',
    ...(Array.isArray(snapshot.sourceRefs) ? snapshot.sourceRefs : [])
  ].filter(Boolean))]
  // Phase 4 ownership closure：世界书/大纲/探索上下文统一经 WritingContextCompiler
  // （inline-fast 预算）；不再在 inline 链内运行独立 matcher/语义 builder。
  const manifest = compileWritingContext({
    candidates: snapshot.contextCandidates || [],
    target: {
      projectId: snapshot.bookId || '',
      documentId: snapshot.documentId || snapshot.chapterId || '',
      documentRole: snapshot.documentRole || 'manuscript',
      chapterId: snapshot.chapterId || '',
      unitId: nodeTarget?.unitId || ''
    },
    profile: 'inline-fast',
    taskKind: snapshot.documentRole === 'exploration' ? 'exploration' : 'manuscript',
    excludedCandidateIds: snapshot.contextRunExcludedIds || [],
    pinnedCandidateIds: snapshot.contextRunPinnedIds || [],
    dependencyRevisions: snapshot.contextDependencyRevisions || {}
  })
  const manifestWorldbookBlocks = manifest.blocks.filter((block) => block.kind === 'worldbook-entry')
  const manifestContextText = manifest.blocks
    .filter((block) => block.kind !== 'worldbook-entry')
    .map((block) => block.text)
    .join('\n\n')
  const worldbook = {
    matchedEntries: manifestWorldbookBlocks.map((block) => ({
      id: block.candidateId.startsWith('wb-entry:') ? block.candidateId.slice('wb-entry:'.length) : block.candidateId,
      content: block.text,
      sourceRefs: block.sourceRefs
    })),
    contextLedger: null,
    warnings: manifest.unresolvedConflicts.map((conflict) => `未裁决冲突：${conflict.claimKey}`)
  }
  const manifestFingerprint = manifest.fingerprint

  const revision = createWritingRequestFingerprint(snapshot, cursorPos)
  let envelope = buildContextEnvelope({
    surface: 'writing',
    projectId: snapshot.bookId || null,
    target: {
      type: 'cursor-window',
      id: snapshot.documentId || snapshot.chapterId || null,
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
      nodeTarget?.unitId ? `当前单元：${nodeTarget.unitId}（revision ${nodeTarget.unitRevision}）` : '',
      nodeTarget?.nodeId ? `当前节点：${nodeTarget.nodeId}（revision ${nodeTarget.nodeRevision}）` : '',
      nodeTarget ? `当前节点范围：${nodeTarget.start}-${nodeTarget.end}` : '',
      '【光标前】',
      inlineWindow.before || '（空）',
      '【光标后】',
      inlineWindow.after || '（空）'
    ].filter(Boolean).join('\n')
  }, {
    priority: 700,
    sourceRefs: chapterSourceRefs
  })
  if (manifestContextText) {
    envelope = addBlock(envelope, BLOCK_KINDS.REFERENCES, manifestContextText, {
      priority: 360,
      sourceRefs: [...new Set(manifest.blocks
        .filter((block) => block.kind !== 'worldbook-entry')
        .flatMap((block) => block.sourceRefs))]
    })
  }
  const worldbookText = manifestWorldbookBlocks.map((block) => block.text).join('\n\n')
  if (worldbookText) {
    envelope = addBlock(envelope, BLOCK_KINDS.WORLD_BOOK, worldbookText, {
      priority: 250,
      sourceRefs: worldbook.matchedEntries.map((entry) => worldbookEntryRef(entry.id)).filter(Boolean)
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
    content: `${inlineWindow.before}${inlineWindow.after}`,
    included: true,
    limit: 760,
    sourceRefs: chapterSourceRefs
  })
  if (manifestContextText) {
    writingLedger = appendContextLedgerPart(writingLedger, {
      source: 'generation',
      title: '编译后的写作上下文',
      purpose: 'writing-compiled-context',
      content: manifestContextText,
      included: true,
      limit: manifest.budget?.usedChars || manifestContextText.length,
      truncated: false,
      sourceRefs: [...new Set(manifest.blocks.flatMap((block) => block.sourceRefs || []))]
    })
  }

  return {
    envelope,
    ledger: writingLedger,
    contextManifest: manifest,
    manifestFingerprint,
    revision,
    nodeTarget,
    documentRevision: String(snapshot.documentRevision ?? ''),
    matchedEntries: worldbook.matchedEntries.slice(0, INLINE_CONTEXT_LIMITS.worldbookEntries),
    warnings: worldbook.warnings
  }
}

export function useWritingAgent(options = {}) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const failureLimit = options.failureLimit ?? DEFAULT_FAILURE_LIMIT
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const enabled = ref(options.enabled !== false && getAgentRuntimePolicy().enabled)
  const requesting = ref(false)
  const generating = ref(false)
  const suggestions = ref([])
  const activeSuggestionIndex = ref(0)
  const suggestion = computed(() => suggestions.value[activeSuggestionIndex.value] || '')
  const error = ref('')
  const matchedEntries = ref([])
  const warnings = ref([])
  const contextLedger = ref(null)
  const lastReceipt = ref(null)
  const failureCount = ref(0)
  const cooldownUntil = ref(0)
  const composing = ref(false)
  let timer = null
  let generatingVisibilityTimer = null
  let cooldownVisibilityTimer = null
  let requestVersion = 0
  let requestController = null
  let pendingFingerprint = ''
  let pendingInputType = ''
  let activeFingerprint = ''
  let lastRequestedFingerprint = ''
  let dismissedFingerprint = ''
  let activeManifest = null
  let activeCandidateContext = null
  let activeRevision = ''

  const visible = computed(() => Boolean(suggestion.value))
  const coolingDown = computed(() => cooldownUntil.value > Date.now())
  const canUndoApply = computed(() => Boolean(lastReceipt.value))

  function clearPendingTimer() {
    if (timer) clearTimeout(timer)
    timer = null
    pendingFingerprint = ''
    pendingInputType = ''
  }

  function clearGeneratingVisibilityTimer() {
    if (generatingVisibilityTimer) clearTimeout(generatingVisibilityTimer)
    generatingVisibilityTimer = null
    generating.value = false
  }

  function cancel(reason = 'user') {
    const cancelledFingerprint = activeFingerprint || pendingFingerprint
    if (suggestion.value) {
      recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'dismissed', {
        chars: suggestion.value.length
      })
    }
    if (reason === 'user' && activeFingerprint) dismissedFingerprint = activeFingerprint
    // 光标离开不是“拒绝这个候选”；作用域切换与工具接管同样是临时取消。
    // 这三类都清掉该落笔处的请求去重:用户回到原文处仍可按正常 dwell
    // 重新触发;显式 Esc/点击拒绝继续由 dismissedFingerprint 抑制。
    if (
      ['cursor-move', 'scope-change', 'tool-takeover'].includes(reason)
      && cancelledFingerprint === lastRequestedFingerprint
    ) {
      lastRequestedFingerprint = ''
    }
    requestVersion += 1
    clearPendingTimer()
    clearGeneratingVisibilityTimer()
    requesting.value = false
    requestController?.abort()
    requestController = null
    suggestions.value = []
    activeSuggestionIndex.value = 0
    activeManifest = null
    activeCandidateContext = null
    activeRevision = ''
    activeFingerprint = ''
    error.value = ''
    options.onCandidateDismissed?.({ reason })
  }

  function suppress(reason = '') {
    cancel(reason || 'suppressed')
    if (reason === 'composition') composing.value = true
  }

  function finishComposition() {
    composing.value = false
  }

  function markFailure(message, { visible = true } = {}) {
    failureCount.value += 1
    error.value = visible ? (message || '补全失败') : ''
    if (failureCount.value >= failureLimit) {
      cooldownUntil.value = Date.now() + cooldownMs
      failureCount.value = 0
      if (cooldownVisibilityTimer) clearTimeout(cooldownVisibilityTimer)
      cooldownVisibilityTimer = setTimeout(() => {
        if (cooldownUntil.value <= Date.now()) {
          cooldownUntil.value = 0
          error.value = ''
        }
        cooldownVisibilityTimer = null
      }, cooldownMs)
    }
  }

  function hasActiveCooldown() {
    if (cooldownUntil.value && cooldownUntil.value <= Date.now()) {
      cooldownUntil.value = 0
      error.value = ''
    }
    return cooldownUntil.value > Date.now()
  }

  async function hasTextProviderCredential() {
    if (typeof options.resolveProviderCredential === 'function') {
      return Boolean(await options.resolveProviderCredential())
    }
    // settings.apiKey 是浏览器侧用户密钥；serverKey 表示部署侧代持密钥。
    // 两者都没有时，行内联想注定失败，不应发出请求。
    const settings = await getResolvedApiSettings().catch(() => null)
    if (!settings) return false
    return Boolean(settings.serverKey || (settings.apiKey && !settings.serverKey))
  }

  async function generate(snapshot, cursorPos, manual = false, triggerFingerprint = '', triggerInputType = '') {
    if (typeof options.canStartSuggestion === 'function'
      && options.canStartSuggestion({ manual, snapshot }) === false) return false
    if (!enabled.value || !(snapshot?.documentId || snapshot?.chapterId) || (!manual && (snapshot?.editorFocused === false || hasActiveCooldown()))) return
    const snapshotFingerprint = createWritingRequestFingerprint(snapshot, cursorPos)
    if (!manual && triggerFingerprint && triggerFingerprint !== snapshotFingerprint) return
    const requestFingerprint = triggerFingerprint || snapshotFingerprint
    if (!manual) {
      const permission = canRequestPassiveHint(PASSIVE_HINT_TYPES.WRITING_INLINE)
      // 光标停驻已有文本是用户主动选择的新落笔处，已有 fingerprint 去重、
      // 显式 dismiss 与 4.2s dwell 已负责限流；不能再被全局 45s 窗口吞掉。
      if (!permission.allowed && !(triggerInputType === 'cursor' && permission.reason === 'frequency-limit')) return
    }
    if (!manual) lastRequestedFingerprint = requestFingerprint
    activeFingerprint = requestFingerprint
    pendingFingerprint = ''
    const version = ++requestVersion
    // 凭据解析也是请求生命周期的一部分。先取得 interaction owner，新的输入、
    // Escape 或作用域切换才能在 preflight await 期间使旧版本失效。
    requesting.value = true
    // 凭据门禁：未配置 provider 时被动联想静默跳过（不发请求、不记请求指标、
    // 不在稿面弹错误），手动触发给出可操作提示而不是 provider 原始报错。
    let hasCredential = false
    try {
      hasCredential = await hasTextProviderCredential()
    } catch {
      hasCredential = false
    }
    if (!hasCredential) {
      if (version !== requestVersion) return
      requesting.value = false
      if (manual) markFailure('先在右上角设置里配置模型服务，再使用行内联想', { visible: true })
      activeFingerprint = ''
      return
    }
    if (version !== requestVersion) return
    const startedAt = Date.now()
    let input = null
    try {
      input = buildWritingAgentInput(snapshot, cursorPos)
      options.onContextManifest?.(input.contextManifest)
      recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'requested', {
        chars: String(snapshot.content || '').length,
        at: startedAt
      })
      requestController?.abort()
      requestController = new AbortController()
      clearGeneratingVisibilityTimer()
      if (manual) generating.value = true
      else {
        generatingVisibilityTimer = setTimeout(() => {
          if (version === requestVersion && requesting.value) generating.value = true
          generatingVisibilityTimer = null
        }, 500)
      }
      suggestions.value = []
      activeSuggestionIndex.value = 0
      error.value = ''
      contextLedger.value = input.ledger
      matchedEntries.value = input.matchedEntries
      warnings.value = input.warnings
      const result = await requestAdvisorTask({
        envelope: input.envelope,
        question: '续写光标处的下一句正文，只返回正文。',
        taskType: 'authoring.complete.inline',
        scope: 'continue',
        options: { contextLedgerVersion: input.ledger?.schemaVersion || 1 },
        signal: requestController.signal
      })
      if (version !== requestVersion) return
      if (typeof options.getLiveContextDependencies === 'function'
        && isContextManifestStale(input.contextManifest, options.getLiveContextDependencies())) {
        error.value = manual ? '参考资料已更新，请重新生成' : ''
        recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'stale', { latencyMs: Date.now() - startedAt })
        return
      }
      const latest = options.getSnapshot?.()
      const latestRevision = createWritingRequestFingerprint(latest, latest?.cursorPos)
      if (latestRevision !== input.revision) return
      const normalized = normalizeWritingSuggestions(result.advice)
      if (!normalized.length) {
        recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'empty', {
          latencyMs: Date.now() - startedAt
        })
        markFailure('模型未返回可插入正文', { visible: manual })
        return
      }
      // 请求期间可能打开块推演、模态层或编辑器之外的工具。迟到结果在最终
      // 展示前重新核对 owner，不能先写 suggestions 再靠页面回调清理，因为
      // 那会覆盖块推演冻结的 Ghost candidate。
      if (typeof options.canPresentSuggestion === 'function'
        && options.canPresentSuggestion({ manual, snapshot, cursorPos }) === false) {
        activeFingerprint = ''
        activeManifest = null
        activeRevision = ''
        activeCandidateContext = null
        return false
      }
      suggestions.value = normalized
      activeManifest = input.contextManifest
      activeRevision = input.revision
      activeCandidateContext = Object.freeze({
        manifest: input.contextManifest,
        nodeTarget: input.nodeTarget,
        documentRevision: input.documentRevision,
        cursorPos,
        runOutcome: { status: 'completed' }
      })
      options.onCandidateShown?.({
        text: normalized[0],
        alternatives: normalized,
        ...activeCandidateContext
      })
      failureCount.value = 0
      recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'shown', {
        chars: normalized[0].length,
        latencyMs: Date.now() - startedAt
      })
    } catch (requestError) {
      if (version !== requestVersion) return
      if (requestController?.signal.aborted || requestError?.name === 'AbortError' || requestError?.code === 'AGENT_REQUEST_ABORTED') return
      recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'failed', {
        latencyMs: Date.now() - startedAt,
        reason: requestError?.message
      })
      markFailure(requestError?.message, { visible: manual })
    } finally {
      if (version === requestVersion) {
        requesting.value = false
        clearGeneratingVisibilityTimer()
        requestController = null
      }
    }
  }

  function onInput(input = {}) {
    if (
      lastReceipt.value
      && createWritingRevision(input.content, lastReceipt.value.cursorAfter) !== lastReceipt.value.afterRevision
    ) {
      lastReceipt.value = null
    }
    const fingerprint = createWritingRequestFingerprint(input, input.cursorPos)
    if (requesting.value && activeFingerprint === fingerprint) return
    if (suggestion.value || requesting.value) cancel('superseded')
    if (!shouldTriggerWritingAgent({
      ...input,
      enabled: enabled.value,
      composing: composing.value || input.composing,
      coolingDown: hasActiveCooldown()
    })) {
      clearPendingTimer()
      if (SUPPRESSED_INPUT_TYPES.has(input.inputType) || input.composing) cancel('suppressed')
      return
    }
    if (timer && pendingFingerprint === fingerprint
      && !(pendingInputType === 'cursor' && input.inputType !== 'cursor')) return
    clearPendingTimer()
    if (fingerprint === lastRequestedFingerprint || fingerprint === dismissedFingerprint) return
    error.value = ''
    const delay = typeof debounceMs === 'function' ? debounceMs(input.inputType) : debounceMs
    pendingFingerprint = fingerprint
    pendingInputType = String(input.inputType || '')
    timer = setTimeout(() => {
      timer = null
      const triggerInputType = pendingInputType
      pendingInputType = ''
      generate(options.getContext?.(), input.cursorPos, false, fingerprint, triggerInputType)
    }, delay)
  }

  function manualTrigger() {
    const snapshot = options.getContext?.()
    const cursorPos = options.getSnapshot?.()?.cursorPos ?? 0
    if (typeof options.canStartSuggestion === 'function'
      && options.canStartSuggestion({ manual: true, snapshot }) === false) return false
    cooldownUntil.value = 0
    if (cooldownVisibilityTimer) clearTimeout(cooldownVisibilityTimer)
    cooldownVisibilityTimer = null
    if (timer || requesting.value || suggestion.value) cancel('manual-trigger')
    return generate(snapshot, cursorPos, true)
  }

  function accept(content, cursorPos, mode = 'all') {
    if (!suggestion.value) return null
    if (typeof options.getLiveContextDependencies === 'function'
      && isContextManifestStale(activeManifest, options.getLiveContextDependencies())) {
      error.value = '参考资料已更新，请重新生成'
      return null
    }
    // 注意：markdown 文本路径（非 notebook 编辑器）使用本函数；notebook 路径
    // 走 peek→insert→consume(信任模式)。
    const result = applyWritingSuggestion(content, cursorPos, suggestion.value, mode)
    const receipt = {
      before: String(content || ''),
      cursorBefore: cursorPos,
      cursorAfter: result.newCursorPos,
      afterRevision: createWritingRevision(result.content, result.newCursorPos)
    }
    lastReceipt.value = receipt
    if (mode === 'unit') {
      suggestions.value[activeSuggestionIndex.value] = suggestion.value.slice(result.inserted.length)
      const latest = options.getSnapshot?.() || {}
      activeRevision = createWritingRequestFingerprint({
        ...latest,
        content: result.content,
        cursorPos: result.newCursorPos
      }, result.newCursorPos)
      activeFingerprint = activeRevision
    } else {
      suggestions.value = []
      activeFingerprint = ''
    }
    options.onCandidateAccepted?.({
      mode,
      inserted: result.inserted,
      remaining: suggestions.value[activeSuggestionIndex.value] || ''
    })
    recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'accepted', {
      chars: result.inserted.length,
      reason: mode
    })
    return result
  }

  function consume(mode = 'all', { ignoreRevision = false } = {}) {
    // ignoreRevision：编辑器插入成功后的确认型消费。插入本身会同步推进快照，
    // 此时 revision 必然已变；陈旧性已由插入前的 peek 把关，这里不再二次校验，
    // 否则守卫会把自己刚插入的正文当成"落笔处已变化"而回滚（Ghost Tab 采纳必败）。
    const inserted = peek(mode, { ignoreRevision })
    if (!inserted) return ''
    if (mode === 'unit') suggestions.value[activeSuggestionIndex.value] = suggestion.value.slice(inserted.length)
    else suggestions.value = []
    if (suggestions.value[activeSuggestionIndex.value]) {
      const latest = options.getSnapshot?.()
      activeRevision = createWritingRequestFingerprint(latest, latest?.cursorPos)
      activeFingerprint = activeRevision
      activeCandidateContext = Object.freeze({
        ...(activeCandidateContext || {}),
        nodeTarget: latest?.nodeTarget || null,
        documentRevision: String(latest?.documentRevision ?? ''),
        cursorPos: latest?.cursorPos ?? 0
      })
    } else {
      activeRevision = ''
      activeCandidateContext = null
      activeFingerprint = ''
    }
    options.onCandidateAccepted?.({
      mode,
      inserted,
      remaining: suggestions.value[activeSuggestionIndex.value] || ''
    })
    lastReceipt.value = null
    recordAgentRuntimeEvent(PASSIVE_HINT_TYPES.WRITING_INLINE, 'accepted', {
      chars: inserted.length,
      reason: `${mode}:editor`
    })
    return inserted
  }

  function peek(mode = 'all', { ignoreRevision = false } = {}) {
    if (!suggestion.value) return ''
    if (!ignoreRevision) {
      const latest = options.getSnapshot?.()
      if (activeRevision && createWritingRequestFingerprint(latest, latest?.cursorPos) !== activeRevision) {
        error.value = '落笔处已变化，请重新生成'
        return ''
      }
      // manifest/revision 两道守卫都是“插入前”的陈旧性检查：编辑器插入本身会
      // 同步推进文档 revision，consume 确认阶段必须跳过，否则会拒绝自己刚写入的内容。
      if (typeof options.getLiveContextDependencies === 'function'
        && isContextManifestStale(activeManifest, options.getLiveContextDependencies())) {
        error.value = '参考资料已更新，请重新生成'
        return ''
      }
    }
    return mode === 'unit'
      ? firstSuggestionUnit(suggestion.value)
      : suggestion.value
  }

  function setEnabled(nextEnabled) {
    enabled.value = Boolean(nextEnabled)
    if (!enabled.value) cancel('disabled')
  }

  function cycleSuggestion(delta) {
    if (suggestions.value.length < 2) return false
    activeSuggestionIndex.value = (activeSuggestionIndex.value + delta + suggestions.value.length) % suggestions.value.length
    options.onCandidateShown?.({
      text: suggestion.value,
      alternatives: [...suggestions.value],
      ...(activeCandidateContext || {})
    })
    return true
  }

  function undoLastApply(content) {
    const result = undoWritingSuggestion(content, lastReceipt.value)
    if (result.ok) lastReceipt.value = null
    return result
  }

  onBeforeUnmount(() => {
    cancel('unmount')
    if (cooldownVisibilityTimer) clearTimeout(cooldownVisibilityTimer)
  })

  return {
    enabled,
    setEnabled,
    generating,
    requesting,
    suggestion,
    suggestions,
    activeSuggestionIndex,
    cycleSuggestion,
    visible,
    error,
    matchedEntries,
    warnings,
    contextLedger,
    coolingDown,
    canUndoApply,
    onInput,
    manualTrigger,
    generate,
    accept,
    peek,
    consume,
    cancel,
    suppress,
    finishComposition,
    undoLastApply
  }
}
