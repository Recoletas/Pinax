import { useWorldStore } from "../../stores/worldStore.js"
import { formatAdventureStoryboardSeedContent, generateAdventureProseDraft, generateAdventureStoryboardDraft } from "./generationAdventureTriggers.js"
import { addNarrativeAssetDurable, createNarrativeAssetSourceRef, mergeSourceRefs } from "../media/narrativeAssets.js"
import { saveValidatedStoryboardVersion } from "../media/storyboardStore.js"
import { createAdventureTriggerCoordinator } from '@pinax/core/experience/adventureTriggerCoordinator'
const shared = createAdventureTriggerCoordinator({ getWorldState: useWorldStore, formatAdventureStoryboardSeedContent, generateAdventureProseDraft, generateAdventureStoryboardDraft, addNarrativeAssetDurable, createNarrativeAssetSourceRef, mergeSourceRefs, saveValidatedStoryboardVersion })
export const { adventureTriggerActions } = shared
