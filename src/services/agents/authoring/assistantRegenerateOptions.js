import { AUTHORING_KNOWLEDGE_INTENTS } from './authoringKnowledgeAnswerContract.js'

// 「换参数重答」的两根轴都必须真实生效，因此取值全部对齐既有单源：
// · 意图 = 查询会话的证据权重档（authoringKnowledgeQuerySession 的 INTENT_PROFILES 键 + free），
//   与 AUTHORING_KNOWLEDGE_INTENTS 同集合，越界值会在 prepare 阶段 typed 拒绝。
// · 温度 = 逐请求覆盖，只在漏斗直连（/v1/pinax/complete）被上游采纳；kit 能力任务面
//   没有逐请求采样概念，所以重答固定走带出处的资料直查链，面板文案如实写明。
export const ASSISTANT_REGENERATE_INTENTS = Object.freeze([
  Object.freeze({ id: 'whole-book', label: '整本', hint: '正文与设定、大纲均衡取用' }),
  Object.freeze({ id: 'setting', label: '设定', hint: '以世界设定为准，配正文印证' }),
  Object.freeze({ id: 'character', label: '人物', hint: '重人物戏份与关系变化' }),
  Object.freeze({ id: 'foreshadowing', label: '伏笔', hint: '按大纲埋点与正文回收核对' }),
  Object.freeze({ id: 'clues', label: '线索', hint: '逐条追查前文线索与出处' }),
  Object.freeze({ id: 'calculation', label: '数值', hint: '年龄、时间线、里程等复算' }),
  Object.freeze({ id: 'free', label: '自由', hint: '不绑定资料，先聊想法' })
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
