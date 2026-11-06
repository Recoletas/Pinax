import { buildPlaceEntityIndex } from '../worldHistory/placeEntity'
import { createNarrativeResourceIndexModule } from '@pinax/core/narrative/narrativeResourceIndex'
export const { createNarrativeResourceSnapshotRevision, createNarrativeResourceIndex, getNarrativeResourceIndex, searchNarrativeResources, getNarrativeResources, getRelatedNarrativeResources, getCurrentNarrativePolitics, traceNarrativePolitics, traceNarrativeHistory, toNarrativeToolItems } = createNarrativeResourceIndexModule({ buildPlaceEntityIndex })
