/**
 * 档案迁移纯函数（W·卡片制 S1）——角色卡 13 标签 ↔ profile 模板字段映射、
 * 条目扫描、回填与重复标记。
 *
 * 裁定（编排者冻结，不重设计）：
 * - profile.values 是「模板键 + 自由键」共存：模板字段落得进的用模板 key
 *   （background/personality/appearance 直落），落不进的（性别/年龄/身份/目标/
 *   关系/开场状态/其他）以标签名直接作 values 键保留；编辑器对自由键渲染通用字段。
 * - 声口横切：speechStyle → speech.speechStyle、samples → speech.samples；
 *   name → 条目名，不进 values。
 * - 迁移是尽力而为：模板必填字段缺失不报错，缺的留给编辑器补。
 * - 去重保守：不自动删除，markDuplicates 只打 metadata.duplicateOf 标记
 *   （保留方 = 最早创建），真删除由用户在 UI 确认。
 *
 * 本模块零 Vue/store 依赖；单向依赖 entryProfileTemplates（无环）。
 */

import { getProfileTemplate, normalizeSpeech, parseLabeledBlocks, speechHasContent } from './entryProfileTemplates.js'

/**
 * 13 标签 → profile 落点映射（FIELD_ALIASES 的 canonical 名为键）。
 * - target 'entryName'：不进 values，回填时由调用方写条目名。
 * - target 'value'：进 profile.values；key=模板字段 key 或自由键标签名。
 * - target 'speechStyle' / 'speechSamples'：进 profile.speech（声口横切）。
 */
export const CARD_PROFILE_FIELD_MAP = {
  name: { target: 'entryName', label: '姓名' },
  gender: { target: 'value', key: '性别', label: '性别' },
  age: { target: 'value', key: '年龄', label: '年龄' },
  identity: { target: 'value', key: '身份', label: '身份' },
  appearance: { target: 'value', key: 'appearance', label: '外貌' },
  personality: { target: 'value', key: 'personality', label: '性格' },
  background: { target: 'value', key: 'background', label: '背景' },
  goal: { target: 'value', key: '目标', label: '目标' },
  relation: { target: 'value', key: '关系', label: '关系' },
  speechStyle: { target: 'speechStyle', label: '说话方式' },
  samples: { target: 'speechSamples', label: '示例台词' },
  openingState: { target: 'value', key: '开场状态', label: '开场状态' },
  other: { target: 'value', key: '其他', label: '其他' }
}

// 自由键白名单外的危险键名（values 直接暴露给模板投影与 JSON 往返）
const UNSAFE_FREE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isSafeFreeKey(key) {
  const text = String(key ?? '').trim()
  return Boolean(text) && !UNSAFE_FREE_KEYS.has(text)
}

function text(value) {
  return String(value ?? '').trim()
}

function cardFieldValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean).join('、')
  return text(value)
}

/**
 * 角色卡字段 + 模板 → 完整 profile 草稿 { template, values, speech }。
 * 只映射有值的字段；模板必填缺失不补、不报错（尽力而为）。
 */
export function buildProfileFromLabeledCard(card = {}, templateId = '') {
  const template = getProfileTemplate(templateId)
  const values = {}
  for (const [field, mapping] of Object.entries(CARD_PROFILE_FIELD_MAP)) {
    if (mapping.target !== 'value') continue
    const value = cardFieldValue(card?.[field])
    if (value) values[mapping.key] = value
  }
  const speech = normalizeSpeech({
    enabled: false,
    speechStyle: card?.speechStyle,
    samples: Array.isArray(card?.samples) ? card.samples.join('\n') : card?.samples
  })
  speech.enabled = speechHasContent(speech)
  return { template: template.id, values, speech }
}

/** profile 是否为空（无 values 值且无声口内容；template id 不算内容） */
export function isProfileEmpty(entry) {
  const profile = entry?.profile
  if (!profile || typeof profile !== 'object') return true
  const values = profile.values && typeof profile.values === 'object' ? profile.values : {}
  if (Object.entries(values).some(([key, value]) => isSafeFreeKey(key) && text(value))) return false
  return !speechHasContent(normalizeSpeech(profile.speech))
}

/**
 * 扫描可迁移与疑似重复条目。
 * - needsMigration：profile 为空且 content 含 ≥3 个【标签】块的条目。
 * - duplicates：同名同 kind 的条目组（保守：不做 content 相似度）；保留方 =
 *   metadata.createdAt 最早（并列取数组序靠前）。
 */
export function scanEntriesForMigration(entries = []) {
  const list = Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry === 'object') : []
  const needsMigration = list.filter((entry) => isProfileEmpty(entry) && parseLabeledBlocks(entry.content).length >= 3)

  const groups = new Map()
  for (let index = 0; index < list.length; index += 1) {
    const entry = list[index]
    const name = text(entry.name)
    if (!name) continue
    const kind = text(entry.type) || 'general'
    const groupKey = `${name.toLocaleLowerCase()}::${kind}`
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push({ entry, index })
  }

  const duplicates = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const sorted = [...members].sort((left, right) => {
      const leftAt = Number(left.entry.metadata?.createdAt) || 0
      const rightAt = Number(right.entry.metadata?.createdAt) || 0
      return (leftAt - rightAt) || (left.index - right.index)
    })
    duplicates.push({
      name: text(sorted[0].entry.name),
      type: text(sorted[0].entry.type) || 'general',
      keepId: sorted[0].entry.id,
      duplicateIds: sorted.slice(1).map((member) => member.entry.id)
    })
  }
  return { needsMigration, duplicates }
}

/**
 * 回填：返回携带新 profile 的新条目对象（不可变风格；正文/触发词等一律不动）。
 * parsedProfile 非对象时原 profile 保留（调用方传坏值不炸）。
 */
export function applyMigration(entry, parsedProfile) {
  if (!entry || typeof entry !== 'object') return entry
  if (!parsedProfile || typeof parsedProfile !== 'object') return { ...entry }
  return { ...entry, profile: parsedProfile }
}

/**
 * 重复标记（保守裁定）：只给重复条目加 metadata.duplicateOf = 保留条目 id。
 * 只加标不清标：先前被标记、现在不再是重复的条目保持原样（不自动翻案）。
 *
 * @returns 新条目数组（未变化的原对象原样返回）
 */
export function markDuplicates(entries = []) {
  const list = Array.isArray(entries) ? entries : []
  const { duplicates } = scanEntriesForMigration(list)
  const duplicateOfByEntryId = new Map()
  for (const group of duplicates) {
    for (const id of group.duplicateIds) duplicateOfByEntryId.set(id, group.keepId)
  }
  if (!duplicateOfByEntryId.size) return list
  return list.map((entry) => {
    const keepId = duplicateOfByEntryId.get(entry.id)
    if (!keepId) return entry
    return { ...entry, metadata: { ...(entry.metadata || {}), duplicateOf: keepId } }
  })
}
