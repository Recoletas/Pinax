import { mergeSourceRefs, normalizeContentRef } from "../media/narrativeAssets.js"
import { createGameJournalProjection } from '@pinax/core/experience/gameJournalProjection'
const shared = createGameJournalProjection({ mergeSourceRefs, normalizeContentRef })
export const { buildPlotJournalEntry, buildAdventureCreativeSourceRefs } = shared
