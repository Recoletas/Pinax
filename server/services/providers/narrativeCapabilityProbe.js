import {
  createNarrativeCapabilityCache,
  downgradeNarrativeProviderCapability,
  recordNarrativeCapabilityProbe,
  resolveNarrativeProviderCapabilities,
  normalizeProtocol
} from './providerCapabilityResolver.js'

const capabilityCache = createNarrativeCapabilityCache()
const PROBE_TOOL_NAME = 'echo_probe'
const PROBE_SCHEMA = {
  type: 'object',
  properties: {
    probe: { type: 'string', enum: ['ok'] }
  },
  required: ['probe'],
  additionalProperties: false
}

function text(value) {
  return String(value ?? '').trim()
}

function now() {
  return Date.now()
}

function extractText(value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value.choices)) {
    return value.choices
      .map((choice) => extractText(choice?.message?.content || choice?.text || choice?.delta?.content))
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (typeof value.text === 'string') return value.text.trim()
  if (typeof value.output_text === 'string') return value.output_text.trim()
  if (typeof value.content === 'string') return value.content.trim()
  if (Array.isArray(value.content)) return value.content.map(extractText).filter(Boolean).join('\n').trim()
  if (Array.isArray(value.output)) return value.output.map(extractText).filter(Boolean).join('\n').trim()
  return ''
}

function endpoint(baseUrl, protocol) {
  const normalized = text(baseUrl).replace(/\/+$/, '')
  if (protocol === 'openai-responses') {
    return /\/responses$/i.test(normalized) ? normalized : `${normalized}/responses`
  }
  if (protocol === 'anthropic') {
    if (/\/messages$/i.test(normalized)) return normalized
    if (/\/v1$/i.test(normalized)) return `${normalized}/messages`
    if (/\/anthropic$/i.test(normalized)) return `${normalized}/v1/messages`
    if (/api\.anthropic\.com/i.test(normalized)) return `${normalized}/v1/messages`
    return `${normalized}/v1/messages`
  }
  if (/\/chat\/completions$/i.test(normalized)) return normalized
  return `${normalized}/chat/completions`
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
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }
}

function inputText(textValue) {
  return [{ role: 'user', content: [{ type: 'input_text', text: textValue }] }]
}

function toolDefinition(protocol, options = {}) {
  if (protocol === 'anthropic') {
    return {
      name: PROBE_TOOL_NAME,
      description: 'Capability probe. Return the supplied probe value.',
      input_schema: PROBE_SCHEMA
    }
  }
  return {
    type: 'function',
    ...(protocol === 'openai-responses'
      ? {
          name: PROBE_TOOL_NAME,
          description: 'Capability probe. Return the supplied probe value.',
          parameters: PROBE_SCHEMA,
          ...(options.strict ? { strict: true } : {})
        }
      : {
          function: {
            name: PROBE_TOOL_NAME,
            description: 'Capability probe. Return the supplied probe value.',
            parameters: PROBE_SCHEMA,
            ...(options.strict ? { strict: true } : {})
          }
        })
  }
}

function textRequest(provider, protocol) {
  if (protocol === 'anthropic') {
    return {
      model: provider.model,
      max_tokens: 32,
      temperature: 0,
      messages: [{ role: 'user', content: 'Reply exactly PROBE_TEXT.' }]
    }
  }
  if (protocol === 'openai-responses') {
    return {
      model: provider.model,
      input: inputText('Reply exactly PROBE_TEXT.'),
      max_output_tokens: 32,
      temperature: 0,
      store: false
    }
  }
  return {
    model: provider.model,
    messages: [{ role: 'user', content: 'Reply exactly PROBE_TEXT.' }],
    max_tokens: 32,
    temperature: 0
  }
}

function toolRequest(provider, protocol, options = {}) {
  if (protocol === 'anthropic') {
    return {
      model: provider.model,
      max_tokens: 64,
      temperature: 0,
      messages: [{ role: 'user', content: 'Call echo_probe with probe equal to ok. Do not write an answer.' }],
      tools: [toolDefinition(protocol, options)],
      tool_choice: { type: 'tool', name: PROBE_TOOL_NAME }
    }
  }
  if (protocol === 'openai-responses') {
    return {
      model: provider.model,
      input: inputText('Call echo_probe with probe equal to ok. Do not write an answer.'),
      tools: [toolDefinition(protocol, options)],
      tool_choice: { type: 'function', name: PROBE_TOOL_NAME },
      ...(options.parallel ? { parallel_tool_calls: true } : {}),
      max_output_tokens: 64,
      temperature: 0,
      store: false
    }
  }
  return {
    model: provider.model,
    messages: [{ role: 'user', content: 'Call echo_probe with probe equal to ok. Do not write an answer.' }],
    tools: [toolDefinition(protocol, options)],
    tool_choice: { type: 'function', function: { name: PROBE_TOOL_NAME } },
    ...(options.parallel ? { parallel_tool_calls: true } : {}),
    max_tokens: 64,
    temperature: 0
  }
}

function responseToolCall(data, protocol) {
  if (protocol === 'anthropic') {
    const block = (Array.isArray(data?.content) ? data.content : [])
      .find((item) => item?.type === 'tool_use' && item?.name === PROBE_TOOL_NAME)
    return block ? { input: block.input, id: text(block.id), raw: data.content } : null
  }
  if (protocol === 'openai-responses') {
    const item = (Array.isArray(data?.output) ? data.output : [])
      .find((entry) => entry?.type === 'function_call' && entry?.name === PROBE_TOOL_NAME)
    if (!item) return null
    let input = null
    try { input = JSON.parse(item.arguments) } catch { input = null }
    return { input, id: text(item.call_id || item.id), raw: data.output }
  }
  const call = data?.choices?.[0]?.message?.tool_calls?.find(
    (item) => item?.function?.name === PROBE_TOOL_NAME
  )
  if (!call) return null
  let input = null
  try { input = JSON.parse(call.function.arguments) } catch { input = null }
  return {
    input,
    id: text(call.id),
    raw: data?.choices?.[0]?.message
  }
}

function finalRequest(provider, protocol, firstData, call) {
  const result = JSON.stringify({ probe: 'ok' })
  if (protocol === 'anthropic') {
    return {
      model: provider.model,
      max_tokens: 64,
      temperature: 0,
      messages: [
        { role: 'user', content: 'Call echo_probe with probe equal to ok. Do not write an answer.' },
        { role: 'assistant', content: call.raw },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: result }] }
      ],
      tools: [toolDefinition(protocol)],
      tool_choice: { type: 'auto' }
    }
  }
  if (protocol === 'openai-responses') {
    return {
      model: provider.model,
      input: [
        ...inputText('Call echo_probe with probe equal to ok. Do not write an answer.'),
        ...(Array.isArray(firstData?.output) ? firstData.output : []),
        { type: 'function_call_output', call_id: call.id, output: result }
      ],
      tools: [toolDefinition(protocol)],
      tool_choice: 'none',
      max_output_tokens: 64,
      temperature: 0,
      store: false
    }
  }
  const assistant = firstData?.choices?.[0]?.message || call.raw
  return {
    model: provider.model,
    messages: [
      { role: 'user', content: 'Call echo_probe with probe equal to ok. Do not write an answer.' },
      assistant,
      { role: 'tool', tool_call_id: call.id, name: PROBE_TOOL_NAME, content: result }
    ],
    tools: [toolDefinition(protocol)],
    tool_choice: 'none',
    parallel_tool_calls: false,
    max_tokens: 64,
    temperature: 0
  }
}

function probeError(code, message, status = 0, retryable = false) {
  return { ok: false, code, message, status: Number(status) || null, retryable }
}

function unsupportedParameter(data, status) {
  const value = JSON.stringify(data || '').toLowerCase()
  return status === 400 && /(tool|function|parallel|strict|tool_choice)/.test(value)
}

async function requestJson(url, body, provider, protocol, options = {}) {
  const startedAt = now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 9000)
  const externalSignal = options.signal
  const abort = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) abort()
    else externalSignal.addEventListener('abort', abort, { once: true })
  }
  try {
    const response = await (options.fetchImpl || globalThis.fetch)(url, {
      method: 'POST',
      headers: headers(provider, protocol),
      body: JSON.stringify(body),
      signal: controller.signal
    })
    let data = null
    try { data = await response.json() } catch { data = null }
    const latencyMs = now() - startedAt
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403
        ? 'NARRATIVE_PROBE_AUTH_FAILED'
        : (unsupportedParameter(data, response.status) ? 'NARRATIVE_PROBE_UNSUPPORTED_PARAMETER' : 'NARRATIVE_PROBE_UPSTREAM_FAILED')
      return { ok: false, status: response.status, data, latencyMs, error: probeError(code, `探测请求失败（${response.status}）`, response.status, response.status >= 500) }
    }
    return { ok: true, status: response.status, data, latencyMs }
  } catch (error) {
    const latencyMs = now() - startedAt
    if (controller.signal.aborted) {
      return { ok: false, status: 0, data: null, latencyMs, error: probeError('NARRATIVE_PROBE_TIMEOUT', '探测请求超时', 0, true) }
    }
    return { ok: false, status: 0, data: null, latencyMs, error: probeError('NARRATIVE_PROBE_NETWORK_FAILED', '无法连接探测地址', 0, true) }
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener?.('abort', abort)
  }
}

function stepResult(step, response, extra = {}) {
  return {
    step,
    ok: Boolean(response?.ok),
    status: response?.status || null,
    latencyMs: response?.latencyMs || 0,
    ...(response?.error ? { error: response.error } : {}),
    ...extra
  }
}

export async function probeNarrativeProviderCapabilities(provider = {}, options = {}) {
  const protocol = normalizeProtocol(provider)
  const base = {
    protocol,
    text: false,
    toolCalls: false,
    parallelToolCalls: false,
    strictSchema: false,
    streamToolCalls: false,
    reasoningRoundTrip: 'none',
    toolChoiceModes: [],
    source: 'probe',
    checkedAt: now()
  }
  if (protocol === 'unsupported') {
    return { capabilities: base, text: stepResult('text', null, { ok: false, error: probeError('NARRATIVE_PROBE_PROTOCOL_UNSUPPORTED', '该渠道不支持探测') }), tool: null, roundTrip: null }
  }
  const url = endpoint(provider.baseUrl, protocol)
  const textResponse = await requestJson(url, textRequest(provider, protocol), provider, protocol, options)
  const textStep = stepResult('text', textResponse, textResponse.ok ? { responseText: extractText(textResponse.data) } : {})
  const textOk = textResponse.ok && Boolean(textStep.responseText)
  if (!textOk) {
    const capabilities = recordNarrativeCapabilityProbe(options.cache || capabilityCache, provider, {
      ...base,
      text: false,
      toolCalls: false,
      source: 'probe'
    })
    return { capabilities, text: textStep, tool: null, roundTrip: null }
  }

  let advancedProbe = protocol !== 'anthropic'
  let toolResponse = await requestJson(
    url,
    toolRequest(provider, protocol, { strict: advancedProbe, parallel: advancedProbe }),
    provider,
    protocol,
    options
  )
  let retriedWithoutAdvanced = false
  if (toolResponse.error?.code === 'NARRATIVE_PROBE_UNSUPPORTED_PARAMETER') {
    retriedWithoutAdvanced = true
    advancedProbe = false
    toolResponse = await requestJson(
      url,
      toolRequest(provider, protocol, { strict: false, parallel: false }),
      provider,
      protocol,
      options
    )
  }
  const call = toolResponse.ok ? responseToolCall(toolResponse.data, protocol) : null
  const validCall = Boolean(call && call.id && call.input?.probe === 'ok')
  const toolStep = stepResult('tool', toolResponse, {
    callId: call?.id || '',
    callName: call ? PROBE_TOOL_NAME : '',
    validCall,
    retriedWithoutAdvanced
  })
  if (!validCall) {
    const capabilities = recordNarrativeCapabilityProbe(options.cache || capabilityCache, provider, {
      ...base,
      text: true,
      toolCalls: false,
      source: 'probe'
    })
    return { capabilities, text: textStep, tool: toolStep, roundTrip: null }
  }

  const finalResponse = await requestJson(
    url,
    finalRequest(provider, protocol, toolResponse.data, call),
    provider,
    protocol,
    options
  )
  const finalText = extractText(finalResponse.data)
  const roundTrip = stepResult('round_trip', finalResponse, {
    responseText: finalText,
    terminal: finalResponse.ok && /\bPROBE_OK\b/.test(finalText)
  })
  const roundTripOk = Boolean(roundTrip.terminal)
  const capabilities = recordNarrativeCapabilityProbe(options.cache || capabilityCache, provider, {
    ...base,
    text: true,
    toolCalls: true,
    parallelToolCalls: advancedProbe,
    strictSchema: advancedProbe,
    reasoningRoundTrip: protocol === 'anthropic' ? 'content-block' : 'none',
    toolChoiceModes: ['auto', 'none', 'required', 'specific'],
    source: 'probe'
  })
  if (!roundTripOk) capabilities.toolCalls = false
  return { capabilities, text: textStep, tool: toolStep, roundTrip }
}

export async function getNarrativeProviderCapabilities(provider = {}, options = {}) {
  return resolveNarrativeProviderCapabilities(provider, { ...options, cache: options.cache || capabilityCache })
}

export function downgradeNarrativeProviderCapabilityFromProbe(provider, capability, options = {}) {
  return downgradeNarrativeProviderCapability(options.cache || capabilityCache, provider, capability, options)
}

export function invalidateNarrativeProviderProbe(provider, options = {}) {
  const cache = options.cache || capabilityCache
  const current = resolveNarrativeProviderCapabilities(provider, { cache })
  cache.delete(current.cacheKey)
  return true
}

export default {
  getNarrativeProviderCapabilities,
  invalidateNarrativeProviderProbe,
  probeNarrativeProviderCapabilities,
  downgradeNarrativeProviderCapabilityFromProbe
}
