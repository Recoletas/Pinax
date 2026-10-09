#!/usr/bin/env node
// fail-open 演练（W1-5 依赖件，可复跑）：kit 任务面挂掉时三链仍有真实回执的留证。
// 本机复跑：node scripts/failopen-drill.mjs（需生产 kit 8451 活着；脚本自起测试实例 8465）。
//
// 架构：故障注入 = stub 代理（8464）——只把 /v1/pinax/tasks* 拦成 502（模拟「任务面不可用」），
// /model、/v1/pinax/complete 等其余请求全部透传真实 kit。测试实例经 PINAX_ADAPTER_ENDPOINT 指向
// stub，storyagent 子进程关闭。如此可还原 2026-10-08 早间事故的真实形状：任务面坏、漏斗活。
// 之所以不用工单原文建议的「/model 热切到失败档」：kit 的任务面与漏斗共用同一份 cfg
// （modelFunnel.ts applyModelPatch 的注释与 makeModels/createRun 读取点），纯热切做不出
// 「任务面挂、漏斗活」的分离，只能连漏斗一起断——那验证的是「全 kit 挂」而非事故形状。
//
// 三链断言：advisor（capability 失败 → L2 回落 funnel）、structured（同 L2）、chat（kernel 直连漏斗，任务面无关）。
// 模型偶发抖动（如推理占满输出预算致 truncate / 空补全）由演练层重试吸收，attempts 记入证据。
// 证据落盘：$LOCALAPPDATA/pinax-probe/failopen-drill-evidence.json（响应摘要 + warn 行 + stub 拦截/透传记录）。
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STUB_PORT = 8464
const TEST_PORT = 8465
const KIT_PORT = 8451
const PROBE_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'pinax-probe')
const EVIDENCE_FILE = path.join(PROBE_DIR, 'failopen-drill-evidence.json')

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) { failures += 1; console.error('  detail:', String(detail).slice(0, 400)) }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const evidence = {
  startedAt: new Date().toISOString(),
  kitHealthz: null,
  stubBlocks: [],
  stubPassThroughs: [],
  warns: [],
  drills: {}
}

// ---- stub 代理：只拦任务面，其余透传真实 kit ----
const stub = createServer((req, res) => {
  const url = req.url || ''
  if (url.startsWith('/v1/pinax/tasks')) {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      evidence.stubBlocks.push({ at: new Date().toISOString(), method: req.method, url, bodyHead: Buffer.concat(chunks).toString('utf8').slice(0, 160) })
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: 'fail-open drill: task plane injected down' }))
    })
    return
  }
  const headers = { ...req.headers, host: `127.0.0.1:${KIT_PORT}` }
  delete headers.connection
  delete headers['keep-alive']
  const proxy = httpRequest({ host: '127.0.0.1', port: KIT_PORT, path: url, method: req.method, headers }, (upstream) => {
    const passHeaders = { ...upstream.headers }
    delete passHeaders.connection
    delete passHeaders['keep-alive']
    res.writeHead(upstream.statusCode || 502, passHeaders)
    upstream.pipe(res)
    upstream.on('end', () => {
      if (url.startsWith('/v1/pinax/complete') || url === '/model') {
        evidence.stubPassThroughs.push({ at: new Date().toISOString(), url: url.split('?')[0], status: upstream.statusCode })
      }
    })
  })
  proxy.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: `stub proxy error: ${error.message}` }))
  })
  req.pipe(proxy)
})

// 演练层重试：吸收模型级偶发抖动（不与服务端 fail-open 语义混淆，attempts 全量记录）
async function fetchJsonWithRetry({ name, url, init, attemptsMax = 3, accept = (response, body) => response.ok && !body?.code }) {
  const attempts = []
  for (let index = 0; index < attemptsMax; index += 1) {
    let status = 0
    let body = null
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(150000) })
      status = response.status
      body = await response.json().catch(() => null)
    } catch (error) {
      status = -1
      body = { transportError: error.message }
    }
    attempts.push({ status, code: body?.code || null, at: new Date().toISOString() })
    if (accept({ ok: status >= 200 && status < 300 }, body)) return { attempts, status, body }
    if (index < attemptsMax - 1) await sleep(1500)
  }
  return { attempts, status: attempts[attempts.length - 1].status, body: null }
}

const structuredPayload = {
  schemaVersion: 1,
  schemaId: 'setting-field.v1',
  requestId: 'failopen-drill-structured',
  provider: { id: 'kernel', baseUrl: 'https://kernel.invalid/v1', apiKey: 'kernel-managed', model: 'kernel' },
  target: { worldbookId: 'failopen-drill-wb', worldbookRevision: 'r1', sectionKey: 'world', fieldKeys: ['origin'] },
  context: { userBrief: '蒸汽与灵石并存的世界，简述世界起源。' },
  options: { maxTokens: 600, temperature: 0.2, timeoutMs: 60000 }
}

let child = null
const serverLog = []
try {
  const kitHealth = await fetch(`http://127.0.0.1:${KIT_PORT}/healthz`, { signal: AbortSignal.timeout(3000) }).then((response) => response.json()).catch(() => null)
  evidence.kitHealthz = kitHealth
  if (!kitHealth?.ok) throw new Error(`kit ${KIT_PORT} 不可达，演练中止（先起生产 kit）`)

  await new Promise((resolve, reject) => { stub.once('error', reject); stub.listen(STUB_PORT, '127.0.0.1', resolve) })

  child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      PINAX_ADAPTER_ENDPOINT: `http://127.0.0.1:${STUB_PORT}`,
      PINAX_STORYAGENT_ENABLED: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const collect = (stream) => stream.on('data', (data) => {
    const text = String(data)
    serverLog.push(text)
    for (const line of text.split(/\r?\n/)) {
      if (line.includes('falling back to funnel') || line.includes('capability agent failed') || line.includes('capability task failed')) {
        evidence.warns.push({ at: new Date().toISOString(), line: line.trim() })
      }
    }
  })
  collect(child.stdout)
  collect(child.stderr)

  const base = `http://127.0.0.1:${TEST_PORT}`
  let ready = false
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    ready = await fetch(`${base}/api/advisor/task`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(1500) })
      .then(() => true).catch(() => false)
    if (!ready) await sleep(1000)
  }
  if (!ready) throw new Error(`测试实例 ${TEST_PORT} 未就绪`)
  console.log(`测试实例就绪：${base}（任务面注入 = ${STUB_PORT}，真实 kit = ${KIT_PORT}）`)

  // ---- ① advisor：capability 任务失败 → L2 回落 funnel ----
  const blocksBeforeAdvisor = evidence.stubBlocks.length
  const advisor = await fetchJsonWithRetry({
    name: 'advisor',
    url: `${base}/api/advisor/task`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        envelope: {
          version: 1, surface: 'writing', projectId: 'failopen-drill',
          target: { type: 'chapter', id: 'c1', revision: 'r1' },
          blocks: [{ kind: 'raw', content: '主角把铁剑留在客栈，独自翻过北山，夜里宿在一处猎户空屋。', priority: 500, sourceRefs: [] }],
          budget: { maxChars: 4000, usedChars: 32, truncated: false }
        },
        question: '主角此刻手边有什么武器？',
        taskType: 'authoring.knowledge.query'
      })
    },
    accept: (response, body) => response.ok && String(body?.result?.knowledgeAnswer?.answer || '').length > 0
  })
  evidence.drills.advisor = {
    attempts: advisor.attempts,
    providerId: advisor.body?.meta?.provider?.id || null,
    answerChars: String(advisor.body?.result?.knowledgeAnswer?.answer || '').length
  }
  check('advisor：任务面 502 后仍出回执（200 + 正文）',
    advisor.status === 200 && evidence.drills.advisor.answerChars > 0,
    JSON.stringify({ attempts: advisor.attempts, head: JSON.stringify(advisor.body).slice(0, 200) }))
  check('advisor：链路留痕为 funnel（provider=text-model，非 agent-loop-kit）',
    evidence.drills.advisor.providerId === 'text-model',
    `provider=${evidence.drills.advisor.providerId}`)
  check('advisor：任务面确实被拦（stub 收到 /v1/pinax/tasks）',
    evidence.stubBlocks.length > blocksBeforeAdvisor,
    `blocks=${evidence.stubBlocks.length - blocksBeforeAdvisor}`)

  // ---- ② structured：capability fetchImpl 任务失败 → 回落漏斗 ----
  const blocksBeforeStructured = evidence.stubBlocks.length
  const structured = await fetchJsonWithRetry({
    name: 'structured',
    url: `${base}/api/generate/structured`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...structuredPayload, requestId: `${structuredPayload.requestId}-${Date.now().toString(36)}` })
    },
    accept: (response, body) => response.ok && String(body?.drafts?.origin || '').length > 20
  })
  evidence.drills.structured = {
    attempts: structured.attempts,
    mode: structured.body?.mode || null,
    originChars: String(structured.body?.drafts?.origin || '').length,
    innerAttemptCount: structured.body?.meta?.attemptCount || null
  }
  check('structured：任务面 502 后仍出草稿（200 + drafts.origin）',
    structured.status === 200 && evidence.drills.structured.originChars > 20,
    JSON.stringify({ attempts: structured.attempts, head: JSON.stringify(structured.body).slice(0, 200) }))
  check('structured：任务面确实被拦（stub 收到 /v1/pinax/tasks）',
    evidence.stubBlocks.length > blocksBeforeStructured,
    `blocks=${evidence.stubBlocks.length - blocksBeforeStructured}`)

  // ---- ③ chat：kernel 直连漏斗，任务面挂不影响 ----
  const warnsBeforeChat = evidence.warns.length
  const blocksBeforeChat = evidence.stubBlocks.length
  const chat = await fetchJsonWithRetry({
    name: 'chat',
    url: `${base}/api/chat/chat`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '用一句话说明什么是蒸汽朋克。' }],
        provider: 'kernel',
        baseUrl: 'https://kernel.invalid/v1',
        apiKey: 'kernel-managed',
        model: 'kernel'
      })
    },
    accept: (response, body) => response.ok && String(body?.content || '').length > 0
  })
  evidence.drills.chat = {
    attempts: chat.attempts,
    viaKit: chat.body?.meta?.viaKit === true,
    contentChars: String(chat.body?.content || '').length
  }
  check('chat：任务面挂时对话仍出正文（200 + content）',
    chat.status === 200 && evidence.drills.chat.contentChars > 0,
    JSON.stringify({ attempts: chat.attempts, head: JSON.stringify(chat.body).slice(0, 200) }))
  check('chat：走 kit 漏斗（meta.viaKit=true）', evidence.drills.chat.viaKit === true,
    JSON.stringify(chat.body?.meta || null).slice(0, 200))
  check('chat：不触发 capability 回落（无新 [Advisor]/[Structured] warn）',
    evidence.warns.length === warnsBeforeChat && evidence.stubBlocks.length === blocksBeforeChat,
    evidence.warns.slice(warnsBeforeChat).map((warn) => warn.line).join(' | '))

  const advisorWarn = evidence.warns.filter((warn) => warn.line.includes('[Advisor]'))
  const structuredWarn = evidence.warns.filter((warn) => warn.line.includes('[Structured]'))
  check('留证：advisor L2 warn 行已捕获', advisorWarn.length >= 1, '无 [Advisor] 回落告警')
  check('留证：structured L2 warn 行已捕获', structuredWarn.length >= 1, '无 [Structured] 回落告警')
  check('留证：stub 透传过 /v1/pinax/complete（真实模型参与了回落链）',
    evidence.stubPassThroughs.some((entry) => entry.url === '/v1/pinax/complete' && entry.status === 200),
    JSON.stringify(evidence.stubPassThroughs.slice(-5)))
} catch (error) {
  failures += 1
  console.error('演练中断:', error.message)
  evidence.fatal = error.message
} finally {
  evidence.finishedAt = new Date().toISOString()
  evidence.serverLogTail = serverLog.join('').split(/\r?\n/).slice(-40)
  try {
    fs.mkdirSync(PROBE_DIR, { recursive: true })
    fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2), 'utf8')
    console.log(`证据落盘：${EVIDENCE_FILE}`)
  } catch (error) {
    console.error('证据写盘失败:', error.message)
  }
  if (child) child.kill()
  await new Promise((resolve) => stub.close(resolve))
}
console.log(`failopen-drill: ${failures === 0 ? '全部通过' : `${failures} 个失败`}`)
process.exitCode = failures === 0 ? 0 : 1
