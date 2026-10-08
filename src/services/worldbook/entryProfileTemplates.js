/**
 * 条目编辑面纯逻辑（W3·B2）——人物卡 profile 模板 + 声口横切 + 改名触发词同步。
 *
 * 产品规格源：docs/plan/worldbook-unification-20261007.md §4.1（卡型模板表）。
 * 冻结契约：docs/plan/worldbook-unification-abc-20261008.md §3.1（profile 为
 * frontmatter 对象块，kit 解析器不可见）、§3.4（entry.profile 可选字段）。
 *
 * 硬规则：
 * - `content` 是注入真相：renderToContent 只是 profile→content 的单向投影，
 *   任何覆盖都必须经用户显式确认（EntryProfileEditor 的「以原文为准/覆盖原文」）。
 * - 模板 UI 词汇不出现内部术语（kit/卡型/profile 等字样不进 label）。
 * - 本模块零依赖（无 Vue / store / composable），node 冒烟直跑
 *   （scripts/worldbook-editing-smoke.mjs）。
 *
 * 模板形状：{ id, label, fields: [{ key, label, required?, multiline? }], renderToContent(profile) }
 * profile 形状：{ template: id, values: { [fieldKey]: string }, speech: { enabled, speechStyle,
 *   vocabularyCommon: string[], vocabularyForbidden: string[], samples: string[], greeting } }
 * values 是「模板键 + 自由键」共存：模板没有的【标签】以标签名作自由键保留
 * （renderToContent 同序投影回去，覆盖原文不丢数据）。
 * 声口为横切：所有模板可开（§4.1「声口（横切，所有模板可开）」）。
 */

/* ---------- 声口横切字段 ---------- */

export const SPEECH_FIELD_DEFS = [
  { key: 'speechStyle', label: '说话方式', multiline: true },
  { key: 'vocabularyCommon', label: '常用词' },
  { key: 'vocabularyForbidden', label: '禁用词' },
  { key: 'samples', label: '示例台词', multiline: true },
  { key: 'greeting', label: '登场问候', multiline: true }
]

export const SPEECH_LABELS = Object.fromEntries(SPEECH_FIELD_DEFS.map((f) => [f.key, f.label]))

function emptySpeech() {
  return { enabled: false, speechStyle: '', vocabularyCommon: [], vocabularyForbidden: [], samples: [], greeting: '' }
}

function toLineList(value, { max = 12 } = {}) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/)
  const out = []
  const seen = new Set()
  for (const item of source) {
    const s = String(item ?? '').replace(/\s+/g, ' ').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

function toText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim()
}

/* ---------- 七模板（§4.1 表格逐字段落地） ---------- */

/** 自由键安全判定：values 键会进模板投影与 JSON 往返，危险键名一律不入 */
function isSafeFreeKey(key) {
  const text = String(key ?? '').trim()
  return Boolean(text) && !['__proto__', 'constructor', 'prototype'].includes(text)
}

function makeTemplate(id, label, fields, extra = {}) {
  /** renderToContent：模板字段顺序投影 + 自由键块 + 声口横切块；全空返回空串。
   *  自由键（values 里非模板键/非模板标签）以「【键】值」投影在模板字段之后，
   *  与 parseLabeledBlocks 反解互逆，覆盖原文时自由字段不丢。 */
  function renderToContent(profile) {
    const values = profile?.values && typeof profile.values === 'object' ? profile.values : {}
    const knownKeys = new Set(fields.map((field) => field.key))
    const knownLabels = new Set(fields.map((field) => field.label))
    const blocks = []
    for (const field of fields) {
      const value = toText(values[field.key])
      if (!value) continue
      blocks.push(`【${field.label}】${value}`)
    }
    for (const [key, rawValue] of Object.entries(values)) {
      if (knownKeys.has(key) || knownLabels.has(key) || !isSafeFreeKey(key)) continue
      const value = toText(rawValue)
      if (value) blocks.push(`【${key}】${value}`)
    }
    const speech = normalizeSpeech(profile?.speech)
    if (speech.enabled) {
      const speechBlocks = []
      if (speech.speechStyle) speechBlocks.push(`【${SPEECH_LABELS.speechStyle}】${speech.speechStyle}`)
      if (speech.vocabularyCommon.length) speechBlocks.push(`【${SPEECH_LABELS.vocabularyCommon}】${speech.vocabularyCommon.join('、')}`)
      if (speech.vocabularyForbidden.length) speechBlocks.push(`【${SPEECH_LABELS.vocabularyForbidden}】${speech.vocabularyForbidden.join('、')}`)
      if (speech.samples.length) speechBlocks.push(`【${SPEECH_LABELS.samples}】${speech.samples.join('\n')}`)
      if (speech.greeting) speechBlocks.push(`【${SPEECH_LABELS.greeting}】${speech.greeting}`)
      blocks.push(...speechBlocks)
    }
    return blocks.join('\n\n')
  }
  return { id, label, fields, renderToContent, ...extra }
}

/** 通用核心字段（Pinax 解析器已认识的四框并集；§4.1「通用 13 字段之外」才计入专属）。
 *  必填口径随模板走（主角=背景/性格/弧线、主要配角=功能位/性格），故按模板克隆。 */
function commonFields({ background = false, personality = false } = {}) {
  return [
    { key: 'background', label: '背景', required: background, multiline: true },
    { key: 'personality', label: '性格', required: personality, multiline: true },
    { key: 'appearance', label: '外貌', multiline: true }
  ]
}

export const ENTRY_PROFILE_TEMPLATES = [
  makeTemplate('protagonist', '主角', [
    ...commonFields({ background: true, personality: true }),
    { key: 'currentArc', label: '当前弧线', required: true, multiline: true },
    { key: 'wantVsNeed', label: '想要与需要', multiline: true },
    { key: 'secret', label: '秘密', multiline: true },
    { key: 'forbidden', label: '作者禁写项', multiline: true },
    { key: 'voiceLock', label: '声线锚定', multiline: true }
  ]),
  makeTemplate('majorSupporting', '主要配角', [
    ...commonFields({ personality: true }),
    { key: 'functionPosition', label: '功能位', required: true, multiline: true },
    { key: 'relationshipToProtagonist', label: '与主角的关系', multiline: true },
    { key: 'exitPlan', label: '退场计划', multiline: true }
  ]),
  makeTemplate('minorSupporting', '次要配角', [
    ...commonFields(),
    { key: 'functionPosition', label: '功能位', required: true, multiline: true },
    { key: 'screenTimeBudget', label: '戏份预算', multiline: true },
    { key: 'reusableTags', label: '复用标签', multiline: true }
  ]),
  makeTemplate('npc', 'NPC', [
    ...commonFields(),
    { key: 'roleSlot', label: '功能位', required: true, multiline: true },
    { key: 'knowledgeScope', label: '知识边界', required: true, multiline: true },
    { key: 'appearsIn', label: '登场范围', multiline: true }
  ]),
  makeTemplate('extra', '路人', [
    ...commonFields(),
    { key: 'oneLineTag', label: '一句话标签', required: true, multiline: true }
  ]),
  makeTemplate('villain', '反派', [
    ...commonFields(),
    { key: 'threatLadder', label: '威胁位阶', required: true, multiline: true },
    { key: 'ideology', label: '动机信念', required: true, multiline: true },
    { key: 'onstageRule', label: '登场规则', multiline: true }
  ]),
  makeTemplate('factionFigure', '势力人物', [
    ...commonFields(),
    { key: 'orgLink', label: '所属势力', required: true, multiline: true },
    { key: 'rank', label: '位阶', multiline: true },
    { key: 'factionGoal', label: '势力目标', multiline: true }
  ])
]

export const DEFAULT_PROFILE_TEMPLATE_ID = ENTRY_PROFILE_TEMPLATES[0].id

/** 模板 id → 模板；未知 id 回落默认模板（主角） */
export function getProfileTemplate(id) {
  const key = String(id ?? '').trim()
  return ENTRY_PROFILE_TEMPLATES.find((template) => template.id === key) ||
    ENTRY_PROFILE_TEMPLATES.find((template) => template.id === DEFAULT_PROFILE_TEMPLATE_ID)
}

/** 归一 speech 块（列表去重限长、文本 trim；enabled 显式布尔） */
export function normalizeSpeech(speech) {
  const source = speech && typeof speech === 'object' ? speech : {}
  return {
    enabled: source.enabled === true,
    speechStyle: toText(source.speechStyle).slice(0, 240),
    vocabularyCommon: toLineList(source.vocabularyCommon),
    vocabularyForbidden: toLineList(source.vocabularyForbidden),
    samples: toLineList(source.samples),
    greeting: toText(source.greeting).slice(0, 240)
  }
}

/** 空白 profile（指定模板 id；未知回落默认模板） */
export function emptyProfile(templateId = DEFAULT_PROFILE_TEMPLATE_ID) {
  return { template: getProfileTemplate(templateId)?.id || DEFAULT_PROFILE_TEMPLATE_ID, values: {}, speech: emptySpeech() }
}

/** 从「【标签】值」正文反解声口横切块（【说话方式】【常用词】【禁用词】【示例台词】【登场问候】） */
function speechFromContent(contentText) {
  const labeled = new Map(parseLabeledBlocks(contentText))
  const speech = emptySpeech()
  speech.speechStyle = toText(labeled.get(SPEECH_LABELS.speechStyle)).slice(0, 240)
  speech.vocabularyCommon = toLineList(String(labeled.get(SPEECH_LABELS.vocabularyCommon) ?? '').split(/[,，、;；/]+/))
  speech.vocabularyForbidden = toLineList(String(labeled.get(SPEECH_LABELS.vocabularyForbidden) ?? '').split(/[,，、;；/]+/))
  speech.samples = toLineList(labeled.get(SPEECH_LABELS.samples))
  speech.greeting = toText(labeled.get(SPEECH_LABELS.greeting)).slice(0, 240)
  return speech
}

export function speechHasContent(speech) {
  return Boolean(speech.speechStyle || speech.vocabularyCommon.length || speech.vocabularyForbidden.length || speech.samples.length || speech.greeting)
}

/** 就空补合两份声口（base 优先；用于 stored profile > 正文反解 > 顶层旧声口 的优先级链） */
function mergeSpeech(base, fallback) {
  const merged = { ...base }
  if (!merged.speechStyle) merged.speechStyle = fallback.speechStyle
  if (!merged.vocabularyCommon.length) merged.vocabularyCommon = fallback.vocabularyCommon
  if (!merged.vocabularyForbidden.length) merged.vocabularyForbidden = fallback.vocabularyForbidden
  if (!merged.samples.length) merged.samples = fallback.samples
  if (!merged.greeting) merged.greeting = fallback.greeting
  return merged
}

/**
 * 从既有条目反解 profile：content 的【标签】行回填同名字段（模板 label 逆映射），
 * 模板没有的标签以标签名直接作自由键保留进 values（声口横切标签除外，它们落
 * speech；这是「profile 全空」解析侧的修复点——身份/性别/年龄等不再被丢弃），
 * 声口横切块按 stored profile > content 反解 > 顶层 speechStyle/samples（既有
 * 「角色声口」编辑器数据）的优先级回填；任一来源非空即视为已启用。
 */
export function profileFromEntry(entry, templateId = '') {
  const template = getProfileTemplate(templateId || entry?.profile?.template)
  const profile = emptyProfile(template.id)
  const contentText = typeof entry?.content === 'string' ? entry.content : ''
  const labeled = parseLabeledBlocks(contentText)
  const labelToKey = new Map(template.fields.map((field) => [field.label, field.key]))
  const speechLabels = new Set(Object.values(SPEECH_LABELS))
  for (const [label, value] of labeled) {
    const key = labelToKey.get(label)
    if (key) {
      profile.values[key] = value
      continue
    }
    if (speechLabels.has(label) || !isSafeFreeKey(label)) continue
    profile.values[label] = value
  }
  const stored = entry?.profile && typeof entry.profile === 'object' ? entry.profile : {}
  const storedValues = stored.values && typeof stored.values === 'object' ? stored.values : {}
  for (const field of template.fields) {
    const value = toText(storedValues[field.key])
    if (value && !toText(profile.values[field.key])) profile.values[field.key] = value
  }
  // 存量自由键兜底：正文没有同名标签时保留 stored 里的自由键（只补空，不覆盖）；
  // 模板标签键与声口标签名不作自由键（它们各归模板字段与 speech 块）
  for (const [key, value] of Object.entries(storedValues)) {
    if (labelToKey.has(key) || speechLabels.has(key) || !isSafeFreeKey(key)) continue
    const text = toText(value)
    if (text && !toText(profile.values[key])) profile.values[key] = text
  }
  let speech = normalizeSpeech(stored.speech)
  speech = mergeSpeech(speech, speechFromContent(contentText))
  speech = mergeSpeech(speech, normalizeSpeech({ enabled: false, speechStyle: entry?.speechStyle, samples: entry?.samples }))
  speech.enabled = stored.speech?.enabled === true || speechHasContent(speech)
  profile.speech = speech
  return profile
}

/** 解析「【标签】值」行式块 → [[label, value]]（多行值保留内部换行；忽略空块） */
export function parseLabeledBlocks(content) {
  const text = String(content ?? '').replace(/\r\n/g, '\n')
  const out = []
  const re = /^【([^】\n]{1,40})】/gm
  let match
  while ((match = re.exec(text))) {
    const start = match.index + match[0].length
    const next = re.exec(text)
    re.lastIndex = match.index + match[0].length // reset for outer loop safety
    const end = next ? next.index : text.length
    const value = text.slice(start, end).trim()
    if (value) out.push([match[1].trim(), value])
    if (!next) break
  }
  return out
}

/** 模板必填字段的缺失标签列表（供编辑面徽标与冒烟断言） */
export function missingRequiredLabels(profile) {
  const template = getProfileTemplate(profile?.template)
  const values = profile?.values && typeof profile.values === 'object' ? profile.values : {}
  return template.fields
    .filter((field) => field.required && !toText(values[field.key]))
    .map((field) => field.label)
}

/* ---------- 改名触发词同步（P0.2：旧名替换不追加 + 占位残留一次性清理） ---------- */

/** 创建占位名（AuthoringCharacterPanel startCreate 的两种语言缺省名） */
export const PLACEHOLDER_ENTRY_NAMES = ['新角色', 'New character']

export function isPlaceholderEntryName(name) {
  return PLACEHOLDER_ENTRY_NAMES.includes(String(name ?? '').trim())
}

/**
 * 改名时同步触发词：旧名从 keys 中被「替换」为实名（修复 20261007 §2.2 只增不减 bug），
 * 实名始终居首。占位残留清理是保守的一次性逻辑：仅当 keys 全部是「新角色」类占位名
 * （没有任何实词别名）时才整表替换为实名；混有任何其他键时占位残留不动。
 *
 * @returns string[] 去空、去重后的新 keys
 */
export function renameEntryKeys({ keys = [], previousName = '', nextName = '' } = {}) {
  const prev = String(previousName ?? '').trim()
  const next = String(nextName ?? '').trim()
  const seen = new Set()
  const normalized = []
  for (const key of Array.isArray(keys) ? keys : []) {
    const s = String(key ?? '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    normalized.push(s)
  }
  if (!next) return normalized
  if (!prev || prev === next) {
    // 未改名：一次性清理仅当 keys 全部是占位名（「新角色」类残留）——
    // keys 里混有任何实词别名时一律不动（保守，不误删作者手填词）
    if (normalized.length && normalized.every((key) => isPlaceholderEntryName(key))) {
      return [next]
    }
    if (normalized.some((key) => key === next)) return normalized
    return [next, ...normalized]
  }
  const rest = normalized.filter((key) => key !== prev)
  return [next, ...rest]
}
