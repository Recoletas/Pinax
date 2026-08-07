import {
  STRUCTURED_GENERATION_ERROR_CODES,
  STRUCTURED_GENERATION_MODES,
  STRUCTURED_GENERATION_TIMEOUTS,
  normalizeStructuredDraftPayload
} from '../../shared/structuredSettingContract.js'
import { validateStructuredGenerationRequestEnvelope } from '../../shared/structuredGenerationContract.js'
import { resolveTextApiKey } from '../../shared/textModelKeys.js'
import {
  createStructuredCapabilityCache,
  downgradeStructuredProviderCapability,
  recordStructuredProviderCapabilities,
  resolveStructuredProviderCapabilities
} from './providers/structuredCapabilityResolver.js'
import {
  StructuredProviderError,
  resolveStructuredProtocol,
  runStructuredProviderRequest
} from './providers/structuredOutputAdapter.js'

const capabilityCache = createStructuredCapabilityCache()

function text(value) {
  return String(value ?? '').trim()
}

function chooseInitialMode(provider, capabilities) {
  const protocol = resolveStructuredProtocol(provider)
  if (capabilities.nativeJsonSchema !== false) return 'native-json-schema'
  if (protocol === 'anthropic' || protocol === 'openai-responses') {
    if (capabilities.specificToolChoice !== false && capabilities.toolCalls !== false) return 'forced-tool'
  } else if (capabilities.jsonObject !== false) {
    return 'json-object'
  }
  return null
}

function chooseFallbackMode(provider, failedMode) {
  const protocol = resolveStructuredProtocol(provider)
  if (failedMode === 'native-json-schema') {
    return protocol === 'anthropic' || protocol === 'openai-responses' ? 'forced-tool' : 'json-object'
  }
  return null
}

function errorPayload(error, requestId) {
  return {
    error: error?.message || '结构化设定生成失败',
    code: error?.code || STRUCTURED_GENERATION_ERROR_CODES.UPSTREAM_FAILED,
    retryable: Boolean(error?.retryable),
    requestId: text(requestId)
  }
}

export function getStructuredCapabilityState(provider, options = {}) {
  return resolveStructuredProviderCapabilities(provider, {
    cache: options.cache || capabilityCache,
    now: options.now
  })
}

export async function runStructuredGeneration(rawRequest, options = {}) {
  const validation = validateStructuredGenerationRequestEnvelope(rawRequest)
  if (!validation.valid) {
    throw new StructuredProviderError(validation.error.code, validation.error.message)
  }
  let request = validation.request
  const cache = options.cache || capabilityCache
  const capabilities = resolveStructuredProviderCapabilities(request.provider, { cache })
  const firstMode = chooseInitialMode(request.provider, capabilities)
  if (!firstMode) {
    throw new StructuredProviderError(
      STRUCTURED_GENERATION_ERROR_CODES.PROVIDER_UNSUPPORTED,
      '当前渠道不支持可靠的结构化设定生成',
      { unsupported: true }
    )
  }

  const startedAt = Date.now()
  let mode = firstMode
  let attemptCount = 0
  let lastError = null
  for (let round = 0; round < 2 && mode; round += 1) {
    attemptCount += 1
    try {
      const result = await runStructuredProviderRequest(request, mode, {
        signal: options.signal,
        fetchImpl: options.fetchImpl,
        timeoutMs: request.options?.timeoutMs || STRUCTURED_GENERATION_TIMEOUTS.shortMs
      })
      const parsed = normalizeStructuredDraftPayload(result.payload, request.target, request.schemaId)
      if (!parsed.valid) {
        throw new StructuredProviderError(parsed.error.code, parsed.error.message)
      }
      recordStructuredProviderCapabilities(cache, request.provider, {
        [mode === 'native-json-schema' ? 'nativeJsonSchema' : mode === 'forced-tool' ? 'toolCalls' : 'jsonObject']: true,
        ...(mode === 'forced-tool' ? { specificToolChoice: true, strictToolSchema: true } : {}),
        protocol: result.protocol,
        reasoningControl: result.reasoningTokens > 0 ? 'split' : 'none',
        source: 'runtime-success'
      })
      return {
        schemaVersion: validation.request.schemaVersion,
        requestId: request.requestId,
        schemaId: request.schemaId,
        mode,
        drafts: parsed.drafts,
        fieldErrors: parsed.fieldErrors || {},
        meta: {
          provider: text(request.provider.id || request.provider.provider),
          model: text(request.provider.model),
          protocol: result.protocol,
          finishReason: result.finishReason,
          latencyMs: Date.now() - startedAt,
          attemptCount,
          inputChars: JSON.stringify(request.context || {}).length,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          reasoningTokens: result.reasoningTokens,
          cachedInputTokens: result.cachedInputTokens
        }
      }
    } catch (error) {
      lastError = error
      if (error?.code === STRUCTURED_GENERATION_ERROR_CODES.ABORTED || error?.code === STRUCTURED_GENERATION_ERROR_CODES.TIMEOUT) throw error
      if (
        error?.code === STRUCTURED_GENERATION_ERROR_CODES.RESPONSE_INCOMPLETE
        && round === 0
        && request.options.maxTokens < 6000
      ) {
        request = {
          ...request,
          options: {
            ...request.options,
            maxTokens: Math.min(6000, Math.max(request.options.maxTokens + 800, Math.ceil(request.options.maxTokens * 1.5)))
          }
        }
        continue
      }
      const capability = mode === 'native-json-schema'
        ? 'nativeJsonSchema'
        : mode === 'forced-tool'
          ? 'toolCalls'
          : 'jsonObject'
      if (error?.unsupported) downgradeStructuredProviderCapability(cache, request.provider, capability)
      if (!error?.unsupported) throw error
      mode = chooseFallbackMode(request.provider, mode)
    }
  }
  throw lastError || new StructuredProviderError(STRUCTURED_GENERATION_ERROR_CODES.PROVIDER_UNSUPPORTED, '当前渠道不支持可靠的结构化设定生成', { unsupported: true })
}

export function getStructuredGenerationModes() {
  return [...STRUCTURED_GENERATION_MODES]
}

/**
 * Probe the exact structured field path used by worldbook generation.
 * The probe uses a synthetic field and never returns or persists its draft.
 */
export async function probeStructuredProviderCapabilities(provider, options = {}) {
  const startedAt = Date.now()
  const request = {
    schemaVersion: 1,
    schemaId: 'setting-field.v1',
    requestId: `structured_probe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    provider,
    target: {
      worldbookId: 'connection-probe',
      worldbookRevision: 'connection-probe',
      sectionKey: 'world',
      fieldKeys: ['origin']
    },
    context: {
      globalConstraints: '这是结构化设定连接测试。只返回一句简短、完整的世界起源设定，不输出分析或解释。',
      confirmedSettings: '',
      currentValues: '',
      relatedEntries: '',
      sourceExcerpts: '',
      userBrief: '仅用于验证结构化输出协议，测试内容不会保存到世界书。'
    },
    options: {
      maxTokens: 180,
      temperature: 0,
      timeoutMs: Math.min(Number(options.timeoutMs || 30000), 30000)
    }
  }
  try {
    const result = await runStructuredGeneration(request, options)
    return {
      ok: true,
      available: true,
      mode: result.mode,
      protocol: result.meta?.protocol || '',
      reasoningControl: result.meta?.reasoningTokens > 0 ? 'split' : 'none',
      latencyMs: Date.now() - startedAt,
      attemptCount: result.meta?.attemptCount || 1
    }
  } catch (error) {
    return {
      ok: false,
      available: false,
      mode: '',
      protocol: '',
      reasoningControl: 'unknown',
      latencyMs: Date.now() - startedAt,
      code: error?.code || STRUCTURED_GENERATION_ERROR_CODES.UPSTREAM_FAILED,
      retryable: Boolean(error?.retryable),
      message: error?.message || '结构化设定探测失败'
    }
  }
}

export function createStructuredGenerationHandler({ runner = runStructuredGeneration } = {}) {
  return async function handleStructuredGeneration(req, res) {
    const controller = new AbortController()
    const abortRequest = () => controller.abort()
    const abortClosedResponse = () => {
      if (!res.writableEnded) controller.abort()
    }
    req.once?.('aborted', abortRequest)
    res.once?.('close', abortClosedResponse)
    try {
      // 内置 MiniMax 客户端发来哨兵 key → 替换为服务器 env key (或给出明确报错)
      const body = req.body || {}
      if (body?.provider) {
        body.provider.apiKey = resolveTextApiKey({
          provider: body.provider.id,
          baseUrl: body.provider.baseUrl,
          apiKey: body.provider.apiKey
        })
        if (!body.provider.apiKey) {
          const isMiniMaxUnconfigured =
            /minimax/i.test(body.provider.id || '') || /minimaxi?\.com/i.test(body.provider.baseUrl || '')
          if (isMiniMaxUnconfigured) {
            return res.status(400).json(errorPayload(
              new StructuredProviderError(
                STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID,
                '服务器未配置 MINIMAX_API_KEY，内置 MiniMax 暂不可用。请在服务器 .env 中填写后重启。'
              ),
              body.requestId
            ))
          }
        }
      }
      const result = await runner(body, { signal: controller.signal })
      if (controller.signal.aborted && (res.destroyed || res.writableEnded)) return undefined
      return res.json(result)
    } catch (error) {
      if (controller.signal.aborted && (res.destroyed || res.writableEnded)) return undefined
      const normalized = error instanceof StructuredProviderError
        ? error
        : new StructuredProviderError(error?.code || STRUCTURED_GENERATION_ERROR_CODES.UPSTREAM_FAILED, error?.message || '结构化设定生成失败', { retryable: Boolean(error?.retryable) })
      const status = normalized.code === STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID || normalized.code === STRUCTURED_GENERATION_ERROR_CODES.SCHEMA_UNSUPPORTED
        ? 400
        : normalized.code === STRUCTURED_GENERATION_ERROR_CODES.TIMEOUT
          ? 504
          : normalized.code === STRUCTURED_GENERATION_ERROR_CODES.ABORTED
            ? 499
            : normalized.unsupported || normalized.code === STRUCTURED_GENERATION_ERROR_CODES.PROVIDER_UNSUPPORTED
              ? 422
              : 502
      return res.status(status).json(errorPayload(normalized, req.body?.requestId))
    } finally {
      req.removeListener?.('aborted', abortRequest)
      res.removeListener?.('close', abortClosedResponse)
    }
  }
}

export const handleStructuredGeneration = createStructuredGenerationHandler()
