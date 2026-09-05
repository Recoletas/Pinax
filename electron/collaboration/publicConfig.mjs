export function resolveDesktopCollaborationConfig (env = {}) {
  if (env.PINAX_COLLABORATION_ENABLED !== 'true') return Object.freeze({ enabled: false, relayEndpoint: null, features: [] })
  let endpoint
  try { endpoint = new URL(env.PINAX_COLLABORATION_RELAY || '') } catch { throw new Error('invalid-public-collaboration-relay') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  if (!['https:', 'wss:'].includes(endpoint.protocol) && !(local && ['http:', 'ws:'].includes(endpoint.protocol))) throw new Error('public-collaboration-relay-must-be-secure')
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('public-collaboration-relay-must-not-contain-secrets')
  return Object.freeze({ enabled: true, relayEndpoint: endpoint.toString().replace(/\/$/, ''), features: Object.freeze(['remote-relay-v2', 'aes-gcm-content-v1']) })
}
