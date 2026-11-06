import { appendCommittedTurnReceipt } from './factLedger'
import { createLedgerReceiptBridgeModule } from '@pinax/core/memory/ledger/ledgerReceiptBridge'
export const { RECEIPT_BRIDGE_REASONS, createRoleplayArchiveParticipant, drainReceiptArchive, queryTurnReceipts, traceTurnChain } = createLedgerReceiptBridgeModule({ appendCommittedTurnReceipt })
