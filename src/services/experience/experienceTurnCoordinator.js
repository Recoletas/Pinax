import { recordMemory } from '../api'
import {
  buildNarrativeFormatInstructions,
  ensureNarrativeMessage,
  getTrustedMessageSpeaker,
  parseNarrativePresentation
} from '../narrativePresentation'
import {
  archiveMemoryCandidate,
  listScopedActiveMemoryCandidates
} from '../memoryCandidates'
import { buildNarrativeKernel } from '../agents/narrativeKernel'
import { buildNarrativeContinuityFrame } from '../agents/narrativeContinuityFrame'
import { getNarrativeResourceIndex } from '../agents/narrativeResourceIndex'
import { buildNarrativeContextAudit } from '../agents/narrativeContextAudit'
import { createNarrativeToolRegistry } from '../agents/narrativeToolRegistry'
import {
  buildTurnReceipt,
  createNarrativeAgentContextLedger,
  runNarrativeAgentGeneration
} from '../agents/narrativeAgentOrchestrator'
import { resolveNarrativeSceneSummary } from '../agents/narrativeSceneSummary'
import { buildNarrativeSceneThread } from '../agents/narrativeSceneThread'
import {
  createNarrativeProductionObserver,
  recordNarrativeProductionRun
} from '../agents/narrativeProductionMetrics'
import { useWorldStore } from '../../stores/worldStore'
import {
  createMessageId,
  createNarrativeTurnRecord,
  commitNarrativeTurnRecord,
  failNarrativeTurnRecord
} from '../../../shared/narrativeTurnContract.js'
import {
  normalizeNarrativeIntent,
  intentToOrchestratorMode,
  narrativeExpansionFactor
} from '../../../shared/narrativeGenerationIntentContract.js'
import { combineExtensionContent } from './gameSessionNormalization.js'

// A turn has exactly one in-flight controller per store instance. Keeping this
// here makes cancellation part of the turn lifecycle instead of a store-global
// implementation detail.
const activeTurnControllers = new WeakMap()

export function cancelExperienceTurn(store, reason = 'user-cancelled') {
  const controller = activeTurnControllers.get(store)
  if (controller && !controller.signal.aborted) {
    const error = new Error(reason)
    error.code = 'NARRATIVE_AGENT_ABORTED'
    controller.abort(error)
  }
  store.narrativeAgentStatus = null
}

// The implementation body is intentionally kept as one transaction below.
// Preparation, streaming, runtime projection, durable commit and rollback must
// not be split into independently callable half-turn helpers.

export async function runExperienceTurn(store, { narrativeMode: _narrativeMode = '', directorNote = '', userMessageId = '', parentTurnId = null, intent = null } = {}) {
      store.cancelNarrativeGeneration('superseded')
      const controller = new AbortController()
      const requestId = `narrative_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const productionObserver = createNarrativeProductionObserver()
      activeTurnControllers.set(store, controller)
      store.isLoading = true
      store.lastError = null
      let messageIndex = -1
      let placeholderId = ''
      let productionMode = 'continue'
      let effectiveIntent = ''
      let productionOutcome = 'error'
      let productionError = null
      let productionKernel = null
      let completedAgentRun = null
      // C4：同消息续接目标 + 回滚基线（catch 回滚时也要用，故声明在 try 外）
      let extensionTarget = null
      let extensionBase = null
      // R1a：回合事务。在 provider 调用前抓取 preRuntimeSnapshot，失败时回滚。
      let turnRecord = null
      try {
        store.loadApiSettings()

        const worldStore = useWorldStore()
        const worldbook = worldStore.activeWorldbook
        const hasAssistantHistory = store.chatHistory.some(m => m.role === 'assistant')
        // C1：显式 intent 优先；否则按历史推断（无 assistant 历史 → open）。
        // normalizeNarrativeIntent 对空值恒返回 'respond'，故这里先判断是否显式传入。
        effectiveIntent = (intent != null && String(intent).trim() !== '')
          ? normalizeNarrativeIntent(intent)
          : (!hasAssistantHistory ? 'open' : 'respond')
        // C4：extend → 同消息续接目标（当前分支最后一条可见已提交 assistant）。
        extensionTarget = effectiveIntent === 'extend' ? store.findLastVisibleAssistantMessage() : null
        const baseTurnId = extensionTarget
          ? (store.findTurnByMessageId(extensionTarget.id)?.id || null)
          : null

        // R1a：生成前快照 —— 覆盖当前位置/时间/角色/关系/事实/目标/事件/记忆游标。
        // 必须在本回合所有 state 修改（extractAndUpdateState 等）之前抓取。
        turnRecord = createNarrativeTurnRecord({
          id: requestId,
          // C4：extension 以 base turn 为父；否则重生成传 sibling 父、正常生成走 lastCommittedTurnId
          parentTurnId: extensionTarget
            ? baseTurnId
            : (parentTurnId != null ? parentTurnId : (store.lastCommittedTurnId || null)),
          // P0-1：真实生成必须落在当前活动分支，并记录本回合 user 消息 id
          branchId: store.activeBranchId || 'main',
          userMessageIds: userMessageId ? [userMessageId] : [],
          preRuntimeSnapshot: store.getRuntimeSnapshot({ forSession: false }),
          kind: extensionTarget ? 'extension' : 'normal',
          baseMessageId: extensionTarget?.id || null,
        })
        store.pendingTurnRecord = turnRecord

        const isInitGeneration = effectiveIntent === 'open'
        productionMode = intentToOrchestratorMode(effectiveIntent)
        const narrativeProjectId = store.worldId || worldbook?.id || ''
        const narrativeSessionId = store.currentSessionId || ''
        const sceneSummaryResolution = resolveNarrativeSceneSummary({
          messages: store.chatHistory,
          previousSummary: store.narrativeSceneSummary,
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId
        })
        store.narrativeSceneSummary = sceneSummaryResolution.summary
        // C2.3：ContinuityFrame —— 从当前分支可见消息（带 presentation）派生，
        // 供 turn note 做连续锚点（替代从 recent block 重新切句）。
        const continuityVisibleIds = store.currentBranchVisibleMessageIds()
        const continuityMessages = (store.messages || []).filter((m) => (
          m && !m.superseded && (!m.branchId || continuityVisibleIds.has(m.id))
        ))
        // Q2：SceneThread —— 场景未变化时复用，否则重建（软状态，随快照/分支/撤销/刷新恢复）。
        store.sceneThread = buildNarrativeSceneThread({
          previous: store.sceneThread,
          runtimeState: {
            worldMapState: store.worldMapState,
            writingTime: store.writingTime,
            goals: store.goals,
            encounteredCharacters: store.encounteredCharacters,
            historyNode: store.historyNode
          },
          messages: continuityMessages
        })
        const continuityFrame = buildNarrativeContinuityFrame({
          messages: continuityMessages,
          runtimeState: {
            worldMapState: store.worldMapState,
            writingTime: store.writingTime,
            goals: store.goals,
            encounteredCharacters: store.encounteredCharacters,
            historyNode: store.historyNode
          }
        })
        const narrativeKernel = buildNarrativeKernel({
          worldbook,
          runtimeState: {
            worldMapState: store.worldMapState,
            writingTime: store.writingTime,
            placeStates: store.placeStates,
            characterStates: store.characterStates,
            characterRelations: store.characterRelations,
            canonicalFacts: store.canonicalFacts,
            runtimeEvents: store.runtimeEvents,
            encounteredCharacters: store.encounteredCharacters,
            factionRelations: store.factionRelations,
            goals: store.goals,
            keyChoices: store.keyChoices,
            playerCharacter: store.playerCharacter,
            dialogueCharacter: store.dialogueCharacter,
            historyNode: store.historyNode
          },
          messages: store.chatHistory,
          sceneSummary: store.narrativeSceneSummary,
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId,
          authorNote: directorNote,  // R2：本轮导演注
          continuityFrame,
          sceneThread: store.sceneThread
        })
        productionKernel = narrativeKernel
        const narrativeMemories = listScopedActiveMemoryCandidates({
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId,
          limitPerScope: 100
        }).filter((memory) => ['project', 'session'].includes(memory.scope))

        // P1-4：记忆分支隔离 —— 排除属于非当前分支链 turn 产生的候选。
        // 手动/共享候选（不在任何 turn 的 memoryCandidateIds 里）保留。
        const branchMemoryFilter = store.buildBranchMemoryFilter()
        const narrativeMemoriesFiltered = branchMemoryFilter ? narrativeMemories.filter(branchMemoryFilter) : narrativeMemories

        const narrativeIndex = getNarrativeResourceIndex({
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId,
          worldbook,
          runtimeState: {
            factionRelations: store.factionRelations,
            characterRelations: store.characterRelations,
            canonicalFacts: store.canonicalFacts,
            placeStates: store.placeStates,
            worldMapState: store.worldMapState
          },
          memories: narrativeMemoriesFiltered
        })
        const narrativeRegistry = createNarrativeToolRegistry({
          index: narrativeIndex,
          projectId: narrativeProjectId,
          sessionId: narrativeSessionId,
          currentPlaceId: store.worldMapState?.placeId || ''
        })
        store.lastNarrativeKernel = narrativeKernel
        store.lastWorldbookContext = null
        store.lastMemoryContext = ''
        store.lastMemoryRecall = {
          source: 'narrative-tools',
          includedCount: 0,
          excludedCount: 0,
          totalItems: narrativeIndex.counts?.memory || 0,
          contentChars: 0,
          items: [],
          included: [],
          excluded: [],
          counts: { project: 0, session: 0 }
        }

        // C4：extend → 复用目标消息（同消息续接）；否则新建 placeholder。extensionBase 作为回滚基线。
        extensionBase = null
        if (extensionTarget) {
          extensionTarget.isStreaming = true
          extensionBase = {
            content: extensionTarget.content || '',
            presentation: extensionTarget.presentation || null,
            segments: extensionTarget.segments || null
          }
          placeholderId = extensionTarget.id
          messageIndex = store.messages.findIndex((message) => message?.id === extensionTarget.id)
        } else {
          messageIndex = store.messages.length
          const placeholder = ensureNarrativeMessage({
            role: 'assistant',
            name: store.dialogueCharacter?.name || store.aiCharacter.name,
            content: '',
            timestamp: Date.now(),
            dialogueMode: !!store.dialogueCharacter,
            isStreaming: true,
            branchId: store.activeBranchId,  // R1b：区分分支
            // P1-5：携带 cast 的 speakerMap（名字→稳定 id），dialogue block 解析时
            // speakerId 与 SceneCast 对齐，角色改名不漂移
            speakerMap: store.buildCastSpeakerMap()
          }, messageIndex)
          placeholderId = placeholder.id
          store.messages.push(placeholder)
        }
        const getPlaceholder = () => store.messages.find((message) => message?.id === placeholderId)

        let fullContent = ''
        let cleanContent = ''
        // 修复输出截断：原 init=1500/常规=800/auto=460 对中文叙事偏小，
        // 且工具调用（决策+参数）与正文共用同一 maxTokens 预算，模型常在
        // Q1：maxTokens 按 intent 决定，并按叙事展开度缩放 —— open 基 3000、其他基 2600，
        // 足以容纳 BeatPlan/工具结果与完整场景正文。展开度由 resolveNarrativeExpansion() 读取。
        const expansionLevel = store.resolveNarrativeExpansion()
        const baseTokens = isInitGeneration ? 3000 : 2600
        const maxTokens = Math.min(5000, Math.round(baseTokens * narrativeExpansionFactor(expansionLevel)))
        const agentRun = await runNarrativeAgentGeneration({
          kernel: narrativeKernel,
          registry: narrativeRegistry,
          mode: productionMode,
          intent: effectiveIntent,  // C1：传 intent 给 orchestrator（供 turn note）
          formatInstructions: buildNarrativeFormatInstructions(),
          worldId: store.worldId,
          settings: { ...store.apiSettings, expansion: expansionLevel },
          requestId,
          signal: controller.signal,
          maxTokens,
          onStatus: (status) => {
            productionObserver.observeStatus(status)
            if (activeTurnControllers.get(store) === controller) {
              store.setNarrativeAgentStatus({
                ...status,
                requestId
              })
            }
          },
          callbacks: {
            onChunk: (chunk) => {
              productionObserver.observeChunk(chunk)
              if (chunk.content) {
                fullContent += chunk.content
                const targetMessage = getPlaceholder()
                if (!targetMessage) return
                const parsed = parseNarrativePresentation(fullContent, {
                  messageId: targetMessage.id,
                  complete: false,
                  fallbackSpeaker: getTrustedMessageSpeaker(targetMessage),
                  role: targetMessage.role,
                  // P1-4：流式解析也带 speakerMap（保持 speakerId 与 cast 对齐）
                  speakerMap: targetMessage.speakerMap || null,
                  // P4：可信说话者注册表（未知 marker 名称 → 未署名对白）
                  speakerRegistry: store.buildSpeakerRegistry()
                })
                const combined = combineExtensionContent(extensionBase, parsed)
                cleanContent = combined.content
                targetMessage.content = combined.content
                targetMessage.presentation = combined.presentation
              }
            },
            onComplete: () => {
              const targetMessage = getPlaceholder()
              if (targetMessage) {
                targetMessage.isStreaming = false
                const parsed = parseNarrativePresentation(fullContent, {
                  messageId: targetMessage.id,
                  complete: true,
                  fallbackSpeaker: getTrustedMessageSpeaker(targetMessage),
                  role: targetMessage.role,
                  // P1-4：完成解析也带 speakerMap
                  speakerMap: targetMessage.speakerMap || null,
                  // P4：可信说话者注册表（未知 marker 名称 → 未署名对白）
                  speakerRegistry: store.buildSpeakerRegistry()
                })
                const combined = combineExtensionContent(extensionBase, parsed)
                cleanContent = combined.content
                targetMessage.content = combined.content
                targetMessage.presentation = combined.presentation
              }
            },
            onError: (error) => {
              // eslint-disable-next-line no-console
              console.error('Stream error:', error)
            }
          }
        })
        completedAgentRun = agentRun
        const completedMessage = getPlaceholder()
        messageIndex = store.messages.findIndex((message) => message?.id === placeholderId)
        store.lastNarrativeContextAudit = buildNarrativeContextAudit({
          kernel: narrativeKernel,
          index: narrativeIndex,
          toolTrace: agentRun.trace
        })
        store.lastContextLedger = createNarrativeAgentContextLedger({
          run: agentRun,
          kernel: narrativeKernel,
          sessionId: narrativeSessionId,
          worldbookId: narrativeProjectId
        })

        const finalSource = String(agentRun.finalText || fullContent || completedMessage?.content || '')
        const finalParsed = parseNarrativePresentation(finalSource, {
          messageId: completedMessage?.id,
          complete: true,
          fallbackSpeaker: getTrustedMessageSpeaker(completedMessage),
          role: completedMessage?.role,
          // P1-4：最终清洗解析也带 speakerMap
          speakerMap: completedMessage?.speakerMap || null,
          // P4：可信说话者注册表（未知 marker 名称 → 未署名对白）
          speakerRegistry: store.buildSpeakerRegistry()
        })
        // P0：parser 可观察性 —— 块数 / 平均块长 / 最长块长（供诊断分段问题）。
        {
          const blockChars = (finalParsed?.blocks || []).map((block) => String(block?.text || '').length)
          store.lastNarrativeAgentTrace = {
            ...agentRun.trace,
            presentationStats: {
              blockCount: blockChars.length,
              avgBlockChars: blockChars.length
                ? Math.round(blockChars.reduce((sum, value) => sum + value, 0) / blockChars.length)
                : 0,
              maxBlockChars: blockChars.length ? Math.max(...blockChars) : 0
            },
            // P2：activatedLore —— 激活条目数与原因分布（constant/bound/history/keyword/starter）
            loreStats: narrativeKernel?.activatedLore
              ? {
                  activeCount: narrativeKernel.activatedLore.entries.length,
                  totalMatched: narrativeKernel.activatedLore.totalMatched,
                  truncatedCount: narrativeKernel.activatedLore.truncatedCount,
                  reasons: narrativeKernel.activatedLore.reasons
                }
              : null
          }
        }
        cleanContent = combineExtensionContent(extensionBase, finalParsed).content
        if (!cleanContent || messageIndex < 0) {
          throw Object.assign(new Error('模型没有返回可用正文'), {
            code: 'NARRATIVE_STREAM_EMPTY'
          })
        }
        // C4：extend 只消费新 segment 做状态提取/记忆/机制，避免重复消费整篇聚合正文。
        const stateContent = extensionTarget ? (finalParsed.content || '') : cleanContent
        // C4：extend 原地更新最后一条 assistant chatHistory；否则追加新条目。
        if (extensionTarget) {
          const lastAssistantIdx = store.chatHistory.map((m) => m.role).lastIndexOf('assistant')
          if (lastAssistantIdx >= 0) store.chatHistory[lastAssistantIdx].content = cleanContent
          else store.chatHistory.push({ role: 'assistant', content: cleanContent })
        } else {
          store.chatHistory.push({ role: 'assistant', content: cleanContent })
        }

        // 追加运行时事件侧车 (v1: capped append-only envelope)
        // P1：携带 messageId/turnId provenance，供删除事务精确清理。
        store.appendRuntimeEvent({
          type: 'turn',
          source: 'assistant',
          payload: {
            preview: String(cleanContent || '').slice(0, 200),
            messageIndex
          },
          messageId: getPlaceholder()?.id || null,
          turnId: turnRecord?.id || null
        })

        // P0-3：回合事务提交**延迟**到所有 state 修改之后（见 productionOutcome 前）。
        // 正文已写入但 turn record 尚未 committed —— 后续步骤（状态提取/机制/记忆）失败
        // 时 catch 会回滚 preRuntimeSnapshot，不留"正文已提交、状态未提交"的半成功回合。
        // P0-2：commit 前**不**保存会话 —— 崩溃不留下无 committed turn 的正文。

        // 记录重要的叙事事件到记忆系统（C4：只消费新 segment）
        if (stateContent && stateContent.length > 20) {
          // 检测是否有重要事件（对话、物品获得、地点发现等）
          const hasDialogue = /"[^"]{5,}"|“[^”]{5,}”|「[^」]{5,}」/.test(stateContent)
          const hasItem = /获得|发现.*物品|得到/.test(stateContent)
          const hasLocation = /首次进入|发现.*地方|抵达|踏入/.test(stateContent)

          if (hasDialogue || hasItem || hasLocation) {
            const eventType = hasLocation ? 'location_discovery' : hasItem ? 'item_acquisition' : 'dialogue'
            // R5：记忆候选结构化上下文 —— 谁、在哪、何时、哪个回合
            // （metadata 原样落库，供追溯"谁对谁说了什么关键事实"）
            const speaker = store.dialogueCharacter?.name || store.playerCharacter?.name || '主角'
            const place = store.worldMapState?.currentScene || ''
            const time = store.writingTime ? `${store.writingTime.year || ''}-${store.writingTime.month || ''}-${store.writingTime.day || ''}` : ''
            // P0-2：await 记忆写入 —— 候选 id 在回合事务提交前收集，随 commit 后统一保存，
            // 避免"回合已提交、候选 id 异步迟到且未保存"的不一致。
            try {
              const memRes = await recordMemory(
                stateContent,
                eventType,
                {
                  character: speaker,
                  scope: 'session',
                  scopeId: store.currentSessionId || '',
                  sourceRef: `gameStore:${store.currentSessionId || 'unknown'}:${messageIndex}`,
                  speaker,
                  place,
                  time,
                  turnId: turnRecord?.id || '',
                }
              )
              if (memRes?.candidate?.id && turnRecord) {
                turnRecord.memoryCandidateIds = [...new Set([
                  ...(turnRecord.memoryCandidateIds || []),
                  memRes.candidate.id
                ])]
              }
            } catch {
              // 记忆写入失败不阻塞正文提交（候选是尽力而为）
            }
          }
        }

        // 内联事件标记保留（对话、物品等可点击查看）—— C4：只消费新 segment
        const inlineEvents = store.detectInlineEvents(stateContent, messageIndex)
        if (inlineEvents.length > 0) {
          store.addInlineEvents(inlineEvents)
        }

        // 从 AI 回复中提取状态更新 —— C4：只消费新 segment
        store.extractAndUpdateState(stateContent)

        // Q4：写回 SceneThread —— 把本轮 BeatPlan 的有效变化/人物 meaningful move 写入软状态，
        // 并在 post snapshot 之前完成，保证分支/撤销/刷新恢复一致。
        if (store.sceneThread && completedAgentRun?.beatPlan) {
          store.sceneThread = store.applyBeatPlanToSceneThread(store.sceneThread, completedAgentRun.beatPlan)
        }

        // R1b：state 提取完成后补抓 post snapshot（候选切换时恢复该分支的 state）
        if (turnRecord) {
          turnRecord.postRuntimeSnapshot = store.getRuntimeSnapshot({ forSession: false })
        }

        // 检测机制触发（战斗、交易、任务、对话）—— C4：只消费新 segment
        const mechanism = store.detectMechanismTriggers(stateContent)
        if (mechanism) {
          const targetMessage = getPlaceholder()
          if (targetMessage) {
            targetMessage.mechanismTrigger = mechanism
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('story-mechanism-ready', {
              detail: mechanism
            }))
          }
          // P0-3：不再在 commit 前保存会话（commit 后统一保存）
        }

        // P0-3：回合事务提交 —— 所有 state 修改（extractAndUpdateState/机制/记忆）完成后，
        // 才把 turn record 标记 committed。正文、状态、回执作为同一事务原子提交。
        if (turnRecord) {
          const targetMsg = getPlaceholder()
          // C4：extension 把新正文写为 segment（首次 extend 时先包装 base segment）。
          if (extensionTarget) {
            const now = Date.now()
            const segments = Array.isArray(targetMsg.segments)
              ? targetMsg.segments
              : [{
                  id: createMessageId('segment'),
                  turnId: baseTurnId || '',
                  intent: 'respond',
                  cleanContent: extensionBase.content,
                  blocks: extensionBase.presentation?.blocks || [],
                  createdAt: targetMsg.timestamp || now,
                  sourceRequestId: null,
                  base: true
                }]
            const segmentId = createMessageId('segment')
            segments.push({
              id: segmentId,
              turnId: turnRecord.id,
              intent: 'extend',
              cleanContent: finalParsed.content,
              blocks: finalParsed.blocks || [],
              createdAt: now,
              sourceRequestId: requestId
            })
            // 注意：extractAndUpdateState 可能触发 saveCurrentSession（normalize 重排 messages），
            // 因此必须写回当前 messages 中的对象（targetMsg），而非早期缓存的 extensionTarget。
            targetMsg.segments = segments
            turnRecord.segmentId = segmentId
          }
          const receipt = buildTurnReceipt({
            ledger: store.lastContextLedger,
            run: completedAgentRun,
            sceneSummary: store.narrativeSceneSummary,
            directorNote,
          })
          commitNarrativeTurnRecord(turnRecord, {
            assistantMessageIds: extensionTarget ? [] : (targetMsg?.id ? [targetMsg.id] : []),
            directorNote: String(directorNote || '').trim() || null,
            receipt,
            segmentId: extensionTarget ? turnRecord.segmentId : null,
          })
          store.turnRecords[turnRecord.id] = turnRecord
          store.lastCommittedTurnId = turnRecord.id
          store.pendingTurnRecord = null
          store.lastTurnReceipt = receipt  // P1-5：体验页渲染最近一次回执
          store.pendingBranchParentTurnId = null  // P1-3：新分支已 committed，清理回退游标
        }

        // P0-2：回合事务提交后统一保存会话 —— 正文、turnRecords、状态作为
        // 一个事务落盘（B-R2：成功出口的唯一最终一致态提交点，带立即 flush）
        if (store.currentSessionId) {
          store.commitCurrentSessionNow()
        }

        // Authoring runtime：可见正文提交后，经统一 bridge 调度一次后台派生观察器。
        // 观察器不阻塞、不改正文；保存/回滚顺序保持不变（此调用在事务与落盘之后）。
        await store.commitAuthoringProseResult({
          text: finalParsed.content,
          sourceRefs: turnRecord?.id ? [`turn:${turnRecord.id}`] : []
        })

        productionOutcome = 'success'
      } catch (e) {
        productionError = e
        productionOutcome = controller.signal.aborted || e?.code === 'NARRATIVE_AGENT_ABORTED'
          ? 'cancelled'
          : 'error'
        // C4：extension 失败 → 恢复目标消息基线（不删除已有消息）；否则移除 placeholder。
        if (extensionTarget) {
          const rollbackTarget = store.messages.find((message) => message?.id === placeholderId) || extensionTarget
          rollbackTarget.isStreaming = false
          rollbackTarget.content = extensionBase.content
          rollbackTarget.presentation = extensionBase.presentation
          rollbackTarget.segments = extensionBase.segments
        } else {
          const placeholderIndex = store.messages.findIndex((message) => message?.id === placeholderId)
          if (placeholderIndex >= 0) {
            store.messages.splice(placeholderIndex, 1)
          }
        }
        // R1a：回合事务失败回滚 —— 恢复生成前的 runtime state。
        // 取消/失败都不应留下"半提交"的 state（地点/时间/角色被改了但正文没提交）。
        if (turnRecord?.preRuntimeSnapshot) {
          failNarrativeTurnRecord(turnRecord)
          store.applyRuntimeSnapshot(turnRecord.preRuntimeSnapshot)
          // P0-3：恢复后重建 chatHistory —— applyRuntimeSnapshot 不碰消息层，
          // 但正文已写入 chatHistory，必须重建避免"正文残留但回合未提交"。
          store.rebuildChatHistory()
          // P0-3：归档本回合已入队的记忆候选（状态提取前已真实入库，失败必须清理）
          for (const candidateId of turnRecord.memoryCandidateIds || []) {
            try { archiveMemoryCandidate(candidateId, { note: 'turn-failed' }) } catch { /* 尽力而为 */ }
          }
          store.pendingTurnRecord = null
        }
        // P1-5：导演注失败保留 —— 本回合的导演注未消费，恢复到 pending 供重试
        if (directorNote && !store.pendingDirectorNote) {
          store.pendingDirectorNote = String(directorNote).trim() || null
        }
        if (!controller.signal.aborted && e?.code !== 'NARRATIVE_AGENT_ABORTED') {
          // eslint-disable-next-line no-console
          console.error('AI Error:', e)
          store.lastError = e.message
          store.messages.push({ id: createMessageId('system'), role: 'system', content: `AI 错误：${e.message}`, timestamp: Date.now() })
          store.setNarrativeAgentStatus({
            phase: 'error',
            code: e?.code || 'NARRATIVE_AGENT_FAILED',
            message: e.message,
            at: Date.now()
          })
        }
      } finally {
        const ownsGeneration = activeTurnControllers.get(store) === controller
        if (ownsGeneration) {
          activeTurnControllers.delete(store)
          store.isLoading = false
          if (store.narrativeAgentStatus?.phase === 'complete') {
            store.narrativeAgentStatus = null
          }
        }
        const timing = productionObserver.snapshot()
        const targetMessage = store.messages.find((message) => message?.id === placeholderId)
        const trace = completedAgentRun?.trace || null
        const summaryBlock = (productionKernel?.blocks || []).find((block) => block?.kind === 'summary')
        const isTypedFailureVisible = productionOutcome !== 'error'
          || store.narrativeAgentStatus?.phase === 'error'
          || store.messages.some((message) => (
            message?.role === 'system'
            && String(message?.content || '').startsWith('AI 错误：')
          ))
        recordNarrativeProductionRun({
          runId: requestId,
          provider: store.apiSettings?.provider,
          model: store.apiSettings?.model,
          mode: productionMode,
          intent: effectiveIntent,
          outcome: productionOutcome,
          errorCode: productionError?.code,
          retryable: productionError?.retryable,
          protocolOk: productionOutcome === 'success'
            ? true
            : (/^NARRATIVE_(PROVIDER_|AGENT_DECISION_INVALID)/.test(productionError?.code || '')
                ? false
                : null),
          protocol: trace?.protocol || 'agent-sse-v1',
          capabilitySource: trace?.capabilitySource || (store.apiSettings?.capabilities ? 'probe' : 'static-default'),
          toolRepairCount: trace?.toolRepairCount ?? trace?.repairCount,
          reasoningRoundTrip: trace?.reasoningRoundTrip,
          terminalMode: trace?.terminalMode,
          groundingPolicy: trace?.groundingPolicy?.level,
          orphanedCallCount: trace?.orphanedCallCount,
          fallbackReason: trace?.fallbackReason,
          transcriptRevision: trace?.transcriptRevision,
          finishReason: trace?.finishReason,
          boundedCompletion: trace?.boundedCompletion,
          incomplete: trace?.incomplete,
          plan: {
            revision: trace?.planRevision,
            mode: trace?.beatMode,
            targetChars: trace?.targetChars
          },
          timing,
          tools: {
            rounds: completedAgentRun?.toolRounds ?? timing.toolRounds,
            calls: completedAgentRun?.totalCalls ?? timing.totalCalls,
            evidenceCount: completedAgentRun?.finalToolResults?.length ?? timing.evidenceCount,
            errorCount: (trace?.calls || []).filter((call) => call?.errorCode).length
          },
          usage: {
            inputTokens: completedAgentRun?.usage?.inputTokens,
            outputTokens: completedAgentRun?.usage?.outputTokens,
            totalTokens: completedAgentRun?.usage?.totalTokens,
            estimatedFinalTokens: timing.estimatedOutputTokens
          },
          context: {
            kernelChars: productionKernel?.budget?.usedChars,
            summaryChars: summaryBlock?.chars,
            finalToolResultChars: trace?.finalResultChars
          },
          cleanup: {
            renderSettled: productionOutcome === 'success'
              ? Boolean(targetMessage && !targetMessage.isStreaming && targetMessage.content)
              : !targetMessage,
            requestReleased: activeTurnControllers.get(store) !== controller,
            loadingOwnerSettled: !ownsGeneration || store.isLoading === false,
            failureVisible: isTypedFailureVisible
          }
        })
        // 普通生成失败/取消也必须保存“回滚完成 + loading 已清理”的最终一致态。
        // regenerate 由外层 switchBranch 负责提交，避免把临时失败分支写入存档。
        if (
          ownsGeneration
          && productionOutcome !== 'success'
          && store.currentSessionId
          && !store._isRegenerating
        ) {
          store.commitCurrentSessionNow()
        }
      }
      // P0-3：返回生成结果（'success' | 'error' | 'cancelled'），供 regenerateFrom 失败恢复分支
      return productionOutcome
}
