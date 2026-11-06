import { runGenerationTask } from "../generationService"
import { buildWorldbookContext } from "../worldbook/worldbookContextBuilder"
import { createGenerationEmergence } from '@pinax/core/experience/generationEmergence'
const shared = createGenerationEmergence({ runGenerationTask, buildWorldbookContext })
export const { parseEmergenceEventDraft, buildEmergenceEventMessages, generateEmergenceEventDraft } = shared
export default shared.default
