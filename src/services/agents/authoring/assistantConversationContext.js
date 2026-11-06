import { createAssistantContextSummarizer } from '@pinax/core/agent/assistantConversationContext'
import { runGenerationTask } from '../../generationService.js'
export { assistantContextMessages, assistantQuestionWithContext, assistantEditDecisions } from '@pinax/core/agent/assistantConversationContext'
export const summarizeAssistantContext = createAssistantContextSummarizer({ runGenerationTask })
