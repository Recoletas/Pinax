/**
 * 行动者身份与属性来源（CX19 最小纵切）。
 *
 * - actorRef 稳定且会话唯一：`actor:player:<sessionId>`——同名角色不串。
 * - 属性修正有两个可区分来源：actor 卡（持久 override，来源 'actor'）与
 *   单次确认面板的手动调整（来源 'manual-adjust'）。二者不合并、不互改：
 *   ruleSnapshot 记录最终修正值与来源，追溯可辨。
 * - 纯函数域；override 上限与轻规则一致（±3）。
 */

import { ROLEPLAY_RULE_2D6, ROLEPLAY_ATTRIBUTES, isValidAttributeKey } from './roleplayRules.js'

export const ROLEPLAY_ACTOR_VERSION = 1

export function buildActorRef(sessionId) {
  const id = String(sessionId || '').trim()
  if (!id) {
    throw Object.assign(new Error('actorRef 需要会话身份'), { code: 'ROLEPLAY_ACTOR_REF_INVALID' })
  }
  return `actor:player:${id}`
}

export function createActor({ sessionId, name = '玩家' } = {}) {
  return {
    version: ROLEPLAY_ACTOR_VERSION,
    actorRef: buildActorRef(sessionId),
    name: String(name || '玩家').slice(0, 40),
    // attributeKey → 修正值（±3，整数）；来源恒为 'actor'（手动单次调整不写入这里）。
    attributeOverrides: {},
    updatedAt: Date.now()
  }
}

export function normalizeActor(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Number(raw.version) !== ROLEPLAY_ACTOR_VERSION) return null
  const actorRef = String(raw.actorRef || '').trim()
  if (!actorRef.startsWith('actor:player:')) return null
  const overrides = {}
  if (raw.attributeOverrides && typeof raw.attributeOverrides === 'object' && !Array.isArray(raw.attributeOverrides)) {
    for (const [key, value] of Object.entries(raw.attributeOverrides)) {
      if (!isValidAttributeKey(key)) continue
      const numeric = Number(value)
      if (Number.isSafeInteger(numeric) && numeric >= ROLEPLAY_RULE_2D6.modifierRange.min && numeric <= ROLEPLAY_RULE_2D6.modifierRange.max) {
        overrides[key] = numeric
      }
    }
  }
  return {
    version: ROLEPLAY_ACTOR_VERSION,
    actorRef,
    name: String(raw.name || '玩家').slice(0, 40),
    attributeOverrides: overrides,
    updatedAt: Number(raw.updatedAt) || Date.now()
  }
}

/** 生效修正：actor override 优先，否则 0（来源 'actor'）；无 override 时调用方用 'manual-adjust'。 */
export function effectiveModifier(actor, attributeKey) {
  if (!actor || !isValidAttributeKey(attributeKey)) return { modifier: 0, source: 'manual-adjust' }
  const override = actor.attributeOverrides[attributeKey]
  if (Number.isSafeInteger(override)) return { modifier: override, source: 'actor' }
  return { modifier: 0, source: 'manual-adjust' }
}

/** 设置/清除属性 override（面板步进器）；越界拒绝。modifier=null 清除。 */
export function setActorOverride(actor, { attribute, modifier }) {
  if (!isValidAttributeKey(attribute)) {
    throw Object.assign(new Error('属性无效'), { code: 'ROLEPLAY_ATTRIBUTE_INVALID' })
  }
  if (modifier === null) {
    delete actor.attributeOverrides[attribute]
    actor.updatedAt = Date.now()
    return actor
  }
  const numeric = Number(modifier)
  if (!Number.isSafeInteger(numeric) || numeric < ROLEPLAY_RULE_2D6.modifierRange.min || numeric > ROLEPLAY_RULE_2D6.modifierRange.max) {
    throw Object.assign(new Error(`修正值必须是 ${ROLEPLAY_RULE_2D6.modifierRange.min}～${ROLEPLAY_RULE_2D6.modifierRange.max} 的整数`), {
      code: 'ROLEPLAY_MODIFIER_INVALID'
    })
  }
  if (numeric === 0) {
    delete actor.attributeOverrides[attribute]
  } else {
    actor.attributeOverrides[attribute] = numeric
  }
  actor.updatedAt = Date.now()
  return actor
}

/** 角色卡投影（UI 只读）：五属性 + 生效修正 + 来源。 */
export function buildActorCardProjection(actor) {
  const attributes = ROLEPLAY_ATTRIBUTES.map((attribute) => {
    const effective = effectiveModifier(actor, attribute.key)
    return {
      key: attribute.key,
      label: attribute.label,
      hint: attribute.hint,
      modifier: effective.modifier,
      source: effective.source
    }
  })
  return {
    actorRef: actor?.actorRef || null,
    name: actor?.name || '玩家',
    attributes
  }
}
