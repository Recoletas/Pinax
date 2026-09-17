#!/usr/bin/env node
/**
 * N-B 控件普查（NB01）：全路由 × 亮/暗 × 1440/390 的可达性与控件家族扫描。
 *
 * 每个路由记录：
 *   - axe serious/critical 违规（含 targets）
 *   - 无可访问名称的按钮/链接（icon-only 无 aria-label）
 *   - 嵌套交互（role="button" 内含 button/a/input，label 包 button）
 *   - 交互控件计数（供家族归并与前后对照）
 * 输出：/tmp/pinax-ui-controls-audit/{report.json, report.md}
 *
 * 运行（自带隔离 vite :5198）：
 *   node scripts/ui-controls-audit.mjs [--routes id1,id2] [--widths 1440,390]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5198
const BASE = `http://127.0.0.1:${PORT}`
const OUT = '/tmp/pinax-ui-controls-audit'

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const flag = args.indexOf(name)
  return flag >= 0 ? args[flag + 1] : fallback
}
const widthArg = (argOf('--widths', '1440,390')).split(',').map(Number).filter(Number.isFinite)

const ROUTES = [
  { id: 'welcome', path: '/', label: '首页/书架' },
  { id: 'experience', path: '/experience', label: '体验/跑团记录流' },
  { id: 'settings-worldbook', path: '/settings/worldbook', label: '世界书首页' },
  { id: 'settings-worldbook-create', path: '/settings/worldbook/create', label: '创建工作区' },
  { id: 'settings-worldbook-advanced', path: '/settings/worldbook/advanced', label: '高级世界书' },
  { id: 'settings-structured', path: '/settings/structured', label: '结构化设定' },
  { id: 'settings-world-map', path: '/settings/world-map', label: '地图' },
  { id: 'authoring', path: '/authoring', label: '创作工作区' },
  { id: 'materials', path: '/materials', label: '素材/速记' },
  { id: 'prose-essay', path: '/prose-essay', label: '画布/散文' },
  { id: 'comics', path: '/comics', label: '漫画' },
  { id: 'docs', path: '/docs/README', label: '文档' }
]
const routeFilter = argOf('--routes', '')
const routes = routeFilter ? ROUTES.filter((route) => routeFilter.split(',').includes(route.id)) : ROUTES

let passed = 0
const failures = []
function check(name, condition, detail = '') {
  if (condition) passed += 1
  else {
    failures.push({ name, detail })
    // eslint-disable-next-line no-console
    console.error(`FAIL ${name}${detail ? ` :: ${String(detail).slice(0, 300)}` : ''}`)
  }
}

mkdirSync(OUT, { recursive: true })
const viteBin = path.join(root, 'node_modules/.bin/vite')
const server = spawn(viteBin, ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', (chunk) => { serverLog += chunk })
server.stderr.on('data', (chunk) => { serverLog += chunk })

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

const CENSUS = () => {
  const interactive = 'button, a[href], input, select, textarea, [role="button"], [tabindex]'
  const accessibleName = (el) => {
    const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')
    if (label) return label.trim()
    const wrapped = el.labels && el.labels.length
    if (wrapped) return 'wrapped-by-label'
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (text) return text
    const img = el.querySelector('img[alt], svg[aria-label]')
    return img ? (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim() : ''
  }
  const controls = [...document.querySelectorAll(interactive)]
    .filter((el) => el.offsetParent !== null || el.getClientRects().length)
  const unnamed = controls
    .filter((el) => !accessibleName(el))
    .map((el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(/\s+/).slice(0, 2).join('.') : ''}`)
  const nested = []
  for (const el of controls) {
    const role = el.getAttribute('role') || (el.tagName === 'BUTTON' || el.tagName === 'A' ? el.tagName.toLowerCase() : '')
    if (role !== 'button') continue
    const inner = el.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')
    if (inner.length) nested.push(`${el.tagName.toLowerCase()}[${String(el.className).split(/\s+/)[0] || role}] > ${inner.length} inner`)
    const parentInteractive = el.closest('label')?.querySelector('button, a[href], input')
    if (parentInteractive) nested.push(`label > ${el.tagName.toLowerCase()}[${String(el.className).split(/\s+/)[0] || role}]`)
  }
  const counts = { buttons: document.querySelectorAll('button').length, controls: controls.length }
  return { unnamed, nested, counts }
}

try {
  await waitForServer()
  const { chromium } = await import(path.join(root, 'node_modules/playwright/index.mjs'))
  const browser = await chromium.launch({ headless: true })
  const report = []

  for (const width of widthArg) {
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: width >= 900 ? 1000 : 844 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      await page.addInitScript((schemeValue) => localStorage.setItem('app_theme', schemeValue), scheme)
      for (const route of routes) {
        const entry = { route: route.id, label: route.label, width, scheme, url: `${BASE}${route.path}` }
        try {
          // 每路由清除存储（保留主题）后重载，测确定性的首载态，避免连续走查状态污染。
          await page.evaluate(() => {
            try {
              const theme = localStorage.getItem('app_theme')
              localStorage.clear()
              if (theme) localStorage.setItem('app_theme', theme)
            } catch { /* 首次导航前无存储可清 */ }
          })
          await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.evaluate(() => {
            try {
              const theme = localStorage.getItem('app_theme')
              localStorage.clear()
              if (theme) localStorage.setItem('app_theme', theme)
            } catch { /* 同上 */ }
          })
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForTimeout(1600)
          const axeSummary = await page.evaluate(async () => {
            try {
              if (!window.axe) {
                const resp = await fetch('/node_modules/axe-core/axe.min.js')
                if (!resp.ok) return { unavailable: `axe fetch ${resp.status}` }
                const script = document.createElement('script')
                script.textContent = await resp.text()
                document.head.appendChild(script)
              }
              const results = await window.axe.run(document.querySelector('#app'), { resultTypes: ['violations'] })
              return {
                violations: results.violations
                  .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
                  .map((violation) => ({
                    id: violation.id,
                    impact: violation.impact,
                    count: violation.nodes.length,
                    targets: [...new Set(violation.nodes.flatMap((node) => node.target.map((t) => String(t))))].slice(0, 4)
                  }))
              }
            } catch (error) {
              return { unavailable: String(error?.message || error).slice(0, 120) }
            }
          })
          entry.axe = axeSummary
          entry.census = await page.evaluate(CENSUS)
        } catch (error) {
          entry.error = String(error?.message || error).slice(0, 200)
        }
        report.push(entry)
      }
      await context.close()
    }
  }
  await browser.close()

  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))

  // 汇总：按违规 id 聚合。
  const byId = {}
  for (const entry of report) {
    for (const violation of entry.axe?.violations || []) {
      byId[violation.id] = byId[violation.id] || { id: violation.id, impact: violation.impact, entries: [] }
      byId[violation.id].entries.push(`${entry.route}@${entry.width}/${entry.scheme} ×${violation.count} → ${violation.targets.join(' | ')}`)
    }
  }
  const lines = ['# N-B 控件普查报告（NB01）', '', `视口：${widthArg.join('/')}；亮/暗；路由 ${routes.length} 个。`, '']
  for (const [id, info] of Object.entries(byId)) {
    lines.push(`## ${id}（${info.impact}）`)
    for (const line of info.entries) lines.push(`- ${line}`)
    lines.push('')
  }
  const unnamedLines = []
  for (const entry of report) {
    if (entry.census?.unnamed?.length) {
      unnamedLines.push(`- ${entry.route}@${entry.width}/${entry.scheme}：${entry.census.unnamed.join(', ')}`)
    }
  }
  if (unnamedLines.length) {
    lines.push('## 无可访问名称的控件')
    lines.push(...unnamedLines)
  }
  writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'))
  check('普查覆盖全部路由', report.length === routes.length * widthArg.length * 2, `got ${report.length}`)
  // eslint-disable-next-line no-console
  console.log(`\n=== ui-controls-audit: ${passed} passed, ${failures.length} failed；报告 ${OUT}/report.{json,md} ===`)
  if (failures.length) process.exit(1)
} finally {
  server.kill('SIGTERM')
}
