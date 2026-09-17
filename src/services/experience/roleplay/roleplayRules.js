/**
 * Pinax 轻规则（首夜范围）：2d6 + 显式修正 + 三档结果。
 *
 * 边界在 6/7/9/10 上冻结：总 ≥10 成功；7–9 部分成功（承担代价）；
 * ≤6 失败前进（受挫但局面继续推动）。这是本模块自写的简化规则说明，
 * 只借鉴 StoryForge 规则数据的"机械结果交给确定性引擎"思想；
 * 未导入其规则正文、属性/资源系统或任何第三方规则媒体。
 * 不冒称完整 D&D/CoC/PbtO 实现；后续扩档（关键成功/失败）属储备路线。
 */

export const ROLEPLAY_RULE_2D6 = Object.freeze({
  ruleId: 'pinax-roleplay-2d6',
  version: 1,
  expression: '2d6',
  thresholds: Object.freeze({ success: 10, partialSuccess: 7 }),
  // UI 步进器范围；合同校验（roleplayActionContract）与之对齐。
  modifierRange: Object.freeze({ min: -3, max: 3 })
})

export const ROLEPLAY_ATTRIBUTES = Object.freeze([
  { key: 'physique', label: '体魄', hint: '力量、耐力、硬碰硬' },
  { key: 'agility', label: '敏捷', hint: '速度、灵巧、潜行' },
  { key: 'wits', label: '头脑', hint: '推理、观察、学识' },
  { key: 'will', label: '意志', hint: '坚定、抗性、信念' },
  { key: 'presence', label: '气魄', hint: '交涉、威慑、表演' }
])

export const ROLEPLAY_OUTCOMES = Object.freeze({
  success: { key: 'success', label: '成功', direction: '如玩家所愿完成，可附带小顺利' },
  partial: { key: 'partial', label: '部分成功', direction: '达成但有明显代价、局限或新麻烦' },
  failure: { key: 'failure', label: '失败前进', direction: '受挫，但局面继续推动并暴露新信息' }
})

export function isValidAttributeKey(value) {
  return ROLEPLAY_ATTRIBUTES.some((attribute) => attribute.key === value)
}

export function attributeLabel(key) {
  const attribute = ROLEPLAY_ATTRIBUTES.find((item) => item.key === key)
  return attribute ? attribute.label : ''
}

/** 由结算总分唯一决定结果档位；score 必须是安全整数。 */
export function resolveOutcomeByTotal(total) {
  if (!Number.isSafeInteger(total)) {
    throw Object.assign(new Error('[roleplay-rules] 总分必须是安全整数'), { code: 'ROLEPLAY_RULE_INVALID' })
  }
  if (total >= ROLEPLAY_RULE_2D6.thresholds.success) return 'success'
  if (total >= ROLEPLAY_RULE_2D6.thresholds.partialSuccess) return 'partial'
  return 'failure'
}

/** 确认行的一句话规则明文（UI 与约束共用同一文案，避免两处漂移）。 */
export function describeRuleText({ modifier = 0 } = {}) {
  const sign = modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : ''
  return `掷 2d6${sign}：${ROLEPLAY_RULE_2D6.thresholds.success}+ 成功，7–9 部分成功（有代价），6- 失败前进。`
}

export function describeOutcomeText(outcomeKey, { dice = [], modifier = 0 } = {}) {
  const outcome = ROLEPLAY_OUTCOMES[outcomeKey]
  if (!outcome) return ''
  const total = (Array.isArray(dice) ? dice : []).reduce((sum, value) => sum + Number(value || 0), 0) + modifier
  const sign = modifier > 0 ? `+${modifier}` : modifier < 0 ? String(modifier) : ''
  return `2d6${sign} = ${total}（${dice.join(' + ') || '—'}）→ ${outcome.label}：${outcome.direction}`
}
