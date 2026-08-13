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
    '【行文契约】',
    '把正文写成正在发生的场景，不写创作说明、段意总结或旁白式点评。',
    '从上一句造成的动作、声音、位置变化或直接回应落笔；不要换一种说法复述玩家输入。',
    '一个叙事回合通常包含：承接上一段落 → 人物或环境反应 → 至少一次有因果的发展 → 自然落点。',
    '段落按语义组织：一个自然段可以包含相连动作与一句对白；不为长度堆砌景物描写。',
    '优先使用准确的名词和动词。感官细节只在影响判断、动作或气氛时出现，不按视觉、听觉、嗅觉逐项罗列。',
    '最近正文已经写过的物件、颜色、气味、声响和小动作，不因"文采"再写一次；只有它直接造成新后果时才回收。',
    '情绪落在停顿、措辞、动作和身体反应上；能让读者看见时，不替读者概括"紧张、复杂、震惊"等结论。',
    '角色台词回应眼前的人和事，保留各自目的与信息边界；允许停顿、打断、答非所问和没说完的话，不要让角色借台词朗读设定。',
    '变化必须来自已有动作和因果；普通回合最多引入一个必要的新现场细节，不得无因果地新增神秘人物、异响、密信、反转或专名。',
    '句长随动作速度变化，长短句交替；段落不必等长，不为制造文学感强行比喻。',
    '结尾允许自然停顿、完成一轮对话或形成明确行动条件，不强制每轮都留下悬念或玩家选项。',
    `除非原文正在有意回收，不使用这些模板句：${GENERIC_PROSE_PATTERNS.join('、')}。`
  ].join('\n')
}

export function buildNarrativeTurnNote(kernel, { mode = 'continue', intent = null } = {}) {
  const effectiveIntent = intent || (mode === 'init' ? 'open' : mode === 'auto' ? 'advance' : 'respond')
  const range = intentCharRange(effectiveIntent)
  const style = clip(findBlock(kernel, 'style')?.fingerprint, 240)
  // C2.4：优先用 ContinuityFrame 的 assistantTail + lastBlock 作连续锚点，回退到 recent 切句。
  const frame = continuityFrame(kernel)
  const sample = clip(frame?.assistantTail || latestAssistantSample(kernel), 360)
  const lastBlock = frame?.lastBlock || null
  const anchor = lastBlock
    ? `最后一块｜${lastBlock.kind}${lastBlock.speaker ? `｜${lastBlock.speaker}` : ''}｜${lastBlock.textTail}`
    : latestAssistantAnchor(kernel)
  const instructions = [
    '【本轮作者注释｜只约束下一次正文】',
    effectiveIntent === 'open'
      ? '用一个可见、可听或可触的现场事实开场，再让人物进入动作；不要先介绍世界观。'
      : effectiveIntent === 'extend'
        ? '从最后一句正文直接续接，不重述场景、不复述前文；延续同一动作链和情绪线。'
        : effectiveIntent === 'advance'
          ? '推进 NPC、环境或既有因果造成的后果，保持人物、地点和动作链连续；不得替玩家作决定。'
          : '回应玩家刚刚的输入，推进一个有因果发展的完整场景拍。',
    `目标长度约 ${range.min}-${range.max} 个中文字符；这是评测区间，不是硬凑字数。`,
    style ? `既定文风：${style}` : '',
    anchor ? `连续锚点（从最后一段承接）：${anchor}` : '',
    sample ? `邻近正文样本：${sample}` : '',
    sample ? '沿用样本的视角、称谓、时态和大致句长；只模仿节奏，不复述样本事件或句子。' : '',
    '先满足因果与人物反应，再选择细节；宁可具体、克制，也不要面面俱到。'
  ]
  return instructions.filter(Boolean).join('\n')
}

export default {
  buildNarrativeTurnNote,
  buildNarrativeVoiceContract
}
