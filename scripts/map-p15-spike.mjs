/**
 * P1.5 重做 Gate：浅色世界切片，两张同 seed/同相机对照截图 + 真实测量。
 * 运行前提：spike dev server @5199。
 * 产物（全部 /tmp，验收通过前不入库）：
 *   /tmp/map-p15-shots/light-world-base-1440.png     无写作覆盖层
 *   /tmp/map-p15-shots/light-world-writing-1440.png  当前场+章节上下文
 *   /tmp/map-p15-shots/p15-gate.json
 */

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = '/tmp/map-p15-shots'
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('http://localhost:5199/?fixture=author&chrome=product')
await page.waitForFunction(() => document.getElementById('status')?.textContent?.includes('就绪'), null, { timeout: 60000 })
await page.waitForTimeout(1200)

// 真实测量（全部来自运行时，不硬编码）
async function measure() {
  return page.evaluate(() => {
    const inst = window.__mapSpikeActive
    const snap = inst.snapshot()
    const doc = inst.getDocument()
    const terrain = inst.getTerrainState()
    const meta = inst.getGateMeta()
    // 真实 cluster 检测：遍历图层 source 构造名
    let clusterSources = 0
    let visibleRouteCount = 0
    for (const src of inst.getLayerSources()) {
      if (src.constructor?.name?.toLowerCase().includes('cluster')) clusterSources++
      if (typeof src.getFeatures === 'function') {
        for (const f of src.getFeatures()) {
          if (f.get('featureType') === 'route') visibleRouteCount++
        }
      }
    }
    return {
      ...snap,
      terrainPresent: terrain.terrainDrawn === true,
      landFeatureCount: doc.featureCollections.land.length,
      waterFeatureCount: doc.featureCollections.water.length,
      coastlineCount: doc.featureCollections.land.length,
      riverFeatureCount: doc.featureCollections.rivers.length,
      clusterSources,
      visibleRouteCount,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      hintVisible: (() => {
        const h = document.querySelector('#stage .hint')
        return !!h && h.style.display !== 'none' && h.offsetParent !== null
      })(),
      controlCount: inst.getControlsCount(),
      riverTrunkCount: meta.riverTrunkCount,
      riverSystemCount: meta.riverSystemCount,
      typography: meta.typography,
    }
  })
}

// 锚点落陆率 + 国名 bbox 间隙 + 局部河系密度（运行时真实测量）
async function measureP16B() {
  return page.evaluate(() => {
    const inst = window.__mapSpikeActive
    const anchor = inst.auditAnchorLand()
    // 国名与聚落标签 bbox 间隙：任意国名 rect 到最近聚落 rect 的最小空隙 ≥ 8px
    const snap = inst.snapshot()
    const rects = snap.placedRectInfos ?? []
    const stateRects = rects.filter((r) => r.kind === 'state')
    const settleRects = rects.filter((r) => r.kind !== 'state')
    const gap = (a, b) => {
      const dx = Math.max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]))
      const dy = Math.max(b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3]))
      return Math.max(dx, dy)
    }
    let minStateGap = Infinity
    for (const st of stateRects) {
      for (const se of settleRects) {
        minStateGap = Math.min(minStateGap, gap(st.labelRect, se.labelRect))
      }
    }
    // 局部河系密度：干流中点按 300 单位网格，单格 ≤2
    const meta = inst.getGateMeta()
    const quota = new Map()
    let localDensityMax = 0
    for (const t of (meta.riverTrunkMidpoints ?? [])) {
      if (!t) continue
      const key = `${Math.floor(t[0] / 300)}:${Math.floor(t[1] / 300)}`
      const n = (quota.get(key) ?? 0) + 1
      quota.set(key, n)
      localDensityMax = Math.max(localDensityMax, n)
    }
    return {
      anchorLandRate: anchor.rate,
      anchorOffenders: anchor.offenders,
      stateLabelGapMin: stateRects.length && settleRects.length ? minStateGap : null,
      riverLocalDensityMax: localDensityMax,
    }
  })
}

// ── 截图 1：无写作覆盖层（同一 seed / 同一相机 / 同一缩放）──
await page.evaluate(() => window.__mapSpikeActive.setOverlay(false))
await page.waitForTimeout(600)
await page.locator('#stage').screenshot({ path: `${OUT}/light-world-base-1440.png` })
const base = await measure()
const p16bBase = await measureP16B()

// ── 截图 2：写作默认态（当前场 + 章节上下文）──
await page.evaluate(() => window.__mapSpikeActive.setOverlay(true))
await page.waitForTimeout(600)
await page.locator('#stage').screenshot({ path: `${OUT}/light-world-writing-1440.png` })
const writing = await measure()
const p16bWriting = await measureP16B()

// base/writing 非语义像素差异：整图对比，仅语义信号矩形内允许不同
const fs = await import('node:fs/promises')
const rectData = await page.evaluate(() => window.__mapSpikeActive.getOverlaySignalRects())
const b64 = async (p) => (await fs.readFile(p)).toString('base64')
const pixelDiff = await page.evaluate(async ({ a, b, rects }) => {
  const load = (src) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
  const [ia, ib] = await Promise.all([load(`data:image/png;base64,${a}`), load(`data:image/png;base64,${b}`)])
  const cv = document.createElement('canvas')
  cv.width = ia.width
  cv.height = ia.height
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(ia, 0, 0)
  const da = ctx.getImageData(0, 0, cv.width, cv.height).data
  ctx.clearRect(0, 0, cv.width, cv.height)
  ctx.drawImage(ib, 0, 0)
  const db = ctx.getImageData(0, 0, cv.width, cv.height).data
  let diff = 0
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4
      if (Math.abs(da[i] - db[i]) > 2 || Math.abs(da[i+1] - db[i+1]) > 2 || Math.abs(da[i+2] - db[i+2]) > 2) {
        if (!rects.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh)) diff++
      }
    }
  }
  return { diffPixels: diff, w: cv.width, h: cv.height }
}, {
  a: await b64(`${OUT}/light-world-base-1440.png`),
  b: await b64(`${OUT}/light-world-writing-1440.png`),
  rects: rectData,
})

const gate = {
  seed: 'pinax-fixture-dense-12000-001',
  camera: 'fit-extent-1440x900',
  base,
  writing,
  p16b: { base: p16bBase, writing: p16bWriting },
  pixelDiff,
  pixelDiffRectCount: rectData.length,
  checks: {
    terrainPresent: base.terrainPresent && writing.terrainPresent,
    landGeometryPresent: base.landFeatureCount > 0,
    riverFeaturesPresent: base.riverFeatureCount > 0,
    numericClustersZero: base.clusterSources === 0 && writing.clusterSources === 0,
    routesHiddenByDefault: base.visibleRouteCount === 0 && writing.visibleRouteCount === 0,
    stateLabelsCap4: writing.placedTexts.filter((t) => t.kind === 'state').length <= 4,
    mainCityText3to6: (() => {
      const n = writing.placedTexts.filter((t) => t.kind === 'capital' || t.kind === 'city').length
      return n >= 3 && n <= 6
    })(),
    ordinaryTextLe3: writing.placedTexts.filter((t) => t.kind === 'ordinary' || t.kind === 'town' || t.kind === 'village').length <= 3,
    contextTextLe5: writing.contextMarkedCount <= 5 && writing.contextMarkedCount >= 3,
    // base/context 语义分离：无覆盖层时写作状态标签必须为 0
    baseContextOverlayZero: base.contextOverlayCount === 0 && base.contextLabelCount === 0,
    writingContextOverlayOne: writing.contextOverlayCount === 1,
    currentSceneOwnerExactly1: writing.currentSceneOwnerCount === 1,
    noLabelOverlap: writing.overlapPairCount === 0 && writing.maxOverlapRatio === 0,
    baseNoLabelOverlap: base.overlapPairCount === 0 && base.maxOverlapRatio === 0,
    interiorNotShown: !writing.placedTexts.some((t) => t.text === '藏剑庐'),
    noPageErrors: errors.length === 0,
    noHorizontalOverflow: !writing.horizontalOverflow,
    // P1.6A：河网主干化（真实读数）
    riverTrunks6to12: writing.riverTrunkCount >= 6 && writing.riverTrunkCount <= 12,
    // P1.6A：三级字号层级（国名 > 首都 > 城市）
    typographyHierarchy: (() => {
      const t = writing.typography ?? {}
      if (!t.state || !t.capital || !t.city) return false
      const px = (f) => parseFloat((String(f ?? '').match(/(\d+(?:\.\d+)?)px/) || [])[1] ?? 0)
      return px(t.state?.font) > px(t.capital?.font) && px(t.capital?.font) > px(t.city?.font)
    })(),
    // P1.6A：产品 chrome
    noDefaultControls: base.controlCount === 0 && writing.controlCount === 0,
    noDebugBarInProduct: !base.hintVisible && !writing.hintVisible,
    // P1.6B：锚点落陆率 100%（含聚落与国名锚点的屏幕采样）
    anchorLandRate100: p16bBase.anchorLandRate === 1 && p16bWriting.anchorLandRate === 1,
    stateLabelGapOk: (p16bWriting.stateLabelGapMin ?? 0) >= 8 && (p16bBase.stateLabelGapMin ?? 0) >= 8,
    riverLocalDensityOk: p16bWriting.riverLocalDensityMax <= 2,
    nonSemanticPixelDiffZero: (pixelDiff.diffPixels ?? Infinity) === 0,
  },
  pageErrors: errors,
}

gate.pass = Object.values(gate.checks).every(Boolean)

await writeFile(`${OUT}/p15-gate.json`, JSON.stringify(gate, null, 2))
await browser.close()
console.log(JSON.stringify({ pass: gate.pass, checks: gate.checks, basePlaced: base.placedTexts, writingPlaced: writing.placedTexts }, null, 1))
