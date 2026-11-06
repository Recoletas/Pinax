import { createAuthoringAgentTurn } from '@pinax/core/agent/authoringAgentTurn'
import { getItem } from '../../../composables/useStorage.js'
import { toResolvedTextApiSettings } from '../../textProviderConfigStore.js'
import { recordPromptSnapshot } from '../promptSnapshot.js'
import { recordAgentRequestTrace } from '../agentRequestTrace.js'
export const runAuthoringAgentTurn = createAuthoringAgentTurn({ getItem, toResolvedTextApiSettings, recordPromptSnapshot, recordAgentRequestTrace })
