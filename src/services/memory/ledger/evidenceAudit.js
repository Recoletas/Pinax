import { openLedgerDb, closeLedgerDb } from './ledgerDb'
import { createEvidenceAuditModule } from '@pinax/core/memory/ledger/evidenceAudit'
export const { auditEvidenceCurrentness, readEvidenceAudit } = createEvidenceAuditModule({ openLedgerDb, closeLedgerDb })
