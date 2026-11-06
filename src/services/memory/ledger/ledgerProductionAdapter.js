import { listLegacyMigrationMap } from './legacyMigration'
import { openLedgerDb, closeLedgerDb } from './ledgerDb'
import { createLedgerProductionAdapterModule } from '@pinax/core/memory/ledger/ledgerProductionAdapter'
export const { createLedgerFactsMethod, readProductionLedgerFacts, attachLedgerFactsToRepository } = createLedgerProductionAdapterModule({ listLegacyMigrationMap, openLedgerDb, closeLedgerDb })
