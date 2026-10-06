#!/usr/bin/env node
// 统一模型漏斗确定性 smoke：门控判定（serverKeyed vs 自定义）+ kit 代理路由门（公网 403）。
// 不打真实模型；转发协议由 kit 侧 pinax-model-funnel.test.ts 钉住。
// 运行：node scripts/local-funnel-check.mjs
import assert from 'node:assert/strict'
// 指向死端口：可用性探测断言（不可达→false）不依赖本机任务面是否在跑
process.env.PINAX_ADAPTER_ENDPOINT = 'http://127.0.0.1:1'
const { isServerKeyedTextConfig, kitFunnelAvailable, invalidateKitFunnelCache } = await import('../server/services/kitModelGateway.js')
const { createStoryAgentRouter } = await import('../server/routes/storyagent.js')

let passed = 0
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  ✓ ${name}`) }

console.log('[1] serverKeyed 门控：内置哨兵/官方域 → 漏斗；自定义 key → 直连')
check('内置配置（哨兵 key + minimaxi 官方域）→ 漏斗', isServerKeyedTextConfig({ baseUrl: 'https://api.minimaxi.com/anthropic', apiKey: 'minimax-server-key' }))
check('空 key + minimaxi v1 → 漏斗', isServerKeyedTextConfig({ baseUrl: 'https://api.minimaxi.com/v1', apiKey: '' }))
check('自定义 key → 不走漏斗', !isServerKeyedTextConfig({ baseUrl: 'https://api.minimaxi.com/v1', apiKey: 'sk-user-own' }))
check('哨兵 key + 非官方域 → 不走漏斗（sentinel 不注入）', !isServerKeyedTextConfig({ baseUrl: 'https://example.com/v1', apiKey: 'minimax-server-key' }))
check('带端口/路径参数的 minimax 域 → 不走漏斗', !isServerKeyedTextConfig({ baseUrl: 'https://api.minimaxi.com:8443/v1', apiKey: '' }))
check('非法 URL → 不走漏斗', !isServerKeyedTextConfig({ baseUrl: 'not-a-url', apiKey: '' }))

console.log('[2] 可用性探测：任务面不可达时 fail-open（false，调用方回落直连）')
invalidateKitFunnelCache()
const unavailable = await kitFunnelAvailable({ force: true })
check('不可达 → false（不抛错）', unavailable === false)

console.log('[3] /model 代理路由：公网部署 403 闸（经 router.use 中间件 + 注入 fetchImpl）')
process.env.PINAX_PUBLIC_ORIGINS = 'https://example.com'
const forwards = []
const streamOf = (payload) => new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(payload))); controller.close() } })
const fakeFetch = async (url, init) => {
  forwards.push({ url: String(url), body: JSON.parse(init.body) })
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, body: streamOf({ ok: true, model: 'x.y' }), json: async () => ({ ok: true, model: 'x.y' }) }
}
const router = createStoryAgentRouter({ fetchImpl: fakeFetch })
const middleware = router.stack.find((item) => item.name === 'middleware' || item.route === undefined)?.handle || router.stack[0].handle
const fakeRes = () => ({
  code: 0,
  body: null,
  destroyed: false,
  writableEnded: false,
  status(code) { this.code = code; return this },
  setHeader() { return this },
  on() { return this },
  once() { return this },
  removeListener() { return this },
  json(body) { this.body = body; responses.push({ code: this.code, body }); return this },
  write() { return true },
  end() { this.ended = true; return this }
})
const responses = []
const run = (method, path, body) => middleware({ path, method, get: () => 'a'.repeat(64), body }, fakeRes(), () => {})

process.env.PINAX_PUBLIC_ORIGINS = 'https://example.com'
await run('POST', '/model', { model: 'x' })
delete process.env.PINAX_PUBLIC_ORIGINS
check('公网部署下 POST /model → 403 ERR_LOCAL_ONLY（且未转发上游）', responses[0]?.code === 403 && responses[0]?.body.error === 'ERR_LOCAL_ONLY' && forwards.length === 0)

console.log('[4] 公网闸解除后 /model 转发上游')
responses.length = 0
await run('POST', '/model', { model: 'x.y' })
check('正常部署 → 转发 /model 到任务面（透传协议由 storyagent-integration-smoke 覆盖）', forwards[0]?.url.endsWith('/model') && responses[0]?.code !== 403)

console.log(`local-funnel-check: ${passed} 项全部通过`)
