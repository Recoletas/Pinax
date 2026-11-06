import { runGenerationTask } from "../generationService"
import { createDialogueOptions } from '@pinax/core/experience/dialogueOptions'
const shared = createDialogueOptions({ runGenerationTask })
export const { FALLBACK_DIALOGUE_OPTIONS, parseDialogueOptions, generateDialogueOptions, buildFallbackOptions, buildDialogueOptionMessages } = shared
