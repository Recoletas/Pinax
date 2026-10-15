import assert from 'node:assert/strict'
import { createPublicAccessGuard } from '../server/publicAccessGuard.js'
import { resolveMiniMaxApiKey } from '../shared/textModelKeys.js'

const secret = 'synthetic-proxy-secret-for-local-check-only'
const guard = createPublicAccessGuard({ PINAX_PUBLIC_ORIGINS: 'http://pinax.cc,http://8.148.28.156', PINAX_PROXY_SECRET: secret })
let checks = 0
function check(method, headers, expected) {
  let status = 200
  let passed = false
  guard({ method, get: name => headers[name] }, {
    setHeader() {}, status(value) { status = value; return this }, json() {}
  }, () => { passed = true })
  assert.equal(status, expected)
  assert.equal(passed, expected === 200)
  checks++
}
const ingress = { 'x-pinax-proxy-token': secret }
check('POST', { ...ingress, origin: 'http://pinax.cc' }, 200)
check('POST', { ...ingress, origin: 'http://8.148.28.156' }, 200)
check('POST', { ...ingress, referer: 'http://pinax.cc/authoring' }, 200)
check('POST', { ...ingress, origin: 'http://evil.invalid', referer: 'http://pinax.cc/' }, 403)
check('POST', { ...ingress, origin: 'null' }, 403)
check('POST', { ...ingress, origin: 'http://pinax.cc.evil.invalid' }, 403)
check('POST', { ...ingress, referer: 'http://pinax.cc@evil.invalid/' }, 403)
check('POST', { ...ingress, origin: 'http://pinax.cc', 'sec-fetch-site': 'cross-site' }, 403)
check('POST', ingress, 403)
check('POST', { origin: 'http://pinax.cc' }, 403)
check('GET', {}, 403)
check('GET', ingress, 200)
check('OPTIONS', { ...ingress, origin: 'http://evil.invalid' }, 403)
assert.throws(() => createPublicAccessGuard({ PINAX_PUBLIC_ORIGINS: 'http://pinax.cc' }))
let localPassed = false
createPublicAccessGuard({})({}, {}, () => { localPassed = true })
assert.equal(localPassed, true)
checks += 2
const previous = process.env.MINIMAX_API_KEY
process.env.MINIMAX_API_KEY = 'synthetic-model-key-never-send'
try {
  for (const url of ['https://api.minimaxi.com', 'https://api.minimaxi.com/anthropic', 'https://api.minimax.io/v1', 'https://api.minimax.chat/v1']) {
    assert.equal(resolveMiniMaxApiKey({ baseUrl: url }), process.env.MINIMAX_API_KEY)
    checks++
  }
  for (const url of ['http://api.minimaxi.com', 'https://api.minimaxi.com.evil.invalid/v1', 'https://evil.invalid/minimaxi.com', 'https://api.minimaxi.com@evil.invalid', 'https://evil.invalid/?minimaxi.com', 'https://api.minimaxi.com:444/v1', 'https://user@api.minimaxi.com', 'https://api.minimaxi.com/?redirect=evil', 'https://api.minimaxi.com/#evil', '/minimaxi.com']) {
    for (const apiKey of ['', 'minimax-server-key']) {
      assert.equal(resolveMiniMaxApiKey({ baseUrl: url, apiKey }), '')
      checks += 1
    }
  }
  assert.equal(resolveMiniMaxApiKey({ baseUrl: 'https://custom.invalid', apiKey: 'own-key' }), 'own-key')
  checks++
} finally {
  if (previous === undefined) delete process.env.MINIMAX_API_KEY
  else process.env.MINIMAX_API_KEY = previous
}
console.log(`public-access smoke: ${checks} checks passed; no external model requests`)
