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
    '承接上一句造成的动作、声音、位置变化或直接回应落笔，不复述玩家输入。',
    '一个回合通常包含承接 → 反应 → 至少一次有因果的发展 → 自然落点；先满足因果与人物反应，再选细节。',
    '感官细节只在影响判断、动作、信息或情绪走向时保留，不按视觉/听觉/嗅觉逐项罗列，不为长度堆景物。',
    '最近正文已写过的物件、声响、小动作不因"文采"再写一次；只有它直接造成新后果时才回收。',
    '情绪落在停顿、措辞和动作上，不替读者概括"紧张、复杂、震惊"等结论。',
    '角色台词回应眼前的人和事，保留各自目的与信息边界；允许停顿、打断、答非所问，不让角色借台词朗读设定。',
    '变化必须来自已有动作和因果；普通回合最多引入一个必要的新现场细节，不得无因果地新增神秘人物、异响、密信、反转或专名。',
    '不得替玩家声明未输入的决定、动作或心理结论。',
    '结尾允许自然停顿、完成一轮对话或形成明确行动条件，不强制每轮留下悬念或玩家选项。',
    `不使用模板句：${GENERIC_PROSE_PATTERNS.join('、')}。`
  ].join('\n')
}

export function buildNarrativeTurnNote(kernel, { mode = 'continue', intent = null, expansion = 'standard' } = {}) {
  const effectiveIntent = intent || (mode === 'init' ? 'open' : mode === 'auto' ? 'advance' : 'respond')
  const range = intentCharRange(effectiveIntent, { expansion })
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
