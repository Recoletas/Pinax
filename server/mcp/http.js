import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js'
import { createPinaxMcpServer } from './createMcpServer.js'

// 本机 Streamable HTTP 入口（MCP 2025-03-26+ 传输；HTTP+SSE 已废弃，不复用）。
// 只允许本机回环 + localhost Host；公网部署整组禁用；拒绝带 Origin 的浏览器请求，
// 防止网页通过 localhost 读取作者项目。

function isLoopback(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(address || ''))
}

function hostnameOf(req) {
  const host = String(req.headers?.host || '').toLowerCase()
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1)
  return host.split(':')[0]
}

function reject(res, status, code, message) {
  const body = JSON.stringify({ ok: false, code, message })
  if (res.headersSent) {
    res.end()
    return
  }
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(body)
}

export async function handleMcpHttp(req, res) {
  if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) {
    return reject(res, 403, 'ERR_MCP_LOCAL_ONLY', 'MCP 仅在本机部署可用；公网部署已禁用。')
  }
  if (!isLoopback(req.socket?.remoteAddress)) {
    return reject(res, 403, 'ERR_MCP_LOOPBACK_ONLY', 'MCP 入口只接受本机回环连接。')
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostnameOf(req))) {
    return reject(res, 403, 'ERR_MCP_HOST_REJECTED', 'MCP 入口只接受 localhost / 127.0.0.1。')
  }
  if (req.headers?.origin) {
    return reject(res, 403, 'ERR_MCP_ORIGIN_REJECTED', 'MCP 入口不接受浏览器来源请求。')
  }
  // 无状态入口没有会话可读/可删：按规范对 GET/DELETE 返回 405。
  if (String(req.method || '').toUpperCase() !== 'POST') {
    res.setHeader('allow', 'POST')
    return reject(res, 405, 'ERR_MCP_METHOD_NOT_ALLOWED', '无状态 MCP 入口只接受 POST 请求。')
  }
  const protocolVersion = String(req.headers?.['mcp-protocol-version'] || '').trim()
  if (protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
    return reject(res, 400, 'ERR_MCP_PROTOCOL_VERSION', `不支持的 MCP-Protocol-Version：${protocolVersion}`)
  }

  // 同一进程内服务自己：用监听端口回环调用既有 /api/advisor，避免另建第二套执行链。
  const port = req.socket?.localPort
  const server = createPinaxMcpServer({
    advisorBaseUrl: port ? `http://127.0.0.1:${port}` : undefined
  })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // 无状态：每个请求独立，避免会话劫持面
    enableJsonResponse: true
  })

  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    Promise.resolve(transport.close?.()).catch(() => {})
    Promise.resolve(server.close?.()).catch(() => {})
  }
  res.once('finish', cleanup)
  res.once('close', cleanup)

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    cleanup()
    if (!res.headersSent) reject(res, 500, 'ERR_MCP_TRANSPORT', error?.message || String(error))
    else res.end()
  }
}
