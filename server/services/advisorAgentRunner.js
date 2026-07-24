import { getAdvice, OPENCLAW_PROVIDER } from './openclawService.js'
import {
  runTextModelAgent,
  TEXT_MODEL_PROVIDER
} from './textModelAgentProvider.js'

const PROVIDERS = Object.freeze({
  openclaw: {
    ...OPENCLAW_PROVIDER,
    run: getAdvice
  },
  'text-model': {
    ...TEXT_MODEL_PROVIDER,
    run: runTextModelAgent
  }
})

function getProvider(providerId, capability) {
  const provider = PROVIDERS[providerId]
  if (!provider) {
    const error = new Error(`未知 Agent provider：${providerId}`)
    error.code = 'AGENT_PROVIDER_UNKNOWN'
    error.retryable = false
    throw error
  }
  if (!provider.capabilities.includes(capability)) {
    const error = new Error(`Provider ${providerId} 不支持 ${capability}`)
    error.code = 'AGENT_PROVIDER_CAPABILITY_UNAVAILABLE'
    error.retryable = false
    throw error
  }
  return provider
}

export async function runAdvisorAgent({
  providerId = 'openclaw',
  fallbackProviderId = null,
  capability,
  envelope,
  question,
  taskMeta
} = {}) {
  let activeProviderId = providerId
  let provider = getProvider(activeProviderId, capability)
  let fallbackUsed = false
  let advice
  try {
    advice = await provider.run(envelope, question, taskMeta)
  } catch (error) {
    if (!fallbackProviderId || fallbackProviderId === providerId || error.retryable === false) throw error
    activeProviderId = fallbackProviderId
    provider = getProvider(activeProviderId, capability)
    advice = await provider.run(envelope, question, taskMeta)
    fallbackUsed = true
  }
  return {
    advice,
    provider: {
      id: provider.id,
      capabilities: provider.capabilities,
      timeoutMs: provider.timeoutMs,
      fallback: fallbackProviderId,
      fallbackUsed
    }
  }
}
