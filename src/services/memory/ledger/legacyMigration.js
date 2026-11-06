import { listMemoryCandidates } from '../memoryCandidates'
import { ledgerId } from './ledgerContract'
import { createLegacyMigrationModule } from '@pinax/core/memory/ledger/legacyMigration'
export const { previewLegacyMigration, migrateLegacyCandidate, listLegacyMigrationMap } = createLegacyMigrationModule({ listMemoryCandidates, ledgerId })
