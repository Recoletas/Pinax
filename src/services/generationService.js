import { runGenerationRetryPlan } from './generationRetry'
import { sendChatStream, sendNarrativeAgentStepStream } from './api'
import { PROMPT_REGISTRY_VERSION } from './promptRegistry'

export async function runGenerationTask({
  taskType = 'generation',
  baseMessages,
  settings,
  generationOptions = {},
  promptVersion = PROMPT_REGISTRY_VERSION,
  attempts = [],
  parseContent,
  isValidParsed,
  character = null,
  worldId = null,
  signal = null
}) {
  if (!Array.isArray(baseMessages) || baseMessages.length === 0) {
    throw new Error('runGenerationTask requires non-empty baseMessages')
  }
  return runGenerationRetryPlan({
    baseMessages,
    settings,
    generationOptions: {
      promptVersion,
      ...(generationOptions || {})
    },
    attempts,
    parseContent,
    isValidParsed,
    character,
    worldId,
    taskType,
    signal
  })
}

export async function runGenerationStreamTask({
  taskType = 'generation.stream',
  baseMessages,
  settings,
  generationOptions = {},
  promptVersion = PROMPT_REGISTRY_VERSION,
  character = null,
  worldId = null,
  signal = null,
  callbacks = {}
}) {
  if (!Array.isArray(baseMessages) || baseMessages.length === 0) {
    throw new Error('runGenerationStreamTask requires non-empty baseMessages')
  }

  return sendChatStream(
    baseMessages,
    character,
    worldId,
    settings,
    {
      promptVersion,
      attemptName: generationOptions?.attemptName || `${taskType}.stream`,
      ...(generationOptions || {}),
      taskType
    },
    callbacks,
    { signal }
  )
}

export async function runNarrativeAgentTurn({
  messages,
  tools,
  settings,
  options = {},
  requestId = '',
  signal = null
} = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('runNarrativeAgentTurn requires non-empty messages')
  }
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new Error('runNarrativeAgentTurn requires non-empty tools')
  }
  return sendNarrativeAgentStepStream({
    messages,
    tools,
    settings,
    options,
    requestId,
    signal
  })
}
