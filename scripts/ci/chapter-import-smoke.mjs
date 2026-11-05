#!/usr/bin/env node
/**
 * 「正文新建 → 导入章节…」旅程 smoke。
 *
 * 职责：
 * 1. 自起后端/前端两个进程，ready 后才开跑，finally 停掉自己起的服务。
 * 2. 浏览器上下文挂网络守卫：只放行被测 origin 与 data:/blob:/，模型 provider 一律 abort。
 * 3. 走一条最小旅程：欢迎页 → 新建书稿 → 工作区切到「文件」目录 →
 *    「新建」菜单里的「导入章节…」→ 选一个 .md → 确认 →
 *    章节真的进到当前作品（目录树与编辑器都能读到），并截图留证。
 *
 * 环境变量：
 *   SMOKE_FRONTEND_PORT（默认 5214） / SMOKE_BACKEND_PORT（默认 3014）
 *   SMOKE_OUT_DIR（截图/日志目录，默认 tmp/chapter-import-smoke）
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRONT_PORT = Number(process.env.SMOKE_FRONTEND_PORT || 5214)
const BACK_PORT = Number(process.env.SMOKE_BACKEND_PORT || 3014)
const OUT_DIR = resolve(process.env.SMOKE_OUT_DIR || join(root, 'tmp', 'chapter-import-smoke'))
const BASE_URL = `http://127.0.0.1:${FRONT_PORT}`
const nodeBin = process.execPath

const children = []
const blockedRequests = []
const processDiagnostics = []
const pageErrors = []
let failed = false

function log(message) { console.log(`[chapter-import-smoke] ${message}`) }
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

function probePort(port) {
  return new Promise((done) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const finish = (value) => { socket.destroy(); done(value) }
    socket.setTimeout(500)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function httpReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return response.status < 600
  } catch { return false }
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
  log(`${name} started pid=${child.pid}`)
  return child
}

async function stopAll() {
  for (const { name, child } of children.reverse()) {
    if (child.exitCode !== null) continue
    log(`stopping ${name} pid=${child.pid}`)
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* 进程组可能已退出 */ }
    const exited = new Promise((resolveExit) => child.once('exit', resolveExit))
    await Promise.race([exited, new Promise((resolveWait) => setTimeout(resolveWait, 1500))])
    try { if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL') } catch { /* 同上 */ }
  }
}

// 合成稿件：不含任何真实书稿。
const SYNTHETIC_CHAPTER = '# 导入样章\n港口熄灯以后，第七区的钟声比昨天早了一分钟。\n'

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

    log('step 1: 欢迎页 → 新建书稿')
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-test="welcome-start-authoring"]').waitFor({ timeout: 30_000 })
    await page.locator('[data-test="welcome-start-authoring"]').click()
    const newBook = page.getByRole('dialog', { name: '新建书稿' })
    await newBook.waitFor({ timeout: 30_000 })
    await newBook.locator('input[type="text"]').first().fill('导入自检')
    await newBook.locator('[data-test="new-book-confirm"]').click()
    await page.locator('[data-test="project-directory"]').waitFor({ timeout: 30_000 })

    log('step 2: 目录「新建」菜单里出现「导入章节…」')
    // 2a. 右键菜单 → 新建子菜单（作者实际点的那条路径）
    const manuscriptRow = page.locator('[data-test="project-directory"] [role="treeitem"]').filter({ hasText: '正文' }).first()
    await manuscriptRow.click({ button: 'right' })
    const contextMenu = page.locator('.project-directory[role="menu"]')
    await contextMenu.waitFor({ timeout: 10_000 })
    await contextMenu.getByRole('menuitem', { name: '新建', exact: false }).first().click()
    const submenuItem = page.locator('.directory-new-menu [role="menuitem"]', { hasText: '导入章节' })
    await submenuItem.waitFor({ timeout: 10_000 })
    check('右键菜单的「新建」里有「导入章节…」', await submenuItem.count() === 1)
    await page.screenshot({ path: join(OUT_DIR, '01-directory-context-menu.png'), fullPage: false })
    await page.keyboard.press('Escape')

    // 2b. 顶部「+」下拉
    const create = page.locator('.directory-create summary')
    await create.click()
    const importEntry = page.locator('.directory-create button', { hasText: '导入章节' })
    await importEntry.waitFor({ timeout: 10_000 })
    check('「新建」下拉里有「导入章节…」', await importEntry.count() === 1)
    await page.screenshot({ path: join(OUT_DIR, '01b-directory-new-menu.png'), fullPage: false })

    log('step 3: 打开导入章节对话框并选一个 .md')
    await importEntry.click()
    const dialog = page.getByRole('dialog', { name: '导入章节' })
    await dialog.waitFor({ timeout: 15_000 })
    check('对话框标题是「导入章节」', await dialog.count() === 1)
    await dialog.locator('input[type=file]').first().setInputFiles({
      name: '导入样章.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(SYNTHETIC_CHAPTER, 'utf-8')
    })
    const confirm = dialog.locator('[data-test="manuscript-import-confirm"]')
    await confirm.waitFor({ timeout: 30_000 })
    check('识别出 1 章待导入', await dialog.locator('.manuscript-import__chapters li').count() === 1)
    check('确认按钮文案是「导入章节」', (await confirm.innerText()).includes('导入章节'))
    await page.screenshot({ path: join(OUT_DIR, '02-import-chapters-review.png'), fullPage: false })

    log('step 4: 确认导入 → 章节落到当前作品')
    await confirm.click()
    await dialog.waitFor({ state: 'hidden', timeout: 30_000 })
    const treeText = await page.locator('[data-test="project-directory"]').innerText()
    check('目录树里出现导入的章节', treeText.includes('导入样章'), treeText.slice(0, 160))
    const editorText = await page.locator('.ProseMirror').innerText().catch(() => '')
    check('编辑器里是导入的正文', editorText.includes('港口熄灯'), editorText.slice(0, 120))
    await page.screenshot({ path: join(OUT_DIR, '03-after-import.png'), fullPage: false })

    log('step 5: 刷新后仍在（落盘了，不只是内存）')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('[data-test="project-directory"]').waitFor({ timeout: 30_000 })
    const treeAfter = await page.locator('[data-test="project-directory"]').innerText()
    check('刷新后目录树仍有导入的章节', treeAfter.includes('导入样章'), treeAfter.slice(0, 160))
    await page.screenshot({ path: join(OUT_DIR, '04-after-reload.png'), fullPage: false })

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
  console.error(`[chapter-import-smoke] FAIL — ${error?.stack || error?.message || error}`)
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'failure.log'), [
    `error=${error?.stack || error}`,
    '',
    ...processDiagnostics.slice(-200)
  ].join('\n'), 'utf8')
} finally {
  await stopAll()
}

if (failed) {
  console.error('[chapter-import-smoke] 失败')
  process.exit(1)
}
console.log('[chapter-import-smoke] 全部通过')
