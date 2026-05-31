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
