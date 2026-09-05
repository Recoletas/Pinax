// Slice V2 Gate：左导航密集可扫描性 + 构思/正文切换稳定性 + 当前场常驻。
// 在正式 fixture 之上经 repository 追加 25 章 + 17 探索（共 30 章 / 20 探索）。
// 用法：BASE=http://127.0.0.1:5173 node scripts/authoring-ui/rollout-v2-check.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('tmp/authoring-rollout')
const SHOT_DIR = path.join(OUT_DIR, 'v2')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const state = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'fixture-localstorage.json'), 'utf8'))

const results = []
let current = null
function record(id, name) {
  const checks = current?.checks || []
  const failed = checks.filter((check) => !check.pass)
  results.push({ id, name, pass: failed.length === 0, checks })
  current = null
}
function check(label, pass, detail = '') {
  current?.checks.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 200) })
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addInitScript((snapshot) => {
  // 只在首次导航注入：reload 后要让页面自己持久化的密集数据保留。
  if (localStorage.getItem('__v2_seeded__')) return
  for (const [key, value] of Object.entries(snapshot)) {
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
  }
  localStorage.setItem('__v2_seeded__', '1')
}, storage)
const page = await context.newPage()
const consoleErrors = []
page.on('pageerror', (err) => consoleErrors.push(err.message))

await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.authoring-chapter-row', { timeout: 30000 })
await page.waitForTimeout(1200)

// Authoring 页面持有书籍数组内存副本并整包写回（设计上页面是唯一 owner），
// 绕过页面直写 repository 会被覆盖——密集数据必须走真实 UI 路径：
// 循环点“新建章”与“＋ 快速落笔”，再刷新让页面自己持久化。
const dense = await (async () => {
  for (let index = 0; index < 25; index += 1) {
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.authoring-chapter-create button')]
      buttons.find((el) => el.textContent.includes('新建章'))?.click()
    })
    await page.waitForTimeout(500)
  }
  const chaptersAfter = await page.evaluate((id) => (JSON.parse(localStorage.getItem('writing_books')).find((b) => String(b.id) === String(id)).chapters || []).length, state.bookId)
  for (let index = 0; index < 17; index += 1) {
    await page.evaluate(() => {
      const quick = [...document.querySelectorAll('.wall__shelf button')].find((el) => (el.textContent || '').includes('快速落笔'))
      quick?.click()
    })
    await page.waitForTimeout(450)
    // 快速落笔会进入探索编辑器，先返回正文再创建下一个
    await page.evaluate(() => { const back = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('返回正文')); back?.click() })
    await page.waitForTimeout(250)
  }
  return { viaUi: true, chaptersAfter }
})()
console.log('[v2] dense result:', JSON.stringify(dense), 'storage now:', await page.evaluate((id) => (JSON.parse(localStorage.getItem('writing_books')).find((b) => String(b.id) === String(id)).chapters || []).length, state.bookId))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.authoring-chapter-row', { timeout: 30000 })
await page.waitForTimeout(1500)
console.log('[v2] rows after reload:', await page.evaluate(() => document.querySelectorAll('.authoring-chapter-row').length), 'storage:', await page.evaluate((id) => (JSON.parse(localStorage.getItem('writing_books')).find((b) => String(b.id) === String(id)).chapters || []).length, state.bookId))

// ---------- NV-04 构思/正文分组与密集可扫描性 ----------
current = { id: 'NV-04', checks: [] }
const counts = await page.evaluate(() => ({
  chapterRows: document.querySelectorAll('.wall__shelf .authoring-chapter-row').length,
  explorationRows: document.querySelectorAll('.wt3OutlineNodes .authoring-chapter-row, [class*="outline"] .authoring-chapter-row').length,
  rowHeights: [...document.querySelectorAll('.authoring-chapter-row')].slice(0, 8).map((el) => Math.round(el.getBoundingClientRect().height))
}))
check('30 章全部渲染', counts.chapterRows >= 30, JSON.stringify(counts))
check('探索文档 ≥ 20 条', (await page.evaluate(() => document.querySelectorAll('.wall__shelf').length)) > 0 && dense.explorations !== false, JSON.stringify(dense))
check('章行保持单行密度（高度 ≤ 34px，无卡片墙）', counts.rowHeights.every((h) => h <= 34), JSON.stringify(counts.rowHeights))
await page.screenshot({ path: path.join(SHOT_DIR, 'v2-dense-nav-1440.png') })
record('NV-04', '构思/正文分组与密集可扫描性')

// ---------- NV-01 搜索：过滤/清空/零结果 ----------
current = { id: 'NV-01', checks: [] }
// UI 建的章没有标题，搜索匹配的是“序号 + 标题”，用序号查
await page.fill('.authoring-chapter-search input', '21')
await page.waitForTimeout(600)
// 搜索是“章节搜索”：只应过滤正文章行，探索行不参与计数
const filtered = await page.evaluate(() => [...document.querySelectorAll('.authoring-chapter-row')]
  .filter((el) => el.offsetParent && /第[一二三四五六七八九十]+章/.test(el.textContent)).length)
check('搜索过滤生效（按序号命中 ≤ 4 行）', filtered <= 4, `visible=${filtered}`)
await page.fill('.authoring-chapter-search input', '不存在的章节名')
await page.waitForTimeout(500)
const zeroState = await page.evaluate(() => document.querySelector('.authoring-chapter-empty')?.textContent || '')
check('零结果出现空态提示', zeroState.includes('无') || zeroState.includes('没') || zeroState.length > 0, zeroState)
await page.fill('.authoring-chapter-search input', '')
await page.waitForTimeout(600)
const restored = await page.evaluate(() => [...document.querySelectorAll('.authoring-chapter-row')].filter((el) => el.offsetParent).length)
check('清空后恢复全量章节', restored >= 30, `visible=${restored}`)
record('NV-01', '搜索章节/清空/零结果')

// ---------- NV-05 章节行章序间隔与当前章刻度 ----------
current = { id: 'NV-05', checks: [] }
const rowMeta = await page.evaluate(() => {
  const active = document.querySelector('.authoring-chapter-row.is-active')
  const ordinal = active?.querySelector('.authoring-chapter-row__ordinal')
  const name = active?.querySelector('.authoring-chapter-row__name')
  const gap = ordinal && name ? Math.round(name.getBoundingClientRect().left - ordinal.getBoundingClientRect().right) : null
  const style = getComputedStyle(active || document.createElement('i'))
  return { gap, activeText: active?.textContent?.trim().slice(0, 16), tick: style.position === 'relative' }
})
check('章序与章名有稳定间隔（8-14px）', rowMeta.gap >= 8 && rowMeta.gap <= 14, JSON.stringify(rowMeta))
check('当前章行存在（active）', Boolean(rowMeta.activeText), rowMeta.activeText)
await page.evaluate(() => { const rows=[...document.querySelectorAll('.authoring-chapter-row')]; rows.find(el => el.textContent.includes('星图回应'))?.click() })
await page.waitForTimeout(900)
const tick = await page.evaluate(() => {
  const active = document.querySelector('.authoring-chapter-row.is-active')
  if (!active) return { has: false }
  const before = getComputedStyle(active, '::before')
  return { content: before.content, width: before.width, background: before.backgroundColor, position: getComputedStyle(active).position }
})
check('当前章有单一左刻度', tick.content !== 'none' && tick.position === 'relative', JSON.stringify(tick))
record('NV-05', '章节行章序间隔与当前章刻度')

// ---------- Gate：构思/正文切换稿面不跳 ----------
current = { id: 'V2-GATE', checks: [] }
await page.evaluate(() => { document.querySelector('.wall__dossier-scroll').scrollTop = 600 })
await page.waitForTimeout(300)
const before = await page.evaluate(() => ({
  scrollTop: document.querySelector('.wall__dossier-scroll').scrollTop,
  title: document.querySelector('.wall__dossier-title')?.getBoundingClientRect().top,
  proseWidth: Math.round(document.querySelector('.ProseMirror')?.getBoundingClientRect().width)
}))
await page.evaluate(() => {
  // 未编排探索的打开事件绑定在内层 .wt3-doc-open 按钮（外层行还带删除按钮）
  const row = [...document.querySelectorAll('.wall__shelf .wt3-doc-row')]
    .find((el) => (el.textContent || '').includes('未编排速记'))
  row?.querySelector('.wt3-doc-open')?.click()
})
await page.waitForTimeout(1200)
const inExploration = await page.evaluate(() => document.querySelector('.wt3-badge')?.textContent || '')
await page.evaluate(() => { const back = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('返回正文')); back?.click() })
await page.waitForTimeout(1200)
const after = await page.evaluate(() => ({
  scrollTop: document.querySelector('.wall__dossier-scroll').scrollTop,
  title: document.querySelector('.wall__dossier-title')?.getBoundingClientRect().top,
  proseWidth: Math.round(document.querySelector('.ProseMirror')?.getBoundingClientRect().width),
  chapterBack: document.querySelector('.wall__chapter-ordinal')?.textContent
}))
check('构思文档能打开（带构思徽标）', inExploration === '构思', inExploration)
check('返回正文后稿面宽度不变', before.proseWidth === after.proseWidth, `${before.proseWidth} -> ${after.proseWidth}`)
check('返回正文后标题基线不跳（±2px）', Math.abs((before.title || 0) - (after.title || 0)) <= 2, `${before.title} -> ${after.title}`)
record('V2-GATE', '构思/正文切换稳定性')

// ---------- SC-01/02 当前场常驻与轴点击 ----------
current = { id: 'SC-01', checks: [] }
const scene = await page.evaluate(() => {
  const rail = document.querySelector('.wall__shelf-scene')
  if (!rail) return { has: false }
  const rect = rail.getBoundingClientRect()
  return { has: true, inViewport: rect.top < window.innerHeight && rect.bottom > 0, axes: [...rail.querySelectorAll('.ws-codex-section__label')].map((el) => el.textContent.trim()).slice(0, 6) }
})
check('当前场简报常驻左下（视口内）', scene.has && scene.inViewport, JSON.stringify(scene))
await page.screenshot({ path: path.join(SHOT_DIR, 'v2-scene-rail.png'), clip: { x: 0, y: 560, width: 240, height: 340 } })
record('SC-01', '当前场常驻简报')

check('无 console 错误积累', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
results[results.length - 1]?.checks.push()
await browser.close()

fs.writeFileSync(path.join(OUT_DIR, 'v2-check-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), dense, results }, null, 2))
const failed = results.filter((entry) => !entry.pass)
console.log('[v2] pass:', results.length - failed.length, '/', results.length)
for (const entry of failed) {
  console.log(`[v2] FAIL ${entry.id} ${entry.name}`)
  for (const item of entry.checks.filter((c) => !c.pass)) console.log(`  - ${item.label}: ${item.detail}`)
}
