export const SETTING_SECTIONS = [
  {
    key: 'world',
    label: '世界观',
    description: '世界来源、地理、历史、势力与运行规则',
    fields: [
      { key: 'origin', label: '世界起源', entryType: 'lore', defaultGroup: '世界观' },
      { key: 'powerSystem', label: '力量体系', entryType: 'lore', defaultGroup: '世界观' },
      { key: 'geography', label: '地理环境', entryType: 'location', defaultGroup: '地理' },
      { key: 'history', label: '历史线', entryType: 'event', defaultGroup: '历史' },
      { key: 'factions', label: '势力分布', entryType: 'organization', defaultGroup: '势力' },
      { key: 'rules', label: '世界规则', entryType: 'rule', defaultGroup: '硬约束' }
    ]
  },
  {
    key: 'story',
    label: '故事核心',
    description: '故事概念、主题、冲突、主线与复线',
    fields: [
      { key: 'logline', label: '一句话故事', entryType: 'lore', defaultGroup: '故事核心' },
      { key: 'concept', label: '故事概念', entryType: 'lore', defaultGroup: '故事核心' },
      { key: 'theme', label: '主题', entryType: 'lore', defaultGroup: '故事核心' },
      { key: 'coreConflict', label: '核心冲突', entryType: 'event', defaultGroup: '故事核心' },
      { key: 'mainline', label: '主线', entryType: 'quest', defaultGroup: '故事核心' },
      { key: 'sublines', label: '复线', entryType: 'quest', defaultGroup: '故事核心' }
    ]
  },
  {
    key: 'characters',
    label: '角色设定',
    description: '主角、重要配角、NPC 与关系摘要',
    fields: [
      { key: 'protagonists', label: '主角', entryType: 'character', defaultGroup: '角色' },
      { key: 'majorSupporting', label: '重要配角', entryType: 'character', defaultGroup: '角色' },
      { key: 'npcs', label: 'NPC', entryType: 'character', defaultGroup: '角色' },
      { key: 'relationshipSummary', label: '关系摘要', entryType: 'lore', defaultGroup: '角色关系' }
    ]
  },
  {
    key: 'creativeRules',
    label: '创作规则',
    description: '文风、视角、基调、禁忌、一致性与参考作品',
    fields: [
      { key: 'writingStyle', label: '写作风格', entryType: 'style', defaultGroup: '文风约束' },
      { key: 'perspective', label: '叙事视角', entryType: 'style', defaultGroup: '文风约束' },
      { key: 'tone', label: '基调', entryType: 'style', defaultGroup: '文风约束' },
      { key: 'taboos', label: '禁忌', entryType: 'forbidden', defaultGroup: '禁写边界' },
      { key: 'consistency', label: '一致性规则', entryType: 'rule', defaultGroup: '硬约束' },
      { key: 'references', label: '参考作品', entryType: 'lore', defaultGroup: '参考' }
    ]
  }
]

// V2: entryType → controlType 派发表
export const ENTRY_TYPE_TO_CONTROL_TYPE = {
  lore: 'textarea',
  event: 'textarea',
  location: 'textarea',
  organization: 'textarea',
  quest: 'textarea',
  character: 'chips',
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
  list: 200
}

// V2: entryType 默认 placeholder
const PLACEHOLDERS_BY_ENTRY_TYPE = {
  lore: '描述这个设定的核心内容...',
  event: '描述事件的来龙去脉...',
  location: '描述地点的特征与边界...',
  organization: '描述势力的结构与目标...',
  quest: '描述这条故事线的目标与节奏...',
  character: '每行一个人物名（Enter 分隔）',
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
