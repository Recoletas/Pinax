import {
  NARRATIVE_AGENT_SCHEMA_VERSION,
  createNarrativeToolError,
  stableNarrativeSerialize,
  validateNarrativeToolCall
} from '../../../shared/narrativeAgentContract'
import { toNarrativeToolItems } from './narrativeResourceIndex'
import { executeWorldLookup } from './tools/worldLookup'
import { executeGeoLookup } from './tools/geoLookup'
import { executeHistoryLookup } from './tools/historyLookup'
import { executeMemoryLookup } from './tools/memoryLookup'

const EXECUTORS = Object.freeze({
  world_lookup: executeWorldLookup,
  geo_lookup: executeGeoLookup,
  history_lookup: executeHistoryLookup,
  memory_lookup: executeMemoryLookup
})

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function createNarrativeToolRegistry({
  index,
  projectId = '',
  sessionId = '',
  currentPlaceId = ''
} = {}) {
  const cache = new Map()
  const context = {
    projectId: text(projectId || index?.projectId),
    sessionId: text(sessionId || index?.sessionId),
    currentPlaceId: text(currentPlaceId)
  }

  async function execute(rawCall, options = {}) {
    const validation = validateNarrativeToolCall(rawCall)
    if (!validation.valid) {
      return createNarrativeToolError(rawCall, validation.error.code, validation.error.message, {
        details: validation.error
      })
    }
    const call = validation.call
    if (options.signal?.aborted) {
      return createNarrativeToolError(call, 'NARRATIVE_TOOL_ABORTED', '工具调用已取消')
    }
    if (!index?.byId || !index?.byDomain) {
      return createNarrativeToolError(call, 'NARRATIVE_RESOURCE_INDEX_MISSING', '叙事资源索引不可用')
    }
    const executor = EXECUTORS[call.name]
    if (!executor) {
      return createNarrativeToolError(call, 'NARRATIVE_TOOL_UNKNOWN', `未知叙事工具：${call.name}`)
    }
    const cacheKey = `${index.revision}:${call.name}:${stableNarrativeSerialize(call.arguments)}`
    if (cache.has(cacheKey)) {
      return { ...cache.get(cacheKey), callId: call.id, cached: true }
    }
    try {
      const resources = await executor(index, call.arguments, context)
      const output = toNarrativeToolItems(resources, call.arguments.action)
      const result = {
        schemaVersion: NARRATIVE_AGENT_SCHEMA_VERSION,
        ok: true,
        callId: call.id,
        tool: call.name,
        action: call.arguments.action,
        query: call.arguments.query,
        revision: index.revision,
        items: output.items,
        truncated: output.truncated,
        nextCursor: '',
        warnings: output.truncated ? ['result-char-limit'] : [],
        chars: output.chars,
        cached: false
      }
      cache.set(cacheKey, result)
      return result
    } catch (executionError) {
      return createNarrativeToolError(
        call,
        executionError?.code || 'NARRATIVE_TOOL_EXECUTION_FAILED',
        executionError?.message || '叙事工具执行失败'
      )
    }
  }

  return {
    revision: index?.revision || '',
    names: Object.keys(EXECUTORS),
    execute,
    clearCache() {
      cache.clear()
    }
  }
}

export default { createNarrativeToolRegistry }
