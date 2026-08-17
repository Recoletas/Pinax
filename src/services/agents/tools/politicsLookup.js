import {
  getCurrentNarrativePolitics,
  getNarrativeResources,
  traceNarrativePolitics
} from '../narrativeResourceIndex'

export function executePoliticsLookup(index, input, context = {}) {
  if (input.action === 'current') return getCurrentNarrativePolitics(index, input.filters, input, context)
  if (input.action === 'get') return getNarrativeResources(index, 'politics', input.ids, input.filters, input)
  return traceNarrativePolitics(index, input.ids, input.filters, input.limit, input)
}
