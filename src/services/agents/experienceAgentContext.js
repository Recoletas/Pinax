import { buildContextEnvelope, clipContextEnvelope } from './agentContextEnvelope'
import { createContentRevision } from './creativeGraphAgentContext'
import { buildGeoHistoryRuntimeContext } from '../worldHistory/runtimeContext'

const RECENT_MESSAGE_LIMIT = 8
const MESSAGE_CHAR_LIMIT = 520
const CHARACTER_LIMIT = 8
const CANDIDATE_LIMIT = 4

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function clip(value, limit) {
  const normalized = text(value)
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized
}

function compactMessages(messages = []) {
  return messages
    .filter((message) => ['user', 'assistant'].includes(message?.role || message?.type))
    .slice(-RECENT_MESSAGE_LIMIT)
    .map((message) => ({
      id: text(message?.id) || null,
      role: message?.role || message?.type,
      content: clip(message?.cleanContent || message?.content, MESSAGE_CHAR_LIMIT)
    }))
    .filter((message) => message.content)
}

function compactCharacters(runtimeState = {}) {
  return (runtimeState.encounteredCharacters || [])
    .slice(-CHARACTER_LIMIT)
    .map((character) => ({
      id: text(character?.id) || null,
      name: text(character?.name || character),
      status: text(character?.status || character?.state),
      relation: text(character?.relation)
    }))
    .filter((character) => character.name)
}

function compactCandidates(candidates = []) {
  return candidates.slice(0, CANDIDATE_LIMIT).map((candidate) => ({
    id: text(candidate?.id),
    type: text(candidate?.type),
    title: text(candidate?.title),
    summary: clip(candidate?.summary, 320),
    placeId: text(candidate?.placeId),
    participants: (candidate?.participants || []).map(text).filter(Boolean).slice(0, 6),
    reasons: (candidate?.reasons || []).map((reason) => clip(reason, 160)).filter(Boolean).slice(0, 4),
    sourceRefs: (candidate?.sourceRefs || []).slice(0, 8)
  })).filter((candidate) => candidate.id)
}

function sourceRefs(prefix, values = []) {
  return values.map((value) => text(value)).filter(Boolean).map((value) => `${prefix}:${value}`)
}

export function buildExperienceAgentContext({
  taskType = 'experience.next-actions',
  worldbook = null,
  runtimeState = {},
  messages = [],
  memoryRecall = null,
  projectId = '',
  sessionId = ''
} = {}) {
  const recentMessages = compactMessages(messages)
  const geoHistory = buildGeoHistoryRuntimeContext({
    worldbook,
    geoHistory: worldbook?.geoHistory,
    worldMapState: runtimeState.worldMapState,
    historyNode: runtimeState.historyNode
  })
  const characters = compactCharacters(runtimeState)
  const candidates = compactCandidates(runtimeState.emergenceCandidates)
  const unresolvedHooks = (runtimeState.goals || [])
    .filter((goal) => goal?.status !== 'completed')
    .map((goal) => text(goal?.title || goal))
    .filter(Boolean)
    .slice(0, 6)
  const targetState = {
    taskType,
    sessionId: text(sessionId),
    latestMessageId: recentMessages.at(-1)?.id || null,
    recentMessages,
    placeId: text(runtimeState.worldMapState?.placeId),
    historyNodeId: text(runtimeState.historyNode?.id),
    characters,
    unresolvedHooks,
    candidateIds: candidates.map((candidate) => candidate.id)
  }
  const revision = createContentRevision(targetState)
  const targetType = taskType === 'experience.emergence' ? 'experience-state' : 'experience-turn'

  const blocks = [
    {
      kind: 'rules',
      priority: 1000,
      content: {
        taskType,
        constraints: [
          '只能使用本次上下文中出现的地点、历史、角色和候选 ID',
          '不得替玩家选择，不得直接修改世界状态',
          '不得创造神秘使者、陌生阵营或无依据的突发人物'
        ]
      },
      sourceRefs: [`task:${taskType}`]
    },
    {
      kind: 'scene',
      priority: 900,
      content: { recentMessages },
      sourceRefs: sourceRefs('message', recentMessages.map((message) => message.id))
    },
    {
      kind: 'location',
      priority: 780,
      content: {
        worldMapState: runtimeState.worldMapState || null,
        placeIds: geoHistory?.placeIds || [],
        locations: geoHistory?.locations || []
      },
      sourceRefs: sourceRefs('place', geoHistory?.placeIds)
    },
    {
      kind: 'history',
      priority: 740,
      content: geoHistory || {},
      sourceRefs: [
        ...sourceRefs('history', geoHistory?.historyNodeIds),
        ...sourceRefs('worldbook-entry', geoHistory?.entryIds)
      ]
    },
    {
      kind: 'character',
      priority: 700,
      content: { characters, player: runtimeState.playerCharacter || null },
      sourceRefs: sourceRefs('character', characters.map((character) => character.id || character.name))
    },
    {
      kind: 'references',
      priority: 660,
      content: {
        unresolvedHooks,
        candidates,
        recentChoices: (runtimeState.keyChoices || []).slice(-4)
      },
      sourceRefs: sourceRefs('candidate', candidates.map((candidate) => candidate.id))
    }
  ]

  if (memoryRecall?.content) {
    blocks.push({
      kind: 'memory',
      priority: 620,
      content: memoryRecall.content,
      sourceRefs: sourceRefs('memory', memoryRecall.included?.map((item) => item.id))
    })
  }

  const envelope = clipContextEnvelope(buildContextEnvelope({
    surface: 'experience',
    projectId,
    target: {
      type: targetType,
      id: text(sessionId) || 'current-session',
      revision
    },
    blocks,
    budget: { maxChars: 16000 }
  }))

  return {
    envelope,
    revision,
    target: {
      ...envelope.target,
      allowedCandidateIds: candidates.map((candidate) => candidate.id),
      allowedEvidenceRefs: [...new Set(envelope.blocks.flatMap((block) => block.sourceRefs || []))]
    },
    contextSummary: {
      recentMessageCount: recentMessages.length,
      placeIds: geoHistory?.placeIds || [],
      historyNodeIds: geoHistory?.historyNodeIds || [],
      characterNames: characters.map((character) => character.name),
      memoryIds: memoryRecall?.included?.map((item) => item.id) || [],
      candidateIds: candidates.map((candidate) => candidate.id)
    }
  }
}
