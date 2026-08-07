import { getStructuredPlaceGenerationSchema, normalizeStructuredPlaceGenerationPayload, getStructuredPlaceFleshOutSchema, normalizeStructuredPlaceFleshOutPayload } from './structuredPlaceGenerationContract.js'

export const STRUCTURED_SETTING_SCHEMA_VERSION = 1

export const STRUCTURED_SETTING_SECTIONS = Object.freeze([
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
])

export const STRUCTURED_SETTING_ENTRY_TYPES = Object.freeze({
  lore: 'textarea',
  event: 'textarea',
  location: 'textarea',
  organization: 'textarea',
  quest: 'textarea',
  character: 'textarea',
  style: 'tags',
  rule: 'list',
  forbidden: 'list'
})

export const STRUCTURED_SETTING_LIMITS = Object.freeze({
  maxContextChars: 16000,
  maxFieldsPerRequest: 6,
  maxFieldValueChars: 2200,
  maxUserBriefChars: 1600,
  maxRevisionInstructionChars: 1600,
  maxRevisionFactsChars: 3600,
  maxRevisionHistoryChars: 7200,
  maxRelatedEntries: 10,
  maxSourceExcerpts: 6
})

export const STRUCTURED_GENERATION_SCHEMA_IDS = Object.freeze({
  FIELD: 'setting-field.v1',
  SECTION: 'setting-section.v1',
  REVISION: 'setting-revision.v1',
  PLACES: 'setting-places.v1',
  PLACE_FLESH_OUT: 'setting-place.v1'
})

// 长文本设定可能需要更长的推理和结构化输出时间；客户端与服务端共用这些边界。
export const STRUCTURED_GENERATION_TIMEOUTS = Object.freeze({
  shortMs: 45000,
  longMs: 90000,
  clientGraceMs: 2000,
  maxMs: 90000
})

export const STRUCTURED_GENERATION_MODES = Object.freeze([
  'native-json-schema',
  'forced-tool',
  'json-object'
])

export const STRUCTURED_GENERATION_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'STRUCTURED_GENERATION_REQUEST_INVALID',
  SCHEMA_UNSUPPORTED: 'STRUCTURED_GENERATION_SCHEMA_UNSUPPORTED',
  PROVIDER_UNSUPPORTED: 'STRUCTURED_GENERATION_PROVIDER_UNSUPPORTED',
  UPSTREAM_FAILED: 'STRUCTURED_GENERATION_UPSTREAM_FAILED',
  RESPONSE_INVALID: 'STRUCTURED_GENERATION_RESPONSE_INVALID',
  RESPONSE_EMPTY: 'STRUCTURED_GENERATION_RESPONSE_EMPTY',
  RESPONSE_REFUSED: 'STRUCTURED_GENERATION_RESPONSE_REFUSED',
  RESPONSE_INCOMPLETE: 'STRUCTURED_GENERATION_RESPONSE_INCOMPLETE',
  TIMEOUT: 'STRUCTURED_GENERATION_TIMEOUT',
  ABORTED: 'STRUCTURED_GENERATION_ABORTED'
})

function text(value) {
  return String(value ?? '').trim()
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function invalid(code, message, details = {}) {
  return { valid: false, error: { code, message, ...details } }
}

export function getStructuredSettingSection(sectionKey) {
  return STRUCTURED_SETTING_SECTIONS.find((section) => section.key === text(sectionKey)) || null
}

export function getStructuredSettingField(sectionKey, fieldKey) {
  return getStructuredSettingSection(sectionKey)?.fields.find((field) => field.key === text(fieldKey)) || null
}

export function getStructuredSettingControlType(field) {
  return STRUCTURED_SETTING_ENTRY_TYPES[field?.entryType] || 'textarea'
}

export function getStructuredSettingFieldMeta(sectionKey, fieldKey) {
  const field = getStructuredSettingField(sectionKey, fieldKey)
  if (!field) return null
  return {
    ...field,
    controlType: getStructuredSettingControlType(field),
    maxLength: field.entryType === 'style'
        ? 50
        : field.entryType === 'rule' || field.entryType === 'forbidden'
          ? 800
          : 2000
  }
}

export function normalizeStructuredSettingTargets({ sectionKey, fieldKeys } = {}) {
  const section = getStructuredSettingSection(sectionKey)
  if (!section) return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '设定分区不存在')
  if (!Array.isArray(fieldKeys) || fieldKeys.length < 1 || fieldKeys.length > STRUCTURED_SETTING_LIMITS.maxFieldsPerRequest) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '设定项数量不合法')
  }
  const seen = new Set()
  const fields = []
  for (const rawKey of fieldKeys) {
    const key = text(rawKey)
    const field = getStructuredSettingField(sectionKey, key)
    if (!field) return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, `未知设定项：${key}`)
    if (seen.has(key)) return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, `设定项重复：${key}`)
    seen.add(key)
    fields.push(key)
  }
  return { valid: true, section, fieldKeys: fields }
}

export function getStructuredSettingSchema(schemaId, targets = {}) {
  const normalized = normalizeStructuredSettingTargets(targets)
  if (!normalized.valid) return normalized
  if (text(schemaId) === STRUCTURED_GENERATION_SCHEMA_IDS.PLACES || text(schemaId) === STRUCTURED_GENERATION_SCHEMA_IDS.PLACE_FLESH_OUT) {
    if (normalized.section.key !== 'world' || normalized.fieldKeys.length !== 1 || normalized.fieldKeys[0] !== 'geography') {
      return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '地点 schema 只能作用于世界观中的地理环境')
    }
    return {
      valid: true,
      schema: text(schemaId) === STRUCTURED_GENERATION_SCHEMA_IDS.PLACE_FLESH_OUT
        ? getStructuredPlaceFleshOutSchema()
        : getStructuredPlaceGenerationSchema()
    }
  }
  const fieldKeys = normalized.fieldKeys
  if (!Object.values(STRUCTURED_GENERATION_SCHEMA_IDS).includes(text(schemaId))) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.SCHEMA_UNSUPPORTED, `不支持的结构化生成 schema：${text(schemaId)}`)
  }
  const properties = Object.fromEntries(fieldKeys.map((fieldKey) => [fieldKey, {
    type: 'string',
    description: `${getStructuredSettingFieldMeta(targets.sectionKey, fieldKey).label}的可直接审阅内容，不写标题、解释或思考过程。`
  }]))
  const isSingleField = [
    STRUCTURED_GENERATION_SCHEMA_IDS.FIELD,
    STRUCTURED_GENERATION_SCHEMA_IDS.REVISION
  ].includes(schemaId)
  return {
    valid: true,
    schema: {
      type: 'object',
      properties: isSingleField ? { [fieldKeys[0]]: properties[fieldKeys[0]] } : properties,
      required: isSingleField ? [fieldKeys[0]] : fieldKeys,
      additionalProperties: false
    }
  }
}

export function validateStructuredGenerationRequest(raw = {}) {
  if (!isPlainObject(raw)) return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '结构化生成请求必须是对象')
  const target = isPlainObject(raw.target) ? raw.target : {}
  const targets = normalizeStructuredSettingTargets(target)
  if (!targets.valid) return targets
  const schemaId = text(raw.schemaId)
  if (!Object.values(STRUCTURED_GENERATION_SCHEMA_IDS).includes(schemaId)) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.SCHEMA_UNSUPPORTED, '结构化生成 schema 不受支持')
  }
  if ([STRUCTURED_GENERATION_SCHEMA_IDS.FIELD, STRUCTURED_GENERATION_SCHEMA_IDS.REVISION].includes(schemaId) && targets.fieldKeys.length !== 1) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '单字段 schema 只能包含一个设定项')
  }
  if (schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.SECTION && targets.fieldKeys.length < 2) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '分区 schema 至少包含两个设定项')
  }
  if ((schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACES || schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACE_FLESH_OUT) && (
    targets.section.key !== 'world' || targets.fieldKeys.length !== 1 || targets.fieldKeys[0] !== 'geography'
  )) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, '地点请求必须指向 world.geography')
  }
  const context = isPlainObject(raw.context) ? raw.context : {}
  const contextText = [
    context.globalConstraints,
    context.confirmedSettings,
    context.currentValues,
    context.relatedEntries,
    context.sourceExcerpts,
    context.userBrief,
    context.authoritativeContent,
    context.draftContent,
    context.revisionInstruction,
    context.keepFacts,
    context.rejectFacts,
    context.previousVersions
  ].map((value) => typeof value === 'string' ? value : JSON.stringify(value || '')).join('\n')
  if (contextText.length > STRUCTURED_SETTING_LIMITS.maxContextChars) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, `结构化生成上下文超过 ${STRUCTURED_SETTING_LIMITS.maxContextChars} 字符`)
  }
  if (text(context.revisionInstruction).length > STRUCTURED_SETTING_LIMITS.maxRevisionInstructionChars) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, `修订意见不能超过 ${STRUCTURED_SETTING_LIMITS.maxRevisionInstructionChars} 字符`)
  }
  for (const key of ['authoritativeContent', 'draftContent', 'keepFacts', 'rejectFacts']) {
    if (text(context[key]).length > STRUCTURED_SETTING_LIMITS.maxRevisionFactsChars) {
      return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, `${key} 超过修订上下文长度上限`)
    }
  }
  if (text(context.previousVersions).length > STRUCTURED_SETTING_LIMITS.maxRevisionHistoryChars) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, `previousVersions 超过修订历史长度上限`)
  }
  return {
    valid: true,
    request: {
      schemaVersion: STRUCTURED_SETTING_SCHEMA_VERSION,
      schemaId,
      requestId: text(raw.requestId),
      provider: isPlainObject(raw.provider) ? raw.provider : {},
      target: {
        worldbookId: text(target.worldbookId),
        worldbookRevision: text(target.worldbookRevision),
        sectionKey: targets.section.key,
        fieldKeys: targets.fieldKeys
      },
      context,
      options: {
        maxTokens: Number.isFinite(Number(raw.options?.maxTokens))
          ? Math.max(120, Math.min(6000, Math.floor(Number(raw.options.maxTokens))))
          : 1200,
        temperature: Number.isFinite(Number(raw.options?.temperature))
          ? Math.max(0, Math.min(1, Number(raw.options.temperature)))
          : 0.2,
        timeoutMs: Number.isFinite(Number(raw.options?.timeoutMs))
          ? Math.max(1000, Math.min(STRUCTURED_GENERATION_TIMEOUTS.maxMs, Math.floor(Number(raw.options.timeoutMs))))
          : STRUCTURED_GENERATION_TIMEOUTS.shortMs
      }
    }
  }
}

export function validateStructuredDraftPayload(payload, targets, schemaId = '') {
  const result = normalizeStructuredDraftPayload(payload, targets, schemaId)
  if (!result.valid) return result
  if (schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACES || schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACE_FLESH_OUT) return result
  if (Object.keys(result.fieldErrors).length) {
    return invalid(STRUCTURED_GENERATION_ERROR_CODES.RESPONSE_INVALID, '部分设定项内容无效', {
      drafts: result.drafts,
      fieldErrors: result.fieldErrors
    })
  }
  return { valid: true, drafts: result.drafts }
}

export function normalizeStructuredDraftPayload(payload, targets, schemaId = '') {
  if (!isPlainObject(payload)) return invalid(STRUCTURED_GENERATION_ERROR_CODES.RESPONSE_INVALID, '结构化生成结果不是对象')
  if (schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACES) {
    const places = normalizeStructuredPlaceGenerationPayload(payload)
    if (!places.valid) return places
    return {
      valid: true,
      drafts: { places: places.places },
      fieldErrors: places.fieldErrors || {}
    }
  }
  if (schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACE_FLESH_OUT) {
    const places = normalizeStructuredPlaceFleshOutPayload(payload)
    if (!places.valid) return places
    return {
      valid: true,
      drafts: { places: places.places },
      fieldErrors: places.fieldErrors || {}
    }
  }
  const normalized = normalizeStructuredSettingTargets(targets)
  if (!normalized.valid) return normalized
  const drafts = isPlainObject(payload.drafts) ? payload.drafts : payload
  const allowed = new Set(normalized.fieldKeys)
  const output = {}
  const fieldErrors = {}
  for (const fieldKey of normalized.fieldKeys) {
    if (typeof drafts[fieldKey] !== 'string') {
      fieldErrors[fieldKey] = '缺少可用内容'
      continue
    }
    const value = drafts[fieldKey].trim()
    if (!value) {
      fieldErrors[fieldKey] = '内容为空'
      continue
    }
    if (value.length > STRUCTURED_SETTING_LIMITS.maxFieldValueChars) {
      fieldErrors[fieldKey] = `内容超过 ${STRUCTURED_SETTING_LIMITS.maxFieldValueChars} 字符`
      continue
    }
    output[fieldKey] = value
  }
  const extraKeys = Object.keys(drafts).filter((key) => !allowed.has(key))
  if (extraKeys.length) return invalid(STRUCTURED_GENERATION_ERROR_CODES.RESPONSE_INVALID, `结构化生成结果包含未知设定项：${extraKeys.join(', ')}`)
  if (!Object.keys(output).length) return invalid(STRUCTURED_GENERATION_ERROR_CODES.RESPONSE_INVALID, '结构化生成结果没有可用设定项', { fieldErrors })
  return { valid: true, drafts: output, fieldErrors }
}
