#!/usr/bin/env node
/**
 * W-A 首页侧栏重构探针（Playwright + 自起 vite dev server）。
 *
 * 断言（docs/plan/agent-first-shell-20261010.md §3.1 / §5.6）：
 * 1. 默认展开态结构：侧栏可见、收起钮 aria-expanded=true、无左缘展开钮；
 *    项目导航组（WorkspaceProjectNavigation）默认展开——正文/助手/知识/资料四主面常显。
 * 2. 工具组贴底：跑团/联机 + 记忆/备份/帮助/偏好六项同在一个底部工具组区，
 *    margin-top: auto 贴到导航区底部、「本地工作区」页脚上方。
 * 3. 收起 → 侧栏完全隐藏 + 左缘 48px 热区展开钮出现；偏好写入 writing_sidebar_preferences_v1；
 *    reload 后保持收起；点展开钮恢复；恢复态同样持久化。
 *
 * 环境变量：BASE（已有 dev server 时直连，跳过自起）；HOME_SIDEBAR_PORT（默认 5221）。
 */
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.HOME_SIDEBAR_PORT || 5221)
const BASE = process.env.BASE || `http://127.0.0.1:${PORT}`
const children = []
const pageErrors = []

const TOOL_ITEMS = ['跑团与冒险', '联机房间', '记忆与历史', '备份与恢复', '帮助中心', '偏好与模型']
// writing_sidebar_preferences_v1 为 W-A（collapsed）与 W-B（writingCollapsed）共用一键：
// 断言只看本波次拥有的 collapsed 字段，不假设整个对象形状。
const readCollapsed = page => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('writing_sidebar_preferences_v1') || 'null')?.collapsed === true } catch { return false }
})

function startVite() {
  const child = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  children.push(child)
  child.stderr.on('data', data => process.stderr.write(`[vite] ${data}`))
  return child
}

async function waitUntil(fn, label, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error(`ready 超时：${label}`)
}

async function httpReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.status < 600
  } catch {
    return false
  }
}

async function stopAll() {
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue
    try { child.kill('SIGTERM') } catch { /* 可能已退出 */ }
    const exited = new Promise(resolve => child.once('exit', resolve))
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1500))])
    try { if (child.exitCode === null) child.kill('SIGKILL') } catch { /* 同上 */ }
  }
}

try {
  if (!process.env.BASE) {
    startVite()
    await waitUntil(() => httpReachable(BASE), `vite dev server ${BASE}`)
    console.log(`[home-sidebar-check] vite ready at ${BASE}`)
  }

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
    await context.addInitScript(() => {
      localStorage.setItem('writing_books', JSON.stringify([{
        id: 'sidebar-check-0',
        title: '侧栏验收稿',
        worldbookId: '',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-10T00:00:00.000Z',
        chapters: []
      }]))
    })
    const page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(String(error?.message || error)))

    // —— 1. 默认展开态结构 ——
    await page.goto(BASE)
    const sidebar = page.locator('[data-test="library-sidebar"]')
    await sidebar.waitFor()
    assert.equal(await page.locator('[data-test="library-sidebar-reopen"]').count(), 0, '默认态不应出现左缘展开钮')
    assert.equal(await page.locator('[data-test="library-sidebar-collapse"]').getAttribute('aria-expanded'), 'true', '收起钮 aria-expanded 默认 true')
    assert.equal(await readCollapsed(page), false, '默认态 collapsed 字段不为 true')
    for (const surface of ['writing', 'assistant', 'knowledge', 'sources']) {
      const surfaceButton = page.locator('[data-test="library-sidebar"] [data-test="workspace-project-navigation"] [data-project-surface="' + surface + '"]')
      await surfaceButton.waitFor()
      assert.ok(await surfaceButton.isVisible(), `项目组主面 ${surface} 默认展开可见`)
    }
    console.log('[home-sidebar-check] 1. 默认展开态结构（侧栏可见 / 收起钮 aria-expanded=true / 无展开钮 / 项目组主面常显）: PASS')

    // —— 2. 工具组贴底 ——
    const layout = await page.evaluate(() => {
      const rectOf = el => {
        const box = el.getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, left: box.left, width: box.width, height: box.height }
      }
      const query = selector => document.querySelector('[data-test="library-sidebar"] ' + selector)
      return {
        nav: rectOf(query('.library-sidebar__nav')),
        tools: rectOf(query('[data-test="library-sidebar-tools"]')),
        footer: rectOf(query('.library-sidebar__local')),
        project: rectOf(query('[data-test="workspace-project-navigation"]')),
        toolItems: [...document.querySelectorAll('[data-test="library-sidebar-tools"] .library-sidebar__utility > span')].map(span => span.textContent.trim())
      }
    })
    assert.deepEqual(layout.toolItems, TOOL_ITEMS, '底部工具组类目应为跑团/联机 + 记忆/备份/帮助/偏好六项')
    assert.ok(Math.abs(layout.tools.bottom - layout.nav.bottom) <= 2, `工具组应贴导航区底部（tools.bottom=${layout.tools.bottom} nav.bottom=${layout.nav.bottom}）`)
    const footerGap = layout.footer.top - layout.tools.bottom
    assert.ok(footerGap >= -1 && footerGap <= 24, `工具组应与「本地工作区」页脚相邻（gap=${footerGap}px）`)
    assert.ok(layout.tools.top - layout.project.bottom >= 40, '工具组应贴底而非悬在项目组之下')
    console.log(`[home-sidebar-check] 2. 工具组贴底（六项同区 / 距导航底 ${Math.abs(layout.tools.bottom - layout.nav.bottom).toFixed(1)}px / 距页脚 ${footerGap.toFixed(1)}px / 项目组下方留空 ${(layout.tools.top - layout.project.bottom).toFixed(0)}px）: PASS`)

    // —— 3. 收起 → 隐藏 + 展开钮 + 持久化 ——
    await page.locator('[data-test="library-sidebar-collapse"]').click()
    await sidebar.waitFor({ state: 'hidden' })
    const reopen = page.locator('[data-test="library-sidebar-reopen"]')
    await reopen.waitFor()
    // 全局 UI 缩放（themeStore 默认 0.85）写进 body zoom，boundingBox 是缩放后视觉 px；
    // 热区 48px 断言取 getComputedStyle 的布局 px，与侧栏其余尺寸同一坐标系。
    const reopenZone = await page.evaluate(() => {
      const button = document.querySelector('[data-test="library-sidebar-reopen"]')
      return {
        width: parseFloat(getComputedStyle(button).width),
        left: button.getBoundingClientRect().left,
        height: parseFloat(getComputedStyle(button).height)
      }
    })
    assert.ok(await reopen.isVisible(), '收起后左缘展开钮应出现')
    assert.ok(Math.abs(reopenZone.width - 48) <= 1, `展开钮热区宽应为 48px（实际 ${reopenZone.width}px）`)
    assert.ok(reopenZone.left <= 1, '展开钮应悬在左缘')
    assert.ok(reopenZone.height >= 200, `展开钮热区应纵贯侧栏高度（实际 ${reopenZone.height}px）`)
    assert.equal(await readCollapsed(page), true, '收起态应把 collapsed 字段写为 true')
    const storedRaw = await page.evaluate(() => localStorage.getItem('writing_sidebar_preferences_v1'))
    console.log(`[home-sidebar-check] 偏好键落盘：${storedRaw}`)
    console.log('[home-sidebar-check] 3. 收起（侧栏隐藏 / 左缘 48px 展开钮 / collapsed=true 持久化）: PASS')

    // —— 4. reload 后保持收起 ——
    await page.reload()
    await page.locator('[data-test="library-sidebar"]').waitFor({ state: 'hidden' })
    await page.locator('[data-test="library-sidebar-reopen"]').waitFor()
    assert.ok(await page.locator('[data-test="library-sidebar-reopen"]').isVisible(), 'reload 后收起态应保持')
    console.log('[home-sidebar-check] 4. reload 保持收起态: PASS')

    // —— 5. 点击展开钮恢复 + 恢复态持久化 ——
    await page.locator('[data-test="library-sidebar-reopen"]').click()
    await page.locator('[data-test="library-sidebar"]').waitFor()
    assert.equal(await page.locator('[data-test="library-sidebar-reopen"]').count(), 0, '展开后左缘展开钮应消失')
    assert.equal(await readCollapsed(page), false, '展开态应把 collapsed 字段写为 false')
    await page.reload()
    await page.locator('[data-test="library-sidebar"]').waitFor()
    assert.ok(await page.locator('[data-test="library-sidebar"]').isVisible(), 'reload 后展开态应保持')
    assert.equal(await page.locator('[data-test="library-sidebar-reopen"]').count(), 0, 'reload 后不应有展开钮')
    console.log('[home-sidebar-check] 5. 点击恢复 + 恢复态持久化（reload 后保持展开）: PASS')

    assert.deepEqual(pageErrors, [], '不应有页面错误')
    console.log('home-sidebar-check: 5/5 PASS — 默认展开 / 工具组贴底 / 收起隐藏+展开钮 / reload 保持 / 点击恢复+持久化，无页面错误')
  } finally {
    await browser.close()
  }
} finally {
  await stopAll()
}
