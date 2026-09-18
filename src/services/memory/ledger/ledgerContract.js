import { randomUUID } from '../../../../shared/randomId.js'
import { sha256HexOfText } from '../../contentHash'
import { stableStringify } from '../../project/knowledgeReadModel/contract'

// A-line fact ledger contract (nightly 20260916). Structural semantics follow
// Utopia `60df635d6924127c9a57e98acbd99e43bdd92d08` (Apache-2.0): facts are
// versioned claims with frozen evidence, a supersedes chain and two clocks.
// No Rust/SQL code is copied; the ledger runs on the existing Dexie database.

export const LEDGER_SCHEMA_VERSION = 2

export const LEDGER_DOMAINS = ['author', 'book', 'worldbook', 'session']

export const LEDGER_TABLES = [
  'evidenceSnapshots',
  'factProposals',
  'factVersions',
  'factDecisions',
  'rejectionMarks',
  'ledgerMeta',
  'turnReceipts'
]

// Five record types from the plan; the ledger only ever stores the middle
// three as ledger rows. Legacy candidates stay proposal-grade until an author
// decision adopts them; session events live in the turn owner, never here.
export const LEDGER_RECORD_TYPES = ['authorPreference', 'proposal', 'canonicalFact', 'sessionEvent', 'derivedClaim']

export const EVIDENCE_SOURCE_KINDS = ['chapter-quote', 'manual-assertion', 'legacy-candidate']

export const PROPOSAL_ORIGINS = ['author', 'ai', 'legacy-migration']

export const PROPOSAL_STATUSES = ['pending', 'adopted', 'dismissed']

export const DECISION_OPERATIONS = [
  'adopt-proposal',
  'correct-fact',
  'retract-fact',
  'reject-proposal',
  'reopen-rejection',
  'migrate-legacy'
]

export const LEDGER_FAILURE_REASONS = Object.freeze({
  scopeInvalid: 'scope-invalid',
  commandPayloadConflict: 'command-payload-conflict',
  proposalNotFound: 'proposal-not-found',
  proposalNotPending: 'proposal-not-pending',
  proposalAlreadyAdopted: 'proposal-already-adopted',
  evidenceMissing: 'evidence-missing',
  rejectionActive: 'rejection-active',
  factNotFound: 'fact-not-found',
  headConflict: 'head-conflict',
  noChange: 'no-change',
  rejectionNotFound: 'rejection-not-found',
  claimInvalid: 'claim-invalid',
  dbUnavailable: 'db-unavailable'
})

// K1 ScopeRef: unrelated fields are explicit null; no mixed projectId that
// secretly means both a book and a library.
export function normalizeScopeRef(input) {
  if (!input || typeof input !== 'object') return { ok: false, reason: LEDGER_FAILURE_REASONS.scopeInvalid }
  const domain = input.domain
  if (!LEDGER_DOMAINS.includes(domain)) return { ok: false, reason: LEDGER_FAILURE_REASONS.scopeInvalid }
  const scope = {
    domain,
    bookId: domain === 'book' || domain === 'worldbook' || domain === 'session' ? scopeIdText(input.bookId) : null,
    worldbookId: domain === 'worldbook' || domain === 'session' ? scopeIdText(input.worldbookId) : null,
    sessionId: domain === 'session' ? scopeIdText(input.sessionId) : null,
    branchId: domain === 'session' ? scopeIdText(input.branchId) : null
  }
  if (domain === 'book' && !scope.bookId) return { ok: false, reason: LEDGER_FAILURE_REASONS.scopeInvalid }
  if (domain === 'worldbook' && !scope.worldbookId) return { ok: false, reason: LEDGER_FAILURE_REASONS.scopeInvalid }
  // Session facts need a session AND a branch; legacy session-scope candidates
  // without a branch are unattributable and must not silently claim one.
  if (domain === 'session' && (!scope.sessionId || !scope.branchId)) {
    return { ok: false, reason: LEDGER_FAILURE_REASONS.scopeInvalid }
  }
  return { ok: true, scope }
}

// Canonical fixed-arity encoding with a control-char separator; field ids are
// normalized to exclude it, so ["bo","ok"] and ["book",""] cannot collide.
const SCOPE_FIELD_SEPARATOR = '\u001f'
// Field ids must never contain the separator; enforce during normalization.
export function scopeIdText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text && !text.includes(SCOPE_FIELD_SEPARATOR) ? text : null
}
export function encodeScopeKey(scope) {
  return [
    scope.domain,
    scope.bookId ?? '',
    scope.worldbookId ?? '',
    scope.sessionId ?? '',
    scope.branchId ?? ''
  ].join(SCOPE_FIELD_SEPARATOR)
}

export function scopeRefFromLegacy(scope, scopeId) {
  const id = typeof scopeId === 'string' && scopeId.trim() ? scopeId.trim() : null
  if (scope === 'global-author') return normalizeScopeRef({ domain: 'author' })
  if (scope === 'project') return id ? normalizeScopeRef({ domain: 'book', bookId: id }) : { ok: false, reason: 'legacy-unattributable' }
  // Legacy session candidates carry no branch; record identityKind instead of
  // guessing one. They stay in the migration review list.
  if (scope === 'session') return { ok: false, reason: 'legacy-session-no-branch', identityKind: 'legacy-session' }
  return { ok: false, reason: 'legacy-unattributable' }
}

function normalizeClaimText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeClaim({ subjectKey, subjectLabel = '', predicate, object }) {
  const subject = normalizeClaimText(subjectKey)
  const action = normalizeClaimText(predicate)
  // Literal contents are evidence, not lookup keys: case and internal spacing
  // can distinguish names, passwords and units (mW vs MW).
  const value = String(object ?? '').trim()
  if (!subject || !action || !value) return { ok: false, reason: LEDGER_FAILURE_REASONS.claimInvalid }
  return {
    ok: true,
    claim: {
      subjectKey: subject,
      subjectLabel: String(subjectLabel ?? '').trim(),
      predicate: action,
      object: value
    }
  }
}

export function deriveFactKey(claim) {
  return `fact:${claim.subjectKey}:${claim.predicate}`
}

// Literal objects normalize through the same path, so a rejected literal
// claim suppresses re-proposing the same literal (G-A06).
export function claimFingerprint(scopeKey, claim) {
  return `sha256-${sha256HexOfText(stableStringify([scopeKey, claim.subjectKey, claim.predicate, claim.object]))}`
}

export function payloadHash(payload) {
  return `sha256-${sha256HexOfText(stableStringify(payload))}`
}

export function ledgerId(prefix) {
  return `${prefix}_${randomUUID()}`
}

export function normalizeStoryIntervalInput(input) {
  if (!input || input.precision === 'unknown') return { ok: true, interval: null }
  if (typeof input !== 'object') return { ok: false, reason: LEDGER_FAILURE_REASONS.claimInvalid }
  const timelineId = typeof input.timelineId === 'string' && input.timelineId.trim() ? input.timelineId.trim() : null
  if (!timelineId) return { ok: false, reason: LEDGER_FAILURE_REASONS.claimInvalid }
  const boundary = (value) => {
    if (!value || typeof value !== 'object' || !value.eraId) return null
    const ordinal = Number.isFinite(Number(value.ordinal)) ? Math.floor(Number(value.ordinal)) : null
    return { eraId: String(value.eraId), ordinal }
  }
  const start = boundary(input.start)
  const end = boundary(input.end)
  const endSemantic = ['exclusive', 'open', 'unknown'].includes(input.endSemantic) ? input.endSemantic : 'unknown'
  if (input.start && !start) return { ok: false, reason: LEDGER_FAILURE_REASONS.claimInvalid }
  if (input.end && endSemantic !== 'unknown' && !end) return { ok: false, reason: LEDGER_FAILURE_REASONS.claimInvalid }
  if (!start && !end) return { ok: true, interval: null }
  return { ok: true, interval: { timelineId, start, end, endSemantic } }
}

export function sameInterval(left, right) {
  if (left === right) return true
  if (!left || !right) return false
  return stableStringify(left) === stableStringify(right)
}
