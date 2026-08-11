import {
  getNarrativeResources,
  getRelatedNarrativeResources,
  searchNarrativeResources
} from '../narrativeResourceIndex'

export function executeWorldLookup(index, input, context = {}) {
  if (input.action === 'get') return getNarrativeResources(index, 'world', input.ids, input.filters, input)
  if (input.action === 'related') {
    return getRelatedNarrativeResources(index, 'world', input.ids, input.filters, input.limit, input)
  }
  return searchNarrativeResources(index, 'world', input, context)
}

export default { executeWorldLookup }
