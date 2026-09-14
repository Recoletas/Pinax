#!/usr/bin/env node
/**
 * 只读环境诊断：检查 Node 版本、依赖安装、原生模块、server 入口与配置存在性。
 *
 * 规则：
 * - 不写任何文件、不覆盖 .env、不起服务、不请求模型。
 * - 环境变量只输出名称与布尔状态，不输出值或长度。
 * - 退出码：环境不满足时 1，其余情况 0（无模型密钥不是错误）。
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lines = []
let fatal = false

function report(ok, label, next) {
  const mark = ok ? 'ok  ' : (next && next.startsWith('REQUIRED') ? 'MISS' : 'warn')
  lines.push(`[${mark}] ${label}${next && !ok ? `\n       → ${next}` : ''}`)
  if (!ok && next && next.startsWith('REQUIRED')) fatal = true
}

function compareNode(version, range) {
  const parse = (v) => v.replace(/^v/, '').split('.').map((n) => Number(n) || 0)
  const [major, minor, patch] = parse(version)
  const m = range.match(/>=([\d.]+)\s*<([\d.]+)/)
  if (!m) return null
  const [loMajor, loMinor, loPatch] = parse(m[1])
  const [hiMajor] = parse(m[2])
  const geLow = major > loMajor || (major === loMajor && (minor > loMinor || (minor === loMinor && patch >= loPatch)))
  const ltHigh = major < hiMajor
  return geLow && ltHigh
}

function probePort(host, port, timeout = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (result) => { socket.destroy(); resolve(result) }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const enginesRange = pkg.engines?.node || ''

console.log(`Pinax doctor — node ${process.version}, npm-ready check (read-only)`)

// 0. 源码身份：反馈可直接引用该 commit 映射候选版本（与前端构建注入同源）
let commitLine = 'commit: unknown（无 .git 的源码包）'
try {
  commitLine = `commit: ${execFileSync('git', ['-C', root, 'rev-parse', '--short=9', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}${existsSync(join(root, '.git')) && execFileSync('git', ['-C', root, 'status', '--porcelain'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().length > 0 ? ' (dirty 工作树)' : ''}`
} catch { /* 保持 unknown */ }
console.log(`[info] ${commitLine}`)

// 1. Node 版本
const nodeOk = enginesRange ? compareNode(process.version, enginesRange) : true
report(
  nodeOk,
  `Node ${process.version} 满足 engines "${enginesRange}"`,
  `REQUIRED Node 版本需 ${enginesRange}（README 推荐 nvm install 22 后 nvm use；当前树已带 .nvmrc）`
)

// 2. 依赖安装
const nodeModules = join(root, 'node_modules')
const installed = existsSync(join(nodeModules, '.package-lock.json'))
report(
  installed,
  '依赖已安装（node_modules/.package-lock.json 存在）',
  'REQUIRED 依赖未安装：在仓库根目录运行 `npm ci`（Node 22 下执行；不要复用其他 Node 版本装出的 node_modules）'
)

// 3. 原生模块（better-sqlite3 按当前 Node ABI 可用；仅内存库自检，不触碰任何数据文件）
let nativeOk = false
let nativeError = ''
if (installed) {
  try {
    const require = createRequire(join(root, 'package.json'))
    const Database = require('better-sqlite3')
    const probe = new Database(':memory:')
    probe.prepare('select 1 as ok').get()
    probe.close()
    nativeOk = true
  } catch (error) {
    nativeError = String(error?.message || error).split('\n')[0]
  }
}
report(
  nativeOk,
  '原生模块 better-sqlite3 可加载（NODE_MODULE_VERSION 匹配）',
  `REQUIRED 原生模块与当前 Node 不匹配（${nativeError.slice(0, 120)}）：切换到 engines 声明的 Node 22 后重新 \`npm ci\`；不要只重跑 build`
)

// 4. server 入口与配置存在性
report(existsSync(join(root, 'server', 'index.js')), 'server/index.js 存在', 'REQUIRED server/index.js 缺失：工作树不完整，重新 checkout')
const serverEnv = join(root, 'server', '.env')
const serverEnvExists = existsSync(serverEnv)
report(
  serverEnvExists,
  serverEnvExists ? 'server/.env 已找到（只检查存在性）' : 'server/.env 未创建（不影响无 AI 功能）',
  '可选：需要 AI 推演/生成时，从 server/.env.example 创建本地配置；不要提交密钥'
)
const keyName = 'MINIMAX_API_KEY'
let keySet = Boolean(process.env[keyName])
if (existsSync(serverEnv) && !keySet) {
  // 只判断“存在非空值”，值本身不进入内存输出
  const raw = await readFile(serverEnv, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq > 0 && line.slice(0, eq).trim() === keyName && line.slice(eq + 1).trim()) { keySet = true; break }
  }
}
console.log(`[info] ${keyName}: ${keySet ? 'set' : 'unset'}`)
if (!keySet) console.log('[info] 未配置模型密钥：普通写作、导入、备份可用；AI 推演/生成待配置（见 server/.env.example）')

// 5. 端口探测（只报占用与否）
const origin = String(process.env.PINAX_DEV_BACKEND_ORIGIN || '').trim().replace(/\/+$/, '') || 'http://127.0.0.1:3001'
let backendHost = '127.0.0.1'
let backendPort = '3001'
try {
  const url = new URL(origin.startsWith('http') ? origin : `http://${origin}`)
  backendHost = url.hostname || '127.0.0.1'
  backendPort = url.port || '3001'
} catch { /* 保留默认 */ }
const backendListening = await probePort(backendHost, Number(backendPort))
report(
  backendListening,
  backendListening ? `后端 ${backendHost}:${backendPort} 已在监听` : `后端 ${backendHost}:${backendPort} 当前未启动`,
  `该端口暂无服务（不是错误）。需要后端时运行 \`npm run server\`（或 PORT=${backendPort} node server/index.js）；前端 dev 代理经 PINAX_DEV_BACKEND_ORIGIN 指向它`
)
const frontendListening = await probePort('127.0.0.1', 5173)
report(
  frontendListening,
  frontendListening ? '前端 dev 端口 127.0.0.1:5173 已在监听' : '前端 dev 端口 127.0.0.1:5173 当前未启动',
  '该端口暂无服务（不是错误）。需要前端时运行 `npm run dev`'
)

console.log('')
for (const line of lines) console.log(line)
console.log('')
console.log(fatal ? 'doctor: 环境不满足，按上面 REQUIRED 项处理后重跑。' : 'doctor: 环境检查完成。')
process.exit(fatal ? 1 : 0)
