import { traceTurnChain } from './ledgerReceiptBridge'
import { createLedgerHistoryToolModule } from '@pinax/core/memory/ledger/ledgerHistoryTool'
export const { createLedgerHistoryTool } = createLedgerHistoryToolModule({ traceTurnChain })
