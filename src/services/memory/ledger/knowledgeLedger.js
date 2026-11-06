import { ledgerId } from './ledgerContract'
import { openLedgerDb, closeLedgerDb } from './ledgerDb'
import { createKnowledgeLedgerModule } from '@pinax/core/memory/ledger/knowledgeLedger'
export const { KNOWLEDGE_CHANNELS, KNOWLEDGE_BELIEFS, KNOWLEDGE_EVENT_KINDS, recordKnowledgeEvent, readCharacterKnowledge, createCharacterKnowledgeProvider } = createKnowledgeLedgerModule({ ledgerId, openLedgerDb, closeLedgerDb })
