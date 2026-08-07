import {
  STRUCTURED_GENERATION_ERROR_CODES,
  STRUCTURED_GENERATION_MODES,
  STRUCTURED_GENERATION_SCHEMA_IDS,
  STRUCTURED_GENERATION_TIMEOUTS,
  STRUCTURED_SETTING_SCHEMA_VERSION,
  validateStructuredDraftPayload,
  validateStructuredGenerationRequest
} from './structuredSettingContract.js'

export const STRUCTURED_GENERATION_SCHEMA_VERSION = STRUCTURED_SETTING_SCHEMA_VERSION
export {
  STRUCTURED_GENERATION_ERROR_CODES,
  STRUCTURED_GENERATION_MODES,
  STRUCTURED_GENERATION_SCHEMA_IDS,
  STRUCTURED_GENERATION_TIMEOUTS
}

export function validateStructuredGenerationRequestEnvelope(raw = {}) {
  const result = validateStructuredGenerationRequest(raw)
  if (!result.valid) return result
  if (!result.request.requestId) {
    return { valid: false, error: { code: STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, message: '结构化生成请求缺少 requestId' } }
  }
  const provider = result.request.provider
  if (!String(provider.baseUrl || '').trim()) {
    return { valid: false, error: { code: STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, message: '结构化生成请求缺少 provider.baseUrl' } }
  }
  if (!String(provider.apiKey || '').trim()) {
    return { valid: false, error: { code: STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, message: '结构化生成请求缺少 provider.apiKey' } }
  }
  if (!String(provider.model || '').trim()) {
    return { valid: false, error: { code: STRUCTURED_GENERATION_ERROR_CODES.REQUEST_INVALID, message: '结构化生成请求缺少 provider.model' } }
  }
  return result
}

export function normalizeStructuredGenerationResult(raw, request, meta = {}) {
  const parsed = validateStructuredDraftPayload(raw, request.target, request.schemaId)
  if (!parsed.valid) return parsed
  return {
    valid: true,
    schemaVersion: STRUCTURED_GENERATION_SCHEMA_VERSION,
    requestId: request.requestId,
    schemaId: request.schemaId,
    mode: meta.mode || 'json-object',
    drafts: parsed.drafts,
    fieldErrors: {},
    meta: {
      provider: String(meta.provider || request.provider.id || '').trim(),
      model: String(meta.model || request.provider.model || '').trim(),
      protocol: String(meta.protocol || '').trim(),
      finishReason: String(meta.finishReason || 'stop').trim(),
      latencyMs: Number(meta.latencyMs || 0) || 0,
      attemptCount: Number(meta.attemptCount || 1) || 1,
      inputChars: Number(meta.inputChars || 0) || 0,
      inputTokens: Number(meta.inputTokens || 0) || 0,
      outputTokens: Number(meta.outputTokens || 0) || 0,
      reasoningTokens: Number(meta.reasoningTokens || 0) || 0,
      cachedInputTokens: Number(meta.cachedInputTokens || 0) || 0
    }
  }
}
