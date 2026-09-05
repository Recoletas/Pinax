const HTTP_PROTOCOLS = new Set(['http:', 'https:'])
const WS_PROTOCOLS = new Set(['ws:', 'wss:'])
export const COLLABORATION_INVITE_ROUTE_PATH = 'experience/online/:roomSlug?'
export const AUTHORING_REHEARSAL_INVITE_ROUTE_PATH = 'collaboration/review/:roomSlug?'

export function validatePublicRelayEndpoint (value, { allowInsecureLocalhost = true } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('collaboration-endpoint-required')
  let url
  try { url = new URL(value) } catch { throw new TypeError('collaboration-endpoint-invalid') }
  if (![...HTTP_PROTOCOLS, ...WS_PROTOCOLS].includes(url.protocol)) throw new TypeError('collaboration-endpoint-protocol')
  if (url.username || url.password || url.search || url.hash) throw new TypeError('collaboration-endpoint-must-not-contain-credentials-or-secrets')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!['https:', 'wss:'].includes(url.protocol) && !(allowInsecureLocalhost && local)) throw new TypeError('collaboration-endpoint-must-be-secure')
  url.pathname = url.pathname.replace(/\/$/, '')
  return url.toString().replace(/\/$/, '')
}

export function resolveCollaborationEndpoints ({ override, locationLike, desktopConfig } = {}) {
  if (desktopConfig && desktopConfig.enabled !== true) throw new TypeError('collaboration-disabled')
  const configured = desktopConfig?.relayEndpoint || override
  if (locationLike?.protocol === 'file:' && !configured) throw new TypeError('desktop-collaboration-config-required')
  const base = configured
    ? validatePublicRelayEndpoint(configured)
    : validatePublicRelayEndpoint(locationLike?.origin || `${locationLike?.protocol}//${locationLike?.host}`)
  const url = new URL(base)
  const httpProtocol = WS_PROTOCOLS.has(url.protocol) ? (url.protocol === 'wss:' ? 'https:' : 'http:') : url.protocol
  const wsProtocol = HTTP_PROTOCOLS.has(url.protocol) ? (url.protocol === 'https:' ? 'wss:' : 'ws:') : url.protocol
  const basePath = url.pathname.replace(/\/$/, '')
  return Object.freeze({
    enabled: desktopConfig?.enabled !== false,
    httpBaseUrl: `${httpProtocol}//${url.host}${basePath}`,
    wsUrl: `${wsProtocol}//${url.host}${basePath}/ws/collaboration`
  })
}

export function buildCollaborationInviteUrl (baseUrl, { roomSlug, inviteId, inviteSecret, contentKey }) {
  if (![roomSlug, inviteId, inviteSecret].every(value => typeof value === 'string' && value.trim())) throw new TypeError('collaboration-invite-fields-required')
  const url = new URL(`/experience/online/${encodeURIComponent(roomSlug)}`, baseUrl)
  url.hash = new URLSearchParams({ invite: inviteId, secret: inviteSecret, ...(contentKey ? { contentKey } : {}) }).toString()
  return url.toString()
}

export function buildAuthoringRehearsalInviteUrl (baseUrl, { roomSlug, inviteId, inviteSecret, contentKey }) {
  if (![roomSlug, inviteId, inviteSecret, contentKey].every(value => typeof value === 'string' && value.trim())) throw new TypeError('collaboration-invite-fields-required')
  const url = new URL(`/collaboration/review/${encodeURIComponent(roomSlug)}`, baseUrl)
  url.hash = new URLSearchParams({ invite: inviteId, secret: inviteSecret, contentKey }).toString()
  return url.toString()
}

export function parseCollaborationInviteUrl (rawUrl) {
  const url = new URL(rawUrl)
  const fragment = new URLSearchParams(url.hash.slice(1)); const contentKey = fragment.get('contentKey') || null
  url.hash = ''
  const parts = url.pathname.split('/').filter(Boolean)
  const onlineIndex = parts.findIndex((part, index) => part === 'experience' && parts[index + 1] === 'online')
  if (onlineIndex < 0 || !parts[onlineIndex + 2]) throw new TypeError('collaboration-invite-route-invalid')
  return { endpointUrl: url.toString(), roomSlug: decodeURIComponent(parts[onlineIndex + 2]), inviteId: fragment.get('invite'), inviteSecret: fragment.get('secret'), contentKey }
}

export function parseAuthoringRehearsalInviteUrl (rawUrl) {
  const url = new URL(rawUrl)
  const fragment = new URLSearchParams(url.hash.slice(1))
  url.hash = ''
  const parts = url.pathname.split('/').filter(Boolean)
  const reviewIndex = parts.findIndex((part, index) => part === 'collaboration' && parts[index + 1] === 'review')
  if (reviewIndex < 0 || !parts[reviewIndex + 2]) throw new TypeError('collaboration-invite-route-invalid')
  const inviteId = fragment.get('invite')
  const inviteSecret = fragment.get('secret')
  const contentKey = fragment.get('contentKey')
  if (![inviteId, inviteSecret, contentKey].every(value => typeof value === 'string' && value.trim())) throw new TypeError('collaboration-invite-fields-required')
  return { endpointUrl: url.toString(), roomSlug: decodeURIComponent(parts[reviewIndex + 2]), inviteId, inviteSecret, contentKey }
}

export function scrubCollaborationInviteFragment ({ locationLike = globalThis.location, historyLike = globalThis.history } = {}) {
  const capturedHref = locationLike.href
  historyLike.replaceState(historyLike.state ?? null, '', `${locationLike.pathname}${locationLike.search}`)
  return parseCollaborationInviteUrl(capturedHref)
}

export function scrubAuthoringRehearsalInviteFragment ({ locationLike = globalThis.location, historyLike = globalThis.history } = {}) {
  const capturedHref = locationLike.href
  historyLike.replaceState(historyLike.state ?? null, '', `${locationLike.pathname}${locationLike.search}`)
  return parseAuthoringRehearsalInviteUrl(capturedHref)
}

export async function resolveRendererCollaborationEndpoints ({ windowLike = globalThis.window, locationLike = windowLike?.location, endpointOverride } = {}) {
  if (locationLike?.protocol !== 'file:') return resolveCollaborationEndpoints({ override: endpointOverride, locationLike })
  const getPublicConfig = windowLike?.pinaxDesktop?.collaboration?.getPublicConfig
  if (typeof getPublicConfig !== 'function') throw new TypeError('desktop-collaboration-bridge-required')
  const desktopConfig = await getPublicConfig()
  return resolveCollaborationEndpoints({ desktopConfig, locationLike })
}
