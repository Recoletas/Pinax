// Slice V0：基线截图 + 几何报告（不做任何视觉修改）。
// 用法：BASE=http://127.0.0.1:5173 node scripts/authoring-ui/rollout-baseline.mjs
// 产物：tmp/authoring-rollout/baseline/*.png、tmp/authoring-rollout/geometry-report.json
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('tmp/authoring-rollout')
const SHOT_DIR = path.join(OUT_DIR, 'baseline')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const state = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'fixture-localstorage.json'), 'utf8'))
const injectFixture = async (context) => {
  await context.addInitScript((snapshot) => {
    for (const [key, value] of Object.entries(snapshot)) {
      try { localStorage.setItem(key, value) } catch { /* 配额或异常键跳过 */ }
    }
  }, storage)
}
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '390', width: 390, height: 844 }
]
const MARKER_TEXT = '黄铜钥匙' // ch5 中段（fixture midUnit 邻域）的锚点句

const GEOMETRY_SELECTORS = [
  '.workspace-tabs', '.wall__cork', '.authoring-book-tabs', '#authoring-editor-toolbar-host .editor-toolbar',
  '.wall__main', '.wall__shelf', '.wall__dossier', '.wall__dossier-scroll', '.wall__dossier-body',
  '.wall__dossier-title', '.wall__chapter-head', '.dossier-footer', '.writing-tool-rail',
  '.writing-inspector', '.wall__shelf-scene', '.ProseMirror'
]

const browser = await chromium.launch()
const report = { generatedAt: new Date().toISOString(), base: BASE, bookId: state.bookId, viewports: {} }

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  await injectFixture(context)
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.authoring-chapter-row', { timeout: 30000 })
  await page.waitForTimeout(1500)

  // 打开第五章（窄视口下左栏可能收进抽屉，先点章节触发钮再选章）
  await page.evaluate(() => {
    const trigger = document.querySelector('.wall__chapter-trigger')
    if (trigger && !document.querySelector('.authoring-chapter-row')?.offsetParent) trigger.click()
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.authoring-chapter-row')]
    const row = rows.find((el) => (el.textContent || '').includes('星图回应')) || rows[4] || rows[rows.length - 1]
    if (row) row.click()
  })
  await page.waitForTimeout(2000)

  // 顶部截图（章节标题 + 正文开头）
  await page.screenshot({ path: path.join(SHOT_DIR, `baseline-top-${vp.name}.png`) })

  // 滚到 fixture 中段锚点句
  const scrolled = await page.evaluate(({ marker, midUnitId }) => {
    const scroll = document.querySelector('.wall__dossier-scroll')
    if (!scroll) return { ok: false, reason: 'no dossier scroll' }
    const paragraphs = [...scroll.querySelectorAll('.ProseMirror p, .ProseMirror [data-node-id]')]
    const target = paragraphs.find((node) => (node.textContent || '').includes(marker))
      || [...scroll.querySelectorAll('*')].find((node) => node.childElementCount === 0 && (node.textContent || '').includes(marker))
    if (target) target.scrollIntoView({ block: 'center' })
    else scroll.scrollTop = scroll.scrollHeight * 0.5
    return { ok: true, foundMarker: Boolean(target), scrollTop: scroll.scrollTop }
  }, { marker: MARKER_TEXT, midUnitId: state.midUnitId })
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOT_DIR, `baseline-mid-${vp.name}.png`) })

  // 几何与样式报告
  const geometry = await page.evaluate((selectors) => {
    const round = (value) => Math.round(Number(value) * 10) / 10
    const pick = (el) => {
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        rect: { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) },
        position: style.position,
        overflowY: style.overflowY,
        display: style.display,
        background: style.backgroundColor,
        zIndex: style.zIndex,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        isScrollOwnerCandidate: el.scrollHeight > el.clientHeight + 1
      }
    }
    const elements = {}
    for (const selector of selectors) elements[selector] = pick(document.querySelector(selector))

    const paragraphs = [...document.querySelectorAll('.ProseMirror p')]
    const sample = paragraphs.find((node) => (node.textContent || '').trim().length > 30)
    const proseStyle = sample ? (({ fontFamily, fontSize, lineHeight, textIndent, color, marginTop, marginBottom }) => ({ fontFamily, fontSize, lineHeight, textIndent, color, marginTop, marginBottom }))(getComputedStyle(sample)) : null
    const title = document.querySelector('.wall__dossier-title')
    const titleStyle = title ? (({ fontFamily, fontSize, fontWeight, border, background }) => ({ fontFamily, fontSize, fontWeight, border, background }))(getComputedStyle(title)) : null

    const scrollables = [...document.querySelectorAll('.wall *')]
      .filter((el) => el.scrollHeight > el.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY))
      .slice(0, 12)
      .map((el) => ({ class: String(el.className).slice(0, 80), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))

    const body = document.body
    return {
      viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      documentScrolled: {
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        bodyScrollHeight: body.scrollHeight
      },
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      elements,
      proseStyle,
      titleStyle,
      verticalScrollables: scrollables
    }
  }, GEOMETRY_SELECTORS)

  report.viewports[vp.name] = { scrolled, geometry, consoleErrors }
  await context.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT_DIR, 'geometry-report.json'), JSON.stringify(report, null, 2))
console.log('[baseline] screenshots:', fs.readdirSync(SHOT_DIR).join(', '))
const v1440 = report.viewports['1440'].geometry
console.log('[baseline] 1440 dossier-scroll:', JSON.stringify(v1440.elements['.wall__dossier-scroll']?.rect), 'scrollOwnerCandidates:', v1440.verticalScrollables.length)
console.log('[baseline] 1440 prose:', JSON.stringify(v1440.proseStyle))
console.log('[baseline] 1440 horizontal overflow:', v1440.horizontalOverflow, '| console errors:', report.viewports['1440'].consoleErrors.length)
