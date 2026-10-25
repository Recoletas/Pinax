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

export function buildNarrativeVoiceContract({ surface = 'experience' } = {}) {
  if (surface === 'authoring') {
    return [
      '【写作指导】',
      '依照作者要求完成本次写作，方法帮助组织内容，不另外规定作品的题材、语气或情节走向。',
      '计时、称谓、制度与物件沿用本书语境；中文书写语言不代表故事采用中国历史背景。',
      '先把眼前发生的事讲明白，再选择怎样讲：谁在做什么、动作对着什么、对方因此怎样回应。叙述、对白、概述都可以使用；省略过程时保留读者理解转变所需的连接。作者指定的文风优先，清楚不等于只写短句。',
      '动作与措辞：想象人物实际完成动作，核对物件的形态、持握方式和先后位置；接着写时保留动作结果：已经放下的笔，再用时需要拿起；切好的菜尚未炒熟。再选准确的动词。下面是表达方法示例，不是本书情节：液体要有容器，“攥着热水”应按情境写成“端着一杯热水”；“学了四年手”若指学艺，就写“当了四年学徒”。修正搭配，不用新术语装饰普通动作。',
      '观察与判断：先让读者看见足以支持判断的差别，再写人物的理解与反应。“署名与委托人不同”支持核对身份，不独自证明伪造、年代或阴谋。人物可以猜错、隐瞒、撒谎，但叙述要让猜测与已知事实可辨；需要补设定时沿本书已有背景展开。',
      '人物与信息：在当下有作用的经历才在这里交代。人物递来东西时，可以先写递交和接话，不必同时报出年龄、履历与性格。需要解释时用叙述直接交代；过渡和日常可概述，值得停留的交锋再展开。',
      '对白：先明确各人这句话想让对方知道或做什么，再接住上一句话。以用词、态度和说话习惯区别人物，不靠人人打哑谜或说俏皮话。两人都知道的背景无需互相讲课；让读者知情可以使用叙述。换说话人时分段，让读者认得谁在说话；同段动作的主语要与说话者对应，换人行动就点明人物。例如弟弟问姐姐吃不吃，下一段可写“‘吃。’姐姐把包放下。”，不能接“他说”而让弟弟回答自己。动作插入服务于意思与节奏。',
      '修辞与节奏：先确定具体感受，再决定是否需要比喻。例如想写纸面粗糙，可以直接说“纸边起了毛”，不用另造难以想象的意象。选取能帮助理解处境或形成鲜明感受的细节；说话间的一次家务动作可以交代环境，不必逐一描写每次拿放、擦拭和停手。保留有作用的长句、重复、幽默与留白；幽默来自人物处境或口吻，悬念来自尚未解决的事，不靠故意省掉必要信息。',
      '落笔时结合上下文修正不成立的动作、指代和搭配，保留作者有意的特殊表达。以上例子只解释方法，不移植其中的物件、句子或剧情；直接交付正文，无需展示检查过程。'
    ].join('\n')
  }
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
  const authoring = kernel?.surface === 'authoring'
  if (authoring) {
    return [
      '【本次写作】',
      '按作者本轮要求完成正文，写作范围与结束位置以这次委托为准。',
      '以提供的正式原文定位进度；续写接住已经发生的变化，改写则接好目标片段的前后文。',
      '文风参考作者明确说明、指定样文及当前正式原文。未采用草稿可以修订，但不自动代表作者认可的风格。',
      '大纲和构思描述计划，参考作品提供材料；结合各自来源和时间位置使用，不把它们当作本章已经发生的事情。'
    ].join('\n')
  }
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
    authoring
      ? '按作者本轮要求完成正文；写作范围、篇幅与结束位置以作者要求为准。'
      : effectiveIntent === 'open'
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
    authoring ? '' : `建议约 ${range.min}-${range.max} 个中文字符。作者指定的结束事件与跑团行动权限优先；达到边界立即收束，不能为凑字数续写后果。`,
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
