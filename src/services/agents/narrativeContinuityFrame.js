// C2.3：ContinuityFrame（最小版）—— 无 LLM 的纯结构化提取。
// 从最后一条 assistant 的 presentation blocks、runtime 的地点/时间/目标/在场角色派生，
// 供 orchestrator 的 turn note 与 transcript 做连续锚点，替代从 recent block 重新切句。
function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function clipTail(value, limit) {
  const normalized = clean(value)
  return normalized.length > limit ? normalized.slice(-limit) : normalized
}

function stableHash(value) {
  const serialized = JSON.stringify(value ?? {})
  let hash = 2166136261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `cf_${(hash >>> 0).toString(36)}`
}

export function buildNarrativeContinuityFrame({ messages = [], runtimeState = {} } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const lastAssistant = [...list].reverse().find((message) => message?.role === 'assistant') || null
  const lastUser = [...list].reverse().find((message) => message?.role === 'user') || null
  const lastBlocks = Array.isArray(lastAssistant?.presentation?.blocks)
    ? lastAssistant.presentation.blocks
    : []
  const lastBlock = lastBlocks[lastBlocks.length - 1] || null
  const goals = Array.isArray(runtimeState?.goals) ? runtimeState.goals : []
  const activeGoal = goals.find((goal) => clean(goal?.status).toLowerCase() !== 'completed') || null
  const cast = Array.isArray(runtimeState?.encounteredCharacters)
    ? runtimeState.encounteredCharacters.slice(-8)
    : []
  const historyNode = runtimeState?.historyNode || null
  const openThreads = (Array.isArray(historyNode?.unresolvedHooks)
    ? historyNode.unresolvedHooks
    : [])
    .map(clean)
    .filter(Boolean)
    .slice(0, 4)

  const frame = {
    place: {
      placeId: clean(runtimeState?.worldMapState?.placeId),
      scene: clean(
        runtimeState?.worldMapState?.currentScene
        || runtimeState?.worldMapState?.currentCity
        || runtimeState?.worldMapState?.currentCountry
      )
    },
    time: {
      eraName: clean(runtimeState?.writingTime?.eraName),
      year: clean(runtimeState?.writingTime?.year),
      month: clean(runtimeState?.writingTime?.month),
      day: clean(runtimeState?.writingTime?.day)
    },
    playerLastAction: clean(lastUser?.content).slice(0, 200),
    // 最后一条是 user → 玩家刚行动、等待回应；否则是接续/推进。
    pendingExchange: lastUser != null && lastAssistant != null
      ? (list.length && list[list.length - 1]?.role === 'user')
      : (lastUser != null),
    assistantTail: clipTail(lastAssistant?.content || '', 500),
    lastBlock: lastBlock
      ? {
          kind: clean(lastBlock.kind),
          speaker: clean(lastBlock.speaker),
          textTail: clipTail(lastBlock.text, 240)
        }
      : null,
    activeGoal: activeGoal
      ? { id: clean(activeGoal.id), title: clean(activeGoal.title || activeGoal) }
      : null,
    immediateObstacle: openThreads[0] || clean(activeGoal?.title || activeGoal) || null,
    openThreads,
    castPositions: cast
      .map((character) => ({ name: clean(character.name), status: clean(character.status || character.state) }))
      .filter((character) => character.name)
  }

  const sourceRefs = [
    lastAssistant?.id ? `message:${lastAssistant.id}` : '',
    lastUser?.id ? `message:${lastUser.id}` : '',
    frame.place.placeId ? `place:${frame.place.placeId}` : '',
    historyNode?.id ? `history:${historyNode.id}` : ''
  ].filter(Boolean)

  return { ...frame, sourceRefs, revision: stableHash({ ...frame, sourceRefs }) }
}

export default { buildNarrativeContinuityFrame }
