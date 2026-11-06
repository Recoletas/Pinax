import { buildWorldbookContext } from "../worldbook/worldbookContextBuilder"
import { runGenerationTask } from "../generationService"
import { validateStoryboardShots } from "../media/storyboardStore"
import { CAMERA_MOVEMENTS, SHOT_TYPES } from "../../types/director"
import { createGenerationAdventureTriggers } from '@pinax/core/experience/generationAdventureTriggers'
const shared = createGenerationAdventureTriggers({ buildWorldbookContext, runGenerationTask, validateStoryboardShots, CAMERA_MOVEMENTS, SHOT_TYPES })
export const { parseAdventureProseDraft, buildAdventureProseMessages, generateAdventureProseDraft, parseAdventureStoryboardDraft, buildAdventureStoryboardMessages, generateAdventureStoryboardDraft, formatAdventureStoryboardSeedContent } = shared
