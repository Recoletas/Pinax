#!/usr/bin/env node
/**
 * C4 · Notes 素材工作台代表旅程 smoke（合成数据，隔离 context，provider 请求拦截）。
 *
 * 覆盖：
 *  J1 新建→编辑→去抖窗口内立即切换→切回内容不丢→刷新仍在（保存前切换合同）
 *  J2 标题去抖保存后刷新仍在
 *  J3 勾选→归档→归档项从活动列表消失且选中回落
 *  J4 送入画布→重复送入幂等反馈
 *  J5 (C3) 生成专业信息期间切换素材：结果归属发起素材，不劫持导航，画布卡建在原素材
 *
 * 环境变量：SMOKE_FRONTEND_PORT(默认5200) SMOKE_BACKEND_PORT(默认3013) SMOKE_OUT_DIR
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import net from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRONT_PORT = Number(process.env.SMOKE_FRONTEND_PORT || 5200)
const BACK_PORT = Number(process.env.SMOKE_BACKEND_PORT || 3013)
const OUT_DIR = resolve(process.env.SMOKE_OUT_DIR || join(root, 'tmp', 'notes-smoke'))
const BASE_URL = `http://127.0.0.1:${FRONT_PORT}`
const nodeBin = process.execPath

const children = []
let failed = false

function log(message) {
  console.log(`[notes-smoke] ${message}`)
}

async function waitUntil(fn, label, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`ready 超时：${label}`)
}

function probePort(port) {
  return new Promise((resolveProbe) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (v) => { socket.destroy(); resolveProbe(v) }
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
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`))
  log(`${name} started pid=${child.pid}`)
}

async function stopAll() {
  for (const { name, child } of children.reverse()) {
    if (child.exitCode !== null) continue
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* 已退出 */ }
    const exited = new Promise((r) => child.once('exit', r))
    await Promise.race([exited, new Promise((r) => setTimeout(r, 1500))])
    try { if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL') } catch { /* 同上 */ }
    log(`stopped ${name}`)
  }
}

async function createNoteViaUi(page, title) {
  await page.getByTitle('新建素材').click()
  const modalInput = page.locator('.input[placeholder="输入素材标题"]')
  try {
    await modalInput.waitFor({ state: 'visible', timeout: 3000 })
  } catch {
    // SPA 返回后重渲染可能吞掉首次点击；补一次有界重试
    await page.getByTitle('新建素材').click()
    await modalInput.waitFor({ state: 'visible', timeout: 10_000 })
  }
  await modalInput.fill(title)
  await page.locator('.modal-footer .btn-primary').click()
  await page.locator('.chapter-title-input').waitFor({ timeout: 10_000 })
}

async function typeMarkdown(page, text) {
  await page.getByTitle('Markdown源码').click()
  const textarea = page.locator('.markdown-textarea')
  await textarea.waitFor({ timeout: 10_000 })
  await textarea.fill(text)
  // 触发 input 事件（fill 已触发）并让 debounce 记时开始
  await page.waitForTimeout(150)
}

async function runJourney(page) {
  // J1 新建→编辑→立即切换→切回
  log('J1: 新建素材并编辑，去抖窗口内立即切换')
  await createNoteViaUi(page, '旅程素材甲')
  await typeMarkdown(page, '# 甲的正文\n\n去抖窗口内切换不能丢这一段。')
  const nextDisabled = await page.getByTitle('下一张').isDisabled() // 只有一张时应禁用
  if (!nextDisabled) throw new Error('J1 前置失败：只有一张素材时“下一张”应禁用')
  await createNoteViaUi(page, '旅程素材乙')
  // 立即切回甲（此时乙的正文为空、甲的去抖保存已在 selectChapter 同步落盘）
  await page.locator('.index-card', { hasText: '旅程素材甲' }).first().click()
  await page.getByTitle('Markdown源码').click()
  const backText = await page.locator('.markdown-textarea').inputValue()
  if (!backText.includes('去抖窗口内切换不能丢这一段')) throw new Error('J1 失败：切换后甲的正文丢失')

  // J2 标题去抖保存 + 刷新持久化
  log('J2: 改标题与正文后刷新，内容仍在')
  await page.locator('.chapter-title-input').fill('旅程素材甲·改')
  await page.waitForTimeout(900) // 越过 500ms 标题去抖
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.index-card').first().waitFor({ timeout: 15_000 })
  await page.locator('.index-card', { hasText: '旅程素材甲' }).first().click()
  await page.locator('.chapter-title-input').waitFor({ timeout: 15_000 })
  const titleAfterReload = await page.locator('.chapter-title-input').inputValue()
  if (!titleAfterReload.includes('旅程素材甲')) throw new Error(`J2 失败：刷新后标题为「${titleAfterReload}」`)
  await page.getByTitle('Markdown源码').click()
  const textAfterReload = await page.locator('.markdown-textarea').inputValue()
  if (!textAfterReload.includes('去抖窗口内切换不能丢这一段')) throw new Error('J2 失败：刷新后正文丢失')

  // J3 勾选→归档→选中回落
  log('J3: 勾选两张并归档，选中回落到剩余素材')
  await createNoteViaUi(page, '旅程素材丙')
  const cards = page.locator('.index-card')
  const countBefore = await cards.count()
  await page.locator('.index-card__check').first().check()
  await page.locator('.index-card__check').nth(1).check()
  await page.getByRole('button', { name: '归档', exact: true }).click()
  await page.waitForTimeout(400)
  const countAfter = await cards.count()
  if (countAfter >= countBefore) throw new Error('J3 失败：归档后活动列表未减少')
  await page.locator('.chapter-title-input').waitFor({ timeout: 10_000 })
  log(`J3: 活动素材 ${countBefore} → ${countAfter}`)

  // J3b (C11)：钉住偏好不保留已归档/已删除素材的 id
  await page.waitForTimeout(400)
  const pinnedState = await page.evaluate(() => JSON.parse(localStorage.getItem('pinax_notes_pinned_slips_v1') || '{}'))
  const pinnedCount = Array.isArray(pinnedState.ids) ? pinnedState.ids.length : 0
  if (pinnedState.ids?.includes('stale-asset-x') || pinnedState.ids?.includes('stale-asset-y')) {
    throw new Error('J3b 失败：钉住偏好仍保留陈旧素材 id')
  }
  if (!Array.isArray(pinnedState.ids)) {
    throw new Error('J3b 失败：裁剪结果未回写 localStorage')
  }
  if (pinnedCount > countAfter) {
    throw new Error(`J3b 失败：钉住偏好 ${pinnedCount} 项 > 活动素材 ${countAfter} 项（未裁剪）`)
  }
  log(`J3b: 陈旧 id 已裁剪并回写（偏好钉住 ${pinnedCount} 项 / 活动 ${countAfter} 项）`)

  // J4 送入画布幂等：同一素材两次送入，画布卡不重复
  log('J4: 送入画布后重复操作不产生重复画布卡')
  const countCanvasCards = () => page.evaluate(() => {
    const cards = JSON.parse(localStorage.getItem('prose_cards_v1') || '[]')
    return Array.isArray(cards) ? cards.length : 0
  })
  await page.locator('.index-card__check').first().check()
  await page.getByRole('button', { name: '送入画布', exact: true }).click()
  await page.waitForURL('**/prose-essay**', { timeout: 15_000 })
  const cardsAfterFirst = await countCanvasCards()
  if (cardsAfterFirst !== 1) throw new Error(`J4 失败：首次送入后画布卡 ${cardsAfterFirst} 张`)
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await page.locator('.index-card__check').first().waitFor({ timeout: 15_000 })
  // 等待图片 hydrate 异步替换 chapters 完成，避免勾选点击落在重渲染窗口内丢失 change 事件
  await page.waitForTimeout(900)
  await page.locator('.index-card__check').first().check()
  await page.getByRole('button', { name: '送入画布', exact: true }).click()
  await page.waitForURL('**/prose-essay**', { timeout: 15_000 })
  const cardsAfterSecond = await countCanvasCards()
  if (cardsAfterSecond !== 1) throw new Error(`J4 失败：重复送入后画布卡 ${cardsAfterSecond} 张（应幂等）`)
  log(`J4: 两次送入后画布卡 ${cardsAfterSecond} 张（幂等）`)
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await page.locator('.index-card').first().waitFor({ timeout: 15_000 })

  // J5 (C3) 生成期间切换素材：结果归属发起素材，不劫持导航
  log('J5: 生成专业信息期间切换素材，验证来源归属')
  // 补第二张素材（归档后只剩一张，切换需要目标）；回到第一张作为生成来源
  await createNoteViaUi(page, '旅程素材丁')
  await page.locator('.index-card', { hasText: '旅程素材甲' }).first().click()
  const sourceTitle = await page.locator('.chapter-title-input').inputValue()
  if (!sourceTitle.includes('旅程素材甲')) throw new Error('J5 前置失败：未选中生成来源素材')
  await page.route('**/api/**', async (route) => {
    await new Promise((r) => setTimeout(r, 1200))
    await route.abort()
  })
  await page.getByRole('button', { name: '生成专业信息' }).click()
  // 生成进行中：立即切到另一张素材（丁）
  await page.locator('.index-card', { hasText: '旅程素材丁' }).first().click()
  await page.waitForTimeout(2500)
  const url = page.url()
  if (url.includes('prose-essay')) throw new Error('J5 失败：生成期间切换后仍被导航劫持到画布')
  // 原素材应已入画布（✓ 标记），且给出不劫持的反馈
  const originalCard = page.locator('.index-card', { hasText: sourceTitle }).first()
  await originalCard.locator('.index-card__canvas-mark').waitFor({ timeout: 15_000 })
  const lateFeedback = await page.locator('.canvas-transfer-feedback').textContent().catch(() => '')
  log(`J5: 原素材「${sourceTitle}」画布卡建立；反馈 = ${String(lateFeedback || '').trim() || '（无）'}`)
  await page.unroute('**/api/**')

  // J6 (P0)：配额失败 → 切换被阻止、输入保留、storage 仍为旧值；恢复后重试成功
  log('J6: 存储写入失败时阻止切换并保留输入')
  await page.locator('.index-card', { hasText: '旅程素材甲' }).first().click()
  await page.getByTitle('Markdown源码').click()
  const j6Textarea = page.locator('.markdown-textarea')
  await j6Textarea.fill((await j6Textarea.inputValue()) + '\n\n配额失败时这一行不能丢。')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    window.__origSetItem = original
    Storage.prototype.setItem = function (key, value) {
      if (String(key).includes('narrative_assets_v1')) {
        throw new Error('QuotaExceededError: 模拟配额失败')
      }
      return original.call(this, key, value)
    }
  })
  await page.locator('.index-card', { hasText: '旅程素材丁' }).first().click()
  await page.waitForTimeout(400)
  const stillSelected = await page.locator('.index-card.is-selected', { hasText: '旅程素材甲' }).count()
  if (stillSelected !== 1) throw new Error('J6 失败：保存失败后选择未保持在原素材')
  await page.getByTitle('Markdown源码').click()
  const keptText = await page.locator('.markdown-textarea').inputValue()
  if (!keptText.includes('配额失败时这一行不能丢')) throw new Error('J6 失败：未保存输入被清掉')
  const rawDuringFailure = await page.evaluate(() => localStorage.getItem('narrative_assets_v1') || '')
  if (rawDuringFailure.includes('配额失败时这一行不能丢')) throw new Error('J6 失败：失败写入仍污染了存储')
  const chipText = await page.locator('.manuscript-top__chip').first().textContent()
  if (!chipText.includes('保存失败')) throw new Error(`J6 失败：保存状态为「${chipText.trim()}」`)
  const blockFeedback = await page.locator('.canvas-transfer-feedback').textContent()
  if (!blockFeedback.includes('已取消')) throw new Error(`J6 失败：缺少阻止反馈（${blockFeedback.trim()}）`)
  await page.evaluate(() => { Storage.prototype.setItem = window.__origSetItem })
  await page.locator('.index-card', { hasText: '旅程素材丁' }).first().click()
  await page.waitForTimeout(400)
  const oldCardSelected = await page.locator('.index-card.is-selected', { hasText: '旅程素材甲' }).count()
  if (oldCardSelected !== 0) throw new Error('J6 失败：恢复存储后重试切换仍未发生')
  const rawAfterRetry = await page.evaluate(() => localStorage.getItem('narrative_assets_v1') || '')
  if (!rawAfterRetry.includes('配额失败时这一行不能丢')) throw new Error('J6 失败：恢复后重试保存未落盘')
  log('J6: 配额失败阻止切换、输入保留、恢复后重试成功')

  // J6a：删除其他素材时保护当前草稿（刷新目录不得重装编辑器）
  log('J6a: 删除其他素材，当前草稿不丢')
  await page.locator('.index-card', { hasText: '旅程素材甲' }).first().click()
  await page.getByTitle('Markdown源码').click()
  const j6aTextarea = page.locator('.markdown-textarea')
  await j6aTextarea.fill((await j6aTextarea.inputValue()) + '\n\nJ6A_删除他人时不丢这一行。')
  await page.locator('.index-card', { hasText: '旅程素材丁' }).first().locator('.index-card__delete').click()
  await page.waitForTimeout(600)
  const j6aSelected = await page.locator('.index-card.is-selected', { hasText: '旅程素材甲' }).count()
  if (j6aSelected !== 1) throw new Error('J6a 失败：删除他人后选择漂移')
  const j6aText = await page.locator('.markdown-textarea').inputValue()
  if (!j6aText.includes('J6A_删除他人时不丢这一行')) throw new Error('J6a 失败：删除他人后编辑器草稿被覆盖')
  const j6aRaw = await page.evaluate(() => localStorage.getItem('narrative_assets_v1') || '')
  if (!j6aRaw.includes('J6A_删除他人时不丢这一行')) throw new Error('J6a 失败：当前草稿未被保护性保存')
  log('J6a: 选择保持在甲、草稿在编辑器与 storage 双确认')

  // J6b：同 id 激活是保留草稿的 no-op（旧实现会从 storage 重装并覆盖草稿）
  log('J6b: 点击已选中的素材不重装编辑器')
  await page.locator('.markdown-textarea').fill((await page.locator('.markdown-textarea').inputValue()) + '\nJ6B_同id点击不丢。')
  await page.waitForTimeout(150)
  await page.locator('.index-card.is-selected', { hasText: '旅程素材甲' }).first().click()
  await page.waitForTimeout(400)
  const j6bText = await page.locator('.markdown-textarea').inputValue()
  if (!j6bText.includes('J6B_同id点击不丢')) throw new Error('J6b 失败：同 id 激活重装编辑器覆盖了草稿')
  log('J6b: 同 id 激活 no-op，草稿保留')

  // J6c：material-domain 修订复核纳入编辑真源——草稿变化 → stale、零事务写入
  log('J6c: 顾问 domain 采用前，未落盘草稿触发 stale')
  const j6cTextarea = page.locator('.markdown-textarea')
  await j6cTextarea.fill((await j6cTextarea.inputValue()) + '\nJ6C_草稿变化必须stale。')
  await page.waitForTimeout(150)
  const j6cOutcome = await page.evaluate(async () => {
    const assets = JSON.parse(localStorage.getItem('narrative_assets_v1') || '[]')
    const target = assets.find((asset) => (asset.title || '').includes('旅程素材甲'))
    if (!target) return { error: '找不到目标素材' }
    const mod = await import('/src/services/agents/creativeGraphAgentContext.js')
    const el = document.querySelector('.writing-page')
    const instance = el && el.__vueParentComponent
    const handler = instance && instance.setupState && instance.setupState.applyMaterialAdvisorResult
    if (typeof handler !== 'function') return { error: '无法访问生产 applyMaterialAdvisorResult' }
    const before = JSON.parse(localStorage.getItem('narrative_assets_v1') || '[]').find((a) => a.id === target.id)
    const result = {
      id: 'smoke-j6c',
      target: { kind: 'asset', id: target.id, revision: mod.createContentRevision(before.content) },
      actions: [{ type: 'material-classification', payload: { changes: [{ assetId: target.id, kind: 'event' }] } }]
    }
    handler(result)
    const after = JSON.parse(localStorage.getItem('narrative_assets_v1') || '[]').find((a) => a.id === target.id)
    return { kindBefore: before.kind, kindAfter: after.kind }
  })
  if (j6cOutcome.error) throw new Error(`J6c 失败：${j6cOutcome.error}`)
  if (j6cOutcome.kindAfter !== j6cOutcome.kindBefore) throw new Error(`J6c 失败：草稿变化未触发 stale，事务已写入（kind ${j6cOutcome.kindBefore}→${j6cOutcome.kindAfter}）`)
  const j6cText = await page.locator('.markdown-textarea').inputValue()
  if (!j6cText.includes('J6C_草稿变化必须stale')) throw new Error('J6c 失败：草稿被事务覆盖')
  log(`J6c: stale 生效、零事务写入（kind 保持 ${j6cOutcome.kindBefore}）`)

  // J6d：mutation 持久化失败 → 不产生假成功；恢复后重试成功
  log('J6d: 状态变更落盘失败时不产生假成功')
  await createNoteViaUi(page, '旅程素材戊')
  await page.locator('.index-card', { hasText: '旅程素材戊' }).first().locator('.index-card__check').check()
  const j6dTargetId = await page.evaluate(() => {
    const assets = JSON.parse(localStorage.getItem('narrative_assets_v1') || '[]')
    const wu = assets.find((a) => (a.title || '').includes('旅程素材戊'))
    return wu ? wu.id : null
  })
  if (!j6dTargetId) throw new Error('J6d 前置失败：找不到戊素材')
  // 只拦截“戊 → archived”的状态写入，让保存门禁正常通过、精准命中 durable 分支
  await page.evaluate((targetId) => {
    const original = Storage.prototype.setItem
    window.__origSetItemJ6d = original
    Storage.prototype.setItem = function (key, value) {
      if (String(key).includes('narrative_assets_v1')
        && String(value).includes(targetId)
        && String(value).includes('"archived"')) {
        throw new Error('QuotaExceededError: J6D 模拟状态写入失败')
      }
      return original.call(this, key, value)
    }
  }, j6dTargetId)
  await page.getByRole('button', { name: '归档', exact: true }).click()
  await page.waitForTimeout(500)
  const j6dCount = await page.locator('.index-card').count()
  const j6dWuStatus = await page.evaluate((targetId) => {
    const assets = JSON.parse(localStorage.getItem('narrative_assets_v1') || '[]')
    const wu = assets.find((a) => a.id === targetId)
    return wu ? wu.status : 'missing'
  }, j6dTargetId)
  if (j6dCount < 2) throw new Error('J6d 失败：落盘失败的归档仍使素材从活动列表消失')
  if (j6dWuStatus === 'archived') throw new Error(`J6d 失败：失败写入仍污染了存储（戊 status=${j6dWuStatus}）`)
  const j6dFeedback = await page.locator('.canvas-transfer-feedback').textContent()
  if (!j6dFeedback.includes('存储写入失败')) throw new Error(`J6d 失败：缺少 durable 失败反馈（${j6dFeedback.trim()}）`)
  await page.evaluate(() => { Storage.prototype.setItem = window.__origSetItemJ6d })
  await page.getByRole('button', { name: '归档', exact: true }).click()
  await page.waitForTimeout(500)
  const j6dCountAfter = await page.locator('.index-card').count()
  if (j6dCountAfter >= j6dCount) throw new Error('J6d 失败：恢复存储后重试归档仍未生效')
  log(`J6d: 失败时假成功被拦截（${j6dCount} 张保持），恢复后重试成功（${j6dCountAfter} 张）`)

  // 截图存档
  await page.screenshot({ path: join(OUT_DIR, 'notes-final-1440.png'), fullPage: false })
  log('journey complete')
}

async function main() {
  log(`root=${root} front=${FRONT_PORT} back=${BACK_PORT} out=${OUT_DIR}`)
  for (const port of [FRONT_PORT, BACK_PORT]) {
    if (await probePort(port)) throw new Error(`端口 ${port} 已被占用`)
  }
  await mkdir(OUT_DIR, { recursive: true })

  startProcess('server', nodeBin, ['server/index.js'], { PORT: String(BACK_PORT) })
  await waitUntil(() => httpReachable(`http://127.0.0.1:${BACK_PORT}/api/rooms`), `backend :${BACK_PORT}`)
  startProcess('vite', nodeBin, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(FRONT_PORT), '--strictPort'], {
    PINAX_DEV_BACKEND_ORIGIN: `http://127.0.0.1:${BACK_PORT}`
  })
  await waitUntil(() => httpReachable(BASE_URL), `frontend :${FRONT_PORT}`)

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    // 网络守卫：跨 origin 请求一律 abort 并记录（provider 请求必然被拦截）
    const blocked = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin === BASE_URL || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      blocked.push(url.origin + url.pathname)
      return route.abort()
    })
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)))
    page.on('dialog', (dialog) => dialog.accept())

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    // C11 预置：含陈旧 id 的钉住偏好，验证加载后裁剪并回写
    await page.evaluate(() => localStorage.setItem('pinax_notes_pinned_slips_v1', JSON.stringify({
      ids: ['stale-asset-x', 'stale-asset-y'],
      positions: { 'stale-asset-x': { x: 12, y: 34 } }
    })))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.goto(`${BASE_URL}/materials`, { waitUntil: 'domcontentloaded' })
    await page.locator('.chapter-title-input, .drawer-empty').first().waitFor({ timeout: 20_000 })

    try {
      await runJourney(page)
    } catch (error) {
      failed = true
      console.error('[notes-smoke] journey FAILED:', error?.message || error)
      await page.screenshot({ path: join(OUT_DIR, 'notes-failure.png'), fullPage: true }).catch(() => {})
    }
    if (pageErrors.length > 0) {
      failed = true
      console.error('[notes-smoke] 页面运行时错误:', pageErrors.slice(0, 3).join(' | '))
    }
    if (blocked.length > 0) {
      // provider 请求被 J5 的延迟路由与守卫拦截属预期；除此之外的外发视为泄漏
      const unexpected = blocked.filter((item) => !item.includes('/api/'))
      if (unexpected.length > 0) {
        failed = true
        console.error('[notes-smoke] 未预期的外发请求:', [...new Set(unexpected)].slice(0, 5).join(', '))
      }
    }
  } finally {
    await browser.close()
  }

  if (failed) {
    console.error('[notes-smoke] RESULT: FAIL')
    process.exitCode = 1
  } else {
    console.log(`[notes-smoke] RESULT: PASS（截图在 ${OUT_DIR}）`)
  }
}

try {
  await main()
} finally {
  await stopAll()
}
