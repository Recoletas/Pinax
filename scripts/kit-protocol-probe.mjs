#!/usr/bin/env node
// kit 协议面契约探针（W1-A 前置件）：对活体 8431/8421 逐项断言接口形状，
// kit 升级导致形状漂移时立刻显形（对齐 pinax-adapter /v1/pinax/contract 自探针先例）。
//   ① GET 8431 /api/hub          —— 协议面健康（回 workspace/version）
//   ② GET 8421 /api/v1/openapi.json —— 内核自描述；paths 必须含
//      /api/v1/verbs/worldbook_search、kb_search、kb_read（知识代理依赖的只读检索动词）
// 纯 node fetch（不走系统代理）；8421 缺省 8421 端口（占用自动顺延可用
// PINAX_KIT_KERNEL_PORT 覆写），8431 缺省 8431（PINAX_KIT_PROTOCOL_PORT 覆写）。
// 全过 exit 0；任一失败或服务 down 如实报 exit 1（不静默）。
// 运行：node scripts/kit-protocol-probe.mjs
import {
  KIT_KERNEL_PLANE_PORT,
  KIT_KERNEL_PLANE_PORT_ENV,
  KIT_PROTOCOL_PLANE_PORT,
  KIT_PROTOCOL_PLANE_PORT_ENV,
  KNOWLEDGE_READ_VERBS,
  resolveKitProtocolPlaneEndpoint
} from '../shared/kitProtocolPlane.js'

const envPort = (name, fallback) => {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}
const PROTOCOL_ENDPOINT = resolveKitProtocolPlaneEndpoint(process.env)
const KERNEL_ENDPOINT = `http://127.0.0.1:${envPort(KIT_KERNEL_PLANE_PORT_ENV, KIT_KERNEL_PLANE_PORT)}`

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` —— ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  const body = await response.json()
  return { status: response.status, body }
}

const protocolPort = process.env[KIT_PROTOCOL_PLANE_PORT_ENV] || String(KIT_PROTOCOL_PLANE_PORT)
const kernelPort = process.env[KIT_KERNEL_PLANE_PORT_ENV] || String(KIT_KERNEL_PLANE_PORT)
console.log(`[probe] 协议面 8431 → ${PROTOCOL_ENDPOINT}（${KIT_PROTOCOL_PLANE_PORT_ENV}=${process.env[KIT_PROTOCOL_PLANE_PORT_ENV] || '未设'}）`)
console.log(`[probe] 内核面 8421 → ${KERNEL_ENDPOINT}（${KIT_KERNEL_PLANE_PORT_ENV}=${process.env[KIT_KERNEL_PLANE_PORT_ENV] || '未设'}）`)

// ① 8431 /api/hub 健康
try {
  const hub = await fetchJson(`${PROTOCOL_ENDPOINT}/api/hub`)
  check(`8431 GET /api/hub 可达（HTTP ${hub.status}）`, hub.status === 200)
  check('8431 hub 回显 workspace', typeof hub.body?.workspace === 'string' && hub.body.workspace.length > 0, `workspace=${hub.body?.workspace}`)
} catch (error) {
  check(`8431 GET /api/hub 可达（端口 ${protocolPort}）`, false, String(error?.message || error))
  console.error('  指引：cd kit/storyharness && npx tsx src/cli.ts web（先拉起 8421 内核，钉 STORYHARNESS_WORKSPACE）；loopback 探测用 curl --noproxy "*"。')
}

// ② 8421 openapi 自描述：只读检索动词三件必须在 paths
try {
  const openapi = await fetchJson(`${KERNEL_ENDPOINT}/api/v1/openapi.json`)
  check(`8421 GET /api/v1/openapi.json 可达（HTTP ${openapi.status}）`, openapi.status === 200)
  const paths = Object.keys(openapi.body?.paths || {})
  check('8421 openapi paths 非空', paths.length > 0, `paths=${paths.length}`)
  for (const verb of KNOWLEDGE_READ_VERBS) {
    check(`8421 openapi paths 含 /api/v1/verbs/${verb}`, paths.includes(`/api/v1/verbs/${verb}`))
  }
} catch (error) {
  check(`8421 GET /api/v1/openapi.json 可达（端口 ${kernelPort}）`, false, String(error?.message || error))
  console.error('  指引：内核 8421 是协议面的陪跑依赖（KernelClient verb 走 HTTP）；core 目录 npx tsx src/cli.ts serve 或经 web 一键拉起。')
}

console.log(failures ? `\n[probe] ${failures} 项未过 → exit 1` : '\n[probe] 全部通过 → exit 0')
process.exitCode = failures ? 1 : 0
