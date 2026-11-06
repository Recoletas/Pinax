import { createAssistantProposalEngine } from '@pinax/core'
import { parseCharacterEntryProfile } from '../../characterCard.js'
import * as documents from '../../writing/writingDocumentSchema.js'

// Host projections only. Selection, dependencies, conflict checks and decisions are shared.
const engine = createAssistantProposalEngine({ documents, parseCharacterEntryProfile, idFactory: () => `assistant-${globalThis.crypto.randomUUID()}` })
export const { prepareAssistantProposal, selectAssistantProposalChanges, applyAssistantProposal } = engine
