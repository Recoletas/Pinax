import { runGenerationTask } from './generationService'
import { validateStateDelta } from './runtimeEvents'
import { buildWorldbookContext } from './worldbookContextBuilder'

const MAX_SUMMARY_CHARS = 520
const MAX_ARRAY_ITEMS = 6
// sourceRefs 上限须与 emergenceScheduler.MAX_SOURCE_REFS 对齐，
// 否则 scheduler 输出 8 条 → LLM round-trip 后被这里截到 6 条，静默丢弃 2 条。
// （audit-pass2-plan Phase A2；participants/factions/changes 仍用 MAX_ARRAY_ITEMS=6，
//  与 scheduler 的 MAX_PARTICIPANTS=6 / MAX_FACTIONS=4 细粒度上限保持一致。）
const MAX_SOURCE_REFS = 8
const MAX_CHOICES = 3

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function uniqueStrings(values, limit = MAX_ARRAY_ITEMS) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    const normalized = normalizeText(value)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

function stripJsonFence(content) {
  return normalizeText(content)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function parseJsonObject(content) {
  const text = stripJsonFence(content)
  if (!text) return null
  const candidates = [text, text.match(/\{[\s\S]*\}/)?.[0]].filter(Boolean)
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

function normalizeChoices(rawChoices) {
  if (!Array.isArray(rawChoices)) return []
  return rawChoices
    .map((choice, index) => {
      const label = normalizeText(choice?.label || choice?.text || choice)
      if (label.length < 2 || label.length > 48) return null
      return {
        id: normalizeText(choice?.id) || `choice-${index + 1}`,
        label,
        intent: normalizeText(choice?.intent).slice(0, 120),
        risk: normalizeText(choice?.risk).slice(0, 120)
      }
    })
    .filter(Boolean)
    .slice(0, MAX_CHOICES)
}

function normalizeSourceRefs(rawRefs) {
  if (!Array.isArray(rawRefs)) return []
  return rawRefs
    .filter((ref) => ref && typeof ref === 'object')
    .map((ref) => ({
      type: normalizeText(ref.type) || 'candidate',
      id: normalizeText(ref.id)
    }))
    .filter((ref) => ref.id)
    .slice(0, MAX_SOURCE_REFS)
}

/**
 * Parse and validate an LLM-produced emergent event.
 * The parser is intentionally strict: a candidate cannot move to another
 * place, invent a participant, or write a nested state path.
 */
export function parseEmergenceEventDraft(content, options = {}) {
  const raw = parseJsonObject(content)
  if (!raw) return null

  const expectedPlaceId = normalizeText(options.expectedPlaceId)
  const placeId = normalizeText(raw.placeId)
  if (!placeId || (expectedPlaceId && placeId !== expectedPlaceId)) return null

  const allowedParticipants = uniqueStrings(options.allowedParticipants || [], 20)
  const participants = uniqueStrings(raw.participants || [], MAX_ARRAY_ITEMS)
  if (allowedParticipants.length > 0 && participants.some((name) => !allowedParticipants.includes(name))) return null

  const allowedFactions = uniqueStrings(options.allowedFactions || [], 20)
  const factions = uniqueStrings(raw.factions || raw.factionNames || [], MAX_ARRAY_ITEMS)
  if (allowedFactions.length > 0 && factions.some((name) => !allowedFactions.includes(name))) return null

  const choices = normalizeChoices(raw.choices)
  if (choices.length < 2) return null

  const changeValidation = validateStateDelta(raw.changes || [])
  if (!changeValidation.valid || changeValidation.sanitized.length === 0 || changeValidation.sanitized.length > MAX_ARRAY_ITEMS) return null

  const title = normalizeText(raw.title)
  const summary = normalizeText(raw.summary)
  if (title.length < 2 || title.length > 80 || summary.length < 20) return null

  const confidence = Number(raw.confidence)
  return {
    v: 1,
    kind: 'emergent-event-v1',
    candidateId: normalizeText(options.candidateId),
    title,
    summary: summary.slice(0, MAX_SUMMARY_CHARS),
    placeId,
    participants,
    factions,
    causes: uniqueStrings(raw.causes || []),
    changes: changeValidation.sanitized,
    consequences: uniqueStrings(raw.consequences || []),
    unresolvedHooks: uniqueStrings(raw.unresolvedHooks || []),
    choices,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    sourceRefs: normalizeSourceRefs(raw.sourceRefs || options.sourceRefs)
  }
}

function collectKnownParticipants(candidate, runtimeState) {
  return uniqueStrings([
    ...(candidate?.participants || []),
    ...(Array.isArray(runtimeState?.encounteredCharacters)
      ? runtimeState.encounteredCharacters.map((item) => item?.name || item)
      : []),
    runtimeState?.playerCharacter?.name
  ], 12)
}

function collectKnownFactions(candidate, runtimeState) {
  return uniqueStrings([
    candidate?.factionName,
    ...Object.keys(runtimeState?.factionRelations || {})
  ], 12)
}

export function buildEmergenceEventMessages({
  candidate = null,
  worldbook = null,
  runtimeState = {},
  chatHistory = []
} = {}) {
  const context = buildWorldbookContext({
    worldbook,
    chatHistory,
    runtimeState,
    tokenBudget: 1400,
    scanDepth: 6
  })
  const participants = collectKnownParticipants(candidate, runtimeState)
  const factions = collectKnownFactions(candidate, runtimeState)
  const placeId = normalizeText(candidate?.placeId || runtimeState?.worldMapState?.placeId)
  const recent = (Array.isArray(chatHistory) ? chatHistory : [])
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .slice(-6)
    .map((message) => `${message.role === 'user' ? '玩家' : '叙事'}：${normalizeText(message.content).slice(0, 180)}`)
    .filter(Boolean)
    .join('\n')

  return [
    context?.messages?.[0] || null,
    {
      role: 'system',
      content: [
        '你是 Pinax 的涌现事件具体化器。你只能把已经存在的候选具体化为一个待审阅事件，不能宣布事件已经被应用。',
        '只输出 JSON 对象，不要 Markdown，不要解释。',
        'JSON 结构：{"title":"...","summary":"...","placeId":"...","participants":[],"factions":[],"causes":[],"changes":[],"consequences":[],"unresolvedHooks":[],"choices":[{"id":"...","label":"...","intent":"...","risk":"..."}],"confidence":0.0}',
        'choices 必须输出 2-3 个贴合当前剧情的玩家行动，不要使用预设模板。',
        'changes 只能使用 set/merge/push/pull/inc/unset，path 只能是 goals、encounteredCharacters、factionRelations、keyChoices、plotJournal、activities、placeStates、characterStates、characterRelations、canonicalFacts、writingTime、worldMapState、mechanismContext、milestoneEvent、flags、inventory、quests 之一。',
        'placeStates 必须以已知地点 ID 为键，且每个地点只能写 status、controllerId、danger；characterStates 必须以已知角色 ID 或姓名为键，且只能写 status、alive、placeId、goal、mood、knowledgeRefs。',
        'characterRelations 只能写已知角色 ID 之间的 parent/child/sibling/spouse/grandparent/grandchild/guardian/ward/adoptive-parent/adoptive-child 关系；canonicalFacts 只能写 subjectId、predicate、标量 value、status、confidence 和 sourceRefs。',
        'writingTime 只能写 eraId、eraName、year、month、day；只有剧情明确发生时间推进、年代切换或回溯时才修改。',
        '受控状态中的 blockedConflictCodes 只是禁止采用的冲突警告，不是剧情事实；不得引用 stale 事件。',
        `当前地点必须严格使用：${placeId || '候选中没有可用地点，直接返回无效 JSON'}`,
        `已知参与者只能使用：${participants.join('、') || '无'}`,
        `已知阵营只能使用：${factions.join('、') || '无'}`,
        '不要创造神秘使者、陌生阵营或未被上下文支持的地点。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `候选 ID：${normalizeText(candidate?.id)}`,
        `候选类型：${normalizeText(candidate?.type)}`,
        `候选标题：${normalizeText(candidate?.title)}`,
        `候选摘要：${normalizeText(candidate?.summary)}`,
        `触发依据：${(candidate?.reasons || []).map(normalizeText).filter(Boolean).join('；') || '无'}`,
        candidate?.causalState
          ? `受控状态：${JSON.stringify(candidate.causalState)}`
          : '',
        `地点引用：${placeId}`,
        recent ? `最近对话：\n${recent}` : ''
      ].filter(Boolean).join('\n')
    }
  ].filter(Boolean)
}

export async function generateEmergenceEventDraft({
  candidate = null,
  worldbook = null,
  runtimeState = {},
  chatHistory = [],
  settings = {},
  worldId = ''
} = {}) {
  if (!candidate?.id || !candidate?.placeId) {
    return { success: false, event: null, error: '候选缺少稳定地点引用' }
  }

  const allowedParticipants = collectKnownParticipants(candidate, runtimeState)
  const allowedFactions = collectKnownFactions(candidate, runtimeState)
  try {
    const result = await runGenerationTask({
      taskType: 'emergence.event',
      baseMessages: buildEmergenceEventMessages({ candidate, worldbook, runtimeState, chatHistory }),
      settings,
      worldId,
      generationOptions: {
        max_tokens: 1000,
        temperature: 0.35,
        response_format: { type: 'json_object' }
      },
      attempts: [
        { name: 'emergence-event-first' },
        {
          name: 'emergence-event-retry',
          appendMessages: [{
            role: 'user',
            content: '上一版事件未通过地点、参与者、状态路径或选项校验。请严格按照 JSON schema 重新输出，不能引入神秘使者或新地点。'
          }]
        }
      ],
      parseContent: (content) => parseEmergenceEventDraft(content, {
        candidateId: candidate.id,
        expectedPlaceId: candidate.placeId,
        allowedParticipants,
        allowedFactions,
        sourceRefs: candidate.sourceRefs
      }),
      isValidParsed: (parsed) => Boolean(parsed?.kind === 'emergent-event-v1')
    })

    return {
      success: Boolean(result?.success && result?.parsed),
      event: result?.parsed || null,
      error: result?.success ? '' : '事件具体化未通过校验'
    }
  } catch (error) {
    return {
      success: false,
      event: null,
      error: error?.message || '事件具体化失败'
    }
  }
}

export default {
  buildEmergenceEventMessages,
  generateEmergenceEventDraft,
  parseEmergenceEventDraft
}
