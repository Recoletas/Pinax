import {
  getNarrativeResources,
  searchNarrativeResources
} from '../narrativeResourceIndex'
import { isMemorySourceCurrent } from '../../memoryProvenance'

function authorizedFilters(input, context) {
  const requestedScopes = input.filters.scopes || []
  const allowedScopes = []
  if (context.projectId) allowedScopes.push('project')
  if (context.sessionId) allowedScopes.push('session')
  return {
    ...input.filters,
    scopes: requestedScopes.length > 0
      ? requestedScopes.filter((scope) => allowedScopes.includes(scope))
      : allowedScopes
  }
}

function isOwnedMemory(item, context) {
  if (item.scope === 'project') return Boolean(context.projectId) && item.scopeId === context.projectId
  if (item.scope === 'session') return Boolean(context.sessionId) && item.scopeId === context.sessionId
  return false
}

export function executeMemoryLookup(index, input, context = {}) {
  const filters = authorizedFilters(input, context)
  if ((input.filters.scopes || []).length > 0 && filters.scopes.length === 0) return []
  const scopedInput = { ...input, filters }
  // 第二轮按需读取与自动召回共享同一 scope/revision/threshold 规则：
  // 来源 revision 已变化的记忆对工具同样不可见。
  const staleIds = new Set((index?.resources || [])
    .filter((item) => item?.domain === 'memory' && item.raw && !isMemorySourceCurrent(item.raw, context.currentRevisions || {}))
    .map((item) => item.id))
  const resources = input.action === 'get'
    ? getNarrativeResources(index, 'memory', input.ids, filters, input)
    : searchNarrativeResources(index, 'memory', scopedInput, context)
  return resources
    .filter((item) => !staleIds.has(item.id))
    .filter((item) => isOwnedMemory(item, context))
}

export default { executeMemoryLookup }
