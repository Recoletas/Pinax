import { ledgerId } from './ledgerContract'
import { createFactLedgerModule } from '@pinax/core/memory/ledger/factLedger'
export const { appendEvidence, createProposal, revertTemporalClosure, adoptProposal, correctFact, retractFact, rejectProposal, reopenRejection, appendCommittedTurnReceipt, listProposals, listFactVersions, listDecisions, listDecisionsPaged, getFactHead, listRejectionMarks, listTurnReceipts } = createFactLedgerModule({ ledgerId })
