import { normalizeNarrativeVoiceProfile } from './narrativeVoiceProfile'

const FIELD_ALIASES = {
  name: ['姓名', '名字', '角色名', 'name'],
  gender: ['性别', 'gender'],
  age: ['年龄', '年纪', 'age'],
  identity: ['身份', '定位', '职业', '身份定位', 'role', 'title'],
  appearance: ['外貌', '外观', 'appearance'],
  personality: ['性格', '性格特征', 'personality', 'traits'],
  background: ['背景', '经历', '背景经历', 'background', 'backstory'],
  goal: ['目标', '当前目标', '动机', 'goal', 'motivation'],
  relation: ['关系', '关系网', 'relation', 'relations'],
  speechStyle: ['说话方式', '口吻', '语言风格', 'speechstyle', 'speakingstyle'],
  samples: ['示例台词', '台词样例', 'samples', 'mesexample'],
  openingState: ['开场状态', '当前状态', '状态', 'openingstate', 'state'],
  other: ['其他', '备注', '补充', 'other', 'notes']
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function splitTraits(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).slice(0, 12)
  return text(value)
    .split(/[、，,；;|/]+/)
    .map(text)
    .filter(Boolean)
    .slice(0, 12)
}

function resolveLabel(rawLabel) {
  const label = text(rawLabel).toLowerCase().replace(/[\s_-]+/g, '')
  return Object.entries(FIELD_ALIASES)
    .find(([, aliases]) => aliases.some((alias) => text(alias).toLowerCase().replace(/[\s_-]+/g, '') === label))?.[0] || ''
}

const LABELED_CARD_FIELD_PATTERN = Object.values(FIELD_ALIASES)
  .flat()
  .sort((left, right) => right.length - left.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

function fromObject(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw.character && typeof raw.character === 'object' ? raw.character : raw
  const name = text(source.name || source.displayName)
  if (!name) return null
  const traits = splitTraits(source.traits || source.personality)
  const voice = normalizeNarrativeVoiceProfile(source, name)
  const description = [
    source.identity || source.role || source.title ? `身份：${text(source.identity || source.role || source.title)}` : '',
    source.appearance ? `外貌：${text(source.appearance)}` : '',
    source.background || source.backstory ? `背景：${text(source.background || source.backstory)}` : '',
    source.relation || source.relations ? `关系：${text(source.relation || source.relations)}` : '',
    source.speechStyle || source.speakingStyle ? `说话方式：${text(source.speechStyle || source.speakingStyle)}` : '',
    source.openingState || source.state ? `开场状态：${text(source.openingState || source.state)}` : ''
  ].filter(Boolean).join('；')
  return {
    name,
    identity: text(source.identity || source.role || source.title),
    gender: text(source.gender),
    age: text(source.age),
    traits,
    personality: text(source.personality) || traits.join('、'),
    appearance: text(source.appearance),
    background: text(source.background || source.backstory),
    relation: text(source.relation || source.relations),
    openingState: text(source.openingState || source.state),
    other: text(source.other || source.notes),
    description: text(source.description || source.persona) || description,
    goal: text(source.goal || source.motivation),
    greeting: text(source.greeting),
    mood: Number.isFinite(Number(source.mood)) ? Math.max(0, Math.min(100, Number(source.mood))) : 50,
    speechStyle: voice.speechStyle,
    samples: voice.samples
  }
}

function parseLabeledCard(chunk) {
  const source = String(chunk || '')
    .replace(/\*\*([^*\r\n]{1,24})\*\*\s*[:：]/g, '$1：')
    .trim()
  const fields = {}
  const matcher = new RegExp(`(^|[\\s，,；;])(${LABELED_CARD_FIELD_PATTERN})\\s*[:：]`, 'giu')
  const matches = [...source.matchAll(matcher)]
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const key = resolveLabel(match[2])
    if (!key) continue
    const valueStart = Number(match.index) + match[0].length
    const valueEnd = index + 1 < matches.length ? Number(matches[index + 1].index) : source.length
    const value = source.slice(valueStart, valueEnd).trim().replace(/^[，,；;]+|[，,；;]+$/g, '').trim()
    fields[key] = fields[key]
      ? `${fields[key]}${key === 'samples' ? '\n' : '；'}${value}`
      : value
  }
  const parsed = fromObject(fields)
  if (!parsed) return null
  const details = [
    fields.identity ? `身份：${text(fields.identity)}` : '',
    fields.appearance ? `外貌：${text(fields.appearance)}` : '',
    fields.background ? `背景：${text(fields.background)}` : '',
    fields.relation ? `关系：${text(fields.relation)}` : '',
    fields.speechStyle ? `说话方式：${text(fields.speechStyle)}` : '',
    fields.openingState ? `开场状态：${text(fields.openingState)}` : ''
  ].filter(Boolean).join('；')
  if (details) parsed.description = text(parsed.description) || details
  return parsed
}

function splitCardChunks(content) {
  const normalized = String(content || '').trim()
  if (!normalized) return []
  const separated = normalized.split(/\n\s*---+\s*\n/).map((part) => part.trim()).filter(Boolean)
  if (separated.length > 1) return separated
  const chunks = normalized.split(/(?=^\s*(?:姓名|名字|角色名)\s*[:：])/m).map((part) => part.trim()).filter(Boolean)
  return chunks.length ? chunks : [normalized]
}

export function parseCharacterCards(content) {
  const raw = String(content || '').trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const values = Array.isArray(parsed) ? parsed : [parsed]
    const cards = values.map(fromObject).filter(Boolean)
    if (cards.length) return cards
  } catch {
    // 结构化设定默认使用可读的标签文本；JSON 仅作为导入兼容格式。
  }
  return splitCardChunks(raw).map(parseLabeledCard).filter(Boolean).slice(0, 4)
}

export function parseCharacterCard(content) {
  return parseCharacterCards(content)[0] || null
}

export function characterProfileFromCard(card = {}) {
  const other = [
    card.identity ? `身份：${text(card.identity)}` : '',
    card.gender ? `性别：${text(card.gender)}` : '',
    card.age ? `年龄：${text(card.age)}` : '',
    card.goal ? `目标：${text(card.goal)}` : '',
    card.relation ? `关系：${text(card.relation)}` : '',
    card.openingState ? `开场状态：${text(card.openingState)}` : '',
    card.other ? text(card.other) : ''
  ].filter(Boolean).join('\n')
  return {
    background: text(card.background) || text(card.description),
    personality: text(card.personality) || splitTraits(card.traits).join('、'),
    appearance: text(card.appearance),
    other,
    avatar: text(card.avatar)
  }
}

export function parseCharacterEntryProfile(entry = {}) {
  const stored = entry?.metadata?.characterProfile
  if (stored && typeof stored === 'object') {
    return {
      background: String(stored.background || ''),
      personality: String(stored.personality || ''),
      appearance: String(stored.appearance || ''),
      other: String(stored.other || ''),
      avatar: String(stored.avatar || entry?.avatar || '')
    }
  }
  const card = parseCharacterCard(`姓名：${text(entry?.name) || '未命名角色'}\n${String(entry?.content || '')}`)
  const profile = characterProfileFromCard(card || { description: entry?.content, avatar: entry?.avatar })
  if (![profile.background, profile.personality, profile.appearance, profile.other].some((value) => String(value || '').trim())) {
    profile.background = String(entry?.content || '')
  }
  return profile
}

export function serializeCharacterEntryProfile(profile = {}) {
  return [
    ['背景', profile.background],
    ['性格', profile.personality],
    ['外貌', profile.appearance],
    ['其他', profile.other]
  ].filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => `${label}：${String(value).trim()}`)
    .join('\n')
}
