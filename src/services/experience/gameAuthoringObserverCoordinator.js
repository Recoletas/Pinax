import { useWorldStore } from "../../stores/worldStore.js"
import { createLegacyExperienceStateBridge } from "../agents/authoring/legacyExperienceStateBridge.js"
import { createAuthoringObserverScheduler } from "../agents/observers/authoringObserverScheduler.js"
import { createAuthoringObserverRunner } from "../agents/observers/authoringObserverDerivation.js"
import { normalizeAuthoringObserverProvenance } from "../agents/observers/authoringObservationContract.js"
import { createMemoryTriggers } from "../memory/memoryTriggers.js"
import { invalidateMemoryBySource } from "../memory/memoryCandidates.js"
import { createGameAuthoringObserverCoordinator } from '@pinax/core/experience/gameAuthoringObserverCoordinator'
const shared = createGameAuthoringObserverCoordinator({ getWorldState: useWorldStore, createLegacyExperienceStateBridge, createAuthoringObserverScheduler, createAuthoringObserverRunner, normalizeAuthoringObserverProvenance, createMemoryTriggers, invalidateMemoryBySource })
export const { gameAuthoringObserverActions } = shared
