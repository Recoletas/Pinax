#!/usr/bin/env node
/* eslint-disable no-console */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createPinaxMcpServer } from './createMcpServer.js'

// stdio 入口：由 Cursor / Claude / Copilot 等客户端直接拉起。
// 只读本地项目文件夹，不监听端口，不修改任何项目文件。
// pinax_agent_ask 通过本机既有服务（默认 http://127.0.0.1:3001）执行，可用 PINAX_SERVER_URL 覆盖。
const server = createPinaxMcpServer()
const transport = new StdioServerTransport()

await server.connect(transport)
console.error('[pinax-mcp] stdio server ready (local project route only)')
