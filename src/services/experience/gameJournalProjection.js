// Plot journal 与创作来源 refs 的纯投影（B8）。同一事实只走一条转换路径：
// 输入是只读字段视图 + 显式回退，输出保持 id / sourceRefs / 顺序与未知字段
// 策略不变；本模块不读 store、不写存储。

import { mergeSourceRefs, normalizeContentRef } from '../narrativeAssets.js'
import {
  compactPlotJournalSummary,
  normalizeEncounteredCharacters,
  normalizeGoals,
  normalizeKeyChoices,
  normalizeNumber,
  normalizeTextValue,
  PLOT_JOURNAL_TURN_INTERVAL
} from './gameSessionNormalization.js'

// 每 PLOT_JOURNAL_TURN_INTERVAL 个 assistant 回合追加一条 plot journal。
// state 视图：{ chatHistory, plotJournal, encounteredCharacters, worldMapState,
// keyChoices, goals }；now 用于 createdAt（测试可注入）。
export function buildPlotJournalEntry(state, now = Date.now()) {
  const history = Array.isArray(state.chatHistory) ? state.chatHistory : []
  const bodyMessages = history.filter((message) => message?.role === 'user' || message?.role === 'assistant')
  const plotJournal = Array.isArray(state.plotJournal) ? state.plotJournal : []
  const lastEntry = plotJournal[plotJournal.length - 1] || null
  const sourceStartIndex = normalizeNumber(lastEntry?.sourceEndIndex, 0)
  const pendingMessages = bodyMessages.slice(sourceStartIndex)
  const assistantTurns = pendingMessages.filter((message) => message.role === 'assistant').length

  if (assistantTurns < PLOT_JOURNAL_TURN_INTERVAL) {
    return null
  }

  const summary = compactPlotJournalSummary(pendingMessages)
  if (!summary) {
    return null
  }

  const chapterNumber = plotJournal.length + 1
  const participants = normalizeEncounteredCharacters(state.encounteredCharacters)
    .slice(-4)
    .map((character) => character.name)
  const locations = [
    state.worldMapState?.currentCountry,
    state.worldMapState?.currentCity,
    state.worldMapState?.currentScene
  ].map(normalizeTextValue).filter(Boolean)
  const keyChoices = normalizeKeyChoices(state.keyChoices)
    .slice(-3)
    .map((choice) => choice.label)
  const unresolvedHooks = normalizeGoals(state.goals)
    .filter((goal) => goal.status !== 'completed')
    .slice(0, 3)
    .map((goal) => goal.title)

  return {
    chapterId: `chapter-${chapterNumber}`,
    summary,
    participants,
    locations,
    keyChoices,
    unresolvedHooks,
    sourceMessageIds: pendingMessages.map((_, index) => `chat-${sourceStartIndex + index + 1}`),
    sourceStartIndex,
    sourceEndIndex: bodyMessages.length,
    createdAt: now
  }
}

// 当前创作来源 refs：会话消息、历史节点、地图地点与 plot journal 的规范引用。
// view：{ worldId, currentSessionId, historyNode, worldMapState, latestPlotJournalEntry }；
// projectIdFallback 为 active worldbook 回退（由调用方解析）。
export function buildAdventureCreativeSourceRefs(view, messageIds = [], plotEntry = null, { projectIdFallback = null } = {}) {
  const projectId = view.worldId || projectIdFallback || null
  const sessionId = String(view.currentSessionId || 'session')
  const refs = (Array.isArray(messageIds) ? messageIds : [])
    .map((messageId) => normalizeContentRef({
      refType: 'session-message',
      refId: `${sessionId}:${String(messageId || '').trim()}`,
      projectId
    }, projectId))
    .filter(Boolean)

  const historyNodeId = String(view.historyNode?.id || '').trim()
  if (historyNodeId) {
    refs.push(normalizeContentRef({
      refType: 'history-node',
      refId: historyNodeId,
      projectId,
      excerpt: view.historyNode?.summary || view.historyNode?.title
    }, projectId))
  }

  const placeId = String(view.worldMapState?.placeId || view.historyNode?.placeId || '').trim()
  if (placeId) {
    refs.push(normalizeContentRef({
      refType: 'map-site',
      refId: placeId,
      projectId,
      excerpt: [
        view.worldMapState?.currentCountry,
        view.worldMapState?.currentCity,
        view.worldMapState?.currentScene
      ].filter(Boolean).join(' / ')
    }, projectId))
  }

  const journal = plotEntry || (typeof view.latestPlotJournalEntry === 'function' ? view.latestPlotJournalEntry() : null)
  const journalId = String(journal?.id || journal?.chapterId || '').trim()
  if (journalId) {
    refs.push(normalizeContentRef({
      refType: 'plot-journal',
      refId: journalId,
      projectId,
      excerpt: journal?.summary
    }, projectId))
  }

  return mergeSourceRefs(refs)
}
