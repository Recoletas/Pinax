import { requestAdvisorTask } from '../../advisorTaskService.js'
import { buildAuthoringSceneDirectionEnvelope } from './authoringSceneDirectionPlanner.js'

export const REHEARSAL_MAX_STEPS = 4
export function parseRehearsalResponse(raw, allowedRefs = []) {
  const value = typeof raw === 'string' ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')) : raw
  const bounded = (text, max) => typeof text === 'string' && text.trim().length > 0 && text.length <= max
  if (!value || !bounded(value.response, 600) || !bounded(value.change, 160) ||
      !Array.isArray(value.choices) || value.choices.length < 1 || value.choices.length > 3 ||
      value.choices.some(choice => !bounded(choice, 80)) || !Array.isArray(value.evidenceRefs) ||
      value.evidenceRefs.length > 12 || value.evidenceRefs.some(ref => !allowedRefs.includes(ref))) {
    throw new Error('回应或依据不完整，请重试；已有试演仍为你保留。')
  }
  return { response: value.response.trim(), change: value.change.trim(), choices: [...value.choices], evidenceRefs: [...value.evidenceRefs] }
}

// 作者行动的会话内意图：谁行动、指向谁、原文。只在试演会话内存在，
// 不写入作品数据库或正式设定。
export function normalizeActionIntent(action) {
  if (action && typeof action === 'object') {
    const text = String(action.text || '').trim()
    return {
      text,
      actor: String(action.actor || '').trim(),
      targets: (Array.isArray(action.targets) ? action.targets : []).map(item => String(item || '').trim()).filter(Boolean)
    }
  }
  return { text: String(action || '').trim(), actor: '', targets: [] }
}

export function rehearsalPathText(steps) {
  return steps.map((step, i) => {
    const who = step.actor ? `${step.actor}${step.targets?.length ? `（对 ${step.targets.join('、')}）` : ''}` : '作者'
    return `${i + 1}. 行动 ${who}：${step.action}\n假想回应：${step.response}\n假想变化：${step.change}`
  }).join('\n\n')
}

// 在场人物边界（低敏：名字、角色标签、引用），供请求与归档共用。
export function rehearsalParticipants(run) {
  const list = Array.isArray(run?.pressureProjection?.participants) ? run.pressureProjection.participants : []
  return list
    .filter(person => person?.name)
    .map(person => ({
      name: String(person.name),
      roles: (Array.isArray(person.roles) ? person.roles : []).map(role => String(role)),
      ref: String(person.ref || '')
    }))
}

export async function requestRehearsalStep({ run, steps, action, signal, settingsSnapshot }) {
  const intent = normalizeActionIntent(action)
  if (!run?.runSession || steps.length >= REHEARSAL_MAX_STEPS || !intent.text || intent.text.length > 300) throw new Error('本次试演已到四步，或行动过长；请从较早一步换路。')
  const envelope = buildAuthoringSceneDirectionEnvelope({
    contextManifest: run.runSession.manifest,
    pressureProjection: run.pressureProjection,
    sessionFingerprint: run.runSession.manifest.fingerprint
  })
  const refs = envelope.blocks.flatMap(block => block.sourceRefs || [])
  const participants = rehearsalParticipants(run)
  const participantNames = new Set(participants.map(person => person.name))
  if (participants.length && (!intent.actor || !participantNames.has(intent.actor))) {
    throw new Error('行动者不在当前现场，请重新选择。')
  }
  if (intent.targets.some(name => name === intent.actor || !participantNames.has(name))) {
    throw new Error('动作对象必须是现场中的另一位人物，请重新选择。')
  }
  const cast = participants.map(person => `${person.name}（${person.roles.join('/') || '在场'}）`).join('、')
  const actorLine = intent.actor ? `行动者：${intent.actor}` : '行动者：未指明（按现场视角人物理解）'
  const targetLine = intent.targets.length ? `动作对象：${intent.targets.join('、')}` : '动作对象：未指明'
  const responders = participants.filter(person => person.name && person.name !== intent.actor)
  const responderLine = responders.length
    ? `允许回应者（也允许环境）：${responders.map(person => person.name).join('、')}`
    : '本场没有其他在场人物：不要虚构人物互动，写行动完成后环境与局势的直接后果。'
  const priorityLine = intent.targets.length ? `优先回应者（动作对象）：${intent.targets.join('、')}` : ''
  const result = await requestAdvisorTask({
    taskType: 'authoring.rehearsal.step', envelope, settingsSnapshot, signal,
    scope: 'writing', mode: 'direct', options: { toolChoice: 'none', maxOutputChars: 1800 },
    question: `这是未写入作品的隔离试演，不是批注改写。冻结现场是出发点，以下只包含当前路径，承接已发生的假想回应；不要回到起点或引入其他路径。\n${rehearsalPathText(steps) || '尚未试演。'}\n\n在场人物（仅限这些人物获得台词、名字或关键行动）：${cast || '（无）'}\n${actorLine}\n${targetLine}\n${responderLine}${priorityLine ? `\n${priorityLine}` : ''}\n本次作者行动：${intent.text}\n\n写作规则：\n1. 从行动完成后的那一瞬间接写。不要重演、描述或解释行动本身，直接写他人与环境对已完成行动的反应。\n2. 只演行动者之外的人物与环境：他们的动作、台词、态度、条件。不替行动者对白，不写行动者的内心独白。若有动作对象，由动作对象先作出直接回应；其他允许回应者只在现场关系确实需要时参与。\n3. 名单之外的人物不得出现台词、名字或关键行动；可以写门响、灯灭、沉默等环境反应，但环境异动必须来自冻结现场或已发生的行为，不用凭空的脚步声、陌生人制造紧张。\n4. 每个回应人物至少表现一个自己的目标、条件、保留或拒绝，不总是顺从行动者。\n5. change 用一两句写可继续使用的事实——位置、持有物、承诺、拒绝、暴露的信息、关系中的明确条件；不要只写「更加警觉」「信任加深」这类态度总结。若是路径第二步，必须继承前一步假想变化中已发生的具体事实。\n6. response 用具体动作与台词，中文引号。\n7. choices 每条以执行者名字开头（如「艾德加……」「莉娜……」），直接给动作原文，不加任何前缀或引号包裹，不预告结果。\n在作者继续介入之前暂停。`
  })
  return parseRehearsalResponse(result.result?.rehearsal || result.advice, refs)
}
