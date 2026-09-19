import { assertToolExecutionAuthorization } from './toolExecutionAuthorization.js'
import {
  NARRATIVE_AGENT_SCHEMA_VERSION,
  createNarrativeToolError,
  parseNarrativeCursor,
  stableNarrativeSerialize,
  validateNarrativeToolCall
} from '../../../shared/narrativeAgentContract'
import { toNarrativeToolItems } from './narrativeResourceIndex'
import { executeWorldLookup } from './tools/worldLookup'
import { executeGeoLookup } from './tools/geoLookup'
import { executeHistoryLookup } from './tools/historyLookup'
import { executeMemoryLookup } from './tools/memoryLookup'
import { executePoliticsLookup } from './tools/politicsLookup'
import {
  NARRATIVE_BEAT_PLAN_TOOL,
  narrativeBeatPlanRevision
} from '../../../shared/narrativeBeatPlanContract'

const EXECUTORS = Object.freeze({
  world_lookup: executeWorldLookup,
  geo_lookup: executeGeoLookup,
  history_lookup: executeHistoryLookup,
  memory_lookup: executeMemoryLookup,
  politics_lookup: executePoliticsLookup
})

const TOOL_DOMAINS = Object.freeze({
  world_lookup: 'world',
  geo_lookup: 'geo',
  history_lookup: 'history',
  memory_lookup: 'memory',
  politics_lookup: 'politics'
})

function availableToolNames(index, allowedToolNames) {
  // 未显式提供 allowlist 时保持 legacy registry 合同；Authoring manifest
  // 必须传 Kernel 的最小目录，且只保留索引中确有资源的 world/memory 域。
  if (!Array.isArray(allowedToolNames)) return Object.keys(EXECUTORS)
  return allowedToolNames.filter((name) => {
    if (name === NARRATIVE_BEAT_PLAN_TOOL) return true
    const domain = TOOL_DOMAINS[name]
    if (!domain) return false
    if (Number(index?.counts?.[domain] || 0) > 0) return true
    const resources = index?.byDomain?.get?.(domain)
    return Array.isArray(resources) && resources.length > 0
  })
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function createNarrativeToolRegistry({
  index,
  projectId = '',
  sessionId = '',
  currentPlaceId = '',
  allowedToolNames = null
} = {}) {
  const cache = new Map()
  const context = {
    projectId: text(projectId || index?.projectId),
    sessionId: text(sessionId || index?.sessionId),
    currentPlaceId: text(currentPlaceId)
  }
  const names = Object.freeze(availableToolNames(index, allowedToolNames))

  async function execute(rawCall, options = {}) {
    try {
      assertToolExecutionAuthorization({ call: rawCall, phase: options.phase === 'write' ? 'narrate' : options.phase })
    } catch (error) {
      return createNarrativeToolError(rawCall, error.code === 'TOOL_PHASE_FORBIDDEN' ? 'NARRATIVE_TOOL_PHASE_FORBIDDEN' : error.code, error.message)
    }
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
    // T02（runtime-maturity）：执行处阶段核验 —— 权限边界必须落在实际执行
    // 入口，而不是只靠 prompt 目录隐藏工具。规划工具是控制面调用，只存在于
    // 独立 planner 轮；正文/evidence 轮即使模型伪造该调用，也在任何执行器、
    // 缓存或索引读取之前 typed 拒绝。options.phase 缺省 = legacy 合同（不过
    // 门），存量调用方（experience/rehearsal）不受影响。
    if (options.phase === 'plan' && call.name !== NARRATIVE_BEAT_PLAN_TOOL) {
      return createNarrativeToolError(call, 'NARRATIVE_TOOL_PHASE_FORBIDDEN', '规划阶段只允许提交场景方案工具调用')
    }
    if (options.phase && options.phase !== 'plan' && call.name === NARRATIVE_BEAT_PLAN_TOOL) {
      return createNarrativeToolError(call, 'NARRATIVE_TOOL_PHASE_FORBIDDEN', '规划工具只允许在规划阶段调用')
    }
    // Q3：BeatPlan 是内部控制调用 —— 不查询资源索引，不计入 grounding evidence。
    if (call.name === NARRATIVE_BEAT_PLAN_TOOL) {
      const plan = call.arguments || {}
      return {
        schemaVersion: NARRATIVE_AGENT_SCHEMA_VERSION,
        ok: true,
        callId: call.id,
        tool: call.name,
        action: 'submit',
        plan,
        planRevision: narrativeBeatPlanRevision(plan),
        items: [],
        truncated: false,
        warnings: [],
        chars: JSON.stringify(plan).length,
        cached: false
      }
    }
    if (!index?.byId || !index?.byDomain) {
      return createNarrativeToolError(call, 'NARRATIVE_RESOURCE_INDEX_MISSING', '叙事资源索引不可用')
    }
    if (Array.isArray(allowedToolNames) && !names.includes(call.name)) {
      return createNarrativeToolError(call, 'NARRATIVE_TOOL_NOT_AUTHORIZED', `当前资料索引未授权工具：${call.name}`)
    }
    if (call.arguments.cursor) {
      const cursor = parseNarrativeCursor(call.arguments.cursor, {
        revision: index.revision,
        domain: TOOL_DOMAINS[call.name]
      })
      if (!cursor.valid) {
        return createNarrativeToolError(
          call,
          cursor.error.code,
          cursor.error.message,
          { retryable: cursor.error.code === 'NARRATIVE_CURSOR_STALE' }
        )
      }
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
        warnings: [
          ...(output.truncated ? ['result-char-limit'] : []),
          ...(output.items.some((item) => item.conflictState === 'active-conflict') ? ['active-conflict'] : []),
          ...(output.items.some((item) => item.conflictState === 'stale') ? ['stale-evidence'] : []),
          ...(output.items.some((item) => item.eligibleEvidence === false) ? ['non-canonical-evidence'] : [])
        ],
        chars: output.chars,
        nextCursor: output.nextCursor || '',
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
    names,
    execute,
    clearCache() {
      cache.clear()
    }
  }
}

export default { createNarrativeToolRegistry }
