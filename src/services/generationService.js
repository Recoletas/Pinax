import { runGenerationRetryPlan } from './generationRetry'

export async function runGenerationTask({
  taskType = 'generation',
  baseMessages,
  settings,
  generationOptions = {},
  attempts = [],
  parseContent,
  isValidParsed,
  character = null,
  worldId = null
}) {
  if (!Array.isArray(baseMessages) || baseMessages.length === 0) {
    throw new Error('runGenerationTask requires non-empty baseMessages')
  }
  return runGenerationRetryPlan({
    baseMessages,
    settings,
    generationOptions,
    attempts,
    parseContent,
    isValidParsed,
    character,
    worldId,
    taskType
  })
}
