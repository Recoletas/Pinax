/* eslint-disable no-console -- isolated browser verification */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = Number(process.env.PINAX_EXPERIENCE_SMOKE_PORT || 5307)
const base = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = '', browser
server.stdout.on('data', chunk => { serverLog += chunk })
server.stderr.on('data', chunk => { serverLog += chunk })
try {
  const deadline = Date.now() + 60000
  let ready = false
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(serverLog)
    try { if ((await fetch(base)).ok) { ready = true; break } } catch { /* wait for isolated Vite */ }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.ok(ready, serverLog)
  browser = await chromium.launch({ headless: true })
  // Warm SDK optimization separately; no measured fixture lives in this profile.
  const warm = await browser.newPage()
  await warm.goto(`${base}/experience`)
  await warm.waitForFunction(() => document.querySelector('#app')?.__vue_app__)
  await warm.close()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.route('**/api/**', route => {
    const url = route.request().url()
    if (url.includes('localmirror/capabilities')) return route.fulfill({ json: { ok: true, available: false } })
    return route.fulfill({ status: 503, json: { error: 'offline protocol fixture: no real provider' } })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto(`${base}/experience`)
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__)
  const first = await page.evaluate(async () => {
    const { useGameStore } = await import('/src/stores/gameStore.js')
    const { useWorldStore } = await import('/src/stores/worldStore.js')
    const flow = await import('/src/services/experience/roleplay/roleplayWorkflow.js')
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const world = useWorldStore(pinia)
    await world.ensureActiveWorldbook()
    const store = useGameStore(pinia)
    store.createSession({ worldbookId: world.activeWorldbookId || world.activeWorldbook?.id || '', inheritRuntimeState: false })
    flow.setRoleplaySessionSetup(store, { mode: 'rules', goal: '观察城门' })
    store.useAI = true
    // Genuine turn path, offline fixture only: failed generation must preserve
    // the durable action and dice while releasing loading/controller ownership.
    let samples = 0
    await flow.confirmRoleplayAction(store, { rawInput: '观察城门上的痕迹', attribute: 'wits', nextUint32: () => { samples++; return 3 } }).catch(() => {})
    const pending = store.roleplaySession.pendingByBranch.main
    if (!pending?.resolution) throw new Error('durable dice missing')
    if (samples !== 2 || store.isLoading) throw new Error('dice count or loading owner wrong')
    const id = pending.actionId
    const dice = JSON.stringify(pending.resolution)
    await flow.retryRoleplayNarration(store).catch(() => {})
    if (JSON.stringify(pending.resolution) !== dice || samples !== 2) throw new Error('retry rerolled dice')
    store.flags = { browserJourney: 'main' }
    if (!store.commitCurrentSessionNow()) throw new Error('session write not confirmed')
    return { sessionId: store.currentSessionId, id, dice }
  })
  await page.reload()
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__)
  const second = await page.evaluate(async first => {
    const { useGameStore } = await import('/src/stores/gameStore.js')
    const flow = await import('/src/services/experience/roleplay/roleplayWorkflow.js')
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const store = useGameStore(pinia)
    store.loadSessions()
    store.loadSession(first.sessionId)
    const pending = store.roleplaySession.pendingByBranch.main
    if (pending?.actionId !== first.id || JSON.stringify(pending.resolution) !== first.dice) throw new Error('refresh lost frozen action')
    if (store.flags.browserJourney !== 'main') throw new Error('runtime not durable')
    const baseSnapshot = store.getRuntimeSnapshot({ forSession: false })
    store.turnRecords = {
      main: { id: 'main', branchId: 'main', status: 'committed', committedAt: 1, postRuntimeSnapshot: baseSnapshot },
      fork: { id: 'fork', branchId: 'fork', parentTurnId: 'main', status: 'committed', committedAt: 2, postRuntimeSnapshot: { ...baseSnapshot, flags: { browserJourney: 'fork' } } },
      failed: { id: 'failed', branchId: 'fork', parentTurnId: 'main', status: 'failed', committedAt: 3, postRuntimeSnapshot: { ...baseSnapshot, flags: { browserJourney: 'failed' } } }
    }
    store.switchBranch('fork')
    if (store.flags.browserJourney !== 'fork' || store.lastCommittedTurnId !== 'fork') throw new Error('failed turn contaminated branch restore')
    if (!store.roleplaySession.pendingByBranch.main) throw new Error('branch switch deleted pending audit')
    store.switchBranch('main')
    if (store.flags.browserJourney !== 'main') throw new Error('main restore failed')
    flow.cancelRoleplayPending(store)
    if (!store.commitCurrentSessionNow()) throw new Error('cancel not durable')
    return { cancelled: !store.roleplaySession.pendingByBranch.main, branch: store.activeBranchId }
  }, first)
  assert.equal(second.cancelled, true)
  assert.equal(second.branch, 'main')
  assert.deepEqual(errors, [])
  await context.close()
  console.log('PASS actual browser Host: offline generation/retry, frozen dice, refresh, failed-branch isolation and durable cancellation')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
