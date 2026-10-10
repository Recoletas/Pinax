/* eslint-disable no-console */
// W-B 创作台外壳重构 Gate（2026-10-11）：顶栏工具组 → 右侧栏切换/回 Agent、
// 执行日志次级入口开合、双栏零残留、左右侧栏收起与持久化、1440/390 零横向
// 溢出零 console error。隔离 Playwright context，绝不触碰用户浏览器 profile。
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
const OUT_DIR = path.resolve('docs/screenshots/authoring-shell-20261011')
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

// 双栏零残留（源代码面）：src 生产代码内不得再出现双栏/右轨/dock 的接线痕迹
// （模板标签、类名、函数名）。__tests__ 的负向断言与注释性提法不算残留。
function sourceResidue() {
  const banned = [
    'src/components/authoring/AuthoringDualPane.vue',
    'src/components/authoring/AuthoringWorkspaceToolRail.vue',
    'src/components/authoring/AuthoringDock.vue',
    'src/pages/Authoring.dock.css',
    'src/composables/useAuthoringDockPreferences.js'
  ]
  const findings = []
  for (const relative of banned) {
    if (fs.existsSync(path.join(repoRoot, relative))) findings.push(`${relative} 仍存在`)
  }
  const residuePattern = /<AuthoringDualPane|<AuthoringWorkspaceToolRail|<AuthoringDock\b|authoring-dual-pane|writing-tool-rail|data-authoring-tool="dual"|saveDualChapter|saveDualExploration|swapDualChapter|openChapterInDual|openExplorationInDual|openOutlineInDual|useAuthoringDockPreferences/
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
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`) })
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.authoring-inspector-toolbar').waitFor({ timeout: 30000 })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.waitForTimeout(700)
  return { context, page, errors }
}

// 面板可见性：右侧栏里 data-authoring-inspector="{tool}" 的 body 可见。
async function inspectorBodyVisible(page, tool) {
  return page.locator(`.writing-inspector.is-open [data-authoring-inspector="${tool}"]`).isVisible().catch(() => false)
}

const browser = await chromium.launch()

try {
  const residue = sourceResidue()
  assert('双栏/右轨/dock 源代码零残留', residue.length === 0, residue.join(', '))

  // ── 桌面 1440：顶栏工具组 → 右侧栏切换 → 回 Agent ─────────────────────────
  const desktop = await createPage(browser, { width: 1440, height: 900 })
  const page = desktop.page
  const toolbar = page.locator('.authoring-inspector-toolbar')
  assert('顶栏工具组可见（右轨已退役）', await toolbar.isVisible() && await page.locator('.writing-tool-rail').count() === 0)
  const toolIds = await toolbar.locator('button[data-authoring-tool]').evaluateAll((buttons) => (
    buttons.map((button) => button.getAttribute('data-authoring-tool'))
  ))
  assert('顶栏工具组七工具 + 无双栏',
    JSON.stringify(toolIds) === JSON.stringify(['rehearsal', 'annotations', 'outline', 'characters', 'worldbook', 'scene', 'history']),
    JSON.stringify(toolIds))
  assert('助手入口唯一（data-authoring-tool="ai" 落顶栏助手钮）',
    await page.locator('[data-authoring-tool="ai"]').count() === 1 && await page.locator('[data-authoring-tool="ai"]').isVisible())

  // 逐工具：点击 → 面板切换；再点同钮 → 回 Agent。
  // 推演打开时自动挂正文推演 composer（compose-host 无独立 inspector body），
  // 以 is-rehearsal 类判定；其余工具以 data-authoring-inspector body 判定。
  for (const tool of ['rehearsal', 'annotations', 'outline', 'characters', 'worldbook', 'scene']) {
    const button = toolbar.locator(`button[data-authoring-tool="${tool}"]`)
    await button.click()
    await page.waitForTimeout(350)
    const switched = tool === 'rehearsal'
      ? await page.locator('.writing-inspector.is-open.is-rehearsal').isVisible().catch(() => false)
      : await inspectorBodyVisible(page, tool)
    assert(`顶栏「${tool}」→ 右侧栏切到该工具`, switched)
    await button.click()
    await page.waitForTimeout(350)
    assert(`再点「${tool}」→ 回 Agent 默认态`, await inspectorBodyVisible(page, 'ai'))
  }
  // 「记忆」入口打开设置的记忆页（沿用右轨语义）。
  await toolbar.locator('button[data-authoring-tool="history"]').click()
  await page.waitForTimeout(400)
  assert('顶栏「记忆」打开设置记忆页', await page.locator('.settings-modal').isVisible().catch(() => false)
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

  // 右侧栏收起 = 顶栏「助手」钮重开（徽标钮语义）。
  await page.locator('.writing-inspector.is-open .writing-inspector__icon-btn[title="关闭检查器"]').click()
  await page.waitForTimeout(250)
  assert('右侧栏可收起且助手钮仍可见', await page.locator('[data-authoring-tool="ai"]').isVisible()
    && !(await page.locator('.writing-inspector.is-open').isVisible().catch(() => false)))
  await page.locator('[data-authoring-tool="ai"]').click()
  await page.waitForTimeout(300)
  assert('顶栏助手钮重开右侧栏回 Agent', await inspectorBodyVisible(page, 'ai'))
  await page.screenshot({ path: path.join(OUT_DIR, '01-toolbar-agent-1440.png'), fullPage: false })

  // 「助手」钮承担回程（非展开态）：切到批注后点助手回 Agent。
  await toolbar.locator('button[data-authoring-tool="annotations"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-authoring-tool="ai"]').click()
  await page.waitForTimeout(300)
  assert('切工具后点「助手」→ 回 Agent', await inspectorBodyVisible(page, 'ai'))

  // 助手「完整工作台」展开态（既有产品行为：is-assistant-full 隐藏 cork）：
  // 顶栏工具组随之隐藏，经助手头「返回工作台」回到 Agent 常规态。
  await page.locator('.authoring-assistant-workspace__expand').click()
  await page.waitForTimeout(400)
  assert('完整助手展开后顶栏随 cork 隐藏', !(await toolbar.isVisible().catch(() => false)))
  await page.locator('.authoring-assistant-workspace__back').click()
  await page.waitForTimeout(400)
  assert('返回工作台回到 Agent 常规态且工具组回归', await toolbar.isVisible() && await inspectorBodyVisible(page, 'ai'))

  // 左侧章节树收起：开 → 持久化 → reload 保持 → 再点展开。
  const shelfTrigger = page.locator('.wall__chapter-trigger')
  await shelfTrigger.click()
  await page.waitForTimeout(300)
  assert('章节树左栏可收起（is-shelf-collapsed）', await page.evaluate(() => (
    document.querySelector('.wall__main')?.classList.contains('is-shelf-collapsed')
    && JSON.parse(localStorage.getItem('writing_sidebar_preferences_v1') || '{}').writingCollapsed === true
  )))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.authoring-inspector-toolbar').waitFor({ timeout: 30000 })
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

  // 页面级：1440 零横向溢出、零 console error；DOM 零双栏残留。
  const domResidue = await page.evaluate(() => (
    ['authoring-dual-pane', 'writing-tool-rail', 'authoring-dock'].filter((token) => document.body.innerHTML.includes(token))
  ))
  assert('双栏/右轨/dock DOM 零残留', domResidue.length === 0, JSON.stringify(domResidue))
  assert('1440 无页面级横向溢出', await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
  assert('桌面旅程无控制台错误', desktop.errors.length === 0, desktop.errors.join('\n'))
  await desktop.context.close()

  // ── 390 窄屏：工具组可达、无溢出、零 console error ────────────────────────
  const mobile = await createPage(browser, { width: 390, height: 844 })
  const mobilePage = mobile.page
  assert('390 顶栏工具组可见', await mobilePage.locator('.authoring-inspector-toolbar').isVisible())
  await mobilePage.locator('.authoring-inspector-toolbar button[data-authoring-tool="annotations"]').click()
  await mobilePage.waitForTimeout(400)
  assert('390 顶栏批注 → 检查器 sheet 打开', await mobilePage.locator('.writing-inspector.is-open').isVisible())
  assert('390 无水平滚动', await mobilePage.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
  assert('390 旅程无控制台错误', mobile.errors.length === 0, mobile.errors.join('\n'))
  await mobilePage.screenshot({ path: path.join(OUT_DIR, '03-shell-390.png'), fullPage: false })
  await mobile.context.close()
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.pass)
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2))
console.log(`Authoring shell Gate: ${results.length - failed.length}/${results.length}`)
if (failed.length) process.exitCode = 1
