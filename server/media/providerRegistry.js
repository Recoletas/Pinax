/**
 * Provider registry for video adapters.
 *
 * - Registers adapter instances keyed by providerId.
 * - Exposes public-safe capability metadata (NEVER includes apiKey/secret/token).
 * - Validates config against each adapter's declared shape.
 */

const SECRET_FIELDS = ['apiKey', 'api_key', 'token', 'secret', 'authorization', 'accessToken', 'access_token', 'password']

export function createProviderRegistry(options = {}) {
  const log = options.logger || console
  /** @type {Map<string, { id: string, adapter: object, label: string, capabilities: object, publicConfigKeys: string[] }>} */
  const providers = new Map()

  function register(provider) {
    if (!provider || typeof provider !== 'object') throw new Error('provider must be an object')
    const { id, adapter, label, capabilities, publicConfigKeys } = provider
    if (!id) throw new Error('provider.id is required')
    if (!adapter || typeof adapter.testConnection !== 'function') {
      throw new Error(`provider ${id} missing adapter.testConnection`)
    }
    if (typeof adapter.submit !== 'function' || typeof adapter.poll !== 'function'
        || typeof adapter.cancel !== 'function' || typeof adapter.normalizeError !== 'function'
        || typeof adapter.getCapabilities !== 'function') {
      throw new Error(`provider ${id} adapter does not implement the required interface`)
    }
    const safePublicKeys = Array.isArray(publicConfigKeys) ? publicConfigKeys.slice() : []
    providers.set(id, {
      id,
      adapter,
      label: label || id,
      capabilities: capabilities || {},
      publicConfigKeys: safePublicKeys
    })
    log?.info?.(`[media] registered provider ${id}`)
  }

  function get(id) {
    return providers.get(id) || null
  }

  function getAdapter(id) {
    return providers.get(id)?.adapter || null
  }

  /**
   * Returns public-safe metadata for the frontend. NEVER includes secret fields.
   * @returns {Array<{id: string, label: string, capabilities: object, configKeys: Array<{key: string, secret: boolean, label: string}>}>}
   */
  function listPublic() {
    const out = []
    for (const entry of providers.values()) {
      out.push({
        id: entry.id,
        label: entry.label,
        capabilities: entry.capabilities,
        configKeys: entry.publicConfigKeys.map((key) => ({
          key,
          secret: isSecretField(key),
          label: humanizeLabel(key)
        }))
      })
    }
    return out
  }

  /**
   * Validate a config payload against a provider's declared publicConfigKeys.
   * Strips secret fields before logging any errors.
   * @returns {{ ok: true, sanitized: object } | { ok: false, error: { code: string, message: string } }}
   */
  function validateConfig(providerId, config = {}) {
    const entry = providers.get(providerId)
    if (!entry) {
      return { ok: false, error: { code: 'ERR_PROVIDER_UNKNOWN', message: `unknown provider: ${providerId}` } }
    }
    const configObj = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
    const required = entry.publicConfigKeys.filter((k) => !k.startsWith('?'))
    const missing = required.filter((k) => !configObj[k] || (typeof configObj[k] === 'string' && !configObj[k].trim()))
    if (missing.length) {
      return {
        ok: false,
        error: {
          code: 'ERR_PROVIDER_CONFIG_MISSING',
          message: `缺少 provider 必填字段: ${missing.join(', ')}`
        }
      }
    }
    return { ok: true, sanitized: configObj }
  }

  /**
   * Strip secret fields before logging. Public-callable for tests.
   */
  function redactConfig(config = {}) {
    const out = {}
    for (const [k, v] of Object.entries(config)) {
      out[k] = isSecretField(k) ? '<redacted>' : v
    }
    return out
  }

  function clear() {
    providers.clear()
  }

  return { register, get, getAdapter, listPublic, validateConfig, redactConfig, clear }
}

export function isSecretField(key) {
  return SECRET_FIELDS.includes(String(key || '').trim())
}

function humanizeLabel(key) {
  return String(key)
    .replace(/[_\-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}