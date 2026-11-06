import { openLedgerDb } from "../../memory/ledger/ledgerDb.js"
import { appendCommittedTurnReceipt, listTurnReceipts } from "../../memory/ledger/factLedger.js"
import { getRoleplayHistoryPort, installRoleplayHistoryPort } from "./roleplayHistoryAdapter.js"
import { createRoleplayLedgerPort } from '@pinax/core/experience/roleplay/roleplayLedgerPort'
const shared = createRoleplayLedgerPort({ openLedgerDb, appendCommittedTurnReceipt, listTurnReceipts, getRoleplayHistoryPort, installRoleplayHistoryPort })
export const { createLedgerRoleplayHistoryPort, installLedgerRoleplayHistoryPort } = shared
