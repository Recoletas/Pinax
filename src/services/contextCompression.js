import { runGenerationTask } from './generationService'
import { createContextCompression } from '@pinax/core/context/experienceContextCompression'
export { buildHeuristicContextSummary } from '@pinax/core/context/heuristicContextSummary'
export const { compressChatHistory } = createContextCompression({ runGenerationTask })
