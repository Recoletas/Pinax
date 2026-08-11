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
    '每个自然段只承担一个推进：发生一个可观察变化，或让一轮对话改变人物关系与下一步行动。',
    '优先使用准确的名词和动词。感官细节只在影响判断、动作或气氛时出现，不按视觉、听觉、嗅觉逐项罗列；一轮只抓一个真正改变现场的新细节。',
    '最近正文已经写过的物件、颜色、气味、声响和小动作，不因“文采”再写一次；只有它直接造成新后果时才回收。不要把每个物件都补上材质、光泽、颜色和拟声。',
    '情绪落在停顿、措辞、动作和身体反应上；能让读者看见时，不替读者概括“紧张、复杂、震惊”等结论。',
    '角色台词回应眼前的人和事，保留各自目的与信息边界；允许停顿、打断、答非所问和没说完的话，不要让角色借台词朗读设定。',
    '不要为了“有戏”而在每轮强行加入异象、陌生人、反转或新危机；变化必须来自已有动作和因果。',
    '句长随动作速度变化，长短句交替；段落不必等长，不为制造文学感强行比喻。',
    '不用“然而、与此同时、就在这时”机械转场；结尾不总结、不升华、不预告后续，也不以无因果的异响、密信、陌生人或突发危机吊胃口。',
    `除非原文正在有意回收，不使用这些模板句：${GENERIC_PROSE_PATTERNS.join('、')}。`
  ].join('\n')
}

export function buildNarrativeTurnNote(kernel, { mode = 'continue' } = {}) {
  const style = clip(findBlock(kernel, 'style')?.fingerprint, 240)
  const sample = latestAssistantSample(kernel)
  const anchor = latestAssistantAnchor(kernel)
  const instructions = [
    '【本轮作者注释｜只约束下一次正文】',
    mode === 'init'
      ? '用一个可见、可听或可触的现场事实开场，再让人物进入动作；不要先介绍世界观。'
      : mode === 'auto'
        ? '自动续写只接住最后一条正文留下的一个动作、台词或变化。不要把较早人物、道具、线索和环境描写重新搬回现场；没有直接后果时宁可停在短促的可回应事实。'
      : '紧贴最近正文的落点继续，只推进一个小台阶；结尾留下可回应的动作、话语或变化，不写总结句。',
    style ? `既定文风：${style}` : '',
    mode === 'auto' && anchor ? `唯一连续锚点：${anchor}` : '',
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
