import { runGenerationTask } from './generationService'

export async function runGenerationRetryPlan({
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
    throw new Error('runGenerationRetryPlan requires non-empty baseMessages')
  }
  const result = await runGenerationTask({
    taskType: 'retry-plan',
    baseMessages,
    settings,
    generationOptions,
    attempts,
    parseContent,
    isValidParsed,
    character,
    worldId
  })

  return result
}
