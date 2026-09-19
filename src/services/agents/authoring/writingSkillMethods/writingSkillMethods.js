// 助手写作 Skills 的方法文本与 prompt 组合（S05，计划 §5.1/§6.A）。
// 方法文本属于 agents/authoring 域：只承载评审方法与输出要求，经
// shared/writingSkillMethodContract.validateWritingSkillMethodDescription
// 校验（禁带文件路径、shell、任意 JS、网络地址），任务载入时只组合当前
// 目标相关的方法与公共「引用/文风/信息边界」片段，不把全部 references
// 送入模型。
import {
  WRITING_SKILL_METHODS,
  validateWritingSkillMethodDescription
} from '../../../../../shared/writingSkillMethodContract.js'

export const WRITING_SKILL_COMMON_FRAGMENT_IDS = Object.freeze([
  'citation',
  'style',
  'boundary'
])

const COMMON_FRAGMENTS = Object.freeze({
  citation: Object.freeze({
    title: '引用要求',
    text: '每条意见必须附可逐字核验的原文引用与位置；涉及事实或一致性冲突的结论，必须另给正文之外的授权资料作为另一端依据，只有正文自身不能既当结论又当证据。程序会拒绝引用与原文不一致的意见。'
  }),
  style: Object.freeze({
    title: '文风要求',
    text: '遵循给定的风格指令；作者文风优先于方法默认。风格层面的判断只能标注为审美建议，不得写成事实错误；不能用风格问题为理由虚构或改写事实。'
  }),
  boundary: Object.freeze({
    title: '信息边界',
    text: '只评审冻结范围内的正文与授权资料：不扩大范围、不评审范围外章节、不使用未授权设定。缺资料、读取失败或检索截断时必须如实声明缺失，不得编造资料或把推测当成事实；空结果要区分「检查完成没有明确问题」与「材料不足」。'
  })
})

const METHOD_TEXTS = Object.freeze({
  writingSkillMethods: Object.freeze({
    motivationCausality: Object.freeze({
      title: '动机与行动因果',
      summary: '围绕作者目标检查人物动机是否成立、行动是否有因果衔接。',
      methodText: [
        '只围绕作者目标做有限判断，不做全面打分。',
        '步骤：一、从作者目标确定关注人物与判断范围；二、逐窗读完正文，为每个影响目标的重要行动标注动机来源（前文有铺垫、当场有触发、或无依据）；三、动机或关系的突然转变必须给出前文可引用的证据，找不到就如实报告为缺依据；四、行动链缺环只指明缺口位置与影响，不臆测补写。',
        '每条意见给：位置逐字引用、为何影响作者目标、可落实的建议方向、认知类型（事实冲突、推断、审美建议或缺资料）。',
        '缺资料时写明缺哪份资料并停止判断，不编造动机。禁止把风格偏好说成事实错误，禁止给无法定位的全书泛评。'
      ].join('\n')
    }),
    setupPayoff: Object.freeze({
      title: '铺垫与兑现',
      summary: '检查伏笔与承诺是否在目标范围内得到铺垫或兑现，缺资料时如实标注。',
      methodText: [
        '一、从正文与授权资料中登记目标范围内的承诺与伏笔：人物承诺、物件去向、时间约定、未解释的悬念句。',
        '二、对每条标注状态：已兑现（附兑现处引用）、范围内未兑现（附铺垫处引用）、缺资料（写明无法判断缺哪份资料）。',
        '三、兑现发生在冻结范围外时标注为「范围外可能已兑现」，不得当作缺失报告；四、普通描写不得强行读成伏笔；五、新增伏笔只在作者目标明确要求时报告。',
        '每条意见必须双端引用：铺垫处与应兑现处各一段原文，单端不成立。'
      ].join('\n')
    }),
    pacingRedundancy: Object.freeze({
      title: '节奏与冗余',
      summary: '检查节奏拖沓、重复表述与冗余段落，风格偏好不得升级为事实冲突。',
      methodText: [
        '一、先读作者目标对节奏的要求；目标没有要求时，采用保守默认：每段至少推进一个新信息或新情绪。',
        '二、标注三类问题：停滞段（不含新信息的对话或描写）、重复表述（同一信息以相同或近同句式重现）、冗余解释（向读者复述其已知内容）。',
        '三、重复判定必须给出至少两处逐字或近逐字引用；四、节奏判断一律标注为审美建议并落到具体段落；五、排比、复沓、口头禅可能是刻意的风格手法，先确认不是刻意再报告。',
        '禁止把作者文风当作冗余，禁止按固定字数节奏给出意见。'
      ].join('\n')
    })
  })
})

export function getWritingSkillMethodText(textId) {
  const [group, key] = String(textId ?? '').split('.')
  return METHOD_TEXTS[group]?.[key] ?? null
}

// 注册表自检：shared 注册表引用的每个 methodTextId 都必须有文本且通过
// 描述校验。文本与合同不同批更新时这里立即暴露。
export function validateRegisteredWritingSkillMethods() {
  const problems = []
  for (const method of registeredMethods()) {
    const textRecord = getWritingSkillMethodText(method.methodTextId)
    if (!textRecord) {
      problems.push(`missing-method-text:${method.methodTextId}`)
      continue
    }
    const validation = validateWritingSkillMethodDescription({
      title: textRecord.title,
      summary: textRecord.summary,
      methodText: textRecord.methodText
    })
    if (!validation.valid) problems.push(`${method.methodTextId}:${validation.reason}`)
  }
  return { ok: problems.length === 0, problems }
}

const registeredMethodsCache = WRITING_SKILL_METHODS

function registeredMethods() {
  return registeredMethodsCache
}

/**
 * 组合一次目标审稿的模型指令：目标节 + 选中方法文本 + 公共三片段 +
 * 已消解风格指令。只包含当前方法，不携带其他方法文本或 references。
 */
export function composeWritingSkillReviewPrompt({
  skillId,
  skillVersion,
  goal,
  styleDirectives = [],
  scopeKind = 'chapter'
} = {}) {
  const method = registeredMethodsCache.find((row) => (
    row.id === String(skillId ?? '').trim() && Number(skillVersion) === row.version
  ))
  if (!method) return { ok: false, reason: 'skill-unknown-or-version-mismatch' }
  const methodText = getWritingSkillMethodText(method.methodTextId)
  if (!methodText) return { ok: false, reason: 'method-text-missing' }
  const goalText = String(goal ?? '').trim()
  if (!goalText) return { ok: false, reason: 'goal-missing' }

  const styleLines = (Array.isArray(styleDirectives) ? styleDirectives : [])
    .map((directive) => `-[${directive?.source ?? 'invocation'}][${String(directive?.dimension ?? '').trim()}] ${String(directive?.directive ?? '').trim()}`)
    .filter((line) => !line.endsWith('] '))

  const sections = Object.freeze({
    goal: `【作者目标】\n${goalText.slice(0, 400)}\n【评审范围】${scopeKind === 'selection' ? '当前选区' : scopeKind === 'whole-book' ? '全书（分批）' : '当前章'}`,
    method: `【方法：${methodText.title}】\n${methodText.methodText}`,
    fragments: Object.freeze(Object.fromEntries(
      WRITING_SKILL_COMMON_FRAGMENT_IDS.map((id) => [id, `【${COMMON_FRAGMENTS[id].title}】\n${COMMON_FRAGMENTS[id].text}`])
    )),
    style: styleLines.length ? `【风格指令】\n${styleLines.join('\n')}` : ''
  })
  const prompt = [
    sections.goal,
    sections.method,
    sections.fragments.citation,
    sections.fragments.style,
    sections.fragments.boundary,
    sections.style
  ].filter(Boolean).join('\n\n')
  return { ok: true, reason: '', method, prompt, sections }
}
