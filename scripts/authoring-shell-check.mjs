/* eslint-disable no-console */
// 创作台外壳 Gate（工具退回右侧轨版，2026-10-11）：右侧工具轨 → 检查器切换/回 Agent、
// 执行日志次级入口开合、双栏/dock/顶栏工具组零残留、左栏收起与持久化、1440/390
// 零横向溢出零 console error。隔离 Playwright context，绝不触碰用户浏览器 profile。
//
// 跑法：
//   1) 播种 fixture（产物只写 tmp/authoring-rollout/）：
//        BASE=http://127.0.0.1:5174 node scripts/authoring-ui/rollout-fixture.mjs
//   2) 起 dev server（本 Gate 不依赖 /src 动态导入，但沿用 dev 惯例）：
//        npm run dev   # 或复用已在跑的 dev server
//   3) 跑 Gate：
//        BASE=http://127.0.0.1:5174 node scripts/authoring-shell-check.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE || 'http://127.0.0.1:5174'
const FIXTURE_DIR = path.resolve('tmp/authoring-rollout')
const OUT_DIR = path.resolve('docs/screenshots/authoring-rail-restore-20261011')
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const baseStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
fs.mkdirSync(OUT_DIR, { recursive: true })

function check(results, label, pass, detail = '') {
  const result = { label: String(label), pass: Boolean(pass), detail: String(detail).slice(0, 900) }
  results.push(result)
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.label}${result.detail ? ` — ${result.detail}` : ''}`)
}
// 页面旅程里用三参签名（label, pass, detail）。
let results = []
const assert = (label, pass, detail = '') => check(results, label, pass, detail)

// 源代码面残留：双栏/dock 与其偏好件必须继续缺席，顶栏工具组随本次回退一并退役，
// 工具轨必须回来。__tests__ 的负向断言与注释性提法不算残留。
function sourceResidue() {
  const mustNotExist = [
    'src/components/authoring/AuthoringDualPane.vue',
    'src/components/authoring/AuthoringDock.vue',
    'src/components/authoring/AuthoringInspectorToolbar.vue',
    'src/pages/Authoring.dock.css',
    'src/composables/useAuthoringDockPreferences.js'
  ]
  const mustExist = ['src/components/authoring/AuthoringWorkspaceToolRail.vue']
  const findings = []
  for (const relative of mustNotExist) {
    if (fs.existsSync(path.join(repoRoot, relative))) findings.push(`${relative} 仍存在`)
  }
  for (const relative of mustExist) {
    if (!fs.existsSync(path.join(repoRoot, relative))) findings.push(`${relative} 缺失`)
  }
  const residuePattern = /<AuthoringDualPane|<AuthoringInspectorToolbar|<AuthoringDock\b|authoring-dual-pane|authoring-inspector-toolbar|data-authoring-tool="dual"|saveDualChapter|saveDualExploration|swapDualChapter|openChapterInDual|openExplorationInDual|openOutlineInDual|useAuthoringDockPreferences/
  const productionFiles = []
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (fs.statSync(full).isDirectory()) {
        if (!full.endsWith('__tests__')) walk(full)
      } else if (/\.(vue|js)$/.test(name)) productionFiles.push(full)
    }
  }
  walk(path.join(repoRoot, 'src'))
  for (const file of productionFiles) {
    if (residuePattern.test(fs.readFileSync(file, 'utf8'))) findings.push(path.relative(repoRoot, file))
  }
  return findings
}

async function createPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    // addInitScript 每次导航（含 reload）都会重跑：只在首载播种，否则会把
    // 应用刚写入的侧栏偏好/会话清掉，reload 持久化断言永远测不到。
    if (localStorage.getItem('__authoring_shell_seeded')) return
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_ui_zoom', '1')
    localStorage.setItem('__authoring_shell_seeded', '1')
  }, baseStorage)
  const page = await context.newPage()
  const errors = []
  const nonApiFailures = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => {
    const text = message.text()
    // 本 Gate 不起后端，/api 资源 500 属环境缺位；单独记账，不混进前端错误。
    if (message.type() === 'error' && !/Failed to load resource/.test(text)) errors.push(`console:${text}`)
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    if (/\/api\//.test(response.url())) return
    nonApiFailures.push(`${response.status()} ${response.url()}`)
  })
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.writing-tool-rail').waitFor({ timeout: 30000 })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.waitForTimeout(700)
  return { context, page, errors, nonApiFailures }
}

// 面板可见性：右侧栏里 data-authoring-inspector="{tool}" 的 body 可见。
async function inspectorBodyVisible(page, tool) {
  return page.locator(`.writing-inspector.is-open [data-authoring-inspector="${tool}"]`).isVisible().catch(() => false)
}

const browser = await chromium.launch()

try {
  const residue = sourceResidue()
  assert('双栏/dock/顶栏工具组源代码零残留，工具轨在册', residue.length === 0, residue.join(', '))

  // ── 桌面 1440：右侧工具轨 → 检查器切换 → 回 Agent ─────────────────────────
  const desktop = await createPage(browser, { width: 1440, height: 900 })
  const page = desktop.page
  const rail = page.locator('.writing-tool-rail')
  assert('右侧工具轨可见且顶栏无工具组', await rail.isVisible() && await page.locator('.authoring-inspector-toolbar').count() === 0)
  const toolIds = await rail.locator('button[data-authoring-tool]').evaluateAll((buttons) => (
    buttons.map((button) => button.getAttribute('data-authoring-tool'))
  ))
  assert('工具轨七工具（无助手位、无双栏位）',
    JSON.stringify(toolIds) === JSON.stringify(['rehearsal', 'annotations', 'outline', 'characters', 'worldbook', 'scene', 'history']),
    JSON.stringify(toolIds))
  assert('助手入口唯一（data-authoring-tool="ai" 在顶栏助手钮，不在轨上）',
    await page.locator('[data-authoring-tool="ai"]').count() === 1
    && await page.locator('.authoring-assistant-entry[data-authoring-tool="ai"]').isVisible())

  // 逐工具：点击 → 面板切换；再点同钮 → 回 Agent。
  // 推演打开时自动挂正文推演 composer（compose-host 无独立 inspector body），
  // 以 is-rehearsal 类判定；其余工具以 data-authoring-inspector body 判定。
  for (const tool of ['rehearsal', 'annotations', 'outline', 'characters', 'worldbook', 'scene']) {
    const button = rail.locator(`button[data-authoring-tool="${tool}"]`)
    await button.click()
    await page.waitForTimeout(350)
    const switched = tool === 'rehearsal'
      ? await page.locator('.writing-inspector.is-open.is-rehearsal').isVisible().catch(() => false)
      : await inspectorBodyVisible(page, tool)
    assert(`工具轨「${tool}」→ 右侧栏切到该工具`, switched)
    assert(`工具轨「${tool}」呈按下态`, (await rail.locator(`button[data-authoring-tool="${tool}"]`).getAttribute('aria-pressed')) === 'true')
    await button.click()
    await page.waitForTimeout(350)
    assert(`再点「${tool}」→ 回 Agent 默认态`, await inspectorBodyVisible(page, 'ai'))
  }
  // 「记忆」入口打开设置的记忆页（沿用右轨语义）。
  await rail.locator('button[data-authoring-tool="history"]').click()
  await page.waitForTimeout(400)
  assert('工具轨「记忆」打开设置记忆页', await page.locator('.settings-modal').isVisible().catch(() => false)
    && await page.locator('[data-test="settings-tab-memory"]').isVisible().catch(() => false))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // 执行日志次级入口：默认收起，点开渲染 AuthoringRunLog，再点收起。
  await page.locator('[data-test="authoring-run-log-entry"]').click()
  await page.locator('[data-test="authoring-run-log"]').waitFor({ state: 'visible', timeout: 5000 })
  assert('Agent 面板内执行日志次级入口可开', await page.locator('[data-test="authoring-run-log"]').isVisible())
  await page.screenshot({ path: path.join(OUT_DIR, '02-run-log-drawer-1440.png'), fullPage: false })
  await page.locator('[data-test="authoring-run-log-entry"]').click()
  await page.waitForTimeout(250)
  assert('执行日志次级入口可收', !(await page.locator('[data-test="authoring-run-log"]').isVisible().catch(() => false)))

  // 右侧栏收起 = 顶栏「助手」钮重开（徽标钮语义），工具轨在栏关闭时仍可直达工具。
  await page.locator('.writing-inspector.is-open .writing-inspector__icon-btn[title="关闭检查器"]').click()
  await page.waitForTimeout(250)
  assert('右侧栏可收起且助手钮/工具轨仍可见', await page.locator('[data-authoring-tool="ai"]').isVisible()
    && await rail.isVisible() && !(await page.locator('.writing-inspector.is-open').isVisible().catch(() => false)))
  await page.locator('[data-authoring-tool="ai"]').click()
  await page.waitForTimeout(300)
  assert('顶栏助手钮重开右侧栏回 Agent', await inspectorBodyVisible(page, 'ai'))
  await page.screenshot({ path: path.join(OUT_DIR, '01-rail-agent-1440.png'), fullPage: false })

  // 「助手」钮承担回程：切到批注后点助手回 Agent。
  await rail.locator('button[data-authoring-tool="annotations"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-authoring-tool="ai"]').click()
  await page.waitForTimeout(300)
  assert('切工具后点「助手」→ 回 Agent', await inspectorBodyVisible(page, 'ai'))

  // 助手「完整工作台」展开态（既有产品行为：is-assistant-full 隐藏 cork）：
  // 工具轨在整屏助手下同样让位，经助手头「返回工作台」回到 Agent 常规态。
  await page.locator('.authoring-assistant-workspace__expand').click()
  await page.waitForTimeout(400)
  assert('完整助手展开后工具轨随 cork 隐藏', !(await rail.isVisible().catch(() => false)))
  await page.locator('.authoring-assistant-workspace__back').click()
  await page.waitForTimeout(400)
  assert('返回工作台回到 Agent 常规态且工具轨回归', await rail.isVisible() && await inspectorBodyVisible(page, 'ai'))

  // 左侧章节树收起：开 → 持久化 → reload 保持 → 再点展开。
  const shelfTrigger = page.locator('.wall__chapter-trigger')
  await shelfTrigger.click()
  await page.waitForTimeout(300)
  assert('章节树左栏可收起（is-shelf-collapsed）', await page.evaluate(() => (
    document.querySelector('.wall__main')?.classList.contains('is-shelf-collapsed')
    && JSON.parse(localStorage.getItem('writing_sidebar_preferences_v1') || '{}').writingCollapsed === true
  )))
  assert('左栏收起后工具轨仍在网格内可见', await rail.isVisible())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.writing-tool-rail').waitFor({ timeout: 30000 })
  await page.waitForTimeout(600)
  assert('左栏收起态 reload 后持久', await page.evaluate(() => (
    document.querySelector('.wall__main')?.classList.contains('is-shelf-collapsed')
  )))
  await page.locator('.wall__chapter-trigger').click()
  await page.waitForTimeout(300)
  assert('再点章节目录钮左栏展开', await page.evaluate(() => (
    !document.querySelector('.wall__main')?.classList.contains('is-shelf-collapsed')
    && JSON.parse(localStorage.getItem('writing_sidebar_preferences_v1') || '{}').writingCollapsed === false
  )))

  // 打开检查器时工具轨让到第四列，不得把正文挤出轨道。
  await rail.locator('button[data-authoring-tool="characters"]').click()
  await page.waitForTimeout(350)
  assert('检查器打开时工具轨贴最右（grid-column 4）', await page.evaluate(() => {
    const rail = document.querySelector('.writing-tool-rail')
    return Number(getComputedStyle(rail).gridColumnStart) === 4
      && document.querySelector('.wall__main')?.classList.contains('has-inspector')
  }))
  await rail.locator('button[data-authoring-tool="characters"]').click()
  await page.waitForTimeout(300)

  // 页面级：1440 零横向溢出、零 console error；DOM 零双栏/dock/顶栏工具组残留。
  const domResidue = await page.evaluate(() => (
    ['authoring-dual-pane', 'authoring-dock', 'authoring-inspector-toolbar'].filter((token) => document.body.innerHTML.includes(token))
  ))
  assert('双栏/dock/顶栏工具组 DOM 零残留', domResidue.length === 0, JSON.stringify(domResidue))
  assert('1440 无页面级横向溢出', await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
  assert('桌面旅程无前端控制台错误', desktop.errors.length === 0, desktop.errors.join('\n'))
  assert('桌面旅程无 /api 之外的失败响应', desktop.nonApiFailures.length === 0, desktop.nonApiFailures.join('\n'))
  await desktop.context.close()

  // ── 390 窄屏：工具轨（底部工具带）可达、无溢出、零 console error ──────────
  const mobile = await createPage(browser, { width: 390, height: 844 })
  const mobilePage = mobile.page
  assert('390 工具轨可见（底部工具带）', await mobilePage.locator('.writing-tool-rail').isVisible())
  assert('390 工具轨为 fixed 底部带', await mobilePage.evaluate(() => {
    const styles = getComputedStyle(document.querySelector('.writing-tool-rail'))
    return styles.position === 'fixed' && styles.flexDirection === 'row'
  }))
  await mobilePage.locator('.writing-tool-rail button[data-authoring-tool="annotations"]').click()
  await mobilePage.waitForTimeout(400)
  assert('390 工具轨批注 → 检查器 sheet 打开', await mobilePage.locator('.writing-inspector.is-open').isVisible())
  assert('390 检查器 sheet 让出底部工具带（工具可点）', await mobilePage.evaluate(() => {
    const band = document.querySelector('.writing-tool-rail')?.getBoundingClientRect()
    if (!band) return false
    const hit = document.elementFromPoint(band.left + band.width / 2, band.top + band.height / 2)
    return Boolean(hit?.closest('.writing-tool-rail'))
  }))
  await mobilePage.screenshot({ path: path.join(OUT_DIR, '03-shell-390.png'), fullPage: false })
  assert('390 无水平滚动', await mobilePage.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
  assert('390 旅程无前端控制台错误', mobile.errors.length === 0, mobile.errors.join('\n'))
  assert('390 旅程无 /api 之外的失败响应', mobile.nonApiFailures.length === 0, mobile.nonApiFailures.join('\n'))
  await mobile.context.close()
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.pass)
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2))
console.log(`Authoring shell Gate: ${results.length - failed.length}/${results.length}`)
if (failed.length) process.exitCode = 1
