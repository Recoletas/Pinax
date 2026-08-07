import {
  getNarrativeResources,
  searchNarrativeResources,
  traceNarrativeHistory
} from '../narrativeResourceIndex'

export function executeHistoryLookup(index, input, context = {}) {
  if (input.action === 'get') return getNarrativeResources(index, 'history', input.ids, input.filters)
  if (input.action === 'trace') {
    return traceNarrativeHistory(index, input.ids, input.filters, input.limit)
  }
  return searchNarrativeResources(index, 'history', input, context)
}

export default { executeHistoryLookup }
