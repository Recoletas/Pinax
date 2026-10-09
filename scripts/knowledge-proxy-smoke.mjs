#!/usr/bin/env node
// 知识检索代理离线冒烟（W1-A，零 npm 依赖）：8431 用本文件内的 http 桩顶替（端口吃
// PINAX_KIT_PROTOCOL_PORT 覆写，缺省 18431——不依赖真 kit 在跑），按 failopen-drill 先例
// 拉起真 Pinax server 进程（node server/index.js，PINAX_STORYAGENT_ENABLED=0 隔离任务面），
// 隔离注册表（PINAX_APP_DATA / PINAX_MIRROR_ROOT 指临时目录）后打路由断言：
//   [1] worldbook-search：verb/args 转发正确；location 恒由注册表 rootPath 推导
//      （请求体伪造 location 被忽略）；kit 响应形状原样透传（前端/代理不重算）
//   [2] junction 幂等：kit 对已挂载 pid 回 409（真 serve.ts 形状）→ 代理剥 location 重发
//   [3] kb-search / kb-read：无 location 转发；maxChars → max_chars 参数映射（kit 形参名）
//   [4] 入参校验：projectId 形状 / q 非空 / 未注册项目 404（伪造 location 不触桩）
//   [5] 显式失败：8431 不可达 → 503 KIT_PROTOCOL_PLANE_UNAVAILABLE（含启动指引）；
//       8431 挂起 → 总超时同码，不冒充空结果
//   [6] 只读纪律：全程桩收到的 verb ⊆ KNOWLEDGE_READ_VERBS
// 运行：node scripts/knowledge-proxy-smoke.mjs
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KNOWLEDGE_READ_VERBS, KIT_PROTOCOL_PLANE_PORT_ENV, resolveKitProtocolPlaneEndpoint } from '../shared/kitProtocolPlane.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STUB_PORT = Number(process.env[KIT_PROTOCOL_PLANE_PORT_ENV]) || 18431
const SERVER_PORT = 18441
const STUB_ENDPOINT = resolveKitProtocolPlaneEndpoint({ [KIT_PROTOCOL_PLANE_PORT_ENV]: String(STUB_PORT) })
const BASE = `http://127.0.0.1:${SERVER_PORT}`

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) { failures += 1; if (detail !== undefined) console.error('  detail:', String(detail).slice(0, 500)) }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

// kit worldbook_search 返回形状（kit/core/src/kernel-view.ts worldbookSearch，活体实测同形）
const WORLDBOOK_SEARCH_RESULT = {
  query: '豹子头',
  cat: '人物',
  graph: { format: 'worldbook-graph@1', built_at: '2026-10-09T00:00:00.000Z', entries: 3, relations: 2 },
  hits: [{
    id: 'ch_linchong', title: '豹子头林冲', cat: 'character', status: 'stable',
    path: '世界书/人物/林冲.md', summary: '八十万禁军枪棒教头，遭高俅陷害刺配沧州。', score: 14,
    relations: [{ with: 'loc_cangzhou', title: '沧州牢城', weight: 9, src: '第3回 刺配' }]
  }],
  expansion: [
    { id: 'loc_cangzhou', title: '沧州牢城', cat: 'location', via: 'loc_cangzhou', weight: 9, from: 'ch_linchong' },
    { id: 'org_kaifeng', title: '开封府', cat: 'organization', via: 'org_kaifeng', weight: 7, from: 'ch_linchong' }
  ]
}
const KB_SEARCH_RESULT = {
  query: '节奏', dir: 'craft',
  hits: [{ id: 'kb/craft/pacing', title: '节奏标尺', score: 12, summary: '三幕拍点…' }],
  expansion: []
}
const KB_READ_RESULT = { file: 'craft/pacing.md', content: '---\nid: kb/craft/pacing\n---\n三幕拍点：……（截断标记内嵌在 content）' }

// ---- 8431 桩：最小复刻 kit/storyharness/src/serve.ts 的 /api/kernel-verb + /api/hub ----
const allRequests = [] // 跨桩实例累计（显式失败段会换桩重开端口）
function createStub({ hangOnQuery = '' } = {}) {
  const mounted = new Set()
  const requests = []
  const server = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0]
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (url === '/api/hub') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ workspace: 'stub-workspace', version: '0.0.0-stub' }))
        return
      }
      if (url !== '/api/kernel-verb' || req.method !== 'POST') {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'stub: not found' }))
        return
      }
      let body = {}
      try { body = JSON.parse(raw || '{}') } catch { /* 与真面同：坏 JSON 视为空 */ }
      const record = { verb: body.verb, args: body.args, location: body.location }
      // location junction 挂载：pid 正则 / 已存在 409 / 目录必须存在（kit serve.ts 同序）
      if (body.location) {
        const pid = String(body.args?.project ?? '').trim()
        if (!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(pid)) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'project id 非法' }))
          return
        }
        if (!existsSync(String(body.location))) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: '位置不存在：' + body.location }))
          return
        }
        if (mounted.has(pid)) {
          res.writeHead(409, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'projects/ 下已存在同名项目' }))
          return
        }
        mounted.add(pid)
      }
      const allow = new Set(['flow_init', 'flow_run', 'flow_next', 'flow_effect', 'kb_search', 'kb_read', 'worldbook_search'])
      if (!body.verb || !allow.has(body.verb)) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'verb 不在白名单' }))
        return
      }
      if (hangOnQuery && body.args?.q === hangOnQuery) return // 挂起不回，触发代理总超时
      requests.push(record)
      allRequests.push(record)
      const result = body.verb === 'worldbook_search' ? WORLDBOOK_SEARCH_RESULT
        : body.verb === 'kb_search' ? KB_SEARCH_RESULT
          : KB_READ_RESULT
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(result))
    })
  })
  return {
    server,
    requests,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(STUB_PORT, '127.0.0.1', () => resolve())
    }),
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}

// ---- 隔离注册表：PINAX_APP_DATA 指临时目录 + fixture 项目（projectId → rootPath） ----
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-knowledge-smoke-'))
const appDataDir = path.join(tmpRoot, 'appdata')
const fixtureRoot = path.join(tmpRoot, 'fixture-root')
fs.mkdirSync(appDataDir, { recursive: true })
fs.mkdirSync(fixtureRoot, { recursive: true })
fs.writeFileSync(path.join(appDataDir, 'projects.registry.json'), JSON.stringify({
  projects: [{ projectId: 'proj_fixture1', bookId: 'book_fixture1', name: '冒烟项目', kind: 'novel', rootPath: fixtureRoot, lastOpenedAt: '2026-10-09T00:00:00.000Z', lastSyncAt: null }]
}, null, 2))

// ---- 真 Pinax server 进程（failopen-drill 惯例：spawn + 就绪轮询 + 日志收集） ----
let child = null
const serverLog = []
async function startPinaxServer() {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      PINAX_APP_DATA: appDataDir,
      PINAX_MIRROR_ROOT: path.join(tmpRoot, 'mirror'),
      PINAX_STORYAGENT_ENABLED: '0',
      [KIT_PROTOCOL_PLANE_PORT_ENV]: String(STUB_PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const collect = (stream) => stream.on('data', (data) => serverLog.push(String(data)))
  collect(child.stdout)
  collect(child.stderr)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await fetch(`${BASE}/api/localmirror/projects`, { signal: AbortSignal.timeout(1500) }).then(() => true).catch(() => false)
    if (ready) return true
    if (child.exitCode !== null) return false
    await sleep(500)
  }
  return false
}
async function stopPinaxServer() {
  if (!child || child.exitCode !== null) return
  child.kill()
  for (let waited = 0; waited < 5000 && child.exitCode === null; waited += 200) await sleep(200)
  if (child.exitCode === null) child.kill('SIGKILL')
}

let stub = null
try {
  stub = createStub()
  await stub.listen()
  check(`[boot] 8431 桩就绪 ${STUB_ENDPOINT}（${KIT_PROTOCOL_PLANE_PORT_ENV}=${STUB_PORT}）`, true)
  const serverReady = await startPinaxServer()
  check(`[boot] Pinax server 就绪 ${BASE}（隔离注册表 ${appDataDir}）`, serverReady, serverLog.join('').slice(-800))
  if (!serverReady) throw new Error('Pinax server 未就绪')

  console.log('\n[1] worldbook-search：转发 + location 注册表推导 + 形状透传')
  const forged = await postJson(`${BASE}/api/knowledge/worldbook-search`, {
    projectId: 'proj_fixture1', q: '豹子头', cat: '人物', k: 3,
    location: 'D:\\forged\\browser\\must-be-ignored', projectId2: 'x'
  })
  check('HTTP 200 且响应 === kit 形状（原样透传）', forged.status === 200 && JSON.stringify(forged.body) === JSON.stringify(WORLDBOOK_SEARCH_RESULT), JSON.stringify(forged.body).slice(0, 300))
  const first = stub.requests.at(-1)
  check('桩收到 verb=worldbook_search', first?.verb === 'worldbook_search', JSON.stringify(first))
  check('args = {project, q, cat, k} 且取自请求体合法字段', first?.args?.project === 'proj_fixture1' && first?.args?.q === '豹子头' && first?.args?.cat === '人物' && first?.args?.k === 3, JSON.stringify(first?.args))
  check('location == 注册表 rootPath（伪造 location 被忽略）', first?.location === fixtureRoot, `sent=${first?.location} expected=${fixtureRoot}`)
  check('请求体多余字段（projectId2）不进入 args', !('projectId2' in (first?.args || {})))

  console.log('\n[2] junction 幂等：kit 409（已挂载）→ 代理剥 location 重发')
  const second = await postJson(`${BASE}/api/knowledge/worldbook-search`, { projectId: 'proj_fixture1', q: '豹子头' })
  check('HTTP 200 且仍为 kit 形状', second.status === 200 && JSON.stringify(second.body) === JSON.stringify(WORLDBOOK_SEARCH_RESULT), JSON.stringify(second.body).slice(0, 200))
  const retry = stub.requests.at(-1)
  check('重发请求不再携带 location（续用既有挂载）', retry?.location === undefined && retry?.verb === 'worldbook_search', JSON.stringify(retry))

  console.log('\n[3] kb-search / kb-read：无 location 转发 + maxChars → max_chars')
  const kbSearch = await postJson(`${BASE}/api/knowledge/kb-search`, { q: '节奏', dir: 'craft', k: 2 })
  check('kb-search HTTP 200 且形状透传', kbSearch.status === 200 && JSON.stringify(kbSearch.body) === JSON.stringify(KB_SEARCH_RESULT), JSON.stringify(kbSearch.body))
  const kbSearchCall = stub.requests.at(-1)
  check('kb-search 转发 {verb, args:{q,dir,k}} 且无 location', kbSearchCall?.verb === 'kb_search' && kbSearchCall?.args?.q === '节奏' && kbSearchCall?.args?.dir === 'craft' && kbSearchCall?.args?.k === 2 && kbSearchCall?.location === undefined, JSON.stringify(kbSearchCall))
  const kbRead = await postJson(`${BASE}/api/knowledge/kb-read`, { ref: 'kb/craft/pacing', maxChars: 999 })
  check('kb-read HTTP 200 且形状透传', kbRead.status === 200 && JSON.stringify(kbRead.body) === JSON.stringify(KB_READ_RESULT), JSON.stringify(kbRead.body))
  const kbReadCall = stub.requests.at(-1)
  check('kb-read 转发 maxChars → args.max_chars（kit 形参名）', kbReadCall?.verb === 'kb_read' && kbReadCall?.args?.ref === 'kb/craft/pacing' && kbReadCall?.args?.max_chars === 999 && kbReadCall?.location === undefined, JSON.stringify(kbReadCall))

  console.log('\n[4] 入参校验：形状 / 空词 / 未注册项目')
  const badId = await postJson(`${BASE}/api/knowledge/worldbook-search`, { projectId: 'evil;drop', q: 'x' })
  check('projectId 非 proj_ 形状 → 400 INVALID_PROJECT_ID', badId.status === 400 && badId.body?.error?.code === 'INVALID_PROJECT_ID', JSON.stringify(badId.body))
  const emptyQ = await postJson(`${BASE}/api/knowledge/worldbook-search`, { projectId: 'proj_fixture1', q: '   ' })
  check('空 q → 400 INVALID_QUERY', emptyQ.status === 400 && emptyQ.body?.error?.code === 'INVALID_QUERY', JSON.stringify(emptyQ.body))
  const missingProject = await postJson(`${BASE}/api/knowledge/worldbook-search`, { projectId: 'proj_missing0', q: 'x', location: 'D:\\also-forged' })
  check('未注册项目 → 404 PROJECT_NOT_REGISTERED（注册表推导唯一来源）', missingProject.status === 404 && missingProject.body?.error?.code === 'PROJECT_NOT_REGISTERED', JSON.stringify(missingProject.body))
  check('未注册项目的伪造 location 未触桩（桩请求数不变）', stub.requests.every((r) => r.args?.project !== 'proj_missing0'))
  const emptyRef = await postJson(`${BASE}/api/knowledge/kb-read`, { ref: '' })
  check('kb-read 空 ref → 400 INVALID_REF', emptyRef.status === 400 && emptyRef.body?.error?.code === 'INVALID_REF', JSON.stringify(emptyRef.body))

  console.log('\n[5] 显式失败：8431 不可达 / 挂起超时（不冒充空结果）')
  await stub.close()
  const down = await postJson(`${BASE}/api/knowledge/worldbook-search`, { projectId: 'proj_fixture1', q: '豹子头' })
  check('8431 不可达 → 503 KIT_PROTOCOL_PLANE_UNAVAILABLE', down.status === 503 && down.body?.error?.code === 'KIT_PROTOCOL_PLANE_UNAVAILABLE', JSON.stringify(down.body))
  check('错误文案含启动指引（npx tsx src/cli.ts web）', typeof down.body?.error?.message === 'string' && down.body.error.message.includes('npx tsx src/cli.ts web'), down.body?.error?.message)
  stub = createStub({ hangOnQuery: '__hang__' })
  await stub.listen()
  const hung = await postJson(`${BASE}/api/knowledge/worldbook-search`, { projectId: 'proj_fixture1', q: '__hang__' })
  check('8431 挂起 → 总超时后同码 503（约 8s，不静默回落）', hung.status === 503 && hung.body?.error?.code === 'KIT_PROTOCOL_PLANE_UNAVAILABLE' && String(hung.body?.error?.message).includes('超时'), JSON.stringify(hung.body))
  check('挂起请求未被记为成功调用', !stub.requests.some((r) => r.args?.q === '__hang__'))

  console.log('\n[6] 只读纪律')
  const sentVerbs = allRequests.map((r) => r.verb)
  check('全程只发只读检索动词', sentVerbs.length > 0 && sentVerbs.every((verb) => KNOWLEDGE_READ_VERBS.includes(verb)), JSON.stringify(sentVerbs))
} catch (error) {
  failures += 1
  console.error('✗ 冒烟中途异常:', error)
  console.error('server 日志尾：', serverLog.join('').slice(-1200))
} finally {
  await stub?.close().catch(() => {})
  await stopPinaxServer()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}

console.log(failures ? `\n冒烟结果：${failures} 挂 → exit 1` : '\n冒烟结果：全绿 → exit 0')
process.exitCode = failures ? 1 : 0
