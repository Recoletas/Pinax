import { randomUUID } from '../../../../shared/randomId.js'
import { ledgerId as createLedgerId } from '@pinax/core/memory/ledger/ledgerContract'
export * from '@pinax/core/memory/ledger/ledgerContract'
export function ledgerId(prefix) { return createLedgerId(prefix, randomUUID) }
