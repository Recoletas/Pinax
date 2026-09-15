#!/usr/bin/env node
/**
 * B05 · 无密钥作者主路径 CI smoke（B 线自有协调脚本，不改 C 的 Gate 脚本）。
 *
 * 职责：
 * 1. 只起本 job 的后端/前端两个进程，记录 PID，ready 后才开跑，finally 停掉自己起的服务。
 * 2. 浏览器上下文挂网络守卫：仅放行被测 origin 与 data:/blob:，任何其他 http(s) 外发
 *    （含模型 provider）一律 abort 并记录；出现任一拦截即整体失败。
 * 3. 用合成稿件走一条最小旅程：欢迎页 → 导入 GB18030 文本 → 改章名 → 确认进编辑器
 *    → 刷新后内容仍在 → 诊断导出隐私合同成立。
 *
 * 环境变量：
 *   SMOKE_FRONTEND_PORT（默认 5212） / SMOKE_BACKEND_PORT（默认 3012）
 *   SMOKE_OUT_DIR（截图/日志目录，默认 tmp/authoring-smoke）
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRONT_PORT = Number(process.env.SMOKE_FRONTEND_PORT || 5212)
const BACK_PORT = Number(process.env.SMOKE_BACKEND_PORT || 3012)
const OUT_DIR = resolve(process.env.SMOKE_OUT_DIR || join(root, 'tmp', 'authoring-smoke'))
const BASE_URL = `http://127.0.0.1:${FRONT_PORT}`
const nodeBin = process.execPath

const children = []
let journeyFailed = false
const blockedRequests = []
const processDiagnostics = []

function log(message) {
  console.log(`[authoring-smoke] ${message}`)
}

async function waitUntil(fn, label, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }
  throw new Error(`ready 超时：${label}`)
}

function probePort(port) {
  return new Promise((resolveProbe) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (value) => { socket.destroy(); resolveProbe(value) }
    socket.setTimeout(500)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function httpReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return response.status < 600
  } catch {
    return false
  }
}

function startProcess(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  })
  children.push({ name, child })
  child.stdout.on('data', (data) => {
    const message = String(data)
    processDiagnostics.push(`[${name}:stdout] ${message}`)
    process.stdout.write(`[${name}] ${message}`)
  })
  child.stderr.on('data', (data) => {
    const message = String(data)
    processDiagnostics.push(`[${name}:stderr] ${message}`)
    process.stderr.write(`[${name}] ${message}`)
  })
  child.on('error', (error) => processDiagnostics.push(`[${name}:error] ${error?.stack || error}`))
  child.on('exit', (code, signal) => processDiagnostics.push(`[${name}:exit] code=${code} signal=${signal}`))
  log(`${name} started pid=${child.pid}`)
  return child
}

async function stopAll() {
  for (const { name, child } of children.reverse()) {
    if (child.exitCode !== null) continue
    log(`stopping ${name} pid=${child.pid}`)
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch { /* 进程组可能已退出 */ }
    const exited = new Promise((r) => child.once('exit', r))
    await Promise.race([exited, new Promise((r) => setTimeout(r, 1500))])
    try {
      if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL')
    } catch { /* 同上 */ }
  }
}

async function writeFailureReport(error, phase) {
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'failure.log'), [
    `phase=${phase}`,
    `error=${error?.stack || error}`,
    '',
    ...processDiagnostics.slice(-200)
  ].join('\n'), 'utf8')
}

// 合成稿件：GB18030 编码的“# 潮汐档案 / # 第二章 晨雾”两章文本，
// 字节序列与 C 线 Gate 的合成样例保持同源语义，内容不含任何真实书稿。
const SYNTHETIC_GB18030_HEX =
  '2320b3b1cfabb5b5b0b80a0a232320b5dad2bbd5c220caa7b5c60a0ab8dbbfdacfa8b5c6a1a30a0a232320b5dab6fed5c220bbd8c9f90a0ad6d3c9f9b4d3cbaecfc2b4abc0b4a1a3'

async function runJourney() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({
    args: process.env.CI ? ['--disable-dev-shm-usage', '--no-sandbox'] : []
  })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })

    // 网络守卫：跨 origin 的 http(s) 请求一律 abort 并记录（模型 provider 必然落在其中）
    await context.route('**/*', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const allowed =
        url.origin === BASE_URL ||
        url.protocol === 'data:' ||
        url.protocol === 'blob:' ||
        url.protocol === 'about:'
      if (allowed) return route.continue()
      blockedRequests.push(`${url.origin}${url.pathname}`)
      return route.abort()
    })

    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)))

    log('step 1: 打开欢迎页（无 Key、全新 localStorage）')
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: /从一句话开始/ }).waitFor({ timeout: 30_000 })

    log('step 2: 打开备份/诊断面板，导出低敏诊断并验证隐私合同')
    await page.getByRole('button', { name: '备份', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByText('内测遇到问题？').waitFor({ timeout: 30_000 })
    const downloadPromise = page.waitForEvent('download')
    await settings.locator('[data-test="beta-diagnostic-export"]').click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const diagnostic = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (diagnostic.privacy?.includesManuscriptText !== false || diagnostic.privacy?.includesApiKeys !== false) {
      throw new Error('诊断隐私合同不成立：诊断中可能包含正文或密钥')
    }
    await settings.getByRole('button', { name: '关闭' }).click()
    await page.screenshot({ path: join(OUT_DIR, '01-diagnostic-exported.png'), fullPage: true })

    log('step 3: 导入合成 GB18030 稿件并改第一章标题')
    await page.locator('[data-test="welcome-import-manuscript"]').click()
    const dialog = page.getByRole('dialog', { name: '导入 TXT / Markdown' })
    await dialog.waitFor({ timeout: 30_000 })
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'authoring-smoke-synthetic.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(SYNTHETIC_GB18030_HEX, 'hex')
    })
    await dialog.locator('.manuscript-import__summary > span').filter({ hasText: /^GB18030/ }).waitFor({ timeout: 30_000 })
    const chapterTitleInput = dialog.getByLabel('第 1 章标题')
    await chapterTitleInput.fill('第一章 守卫改写的章名')
    await page.screenshot({ path: join(OUT_DIR, '02-import-preview.png'), fullPage: true })

    log('step 5: 确认导入，进入编辑器')
    await dialog.locator('[data-test="manuscript-import-confirm"]').click()
    await page.locator('.ProseMirror').waitFor({ timeout: 30_000 })

    log('step 6: 刷新，验证导入内容与作者改过的章名仍在')
    await page.reload({ waitUntil: 'domcontentloaded' })
    // 正文可见（编辑器内合成稿正文）；章名以 attached 断言（目录折叠时 span 为 hidden 但状态仍在）
    await page.locator('.ProseMirror').waitFor({ timeout: 30_000 })
    await page.locator('.ProseMirror').getByText('港口熄灯', { exact: false }).waitFor({ timeout: 30_000 })
    await page.getByText('守卫改写的章名').first().waitFor({ state: 'attached', timeout: 30_000 })
    await page.screenshot({ path: join(OUT_DIR, '03-after-reload.png'), fullPage: true })

    if (pageErrors.length > 0) {
      throw new Error(`页面运行时错误：${pageErrors.slice(0, 3).join(' | ')}`)
    }
    log('journey complete')
  } finally {
    await browser.close()
  }
}

async function main() {
  log(`root=${root} front=${FRONT_PORT} back=${BACK_PORT} out=${OUT_DIR}`)
  for (const port of [FRONT_PORT, BACK_PORT]) {
    if (await probePort(port)) throw new Error(`端口 ${port} 已被占用，请换 SMOKE_*_PORT 或停掉占用进程`)
  }
  await mkdir(OUT_DIR, { recursive: true })

  startProcess('server', nodeBin, ['server/index.js'], { PORT: String(BACK_PORT) })
  await waitUntil(() => httpReachable(`http://127.0.0.1:${BACK_PORT}/api/rooms`), `backend :${BACK_PORT}`)

  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  startProcess('vite', nodeBin, [viteBin, '--host', '127.0.0.1', '--port', String(FRONT_PORT), '--strictPort'], {
    PINAX_DEV_BACKEND_ORIGIN: `http://127.0.0.1:${BACK_PORT}`
  })
  await waitUntil(() => httpReachable(BASE_URL), `frontend :${FRONT_PORT}`)

  try {
    await runJourney()
  } catch (error) {
    journeyFailed = true
    console.error('[authoring-smoke] journey FAILED:', error?.message || error)
    await writeFailureReport(error, 'journey')
  }

  if (blockedRequests.length > 0) {
    journeyFailed = true
    console.error('[authoring-smoke] 网络守卫拦截到未放行的外发请求（无密钥旅程不应外发）：')
    for (const item of [...new Set(blockedRequests)].slice(0, 10)) console.error(`  - ${item}`)
  }

  if (journeyFailed) {
    console.error('[authoring-smoke] RESULT: FAIL')
    process.exitCode = 1
  } else {
    console.log(`[authoring-smoke] RESULT: PASS（截图在 ${OUT_DIR}）`)
  }
}

try {
  await main()
} catch (error) {
  journeyFailed = true
  console.error('[authoring-smoke] startup FAILED:', error?.stack || error)
  await writeFailureReport(error, 'startup')
  process.exitCode = 1
} finally {
  await stopAll()
}
