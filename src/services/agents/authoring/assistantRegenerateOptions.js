import { AUTHORING_KNOWLEDGE_INTENTS } from './authoringKnowledgeAnswerContract.js'

// PR #7 的重答选项复用；本地适配为同一 Agent 任务的参考侧重和逐请求采样。
// 不切换到资料直连，不扩张资料范围或写入权限。
export const ASSISTANT_REGENERATE_INTENTS = Object.freeze([
  Object.freeze({ id: 'whole-book', label: '综合', hint: '正文与设定、大纲均衡取用' }),
  Object.freeze({ id: 'setting', label: '设定', hint: '以世界设定为准，配正文印证' }),
  Object.freeze({ id: 'character', label: '人物', hint: '重人物戏份与关系变化' }),
  Object.freeze({ id: 'foreshadowing', label: '伏笔', hint: '按大纲埋点与正文回收核对' }),
  Object.freeze({ id: 'clues', label: '线索', hint: '逐条追查前文线索与出处' }),
  Object.freeze({ id: 'calculation', label: '数值', hint: '年龄、时间线、里程等复算' }),
  Object.freeze({ id: 'free', label: '自由', hint: '侧重讨论与构思，仍遵守作品事实和权限' })
])

export const ASSISTANT_REGENERATE_TEMPERATURES = Object.freeze([
  Object.freeze({ id: 'default', value: null, label: '默认', hint: '沿用模型缺省取样' }),
  Object.freeze({ id: 'rigorous', value: 0.2, label: '严谨', hint: '贴着资料作答，少发挥' }),
  Object.freeze({ id: 'open', value: 0.6, label: '铺开', hint: '更多角度与措辞变化' }),
  Object.freeze({ id: 'divergent', value: 1, label: '发散', hint: '更大胆的写法尝试，需自行核对依据' })
])

const KNOWN_INTENTS = new Set(AUTHORING_KNOWLEDGE_INTENTS)

export function isRegenerateIntent(value) {
  return KNOWN_INTENTS.has(String(value || ''))
}

export function regenerateTemperatureLabel(value) {
  const tier = ASSISTANT_REGENERATE_TEMPERATURES.find((item) => item.value === value)
  return tier ? tier.label : ''
}

export function regenerateIntentLabel(value) {
  const intent = ASSISTANT_REGENERATE_INTENTS.find((item) => item.id === value)
  return intent ? intent.label : ''
}

export function normalizeAssistantSampling(input) {
  if (!input || !isRegenerateIntent(input.intent)) return null
  const temperature = input.temperatureOverride
  if (temperature != null && (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)) return null
  return { intent: String(input.intent), temperatureOverride: temperature ?? null }
}
export function assistantFocusInstruction(intent) {
  const profile = ASSISTANT_REGENERATE_INTENTS.find(item => item.id === intent)
  return profile ? `本轮参考侧重：${profile.label}。${profile.hint}。这只调整侧重，不改变任务目标、资料授权或编辑权限。` : ''
}
