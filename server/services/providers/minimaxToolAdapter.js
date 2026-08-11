import {
  buildAnthropicToolRequest,
  parseAnthropicToolResponse
} from './anthropicToolAdapter.js'

function text(value) {
  return String(value ?? '').trim()
}

/**
 * MiniMax uses the Anthropic-compatible envelope for the narrative tool path,
 * but its thinking switch and bearer authentication are provider-specific.
 * Keep that distinction at the adapter boundary instead of teaching the
 * generic Anthropic parser about MiniMax model names.
 */
export function buildMiniMaxToolRequest(request) {
  const body = buildAnthropicToolRequest({
    ...request,
    options: {
      ...request.options,
      ...(request.options?.thinking
        ? { thinking: request.options.thinking }
        : {})
    }
  })
  return {
    ...body,
    ...(request.options?.reasoningEffort
      ? { reasoning_effort: text(request.options.reasoningEffort) }
      : {})
  }
}

export function parseMiniMaxToolResponse(data, meta = {}) {
  return parseAnthropicToolResponse(data, {
    ...meta,
    provider: text(meta.provider) || 'MiniMax'
  })
}

export default {
  buildMiniMaxToolRequest,
  parseMiniMaxToolResponse
}
