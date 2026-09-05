/**
 * P1 Gate 驱动：打开 spike 页面，对三份原型做真实交互验证并截图。
 * 运行：node_modules/.bin/vite-node scripts/map-p1-spike.mjs（dev server 需已在 5199）
 * 产物：/tmp/map-p1-shots/*.png + /tmp/map-p1-measurements.json
 * （按 §9.6，最终只保留代表图入 docs/engineering/map-p1-assets/）
 */

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const BASE = process.env.SPIKE_URL || 'http://localhost:5199/'
const OUT = '/tmp/map-p1-shots'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()
const records = {}

async function newPage(width, height) {
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('pageerror', (err) => { records.pageErrors = records.pageErrors || []; records.pageErrors.push(String(err)) })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      records.consoleErrors = records.consoleErrors || []
      records.consoleErrors.push(msg.text())
    }
  })
  await page.goto(BASE)
  await page.waitForFunction(() => document.getElementById('status')?.textContent?.includes('就绪'), null, { timeout: 30000 })
  return page
}

async function switchProto(page, proto) {
  await page.click(`[data-proto="${proto}"]`)
  await page.waitForFunction(
    (p) => document.getElementById('status')?.textContent?.includes({ canvas: '①', 'ol-raster': '②', 'ol-vector': '③' }[p]),
    proto,
    { timeout: 15000 },
  )
  await page.waitForTimeout(400)
}

/** 点击原型暴露的真实 feature 像素，返回选中的 featureId。 */
async function clickTargetFeature(page) {
  const box = await page.locator('#stage .pane.active').boundingBox()
  const px = await page.evaluate(() => window.__mapSpikeActive?.pickTargetPixel?.() ?? null)
  if (!px || !box) return null
  await page.mouse.click(box.x + px[0], box.y + px[1])
  await page.waitForTimeout(300)
  return page.evaluate(() => window.__mapSpikeSelection ?? null)
}

// ── 1440 主轮次 ──
const page = await newPage(1440, 900)
await page.screenshot({ path: resolve(OUT, 'compare-1440-canvas-baseline.png') })

// ② OL 地形底图 + 聚合地点：浅/深主题 + 选择交互
await switchProto(page, 'ol-raster')
await page.screenshot({ path: resolve(OUT, 'theme-light-world-1440.png') })
await page.click('#btn-theme') // → dark
await page.waitForTimeout(800)
await page.screenshot({ path: resolve(OUT, 'theme-dark-world-1440.png') })
await page.evaluate((r) => window.__mapSpikeActive?.focusTarget?.(r), 0.12)
await page.waitForTimeout(700)
await page.screenshot({ path: resolve(OUT, 'theme-dark-local-1440.png') })
records.olRasterSelection = await clickTargetFeature(page)
await page.click('#btn-theme') // → light
await page.waitForTimeout(800)
await page.evaluate((r) => window.__mapSpikeActive?.focusTarget?.(r), 0.12)
await page.waitForTimeout(700)
await page.screenshot({ path: resolve(OUT, 'theme-light-local-1440.png') })

// ③ OL 全矢量：三档缩放对照 + 连续缩放 + 选择
await switchProto(page, 'ol-vector')
await page.screenshot({ path: resolve(OUT, 'compare-1440-ol-vector-world.png') })
const viewInfo = await page.evaluate(() => {
  const hint = document.querySelector('#pane-ol-vector .hint')
  return hint ? hint.textContent : null
})
records.olVectorHintWorld = viewInfo

// 放大到区域档 / 地方档（聚焦真实 feature 密集区，模拟连续缩放中间帧）
for (const [name, res] of [['region', 2.2], ['local', 0.12]]) {
  await page.evaluate((r) => window.__mapSpikeActive?.focusTarget?.(r), res)
  await page.waitForTimeout(600)
  await page.screenshot({ path: resolve(OUT, `compare-1440-ol-vector-${name}.png`) })
  records[`olVectorHint_${name}`] = await page.evaluate(() => document.querySelector('#pane-ol-vector .hint')?.textContent ?? null)
}
// 点击选择（地方档下点击真实 feature）
records.olVectorSelection = await clickTargetFeature(page)
// 连续缩放测帧（按钮触发内置测量）
async function zoomBurst(label) {
  await page.click('#btn-zoom-burst')
  await page.waitForFunction(
    (l) => document.getElementById('status')?.textContent?.includes(l),
    label,
    { timeout: 30000 },
  )
  return page.evaluate(() => document.getElementById('status')?.textContent)
}
records.zoomBurstOlVector = await zoomBurst('连续缩放 6s')

// 20 次挂载/卸载（当前激活原型是 ol-vector）
await page.click('#btn-mount-20')
await page.waitForFunction(() => document.getElementById('status')?.textContent?.includes('20 次挂载/卸载'), null, { timeout: 120000 })
records.mountUnmount20 = await page.evaluate(() => document.getElementById('status')?.textContent)

// 导出页面内测量
await page.click('#btn-report')
await page.waitForTimeout(1500)

// ── 1024 / 390 / 200% ──
const page1024 = await newPage(1024, 768)
await switchProto(page1024, 'ol-vector')
await page1024.screenshot({ path: resolve(OUT, 'ol-vector-1024.png') })
await page1024.close()

const page390 = await newPage(390, 844)
await switchProto(page390, 'ol-vector')
await page390.screenshot({ path: resolve(OUT, 'ol-vector-390.png') })
records.w390Status = await page390.evaluate(() => document.getElementById('status')?.textContent)
await page390.close()

const page200 = await newPage(1280, 800)
await switchProto(page200, 'ol-vector')
await page200.evaluate(() => { document.documentElement.style.zoom = '2' })
await page200.waitForTimeout(600)
await page200.screenshot({ path: resolve(OUT, 'ol-vector-zoom200.png') })
records.zoom200SelectionReachable = await page200.evaluate(() => {
  const btn = document.getElementById('btn-zoom-burst')
  const rect = btn.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
})
// 200% 下点击按钮仍可达
await page200.click('#btn-zoom-burst')
records.zoom200BurstClickable = true
await page200.close()

await page.close()
await writeFile('/tmp/map-p1-measurements.json', JSON.stringify(records, null, 2))
await browser.close()
console.log(JSON.stringify(records, null, 1))
