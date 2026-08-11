import express from 'express'
import { validateGenerationAgentTurnRequest } from '../../shared/generationToolContract.js'
import {
  NarrativeProviderError,
  runToolCallingProviderTurn
} from '../services/toolCallingProviderAdapter.js'
import { resolveTextApiKey } from '../../shared/textModelKeys.js'
import { createNarrativeAgentStreamEvent, serializeNarrativeAgentSseEvent } from '../../shared/narrativeAgentStreamContract.js'

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
    'NARRATIVE_PROVIDER_REASONING_ONLY',
    'NARRATIVE_PROVIDER_OUTPUT_TRUNCATED',
    'NARRATIVE_PROVIDER_CONTENT_FILTER',
    'NARRATIVE_PROVIDER_REFUSAL'
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

export function createGenerationAgentStepStreamHandler({
  runner = runToolCallingProviderTurn
} = {}) {
  return async function handleGenerationAgentStepStream(req, res) {
    const validation = validateGenerationAgentTurnRequest(req.body || {})
    if (!validation.valid) {
      return res.status(statusForError(validation.error.code)).json(
        safeErrorPayload(validation.error, req.body?.requestId || req.body?.request_id || '')
      )
    }
    const request = validation.request
    request.provider.apiKey = resolveTextApiKey({
      provider: request.provider.id,
      baseUrl: request.provider.baseUrl,
      apiKey: request.provider.apiKey
    })
    if (!request.provider.apiKey) {
      return res.status(400).json(safeErrorPayload(
        Object.assign(new Error('provider.apiKey 不能为空'), { code: 'NARRATIVE_PROVIDER_API_KEY_REQUIRED' }),
        request.requestId
      ))
    }
    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    let seq = 0
    const send = (type, payload = {}) => {
      if (res.writableEnded || res.destroyed) return false
      seq += 1
      res.write(serializeNarrativeAgentSseEvent(createNarrativeAgentStreamEvent(type, payload, {
        requestId: request.requestId,
        seq
      })))
      return true
    }
    const controller = new AbortController()
    const abortRequest = () => controller.abort()
    const abortClosedResponse = () => {
      if (!res.writableEnded) controller.abort()
    }
    req.once?.('aborted', abortRequest)
    res.once?.('close', abortClosedResponse)
    try {
      send('step.start', { stepIndex: 0, toolChoice: request.options.toolChoice || 'auto' })
      const result = await runner(request, { signal: controller.signal })
      for (const call of result.calls || []) {
        send('tool.input.delta', { callId: call.id, toolName: call.name, input: call.arguments })
        send('tool.call', { callId: call.id, toolName: call.name, action: call.arguments?.action })
      }
      if (result.kind === 'final_ready') send('text.delta', { content: result.text })
      send('usage', { usage: result.usage })
      send('step.finish', {
        stepIndex: 0,
        status: result.kind,
        terminalMode: result.kind === 'final_ready' ? 'provider-text' : 'tool-dispatch',
        toolRounds: result.kind === 'tool_calls' ? 1 : 0,
        totalCalls: result.calls?.length || 0
      })
      if (!res.writableEnded) res.end()
    } catch (error) {
      if (controller.signal.aborted && (res.destroyed || res.writableEnded)) return undefined
      const normalized = error instanceof NarrativeProviderError
        ? error
        : Object.assign(new Error(error?.message || '叙事工具请求失败'), {
            code: error?.code || 'NARRATIVE_PROVIDER_INTERNAL_ERROR',
            retryable: Boolean(error?.retryable)
          })
      send('error', safeErrorPayload(normalized, request.requestId))
      if (!res.writableEnded) res.end()
    } finally {
      req.removeListener?.('aborted', abortRequest)
      res.removeListener?.('close', abortClosedResponse)
    }
  }
}

export const handleGenerationAgentStepStream = createGenerationAgentStepStreamHandler()

const router = express.Router()
router.post('/agent-step/stream', handleGenerationAgentStepStream)

export default router
