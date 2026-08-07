import express from 'express'
import { validateGenerationAgentTurnRequest } from '../../shared/generationToolContract.js'
import {
  NarrativeProviderError,
  runToolCallingProviderTurn
} from '../services/toolCallingProviderAdapter.js'
import { resolveTextApiKey } from '../../shared/textModelKeys.js'

function statusForError(code) {
  if (code === 'NARRATIVE_PROVIDER_TOOLS_UNSUPPORTED') return 422
  if (code === 'NARRATIVE_PROVIDER_PROTOCOL_UNSUPPORTED') return 422
  if (code === 'NARRATIVE_AGENT_SCHEMA_UNSUPPORTED') return 400
  if (code === 'NARRATIVE_PROVIDER_TIMEOUT') return 504
  if (code === 'NARRATIVE_PROVIDER_ABORTED') return 499
  if ([
    'NARRATIVE_PROVIDER_UPSTREAM_FAILED',
    'NARRATIVE_PROVIDER_NETWORK_FAILED',
    'NARRATIVE_PROVIDER_RESPONSE_INVALID',
    'NARRATIVE_PROVIDER_TOOL_CALL_INVALID',
    'NARRATIVE_PROVIDER_TOOL_CALL_MISSING',
    'NARRATIVE_PROVIDER_TOOL_CALLS_TOO_MANY',
    'NARRATIVE_PROVIDER_TOOL_CALL_ID_INVALID',
    'NARRATIVE_PROVIDER_EMPTY_RESPONSE',
    'NARRATIVE_PROVIDER_REASONING_ONLY'
  ].includes(code)) return 502
  if (code?.includes('REQUIRED') || code?.includes('INVALID') || code?.includes('TOO_') || code?.includes('UNKNOWN')) {
    return 400
  }
  return 500
}

function safeErrorPayload(error, requestId = '') {
  const code = error?.code || 'NARRATIVE_PROVIDER_INTERNAL_ERROR'
  return {
    error: error?.message || '叙事工具请求失败',
    code,
    retryable: Boolean(error?.retryable),
    requestId
  }
}

export function createGenerationAgentTurnHandler({
  runner = runToolCallingProviderTurn
} = {}) {
  return async function handleGenerationAgentTurn(req, res) {
    const validation = validateGenerationAgentTurnRequest(req.body || {})
    if (!validation.valid) {
      return res.status(statusForError(validation.error.code)).json(
        safeErrorPayload(validation.error, req.body?.requestId || req.body?.request_id || '')
      )
    }
    // 客户端对内置 MiniMax 发送的是哨兵 key — 在此替换为服务器 env key (或给出明确报错)
    const request = validation.request
    request.provider.apiKey = resolveTextApiKey({
      provider: request.provider.id,
      baseUrl: request.provider.baseUrl,
      apiKey: request.provider.apiKey
    })
    if (!request.provider.apiKey) {
      const isMiniMaxUnconfigured =
        /minimax/i.test(request.provider.id) || /minimaxi?\.com/i.test(request.provider.baseUrl)
      return res.status(400).json(safeErrorPayload(
        Object.assign(new Error(
          isMiniMaxUnconfigured
            ? '服务器未配置 MINIMAX_API_KEY，内置 MiniMax 暂不可用。请在服务器 .env 中填写后重启。'
            : 'provider.apiKey 不能为空'
        ), { code: 'NARRATIVE_PROVIDER_API_KEY_REQUIRED' }),
        request.requestId
      ))
    }
    const controller = new AbortController()
    const abortRequest = () => controller.abort()
    const abortClosedResponse = () => {
      if (!res.writableEnded) controller.abort()
    }
    req.once?.('aborted', abortRequest)
    res.once?.('close', abortClosedResponse)
    try {
      const result = await runner(request, { signal: controller.signal })
      if (controller.signal.aborted && (res.destroyed || res.writableEnded)) return undefined
      return res.json(result)
    } catch (error) {
      if (controller.signal.aborted && (res.destroyed || res.writableEnded)) return undefined
      const normalized = error instanceof NarrativeProviderError
        ? error
        : Object.assign(new Error(error?.message || '叙事工具请求失败'), {
            code: error?.code || 'NARRATIVE_PROVIDER_INTERNAL_ERROR',
            retryable: Boolean(error?.retryable)
          })
      return res
        .status(statusForError(normalized.code))
        .json(safeErrorPayload(normalized, validation.request.requestId))
    } finally {
      req.removeListener?.('aborted', abortRequest)
      res.removeListener?.('close', abortClosedResponse)
    }
  }
}

export const handleGenerationAgentTurn = createGenerationAgentTurnHandler()

const router = express.Router()
router.post('/agent-turn', handleGenerationAgentTurn)

export default router
