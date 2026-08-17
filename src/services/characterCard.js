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
  openingState: ['开场状态', '当前状态', '状态', 'openingstate', 'state']
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
    gender: text(source.gender),
    age: text(source.age),
    traits,
    description: text(source.description || source.persona) || description,
    goal: text(source.goal || source.motivation),
    greeting: text(source.greeting),
    mood: Number.isFinite(Number(source.mood)) ? Math.max(0, Math.min(100, Number(source.mood))) : 50,
    speechStyle: voice.speechStyle,
    samples: voice.samples
  }
}

function parseLabeledCard(chunk) {
  const fields = {}
  const body = []
  for (const rawLine of String(chunk || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([^:：]{1,16})\s*[:：]\s*(.*)$/)
    const key = match ? resolveLabel(match[1]) : ''
    if (!key) {
      body.push(line)
      continue
    }
    fields[key] = fields[key]
      ? `${fields[key]}${key === 'samples' ? '\n' : '；'}${match[2]}`
      : match[2]
  }
  if (!fields.name && body.length) fields.name = body[0]
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
