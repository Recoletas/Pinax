#!/usr/bin/env node
/**
 * 「选中文字 → 在助手里引用」旅程 smoke。
 *
 * 职责：
 * 1. 自起后端/前端两个进程，ready 后才开跑，finally 停掉自己起的服务。
 * 2. 浏览器上下文挂网络守卫：只放行被测 origin 与 data:/blob:/，模型 provider 一律 abort。
 * 3. 走一条最小旅程：导入一章有正文的稿 → 在编辑器里选中一段 →
 *    浮动工具条出现「在助手里引用」→ 点击 → 助手面板打开，且这段话被钉成一条引用
 *    （首条消息前会话不落盘，以引用 chip 断言，不必依赖模型）。
 *
 * 环境变量：
 *   SMOKE_FRONTEND_PORT（默认 5217） / SMOKE_BACKEND_PORT（默认 3017）
 *   SMOKE_OUT_DIR（截图/日志目录，默认 tmp/selection-quote-smoke）
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRONT_PORT = Number(process.env.SMOKE_FRONTEND_PORT || 5217)
const BACK_PORT = Number(process.env.SMOKE_BACKEND_PORT || 3017)
const OUT_DIR = resolve(process.env.SMOKE_OUT_DIR || join(root, 'tmp', 'selection-quote-smoke'))
const BASE_URL = `http://127.0.0.1:${FRONT_PORT}`
const nodeBin = process.execPath

const children = []
const blockedRequests = []
const processDiagnostics = []
const pageErrors = []
let failed = false

function log(message) { console.log(`[selection-quote-smoke] ${message}`) }
function check(name, condition, detail = '') {
  if (condition) { console.log(`  ✓ ${name}`); return true }
  failed = true
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  return false
}

async function waitUntil(fn, label, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return
    await new Promise((wait) => setTimeout(wait, 500))
  }
  throw new Error(`ready 超时：${label}`)
}

async function httpReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return response.status < 600
  } catch { return false }
}

function startProcess(name, command, args, env) {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  children.push({ name, child })
  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`))
  child.stderr.on('data', (data) => process.stdout.write(`[${name}] ${data}`))
  child.on('error', (error) => processDiagnostics.push(`[${name}:error] ${error?.stack || error}`))
  log(`${name} started pid=${child.pid}`)
  return child
}

async function stopAll() {
  for (const { name, child } of children.reverse()) {
    if (child.exitCode !== null) continue
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* 进程组可能已退出 */ }
    const exited = new Promise((resolveExit) => child.once('exit', resolveExit))
    await Promise.race([exited, new Promise((resolveWait) => setTimeout(resolveWait, 1500))])
    try { if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL') } catch { /* 同上 */ }
  }
}

const SYNTHETIC_CHAPTER = '# 码头夜谈\n老车夫狠狠吸了一大口干烟，粗糙的喉结上下滚动，心有余悸地说：“二少爷当心，那位爷不是善茬。”\n'

async function runJourney() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ args: process.env.CI ? ['--disable-dev-shm-usage', '--no-sandbox'] : [] })
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      const allowed = url.origin === BASE_URL || ['data:', 'blob:', 'about:'].includes(url.protocol)
      if (allowed) return route.continue()
      blockedRequests.push(`${url.origin}${url.pathname}`)
      return route.abort()
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => { const message = String(error?.message || error); pageErrors.push(message); console.error(`[pageerror] ${message}`) })

    log('step 1: 新建书稿')
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-test="welcome-start-authoring"]').waitFor({ timeout: 30_000 })
    await page.locator('[data-test="welcome-start-authoring"]').click()
    const newBook = page.getByRole('dialog', { name: '新建书稿' })
    await newBook.waitFor({ timeout: 30_000 })
    await newBook.locator('input[type="text"]').first().fill('引用自检')
    await newBook.locator('[data-test="new-book-confirm"]').click()
    await page.locator('[data-test="project-directory"]').waitFor({ timeout: 30_000 })

    log('step 2: 导入一章有正文的稿（让编辑器里有可选中的文字）')
    await page.locator('.directory-create summary').click()
    await page.locator('.directory-create button', { hasText: '导入章节' }).click()
    const importDialog = page.getByRole('dialog', { name: '导入章节' })
    await importDialog.waitFor({ timeout: 15_000 })
    await importDialog.locator('input[type=file]').first().setInputFiles({
      name: '码头夜谈.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(SYNTHETIC_CHAPTER, 'utf-8')
    })
    await importDialog.locator('[data-test="manuscript-import-confirm"]').waitFor({ timeout: 30_000 })
    await importDialog.locator('[data-test="manuscript-import-confirm"]').click()
    await importDialog.waitFor({ state: 'hidden', timeout: 30_000 })
    await page.locator('.ProseMirror').getByText('老车夫狠狠吸了', { exact: false }).waitFor({ timeout: 30_000 })

    log('step 3: 选中一段 → 浮动工具条出现「在助手里引用」')
    const paragraph = page.locator('.ProseMirror p').first()
    await paragraph.click({ clickCount: 3 })
    const toolbar = page.locator('.writing-selection-actions')
    await toolbar.waitFor({ timeout: 15_000 })
    const quoteButton = toolbar.locator('[data-action="quote-to-assistant"]')
    check('浮动工具条里有「在助手里引用」', await quoteButton.count() === 1)
    await page.screenshot({ path: join(OUT_DIR, '01-selection-toolbar.png'), fullPage: false })

    log('step 4: 点击 → 助手面板打开，选段成为一条引用')
    await quoteButton.click()
    const expanded = page.locator('.authoring-knowledge.is-expanded')
    await expanded.waitFor({ timeout: 20_000 })
    check('助手面板展开了', await expanded.count() === 1)
    const quoted = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith('authoring_assistant_conversation:'))
      for (const key of keys) {
        const raw = localStorage.getItem(key) || ''
        if (raw.includes('"type":"selection"') && raw.includes('老车夫')) return { key, raw: raw.slice(0, 400) }
      }
      return null
    })
    // 首条消息之前会话不落盘，所以以助手工具条上的引用 chip 为准（引擎在场时会渲染）。
    const chip = page.locator('.agent-tools__reference', { hasText: '选段' })
    await chip.first().waitFor({ timeout: 20_000 }).catch(() => {})
    check('助手的引用 chip 出现（标题带「·选段」）', await chip.count() >= 1, `会话存储命中：${quoted ? '有' : '无（首条消息前不落盘，属预期）'}`)
    check('引用 chip 的标题指向当前章节', /·选段/.test(await chip.first().innerText().catch(() => '')), await chip.first().innerText().catch(() => '(无 chip)'))
    await page.screenshot({ path: join(OUT_DIR, '02-assistant-panel.png'), fullPage: false })

    check('没有页面错误', pageErrors.length === 0, pageErrors.join(' | '))
    check('没有跨源外发请求', blockedRequests.length === 0, blockedRequests.join(' | '))
  } finally {
    await browser.close()
  }
}

try {
  log('启动后端与前端')
  startProcess('server', nodeBin, ['server/index.js'], { PORT: String(BACK_PORT) })
  await waitUntil(() => httpReachable(`http://127.0.0.1:${BACK_PORT}/api/rooms`), `backend :${BACK_PORT}`)
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  startProcess('vite', nodeBin, [viteBin, '--host', '127.0.0.1', '--port', String(FRONT_PORT), '--strictPort'], {
    PINAX_DEV_BACKEND_ORIGIN: `http://127.0.0.1:${BACK_PORT}`
  })
  await waitUntil(() => httpReachable(BASE_URL), `frontend :${FRONT_PORT}`)
  await runJourney()
} catch (error) {
  failed = true
  console.error(`[selection-quote-smoke] FAIL — ${error?.stack || error?.message || error}`)
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'failure.log'), [`error=${error?.stack || error}`, '', ...processDiagnostics.slice(-200)].join('\n'), 'utf8')
} finally {
  await stopAll()
}

if (failed) {
  console.error('[selection-quote-smoke] 失败')
  process.exit(1)
}
console.log('[selection-quote-smoke] 全部通过')
