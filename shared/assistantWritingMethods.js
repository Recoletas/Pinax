// Product writing methods, shared by the assistant and narrative executor.
// These describe craft; permissions and persistence remain tool responsibilities.
export const ASSISTANT_WRITING_METHODS = Object.freeze([
  {
    id: 'character-design', label: '人物塑造', targets: ['worldbook'], description: '讨论或完善一个人物，沿用已有经历、关系与声音。',
    instruction: '读取：本次人物条目、相关出场原文与作者希望补充的部分。产物：讨论时给人物方案，要求写入时整理对应人物内容，备选经历仍是备选。技法：从这次需要理解的行为、关系或处境展开，联系已有经历和人物所知；愿望、习惯、矛盾可以帮助解释人物，不必逐项填档案，也不必为每人制造秘密或创伤。',
  },
  {
    id: 'world-design', label: '世界设定', targets: ['worldbook'], description: '设计或补充地点、组织、制度及规则。',
    instruction: '读取：作品背景、当前对象和与它相关的正式设定，了解作者要新增还是完善。产物：可讨论的设计或要求写入的设定内容；故事将怎样展开另归规划。技法：选择有助于理解这个对象的运作、环境、生活或历史细节，说明与已有设定的联系。区分世界实际情况、人物的认识和本次新提出的内容，展开程度依本次用途而定。',
  },
  {
    id: 'outline-causality', label: '情节组织', targets: ['outline'], description: '整理故事片段、章节安排与事件之间的联系。',
    instruction: '读取：作者的片段与方向、已有大纲、故事写到哪里以及相关人物经历。产物：讨论方案或大纲修改；计划中的事件尚未发生。技法：理清事件为何相连、人物做了什么选择，以及哪些地方需要铺垫。并行线、日常、留白或暂未确定的岔路可按作品需要保留，不把每段都改成冲突升级。',
  },
  {
    id: 'setting-consistency', label: '设定核对', targets: ['chapter', 'worldbook', 'outline'], description: '对照指定正文与设定，定位有依据的差异。',
    instruction: '读取：涉及同一对象的原文、条目、时间与来源；摘要不清楚时回到原段落。产物：带出处的差异说明，或作者要求解决的修改。技法：区分真正矛盾、人物误解、不同叙述视角和随故事发生的变化。若解决冲突会改变作者尚未决定的内容，说明具体取舍再提问。',
  },
  {
    id: 'dialogue-polish', label: '对白打磨', targets: ['chapter'], description: '局部改善对白的意思、衔接与人物声音。',
    instruction: '读取：原对白及前后文、说话人的关系和知情范围；文风参考作者指定样文或本书正式正文。产物：保持原意的对白修订，或按要求给另一种表达。技法：判断人物为什么这样说、对方如何接话，再处理确有问题的措辞和节奏。直说、沉默、潜台词与动作插入各有用途，采用适合这段的方式，保留人物原有口吻。',
  },
  {
    id: 'foreshadow-plant', label: '伏笔埋设', targets: ['chapter', 'outline'], description: '为作者已选择的后续发展安排线索。',
    instruction: '读取：要回收的后续事件、已有铺垫、当前原文与人物所知。产物：线索安排，或请求位置的正文修改。技法：考虑读者此刻能看见什么、后来如何重新理解；线索可以在对话、行为、环境或叙述中出现。保留当前段落本来的作用，未确定的后续发展先作为方案。',
  },
  {
    id: 'cold-open', label: '冷开场', targets: ['chapter'], description: '作者希望直接进入故事时，设计开场的切入位置。',
    instruction: '读取：作者想呈现的开局、人物关系、作品语域和已有开头。产物：开场方案或请求的开篇正文。技法：选择值得从这里开始的时刻，并让读者获得理解当下所需的信息。可从对白、观察、环境或行动切入，具体由作品决定；冷开场只是可选写法，不替所有章节规定动作开头或悬念结尾。',
  },
  {
    id: 'ghostwrite', label: '代笔续写', targets: ['chapter'], description: '衔接正式前文，延续这部作品的语言与事件进度。',
    instruction: '读取：落笔处的实际前文、当前人物与地点、有关设定和作者本次要求；已有内容不足时查阅相关原文。产物：接在指定位置的新增正文。技法：接住最近发生的事，保持适用的视角、语域与人物声音，给已发生的事件保留结果。作者指定的写法优先；未指定时从正式正文判断节奏，不拿未采用草稿或资料范例冒充本书文风，也不为了续写重新介绍已经在场的人物。',
  },
  {
    id: 'close-thread', label: '收束线索', targets: ['chapter', 'outline'], description: '处理已有铺垫、未完事件与章节收束。',
    instruction: '读取：有关铺垫原文、事件进度、作者希望结束或留下的部分。产物：收束方案或指定位置的正文。技法：让结果能从前面的事情理解，选择适合故事的兑现、变化或余韵；只处理本次涉及的线索，其他未完内容可继续保留。',
  },
  {
    id: 'line-polish', label: '局部润色', targets: ['chapter', 'worldbook'], description: '修正指定文字的表达问题，保留原有内容与文风。',
    instruction: '读取：指定原文、相邻段落和作者的修改意见。产物：该范围的修订文本；未要求改情节或设定时保持原有事实。技法：先判断原句在表达什么，定位搭配、指代、意象或衔接中的实际问题，再作局部修改。保留有作用的细节、歧义、重复和句子节奏；压短、华丽化或改成短句都不是通用的改进标准。',
  },
])

export function resolveWritingMethods(selected = [], { target } = {}) {
  const unique = new Map()
  for (const value of selected) {
    const method = ASSISTANT_WRITING_METHODS.find(item => item.id === value?.id)
      || (value?.label && value?.instruction ? value : null)
    if (method && (!target || !method.targets || method.targets.includes(target))) unique.set(method.id || method.label, { ...method })
  }
  return [...unique.values()]
}

export function writingMethodText(selected, options) {
  return resolveWritingMethods(selected, options).map(method => `【${method.label}】\n${method.instruction}`).join('\n\n')
}
