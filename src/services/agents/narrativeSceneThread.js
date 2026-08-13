// 故事生成质量第二阶段（Q2）—— SceneThread 构建器（无 LLM 的软状态）。
// 从 runtime 地点/时间/目标/角色 + 最近正文的 presentation blocks 派生；
// 场景未变化时复用上一线程，变化时建立新线程。重复抑制与写回在 Q4 深化。
import {
  normalizeNarrativeSceneThread,
  sceneThreadRevision,
  shouldStartNewSceneThread
} from '../../../shared/narrativeSceneThreadContract'

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function lastAssistantBlocks(messages = []) {
  const last = [...messages].reverse().find((message) => message?.role === 'assistant') || null
  return Array.isArray(last?.presentation?.blocks) ? last.presentation.blocks : []
}

function inferMode(blocks = []) {
  if (!blocks.length) return 'mixed'
  const dialogueCount = blocks.filter((block) => block.kind === 'dialogue').length
  const actionCount = blocks.filter((block) => block.kind === 'action').length
  if (dialogueCount >= 2 && dialogueCount >= actionCount) return 'dialogue'
  if (actionCount > dialogueCount) return 'action'
  return 'mixed'
}

function activeQuestionFrom(blocks = []) {
  const last = blocks[blocks.length - 1]
  if (!last) return ''
  if (last.kind === 'dialogue' && /[？?]$/.test(clean(last.text))) return clean(last.text).slice(0, 120)
  return ''
}

const REPETITION_STOPLIST = new Set([
  '没有', '什么', '这个', '那个', '一个', '一下', '自己', '我们', '你们', '他们',
  '这里', '那里', '现在', '已经', '还是', '但是', '因为', '所以', '如果', '然后',
  '可能', '应该', '一定', '很多', '一些', '开始', '继续', '仍然', '忽然', '仿佛'
])

// Q4：从最近两轮 assistant 正文提取重复出现的 2-4 字短语（动作/意象），最多 limit 个，
// 作为 BeatPlan avoidRepeats 的种子；旧动作产生新后果时仍允许回收。
function extractRecentRepetitions(messages = [], limit = 6) {
  const recent = [...messages].reverse().slice(0, 2)
  const blocks = recent.flatMap((message) => (
    Array.isArray(message?.presentation?.blocks) ? message.presentation.blocks : []
  ))
  if (!blocks.length) return []
  const counts = new Map()
  for (const block of blocks) {
    for (const token of (String(block.text || '').match(/[\u4e00-\u9fff]{2,4}/g) || [])) {
      if (REPETITION_STOPLIST.has(token)) continue
      counts.set(token, (counts.get(token) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token)
}

export function buildNarrativeSceneThread({ previous = null, runtimeState = {}, messages = [] } = {}) {
  if (previous && !shouldStartNewSceneThread(previous, runtimeState)) {
    return normalizeNarrativeSceneThread(previous)
  }
  const place = runtimeState?.worldMapState || {}
  const time = runtimeState?.writingTime || {}
  const goals = Array.isArray(runtimeState?.goals) ? runtimeState.goals : []
  const activeGoal = goals.find((goal) => clean(goal?.status).toLowerCase() !== 'completed') || null
  const historyNode = runtimeState?.historyNode || null
  const cast = (Array.isArray(runtimeState?.encounteredCharacters) ? runtimeState.encounteredCharacters : [])
    .slice(0, 8)
    .map((character) => ({
      characterId: clean(character?.id),
      name: clean(character?.name || character),
      immediateIntent: '',
      lastMeaningfulMove: ''
    }))
    .filter((member) => member.name)
  const blocks = lastAssistantBlocks(messages)
  const unresolvedHooks = Array.isArray(historyNode?.unresolvedHooks)
    ? historyNode.unresolvedHooks.map(clean).filter(Boolean)
    : []
  const now = Date.now()
  const normalized = normalizeNarrativeSceneThread({
    id: `scene_${clean(place.placeId || 'main')}_${clean(time.year || time.eraName || 'now')}`,
    sceneRef: clean(historyNode?.id) || null,
    sourceRefs: [
      place.placeId ? `place:${place.placeId}` : '',
      historyNode?.id ? `history:${historyNode.id}` : ''
    ].filter(Boolean),
    place: {
      placeId: clean(place.placeId),
      scene: clean(place.currentScene || place.currentCity || place.currentCountry)
    },
    time: {
      eraName: clean(time.eraName),
      year: clean(time.year),
      month: clean(time.month),
      day: clean(time.day)
    },
    mode: inferMode(blocks),
    purpose: clean(activeGoal?.title || activeGoal || ''),
    currentObjective: clean(activeGoal?.title || activeGoal || ''),
    immediateObstacle: unresolvedHooks[0] || null,
    activeQuestion: activeQuestionFrom(blocks) || null,
    cast,
    establishedProgress: [],
    recentRepetitions: extractRecentRepetitions(messages),
    exitConditions: [],
    createdAt: now,
    updatedAt: now
  })
  return { ...normalized, revision: sceneThreadRevision(normalized) }
}

export default { buildNarrativeSceneThread }
