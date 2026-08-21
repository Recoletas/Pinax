import { intentCharRange } from '../../../shared/narrativeGenerationIntentContract'

const GENERIC_PROSE_PATTERNS = [
  '空气仿佛凝固',
  '命运的齿轮',
  '眼中闪过一丝',
  '某种说不清的',
  '似乎在诉说',
  '令人不禁',
  '这一刻'
]

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function clip(value, limit) {
  const normalized = clean(value)
    .replace(/^\s*:::[^\n]*\n?/gm, '')
    .trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized
}

function findBlock(kernel, kind) {
  return (kernel?.blocks || []).find((block) => block?.kind === kind)?.content || {}
}

// C2.4：ContinuityFrame 已在 Kernel continuity block 中，优先用它做连续锚点。
function continuityFrame(kernel) {
  return findBlock(kernel, 'continuity')?.frame || null
}

function latestAssistantSample(kernel) {
  const messages = findBlock(kernel, 'recent')?.messages || []
  const latest = [...messages].reverse().find((message) => message?.role === 'assistant')
  return clip(latest?.content, 360)
}

function latestAssistantAnchor(kernel) {
  const sample = latestAssistantSample(kernel)
  const sentences = sample
    .split(/(?<=[。！？!?])\s*/)
    .map((sentence) => clean(sentence))
    .filter(Boolean)
  return clip(sentences.at(-1) || sample, 180)
}

export function buildNarrativeVoiceContract() {
  return [
    '【行文契约（五条）】',
    '1. 先回应玩家输入，再推进一个已有因果。',
    '2. 每段只承担回应、动作、后果或过渡中的一个主要功能。',
    '3. 每个场景拍最多一个环境细节和一个人物细节，除非它们直接改变判断或行动。',
    '4. 不重复最近两轮已出现且没有新后果的动作、物件和情绪表达。',
    '5. 最后一句落在场景内的动作、台词或已确认事实；不评价故事结构，不宣布停笔，不等待玩家选择。',
    '情绪落在停顿、措辞和动作上，不替读者概括"紧张、复杂、震惊"等结论；角色台词回应眼前的人和事，用神态描写回避回答不合格。',
    '不用列举数项后再用破折号短句揭晓结论；让人物通过观察、判断或动作直接指出差异。',
    '一个结论只表达一次；不要再用同义短句、解释性比喻或格言重复说明它意味着什么。',
    '神秘信息必须来自已有事实、人物隐瞒或当前因果，并在本拍产生可观察影响；否则直接写清楚。',
    '关系不要写成标签或心理说明；只在与当前互动有关时，通过惯常选择、照顾的成本、回避、纠正、默契或遗漏显现。',
    `不使用模板句：${GENERIC_PROSE_PATTERNS.join('、')}。`
  ].join('\n')
}

export function buildNarrativeRelationshipNote(kernel) {
  const relationships = findBlock(kernel, 'continuity')?.causality?.relationships
  if (!Array.isArray(relationships)) return ''
  const cues = relationships
    .filter((relation) => (
      clean(relation?.subjectId)
      && clean(relation?.objectId)
      && clean(relation?.kind)
      && clean(relation?.status).toLowerCase() !== 'ended'
    ))
    .slice(0, 3)
    .map((relation) => (
      `${clip(relation.subjectId, 48)} → ${clip(relation.objectId, 48)}（${clip(relation.kind, 32)}）`
    ))
  return cues.length
    ? `本场有效关系（只作行为依据，不照抄标签）：${cues.join('；')}`
    : ''
}

export function buildNarrativeTurnNote(kernel, { mode = 'continue', intent = null, expansion = 'standard' } = {}) {
  const effectiveIntent = intent || (mode === 'init' ? 'open' : mode === 'auto' ? 'advance' : 'respond')
  const range = intentCharRange(effectiveIntent, { expansion })
  const style = clip(findBlock(kernel, 'style')?.fingerprint, 240)
  // C2.4：优先用 ContinuityFrame 的 assistantTail + lastBlock 作连续锚点，回退到 recent 切句。
  const frame = continuityFrame(kernel)
  // Q2：场景线程（本场景正在完成什么）
  const thread = findBlock(kernel, 'continuity')?.sceneThread || null
  const sample = clip(frame?.assistantTail || latestAssistantSample(kernel), 360)
  const lastBlock = frame?.lastBlock || null
  const anchor = lastBlock
    ? `最后一块｜${lastBlock.kind}${lastBlock.speaker ? `｜${lastBlock.speaker}` : ''}｜${lastBlock.textTail}`
    : latestAssistantAnchor(kernel)
  const relationshipNote = buildNarrativeRelationshipNote(kernel)
  const instructions = [
    '【本轮作者注释｜只约束下一次正文】',
    effectiveIntent === 'open'
      ? '用一个可见、可听或可触的现场事实开场，再让人物进入动作；不要先介绍世界观。'
      : effectiveIntent === 'extend'
        ? '从最后一句正文直接续接，不重述场景、不复述前文；延续同一动作链和情绪线。'
        : effectiveIntent === 'advance'
          ? '推进 NPC、环境或既有因果造成的后果，保持人物、地点和动作链连续；不得替玩家作决定。'
          : '回应玩家刚刚的输入，推进一个有因果发展的完整场景拍。',
    // Q2：场景线程 —— 给模型一个"本场景正在完成什么"的稳定锚点。
    thread?.currentObjective ? `当前场景目标：${clip(thread.currentObjective, 160)}` : '',
    thread?.immediateObstacle ? `眼前阻力：${clip(thread.immediateObstacle, 120)}` : '',
    thread?.activeQuestion ? `待回应：${clip(thread.activeQuestion, 120)}` : '',
    relationshipNote,
    relationshipNote
      ? '若上述关系与眼前互动有关，让它通过已经形成的习惯、成本、回避、纠正、默契或遗漏自然显现；不要解释关系名称。'
      : '',
    `这段正文应写到约 ${range.min}-${range.max} 个中文字符；写足一个完整的场景拍，不要在刚过一半就收束。`,
    style ? `既定文风：${style}` : '',
    anchor ? `连续锚点（从最后一段承接）：${anchor}` : '',
    sample ? `邻近正文样本：${sample}` : '',
    sample ? '沿用样本的视角、称谓、时态和大致句长；只模仿节奏，不复述样本事件或句子。' : '',
    '先满足因果与人物反应，再选择细节；宁可具体、克制，也不要面面俱到。'
  ]
  return instructions.filter(Boolean).join('\n')
}

export default {
  buildNarrativeRelationshipNote,
  buildNarrativeTurnNote,
  buildNarrativeVoiceContract
}
