export const MIGRATION_RECORD_STATUSES = Object.freeze([
  'supported',
  'converted',
  'detached',
  'orphaned',
  'rejected'
])

const SHA256 = /^[a-f0-9]{64}$/
const MAX_RECORD_BYTES = 256 * 1024 * 1024
const MAX_TOTAL_BYTES = 256 * 1024 * 1024
const MAX_RECORD_COUNT = 10_000

export function validateLegacyMigrationBundle(input) {
  if (!isPlainObject(input) || input.app !== 'Pinax') return invalid('Migration source is not Pinax')
  const version = Number(input.schemaVersion ?? input.version)
  if ([1, 2].includes(version)) return validateBackupV2(input, version)
  if (version !== 3 || input.kind !== 'desktop-project-migration') {
    return invalid(`Unsupported migration schema: ${Number.isFinite(version) ? version : 'unknown'}`)
  }
  if (!SHA256.test(input.bundleId)
    || !isIsoDate(input.exportedAt)
    || !Number.isSafeInteger(input.recordCount)
    || input.recordCount < 0
    || input.recordCount > MAX_RECORD_COUNT
    || !Array.isArray(input.records)
    || !Array.isArray(input.sourceInventory)
    || input.records.length !== input.recordCount
    || input.sourceInventory.length !== input.recordCount) {
    return invalid('Invalid migration bundle metadata')
  }

  const records = new Map()
  let totalBytes = 0
  for (const record of input.records) {
    if (!validSourceRecord(record, true) || records.has(record.sourceRecordId)) {
      return invalid('Invalid or duplicate migration record')
    }
    totalBytes += record.byteLength
    if (totalBytes > MAX_TOTAL_BYTES) return invalid('Migration bundle exceeds the total byte limit')
    records.set(record.sourceRecordId, record)
  }
  const inventory = new Set()
  for (const item of input.sourceInventory) {
    if (!validSourceRecord(item, false) || inventory.has(item.sourceRecordId)) {
      return invalid('Invalid or duplicate source inventory record')
    }
    const record = records.get(item.sourceRecordId)
    if (!record
      || record.recordType !== item.recordType
      || record.byteLength !== item.byteLength
      || record.sha256 !== item.sha256) {
      return invalid('Source inventory does not match migration records')
    }
    inventory.add(item.sourceRecordId)
  }
  return valid({ format: 'migration-v3', schemaVersion: 3, bundle: input })
}

export function validateMigrationBundlePathInput(input) {
  if (!isPlainObject(input) || !absolutePath(input.bundlePath) || !/\.json$/iu.test(input.bundlePath.trim())) {
    return invalid('An absolute migration bundle JSON path is required')
  }
  return valid({ bundlePath: input.bundlePath.trim() })
}

export function validateLegacyImportInput(input) {
  const bundle = validateMigrationBundlePathInput(input)
  if (!bundle.valid
    || !absolutePath(input?.destinationParentDirectory)
    || !validProjectName(input?.name)
    || (input?.expectedBundleId !== undefined && !SHA256.test(input.expectedBundleId))) {
    return invalid('Migration bundle, destination, and project name are required')
  }
  return valid({
    bundlePath: bundle.value.bundlePath,
    destinationParentDirectory: input.destinationParentDirectory.trim(),
    name: input.name.trim(),
    ...(input.expectedBundleId === undefined ? {} : { expectedBundleId: input.expectedBundleId })
  })
}

export function validateMigrationDryRunTokenInput(input) {
  if (!isPlainObject(input) || !validToken(input.bundleToken)) return invalid('A selected migration bundle token is required')
  return valid({ bundleToken: input.bundleToken })
}

export function validateMigrationImportTokenInput(input) {
  if (!isPlainObject(input)
    || !validToken(input.bundleToken)
    || !validToken(input.destinationToken)
    || !validProjectName(input.name)) {
    return invalid('Selected bundle, destination, and project name are required')
  }
  return valid({
    bundleToken: input.bundleToken,
    destinationToken: input.destinationToken,
    name: input.name.trim()
  })
}

export function validateMigrationReport(input) {
  if (!isPlainObject(input)
    || !SHA256.test(input.bundleId)
    || ![1, 2, 3].includes(Number(input.sourceSchemaVersion))
    || !Number.isSafeInteger(input.total)
    || input.total < 0
    || !isPlainObject(input.counts)
    || !Array.isArray(input.records)) {
    return invalid('Invalid migration report')
  }
  const countTotal = MIGRATION_RECORD_STATUSES.reduce((total, status) => {
    const count = input.counts[status]
    return total + (Number.isSafeInteger(count) && count >= 0 ? count : Number.NaN)
  }, 0)
  if (countTotal !== input.total || input.records.length !== input.total) return invalid('Migration report counts do not match')
  if (input.records.some(record => !isPlainObject(record)
    || !nonEmptyString(record.sourceRecordId)
    || !nonEmptyString(record.recordType)
    || !MIGRATION_RECORD_STATUSES.includes(record.status))) {
    return invalid('Invalid migration report record')
  }
  return valid(input)
}

function validateBackupV2(input, version) {
  if (!isPlainObject(input.keys)
    || Object.values(input.keys).some(value => typeof value !== 'string')) {
    return invalid('Legacy backup keys must contain raw strings')
  }
  const values = Object.values(input.keys)
  if (values.length > MAX_RECORD_COUNT) return invalid('Legacy backup exceeds the record limit')
  let totalBytes = 0
  for (const value of values) {
    totalBytes += new TextEncoder().encode(value).byteLength
    if (totalBytes > MAX_TOTAL_BYTES) return invalid('Legacy backup exceeds the total byte limit')
  }
  return valid({ format: 'backup-v2', schemaVersion: version, bundle: input })
}

function validSourceRecord(record, requireRaw) {
  return isPlainObject(record)
    && nonEmptyString(record.sourceRecordId)
    && record.sourceRecordId.length <= 512
    && nonEmptyString(record.recordType)
    && record.recordType.length <= 128
    && Number.isSafeInteger(record.byteLength)
    && record.byteLength >= 0
    && record.byteLength <= MAX_RECORD_BYTES
    && SHA256.test(record.sha256)
    && (!requireRaw || typeof record.raw === 'string')
}

function absolutePath(value) {
  if (!nonEmptyString(value) || value.includes('\0')) return false
  const path = value.trim()
  if (!(path.startsWith('/') || /^[a-zA-Z]:[\\/]/u.test(path) || path.startsWith('\\\\'))) return false
  return !path.replaceAll('\\', '/').split('/').some(segment => segment === '.' || segment === '..')
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim())
}

function validToken(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,200}$/u.test(value)
}

function validProjectName(value) {
  if (!nonEmptyString(value)) return false
  const name = value.trim()
  const windowsStem = name.split('.')[0].toUpperCase()
  return name.length <= 120
    && !/[<>:"/\\|?*\u0000-\u001f]/u.test(name)
    && !['.', '..'].includes(name)
    && !/[. ]$/u.test(name)
    && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(windowsStem)
}

function isIsoDate(value) {
  if (!nonEmptyString(value)) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function valid(value) {
  return { valid: true, value }
}

function invalid(message) {
  return { valid: false, error: { code: 'DESKTOP_INVALID_INPUT', message } }
}
