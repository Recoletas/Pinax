export const DESKTOP_PROJECT_SCHEMA_VERSION = 1
export const DESKTOP_DATABASE_SCHEMA_VERSION = 2
export const DESKTOP_DEFAULT_CACHE_LIMIT = 1024 ** 3
export const DESKTOP_MIN_CACHE_LIMIT = 64 * 1024 ** 2
export const DESKTOP_MAX_CACHE_LIMIT = 100 * 1024 ** 3

export const DESKTOP_ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'DESKTOP_INVALID_INPUT',
  PROJECT_NOT_OPEN: 'DESKTOP_PROJECT_NOT_OPEN',
  PROJECT_LOCKED: 'DESKTOP_PROJECT_LOCKED',
  PATH_OUTSIDE_PROJECT: 'DESKTOP_PATH_OUTSIDE_PROJECT',
  STALE_REVISION: 'DESKTOP_STALE_REVISION',
  INTEGRITY_FAILED: 'DESKTOP_INTEGRITY_FAILED',
  IO_FAILED: 'DESKTOP_IO_FAILED'
})

const BLOCKED_DETAIL_KEYS = new Set([
  'content',
  'manuscript',
  'prompt',
  'reasoning',
  'response',
  'secret',
  'sql',
  'stack',
  'text',
  'token'
])

export function validateProjectManifest(input) {
  if (!isPlainObject(input)
    || input.schemaVersion !== DESKTOP_PROJECT_SCHEMA_VERSION
    || !nonEmptyString(input.projectId)
    || !validProjectName(input.name)
    || !isIsoDate(input.createdAt)
    || !isIsoDate(input.updatedAt)) {
    return invalid('Invalid desktop project manifest')
  }

  return valid({
    schemaVersion: DESKTOP_PROJECT_SCHEMA_VERSION,
    projectId: input.projectId.trim(),
    name: input.name.trim(),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  })
}

export function validateCreateProjectInput(input) {
  if (!isPlainObject(input) || !nonEmptyString(input.directory) || !validProjectName(input.name)) {
    return invalid('Project directory and name are required')
  }
  return valid({ directory: input.directory.trim(), name: input.name.trim() })
}

export function validateOpenProjectInput(input) {
  if (!isPlainObject(input)
    || !nonEmptyString(input.directory)
    || !['read-write', 'read-only'].includes(input.mode)) {
    return invalid('Project directory and a supported open mode are required')
  }
  return valid({ directory: input.directory.trim(), mode: input.mode })
}

export function validateRelativeProjectPath(input) {
  if (!nonEmptyString(input) || input.includes('\0')) return invalid('Invalid project path')
  const normalized = input.trim().replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized
    || normalized.startsWith('/')
    || /^[a-zA-Z]:\//.test(normalized)
    || normalized.split('/').some((part) => !part || part === '.' || part === '..')
    || normalized.startsWith('.pinax/')
    || !/^(manuscript|reference)\/.+\.txt$/u.test(normalized)) {
    return invalid('Path must name a contained manuscript or reference text file')
  }
  return valid(normalized)
}

export function validateWriteTextInput(input) {
  if (!isPlainObject(input)
    || !nonEmptyString(input.itemId)
    || !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision < 0
    || typeof input.text !== 'string') {
    return invalid('Invalid revision-checked text write')
  }
  const relativePath = validateRelativeProjectPath(input.relativePath)
  if (!relativePath.valid) return relativePath
  return valid({
    itemId: input.itemId.trim(),
    relativePath: relativePath.value,
    expectedRevision: input.expectedRevision,
    text: input.text
  })
}

export function validateCacheLimitInput(input) {
  const bytes = input?.bytes
  if (!Number.isSafeInteger(bytes)
    || bytes < DESKTOP_MIN_CACHE_LIMIT
    || bytes > DESKTOP_MAX_CACHE_LIMIT) {
    return invalid('Cache limit is outside the supported range')
  }
  return valid({ bytes })
}

export function success(value) {
  return { ok: true, value }
}

export function failure(code, message, details) {
  const error = {
    code: Object.values(DESKTOP_ERROR_CODES).includes(code) ? code : DESKTOP_ERROR_CODES.IO_FAILED,
    message: nonEmptyString(message) ? message.trim() : 'Desktop operation failed'
  }
  const safeDetails = sanitizeDetails(details)
  if (safeDetails && Object.keys(safeDetails).length) error.details = safeDetails
  return { ok: false, error }
}

function valid(value) {
  return { valid: true, value }
}

function invalid(message) {
  return {
    valid: false,
    error: {
      code: DESKTOP_ERROR_CODES.INVALID_INPUT,
      message
    }
  }
}

function sanitizeDetails(details) {
  if (!isPlainObject(details)) return null
  return Object.fromEntries(Object.entries(details)
    .filter(([key, value]) => !BLOCKED_DETAIL_KEYS.has(key.toLowerCase()) && isSerializableDetail(value)))
}

function isSerializableDetail(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isSerializableDetail)
  if (isPlainObject(value)) return Object.values(value).every(isSerializableDetail)
  return false
}

function nonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim())
}

function validProjectName(value) {
  return nonEmptyString(value) && value.trim().length <= 120
}

function isIsoDate(value) {
  if (!nonEmptyString(value)) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
