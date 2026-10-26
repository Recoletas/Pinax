/* eslint-disable no-console */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ToolSchema } from '@modelcontextprotocol/sdk/types.js'

// MCP 协议与工具 schema 合规检查：官方 SDK Client + 原始 HTTP 探针。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-mcp-conformance-'))
const projectRoot = path.join(temp, '项目')
const appData = path.join(temp, 'appdata')
const results = []
const EXPECTED_TOOL_COUNT = 19
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 600) })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${String(detail).slice(0, 240)}` : ''}`)
}
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text, 'utf-8')
}

write(path.join(projectRoot, '.pinax', 'project.json'), JSON.stringify({
  schemaVersion: 1, spec: 'pinax-project@1', projectId: 'proj_conf', name: '合规项目', kind: 'novel',
  createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z'
}, null, 2))
write(path.join(projectRoot, '正文', '001-开篇.md'), '合规测试正文。')
write(path.join(appData, 'projects.registry.json'), JSON.stringify({ schema: 'pinax-project@1', projects: [] }, null, 2))

function stdioTransport() {
  return new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, 'server/mcp/index.js')],
    cwd: repoRoot,
    env: { ...process.env, PINAX_APP_DATA: appData, PINAX_MIRROR_ROOT: path.join(temp, 'mirror'), PINAX_PUBLIC_ORIGINS: '' },
    stderr: 'pipe'
  })
}

function rawRequest(port, { method = 'POST', headers = {}, body = null, urlPath = '/mcp' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body)
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let raw = ''
      res.setEncoding('utf-8')
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function startServer() {
  const port = 39200 + Math.floor(Math.random() * 80)
  const child = spawn(process.execPath, [path.join(repoRoot, 'server/index.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      PINAX_APP_DATA: path.join(temp, 'server-appdata'),
      PINAX_MIRROR_ROOT: path.join(temp, 'server-mirror'),
      PINAX_PUBLIC_ORIGINS: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let log = ''
  child.stdout.on('data', (chunk) => { log += chunk.toString() })
  child.stderr.on('data', (chunk) => { log += chunk.toString() })
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/localmirror/capabilities`)
      if (response.status < 500) return { port, child }
    } catch { /* 等待 */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  child.kill()
  throw new Error(`临时服务未就绪\n${log.slice(-1200)}`)
}

async function checkStdio() {
  const client = new Client({ name: 'pinax-conformance', version: '1.0.0' }, { capabilities: {} })
  await client.connect(stdioTransport())
  try {
    const info = client.getServerVersion()
    check('stdio serverInfo 合规', info?.name === 'pinax-local' && /^\d+\.\d+\.\d+$/u.test(String(info?.version)), JSON.stringify(info))
    const capabilities = client.getServerCapabilities() || {}
    check('stdio 只声明 tools 能力', Object.keys(capabilities).length === 1 && Boolean(capabilities.tools), JSON.stringify(capabilities))
    check('stdio 返回 instructions', typeof client.getInstructions() === 'string' && client.getInstructions().length > 40, String(client.getInstructions() || '').slice(0, 80))

    const listed = await client.listTools()
    const tools = listed.tools || []
    check(`tools/list ${EXPECTED_TOOL_COUNT} 个且无 nextCursor`, tools.length === EXPECTED_TOOL_COUNT && !listed.nextCursor, String(tools.length))
    const names = tools.map((tool) => tool.name)
    check('批次8 工具已上架', ['pinax_project_import', 'pinax_project_index', 'pinax_knowledge_search'].every((name) => names.includes(name)), names.join(','))
    check('工具名唯一', new Set(names).size === names.length)
    check('工具名符合 MCP 命名', names.every((name) => /^[a-zA-Z0-9_-]{1,64}$/u.test(name)), names.join(','))
    const parseFails = []
    for (const tool of tools) {
      const parsed = ToolSchema.safeParse(tool)
      if (!parsed.success) parseFails.push(`${tool.name}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`)
    }
    check('全部工具通过官方 ToolSchema', parseFails.length === 0, parseFails.join(' | '))
    check('全部工具声明 inputSchema 对象', tools.every((tool) => tool.inputSchema?.type === 'object'), tools.filter((tool) => tool.inputSchema?.type !== 'object').map((tool) => tool.name).join(','))
    check('全部工具禁止额外字段', tools.every((tool) => tool.inputSchema?.additionalProperties === false), tools.filter((tool) => tool.inputSchema?.additionalProperties !== false).map((tool) => tool.name).join(','))
    check('全部工具有说明且不空', tools.every((tool) => typeof tool.description === 'string' && tool.description.trim().length >= 20))
    check('全部工具 annotations 为布尔', tools.every((tool) => {
      const annotations = tool.annotations || {}
      return ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'].every((key) => annotations[key] === undefined || typeof annotations[key] === 'boolean')
    }))
    const writeTools = ['pinax_chapter_write', 'pinax_project_init', 'pinax_rule_write', 'pinax_worldbook_write', 'pinax_chapter_import', 'pinax_project_import', 'pinax_project_index']
    check('写类工具 readOnlyHint=false', tools.filter((tool) => writeTools.includes(tool.name)).every((tool) => tool.annotations?.readOnlyHint === false), tools.filter((tool) => writeTools.includes(tool.name)).map((tool) => `${tool.name}:${tool.annotations?.readOnlyHint}`).join(','))
    check('只读工具 readOnlyHint=true', tools.filter((tool) => !writeTools.includes(tool.name)).every((tool) => tool.annotations?.readOnlyHint === true), tools.filter((tool) => !writeTools.includes(tool.name) && tool.annotations?.readOnlyHint !== true).map((tool) => tool.name).join(','))

    const call = await client.callTool({ name: 'pinax_project_open', arguments: { projectPath: projectRoot } })
    check('成功结果含 text content', Array.isArray(call.content) && call.content[0]?.type === 'text' && call.content[0].text.length > 0)
    check('成功结果含 structuredContent 且为对象', Boolean(call.structuredContent) && typeof call.structuredContent === 'object' && !Array.isArray(call.structuredContent))
    check('成功结果不置 isError', call.isError !== true)

    let unknown = null
    try { await client.callTool({ name: 'pinax_missing_tool', arguments: {} }) } catch (error) { unknown = error }
    check('未知工具返回 -32602', unknown?.code === -32602, `${unknown?.code} ${unknown?.message}`)

    let badType = null
    try { await client.callTool({ name: 'pinax_chapter_read', arguments: { projectPath: projectRoot, index: '1' } }) } catch (error) { badType = error }
    check('参数类型错误返回 -32602', badType?.code === -32602, `${badType?.code} ${badType?.message}`)

    let badRange = null
    try { await client.callTool({ name: 'pinax_chapter_read', arguments: { projectPath: projectRoot, maxChars: 10 } }) } catch (error) { badRange = error }
    check('参数越界返回 -32602', badRange?.code === -32602, `${badRange?.code} ${badRange?.message}`)

    let extra = null
    try { await client.callTool({ name: 'pinax_project_open', arguments: { projectPath: projectRoot, extra: true } }) } catch (error) { extra = error }
    check('多余参数返回 -32602', extra?.code === -32602, `${extra?.code} ${extra?.message}`)

    const business = await client.callTool({ name: 'pinax_project_open', arguments: { projectPath: temp } })
    let businessPayload = {}
    try { businessPayload = JSON.parse(business.content?.[0]?.text || '{}') } catch { businessPayload = {} }
    check('业务错误用 isError=true 返回', business.isError === true && businessPayload.code === 'ERR_NOT_LOCAL_PROJECT', `${business.isError} ${businessPayload.code}`)
    check('业务错误带 structuredContent', business.structuredContent?.code === 'ERR_NOT_LOCAL_PROJECT', JSON.stringify(business.structuredContent || null).slice(0, 200))

    await client.ping()
    check('ping 返回正常', true)
  } finally {
    await client.close().catch(() => {})
  }
}

async function checkHttp(port) {
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
  const client = new Client({ name: 'pinax-conformance-http', version: '1.0.0' }, { capabilities: {} })
  await client.connect(transport)
  try {
    const info = client.getServerVersion()
    check('HTTP initialize 成功且无会话依赖', info?.name === 'pinax-local', JSON.stringify(info))
    check('HTTP 客户端无 sessionId（无状态）', !transport.sessionId, String(transport.sessionId))
    const listed = await client.listTools()
    check(`HTTP tools/list ${EXPECTED_TOOL_COUNT} 个`, (listed.tools || []).length === EXPECTED_TOOL_COUNT, String((listed.tools || []).length))
    const opened = await client.callTool({ name: 'pinax_project_open', arguments: { projectPath: projectRoot } })
    check('HTTP 读取工具可用', opened.isError !== true && opened.structuredContent?.ok === true, JSON.stringify(opened.structuredContent || null).slice(0, 160))
  } finally {
    await client.close().catch(() => {})
  }

  const initialize = {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } }
  }
  const accept = { accept: 'application/json, text/event-stream' }
  const init = await rawRequest(port, { body: initialize, headers: accept })
  check('HTTP initialize 200 且 JSON', init.status === 200 && String(init.headers['content-type'] || '').includes('application/json'), `${init.status} ${init.headers['content-type']}`)
  check('HTTP 不返回 mcp-session-id', !init.headers['mcp-session-id'])
  check('HTTP 不回 CORS 头', !init.headers['access-control-allow-origin'])
  let initBody = {}
  try { initBody = JSON.parse(init.body) } catch { initBody = {} }
  check('HTTP 协商协议版本', initBody.result?.protocolVersion === '2025-06-18', String(initBody.result?.protocolVersion))

  const get = await rawRequest(port, { method: 'GET', headers: { accept: 'text/event-stream' } })
  check('无状态 GET /mcp 返回 405', get.status === 405, String(get.status))
  const del = await rawRequest(port, { method: 'DELETE', headers: accept })
  check('无状态 DELETE /mcp 返回 405', del.status === 405, String(del.status))

  const origin = await rawRequest(port, { body: initialize, headers: { ...accept, origin: 'https://evil.example' } })
  check('浏览器 Origin 被拒 403', origin.status === 403, String(origin.status))

  const evilHost = await rawRequest(port, { body: initialize, headers: { ...accept, host: 'evil.example:3001' } })
  check('非本机 Host 被拒 403', evilHost.status === 403, String(evilHost.status))

  const badVersion = await rawRequest(port, { body: initialize, headers: { ...accept, 'mcp-protocol-version': '1999-01-01' } })
  check('不支持的 MCP-Protocol-Version 返回 400', badVersion.status === 400, `${badVersion.status}（规范要求 400；若 200 记为已知差距）`)

  const notify = await rawRequest(port, { body: { jsonrpc: '2.0', method: 'notifications/initialized' }, headers: accept })
  check('notifications/initialized 返回 202', notify.status === 202, String(notify.status))

  const unsupported = await rawRequest(port, { body: { jsonrpc: '2.0', id: 2, method: 'resources/list' }, headers: accept })
  let unsupportedBody = {}
  try { unsupportedBody = JSON.parse(unsupported.body) } catch { unsupportedBody = {} }
  check('未声明能力的方法返回 -32601', unsupportedBody.error?.code === -32601, `${unsupported.status} ${unsupportedBody.error?.code}`)

  const onlyJson = await rawRequest(port, { body: initialize, headers: { accept: 'application/json' } })
  check('仅 Accept application/json 不应 5xx', onlyJson.status < 500, String(onlyJson.status))
}

let server = null
try {
  await checkStdio()
  server = await startServer()
  await checkHttp(server.port)
} finally {
  if (server?.child) server.child.kill()
}

const failed = results.filter((item) => !item.ok)
const reportPath = path.join(temp, 'conformance.json')
fs.writeFileSync(reportPath, JSON.stringify({ checks: results.length, failed: failed.length, results }, null, 2) + '\n')
console.log(`\n${results.length} checks, ${failed.length} failed`)
console.log(`report: ${reportPath}`)
if (failed.length) process.exitCode = 1
