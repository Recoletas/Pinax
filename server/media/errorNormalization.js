/**
 * Unified error normalization for the video job gateway.
 *
 * Maps upstream failures (auth / rate limit / timeout / 4xx / 5xx / unknown / no output)
 * into the contract shape: { code, message, retryable, providerStatus, details }.
 * Redacts secrets in any user-provided detail string before returning.
 */

export const ERROR_CODES = Object.freeze({
  AUTH: 'ERR_PROVIDER_AUTH',
  RATE_LIMIT: 'ERR_PROVIDER_RATE_LIMIT',
  TIMEOUT: 'ERR_PROVIDER_TIMEOUT',
  UPSTREAM_4XX: 'ERR_PROVIDER_BAD_REQUEST',
  UPSTREAM_5XX: 'ERR_PROVIDER_UPSTREAM',
  UNKNOWN: 'ERR_PROVIDER_UNKNOWN',
  NO_OUTPUT: 'ERR_PROVIDER_NO_OUTPUT',
  CANCELLED: 'ERR_PROVIDER_CANCELLED'
})

const REDACT_KEYS = [
  'apiKey', 'api_key', 'authorization', 'token', 'secret',
  'password', 'accessToken', 'access_token', 'bearer'
]

/**
 * @param {unknown} error Anything thrown or returned by an adapter.
 * @returns {{ code: string, message: string, retryable: boolean, providerStatus?: number|null, details?: string|null }}
 */
export function normalizeAdapterError(error) {
  if (!error) {
    return shape(ERROR_CODES.UNKNOWN, 'unknown provider error', false, null, null)
  }

  // Already-normalized error passes through.
  if (typeof error === 'object' && error && error.code && typeof error.code === 'string'
      && Object.values(ERROR_CODES).includes(error.code)) {
    return {
      code: error.code,
      message: String(error.message || error.code),
      retryable: Boolean(error.retryable),
      providerStatus: error.providerStatus ?? null,
      details: redactSecrets(error.details ?? null)
    }
  }

  const providerStatus = extractProviderStatus(error)
  const message = extractMessage(error)

  if (looksLikeAuthError(providerStatus, message)) {
    return shape(ERROR_CODES.AUTH, `认证失败: ${message || 'unauthorized'}`, false, providerStatus, message)
  }
  if (looksLikeRateLimit(providerStatus, message)) {
    return shape(ERROR_CODES.RATE_LIMIT, `触发限流: ${message || 'rate limited'}`, true, providerStatus, message)
  }
  if (looksLikeTimeout(message)) {
    return shape(ERROR_CODES.TIMEOUT, `请求超时: ${message || 'timeout'}`, true, providerStatus, message)
  }
  if (providerStatus === 0) {
    // No response at all (network failure, abort) - retryable.
    return shape(ERROR_CODES.TIMEOUT, `连接失败: ${message || 'no response'}`, true, providerStatus, message)
  }
  if (typeof providerStatus === 'number' && providerStatus >= 400 && providerStatus < 500) {
    return shape(ERROR_CODES.UPSTREAM_4XX, `参数或请求被拒绝 (${providerStatus}): ${message}`, false, providerStatus, message)
  }
  if (typeof providerStatus === 'number' && providerStatus >= 500) {
    return shape(ERROR_CODES.UPSTREAM_5XX, `provider 内部错误 (${providerStatus}): ${message}`, true, providerStatus, message)
  }
  return shape(ERROR_CODES.UNKNOWN, message || 'unknown provider error', false, providerStatus, null)
}

export function buildNoOutputError(message = 'provider 成功但没有返回输出 URL') {
  return shape(ERROR_CODES.NO_OUTPUT, message, true, null, null)
}

export function buildCancelledError() {
  return shape(ERROR_CODES.CANCELLED, '任务已取消', false, null, null)
}

/**
 * Redact secret-looking substrings out of a string. Used for logs and details.
 * Patterns are case-insensitive: `key=value`, `"key":"value"`, `Bearer xyz`.
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function redactSecrets(value) {
  if (value == null) return null
  let str = String(value)
  for (const key of REDACT_KEYS) {
    // `key=value` and `"key":"value"` and `'key':'value'` up to whitespace / quote / comma.
    const pattern = new RegExp(
      `(["']?${escapeRegex(key)}["']?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;}]+)`,
      'gi'
    )
    str = str.replace(pattern, (_match, prefix, secret) => {
      const quoted = secret.startsWith('"') || secret.startsWith("'")
      const display = quoted ? secret[0] + '<redacted>' + secret[0] : '<redacted>'
      return prefix + display
    })
    // `Bearer xyz`
    str = str.replace(new RegExp(`(Bearer\\s+)[A-Za-z0-9._\\-]+`, 'gi'), '$1<redacted>')
  }
  return str
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shape(code, message, retryable, providerStatus, details) {
  return {
    code,
    message: String(message || code),
    retryable: Boolean(retryable),
    providerStatus: typeof providerStatus === 'number' ? providerStatus : null,
    details: redactSecrets(details)
  }
}

function extractProviderStatus(error) {
  if (!error || typeof error !== 'object') return null
  const candidates = ['status', 'statusCode', 'providerStatus', 'response?.status']
  for (const key of candidates) {
    const value = readPath(error, key)
    if (typeof value === 'number') return value
  }
  return null
}

function extractMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error.message === 'string') return error.message
  try {
    return JSON.stringify(error).slice(0, 500)
  } catch {
    return ''
  }
}

function readPath(obj, path) {
  return String(path).split('.').filter(Boolean).reduce((acc, key) => {
    if (acc == null) return undefined
    return acc[key]
  }, obj)
}

function looksLikeAuthError(status, message) {
  if (status === 401 || status === 403) return true
  return /(auth|unauthor|forbidden|api[_\- ]?key|invalid[_\- ]?token)/i.test(message || '')
}

function looksLikeRateLimit(status, message) {
  if (status === 429) return true
  return /(rate[_\- ]?limit|too many|quota)/i.test(message || '')
}

function looksLikeTimeout(message) {
  return /(timeout|timed[_\- ]?out|etimedout|econnreset|econnrefused|abort)/i.test(message || '')
}