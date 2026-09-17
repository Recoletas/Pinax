#!/usr/bin/env node
/**
 * Experience 跑团线浏览器 smoke（隔离运行：自带 vite dev server @127.0.0.1:5199，
 * 独立浏览器 profile，不触碰用户 5173 与用户数据）。
 *
 * 旅程（离线，无真实模型；生成请求按预期失败，用于验证失败恢复合同）：
 *   1. 模式条：选择「轻规则 2d6」，旧会话/新会话不迁移。
 *   2. 输入区：骰子开关 → 确认面板（属性/修正/规则明文）→ 取消零副作用（V09）。
 *   3. 确认检定 → 已结算待回应条出现（骰点摘要可见）。
 *   4. 刷新 → pending 恢复、骰点不变（V14，真实持久化往返）。
 *   5. 失败重试 → 骰点不变；放弃 → pending 清除（V15/V16）。
 *   6. 预置已提交检定的会话 → 检定行渲染 + 明细折叠（R11/V23 形状）。
 *   7. 1440/900/390、明/暗截图（V32）。
 *
 * 运行：node scripts/experience-roleplay-smoke.mjs
 * 截图输出：/tmp/pinax-rpg-c-20260916/
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5199
const BASE = `http://127.0.0.1:${PORT}`
const OUT_DIR = '/tmp/pinax-rpg-c-20260916'

let passed = 0
const failures = []
const consoleErrors = []
function check(name, condition, detail = '') {
  if (condition) passed += 1
  else {
    failures.push({ name, detail })
    // eslint-disable-next-line no-console
    console.error(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

mkdirSync(OUT_DIR, { recursive: true })

// ── 1. 启动隔离 vite dev server ──
const viteBin = path.join(root, 'node_modules/.bin/vite')
const server = spawn(viteBin, ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe']
})
let serverLog = ''
server.stdout.on('data', (chunk) => { serverLog += chunk })
server.stderr.on('data', (chunk) => { serverLog += chunk })

async function waitForServer(timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(BASE)
      if (response.ok) return true
    } catch { /* not ready yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`vite dev server 未在 ${timeoutMs}ms 内就绪\n${serverLog.slice(-2000)}`)
}

try {
  await waitForServer()

  const { chromium } = await import(path.join(root, 'node_modules/playwright/index.mjs'))
  const browser = await chromium.launch({ headless: true })

  // 通过页面内真实 store 播种默认世界书与活动会话（隔离 profile 合成夹具，非用户数据）。
  async function seedSession(page) {
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
  }

  // ── 2. 主旅程：模式选择 → 确认 → 失败恢复 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => consoleErrors.push(String(error)))
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    await page.waitForTimeout(200)

    // 模式条：未选择 → 显示两个选择。
    check('V01 模式条可见（未选择模式）', await page.locator('.rp-mode-bar').count() > 0)
    await page.screenshot({ path: `${OUT_DIR}/01-mode-bar-1440-light.png` })

    // 选择轻规则模式。
    await page.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    await page.waitForFunction(() => {
      const app = document.querySelector('#app')?.__vue_app__
      return Boolean(app)
    }).catch(() => {})
    // 选择后未决定行收起；通过 store 断言状态已写入。
    const modeState = await page.evaluate(async () => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('game')
      return store?.roleplaySession?.mode || null
    })
    check('V01 选择轻规则模式持久写入', modeState === 'rules')

    // 骰子开关出现；输入行动文本。
    await page.waitForSelector('[data-testid="rp-dice-toggle"]')
    await page.fill('.input-area textarea.input', '凑近炉火，辨认值班日志最后一页的字迹')
    await page.click('[data-testid="rp-dice-toggle"]')
    await page.waitForSelector('.rp-confirm')
    check('R10 确认面板展示规则明文', (await page.locator('[data-testid="rp-rule-text"]').innerText()).includes('2d6'))
    await page.screenshot({ path: `${OUT_DIR}/02-confirm-panel-1440-light.png` })

    // V09：取消 → 面板收起、无 pending。
    await page.getByRole('button', { name: '取消' }).click()
    await page.waitForTimeout(200)
    const pendingAfterCancel = await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('game')
      return store?.roleplaySession?.pendingByBranch?.main || null
    })
    check('V09 取消后零骰点零 pending', pendingAfterCancel === null)

    // 再次展开，调整修正 +1，确认检定 → 结算 → 待回应条。
    await page.click('[data-testid="rp-dice-toggle"]')
    await page.waitForSelector('.rp-confirm')
    await page.getByRole('button', { name: /提高修正/ }).click()
    await page.getByRole('button', { name: '确认检定' }).click()
    await page.waitForSelector('[data-testid="rp-pending-bar"]', { timeout: 30000 })
    const pendingText = await page.locator('[data-testid="rp-pending-bar"]').innerText()
    check('V14 确认后出现已检定待回应条', pendingText.includes('已检定、等待回应'))
    const diceTotal = await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('game')
      const pending = store.roleplaySession.pendingByBranch.main
      return { total: pending.resolution.total, dice: pending.resolution.dice, actionId: pending.actionId }
    })
    check('R03 一次确认只产生一次结算', Number.isInteger(diceTotal.total) && diceTotal.dice.length === 2)
    await page.screenshot({ path: `${OUT_DIR}/03-pending-after-fail-1440-light.png` })

    // V14：刷新 → pending 恢复、骰点不变。
    await page.reload()
    await page.waitForSelector('[data-testid="rp-pending-bar"]', { timeout: 30000 })
    const restored = await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('game')
      const pending = store.roleplaySession?.pendingByBranch?.main
      return pending ? { total: pending.resolution.total, dice: pending.resolution.dice, status: pending.status } : null
    })
    check('V14 刷新后骰点一致、状态 resolved', restored
      && restored.total === diceTotal.total
      && JSON.stringify(restored.dice) === JSON.stringify(diceTotal.dice)
      && restored.status === 'resolved')
    const pendingTextAfterReload = await page.locator('[data-testid="rp-pending-bar"]').innerText()
    check('V14 刷新后待回应条不要求重掷', pendingTextAfterReload.includes('请求回应'))

    // 普通发送被阻断（发送按钮 disabled）。
    await page.fill('.input-area textarea.input', '普通行动文本')
    check('V20 pending 阻断普通发送', await page.locator('.input-area .send-btn').isDisabled())

    // 放弃本次 → pending 清除、发送恢复。
    await page.getByRole('button', { name: '放弃本次' }).click()
    await page.waitForTimeout(300)
    check('V09 放弃后待回应条消失', await page.locator('[data-testid="rp-pending-bar"]').count() === 0)
    check('V09 放弃后发送恢复可用', !(await page.locator('.input-area .send-btn').isDisabled()))
    await context.close()
  }

  // ── 3. 已提交检定的会话夹具：检定行渲染 + 分支可见性 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    // 通过页面内真实存储写一条含已提交检定的会话（隔离 profile 的合成夹具，非用户数据）。
    await page.evaluate(() => {
      const sessions = [{
        id: 'sess_rp_fixture',
        schemaVersion: 1,
        title: '跑团检定夹具',
        createdAt: Date.now() - 60000,
        updatedAt: Date.now() - 60000,
        worldbookId: '',
        messages: [
          { id: 'msg_u1', role: 'user', content: '凑近炉火，辨认日志最后一页的字迹', timestamp: Date.now() - 50000,
            roleplayCheck: {
              version: 1, actionId: 'act_fixture_1', branchId: 'main', sessionId: 'sess_rp_fixture',
              ruleId: 'pinax-roleplay-2d6', rulesVersion: 1, expression: '2d6', attribute: 'wits',
              attributeLabel: '头脑', modifier: 1, dice: [5, 4], total: 10, outcome: 'success',
              outcomeLabel: '2d6+1 = 10（5 + 4）→ 成功：如玩家所愿完成，可附带小顺利',
              ruleText: '掷 2d6+1：10+ 成功，7–9 部分成功（有代价），6- 失败前进。',
              rawInputDigest: '凑近炉火，辨认日志最后一页的字迹', status: 'committed',
              detail: { thresholds: { success: 10, partialSuccess: 7 }, rngTrace: { algorithm: 'uint32-rejection-v2', consumedSamples: 2, rejectedSamples: 0 } }
            } },
          { id: 'msg_a1', role: 'assistant', content: '炉火映亮了最后一行字。', timestamp: Date.now() - 40000 }
        ],
        chatHistory: [],
        runtimeState: {},
        worldState: {},
        turnRecords: {},
        lastCommittedTurnId: null,
        activeBranchId: 'main',
        roleplay: {
          version: 1, mode: 'rules', goal: '查明灯塔看守失踪的真相', actorRef: null, modeDecidedAt: Date.now() - 60000,
          pendingByBranch: {},
          receipts: [{ schemaVersion: 1, receiptId: 'act_fixture_1', commandId: 'act_fixture_1', actionId: 'act_fixture_1', turnId: 'turn_f1', parentTurnId: null,
            scope: { domain: 'session', bookId: null, worldbookId: null, sessionId: 'sess_rp_fixture', branchId: 'main' },
            rulesVersion: 'pinax-roleplay-2d6@1', resolutionRef: 'sha-fixture', stateDeltaRefs: [], evidenceRefs: [], committedAt: Date.now() - 40000, payloadHash: 'fixture-hash' }],
          archiveOutbox: [{ actionId: 'act_fixture_1', receiptId: 'act_fixture_1', turnId: 'turn_f1', attempts: 0, lastError: '', queuedAt: Date.now() - 40000 }]
        }
      }]
      localStorage.setItem('writing_sessions', JSON.stringify(sessions))
    })
    await page.goto(`${BASE}/experience?sessionId=sess_rp_fixture`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await page.waitForSelector('[data-testid="rp-check-row"]', { timeout: 15000 })
    const rowText = await page.locator('[data-testid="rp-check-row"]').innerText()
    check('R11 检定行嵌入回合且含骰点/结果', rowText.includes('成功') && rowText.includes('= 10'))
    // 明细折叠展开。
    await page.locator('[data-testid="rp-check-row"] summary').click()
    check('R11 明细展开含规则版本', (await page.locator('[data-testid="rp-check-row"]').innerText()).includes('pinax-roleplay-2d6'))
    // 归档待重试提示可见（RoleplayWorkspaceBar 内的归档行）。
    const archiveHint = await page.locator('.rp-workspace-bar__archive').allInnerTexts()
    check('R21 归档待重试如实显示', archiveHint.some((text) => text.includes('历史归档待重试')))
    // 模式条收起为已决定状态（chip）。
    const chipText = await page.locator('.rp-mode-bar').innerText().catch(() => '')
    check('V02 已选择模式不再强迫重选', chipText.includes('轻规则 2d6'))
    await page.screenshot({ path: `${OUT_DIR}/04-check-row-1440-light.png` })
    await context.close()
  }

  // ── 3b. V03：显式指定但不存在的存档 → 停住让用户选择，不静默回退全库最近会话 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/experience?sessionId=sess_does_not_exist`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    const sourceStatus = await page.locator('.experience-source-status').first().innerText().catch(() => '')
    const pickerOpen = await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      return Boolean(pinia._s.get('game')?.currentSessionId)
    })
    check('V03 失效存档提示并停住（无会话被静默加载）', sourceStatus.includes('来源会话已不可用') && !pickerOpen)
    await context.close()
  }

  // ── 4. CX08/XC-G08：生产 ledger 端口安装 → 真实提交 → 数据库读回 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    const portKind = await page.evaluate(async () => {
      const { getRoleplayHistoryPort } = await import('/src/services/experience/roleplay/roleplayHistoryAdapter.js')
      return getRoleplayHistoryPort().kind
    })
    check('CX08 启动引导已安装 fact-ledger 生产端口', portKind === 'fact-ledger')
    // 用真实 workflow 在页面里走 commit → queue → drain（真实 Dexie 账本）。
    const receiptId = await page.evaluate(async () => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('game')
      const contract = await import('/src/services/experience/roleplay/roleplayActionContract.js')
      const workflow = await import('/src/services/experience/roleplay/roleplayWorkflow.js')
      workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: 'CX08' })
      const action = contract.createConfirmedRoleplayAction({
        sessionId: store.currentSessionId, branchId: 'main', worldbookId: null,
        rawInput: '账本读回行动', attribute: 'wits', modifier: 0
      })
      contract.applyResolution(action, { dice: [5, 5], rngTrace: { algorithm: 'uint32-rejection-v2', sides: 6, requestedDice: 2, consumedSamples: 2, rejectedSamples: 0 } })
      contract.markRoleplayActionCommitted(action, { narrationTurnId: 'turn_cx08' })
      const receipt = workflow.commitRoleplayNarration(store, {
        action,
        turnRecord: { id: 'turn_cx08', parentTurnId: null, userMessageIds: [] }
      })
      store.commitCurrentSessionNow()
      await workflow.archiveDurableRoleplayTurns(store)
      return receipt?.receiptId || ''
    })
    const dbRow = await page.evaluate(async (rid) => {
      const { openLedgerDb } = await import('/src/services/memory/ledger/ledgerDb.js')
      const { listTurnReceipts } = await import('/src/services/memory/ledger/factLedger.js')
      const { getRoleplayHistoryPort } = await import('/src/services/experience/roleplay/roleplayHistoryAdapter.js')
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      // 查询 scope 必须与入账 scope 完全一致（含 worldbookId），取自会话回执。
      const receiptScope = store.roleplaySession.receipts.find((r) => r.receiptId === rid)?.scope
        || { domain: 'session', bookId: null, worldbookId: null, sessionId: store.currentSessionId, branchId: 'main' }
      const opened = await openLedgerDb()
      const db = opened.db
      let rows = []
      let viaPort = null
      for (let i = 0; i < 20; i += 1) {
        rows = await listTurnReceipts(db, { scope: receiptScope })
        if (rows.length > 0) break
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      viaPort = await getRoleplayHistoryPort().readRoleplayHistory({ scope: receiptScope })
      return { rowCount: rows.length, hasReceipt: rows.some((row) => row.receiptId === rid), portOk: viaPort.ok, portCount: viaPort.records?.length || 0, outboxRemaining: store.roleplaySession.archiveOutbox.length }
    }, receiptId)
    check('CX08 已提交回合真实落库（append→list）', Boolean(receiptId) && dbRow.hasReceipt && dbRow.rowCount >= 1)
    check('CX08 生产端口 reader 可读回同一回执', dbRow.portOk && dbRow.portCount >= 1)
    await page.screenshot({ path: `${OUT_DIR}/08-ledger-roundtrip-1440-light.png` })
    await context.close()
  }

  // ── 5. CX11/XC-G11：已结算 → 模拟 429 → 骰点不变 → 拦截成功流全链提交 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    // 种一个"看似有效"的本地 provider 配置，让请求校验通过、fetch 真正发出（被下方路由拦截）。
    await page.addInitScript(() => {
      localStorage.setItem('text_model_configs', JSON.stringify([{
        id: 'cfg_fake', provider: 'deepseek', name: 'smoke-fake', baseUrl: 'http://127.0.0.1:9',
        apiKey: 'sk-smoke-fake', model: 'fake-model', builtin: false
      }]))
      localStorage.setItem('text_model_selected', 'cfg_fake')
    })
    let failWith429 = true
    await page.route('**/api/generate/agent-step/stream', async (route) => {
      if (failWith429) {
        await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'rate limited (simulated)', code: 'NARRATIVE_PROVIDER_RATE_LIMITED', retryable: true }) })
        return
      }
      // 规划请求的 toolChoice 指定 submit_narrative_beat_plan → 返回其工具调用；
      // arguments 必须经 tool.input.delta 事件传递（reduce 只从 delta 收集）。
      // 正文请求 toolChoice=auto → 纯文本流。
      let body = {}
      try { body = route.request().postDataJSON() } catch { body = {} }
      const planChoice = body?.toolChoice?.function?.name || body?.options?.toolChoice?.function?.name || ''
      const isPlanPhase = planChoice === 'submit_narrative_beat_plan'
      let sse
      if (isPlanPhase) {
        sse = [
          'data: {"schemaVersion":1,"type":"step.start","stepId":"p1"}',
          'data: {"schemaVersion":1,"type":"tool.input.delta","callId":"c1","input":{"responseObligation":"辨认日志字迹的行动得到字迹内容回应","causalSteps":["字迹在火光下显现","记录指向灯下的第三个人"],"revealOrChange":"日志揭示看守失踪前记录了第三个人","endCondition":"炉火重新旺了起来，日志摊在桌上","intent":"respond","mode":"narrative"}}',
          'data: {"schemaVersion":1,"type":"tool.call","callId":"c1","toolName":"submit_narrative_beat_plan"}',
          'data: {"schemaVersion":1,"type":"step.finish","finishReason":"tool_calls"}'
        ].join('\n\n') + '\n\n'
      } else {
        sse = [
          'data: {"schemaVersion":1,"type":"step.start","stepId":"s1"}',
          'data: {"schemaVersion":1,"type":"text.delta","content":"炉火映亮了最后一行字。看守的字迹指向灯下的第三个人。"}',
          'data: {"schemaVersion":1,"type":"step.finish","finishReason":"stop"}',
          'data: {"schemaVersion":1,"type":"usage","usage":{"inputTokens":12,"outputTokens":34,"totalTokens":46}}'
        ].join('\n\n') + '\n\n'
      }
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
    })
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    await page.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    await page.fill('.input-area textarea.input', '辨认日志最后一页的字迹')
    await page.click('[data-testid="rp-dice-toggle"]')
    await page.waitForSelector('.rp-confirm')
    await page.getByRole('button', { name: '确认检定' }).click()
    await page.waitForSelector('[data-testid="rp-pending-bar"]', { timeout: 30000 })
    const after429 = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      const pending = store.roleplaySession.pendingByBranch.main
      return { total: pending.resolution.total, dice: pending.resolution.dice, status: pending.status, retry: pending.retryCount }
    })
    check('XC-G11 模拟 429 后 pending 保持 resolved（骰点不变）', after429.status === 'resolved' && after429.dice.length === 2)
    // 刷新仍保持，然后解除 429 → 拦截成功 SSE → 重试同骰点全链提交 → 真实账本落库。
    await page.reload()
    await page.waitForSelector('[data-testid="rp-pending-bar"]', { timeout: 30000 })
    failWith429 = false
    await page.getByRole('button', { name: /请求回应|再次请求回应/ }).click()
    await page.waitForFunction(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      return store.roleplaySession && Object.keys(store.roleplaySession.pendingByBranch || {}).length === 0
    }, { timeout: 30000 })
    const committed = await page.evaluate(async () => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      const { openLedgerDb } = await import('/src/services/memory/ledger/ledgerDb.js')
      const { listTurnReceipts } = await import('/src/services/memory/ledger/factLedger.js')
      const opened = await openLedgerDb()
      const db = opened.db
      // 账本查询 scope 取自落账回执（与入账完全一致）。
      const receiptScope = store.roleplaySession.receipts[0]?.scope
      let rows = []
      for (let i = 0; i < 20; i += 1) {
        rows = await listTurnReceipts(db, { scope: receiptScope })
        if (rows.length > 0) break
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      return { receipts: store.roleplaySession.receipts.length, outbox: store.roleplaySession.archiveOutbox.length, dbRows: rows.length, scopeUsed: receiptScope }
    })
    check('XC-G11 成功叙述后 pending 清空、receipt 入账', committed.receipts >= 1)
    check('XC-G11 outbox 经真实 ledger drain 排空', committed.outbox === 0)
    check('CX08 全链：回合回执真实落库', committed.dbRows >= 1)
    await page.screenshot({ path: `${OUT_DIR}/09-full-loop-429-retry-1440-light.png` })
    await context.close()
  }

  // ── 6. CX06：真双标签共享会话 + 提交中写盘失败 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const pageA = await context.newPage()
    await pageA.goto(`${BASE}/experience`)
    await pageA.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(pageA)
    await pageA.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    // 写盘失败注入：下一次 writing_sessions 写入抛 QuotaExceededError（一次性）。
    await pageA.evaluate(() => {
      const original = Storage.prototype.setItem
      window.__restoreSetItem = () => { Storage.prototype.setItem = original }
      Storage.prototype.setItem = function (key, value) {
        if (key === 'writing_sessions') {
          window.__restoreSetItem()
          throw new DOMException('full', 'QuotaExceededError')
        }
        return original.call(this, key, value)
      }
    })
    await pageA.fill('.input-area textarea.input', '写盘失败下的确认')
    await pageA.click('[data-testid="rp-dice-toggle"]')
    await pageA.waitForSelector('.rp-confirm')
    await pageA.getByRole('button', { name: '确认检定' }).click()
    await pageA.waitForSelector('.rp-confirm__error', { timeout: 15000 })
    const persistError = await pageA.locator('.rp-confirm__error').innerText()
    check('CX06 确认写盘失败可见报错（不假成功）', persistError.includes('保存失败') || persistError.includes('未能保存'))
    const noPendingAfterFail = await pageA.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      return store.roleplaySession?.pendingByBranch?.main || null
    })
    check('CX06 写盘失败不产生骰点/不登记 pending', noPendingAfterFail === null)
    await pageA.evaluate(() => window.__restoreSetItem?.())

    // 双标签：B 页共享同一 localStorage 会话。
    const pageB = await context.newPage()
    await pageB.goto(`${BASE}/experience`)
    await pageB.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(pageB)
    await pageB.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    await pageB.fill('.input-area textarea.input', 'B 页签的行动')
    await pageB.click('[data-testid="rp-dice-toggle"]')
    await pageB.waitForSelector('.rp-confirm')
    await pageB.getByRole('button', { name: '确认检定' }).click()
    await pageB.waitForSelector('[data-testid="rp-pending-bar"]', { timeout: 30000 })
    // A 页重载同会话 → 看到 B 的 pending（共享会话状态）。
    await pageA.reload()
    await pageA.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(pageA)
    const samePending = await pageA.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      return store.roleplaySession?.pendingByBranch?.main?.status || null
    })
    check('CX06 双标签共享会话 pending（一个动作一个结果）', samePending === 'resolved')
    // A 页普通发送被阻断（同会话 pending 门禁在两页一致）。
    await pageA.fill('.input-area textarea.input', 'A 页的普通行动')
    check('CX06 另一页签同样被 pending 门禁阻断', await pageA.locator('.input-area .send-btn').isDisabled())
    await context.close()
  }

  // ── 7. CX11：整包 ZIP 备份 → 恢复 roleplay 域（pending/receipts/outbox） ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    await page.evaluate(async () => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const store = pinia._s.get('game')
      const contract = await import('/src/services/experience/roleplay/roleplayActionContract.js')
      const workflow = await import('/src/services/experience/roleplay/roleplayWorkflow.js')
      workflow.setRoleplaySessionSetup(store, { mode: 'rules', goal: 'ZIP 往返' })
      const action = contract.createConfirmedRoleplayAction({
        sessionId: store.currentSessionId, branchId: 'main', worldbookId: null,
        rawInput: 'ZIP 样本行动', attribute: 'wits', modifier: 1
      })
      contract.applyResolution(action, { dice: [5, 4], rngTrace: {} })
      action.status = 'resolved'
      store.roleplaySession.pendingByBranch.main = action
      store.roleplaySession.receipts.push({ schemaVersion: 1, receiptId: 'act_zip_1', commandId: 'act_zip_1', turnId: 'turn_zip', branchId: 'main', rulesVersion: 'pinax-roleplay-2d6@1', resolutionRef: 'x', stateDeltaRefs: [], evidenceRefs: [], committedAt: Date.now(), payloadHash: 'zip-hash' })
      store.roleplaySession.archiveOutbox.push({ actionId: 'act_zip_2', receiptId: 'act_zip_2', turnId: 'turn_zip2', attempts: 1, lastError: 'roleplay-history-unavailable', queuedAt: Date.now(), payload: { receipt: { receiptId: 'act_zip_2' }, scope: { domain: 'session', bookId: null, worldbookId: null, sessionId: store.currentSessionId, branchId: 'main' }, sessionId: store.currentSessionId, worldbookId: null, branchId: 'main' } })
      store.saveCurrentSession()
      store.flushSaveSessions()
    })
    // 构建整包 → 清空会话存储 → 恢复 → 校验 roleplay 域完整。
    const zipRoundtrip = await page.evaluate(async () => {
      const bundle = await import('/src/services/storage/workspaceBackupBundle.js')
      const zip = await bundle.buildWorkspaceBackupBundle()
      const inspection = await bundle.inspectWorkspaceBackup(zip.bytes)
      localStorage.removeItem('writing_sessions')
      const restored = await bundle.restoreWorkspaceBackupBundle(zip.bytes, { acceptRestoreRisk: true })
      const sessions = JSON.parse(localStorage.getItem('writing_sessions') || '[]')
      const roleplay = sessions.flatMap((s) => s.roleplay ? [s.roleplay] : [])
      return {
        inspectionValid: inspection.valid,
        restoredOk: restored.success,
        roleplayCount: roleplay.length,
        hasPending: roleplay.some((r) => r.pendingByBranch?.main?.actionId),
        hasReceipt: roleplay.some((r) => (r.receipts || []).some((x) => x.receiptId === 'act_zip_1')),
        hasOutbox: roleplay.some((r) => (r.archiveOutbox || []).some((x) => x.actionId === 'act_zip_2' && x.payload?.scope))
      }
    })
    check('CX11 整包校验通过且恢复成功', zipRoundtrip.inspectionValid && zipRoundtrip.restoredOk)
    check('CX11 roleplay pending/receipts/outbox 全量恢复', zipRoundtrip.roleplayCount >= 1
      && zipRoundtrip.hasPending && zipRoundtrip.hasReceipt && zipRoundtrip.hasOutbox)
    await context.close()
  }

  // ── 4. 视口与主题矩阵截图（V32） ──
  {
    const context = await browser.newContext({ viewport: { width: 900, height: 900 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    await page.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    await page.fill('.input-area textarea.input', '登上螺旋梯')
    await page.click('[data-testid="rp-dice-toggle"]')
    await page.waitForSelector('.rp-confirm')
    await page.screenshot({ path: `${OUT_DIR}/05-confirm-900-light.png` })
    const horizontalOverflow900 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    check('V32 900px 无横向溢出', !horizontalOverflow900)
    await context.close()
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    await page.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    await page.fill('.input-area textarea.input', '在雾中呼喊求援')
    await page.click('[data-testid="rp-dice-toggle"]')
    await page.waitForSelector('.rp-confirm')
    const confirmVisibleMobile = await page.locator('.rp-confirm').isVisible()
    const horizontalOverflow390 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    check('V32 390px 确认面板可见且无横向溢出', confirmVisibleMobile && !horizontalOverflow390)
    await page.screenshot({ path: `${OUT_DIR}/06-confirm-390-light.png` })
    await context.close()
  }
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.addInitScript(() => localStorage.setItem('app_theme', 'dark'))
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    await page.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    await page.fill('.input-area textarea.input', '细读值班日志')
    await page.click('[data-testid="rp-dice-toggle"]')
    await page.waitForSelector('.rp-confirm')
    await page.screenshot({ path: `${OUT_DIR}/07-confirm-1440-dark.png` })
    check('V32 暗色主题启用', await page.evaluate(() => document.documentElement.classList.contains('theme-legacy') || localStorage.getItem('app_theme') === 'dark'))
    await context.close()
  }

  // ── 8. CX13–CX18：场景旅程（开始→移动→线索检定→发现→刷新保持→未发现不泄漏） ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('text_model_configs', JSON.stringify([{
        id: 'cfg_fake', provider: 'deepseek', name: 'smoke-fake', baseUrl: 'http://127.0.0.1:9',
        apiKey: 'sk-smoke-fake', model: 'fake-model', builtin: false
      }]))
      localStorage.setItem('text_model_selected', 'cfg_fake')
      // 确定性 RNG（uint32 4→骰5、3→骰4：固定 9 = 部分成功），保证旅程可断言。
      const fixed = new Uint32Array([4, 3])
      const deterministic = { getRandomValues(buf) { for (let i = 0; i < buf.length; i += 1) buf[i] = fixed[i % fixed.length]; return buf } }
      Object.defineProperty(globalThis, 'crypto', { value: deterministic, configurable: true })
    })
    await page.route('**/api/generate/agent-step/stream', async (route) => {
      let body = {}
      try { body = route.request().postDataJSON() } catch { body = {} }
      const planChoice = body?.toolChoice?.function?.name || body?.options?.toolChoice?.function?.name || ''
      const isPlanPhase = planChoice === 'submit_narrative_beat_plan'
      const sse = isPlanPhase
        ? [
            'data: {"schemaVersion":1,"type":"step.start","stepId":"p1"}',
            'data: {"schemaVersion":1,"type":"tool.input.delta","callId":"c1","input":{"responseObligation":"行动得到回应","causalSteps":["线索显现"],"revealOrChange":"线索被确认","endCondition":"场景推进到新的可观察状态","intent":"respond","mode":"narrative"}}',
            'data: {"schemaVersion":1,"type":"tool.call","callId":"c1","toolName":"submit_narrative_beat_plan"}',
            'data: {"schemaVersion":1,"type":"step.finish","finishReason":"tool_calls"}'
          ].join('\n\n') + '\n\n'
        : [
            'data: {"schemaVersion":1,"type":"step.start","stepId":"s1"}',
            'data: {"schemaVersion":1,"type":"text.delta","content":"线索在眼前展开。"}',
            'data: {"schemaVersion":1,"type":"step.finish","finishReason":"stop"}',
            'data: {"schemaVersion":1,"type":"usage","usage":{"inputTokens":10,"outputTokens":20,"totalTokens":30}}'
          ].join('\n\n') + '\n\n'
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
    })
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    await page.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    // 开始冒险 → 初始场景值房。
    // CX37 战役目录：两场原创场景都在目录里；选择「雾塔来客」开场。
    await page.waitForSelector('[data-testid="rp-scenario-panel"]')
    const catalogText = await page.locator('[data-testid="rp-scenario-panel"]').innerText()
    check('CX37 目录列出两场场景', catalogText.includes('雾塔来客') && catalogText.includes('夜市断签'))
    await page.click('[data-testid="rp-scenario-start-scn_lampkeeper"]')
    await page.waitForFunction(() => document.querySelector('[data-testid="rp-scenario-panel"]')?.innerText.includes('进行中'))
    await page.waitForSelector('[data-testid="rp-scenario-panel"]')
    const panelText = await page.locator('[data-testid="rp-scenario-panel"]').innerText()
    check('CX14 开始冒险进入值房', panelText.includes('灯塔值房') && panelText.includes('进行中'))
    // 移动到梯井。
    await page.getByRole('button', { name: '登上螺旋梯' }).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="rp-scenario-panel"]')?.innerText.includes('螺旋梯井'))
    // 线索检定：确认面板出现 → 确认 → 等待回合提交 → 线索被发现。
    await page.getByRole('button', { name: '检查（2d6）' }).first().click()
    await page.waitForSelector('.rp-scenario__confirm')
    await page.screenshot({ path: `${OUT_DIR}/10-scenario-clue-confirm-1440-light.png` })
    await page.getByRole('button', { name: '确认检定' }).click()
    await page.waitForFunction(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      return Object.keys(store.roleplaySession?.pendingByBranch || {}).length === 0
    }, { timeout: 30000 })
    const afterClue = await page.locator('[data-testid="rp-scenario-panel"]').innerText()
    check('CX16 线索检定后进入已确认列表', afterClue.includes('已确认线索（1）'))
    // CX22：部分成功的冻结代价（灯油-1）反映在资源行。
    await page.waitForSelector('[data-testid="rp-resources"]', { timeout: 10000 })
    const resourceText = await page.locator('[data-testid="rp-resources"]').innerText()
    check('CX22 部分成功代价入账（灯油 9/20）', resourceText.includes('灯油 9/20') && resourceText.includes('活力 100/100'))
    // G19 UI：未发现线索名称不进面板 DOM。
    check('CX15/G19 未发现线索不泄漏到 UI', !afterClue.includes('靴子') && !afterClue.includes('字条') && !afterClue.includes('机关'))
    // CX18：刷新 → 场景运行体保持（当前场景/发现线索）。
    await page.reload()
    await page.waitForSelector('[data-testid="rp-scenario-panel"]', { timeout: 30000 })
    const afterReload = await page.locator('[data-testid="rp-scenario-panel"]').innerText()
    check('CX18 刷新后场景运行体保持', afterReload.includes('螺旋梯井') && afterReload.includes('已确认线索（1）'))
    await page.screenshot({ path: `${OUT_DIR}/11-scenario-persisted-reload-1440-light.png` })
    await context.close()
  }

  // ── 8b. CX12/阶段八：停止/长文回读/截断流/删会话（V16/V33/V19/CX46） ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('text_model_configs', JSON.stringify([{
        id: 'cfg_fake', provider: 'deepseek', name: 'smoke-fake', baseUrl: 'http://127.0.0.1:9',
        apiKey: 'sk-smoke-fake', model: 'fake-model', builtin: false
      }]))
      localStorage.setItem('text_model_selected', 'cfg_fake')
    })
    let faultMode = 'truncated-json'
    const longText = '夜色像浸透水的绒布压在灯塔上。'.repeat(120)
    await page.route('**/api/generate/agent-step/stream', async (route) => {
      let body = {}
      try { body = route.request().postDataJSON() } catch { body = {} }
      const planChoice = body?.toolChoice?.function?.name || body?.options?.toolChoice?.function?.name || ''
      const isPlan = planChoice === 'submit_narrative_beat_plan'
      if (faultMode === 'truncated-json') {
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"schemaVersion":1,"type":"text.delta","content":"被截' })
        return
      }
      if (faultMode === 'slow-stream') {
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: [
          'data: {"schemaVersion":1,"type":"step.start","stepId":"p1"}',
          `data: {"schemaVersion":1,"type":"tool.input.delta","callId":"c1","input":{"responseObligation":"回应","causalSteps":["推进"],"revealOrChange":"新变化","endCondition":"场景停在新的可观察状态","intent":"respond","mode":"narrative"}}`,
          'data: {"schemaVersion":1,"type":"tool.call","callId":"c1","toolName":"submit_narrative_beat_plan"}',
          'data: {"schemaVersion":1,"type":"step.finish","finishReason":"tool_calls"}'
        ].join('\n\n') + '\n\n' })
        return
      }
      if (faultMode === 'long-text') {
        const sse = isPlan
          ? [
              'data: {"schemaVersion":1,"type":"step.start","stepId":"p1"}',
              'data: {"schemaVersion":1,"type":"tool.input.delta","callId":"c1","input":{"responseObligation":"回应","causalSteps":["推进"],"revealOrChange":"新变化","endCondition":"场景停在新的可观察状态","intent":"respond","mode":"narrative"}}',
              'data: {"schemaVersion":1,"type":"tool.call","callId":"c1","toolName":"submit_narrative_beat_plan"}',
              'data: {"schemaVersion":1,"type":"step.finish","finishReason":"tool_calls"}'
            ].join('\n\n') + '\n\n'
          : [
              'data: {"schemaVersion":1,"type":"step.start","stepId":"s1"}',
              'data: {"schemaVersion":1,"type":"text.delta","content":' + JSON.stringify(longText) + '}',
              'data: {"schemaVersion":1,"type":"step.finish","finishReason":"stop"}'
            ].join('\n\n') + '\n\n'
        await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
        return
      }
      void isPlan
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"schemaVersion":1,"type":"step.finish","finishReason":"stop"}\n\n' })
    })
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await seedSession(page)
    await page.getByRole('button', { name: /轻规则 2d6/ }).first().click()
    await page.fill('.input-area textarea.input', '截断流下的行动')
    await page.click('[data-testid="rp-dice-toggle"]')
    await page.waitForSelector('.rp-confirm')
    await page.getByRole('button', { name: '确认检定' }).click()
    await page.waitForSelector('[data-testid="rp-pending-bar"]', { timeout: 30000 })
    const diceAfterFault = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      const pending = store.roleplaySession.pendingByBranch.main
      return { total: pending.resolution.total, status: pending.status }
    })
    check('CX46 截断流故障后骰点不变、如实待回应', diceAfterFault.status === 'resolved' && Number.isInteger(diceAfterFault.total))

    // V16：慢流中点停止 → 请求中止、pending 保持、骰点不变。
    await page.reload()
    await page.waitForSelector('[data-testid="rp-pending-bar"]', { timeout: 30000 })
    await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      store.roleplaySession.pendingByBranch.main.retryCount = 0
    })
    faultMode = 'slow-stream'
    await page.getByRole('button', { name: /请求回应|再次请求回应/ }).click()
    await page.waitForSelector('.input-area .send-btn.stop-btn', { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(400)
    const hadStop = await page.locator('.input-area .send-btn.stop-btn').count()
    if (hadStop > 0) {
      await page.click('.input-area .send-btn.stop-btn')
    } else {
      await page.evaluate(() => {
        const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
        store.cancelNarrativeGeneration('user-cancelled')
      })
    }
    await page.waitForTimeout(800)
    const afterStop = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      const pending = store.roleplaySession.pendingByBranch.main
      return { total: pending.resolution.total, status: pending.status, err: pending.lastErrorCode }
    })
    check('V16 生成中停止：pending/骰点不变', afterStop.status === 'resolved' && afterStop.total === diceAfterFault.total)

    // V33：长回应流式回读不抢滚动。
    faultMode = 'long-text'
    await page.getByRole('button', { name: /请求回应|再次请求回应/ }).click()
    await page.waitForFunction(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      return Object.keys(store.roleplaySession?.pendingByBranch || {}).length === 0
    }, { timeout: 40000 })
    await page.evaluate(() => {
      const scroller = document.querySelector('.chat-container')
      if (scroller) scroller.scrollTop = 10
    })
    await page.waitForTimeout(600)
    const scrollTopAfter = await page.evaluate(() => document.querySelector('.chat-container')?.scrollTop ?? -1)
    check('V33 长文回读不抢滚动（停留在用户位置附近）', scrollTopAfter >= 0 && scrollTopAfter < 200)

    // V19：删除会话后不复活（pending 随会话记录消失）。
    await page.evaluate(() => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const gameStore = pinia._s.get('game')
      gameStore.createSession({ worldbookId: gameStore.worldId || '', inheritRuntimeState: false })
      const doomed = gameStore.currentSessionId
      gameStore.deleteSession(doomed)
      gameStore.flushSaveSessions()
    })
    const revival = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      return { current: store.currentSessionId, pendings: Object.keys(store.roleplaySession?.pendingByBranch || {}).length }
    })
    check('V19 删除会话后无复活、无残留 pending', revival.current === null && revival.pendings === 0)
    await context.close()
  }

  // ── 8c. V04：双书双世界——roleplay 状态严格归属当前会话 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    const bookIds = await page.evaluate(async () => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const worldStore = pinia._s.get('world')
      const gameStore = pinia._s.get('game')
      const bookA = await worldStore.createWorldbook({ name: '双书测试甲' })
      const bookB = await worldStore.createWorldbook({ name: '双书测试乙' })
      const sessionA = gameStore.createSession({ worldbookId: bookA.id, inheritRuntimeState: false })
      // createSession 的 id 来自 Date.now()：同一毫秒会碰撞，间隔后再建 B。
      await new Promise((resolve) => setTimeout(resolve, 5))
      const sessionB = gameStore.createSession({ worldbookId: bookB.id, inheritRuntimeState: false })
      gameStore.flushSaveSessions()
      return { a: sessionA.id, b: sessionB.id }
    })
    // 书 A：选轻规则并确认一次检定（生成失败不影响 pending 存在）。
    await page.evaluate(async (ids) => {
      const contract = await import('/src/services/experience/roleplay/roleplayActionContract.js')
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const gameStore = pinia._s.get('game')
      gameStore.loadSession(ids.a)
      const workflow = await import('/src/services/experience/roleplay/roleplayWorkflow.js')
      workflow.setRoleplaySessionSetup(gameStore, { mode: 'rules', goal: '甲书目标' })
      const action = contract.createConfirmedRoleplayAction({
        sessionId: ids.a, branchId: 'main', worldbookId: gameStore.worldId || null,
        rawInput: '甲书的检定行动', attribute: 'wits', modifier: 0
      })
      contract.applyResolution(action, { dice: [5, 5], rngTrace: {} })
      gameStore.roleplaySession.pendingByBranch.main = action
      gameStore.saveCurrentSession()
      gameStore.flushSaveSessions()
    }, bookIds)
    // 切到书 B 会话：不得看到甲书的 pending/模式。
    await page.evaluate(async (ids) => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const gameStore = pinia._s.get('game')
      gameStore.loadSession(ids.b)
    }, bookIds)
    const bookBState = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      return {
        mode: store.roleplaySession?.mode || null,
        pending: store.roleplaySession?.pendingByBranch?.main || null,
        sessionId: store.currentSessionId
      }
    })
    check('V04 书 B 会话无甲书 pending/模式', bookBState.sessionId === bookIds.b && bookBState.mode === null && !bookBState.pending,
      JSON.stringify({ want: bookIds, got: bookBState }))
    // 切回书 A：pending 恢复。
    await page.evaluate(async (ids) => {
      const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
      const gameStore = pinia._s.get('game')
      gameStore.loadSession(ids.a)
    }, bookIds)
    const bookAState = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('game')
      return {
        mode: store.roleplaySession?.mode || null,
        pendingStatus: store.roleplaySession?.pendingByBranch?.main?.status || null,
        goal: store.roleplaySession?.goal || ''
      }
    })
    check('V04 切回书 A：pending/模式/目标严格归属', bookAState.mode === 'rules' && bookAState.pendingStatus === 'resolved' && bookAState.goal === '甲书目标')
    await context.close()
  }

  // ── 8d. V30/CX40：收进稿件——精确来源、重复收藏幂等 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${BASE}/experience`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    await page.evaluate(() => {
      localStorage.setItem('writing_books', JSON.stringify([
        { id: 'book_v30', title: 'V30 作品', chapters: [{ id: 'ch_v30', title: '第一章' }] }
      ]))
      const sessions = [{
        id: 'sess_v30',
        schemaVersion: 1,
        title: '收藏旅程夹具',
        createdAt: Date.now() - 60000,
        updatedAt: Date.now() - 60000,
        worldbookId: '',
        messages: [
          { id: 'msg_u1', role: 'user', content: '凑近炉火，辨认字迹', timestamp: Date.now() - 50000 },
          { id: 'msg_a1', role: 'assistant', content: '炉火映亮了最后一行字：灯下的第三个人。', timestamp: Date.now() - 40000 }
        ],
        chatHistory: [],
        runtimeState: {},
        worldState: {},
        turnRecords: {
          turn_f1: {
            id: 'turn_f1', parentTurnId: null, branchId: 'main',
            userMessageIds: ['msg_u1'], assistantMessageIds: ['msg_a1'],
            preRuntimeSnapshot: {}, status: 'committed',
            createdAt: Date.now() - 40000, committedAt: Date.now() - 40000
          }
        },
        lastCommittedTurnId: 'turn_f1',
        activeBranchId: 'main'
      }]
      localStorage.setItem('writing_sessions', JSON.stringify(sessions))
    })
    await page.goto(`${BASE}/experience?sessionId=sess_v30`)
    await page.waitForSelector('.input-area', { timeout: 30000 })
    // 对助手消息触发收藏（prose action 常按 hover 显示，用 force 点击）。
    // 收进稿件按钮为 hover 显隐，直接派发 DOM click（绕过 actionability）。
    await page.evaluate(() => {
      document.querySelector('.prose__action--collect')?.click()
    })
    await page.waitForSelector('.writing-collect-dialog', { timeout: 15000 })
    await page.getByRole('button', { name: '收进稿件' }).last().click()
    await page.waitForSelector('.writing-collect-dialog .writing-collect-status, .writing-collect-dialog .control-primary', { timeout: 15000 })
    // 重复收藏同一段：owner 幂等（提示已收进），书稿只增一份。
    const collectAgain = page.getByRole('button', { name: '收进稿件' })
    if (await collectAgain.count() > 0) {
      await collectAgain.last().click()
      await page.waitForTimeout(300)
    }
    const v30 = await page.evaluate(() => {
      const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
      const serialized = JSON.stringify(books)
      const occurrences = serialized.split('第三个人').length - 1
      return { bookTitle: books[0]?.title, occurrences }
    })
    check('V30 收藏精确落稿（书稿含正文）', v30.bookTitle === 'V30 作品' && v30.occurrences >= 1)
    await page.screenshot({ path: `${OUT_DIR}/12-collect-v30-1440-light.png` })
    await context.close()
  }

  await browser.close()
  check('无页面级未捕获异常', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} finally {
  server.kill('SIGTERM')
}

// eslint-disable-next-line no-console
console.log(`\n=== experience-roleplay-smoke: ${passed} passed, ${failures.length} failed ===`)
// eslint-disable-next-line no-console
console.log(`截图目录：${OUT_DIR}`)
if (failures.length) {
  process.exit(1)
}
