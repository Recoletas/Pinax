import { createMemoryCandidate, queueMemoryCandidate } from './memoryCandidates'
import { createMemoryTriggerModule } from '@pinax/core/memory/memoryTriggers'
export const { createMemoryTriggers } = createMemoryTriggerModule({ createMemoryCandidate, queueMemoryCandidate })
