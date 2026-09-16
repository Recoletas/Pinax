import { useWorldStore } from '../../stores/worldStore.js'
import { formatAdventureStoryboardSeedContent, generateAdventureProseDraft, generateAdventureStoryboardDraft } from './generationAdventureTriggers.js'
import { addNarrativeAssetDurable, createNarrativeAssetSourceRef, mergeSourceRefs } from '../media/narrativeAssets.js'
import { saveValidatedStoryboardVersion } from '../media/storyboardStore.js'
import { ADVENTURE_TRIGGER_COOLDOWN_MS, ADVENTURE_TRIGGER_MAX_PER_WINDOW, ADVENTURE_TRIGGER_WINDOW_MS, DEFAULT_ADVENTURE_STATE, cloneState, findSession, normalizeAdventureTriggerDraft, normalizeAdventureTriggerHistory, normalizeNumber, normalizeTextValue } from './gameSessionNormalization.js'

// Complete trigger lifecycle: gate, generation, durable adoption and retry state.
export const adventureTriggerActions = {
setAdventureTriggerDraft(type, draft) {
  const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
  this.adventureTriggers = {
    ...(this.adventureTriggers || cloneState(DEFAULT_ADVENTURE_STATE.adventureTriggers, { prose: null, storyboard: null })),
    [triggerType]: normalizeAdventureTriggerDraft(draft, triggerType)
  }
  this.saveCurrentSession()
  return this.adventureTriggers[triggerType]
},

clearAdventureTriggerDraft(type) {
  const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
  this.adventureTriggers = {
    ...(this.adventureTriggers || cloneState(DEFAULT_ADVENTURE_STATE.adventureTriggers, { prose: null, storyboard: null })),
    [triggerType]: null
  }
  this.saveCurrentSession()
},

latestPlotJournalEntry() {
  return this.plotJournal?.[this.plotJournal.length - 1] || null
},

getAdventureTriggerState(type, nowInput = Date.now()) {
  const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
  const latestEntry = this.latestPlotJournalEntry()
  const draft = this.adventureTriggers?.[triggerType] || null
  const now = normalizeNumber(nowInput, Date.now())
  const recentHistory = (this.adventureTriggerHistory || [])
    .filter((item) => now - Number(item?.createdAt || 0) <= ADVENTURE_TRIGGER_WINDOW_MS)
  const usesRemaining = Math.max(0, ADVENTURE_TRIGGER_MAX_PER_WINDOW - recentHistory.length)
  const cooldownRemainingMs = Math.max(0, Number(this.adventureTriggerCooldownUntil || 0) - now)
  const hasDraftForLatestEntry = Boolean(draft && latestEntry && draft.sourcePlotId === (latestEntry.id || latestEntry.chapterId))
  const isAccepted = Boolean(hasDraftForLatestEntry && draft?.status === 'accepted')
  const cooldownRemainingSeconds = Math.ceil(cooldownRemainingMs / 1000)
  let blockReason = ''

  if (!latestEntry?.summary) {
    blockReason = '当前剧情还不足以生成草稿'
  } else if (this.adventureTriggerPendingType === triggerType) {
    blockReason = 'AI 正在处理草稿，请稍候'
  } else if (cooldownRemainingMs > 0) {
    blockReason = `按钮冷却中，请在 ${cooldownRemainingSeconds} 秒后重试`
  } else if (usesRemaining <= 0) {
    blockReason = '本分钟触发次数已达上限，请稍后再试'
  } else if (isAccepted) {
    blockReason = '这段剧情的草稿已保存'
  }

  return {
    type: triggerType,
    latestEntry,
    draft,
    isReady: Boolean(latestEntry?.summary),
    isGenerating: this.adventureTriggerPendingType === triggerType,
    isAccepted,
    cooldownRemainingMs,
    cooldownRemainingSeconds,
    usesRemaining,
    blockReason,
    canGenerate: Boolean(latestEntry?.summary) && this.adventureTriggerPendingType !== triggerType && cooldownRemainingMs === 0 && usesRemaining > 0 && !isAccepted,
    hasDraftForLatestEntry
  }
},

registerAdventureTriggerUsage(type) {
  const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
  const now = Date.now()
  const history = normalizeAdventureTriggerHistory([
    ...(this.adventureTriggerHistory || []).filter((item) => now - Number(item?.createdAt || 0) <= ADVENTURE_TRIGGER_WINDOW_MS),
    { type: triggerType, createdAt: now }
  ])
  this.adventureTriggerHistory = history
  this.adventureTriggerCooldownUntil = now + ADVENTURE_TRIGGER_COOLDOWN_MS
  this.saveCurrentSession()
},

buildAdventureTriggerTitle(type, plotEntry) {
  const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
  const chapterId = normalizeTextValue(plotEntry?.chapterId || '')
  if (triggerType === 'storyboard') {
    return chapterId ? `${chapterId} 分镜草稿` : '冒险分镜草稿'
  }
  return chapterId ? `${chapterId} 章节草稿` : '冒险章节草稿'
},

async generateAdventureTriggerDraft(type) {
  const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
  const triggerState = this.getAdventureTriggerState(triggerType)
  if (!triggerState.isReady || !triggerState.latestEntry) {
    throw new Error('当前剧情还不足以生成草稿')
  }
  if (triggerState.isGenerating) {
    throw new Error('AI 正在处理草稿，请稍候')
  }
  if (triggerState.cooldownRemainingMs > 0) {
    throw new Error('按钮冷却中，请稍后再试')
  }
  if (triggerState.usesRemaining <= 0) {
    throw new Error('本分钟触发次数已达上限，请稍后再试')
  }

  this.loadApiSettings()
  this.adventureTriggerPendingType = triggerType
  const plotEntry = triggerState.latestEntry
  const title = this.buildAdventureTriggerTitle(triggerType, plotEntry)

  this.setAdventureTriggerDraft(triggerType, {
    type: triggerType,
    title,
    chapterId: plotEntry.chapterId,
    sourcePlotId: plotEntry.id || plotEntry.chapterId,
    summary: plotEntry.summary,
    sourceMessageIds: plotEntry.sourceMessageIds || [],
    updatedAt: Date.now(),
    generatedAt: Date.now(),
    status: 'generating',
    ...(triggerType === 'storyboard' ? { shots: [] } : { content: '' })
  })

  try {
    const worldStore = useWorldStore()
    const payload = {
      worldbook: worldStore.activeWorldbook,
      runtimeState: this.getRuntimeSnapshot(),
      chatHistory: this.chatHistory,
      plotEntry,
      settings: this.apiSettings,
      sessionTitle: findSession(this.sessions, this.currentSessionId)?.title || ''
    }

    const result = triggerType === 'storyboard'
      ? await generateAdventureStoryboardDraft(payload)
      : await generateAdventureProseDraft(payload)

    if (!result?.success) {
      throw new Error(triggerType === 'storyboard' ? '整理分镜失败，请稍后重试' : '章节草稿生成失败，请稍后重试')
    }

    this.registerAdventureTriggerUsage(triggerType)
    return this.setAdventureTriggerDraft(triggerType, {
      type: triggerType,
      title,
      chapterId: plotEntry.chapterId,
      sourcePlotId: plotEntry.id || plotEntry.chapterId,
      summary: plotEntry.summary,
      sourceMessageIds: plotEntry.sourceMessageIds || [],
      generatedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'ready',
      ...(triggerType === 'storyboard'
        ? { shots: result.shots || [] }
        : { content: result.content || '' })
    })
  } catch (error) {
    this.setAdventureTriggerDraft(triggerType, {
      type: triggerType,
      title,
      chapterId: plotEntry.chapterId,
      sourcePlotId: plotEntry.id || plotEntry.chapterId,
      summary: plotEntry.summary,
      sourceMessageIds: plotEntry.sourceMessageIds || [],
      generatedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'error',
      error: error?.message || '草稿生成失败',
      ...(triggerType === 'storyboard' ? { shots: [] } : { content: '' })
    })
    throw error
  } finally {
    this.adventureTriggerPendingType = null
  }
},

async acceptAdventureTriggerDraft(type) {
  const triggerType = type === 'storyboard' ? 'storyboard' : 'prose'
  const draft = this.adventureTriggers?.[triggerType]
  if (!draft || draft.status !== 'ready') {
    throw new Error('当前没有可采纳的草稿')
  }

  const plotEntry = this.latestPlotJournalEntry()
  const projectId = this.worldId || useWorldStore().activeWorldbook?.id || null
  const sourceMessageIds = Array.isArray(draft.sourceMessageIds) ? draft.sourceMessageIds : []
  const creativeSourceRefs = this.getCurrentCreativeSourceRefs(sourceMessageIds, plotEntry)

  if (triggerType === 'storyboard') {
    const persistedAsset = addNarrativeAssetDurable({
      title: draft.title || this.buildAdventureTriggerTitle('storyboard', plotEntry),
      content: formatAdventureStoryboardSeedContent(draft),
      kind: 'storyboard-seed',
      projectId,
      status: 'inbox',
      source: {
        type: 'experience-session',
        id: this.currentSessionId || '',
        messageIds: sourceMessageIds
      },
      sourceRefs: creativeSourceRefs
    })
    if (!persistedAsset.ok) throw new Error('素材保存失败，未采纳这份分镜草稿')
    const asset = persistedAsset.asset
    const storyboardSourceRefs = mergeSourceRefs([
      ...asset.sourceRefs,
      createNarrativeAssetSourceRef(asset)
    ])

    const storyboard = saveValidatedStoryboardVersion({
      projectId,
      source: {
        sourceType: 'narrative-asset',
        sourceId: asset.id,
        title: asset.title
      },
      sourceRefs: storyboardSourceRefs,
      shots: draft.shots || [],
      taskType: 'adventure.trigger.storyboard',
      parameters: {
        chapterId: draft.chapterId || '',
        sessionId: this.currentSessionId || '',
        sourcePlotId: draft.sourcePlotId || ''
      }
    })

    const acceptedDraft = this.setAdventureTriggerDraft(triggerType, {
      ...draft,
      status: 'accepted',
      assetId: asset.id,
      storyboardDocumentId: storyboard.document.id,
      storyboardVersionId: storyboard.version.versionId,
      acceptedAt: Date.now(),
      updatedAt: Date.now()
    })
    return {
      type: triggerType,
      draft: acceptedDraft,
      asset,
      storyboard
    }
  }

  const persistedAsset = addNarrativeAssetDurable({
    title: draft.title || this.buildAdventureTriggerTitle('prose', plotEntry),
    content: draft.content || '',
    kind: 'draft-prose',
    projectId,
    status: 'inbox',
      source: {
        type: 'experience-session',
        id: this.currentSessionId || '',
        messageIds: sourceMessageIds
      },
      sourceRefs: creativeSourceRefs
    })
  if (!persistedAsset.ok) throw new Error('素材保存失败，未采纳这份正文草稿')
  const asset = persistedAsset.asset

  const acceptedDraft = this.setAdventureTriggerDraft(triggerType, {
    ...draft,
    status: 'accepted',
    assetId: asset.id,
    acceptedAt: Date.now(),
    updatedAt: Date.now()
  })
  return {
    type: triggerType,
    draft: acceptedDraft,
    asset
  }
},

dismissAdventureTriggerDraft(type) {
  this.clearAdventureTriggerDraft(type)
},
}

