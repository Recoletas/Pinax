import { getResolvedApiSettings } from '../api'
import { runGenerationTask } from '../generationService'
import { createImageDescriptionService } from '@pinax/core/media/imageDescriptionService'

export const { buildImageDescriptionMessages, draftImageDescription } = createImageDescriptionService({ getResolvedApiSettings, runGenerationTask })
