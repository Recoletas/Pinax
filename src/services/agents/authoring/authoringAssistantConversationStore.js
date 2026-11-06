import { createAuthoringAssistantConversationStore as createStore } from '@pinax/core/agent/authoringAssistantConversationStore'
import { createBrowserStorageRepository } from '../../storage/browserStorageRepository.js'
export { AUTHORING_ASSISTANT_CONVERSATION_PREFIX, AUTHORING_ASSISTANT_DRAFT_PREFIX, ASSISTANT_STOP_MESSAGES, retainAssistantSessions } from '@pinax/core/agent/authoringAssistantConversationStore'
export function createAuthoringAssistantConversationStore({ storage = createBrowserStorageRepository() } = {}) { return createStore({ storage }) }
