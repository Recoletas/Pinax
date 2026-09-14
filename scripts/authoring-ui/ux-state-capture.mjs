/* global process */
/* eslint-disable no-console */
// C线 UX 状态截图工具：固定视口 + 合成 fixture,捕获关键作者状态基线/终版证据。
// 用法：BASE=http://127.0.0.1:5213 node scripts/authoring-ui/ux-state-capture.mjs [--only=state1,state2]
// 产物：OUT_DIR(默认 docs/agent-runs/nightly-20260913/c-ux-20260914/screenshots)/*.png + capture-log.json
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5213'
const OUT_DIR = path.resolve(process.env.OUT_DIR || 'docs/agent-runs/nightly-20260913/c-ux-20260914/screenshots')
const FIXTURE_DIR = path.resolve(process.env.FIXTURE_DIR || 'tmp/authoring-context-closure')
const ONLY = (process.argv.find((arg) => arg.startsWith('--only=')) || '').replace('--only=', '')
  .split(',').map((item) => item.trim()).filter(Boolean)

fs.mkdirSync(OUT_DIR, { recursive: true })
const COMMIT = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
const DIRTY = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim()
const fixtureStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  short: { width: 720, height: 450 },
  tablet: { width: 1280, height: 800 },
  tabletSmall: { width: 1024, height: 768 },
  darkMedium: { width: 900, height: 700 }
}

const SYNTH_DIR = path.resolve('tmp/ux-capture-files')
fs.mkdirSync(SYNTH_DIR, { recursive: true })
const importSamplePath = path.join(SYNTH_DIR, 'sample-manuscript.txt')
fs.writeFileSync(importSamplePath, [
  '# 潮汐表',
  '',
  '## 第一章 退潮之后',
  '',
  '林澜把潮汐表折成四折,塞进袖口。码头的灯一盏盏熄了,只剩灯塔还在数着船。',
  '她数到第七盏时,海面浮起一层不属于月光的亮。',
  '',
  '## 第二章 守灯人',
  '',
  '守灯人没有名字。他只在一月的第一天开门,把去年的风放出去。',
  '林澜敲门时,门里的声音问:你带来的是哪一年的潮汐表?'
].join('\n'))
const longSamplePath = path.join(SYNTH_DIR, 'sample-120-chapters.txt')
{
  const parts = ['# 长卷样本']
  for (let index = 1; index <= 120; index += 1) {
    parts.push(`## 第${index}章 试探`)
    parts.push('')
    parts.push(`第${index}次尝试:她在墙上刻下正字,潮水每晚抹去一笔。`)
  }
  fs.writeFileSync(longSamplePath, `${parts.join('\n')}\n`)
}

const captures = []
const only = (name) => !ONLY.length || ONLY.includes(name)

async function seedFixtureStorage(context, theme = 'light') {
  const page = await context.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ snapshot, theme }) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_theme', theme)
    localStorage.setItem('app_ui_zoom', '1')
  }, { snapshot: fixtureStorage, theme })
  await page.close()
}

async function newPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  return { context, page }
}

async function shot(page, name, label, note) {
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  captures.push({ name, label, note, viewport: page.viewportSize(), file: path.relative(process.cwd(), file) })
  console.log(`[capture] ${name} (${label})`)
}

const browser = await chromium.launch()

try {
  // 1) Welcome 空库
  if (only('welcome-empty')) {
    for (const [tag, viewport] of [['desktop', VIEWPORTS.desktop], ['mobile', VIEWPORTS.mobile]]) {
      const { context, page } = await newPage(browser, viewport)
      await shot(page, `c00-welcome-empty-${tag}`, tag === 'mobile' ? '390x844' : '1440x900',
        '空库首访:主信息/两条主路径/引导回路')
      await context.close()
    }
  }

  // 2) Welcome 有书(回访)
  if (only('welcome-books')) {
    for (const [tag, viewport] of [['desktop', VIEWPORTS.desktop], ['mobile', VIEWPORTS.mobile]]) {
      const { context, page } = await newPage(browser, viewport)
      await seedFixtureStorage(context)
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      await shot(page, `c00-welcome-books-${tag}`, tag === 'mobile' ? '390x844' : '1440x900',
        '回访:最近作品位置与主动作层级')
      await context.close()
    }
  }

  // 3) 稿面 + 长章名 + 保存状态
  if (only('manuscript')) {
    const { context, page } = await newPage(browser, VIEWPORTS.desktop)
    await seedFixtureStorage(context)
    await page.goto(`${BASE}/authoring`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1400)
    await page.evaluate(() => {
      const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
      if (books[0]?.chapters?.[0]) books[0].chapters[0].title = '第七响之后:旧港税务所的潮汐、水痕与不能回答的真名(很长的章节标题用来验证换行与保存徽章的空间关系)'
      localStorage.setItem('writing_books', JSON.stringify(books))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1600)
    await shot(page, 'c00-manuscript-long-title', '1440x900', '稿面主视觉:长章名换行/保存chip/右栏未开')
    await context.close()
  }

  // 4) 设置-备份页
  if (only('settings-backup')) {
    const { context, page } = await newPage(browser, VIEWPORTS.desktop)
    await seedFixtureStorage(context)
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: '备份' }).click()
    await page.waitForTimeout(900)
    await shot(page, 'c00-settings-backup', '1440x900', '备份面:作者看到的信息顺序(localStorage键/导出恢复)')
    await context.close()
  }

  // 5) 导入预览(正常样本)
  if (only('import-preview')) {
    const { context, page } = await newPage(browser, VIEWPORTS.desktop)
    await seedFixtureStorage(context)
    await page.goto(`${BASE}/authoring?start=import`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await page.setInputFiles('input[type="file"]', importSamplePath)
    await page.waitForTimeout(700)
    await shot(page, 'c00-import-preview', '1440x900', '导入预览:书名/拆章模式/章列表/确认')
    await context.close()
  }

  // 6) 导入 120 章(短屏)
  if (only('import-120')) {
    const { context, page } = await newPage(browser, VIEWPORTS.short)
    await seedFixtureStorage(context)
    await page.goto(`${BASE}/authoring?start=import`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await page.setInputFiles('input[type="file"]', longSamplePath)
    await page.waitForTimeout(700)
    await shot(page, 'c00-import-120-short', '720x450', '120章短屏:高度控制与确认可达性')
    await context.close()
  }

  // 7) 推演失败(后端不可用)
  if (only('rehearsal-failure')) {
    const { context, page } = await newPage(browser, VIEWPORTS.desktop)
    await seedFixtureStorage(context)
    await page.goto(`${BASE}/authoring`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1600)
    const railButton = page.locator('.writing-tool-rail button', { hasText: '推演' }).first()
    await railButton.click()
    await page.waitForTimeout(900)
    const startButton = page.getByRole('button', { name: '从当前段落开始' })
    if (await startButton.count()) {
      await startButton.click()
      await page.waitForTimeout(1200)
    }
    await shot(page, 'c00-rehearsal-start', '1440x900', '推演起点:行动草拟态')
    const draftBox = page.locator('.rehearsal-panel textarea, .rehearsal-panel input[type="text"]').last()
    if (await draftBox.count()) {
      await draftBox.fill('莉娜检查书架深处翻动纸页的声音')
      await page.waitForTimeout(400)
    }
    const submit = page.getByRole('button', { name: /试演/ }).last()
    if (await submit.count() && await submit.isEnabled()) {
      await submit.click()
      await page.waitForTimeout(9000)
    }
    await shot(page, 'c00-rehearsal-failure', '1440x900', '推演失败:后端不可用时的错误呈现/自救动作')
    await context.close()
  }
  // 8) 视口矩阵:长章名稿面 1280/1024/900暗色(J13 关键态)
  if (only('matrix')) {
    for (const [tag, viewport, theme] of [
      ['1280', VIEWPORTS.tablet, 'light'],
      ['1024', VIEWPORTS.tabletSmall, 'light'],
      ['900-dark', VIEWPORTS.darkMedium, 'dark']
    ]) {
      const { context, page } = await newPage(browser, viewport)
      await seedFixtureStorage(context, theme)
      await page.goto(`${BASE}/authoring`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1400)
      await page.evaluate(() => {
        const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
        if (books[0]?.chapters?.[0]) books[0].chapters[0].title = '第七响之后:旧港税务所的潮汐、水痕与不能回答的真名(很长的章节标题用来验证换行与保存徽章的空间关系)'
        localStorage.setItem('writing_books', JSON.stringify(books))
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1600)
      await shot(page, `c08-matrix-long-title-${tag}`, `${viewport.width}x${viewport.height}${theme === 'dark' ? ' 暗色' : ''}`, '视口矩阵:长章名稿面可读性')
      await context.close()
    }
  }
} catch (error) {
  console.error('[capture] fatal:', error)
  process.exitCode = 2
} finally {
  fs.writeFileSync(path.join(OUT_DIR, 'capture-log.json'), JSON.stringify({
    schemaVersion: 1, base: BASE, commit: COMMIT, dirty: DIRTY || '(clean)', captures
  }, null, 2))
  await browser.close()
  console.log(`[capture] ${captures.length} shots -> ${OUT_DIR}`)
}
