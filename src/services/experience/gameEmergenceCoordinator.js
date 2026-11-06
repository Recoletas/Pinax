import { useWorldStore } from "../../stores/worldStore.js"
import { buildGeoHistoryRuntimeContext } from "../worldHistory/runtimeContext.js"
import { buildEmergenceCandidates } from "../worldHistory/emergenceScheduler.js"
import { generateEmergenceEventDraft } from "./generationEmergence.js"
import { createGameEmergenceCoordinator } from '@pinax/core/experience/gameEmergenceCoordinator'
const shared = createGameEmergenceCoordinator({ getWorldState: useWorldStore, buildGeoHistoryRuntimeContext, buildEmergenceCandidates, generateEmergenceEventDraft })
export const { gameEmergenceActions } = shared
