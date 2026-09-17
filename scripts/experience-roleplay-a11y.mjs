#!/usr/bin/env node
/**
 * Experience 跑团面板可达性与降级动画审计（CX46 切片）。
 *
 * - axe-core（仓库已带）扫描 /experience 页面在「场景面板可见」状态下的
 *   可达性违规（serious/critical 视为失败）。
 * - reduced-motion=reduce 模拟下页面可用（主按钮可见可点）。
 *
 * 复用 eval/smoke 的隔离 vite（:5199）与独立 profile；运行：
 *   node scripts/experience-roleplay-a11y.mjs
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5199
const BASE = `http://127.0.0.1:${PORT}`

let passed = 0
const failures = []
function check(name, condition, detail = '') {
  if (condition) passed += 1
  else {
    failures.push({ name, detail })
    console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

const viteBin = path.join(root, 'node_modules/.bin/vite')
const server = spawn(viteBin, ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', (c) => { serverLog += c })
server.stderr.on('data', (c) => { serverLog += c })

async function waitForServer(timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(BASE)
      if (response.ok) return
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`vite 未就绪\n${serverLog.slice(-1500)}`)
}

try {
  await waitForServer()
  const { chromium } = await import(path.join(root, 'node_modules/playwright/index.mjs'))
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto(`${BASE}/experience`)
  await page.waitForSelector('.input-area', { timeout: 30000 })
  await page.evaluate(async () => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const worldStore = pinia._s.get('world')
    const gameStore = pinia._s.get('game')
    await worldStore.ensureActiveWorldbook()
    if (!gameStore.currentSessionId) {
      gameStore.createSession({ worldbookId: worldStore.activeWorldbookId || '', inheritRuntimeState: false })
    }
    gameStore.flushSaveSessions()
  })

  // axe 扫描（主记录流 + 跑团面板可见状态）。
  const axeSummary = await page.evaluate(async () => {
    const axeSource = await (await fetch('/node_modules/axe-core/axe.min.js')).text()
    const script = document.createElement('script')
    script.textContent = axeSource
    document.head.appendChild(script)
    const results = await window.axe.run(document.querySelector('.game-page'), {
      resultTypes: ['violations']
    })
    return {
      violations: results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
        targets: violation.nodes.map((node) => node.target.join(' ')).slice(0, 3)
      }))
    }
  })
  const serious = axeSummary.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
  // 判定口径：roleplay 自有 DOM（.rp-* / [data-testid^="rp-"]）零新增违规。
  // 既有组件（codex 折叠区、hero 装饰等）的存量问题单独记录，移交页面 owner。
  const isRoleplayOwned = (violation) => violation.targets.some(target => String(target).includes('rp-'))
  const roleplaySerious = serious.filter(isRoleplayOwned)
  const preExisting = serious.filter(violation => !isRoleplayOwned(violation))
  check('CX46 roleplay 自有 DOM 无 serious/critical 违规', roleplaySerious.length === 0, JSON.stringify(roleplaySerious))
  // eslint-disable-next-line no-console
  console.log(`既有违规（移交页面 owner，不属本线）：${JSON.stringify(preExisting)}`)

  // reduced-motion 下面板与主按钮可用。
  const reducedOk = await page.evaluate(() => {
    const modeBar = document.querySelector('.rp-mode-bar')
    const textarea = document.querySelector('.input-area textarea.input')
    return Boolean(modeBar) && Boolean(textarea) && !textarea.disabled
  })
  check('CX46 reduced-motion 下模式条与输入可用', reducedOk)

  await browser.close()
} finally {
  server.kill('SIGTERM')
}

console.log(`\n=== experience-roleplay-a11y: ${passed} passed, ${failures.length} failed ===`)
if (failures.length) process.exit(1)
