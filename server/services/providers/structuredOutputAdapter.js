import { resolveGenerationToolProtocol } from '../../../shared/generationToolContract.js'
import {
  STRUCTURED_GENERATION_ERROR_CODES,
  STRUCTURED_GENERATION_SCHEMA_IDS,
  STRUCTURED_GENERATION_TIMEOUTS,
  getStructuredSettingFieldMeta,
  getStructuredSettingSchema
} from '../../../shared/structuredSettingContract.js'

function text(value) {
  return String(value ?? '').trim()
}

function protocolError(code, message, options = {}) {
  const error = new Error(message)
  error.code = code
  error.status = Number(options.status || 0) || null
  error.retryable = Boolean(options.retryable)
  error.unsupported = Boolean(options.unsupported)
  throw error
}

function endpoint(baseUrl, protocol) {
  const normalized = text(baseUrl).replace(/\/+$/, '')
  if (protocol === 'openai-responses') return /\/responses$/i.test(normalized) ? normalized : `${normalized}/responses`
  if (protocol === 'anthropic') {
    if (/\/messages$/i.test(normalized)) return normalized
    if (/\/v1$/i.test(normalized)) return `${normalized}/messages`
    if (/\/anthropic$/i.test(normalized)) return `${normalized}/v1/messages`
    if (/api\.anthropic\.com/i.test(normalized)) return `${normalized}/v1/messages`
    return `${normalized}/v1/messages`
  }
  return /\/chat\/completions$/i.test(normalized) ? normalized : `${normalized}/chat/completions`
}

function headers(provider, protocol) {
  const apiKey = text(provider.apiKey)
  if (protocol === 'anthropic') {
    const output = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    }
    if (/minimax/i.test(provider.id) || /minimaxi?\.com/i.test(provider.baseUrl)) {
      output.Authorization = `Bearer ${apiKey}`
    } else {
      output['x-api-key'] = apiKey
    }
    return output
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
}

function schemaName(schemaId) {
  return schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.SECTION
    ? 'setting_section_v1'
    : schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.REVISION
      ? 'setting_revision_v1'
      : schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.CANDIDATES
        ? 'setting_candidates_v1'
      : schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACES
        ? 'setting_places_v1'
        : schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACE_FLESH_OUT
          ? 'setting_place_v1'
          : 'setting_field_v1'
}

function textParts(context = {}, targets = {}, schemaId = '') {
  const section = text(targets.sectionKey)
  const fields = Array.isArray(targets.fieldKeys) ? targets.fieldKeys.join(', ') : ''
  const serialize = (value) => typeof value === 'string' ? value : JSON.stringify(value || '')
  if (schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.CANDIDATES) {
    return [
      '目标协议：setting-candidates.v1。请从原始资料片段中提取后续设定生成需要的有限事实候选。',
      '只返回 candidates 数组；每项必须有 type、name、content、evidence、sourceIds，可选 aliases（只有资料明确给出别称时填写）。type 只能是 lore、character、location、organization、event、item、rule、quest。',
      'content 是可核验的短事实，不写空泛总结；evidence 必须是资料中的连续原文摘录；sourceIds 必须填写原文片段标出的来源 ID。资料没有依据的内容不要补写，不要把修辞或推测当作事实。最多返回 24 项。',
      context.sourceExcerpts ? `【原始资料片段】\n${serialize(context.sourceExcerpts)}` : '',
      context.confirmedSettings ? `【已确认设定】\n${serialize(context.confirmedSettings)}` : '',
      context.userBrief ? `【本次分区要求】\n${serialize(context.userBrief)}` : '',
      '不要输出解释、标题、Markdown 或思考过程。'
    ].filter(Boolean).join('\n\n')
  }
  if (schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACES) {
    return [
      '目标协议：setting-places.v1。请从地理环境原文中整理可被作者审阅的地点草稿。',
      '只返回 places 数组；每项必须有 name、kind、scale、aliases、parentRef、factionRef、terrainHints、description、evidence、relations。',
      '关系只写关系类型和目标名称；不得返回坐标、cell、地图对象 ID、mapBinding 或最终地图绑定。',
      'evidence 必须是原文中的连续摘录；无法从原文找到证据的名称不要凭空补全。',
      '过滤泛称、修辞、设施、描述片段和“某个小村”等不稳定称呼。',
      context.globalConstraints ? `【全局硬约束】\n${serialize(context.globalConstraints)}` : '',
      context.confirmedSettings ? `【已有正式地点紧凑索引】\n${serialize(context.confirmedSettings)}` : '',
      context.sourceExcerpts ? `【地理环境原文片段】\n${serialize(context.sourceExcerpts)}` : '',
      context.userBrief ? `【用户补充要求】\n${serialize(context.userBrief)}` : '',
      '不要输出思考、解释、标题、Markdown 或普通文本。'
    ].filter(Boolean).join('\n\n')
  }
  if (schemaId === STRUCTURED_GENERATION_SCHEMA_IDS.PLACE_FLESH_OUT) {
    if (context.mode === 'create') {
      return [
        '目标协议：setting-place.v1（生成模式）。用户正在新建一个地点——若【地点种子】提供了 name 行，沿用该名字；若【地点种子】缺失或没有 name 行，请基于世界调性自行命名一个简洁、不与【已有地点】重名或近似的地点名。然后基于世界设定、地理环境与已有地点，涌现一个全新的、与所有已有地点可清晰区分的地点。只返回 JSON { "places": [ { ...一条地点... } ] }。',
        'description 写该地点的功能、地貌、氛围与关键特征，150-400 字；必须至少包含一个与同 kind 已有地点不同的特征（功能/地形/规模/调性）。',
        'kind 取其一：continent/region/city/town/village/port/fortress/academy/site/river/route；scale 取其一：macro/regional/local/unknown——按名字与世界调性选最贴合的。',
        'aliases ≤ 2（只给真正常用的别名，不凑数）；terrainHints ≤ 4；keywords ≤ 6，且任一关键词不得与【已有地点】中任何地点的名称、别名或关键词重复。',
        'distinctness：不得复用【已有地点】或【地理环境】中的专有名词、整句或描述片段；可以借鉴地貌类型与世界调性，但不能照搬。',
        'relations：最多 3 条，type 只用 adjacent/river/route，targetName 必须是【已有地点】中已存在的地点名（不要发明新名字，不要指向不存在的地点）。',
        '不要返回 parentRef、factionRef、evidence（schema 不接受；隶属与归属由用户在表单手填）。',
        context.globalConstraints ? `【世界设定与硬约束】\n${serialize(context.globalConstraints)}` : '',
        context.confirmedSettings ? `【已有地点（用于了解世界调性与可用地貌；本条必须与它们全部可区分：不得复用名称/别名/关键词/描述；relations 只能指向这里出现过的名字）】\n${serialize(context.confirmedSettings)}` : '',
        context.sourceExcerpts ? `【地理环境（世界背景，可借鉴调性与地貌类型；不要照搬原句）】\n${serialize(context.sourceExcerpts)}` : '',
        context.seed ? `【地点种子】\n${serialize(context.seed)}` : '',
        context.userBrief ? `【用户补充要求】\n${serialize(context.userBrief)}` : '',
        '只输出该 JSON，不要解释、标题或普通文本。'
      ].filter(Boolean).join('\n\n')
    }
    return [
      '目标协议：setting-place.v1。只返回 JSON，形状必须是 { "places": [ { ...一条地点... } ] }。description 150-400 字，超出视为协议违反；aliases 总项数 ≤ 8；terrainHints ≤ 4；keywords ≤ 8。',
      '禁止违反【世界设定与硬约束 / 禁止内容】中的任何一条。',
      'kind 取其一：continent/region/city/town/village/port/fortress/academy/site/river/route。scale 取其一：macro/regional/local/unknown。relations.type 只用 adjacent/river/route（用户种子里的关系为准；不要从【地理环境】或【邻近地点】新增关系）。',
      'description 扩写合约：原 <150 字扩到约 250；150-400 字保持节奏；400-1500 字平滑扩到约 600；保留用户原话与要点，只在句间扩展或润色，不删不改。',
      '空种子引导：用户只填了 name 与 description 时，kind/scale 从枚举选最贴合的；其余字段按 description 推断并标注为推断。',
      '若【地点种子】中出现 description_meta 行，说明用户原文被截断；保留 description 引号内完整原文，不要尝试恢复 description_meta 之外的任何内容。',
      context.globalConstraints ? `【世界设定与硬约束】\n${serialize(context.globalConstraints)}` : '',
      context.confirmedSettings ? `【邻近地点（参考；不要把它们的名字、别名或描述搬到本条；如要建立关系，必须以用户给的关系种子为准）】\n${serialize(context.confirmedSettings)}` : '',
      context.sourceExcerpts ? `【地理环境（背景参考；不要照搬原句，不要从这一段新增 relation，不要替代种子里的描述）】\n${serialize(context.sourceExcerpts)}` : '',
      context.seed ? `【地点种子 — 用户已写内容，每行一条】\n${serialize(context.seed)}` : '',
      context.userBrief ? `【用户补充要求】\n${serialize(context.userBrief)}` : '',
      '只输出该 JSON，不要解释、标题或普通文本。'
    ].filter(Boolean).join('\n\n')
  }
  const fieldInstructions = (Array.isArray(targets.fieldKeys) ? targets.fieldKeys : []).map((fieldKey) => {
    const meta = getStructuredSettingFieldMeta(targets.sectionKey, fieldKey)
    if (!meta) return ''
    if (fieldKey === 'history') return '历史线只保留 4-6 个关键阶段，按时间顺序紧凑叙述；不要为了显得详细而扩写没有依据的年代、人物或事件。'
    if (fieldKey === 'geography') return '地理环境优先写地貌、气候、水系、聚落、资源与交通之间的关系；保持紧凑，不重复全局约束。'
    if (meta.entryType === 'character') {
      const protagonist = fieldKey === 'protagonists'
      return `${protagonist ? '只生成一张主角角色卡' : '默认只生成一张配角角色卡；只有用户明确要求多个时才最多生成两张'}；每张卡按“姓名、身份、性别、年龄、外貌、性格、背景、目标、关系、说话方式、开场状态”逐行填写，每张控制在 900 字以内，优先补齐全部标签；${protagonist ? '不要生成第二个角色' : '多张卡之间用单独一行 --- 分隔'}；不要只返回名字，不输出 JSON、标题、解释或思考过程。`
    }
    return `${meta.label}只保留后续创作真正需要的核心事实，避免重复上下文。`
  }).filter(Boolean)
  return [
    `目标分区：${section}`,
    `目标设定项：${fields}`,
    '请只根据以下世界书上下文生成目标设定项，不输出分析、思考、标题、Markdown 或额外字段。',
    fieldInstructions.length ? `【字段写作边界】\n${fieldInstructions.join('\n')}` : '',
    '每个字段优先保证 JSON 完整闭合和关键事实完整，再补充次要细节；不要让单个字段占满输出预算。',
    context.authoritativeContent ? `【正式设定项，优先保留其中未被明确否定的事实】\n${serialize(context.authoritativeContent)}` : '',
    context.draftContent ? `【当前待审草稿，只在此基础上修订】\n${serialize(context.draftContent)}` : '',
    context.revisionInstruction ? `【用户修订意见，必须逐项落实】\n${serialize(context.revisionInstruction)}` : '',
    context.keepFacts ? `【用户明确要求保留】\n${serialize(context.keepFacts)}` : '',
    context.rejectFacts ? `【用户明确反对或要求删除】\n${serialize(context.rejectFacts)}` : '',
    context.previousVersions ? `【此前草稿版本，仅作事实参考】\n${serialize(context.previousVersions)}\n当前草稿和本次修订意见优先；不要恢复已明确否定的内容。` : '',
    context.globalConstraints ? `【全局硬约束】\n${serialize(context.globalConstraints)}` : '',
    context.confirmedSettings ? `【已确认结构化设定】\n${serialize(context.confirmedSettings)}` : '',
    context.currentValues ? `【当前设定项基线】\n${serialize(context.currentValues)}` : '',
    context.relatedEntries ? `【相关既有条目】\n${serialize(context.relatedEntries)}` : '',
    context.sourceExcerpts ? `【原始资料摘录】\n${serialize(context.sourceExcerpts)}` : '',
    context.sourceCandidates ? `【已提取事实候选，仅作本轮分区综合底稿】\n${serialize(context.sourceCandidates)}` : '',
    context.userBrief ? `【本次补充要求】\n${serialize(context.userBrief)}` : '',
    context.draftContent
      ? '请返回修订后的完整字段正文，不要返回 diff、patch、修改说明或只返回变更片段；明确保留内容不得被删除，明确反对内容不得继续出现。'
      : '输出内容必须是可直接进入设定草稿的正文；保留已有明确事实，不虚构与硬约束冲突的例外。'
  ].filter(Boolean).join('\n\n')
}

function openAiMessages(context, targets, schemaId) {
  return [
    {
      role: 'system',
      content: '你是结构化世界书编辑。只返回协议要求的 JSON，不输出思考过程、任务复述或解释。'
    },
    { role: 'user', content: textParts(context, targets, schemaId) }
  ]
}

function buildChatRequest(request, schema) {
  const body = {
    model: request.provider.model,
    messages: openAiMessages(request.context, request.target, request.schemaId),
    max_tokens: request.options?.maxTokens || 1200,
    temperature: request.options?.temperature ?? 0.2,
    response_format: {
      type: 'json_schema',
      json_schema: { name: schemaName(request.schemaId), strict: true, schema }
    }
  }
  if (request.provider.promptCacheKey) body.prompt_cache_key = request.provider.promptCacheKey
  return body
}

function buildResponsesRequest(request, schema) {
  const body = {
    model: request.provider.model,
    instructions: '你是结构化世界书编辑。只返回协议要求的 JSON，不输出思考过程、任务复述或解释。',
    input: [{ role: 'user', content: [{ type: 'input_text', text: textParts(request.context, request.target, request.schemaId) }] }],
    text: {
      format: {
        type: 'json_schema',
        name: schemaName(request.schemaId),
        strict: true,
        schema
      }
    },
    reasoning: { effort: 'none' },
    max_output_tokens: request.options?.maxTokens || 1200,
    temperature: request.options?.temperature ?? 0.2,
    store: false
  }
  if (request.provider.promptCacheKey) body.prompt_cache_key = request.provider.promptCacheKey
  return body
}

function buildAnthropicRequest(request, schema) {
  return {
    model: request.provider.model,
    max_tokens: request.options?.maxTokens || 1200,
    temperature: request.options?.temperature ?? 0.2,
    system: '你是结构化世界书编辑。只返回协议要求的 JSON，不输出思考过程、任务复述或解释。',
    messages: [{ role: 'user', content: textParts(request.context, request.target, request.schemaId) }],
    output_config: {
      format: { type: 'json_schema', schema }
    }
  }
}

function buildToolRequest(request, schema, protocol) {
  const tool = protocol === 'anthropic'
    ? {
        name: 'submit_setting_draft',
        description: '提交已经完成的结构化设定草稿。只能提交目标字段内容。',
        input_schema: schema
      }
    : protocol === 'openai-responses'
      ? { type: 'function', name: 'submit_setting_draft', description: '提交结构化设定草稿。', parameters: schema, strict: true }
      : { type: 'function', function: { name: 'submit_setting_draft', description: '提交结构化设定草稿。', parameters: schema, strict: true } }
  const prompt = `${textParts(request.context, request.target, request.schemaId)}\n\n必须调用 submit_setting_draft，不能输出自然语言答案。`
  if (protocol === 'anthropic') {
    return {
      model: request.provider.model,
      max_tokens: request.options?.maxTokens || 1200,
      temperature: request.options?.temperature ?? 0.2,
      messages: [{ role: 'user', content: prompt }],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'submit_setting_draft' }
    }
  }
  if (protocol === 'openai-responses') {
    return {
      model: request.provider.model,
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      tools: [tool],
      tool_choice: { type: 'function', name: 'submit_setting_draft' },
      max_output_tokens: request.options?.maxTokens || 1200,
      temperature: request.options?.temperature ?? 0.2,
      reasoning: { effort: 'none' },
      store: false
    }
  }
  return {
    model: request.provider.model,
    messages: openAiMessages(request.context, request.target, request.schemaId).concat({ role: 'user', content: '必须调用 submit_setting_draft，不能输出自然语言答案。' }),
    tools: [tool],
    tool_choice: { type: 'function', function: { name: 'submit_setting_draft' } },
    max_tokens: request.options?.maxTokens || 1200,
    temperature: request.options?.temperature ?? 0.2
  }
}

function parseJson(value) {
  if (typeof value === 'object' && value) return value
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) } catch { return null }
}

function parseProviderPayload(data, protocol, mode) {
  if (mode === 'forced-tool') {
    if (protocol === 'anthropic') {
      const block = (Array.isArray(data?.content) ? data.content : []).find((item) => item?.type === 'tool_use' && item?.name === 'submit_setting_draft')
      if (block) return { payload: block.input, finishReason: text(data?.stop_reason) || 'tool_use', hasContent: true }
    } else if (protocol === 'openai-responses') {
      const item = (Array.isArray(data?.output) ? data.output : []).find((entry) => entry?.type === 'function_call' && entry?.name === 'submit_setting_draft')
      if (item) return { payload: parseJson(item.arguments), finishReason: 'tool_calls', hasContent: Boolean(String(item.arguments || '').trim()) }
    } else {
      const call = data?.choices?.[0]?.message?.tool_calls?.find((item) => item?.function?.name === 'submit_setting_draft')
      if (call) return { payload: parseJson(call.function.arguments), finishReason: text(data?.choices?.[0]?.finish_reason) || 'tool_calls', hasContent: Boolean(String(call.function.arguments || '').trim()) }
    }
    return { payload: null, finishReason: 'tool_call_missing', hasContent: false }
  }
  if (protocol === 'openai-responses') {
    return { payload: parseJson(data?.output_text), finishReason: text(data?.status) === 'incomplete' ? 'length' : 'stop', hasContent: Boolean(String(data?.output_text || '').trim()) }
  }
  if (protocol === 'anthropic') {
    const content = (Array.isArray(data?.content) ? data.content : []).filter((block) => block?.type === 'text').map((block) => block.text).join('\n')
    return { payload: parseJson(content), finishReason: text(data?.stop_reason) || 'end_turn', hasContent: Boolean(content.trim()) }
  }
  const choice = data?.choices?.[0]
  const content = choice?.message?.content
  return { payload: parseJson(content), finishReason: text(choice?.finish_reason) || 'stop', hasContent: Boolean(String(content || '').trim()) }
}

function isIncompleteFinishReason(reason) {
  return ['length', 'max_tokens', 'incomplete'].includes(text(reason).toLowerCase())
}

function hasRefusal(data, protocol) {
  if (protocol === 'anthropic') {
    return (Array.isArray(data?.content) ? data.content : []).some((block) => block?.type === 'refusal')
  }
  if (protocol === 'openai-responses') {
    return (Array.isArray(data?.output) ? data.output : []).some((item) => item?.type === 'refusal')
  }
  return Boolean(data?.choices?.[0]?.message?.refusal)
}

function usageMeta(data) {
  const usage = data?.usage || {}
  return {
    inputTokens: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0,
    outputTokens: Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0,
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? 0) || 0,
    cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0) || 0
  }
}

export class StructuredProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'StructuredProviderError'
    this.code = code
    this.status = Number(options.status || 0) || null
    this.retryable = Boolean(options.retryable)
    this.unsupported = Boolean(options.unsupported)
  }
}

export function resolveStructuredProtocol(provider = {}) {
  const protocol = resolveGenerationToolProtocol(provider)
  return protocol === 'openai' ? 'openai-chat' : protocol
}

export function buildStructuredProviderRequest(request, mode = 'native-json-schema') {
  const protocol = resolveStructuredProtocol(request.provider)
  const schemaResult = getStructuredSettingSchema(request.schemaId, request.target)
  if (!schemaResult.valid) throw new StructuredProviderError(schemaResult.error.code, schemaResult.error.message)
  if (mode === 'forced-tool') return { protocol, url: endpoint(request.provider.baseUrl, protocol), body: buildToolRequest(request, schemaResult.schema, protocol) }
  if (mode === 'native-json-schema') {
    const body = protocol === 'openai-responses'
      ? buildResponsesRequest(request, schemaResult.schema)
      : protocol === 'anthropic'
        ? buildAnthropicRequest(request, schemaResult.schema)
        : buildChatRequest(request, schemaResult.schema)
    return { protocol, url: endpoint(request.provider.baseUrl, protocol), body }
  }
  if (mode === 'json-object') {
    if (protocol === 'anthropic') throw new StructuredProviderError(STRUCTURED_GENERATION_ERROR_CODES.SCHEMA_UNSUPPORTED, 'Anthropic-compatible 渠道不支持 JSON object 降级', { unsupported: true })
    if (protocol === 'openai-responses') {
      return {
        protocol,
        url: endpoint(request.provider.baseUrl, protocol),
        body: { ...buildResponsesRequest(request, schemaResult.schema), text: { format: { type: 'json_object' } } }
      }
    }
    return {
      protocol,
      url: endpoint(request.provider.baseUrl, protocol),
      body: { ...buildChatRequest(request, schemaResult.schema), response_format: { type: 'json_object' } }
    }
  }
  throw new StructuredProviderError(STRUCTURED_GENERATION_ERROR_CODES.SCHEMA_UNSUPPORTED, `不支持结构化生成模式：${mode}`, { unsupported: true })
}

export async function runStructuredProviderRequest(request, mode = 'native-json-schema', options = {}) {
  const built = buildStructuredProviderRequest(request, mode)
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(new Error('timeout')),
    Number(options.timeoutMs || STRUCTURED_GENERATION_TIMEOUTS.shortMs)
  )
  const onAbort = () => controller.abort(options.signal?.reason)
  if (options.signal) {
    if (options.signal.aborted) onAbort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const response = await (options.fetchImpl || globalThis.fetch)(built.url, {
      method: 'POST',
      headers: headers(request.provider, built.protocol),
      body: JSON.stringify(built.body),
      signal: controller.signal
    })
    let data = null
    try { data = await response.json() } catch { data = null }
    const latencyMs = Date.now() - startedAt
    if (!response.ok) {
      const unsupported = response.status === 400 && /(schema|response_format|output_config|tool|function|format|reasoning)/i.test(JSON.stringify(data || ''))
      throw new StructuredProviderError(
        unsupported ? STRUCTURED_GENERATION_ERROR_CODES.SCHEMA_UNSUPPORTED : STRUCTURED_GENERATION_ERROR_CODES.UPSTREAM_FAILED,
        unsupported ? '上游不支持当前结构化输出模式' : `结构化生成请求失败（${response.status}）`,
        { status: response.status, retryable: response.status === 408 || response.status === 429 || response.status >= 500, unsupported }
      )
    }
    if (hasRefusal(data, built.protocol)) {
      throw new StructuredProviderError(STRUCTURED_GENERATION_ERROR_CODES.RESPONSE_REFUSED, '上游拒绝生成该设定内容')
    }
    const parsed = parseProviderPayload(data, built.protocol, mode)
    if (!parsed.payload) {
      throw new StructuredProviderError(
        isIncompleteFinishReason(parsed.finishReason) || parsed.hasContent
          ? STRUCTURED_GENERATION_ERROR_CODES.RESPONSE_INCOMPLETE
          : STRUCTURED_GENERATION_ERROR_CODES.RESPONSE_INVALID,
        isIncompleteFinishReason(parsed.finishReason) || parsed.hasContent
          ? '上游在结构化设定生成中途截断'
          : '上游未返回可解析的结构化设定 payload'
      )
    }
    return {
      payload: parsed.payload,
      mode,
      protocol: built.protocol,
      finishReason: parsed.finishReason,
      latencyMs,
      ...usageMeta(data)
    }
  } catch (error) {
    if (error instanceof StructuredProviderError) throw error
    if (controller.signal.aborted) {
      throw new StructuredProviderError(
        options.signal?.aborted ? STRUCTURED_GENERATION_ERROR_CODES.ABORTED : STRUCTURED_GENERATION_ERROR_CODES.TIMEOUT,
        options.signal?.aborted ? '结构化设定生成已取消' : '结构化设定生成超时',
        { retryable: !options.signal?.aborted }
      )
    }
    throw new StructuredProviderError(STRUCTURED_GENERATION_ERROR_CODES.UPSTREAM_FAILED, '无法连接结构化生成渠道', { retryable: true })
  } finally {
    clearTimeout(timeoutId)
    options.signal?.removeEventListener?.('abort', onAbort)
  }
}
