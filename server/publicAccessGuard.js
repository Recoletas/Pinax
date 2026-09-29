import { timingSafeEqual, createHash } from 'node:crypto'

// Optional for self-hosted/local use. Public deployments enable both settings.
// This is an origin/ingress guard, not user authentication: headers can be replayed.
export function createPublicAccessGuard(env = process.env) {
  const origins = new Set(String(env.PINAX_PUBLIC_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean))
  const secret = String(env.PINAX_PROXY_SECRET || '')
  if (!origins.size && !secret) return (_req, _res, next) => next()
  if (!origins.size || secret.length < 32) throw new Error('Public access guard requires origins and a strong proxy secret')
  const digest = value => createHash('sha256').update(value).digest()
  const expected = digest(secret)
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    const supplied = String(req.get('x-pinax-proxy-token') || '')
    if (!timingSafeEqual(expected, digest(supplied))) {
      return res.status(403).json({ error: 'PUBLIC_INGRESS_REQUIRED', message: '请通过 Pinax 网站访问。' })
    }
    const origin = req.get('origin')
    let refererOrigin = ''
    try { refererOrigin = new URL(req.get('referer')).origin } catch { /* No valid referrer. */ }
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    if ((origin && !origins.has(origin))
      || (unsafe && !origins.has(origin || refererOrigin))
      || req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({ error: 'PUBLIC_ORIGIN_REQUIRED', message: '请在 Pinax 网站中使用此功能。' })
    }
    next()
  }
}
