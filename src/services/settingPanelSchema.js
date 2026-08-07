import { STRUCTURED_SETTING_SECTIONS } from '../../shared/structuredSettingContract'

export const SETTING_SECTIONS = STRUCTURED_SETTING_SECTIONS

// V2: entryType → controlType 派发表
export const ENTRY_TYPE_TO_CONTROL_TYPE = {
  lore: 'textarea',
  event: 'textarea',
  location: 'textarea',
  organization: 'textarea',
  quest: 'textarea',
  character: 'textarea',
  style: 'tags',
  rule: 'list',
  forbidden: 'list'
}

// V2: controlType 默认分隔符候选（first-seen / multiDelimiter 共享候选集）
export const CONTROL_TYPE_DELIMITERS = {
  textarea: [],
  chips: ['\n', ',', '，', ';', '；', '、'],
  tags: ['，', ',', '、', ' ', '\n'],
  list: ['\n']
}

// V2: controlType 默认 parse 模式
//   firstSeen      — chips/list：第一个出现的分隔符胜出，不二次切分
//                    （保护"a (主角)\nb, 勇敢的"等含中文标点的 token）
//   multiDelimiter — tags：所有候选分隔符都切，重复空白折叠
export const CONTROL_TYPE_PARSE_MODE = {
  textarea: 'firstSeen',
  chips: 'firstSeen',
  tags: 'multiDelimiter',
  list: 'firstSeen'
}

// V2: controlType 默认 maxLength
export const MAX_LENGTH_BY_CONTROL_TYPE = {
  textarea: 2000,
  chips: 100,
  tags: 50,
  // Rules are stored as newline-delimited text; 200 chars is too small for
  // several concrete rules and causes valid AI output to fail local checks.
  list: 800
}

// V2: entryType 默认 placeholder
const PLACEHOLDERS_BY_ENTRY_TYPE = {
  lore: '描述这个设定的核心内容...',
  event: '描述事件的来龙去脉...',
  location: '描述地点的特征与边界...',
  organization: '描述势力的结构与目标...',
  quest: '描述这条故事线的目标与节奏...',
  character: '姓名、身份、性格、目标等角色卡信息...',
  style: '用逗号 / 顿号 / 空格分隔多个标签',
  rule: '每行一条规则（可用 - 起头）',
  forbidden: '每行一条禁忌（可用 - 起头）'
}

export function createEmptyStructuredSettings() {
  return Object.fromEntries(
    SETTING_SECTIONS.map((section) => [
      section.key,
      Object.fromEntries(section.fields.map((field) => [field.key, '']))
    ])
  )
}

export function getSettingSection(sectionKey) {
  return SETTING_SECTIONS.find((section) => section.key === sectionKey) || null
}

export function getSettingField(sectionKey, fieldKey) {
  return getSettingSection(sectionKey)?.fields.find((field) => field.key === fieldKey) || null
}

export function normalizeStructuredSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const empty = createEmptyStructuredSettings()

  for (const section of SETTING_SECTIONS) {
    const sectionSource = source[section.key] && typeof source[section.key] === 'object'
      ? source[section.key]
      : {}
    for (const field of section.fields) {
      empty[section.key][field.key] = String(sectionSource[field.key] || '')
    }
  }

  return empty
}

export function summarizeStructuredSettings(settings, options = {}) {
  const normalized = normalizeStructuredSettings(settings)
  const lines = []
  const excluded = options.exclude || {}

  for (const section of SETTING_SECTIONS) {
    for (const field of section.fields) {
      if (excluded.sectionKey === section.key && excluded.fieldKey === field.key) continue
      const value = normalized[section.key][field.key].trim()
      if (!value) continue
      lines.push(`${field.label}：${value}`)
    }
  }

  return lines.join('\n')
}

// V2: entryType → controlType
export function getControlType(entryType) {
  return ENTRY_TYPE_TO_CONTROL_TYPE[entryType] || 'textarea'
}

// V2: 返回带 controlType/placeholder/maxLength/delimiter/parseMode 的完整 field meta
export function getFieldMeta(sectionKey, fieldKey) {
  const field = getSettingField(sectionKey, fieldKey)
  if (!field) return null
  const controlType = getControlType(field.entryType)
  return {
    ...field,
    controlType,
    delimiter: CONTROL_TYPE_DELIMITERS[controlType] || [],
    parseMode: CONTROL_TYPE_PARSE_MODE[controlType] || 'firstSeen',
    maxLength: MAX_LENGTH_BY_CONTROL_TYPE[controlType] || 2000,
    placeholder: PLACEHOLDERS_BY_ENTRY_TYPE[field.entryType] || '填写此项...'
  }
}

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g

function escapeForRegExp(ch) {
  return ch.replace(REGEX_ESCAPE, '\\$&')
}

// V2: 把 String 还原成 Array。
//   mode='firstSeen'      — 在候选集中选第一个出现的分隔符，按其切分
//                            （无候选/无胜出 → 单 token 兜底）
//   mode='multiDelimiter' — 候选集中任一分隔符都切，trim + filter 空 token
export function parseControlValue(raw, delimiters, mode = 'firstSeen') {
  if (raw == null) return []
  const text = String(raw)
  const delims = Array.isArray(delimiters) ? delimiters.filter(Boolean) : []
  if (delims.length === 0) {
    return text.trim() ? [text.trim()] : []
  }
  if (mode === 'multiDelimiter') {
    const re = new RegExp(delims.map(escapeForRegExp).join('|'))
    return text.split(re).map((s) => s.trim()).filter(Boolean)
  }
  // firstSeen
  let chosen = null
  let chosenIdx = Infinity
  for (const d of delims) {
    const idx = text.indexOf(d)
    if (idx !== -1 && idx < chosenIdx) {
      chosen = d
      chosenIdx = idx
    }
  }
  if (!chosen) {
    return text.trim() ? [text.trim()] : []
  }
  return text.split(chosen).map((s) => s.trim()).filter(Boolean)
}

// V2: 把 Array 序列化成 String
export function serializeControlValue(arr, delimiter = '\n') {
  if (!Array.isArray(arr)) return ''
  return arr.map((s) => String(s || '').trim()).filter(Boolean).join(delimiter)
}
