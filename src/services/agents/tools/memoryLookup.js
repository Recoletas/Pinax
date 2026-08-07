import {
  getNarrativeResources,
  searchNarrativeResources
} from '../narrativeResourceIndex'

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
  const resources = input.action === 'get'
    ? getNarrativeResources(index, 'memory', input.ids, filters)
    : searchNarrativeResources(index, 'memory', scopedInput, context)
  return resources.filter((item) => isOwnedMemory(item, context))
}

export default { executeMemoryLookup }
