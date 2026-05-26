const ENTRY_TYPES = new Set([
  'rule',
  'forbidden',
  'style',
  'character',
  'location',
  'item',
  'organization',
  'event',
  'lore',
  'quest',
  'general'
])

const TYPE_LABELS = {
  规则: 'rule',
  禁忌: 'forbidden',
  风格: 'style',
  角色: 'character',
  人物: 'character',
  地点: 'location',
  场景: 'location',
  物品: 'item',
  道具: 'item',
  组织: 'organization',
  阵营: 'organization',
  事件: 'event',
  设定: 'lore',
  世界观: 'lore',
  任务: 'quest',
  普通: 'general'
}

const FIELD_ALIASES = {
  name: ['名称', '名字', '条目名', 'name'],
  keys: ['关键词', '关键字', '触发词', 'keys'],
  type: ['类型', '分类', 'type'],
  content: ['内容', '正文', '设定', '描述', 'content']
}

function normalizeText(value) {
  return String(value || '').trim()
}

function splitList(value) {
  return normalizeText(value)
    .split(/[,\n，、/|；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeType(value) {
  const text = normalizeText(value)
  if (!text) return 'general'
  const lowered = text.toLowerCase()
  if (ENTRY_TYPES.has(lowered)) return lowered
  return TYPE_LABELS[text] || 'general'
}

function getFieldName(rawKey) {
  const key = normalizeText(rawKey)
  return Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.includes(key))?.[0] || null
}

function parseLabeledFields(content) {
  const fields = {}
  const bodyLines = []
  const lines = normalizeText(content).split(/\r?\n/)

  for (const line of lines) {
    const match = line.match(/^\s*([^:：]{1,12})\s*[:：]\s*(.*)$/)
    if (!match) {
      bodyLines.push(line)
      continue
    }

    const fieldName = getFieldName(match[1])
    if (!fieldName) {
      bodyLines.push(line)
      continue
    }

    fields[fieldName] = fields[fieldName]
      ? `${fields[fieldName]}\n${match[2]}`
      : match[2]
  }

  return {
    fields,
    body: bodyLines.join('\n').trim()
  }
}

function buildFallbackName(asset, content) {
  const title = normalizeText(asset?.title)
  if (title) return title.slice(0, 40)

  const firstLine = normalizeText(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine ? firstLine.slice(0, 40) : '未命名条目'
}

export function buildWorldbookEntryFromAsset(asset = {}) {
  const content = normalizeText(asset.content)
  if (!content) {
    throw new Error('世界书草稿内容不能为空')
  }

  const parsed = parseLabeledFields(content)
  const entryContent = normalizeText(parsed.fields.content) || parsed.body || content
  const name = normalizeText(parsed.fields.name) || buildFallbackName(asset, entryContent)
  const keys = splitList(parsed.fields.keys)
  const normalizedKeys = keys.length > 0 ? keys : [name]

  return {
    name,
    content: entryContent,
    keys: normalizedKeys,
    keysSecondary: [],
    type: normalizeType(parsed.fields.type),
    injection: {
      mode: 'selective',
      probability: 100,
      cooldown: 0,
      depth: 1,
      excludeRecursion: false,
      group: null
    },
    relations: {
      tags: ['素材草稿'],
      locations: [],
      characters: [],
      events: []
    },
    metadata: {
      importSource: 'narrative-asset',
      sourceAssetId: asset.id || ''
    }
  }
}

export function canConvertAssetToWorldbookEntry(asset = {}) {
  return asset.kind === 'worldbook-draft' && Boolean(normalizeText(asset.content))
}
