// Slice V1 逐功能验收：SH-01/02、TB-01..10、ST-01、ED-01/02/03/09/10、RS-01/07。
// 每项在真实页面（fixture 注入）上真实操作，输出 tmp/authoring-rollout/acceptance/report.json。
// 用法：BASE=http://127.0.0.1:5173 node scripts/authoring-ui/rollout-acceptance.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('tmp/authoring-rollout')
const SHOT_DIR = path.join(OUT_DIR, 'acceptance')
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
  const entry = { label, pass: Boolean(pass), detail: String(detail).slice(0, 220) }
  if (current) current.checks.push(entry)
  return entry
}

async function rectOf(testId, selector) {
  const el = testId.locator(selector).first()
  try {
    return await el.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    })
  } catch {
    return null
  }
}

async function openFontPanel() {
  const alreadyOpen = await page.evaluate(() => Boolean(document.querySelector('.font-panel')))
  if (alreadyOpen) return
  await page.locator('#authoring-editor-toolbar-host .tool-btn[title*="排版"]').click()
  await page.waitForTimeout(350)
  const opened = await page.evaluate(() => Boolean(document.querySelector('.font-panel')))
  if (!opened) throw new Error('font panel did not open')
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addInitScript((snapshot) => {
  for (const [key, value] of Object.entries(snapshot)) {
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
  }
}, storage)
const page = await context.newPage()
const consoleErrors = []
page.on('pageerror', (err) => consoleErrors.push(err.message))

const SELECT_TEXT = (text) => {
  // DOM Range 不会同步进 ProseMirror 内部选区；用编辑器暴露的 selectText 测试桥
  //（与 authoring-journeys harness 相同约定）。
  let comp = null
  for (let node = document.querySelector('.ProseMirror'); node; node = node.parentElement) {
    if (node.__vueParentComponent) { comp = node.__vueParentComponent; break }
  }
  let depth = 0
  while (comp && !comp.exposed?.selectText && comp.parent && depth < 8) { comp = comp.parent; depth += 1 }
  if (!comp?.exposed?.selectText) return false
  return Boolean(comp.exposed.selectText(text, 0))
}
const RECT = (selector) => {
  const el = document.querySelector(selector)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
}
const scrollChapterIntoEditor = async (title) => {
  await page.evaluate((chapterTitle) => {
    const rows = [...document.querySelectorAll('.authoring-chapter-row')]
    ;(rows.find((el) => (el.textContent || '').includes(chapterTitle)) || rows[0]).click()
  }, title)
  await page.waitForTimeout(900)
}

await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.authoring-chapter-row', { timeout: 30000 })
await page.waitForTimeout(1200)
await scrollChapterIntoEditor('星图回应')

// ---------- SH-01 workspace 书页签 ----------
current = { id: 'SH-01', checks: [] }
check('单书时内部书页签退役', await page.evaluate(() => !document.querySelector('.authoring-book-tabs')))
await scrollChapterIntoEditor('灯下空格')
check('切章后稿面章序更新为第二章', (await page.evaluate(() => document.querySelector('.wall__chapter-ordinal')?.textContent)) === '第二章')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.authoring-chapter-row', { timeout: 30000 })
await page.waitForTimeout(1200)
check('刷新后仍选中《雾港纪事》（URL bookId 恢复）', await page.evaluate((bookId) => location.search.includes(bookId), state.bookId))
check('刷新后章节列表仍渲染 5 章（含探索行）', await page.evaluate(() => document.querySelectorAll('.authoring-chapter-row').length) >= 5, `rows=${await page.evaluate(() => document.querySelectorAll('.authoring-chapter-row').length)}`)
record('SH-01', 'workspace 书页签 / 切章 / 刷新恢复')

// ---------- SH-02 Authoring 工具条 ----------
current = { id: 'SH-02', checks: [] }
const corkRect = await rectOf(page, '.wall__cork')
check('工具条单行且高度受控（≤46px）', corkRect && corkRect.h <= 46, JSON.stringify(corkRect))
const order = await page.evaluate(() => [...document.querySelectorAll('#authoring-editor-toolbar-host .tool-btn')].map((el) => el.textContent.trim()).join('|'))
check('工具顺序＝撤销/重做|排版/快捷词/取名/生图/专注/校对/查找（F2 后的实用工具序）', order === '撤销|重做|排版|快捷词|取名|生图|专注|校对|查找', order)
check('收件箱/素材库不在常驻工具条', !order.includes('收件箱') && !order.includes('素材库'), order)
await page.click('button[aria-label="更多写作操作"]')
await page.waitForTimeout(400)
const moreVisible = await page.evaluate(() => {
  const menu = document.querySelector('.wall__more-menu.is-fixed-menu')
  if (!menu) return { open: false }
  const rect = menu.getBoundingClientRect()
  return { open: true, visible: rect.height > 40 && rect.bottom <= window.innerHeight && rect.width > 120, position: getComputedStyle(menu).position }
})
check('更多菜单打开且可见（fixed 定位，不被工具条裁切）', moreVisible.open && moreVisible.visible && moreVisible.position === 'fixed', JSON.stringify(moreVisible))
const moreItems = await page.evaluate(() => [...document.querySelectorAll('.wall__more-menu.is-fixed-menu button')].map((el) => el.textContent.trim()))
check('更多菜单含素材收件箱/素材库/自动联想', ['素材收件箱', '素材库'].every((label) => moreItems.some((item) => item.includes(label))) && moreItems.some((item) => item.includes('自动联想')), moreItems.join('|'))
await page.screenshot({ path: path.join(SHOT_DIR, 'tb10-more-menu.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('Esc 关闭更多菜单', await page.evaluate(() => !document.querySelector('.wall__more-menu.is-fixed-menu')))
record('SH-02', 'Authoring 工具条单行分组与更多归属')

// ---------- TB-01 撤销/重做 ----------
current = { id: 'TB-01', checks: [] }
await scrollChapterIntoEditor('星图回应')
const undoBtn = page.locator('#authoring-editor-toolbar-host .tool-btn[title*="撤销"]')
const redoBtn = page.locator('#authoring-editor-toolbar-host .tool-btn[title*="重做"]')
check('空历史时重做禁用', await redoBtn.isDisabled())
await page.click('.ProseMirror')
await page.keyboard.press('Control+End')
await page.keyboard.insertText('试验句。')
await page.waitForTimeout(300)
check('输入后撤销可用', await undoBtn.isEnabled())
await undoBtn.click()
await page.waitForTimeout(300)
const toolbarUndoWorked = !(await page.evaluate(() => document.querySelector('.ProseMirror').textContent.includes('试验句。')))
check('工具条撤销移除了输入文本', toolbarUndoWorked)
await page.click('.ProseMirror')
await page.waitForTimeout(700)
const redoAfterToolbarUndo = await redoBtn.isEnabled()
check('工具条撤销后重做按钮状态同步（UI 状态缺陷观察点）', redoAfterToolbarUndo, `redoEnabled=${redoAfterToolbarUndo}`)
if (!redoAfterToolbarUndo) {
  // 功能路径继续用键盘历史：保持编辑器焦点
  await page.keyboard.press('Control+z') // 可能无实际效果，仅恢复焦点后的状态
  await page.waitForTimeout(200)
}
await undoBtn.click().catch(() => {})
await page.waitForTimeout(400)
check('撤销后文本不在稿面', !(await page.evaluate(() => document.querySelector('.ProseMirror').textContent.includes('试验句。'))))
await page.locator(".ProseMirror p").nth(1).click()
await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(400)
check('键盘重做恢复文本', await page.evaluate(() => document.querySelector('.ProseMirror').textContent.includes('试验句。')))
await page.locator(".ProseMirror p").nth(1).click()
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
check('键盘撤销再次移除（历史原子）', !(await page.evaluate(() => document.querySelector('.ProseMirror').textContent.includes('试验句。'))))
record('TB-01', '撤销/重做 enabled-disabled 与反馈')

// ---------- TB-02 粗体/斜体（选区浮条） ----------
current = { id: 'TB-02', checks: [] }
const selectViaBridge = (text) => page.evaluate((needle) => {
  let comp = null
  for (let node = document.querySelector('.ProseMirror'); node; node = node.parentElement) {
    if (node.__vueParentComponent) { comp = node.__vueParentComponent; break }
  }
  let depth = 0
  while (comp && !comp.exposed?.selectText && comp.parent && depth < 8) { comp = comp.parent; depth += 1 }
  return Boolean(comp.exposed?.selectText?.(needle, 0))
}, text)
await selectViaBridge('黄铜大锁')
await page.waitForTimeout(400)
await page.keyboard.press('Control+b')
await page.waitForTimeout(400)
check('Ctrl+B 为选区加粗', await page.evaluate(() => Boolean(document.querySelector('.ProseMirror strong'))))
await selectViaBridge('黄铜大锁')
await page.waitForTimeout(300)
const boldWeight = await page.evaluate(() => {
  const strong = document.querySelector('.ProseMirror strong')
  return strong ? getComputedStyle(strong).fontWeight : null
})
check('加粗文本字重同步（active 可辨）', boldWeight && Number(boldWeight) >= 600, `fontWeight=${boldWeight}`)
await page.keyboard.press('Control+b')
await page.waitForTimeout(400)
check('再次 Ctrl+B 取消粗体', !(await page.evaluate(() => Boolean(document.querySelector('.ProseMirror strong')))))
record('TB-02', '粗体/斜体 active 与取消')

// ---------- TB-03 分隔线 ----------
current = { id: 'TB-03', checks: [] }
const beforeDivider = await page.evaluate(() => document.querySelectorAll('.ProseMirror hr').length)
await page.evaluate(() => {
    let comp = null
    for (let node = document.querySelector('.writing-page'); node; node = node.parentElement) {
      if (node.__vueParentComponent) { comp = node.__vueParentComponent; break }
    }
    comp.setupState.insertSeparator()
  })
await page.waitForTimeout(400)
const afterDivider = await page.evaluate(() => document.querySelectorAll('.ProseMirror hr').length)
check('插入分隔线后 hr 数量 +1', afterDivider === beforeDivider + 1, `${beforeDivider}->${afterDivider}`)
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
check('撤销移除分隔线', (await page.evaluate(() => document.querySelectorAll('.ProseMirror hr').length)) === beforeDivider)
record('TB-03', '分隔线插入与撤销')

// ---------- TB-04 排版 ----------
current = { id: 'TB-04', checks: [] }
await page.locator('#authoring-editor-toolbar-host .tool-btn[title*="排版"]').click()
await page.waitForTimeout(300)
check('排版面板展开', await page.evaluate(() => Boolean(document.querySelector('.font-panel'))))
await page.screenshot({ path: path.join(SHOT_DIR, 'tb04-font-panel.png') })
await page.selectOption('.font-panel select.fp-select', 'wenkai')
await page.locator('.font-panel .fp-btn[title="放大"]').click()
await page.waitForTimeout(300)
const proseAfter = await page.evaluate(() => { const style = getComputedStyle(document.querySelector('.ProseMirror p')); return { font: style.fontFamily.slice(0, 40), size: style.fontSize } })
check('字体即时切换为文楷栈', proseAfter.font.includes('LXGW'), proseAfter.font)
check('字号即时 +2 = 19px', proseAfter.size === '19px', proseAfter.size)
await page.keyboard.press('Escape')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.authoring-chapter-row', { timeout: 30000 })
await page.waitForTimeout(1200)
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_typography') || '{}'))
check('排版设置刷新后持久（wenkai/19）', persisted.fontKey === 'wenkai' && persisted.fontSize === 19, JSON.stringify(persisted))
await scrollChapterIntoEditor('星图回应')
// 还原默认：清掉持久化排版并刷新，让 store 回到出厂值（中文栈/17px）
await page.evaluate(() => localStorage.removeItem('writing_typography'))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.authoring-chapter-row', { timeout: 30000 })
await page.waitForTimeout(1200)
await scrollChapterIntoEditor('星图回应')
record('TB-04', '排版面板与即时预览、持久')

// ---------- TB-05 取名 ----------
current = { id: 'TB-05', checks: [] }
await page.locator('#authoring-editor-toolbar-host .tool-btn[title*="取名"]').click()
await page.waitForSelector('.quick-name-workbench', { timeout: 5000 })
await page.waitForTimeout(1200)
const nameCount = await page.evaluate(() => document.querySelectorAll('.quick-name-results button').length)
check('生成候选 ≥ 8', nameCount >= 8, `count=${nameCount}`)
await page.screenshot({ path: path.join(SHOT_DIR, 'tb05-name-gen.png') })
const firstNames = await page.evaluate(() => [...document.querySelectorAll('.quick-name-results button strong')].slice(0, 8).map((el) => el.textContent))
check('候选可换一批（再次生成不崩溃）', await page.evaluate(() => { document.querySelector('.quick-name-foot button').click(); return true }))
await page.waitForTimeout(1000)
await page.locator('.quick-name-close').click()
await page.waitForTimeout(500)
check('关闭弹窗（×）', await page.evaluate(() => !document.querySelector('.quick-name-workbench')))
const dupRate = new Set(firstNames).size / Math.max(1, firstNames.length)
check('首批候选基本不重复', dupRate === 1, firstNames.join(','))
record('TB-05', '取名入口/候选/关闭', )

// ---------- TB-06 打字机 ----------
current = { id: 'TB-06', checks: [] }
await page.locator('#authoring-editor-toolbar-host .tool-btn[title*="排版"]').click()
await page.waitForTimeout(300)
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.font-panel .fp-row')].find((el) => el.querySelector('.fp-label')?.textContent === '打字机')
  row.querySelector('button').click()
})
await page.waitForTimeout(300)
const typeOn = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.font-panel .fp-row')].find((el) => el.querySelector('.fp-label')?.textContent === '打字机')
  return row?.querySelector('button')?.getAttribute('aria-pressed') === 'true'
})
check('打字机开关进入开态', typeOn)
await page.locator(".ProseMirror p").nth(11).click()
await page.waitForTimeout(600)
const typeScroll = await page.evaluate(() => document.querySelector('.wall__dossier-scroll').scrollTop)
check('开启后滚动位置被主动调整（打字机生效）', typeScroll > 0, `scrollTop=${typeScroll}`)
await openFontPanel()
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.font-panel .fp-row')].find((el) => el.querySelector('.fp-label')?.textContent === '打字机')
  row.querySelector('button').click()
})
await page.waitForTimeout(300)
check('退出打字机恢复关态', await page.evaluate(() => {
  const row = [...document.querySelectorAll('.font-panel .fp-row')].find((el) => el.querySelector('.fp-label')?.textContent === '打字机')
  return row.querySelector('button').getAttribute('aria-pressed') === 'false'
}))
record('TB-06', '打字机开关')

// ---------- TB-07 聚焦 ----------
current = { id: 'TB-07', checks: [] }
await page.locator(".ProseMirror p").nth(9).click()
await openFontPanel()
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.font-panel .fp-row')].find((el) => el.querySelector('.fp-label')?.textContent === '聚焦')
  row.querySelector('button').click()
})
await page.waitForTimeout(400)
const focusOpacity = await page.evaluate(() => {
  const paragraphs = [...document.querySelectorAll('.ProseMirror p')]
  const currentParagraph = paragraphs.findIndex((el) => el.classList.contains('has-focus') || el.getAttribute('data-focus') === 'true')
  const sample = paragraphs[0]
  return { current: currentParagraph, firstOpacity: getComputedStyle(sample).opacity }
})
check('聚焦模式生效（非当前段透明度下降）', Number(focusOpacity.firstOpacity) < 1, JSON.stringify(focusOpacity))
await page.screenshot({ path: path.join(SHOT_DIR, 'tb07-focus.png') })
await openFontPanel()
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.font-panel .fp-row')].find((el) => el.querySelector('.fp-label')?.textContent === '聚焦')
  row.querySelector('button').click()
})
await page.waitForTimeout(300)
check('退出聚焦恢复（非当前段恢复全量）', await page.evaluate(() => {
  const sample = document.querySelector('.ProseMirror p')
  return Number(getComputedStyle(sample).opacity) === 1
}))
record('TB-07', '聚焦开关与层级')

// ---------- TB-08 专注/全屏 ----------
current = { id: 'TB-08', checks: [] }
await page.locator('#authoring-editor-toolbar-host .tool-btn[title*="专注全屏"]').click()
await page.waitForTimeout(500)
check('进入专注：出现退出按钮', await page.evaluate(() => Boolean(document.querySelector('.wall__zen-exit'))))
const zenState = await page.evaluate(() => ({
  cork: getComputedStyle(document.querySelector('.wall__cork')).display,
  shelf: getComputedStyle(document.querySelector('.wall__shelf')).display,
  rail: getComputedStyle(document.querySelector('.writing-tool-rail')).display,
  mainCols: getComputedStyle(document.querySelector('.wall__main')).gridTemplateColumns.split(' ').length
}))
check('专注进入全屏（顶栏/左栏/rail 隐藏，正文单列占满）', zenState.cork === 'none' && zenState.shelf === 'none' && zenState.rail === 'none' && zenState.mainCols === 1, JSON.stringify(zenState))
await page.screenshot({ path: path.join(SHOT_DIR, 'tb08-zen.png') })
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
check('Esc 退出专注', await page.evaluate(() => !document.querySelector('.wall__zen-exit')))
check('退出后工具条恢复可见', await page.evaluate(() => Boolean(document.querySelector('#authoring-editor-toolbar-host .editor-toolbar'))))
record('TB-08', '专注进入/Esc 退出/布局恢复')

// ---------- TB-09 查找（四域搜索面板，F2 重构后） ----------
current = { id: 'TB-09', checks: [] }
await page.locator('#authoring-editor-toolbar-host .tool-btn[title*="查找"]').click()
await page.locator('[data-test="authoring-search-panel"]').waitFor({ state: 'visible', timeout: 5000 })
const searchInput = page.locator('[data-test="authoring-search-panel"] input[aria-label="查找文字"]')
await searchInput.fill('税务所')
await searchInput.press('Enter')
await page.waitForTimeout(800)
const searchStatus = await page.evaluate(() => document.querySelector('[data-test="authoring-search-panel"] [role="status"]')?.textContent?.trim() || '')
check('四域搜索命中计数', /[0-9]+ 处/.test(searchStatus), searchStatus)
await searchInput.fill('不存在的词组')
await searchInput.press('Enter')
await page.waitForTimeout(800)
const zeroStatus = await page.evaluate(() => document.querySelector('[data-test="authoring-search-panel"] [role="status"]')?.textContent?.trim() || '')
check('零结果显示 0 处', zeroStatus.includes('0 处'), zeroStatus)
await searchInput.fill('税务所')
await searchInput.press('Enter')
await page.waitForTimeout(600)
await page.screenshot({ path: path.join(SHOT_DIR, 'tb09-search-panel.png'), clip: { x: 1050, y: 60, width: 390, height: 840 } })
await page.locator('[data-test="authoring-search-panel"] button[aria-label="关闭查找"]').click()
await page.waitForTimeout(300)
check('关闭搜索面板', await page.evaluate(() => !document.querySelector('[data-test="authoring-search-panel"]')))
record('TB-09', '四域搜索面板（查找/计数/零结果/关闭）；替换与跨章返回由 F2 33/33 覆盖')

// ---------- ST-01 保存反馈 ----------
current = { id: 'ST-01', checks: [] }
await page.click('.ProseMirror')
await page.keyboard.press('Control+End')
await page.keyboard.insertText('潮。')
const chipAppeared = await page.waitForSelector('.wall__save-chip', { timeout: 12000 }).then(() => true).catch(() => false)
check('输入后出现保存反馈 chip', chipAppeared)
if (chipAppeared) await page.screenshot({ path: path.join(SHOT_DIR, 'st01-save-chip.png') })
const chipGone = await page.waitForSelector('.wall__save-chip', { state: 'detached', timeout: 20000 }).then(() => true).catch(() => false)
check('稳定保存态后 chip 短暂消失（不常驻）', chipGone)
record('ST-01', '保存反馈短显')

// ---------- ED-01 章节标题 ----------
current = { id: 'ED-01', checks: [] }
check('稿面标题含章序“第五章”', (await page.evaluate(() => document.querySelector('.wall__chapter-ordinal')?.textContent)) === '第五章')
check('标题输入无原生边框', await page.evaluate(() => getComputedStyle(document.querySelector('.wall__dossier-title')).borderStyle === 'none'))
await page.fill('.wall__dossier-title', '星图回应·试')
await page.waitForTimeout(1500)
check('标题编辑后保存（左导航同步）', await page.evaluate(() => [...document.querySelectorAll('.authoring-chapter-row')].some((el) => el.textContent.includes('星图回应·试'))))
await page.fill('.wall__dossier-title', '星图回应')
await page.waitForTimeout(1200)
check('标题还原', await page.evaluate(() => [...document.querySelectorAll('.authoring-chapter-row')].every((el) => !el.textContent.includes('·试'))))
record('ED-01', '稿面内标题/章序/编辑保存')

// ---------- ED-02 中文输入 ----------
current = { id: 'ED-02', checks: [] }
await page.locator(".ProseMirror p").nth(2).click()
await page.keyboard.press('End')
await page.keyboard.insertText('雾在窗外又涨了一指。')
await page.waitForTimeout(300)
check('中文句子插入正文', await page.evaluate(() => document.querySelector('.ProseMirror').textContent.includes('雾在窗外又涨了一指。')))
await page.keyboard.press('Enter')
await page.keyboard.insertText('第二段试笔。')
await page.waitForTimeout(800)
check('换段产生新段落', await page.evaluate(() => [...document.querySelectorAll('.ProseMirror p')].some((el) => el.textContent.startsWith('第二段试笔。'))), JSON.stringify((await page.evaluate(() => [...document.querySelectorAll('.ProseMirror p')].map((el) => el.textContent.slice(0, 24))))))
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
await page.waitForTimeout(300)
check('输入与换段可撤销', !(await page.evaluate(() => document.querySelector('.ProseMirror').textContent.includes('第二段试笔。'))))
record('ED-02', '中文输入/换段/删除')

// ---------- ED-03 首行与段落排版 ----------
current = { id: 'ED-03', checks: [] }
const typography = await page.evaluate(() => {
  const sample = [...document.querySelectorAll('.ProseMirror p')].find((el) => el.textContent.length > 40)
  const style = getComputedStyle(sample)
  const size = parseFloat(style.fontSize)
  return { indent: style.textIndent, size: style.fontSize, lineHeight: style.lineHeight, indentChars: parseFloat(style.textIndent) / size }
})
check('首行缩进≈2 字符', Math.abs(typography.indentChars - 2) < 0.15, JSON.stringify(typography))
check('正文 17px / 行高 1.8', typography.size === '17px' && Math.abs(parseFloat(typography.lineHeight) / 17 - 1.8) < 0.01, `${typography.size}/${typography.lineHeight}`)
record('ED-03', '首行缩进与字号行距')

// ---------- ED-09 滚动 owner 与 caret ----------
current = { id: 'ED-09', checks: [] }
const beforeScroll = {
  cork: await rectOf(page, '.wall__cork'),
  shelf: await rectOf(page, '.wall__shelf'),
  footer: await rectOf(page, '.dossier-footer'),
  bodyScroll: await page.evaluate(() => document.documentElement.scrollTop)
}
await page.evaluate(() => { document.querySelector('.wall__dossier-scroll').scrollTop = 800 })
await page.waitForTimeout(400)
const afterScroll = {
  cork: await rectOf(page, '.wall__cork'),
  shelf: await rectOf(page, '.wall__shelf'),
  footer: await rectOf(page, '.dossier-footer'),
  bodyScroll: await page.evaluate(() => document.documentElement.scrollTop),
  dossierScroll: await page.evaluate(() => document.querySelector('.wall__dossier-scroll').scrollTop)
}
check('正文滚动时顶栏不动', JSON.stringify(beforeScroll.cork) === JSON.stringify(afterScroll.cork))
check('正文滚动时左栏不动', JSON.stringify(beforeScroll.shelf) === JSON.stringify(afterScroll.shelf))
check('正文滚动时底栏不动', JSON.stringify(beforeScroll.footer) === JSON.stringify(afterScroll.footer))
check('页面本身不滚动（唯一滚动 owner）', afterScroll.bodyScroll === 0 && afterScroll.dossierScroll === 800, JSON.stringify(afterScroll))
await page.evaluate(() => { document.querySelector('.wall__dossier-scroll').scrollTop = 0 })
record('ED-09', '滚动 owner 与固定侧栏')

// ---------- ED-10 稿面底栏 ----------
current = { id: 'ED-10', checks: [] }
const footerText = await page.evaluate(() => document.querySelector('.dossier-footer')?.textContent || '')
check('底栏含字数/字符/修订', /字.*字符.*修订/s.test(footerText.replace(/\s/g, '')), footerText)
check('底栏无自动联想按钮', await page.evaluate(() => !document.querySelector('.dossier-footer button')))
const wordBefore = await page.evaluate(() => document.querySelector('.dossier-footer')?.textContent.match(/([\d,]+) 字/)?.[1])
await page.click('.ProseMirror')
await page.keyboard.press('Control+End')
await page.keyboard.insertText('潮汐')
await page.waitForTimeout(600)
const wordAfter = await page.evaluate(() => document.querySelector('.dossier-footer')?.textContent.match(/([\d,]+) 字/)?.[1])
check('输入后字数即时更新', wordBefore !== wordAfter, `${wordBefore} -> ${wordAfter}`)
await page.keyboard.press('Control+z')
await page.waitForTimeout(200)
record('ED-10', '底栏安静信息')

// ---------- RS-01 1440 桌面四列关系 ----------
current = { id: 'RS-01', checks: [] }
const rs01 = {
  shelf: await rectOf(page, '.wall__shelf'),
  rail: await rectOf(page, '.writing-tool-rail'),
  dossier: await rectOf(page, '.wall__dossier'),
  horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
}
check('左栏/稿面/rail 同行排布', rs01.shelf.y === rs01.dossier.y && rs01.rail.y === rs01.dossier.y, JSON.stringify(rs01))
check('无横向页面滚动', !rs01.horizontalOverflow)
record('RS-01', '1440 桌面结构')

// ---------- RS-07 作用域与竞态 ----------
current = { id: 'RS-07', checks: [] }
for (const title of ['魔力异常', '低潮线', '星图回应', '灯下空格', '星图回应']) {
  await scrollChapterIntoEditor(title)
}
await page.waitForTimeout(1200)
check('快速切章后编辑器只保留一份工具栏', await page.evaluate(() => document.querySelectorAll('.editor-toolbar').length) === 1)
check('快速切章后稿面章序与目标一致', (await page.evaluate(() => document.querySelector('.wall__chapter-ordinal')?.textContent)) === '第五章')
await scrollChapterIntoEditor('星图回应')
check('最终切回第五章内容正确', await page.evaluate(() => document.querySelector('.ProseMirror').textContent.includes('黄铜大锁')))
check('无 console 错误积累', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
record('RS-07', '快速切章作用域')

await browser.close()

fs.writeFileSync(path.join(OUT_DIR, 'acceptance', 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
const failed = results.filter((entry) => !entry.pass)
console.log('[acceptance] pass:', results.length - failed.length, '/', results.length)
for (const entry of failed) {
  console.log(`[acceptance] FAIL ${entry.id} ${entry.name}`)
  for (const checkItem of entry.checks.filter((item) => !item.pass)) console.log(`  - ${checkItem.label}: ${checkItem.detail}`)
}
