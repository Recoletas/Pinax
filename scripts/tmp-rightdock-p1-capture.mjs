// rightdock P1 效果实拍采集（effect-showcase skill 流程）
// 用法：node scripts/tmp-rightdock-p1-capture.mjs
// 隔离栈：BASE=3012（编排在启动命令里）；产物：docs/screenshots/rightdock-p1-20261008/NN-name.png
// 证据：_staging/p1-showcase-evidence.json（localStorage 偏好 + 控制台噪音 + 建书名，供清理与文档引用）
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:3012'
const SHOTS = resolve('docs/screenshots/rightdock-p1-20261008')
const BOOK = `右栏工作台验收-${Date.now()}`
mkdirSync(SHOTS, { recursive: true })

const evidence = { book: BOOK, base: BASE, consoleNoise: [], steps: [] }
const record = (step, ok, detail = '') => {
  evidence.steps.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ' — ' + detail : ''}`)
  if (!ok) process.exitCode = 1
}
const shot = (page, name) => page.screenshot({ path: resolve(SHOTS, name + '.png') })

const browser = await chromium.launch({ channel: 'msedge' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

// 收尾清理：注册表条目 + 磁盘文件夹 + index 条目（只动本书名，崩了也要跑）。
function cleanupBook(name) {
  try {
    const regPath = 'server/.pinax-app/projects.registry.json'
    const reg = JSON.parse(rm_read(regPath))
    const hits = reg.projects.filter((p) => p.name === name)
    reg.projects = reg.projects.filter((p) => p.name !== name)
    rm_write(regPath, JSON.stringify(reg, null, 2) + '\n')
    const idxPath = 'server/.pinax-app/index.json'
    const idx = JSON.parse(rm_read(idxPath))
    idx.projects = (idx.projects || []).filter((p) => p.title !== name)
    rm_write(idxPath, JSON.stringify(idx, null, 2) + '\n')
    for (const hit of hits) if (hit.rootPath) rmSync(hit.rootPath, { recursive: true, force: true })
    rmSync(resolve(process.env.USERPROFILE || '', 'Documents/Pinax', name), { recursive: true, force: true })
    console.log(`cleanup: ${name}（注册表 ${hits.length} 条）`)
  } catch (err) { console.log('cleanup skipped:', err.message) }
}
import { readFileSync as rm_read, writeFileSync as rm_write } from 'node:fs'
page.on('console', (msg) => {
  if (msg.type() !== 'error') return
  const text = msg.text()
  if (text.includes('localmirror') || text.includes('Failed to load resource')) return
  evidence.consoleNoise.push(text.slice(0, 200))
})

// 01 真实用户流：新建项目 → 建章 → 输入正文（真实写路径）
await page.goto(BASE + '/authoring', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
await page.locator('.wall__pin-cta', { hasText: /新建书稿|建立第一本书/ }).click()
await page.fill('[data-test="project-info-title"]', BOOK)
await page.fill('[data-test="project-info-root"]', '')
await page.click('[data-test="project-info-confirm"]')
await page.waitForTimeout(1500)
const fc = page.locator('.wall__pin-cta', { hasText: '建立第一章' })
if (await fc.count()) { await fc.click(); await page.waitForTimeout(1000) }
await page.fill('input[aria-label="章节标题"]', '第一章 上元夜')
const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
await surface.click()
await page.keyboard.type('潮水漫过台阶，林昭站在岸边看灯。守卫在门口停下脚步，灯影里刀鞘先动了。')
await page.waitForTimeout(2500)
// 权威证据是磁盘落盘（状态栏措辞随保存态变化，不作断言锚）
await page.waitForTimeout(3500)
const projDir = resolve(process.env.USERPROFILE || '', 'Documents/Pinax', BOOK)
let chapterFile = ''
if (existsSync(projDir)) {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(d, e.name)) : [resolve(d, e.name)]))
  for (const f of walk(projDir)) {
    if (!/\.(md|txt|json)$/i.test(f)) continue
    try {
      if (readFileSync(f, 'utf8').includes('林昭站在岸边看灯')) { chapterFile = f; break }
    } catch {}
  }
}
evidence.chapterFile = chapterFile
record('01 正文输入并落盘（真实写路径）', Boolean(chapterFile), chapterFile || '磁盘未找到章节内容')
await shot(page, '01-new-book-chapter')

// 02 徽标进入 dock 会话段（收起态初始，徽标即助手入口）
const badge = page.locator('.authoring-dock__reopen')
if (await badge.isVisible().catch(() => false)) await badge.click()
else await page.locator('[data-authoring-tool="ai"]').first().click()
await page.waitForTimeout(800)
record('02 dock 会话段打开', await page.locator('[data-authoring-inspector="ai"]').isVisible().catch(() => false))
await shot(page, '02-dock-session')

// 03 真实提问（模型渠道现状如实采集）
await page.locator('.authoring-knowledge textarea, .authoring-knowledge input[type="text"]').first().fill('用一句话概括当前这一章写了什么。')
await page.keyboard.press('Enter')
await page.waitForTimeout(15000)
await shot(page, '03-assistant-ask')
const askArea = await page.locator('[data-authoring-inspector="ai"]').textContent().catch(() => '')
record('03 提问已提交（回答/失败态均如实采集）', askArea.length > 10)

// 04 草稿保留：输入草稿 → 切「工具」tab → 切回
const draftBox = page.locator('[data-authoring-inspector="ai"] textarea').last()
await draftBox.fill('草稿保留探针：切段往返后这一句应该还在。')
await page.locator('.authoring-dock__tabs button', { hasText: '工具' }).click()
await page.waitForTimeout(400)
await shot(page, '04-tools-tab')
await page.locator('.authoring-dock__tabs button', { hasText: '会话' }).click()
await page.waitForTimeout(400)
const draftKept = await draftBox.inputValue()
record('04 草稿切段往返保留', draftKept.includes('草稿保留探针'), draftKept.slice(0, 30))
await shot(page, '05-draft-kept')

// 05 批注面板 overlay + 真实建边注
await page.getByRole('button', { name: '批注' }).first().click()
await page.waitForTimeout(500)
await surface.click()
await page.keyboard.press('Home')
await page.keyboard.press('Shift+End')
await page.waitForTimeout(500)
await page.locator('.writing-selection-actions button[title="为选中文字添加批注"]').click()
await page.locator('.writing-annotation-composer textarea[aria-label="批注内容"]').fill('验收批注：刀鞘先动的伏笔要回收。')
await page.locator('.writing-annotation-composer button[type="submit"]').click()
await page.waitForTimeout(700)
record('05 边注卡片建卡', await page.locator('.writing-annotation').count() >= 1)
await shot(page, '06-annotations-overlay')

// 06 执行 / Agent 占位段（工具段已在 04 采过）
await page.locator('.authoring-dock__tabs button', { hasText: '执行' }).click()
await page.waitForTimeout(300)
await shot(page, '07-run-tab')
await page.locator('.authoring-dock__tabs button', { hasText: 'Agent' }).click()
await page.waitForTimeout(300)
await shot(page, '08-agent-tab')

// 07 拖宽到 ~520 并落盘偏好
const resizer = page.locator('.authoring-dock__resizer')
const box = await resizer.boundingBox()
const dockBox = await page.locator('.authoring-dock').boundingBox()
if (box && dockBox) {
  const rightEdge = dockBox.x + dockBox.width
  await page.mouse.move(box.x + box.width / 2, box.y + 400)
  await page.mouse.down()
  await page.mouse.move(rightEdge - 520, box.y + 400, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}
// 断言用 computed width（应用有 85% 界面缩放，rect 是缩放后屏幕像素）
const widthNow = await page.locator('.authoring-dock').evaluate((el) => Math.round(parseFloat(getComputedStyle(el).width)))
record('07 拖宽生效（CSS 宽 ≈520）', Math.abs(widthNow - 520) <= 6, String(widthNow))
await page.locator('.authoring-dock__tabs button', { hasText: '会话' }).click()
await shot(page, '09-resized-520')
evidence.dockPrefs = await page.evaluate(() => localStorage.getItem('writing_dock_preferences_v1'))

// 08 reload 后宽度保持（localStorage 偏好持久化）
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
const badge2 = page.locator('.authoring-dock__reopen')
if (await badge2.isVisible().catch(() => false)) await badge2.click()
await page.waitForTimeout(800)
const widthReloaded = await page.locator('.authoring-dock').evaluate((el) => Math.round(parseFloat(getComputedStyle(el).width)))
record('08 reload 后宽度保持', Math.abs(widthReloaded - widthNow) <= 6, `${widthReloaded} vs ${widthNow}`)
await shot(page, '10-width-persisted')

// 09 收起徽标 + 重开直达会话段
await page.locator('.writing-inspector__icon-btn[title="关闭检查器"]').click()
await page.waitForTimeout(500)
record('09 收起徽标出现', await page.locator('.authoring-dock__reopen').isVisible().catch(() => false))
await shot(page, '11-collapsed-badge')
await page.locator('.authoring-dock__reopen').click()
await page.waitForTimeout(600)
record('09 徽标重开直达会话段', await page.locator('[data-authoring-inspector="ai"]').isVisible().catch(() => false))
await shot(page, '12-badge-reopen-session')

// 10 dual 让位
await page.getByRole('button', { name: '双栏' }).first().click()
await page.waitForTimeout(700)
const dockHidden = await page.locator('.authoring-dock').evaluate((el) => getComputedStyle(el).display === 'none')
record('10 dual 时 dock 让位', dockHidden)
await shot(page, '13-dual-yield')
await page.getByRole('button', { name: '双栏' }).first().click()
await page.waitForTimeout(500)

// 11 390 移动端（退出 dual 会顺带关闭检查器：dual 二次点击=关闭语义，先经徽标重开）
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(900)
const mobileBadge = page.locator('.authoring-dock__reopen')
if (await mobileBadge.isVisible().catch(() => false)) await mobileBadge.click()
await page.waitForTimeout(800)
await shot(page, '14-mobile-sheet')
record('11 390 会话 sheet 打开', await page.locator('[data-authoring-inspector="ai"]').isVisible().catch(() => false))
await page.locator('.writing-inspector__icon-btn[title="关闭检查器"]').click()
await page.waitForTimeout(500)
await shot(page, '15-mobile-badge')
const badgeHittable = await page.evaluate(() => {
  const el = document.querySelector('.authoring-dock__reopen')
  if (!el) return false
  const hit = document.elementFromPoint(el.getBoundingClientRect().x + 17, el.getBoundingClientRect().y + 17)
  return el.contains(hit)
})
record('11 390 徽标可命中', badgeHittable)

evidence.finalUrl = page.url()
// 磁盘产物取证（清理前收集）：文件树 + 命中文件全文 + .pinax marker + 注册表条目
try {
  const walkTree = (d, depth = 0) => {
    if (depth > 3 || !existsSync(d)) return []
    return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = resolve(d, e.name)
      return e.isDirectory() ? [full.replace(projDir, '') + '/', ...walkTree(full, depth + 1)] : [`${full.replace(projDir, '')} (${readFileSync(full).byteLength} B)`]
    })
  }
  evidence.diskTree = walkTree(projDir)
  evidence.chapterFileContent = chapterFile ? readFileSync(chapterFile, 'utf8').slice(0, 1200) : ''
  const marker = resolve(projDir, '.pinax/project.json')
  if (existsSync(marker)) evidence.projectMarker = readFileSync(marker, 'utf8')
  const reg = JSON.parse(readFileSync('server/.pinax-app/projects.registry.json', 'utf8'))
  evidence.registryEntry = reg.projects.find((p) => p.name === BOOK) || null
} catch (err) { evidence.diskError = err.message }
writeFileSync(resolve('_staging/p1-showcase-evidence.json'), JSON.stringify(evidence, null, 2))
await browser.close()
cleanupBook(BOOK)
const fails = evidence.steps.filter((s) => !s.ok)
console.log(`\n== ${evidence.steps.length - fails.length}/${evidence.steps.length} PASS == 书名（清理用）: ${BOOK}`)
