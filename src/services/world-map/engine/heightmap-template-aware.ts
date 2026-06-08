/**
 * 保形海陆比 remap + 宏观海岸重塑（Round 2 Stage 2 + Stage 3 合并）
 *
 * 思路分三阶段:
 *  阶段 0 — 大陆级高度场 warp:在 sea-level remap 前,对接近目标海平面
 *           的整片低地施加连续低频抬升/下切,让最终海岸线来自弯曲
 *           等高线,而不是模板矩形采样区。
 *  阶段 A — 全局 shift 逼近目标(sort + median-threshold,小步 ±10 × 6,
 *           处理"基线远离 20"的极端模板如 pangea / archipelago)。
 *  阶段 B-1 — 为命中 targetLandRatio 翻动过渡带 cell:cost = |h - 20| +
 *           bias * 3,翻 cost 最低的 cell 直到 ratio 命中,把翻动聚集成
 *           不规则条带(取代全局 shift 切出的直线边界)。
 *  阶段 B-2 — 宏观海岸重塑(原 Round 2 `reshapeCoasts` 合并):不关心
 *           landRatio,只把低频 FBM bias 高的过渡 cell 翻成陆/水,
 *           ~ n * 3% 翻转量,形成 2-3 cell 半径的海湾/半岛凹凸。
 *           真正能改 coastline 形状(B-1 命中 ratio 后留下的矩形边界
 *           在此阶段被打散)。
 *  阶段 B-2.5 — 陆块轮廓重塑:按主陆块质心的角度低频场,迭代切负向
 *           扇区为海湾、扩正向扇区为半岛,让大陆骨架不再沿模板矩形。
 *  阶段 B-3 — compact 陆块修正:当最大陆块 bboxFillRatio 过高时,优先从
 *           最大陆块边缘挖海湾,并在 bbox 外侧补等量陆地,专门压掉
 *           "大陆填满矩形 bbox" 的方块感。
 * 兜底 — `rescueZeroLand`  landRatio < 1% 时强保最高的 1% cell 为陆地,
 *           避免极端 landRatio + aggressive shift 产出全水图。
 *
 * determinism: FBM 来自 cell 坐标 hash,**不**消费任何 rng。同 seed 同
 * 模板两次调用结果 byte-identical。
 */
import type { GridCells, HeightmapTemplate } from './types'
import { getLargestLandmass } from './shape-metrics'
import type { TemplateShapeIntent } from './heightmap-templates'

const SEA_LEVEL = 20
const LO = 8   // 过渡带下界
const HI = 32  // 过渡带上界
const FBM_SCALE = 0.004
const LANDFORM_WARP_SCALE = 0.0022
const LANDFORM_DOMAIN_SCALE = 0.0011
const LANDFORM_WARP_AMPLITUDE = 28
const LANDFORM_WARP_BAND = 40
const BIAS_GAIN = 3  // bias 对 cost 的权重
const MACRO_BIAS_GAIN = 8
const MACRO_PAIR_RATIO = 0.025
const SILHOUETTE_PASSES = 5
const SILHOUETTE_PAIR_RATIO = 0.045
const SILHOUETTE_BIAS_THRESHOLD = 0.035
const COMPACT_FILL_THRESHOLD = 0.60
const COMPACT_PAIR_RATIO = 0.04
const DEEP_BAY_FILL_THRESHOLD = 0.67
const DEEP_BAY_TARGET_FILL = 0.61
const DEEP_BAY_PAIR_RATIO = 0.026
const LANDFORM_MIN_RATIO = 0.405
const COMPONENT_REMAP_RADIUS = 1.85
const MULTI_CONTINENT_SPLIT_RATIO = 0.78
const SHAPE_ERODE_HI = 52
const DEEP_BAY_ERODE_HI = 64
const POLAR_BAND = 0.12  // 极地衰减带(与 `softenMapEdges` 一致)
// Round 2.5:`softenMapEdges` 极地带只覆盖 y < 0.12 / y > 0.88,而
// `polar-realism` 合同要求 y > 0.7 的"近极地"也保持一定的非绿洲比
// 例。`macroReshape` 在 y > 0.7 / y < 0.3 范围也加 cost 惩罚,避免
// 把大片近极地翻成陆并被 climate 判成温带。
// Round 2.5 hotfix:实测 0.972 southBelt greenRatio,需把 NEAR_POLAR_BAND
// 扩到 0.4 让 y=0.7+ 的过渡带也吃到非零 cost,避免 macroReshape 翻
// 出来的近极地 cell 刚好落在 y ∈ [0.7, 0.75] 这段"温度温和 + 全绿洲"
// 的高发区。
const NEAR_POLAR_BAND = 0.40

/**
 * 极地衰减因子(0=极地,1=赤道),与 `coast.ts::polarFactor` 行为一致。
 * 极地区域应让 macroReshape 的翻动**显著衰减**,避免被极地放大成
 * 大片绿洲,推反 `softenMapEdges` 的极地海冰带。
 */
function polarFactor(yFrac: number): number {
  return clamp(yFrac < 0.5 ? yFrac / POLAR_BAND : (1 - yFrac) / POLAR_BAND, 0, 1)
}

/**
 * 近极地衰减因子(0=近极地,1=赤道)。比 `polarFactor` 衰减带更宽,覆盖
 * y ∈ [0.30, 0.50] ∪ [0.50, 0.70] 这两段"中高纬过渡带",为
 * `polar-realism` 合同的"非全绿洲"要求保留足够干冷生物群系空间。
 */
function nearPolarFactor(yFrac: number): number {
  return clamp(yFrac < 0.5 ? yFrac / NEAR_POLAR_BAND : (1 - yFrac) / NEAR_POLAR_BAND, 0, 1)
}

function hash2D(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smooth01(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise2D(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smooth01(x - x0)
  const ty = smooth01(y - y0)
  const a = hash2D(x0, y0)
  const b = hash2D(x0 + 1, y0)
  const c = hash2D(x0, y0 + 1)
  const d = hash2D(x0 + 1, y0 + 1)
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty) * 2 - 1
}

function fbm2D(x: number, y: number, octaves: number): number {
  let v = 0
  let amp = 1
  let freq = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise2D(x * freq, y * freq)
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return v / max
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function countLand(cells: GridCells): number {
  let land = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] >= SEA_LEVEL) land++
  }
  return land
}

/**
 * 推算画布高度(归一化分母),与 `coast.ts::inferCanvasHeight` 同思路。
 * `polarFactor` / `nearPolarFactor` 期望 0..1 的 yFrac,直接把像素 y 传
 * 进去会被 clamp 截到 1(无差别),所以必须先除以画布高度。
 */
function inferCanvasHeight(cells: GridCells, n: number): number {
  let h = 0
  for (let i = 0; i < n; i++) {
    const y = cells.p[i * 2 + 1]
    if (y > h) h = y
  }
  return h || 1
}

function heightSignatureOffset(cells: GridCells): { ox: number; oy: number } {
  let sum = 0
  const stride = Math.max(1, Math.floor(cells.length / 96))
  for (let i = 0; i < cells.length; i += stride) {
    sum += cells.h[i] * (i + 17)
  }
  return {
    ox: hash2D(sum * 0.001, cells.length * 0.013) * 10_000,
    oy: hash2D(sum * 0.002, cells.length * 0.029) * 10_000,
  }
}

function macroLandformBias(x: number, y: number, ox: number, oy: number): number {
  // 先用极低频噪声扭曲采样域,再取低频 FBM。这样得到的是连续大海湾 /
  // 大半岛,不是逐 cell 的碎边。
  const wx = fbm2D((x + ox) * LANDFORM_DOMAIN_SCALE, (y + oy) * LANDFORM_DOMAIN_SCALE, 2) * 170
  const wy = fbm2D((x + ox + 311) * LANDFORM_DOMAIN_SCALE, (y + oy - 197) * LANDFORM_DOMAIN_SCALE, 2) * 170
  return fbm2D((x + ox + wx) * LANDFORM_WARP_SCALE, (y + oy + wy) * LANDFORM_WARP_SCALE, 4)
}

/**
 * 阶段 0:在 sea-level remap 前重塑高度场。
 *
 * 之前的 B-2/B-3 都是在海陆分类接近定型后翻边缘 cell,视觉上只是在
 * 方块外轮廓上削一点齿。这里直接改变接近目标海平面的整片低地高度,
 * 让后续 sort/shift 切到的是低频弯曲等高线,大陆级轮廓会真正变化。
 */
function macroHeightWarp(cells: GridCells, targetLandRatio: number): void {
  if (targetLandRatio < 0.18 || targetLandRatio > 0.75) return
  const n = cells.length
  const heights = Array.from(cells.h).sort((a, b) => a - b)
  const targetWater = clamp(Math.floor(n * (1 - targetLandRatio)), 0, n - 1)
  const targetSea = heights[targetWater] ?? SEA_LEVEL
  const canvasH = inferCanvasHeight(cells, n)
  const { ox, oy } = heightSignatureOffset(cells)

  for (let i = 0; i < n; i++) {
    const h = cells.h[i]
    const band = 1 - clamp(Math.abs(h - targetSea) / LANDFORM_WARP_BAND, 0, 1)
    if (band <= 0) continue
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const yFrac = y / canvasH
    const latitudeFactor = 0.45 + nearPolarFactor(yFrac) * 0.55
    const bias = macroLandformBias(x, y, ox, oy)
    const strength = smoothstep(0, 1, band) * (0.65 + Math.abs(bias) * 0.35)
    const delta = Math.round(bias * LANDFORM_WARP_AMPLITUDE * strength * latitudeFactor)
    if (delta !== 0) cells.h[i] = clamp(h + delta, 0, 100)
  }
}

function rotatedLocal(
  cells: GridCells,
  cellId: number,
  comp: LocalLandComponent,
  extX: number,
  extY: number,
): { x: number; y: number; radial: number; angle01: number } {
  const x = cells.p[cellId * 2] - comp.centroid.x
  const y = cells.p[cellId * 2 + 1] - comp.centroid.y
  const cos = Math.cos(-comp.angle)
  const sin = Math.sin(-comp.angle)
  const rx = x * cos - y * sin
  const ry = x * sin + y * cos
  const radial = Math.hypot(rx / extX, ry / extY)
  const angle01 = (Math.atan2(ry, rx) + Math.PI) / (Math.PI * 2)
  return { x: rx, y: ry, radial, angle01 }
}

function componentExtents(cells: GridCells, comp: LocalLandComponent): { extX: number; extY: number } {
  const cos = Math.cos(-comp.angle)
  const sin = Math.sin(-comp.angle)
  let extX = 1, extY = 1
  for (const cellId of comp.cellIds) {
    const x = cells.p[cellId * 2] - comp.centroid.x
    const y = cells.p[cellId * 2 + 1] - comp.centroid.y
    const rx = x * cos - y * sin
    const ry = x * sin + y * cos
    extX = Math.max(extX, Math.abs(rx))
    extY = Math.max(extY, Math.abs(ry))
  }
  return { extX: Math.max(extX, 24), extY: Math.max(extY, 24) }
}

function rand01(seed: number, salt: number): number {
  return hash2D(seed * 0.137 + salt * 19.19, seed * 0.071 - salt * 11.73)
}

function createComponentLandformProfile(
  cells: GridCells,
  comp: LocalLandComponent,
  isSingleContinent: boolean,
): ComponentLandformProfile {
  const { extX, extY } = componentExtents(cells, comp)
  const seed = comp.seed
  const lobeCount = isSingleContinent
    ? Math.round(clamp(comp.size / 170, 5, 8))
    : Math.round(clamp(comp.size / 520, 3, 6))
  const kernels: LandformKernel[] = [{
    x: 0,
    y: 0,
    rx: extX * ((isSingleContinent ? 0.46 : 0.56) + rand01(seed, 1) * 0.15),
    ry: extY * ((isSingleContinent ? 0.42 : 0.50) + rand01(seed, 2) * 0.15),
    angle: (rand01(seed, 3) - 0.5) * 0.65,
    weight: isSingleContinent ? 0.86 : 1.02,
  }]

  for (let k = 0; k < lobeCount; k++) {
    const a = (k / lobeCount) * Math.PI * 2 + (rand01(seed, 10 + k) - 0.5) * 1.25
    const dist = (isSingleContinent ? 0.34 : 0.26) + rand01(seed, 20 + k) * (isSingleContinent ? 0.50 : 0.44)
    kernels.push({
      x: Math.cos(a) * extX * dist,
      y: Math.sin(a) * extY * dist,
      rx: extX * ((isSingleContinent ? 0.28 : 0.38) + rand01(seed, 30 + k) * (isSingleContinent ? 0.28 : 0.24)),
      ry: extY * ((isSingleContinent ? 0.24 : 0.32) + rand01(seed, 40 + k) * (isSingleContinent ? 0.26 : 0.22)),
      angle: a + (rand01(seed, 50 + k) - 0.5) * 1.1,
      weight: (isSingleContinent ? 0.78 : 0.62) + rand01(seed, 60 + k) * (isSingleContinent ? 0.66 : 0.52),
    })
  }

  const bayCount = Math.round(clamp(lobeCount + (isSingleContinent ? 5 : 2), 4, isSingleContinent ? 13 : 8))
  const bays: LandformKernel[] = []
  for (let k = 0; k < bayCount; k++) {
    const a = (k / bayCount) * Math.PI * 2 + (rand01(seed, 100 + k) - 0.5) * 1.4
    const dist = (isSingleContinent ? 0.62 : 0.74) + rand01(seed, 110 + k) * (isSingleContinent ? 0.62 : 0.45)
    bays.push({
      x: Math.cos(a) * extX * dist,
      y: Math.sin(a) * extY * dist,
      rx: extX * ((isSingleContinent ? 0.18 : 0.20) + rand01(seed, 120 + k) * (isSingleContinent ? 0.28 : 0.24)),
      ry: extY * ((isSingleContinent ? 0.20 : 0.22) + rand01(seed, 130 + k) * (isSingleContinent ? 0.36 : 0.30)),
      angle: a + Math.PI / 2 + (rand01(seed, 140 + k) - 0.5) * 0.9,
      weight: (isSingleContinent ? 1.22 : 0.90) + rand01(seed, 150 + k) * (isSingleContinent ? 0.98 : 0.72),
    })
  }

  return { extX, extY, kernels, bays, seed }
}

function warpedLocalForProfile(
  cells: GridCells,
  cellId: number,
  comp: LocalLandComponent,
  profile: ComponentLandformProfile,
): { x: number; y: number; radial: number; angle01: number } {
  const local = rotatedLocal(cells, cellId, comp, profile.extX, profile.extY)
  const warpScale = 0.006
  const wx = fbm2D((local.x + profile.seed) * warpScale, (local.y - profile.seed) * warpScale, 3) * profile.extX * 0.12
  const wy = fbm2D((local.x - profile.seed * 0.7) * warpScale, (local.y + profile.seed) * warpScale, 3) * profile.extY * 0.12
  const x = local.x + wx
  const y = local.y + wy
  const radial = Math.hypot(x / profile.extX, y / profile.extY)
  const angle01 = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2)
  return { x, y, radial, angle01 }
}

function kernelInfluence(x: number, y: number, kernel: LandformKernel): number {
  const dx = x - kernel.x
  const dy = y - kernel.y
  const cos = Math.cos(-kernel.angle)
  const sin = Math.sin(-kernel.angle)
  const rx = dx * cos - dy * sin
  const ry = dx * sin + dy * cos
  const d2 = (rx / kernel.rx) ** 2 + (ry / kernel.ry) ** 2
  return kernel.weight * Math.exp(-d2 * 1.35)
}

function touchesOtherMajorLand(
  cells: GridCells,
  owner: Int32Array,
  cellId: number,
  compId: number,
): boolean {
  for (const nb of cells.c[cellId]) {
    if (owner[nb] >= 0 && owner[nb] !== compId) return true
  }
  return false
}

function componentLandformScore(
  cells: GridCells,
  cellId: number,
  comp: LocalLandComponent,
  profile: ComponentLandformProfile,
  owner: Int32Array,
  isSingleContinent: boolean,
): number {
  const local = warpedLocalForProfile(cells, cellId, comp, profile)
  const angular = periodicNoise1D(local.angle01 * 6, 6, profile.seed + 211.9) * (isSingleContinent ? 0.30 : 0.18)
  const detail = fbm2D(
    (local.x + profile.seed * 1.7) * 0.009,
    (local.y - profile.seed * 0.8) * 0.009,
    3,
  ) * (isSingleContinent ? 0.30 : 0.20)

  let score = -local.radial * (isSingleContinent ? 0.64 : 0.82) + angular + detail
  for (const kernel of profile.kernels) score += kernelInfluence(local.x, local.y, kernel)
  for (const bay of profile.bays) score -= kernelInfluence(local.x, local.y, bay) * (isSingleContinent ? 1.55 : 1.15)

  // 保留少量模板高度惯性,但不允许旧矩形采样域继续主导轮廓。
  if (owner[cellId] === comp.id) score += 0.04
  score += clamp((cells.h[cellId] - SEA_LEVEL) / 95, -0.08, 0.11)
  return score
}

interface CandidateScore {
  i: number
  score: number
}

function heapPush(heap: CandidateScore[], item: CandidateScore): void {
  heap.push(item)
  let i = heap.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (heap[p].score >= item.score) break
    heap[i] = heap[p]
    i = p
  }
  heap[i] = item
}

function heapPop(heap: CandidateScore[]): CandidateScore | undefined {
  if (heap.length === 0) return undefined
  const top = heap[0]
  const last = heap.pop()!
  if (heap.length > 0) {
    let i = 0
    while (true) {
      const left = i * 2 + 1
      const right = left + 1
      if (left >= heap.length) break
      const child = right < heap.length && heap[right].score > heap[left].score ? right : left
      if (heap[child].score <= last.score) break
      heap[i] = heap[child]
      i = child
    }
    heap[i] = last
  }
  return top
}

function selectConnectedLandCells(
  cells: GridCells,
  candidates: CandidateScore[],
  candidateMask: Uint8Array,
  candidateScore: Float64Array,
  comp: LocalLandComponent,
  profile: ComponentLandformProfile,
  targetSize: number,
): CandidateScore[] {
  if (candidates.length <= targetSize) return candidates
  candidates.sort((a, b) => b.score - a.score)

  const selected = new Uint8Array(cells.length)
  const queued = new Uint8Array(cells.length)
  const picked: CandidateScore[] = []
  const heap: CandidateScore[] = []
  const seed = candidates.find(c => rotatedLocal(cells, c.i, comp, profile.extX, profile.extY).radial < 0.55) ?? candidates[0]

  const add = (item: CandidateScore) => {
    if (selected[item.i]) return
    selected[item.i] = 1
    picked.push(item)
    for (const nb of cells.c[item.i]) {
      if (!candidateMask[nb] || selected[nb] || queued[nb]) continue
      queued[nb] = 1
      heapPush(heap, { i: nb, score: candidateScore[nb] })
    }
  }

  add(seed)
  let fallbackCursor = 0
  while (picked.length < targetSize) {
    let next = heapPop(heap)
    while (next && selected[next.i]) next = heapPop(heap)
    if (!next) {
      while (fallbackCursor < candidates.length && selected[candidates[fallbackCursor].i]) fallbackCursor++
      if (fallbackCursor >= candidates.length) break
      next = candidates[fallbackCursor++]
    }
    add(next)
  }

  return picked
}

/**
 * 主陆块级轮廓 remap。
 *
 * 不改变每个主陆块的 cell 数,但用"多陆核 + 海湾核 + 连通生长"重排
 * land mask。旧版 top-N 极坐标 remap 会选出离散高分 cell,视觉上变成
 * 噪声孔洞和斜矩形块；这里强制从核心连通生长,让大陆轮廓整体弯曲、
 * 内部保持连续。
 */
function componentShapeRemap(
  cells: GridCells,
  shapeIntent?: TemplateShapeIntent,
  templateName?: HeightmapTemplate,
): void {
  const n = cells.length
  const { owner, components } = findLocalLandComponents(cells, Math.max(80, Math.round(n * 0.035)))
  if (components.length === 0) return
  const isSingleContinent = shapeIntent === 'single' || templateName === 'pangea'

  const major = components.slice(0, 5)
  const originalMajorLand = new Uint8Array(n)
  const selectedMajorLand = new Uint8Array(n)
  const assigned = new Uint8Array(n)

  for (const comp of major) {
    for (const cellId of comp.cellIds) originalMajorLand[cellId] = 1
  }

  for (const comp of major) {
    const profile = createComponentLandformProfile(cells, comp, isSingleContinent)
    const candidates: Array<{ i: number; score: number }> = []
    const candidateMask = new Uint8Array(n)
    const candidateScore = new Float64Array(n)
    candidateScore.fill(Number.NEGATIVE_INFINITY)

    for (let i = 0; i < n; i++) {
      if (assigned[i]) continue
      if (owner[i] >= 0 && owner[i] !== comp.id) continue
      if (owner[i] === -2) continue
      if (owner[i] !== comp.id && touchesOtherMajorLand(cells, owner, i, comp.id)) continue

      const local = warpedLocalForProfile(cells, i, comp, profile)
      if (local.radial > COMPONENT_REMAP_RADIUS) continue
      const score = componentLandformScore(cells, i, comp, profile, owner, isSingleContinent)
      candidateMask[i] = 1
      candidateScore[i] = score
      candidates.push({ i, score })
    }

    if (candidates.length < comp.size) {
      for (const cellId of comp.cellIds) {
        selectedMajorLand[cellId] = 1
        assigned[cellId] = 1
      }
      continue
    }

    const selected = selectConnectedLandCells(cells, candidates, candidateMask, candidateScore, comp, profile, comp.size)
    for (const candidate of selected) {
      const cellId = candidate.i
      selectedMajorLand[cellId] = 1
      assigned[cellId] = 1
    }
  }

  for (let i = 0; i < n; i++) {
    if (!originalMajorLand[i] && !selectedMajorLand[i]) continue
    if (selectedMajorLand[i]) {
      const relief = Math.max(0, cells.h[i] - SEA_LEVEL)
      const landformLift = Math.floor(hash2D(i, 0.445) * 5)
      cells.h[i] = clamp(SEA_LEVEL + 4 + Math.round(relief * 0.55) + landformLift, SEA_LEVEL, 100)
    } else {
      cells.h[i] = 11 + Math.floor(hash2D(i, 0.771) * 5)
    }
  }
}

function shouldSplitContinents(
  shapeIntent?: TemplateShapeIntent,
  templateName?: HeightmapTemplate,
): boolean {
  if (shapeIntent !== 'continents') return false
  return templateName === 'continents' || templateName === 'oldWorld'
}

function localCoordsForAxis(
  cells: GridCells,
  cellId: number,
  center: { x: number; y: number },
  angle: number,
): { along: number; across: number } {
  const x = cells.p[cellId * 2] - center.x
  const y = cells.p[cellId * 2 + 1] - center.y
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  return {
    along: x * cos - y * sin,
    across: x * sin + y * cos,
  }
}

function splitOverconnectedContinents(
  cells: GridCells,
  shapeIntent?: TemplateShapeIntent,
  templateName?: HeightmapTemplate,
): void {
  if (!shouldSplitContinents(shapeIntent, templateName)) return
  const n = cells.length
  const minSize = Math.max(80, Math.round(n * 0.035))

  for (let attempt = 0; attempt < 3; attempt++) {
    const largest = getLargestLandmass(cells, { minSize })
    if (!largest) return
    const land = countLand(cells)
    if (land === 0 || largest.size / land < MULTI_CONTINENT_SPLIT_RATIO) return

    const cutAngle = largest.mainAxis.dx === 0 && largest.mainAxis.dy === 0
      ? Math.PI / 2
      : Math.atan2(largest.mainAxis.dy, largest.mainAxis.dx) + Math.PI / 2
    let maxAlong = 1
    let maxAcross = 1
    for (const cellId of largest.cellIds) {
      const p = localCoordsForAxis(cells, cellId, largest.centroid, cutAngle)
      maxAlong = Math.max(maxAlong, Math.abs(p.along))
      maxAcross = Math.max(maxAcross, Math.abs(p.across))
    }

    const channelWidth = 0.11 + attempt * 0.045
    let cutCount = 0
    for (const cellId of largest.cellIds) {
      const p = localCoordsForAxis(cells, cellId, largest.centroid, cutAngle)
      const along = p.along / maxAlong
      const across = p.across / maxAcross
      if (Math.abs(along) > 1.04) continue

      const meander = fbm2D(
        along * 2.1 + largest.size * 0.013 + attempt * 17,
        largest.centroid.x * 0.003 + largest.centroid.y * 0.002,
        3,
      ) * 0.22
      if (Math.abs(across - meander) > channelWidth) continue

      // 多大陆模板出现单一超大陆时,这些 cell 本质是模板/阈值陆桥。
      // 这里不再只切低海拔;否则高一点的模板残留会把海峡重新焊住。
      cells.h[cellId] = 8 + Math.floor(hash2D(cellId, attempt + 0.626) * 5)
      cutCount++
    }
    if (cutCount === 0) return
  }
}

function forceContinentalSeparation(
  cells: GridCells,
  shapeIntent?: TemplateShapeIntent,
  templateName?: HeightmapTemplate,
): void {
  if (!shouldSplitContinents(shapeIntent, templateName)) return
  const n = cells.length
  const land = countLand(cells)
  if (land === 0) return
  const largest = getLargestLandmass(cells, { minSize: Math.max(80, Math.round(n * 0.035)) })
  if (!largest || largest.size / land <= 0.85) return

  const cutAngle = largest.mainAxis.dx === 0 && largest.mainAxis.dy === 0
    ? Math.PI / 2
    : Math.atan2(largest.mainAxis.dy, largest.mainAxis.dx) + Math.PI / 2
  let maxAlong = 1
  let maxAcross = 1
  for (const cellId of largest.cellIds) {
    const p = localCoordsForAxis(cells, cellId, largest.centroid, cutAngle)
    maxAlong = Math.max(maxAlong, Math.abs(p.along))
    maxAcross = Math.max(maxAcross, Math.abs(p.across))
  }

  const candidates: CandidateScore[] = []
  for (const cellId of largest.cellIds) {
    const p = localCoordsForAxis(cells, cellId, largest.centroid, cutAngle)
    const along = p.along / maxAlong
    const across = p.across / maxAcross
    if (Math.abs(along) > 0.98) continue
    const meander = fbm2D(along * 2.4 + largest.size * 0.019, largest.centroid.x * 0.004, 3) * 0.18
    const channelDist = Math.abs(across - meander)
    if (channelDist > 0.22) continue
    candidates.push({
      i: cellId,
      h: cells.h[cellId],
      cost: channelDist * 30 + Math.abs(cells.h[cellId] - SEA_LEVEL) * 0.12 + hash2D(cellId, 0.885),
      bias: 0,
    })
  }
  if (candidates.length === 0) return
  candidates.sort((a, b) => a.cost - b.cost)
  const target = Math.min(candidates.length, Math.max(18, Math.round(n * 0.025)))
  for (let k = 0; k < target; k++) {
    const cellId = candidates[k].i
    cells.h[cellId] = 5 + Math.floor(hash2D(cellId, 0.736) * 5)
  }
}

function isProtectedContinentChannel(
  cells: GridCells,
  cellId: number,
  shapeIntent?: TemplateShapeIntent,
  templateName?: HeightmapTemplate,
): boolean {
  if (!shouldSplitContinents(shapeIntent, templateName)) return false
  if (cells.h[cellId] >= SEA_LEVEL) return false
  let landNeighbors = 0
  for (const nb of cells.c[cellId]) {
    if (cells.h[nb] >= SEA_LEVEL) landNeighbors++
  }
  return landNeighbors >= 2
}

function largestLandmassBbox(cells: GridCells): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const largest = getLargestLandmass(cells, { minSize: Math.max(50, Math.round(cells.length * 0.025)) })
  return largest?.bbox ?? null
}

function hasOpenWaterNeighbor(cells: GridCells, i: number): boolean {
  for (const nb of cells.c[i]) {
    if (cells.h[nb] < 12) return true
  }
  return false
}

function restoreTargetLandRatio(
  cells: GridCells,
  targetLandRatio: number,
  shapeIntent?: TemplateShapeIntent,
  templateName?: HeightmapTemplate,
): void {
  const n = cells.length
  const current = countLand(cells)
  const target = Math.round(n * targetLandRatio)
  const diff = target - current
  if (Math.abs(diff) <= Math.max(2, Math.round(n * 0.012))) return

  if (diff > 0) {
    let remaining = diff
    for (let pass = 0; pass < 6 && remaining > 0; pass++) {
      const bbox = largestLandmassBbox(cells)
      const grow: CandidateScore[] = []
      for (let i = 0; i < n; i++) {
        const h = cells.h[i]
        if (h >= SEA_LEVEL || h > 24) continue
        if (isProtectedContinentChannel(cells, i, shapeIntent, templateName)) continue
        let landNeighbors = 0
        for (const nb of cells.c[i]) if (cells.h[nb] >= SEA_LEVEL) landNeighbors++
        if (landNeighbors === 0) continue
        const x = cells.p[i * 2]
        const y = cells.p[i * 2 + 1]
        const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
        const insideLargestBbox = bbox
          ? x >= bbox.minX && x <= bbox.maxX && y >= bbox.minY && y <= bbox.maxY
          : false
        // Deep water inside the largest bbox is usually a bay we just cut to
        // break rectangular landmasses. Do not immediately refill it while
        // restoring global landRatio.
        if (insideLargestBbox && h < 12) continue
        if (!insideLargestBbox && h < 9 && landNeighbors >= 3 && !hasOpenWaterNeighbor(cells, i)) continue
        const neckPenalty = landNeighbors >= 4 ? 18 : landNeighbors === 3 ? 7 : 0
        const neighborScore = landNeighbors === 1 ? 12 : landNeighbors === 2 ? 13 : landNeighbors * 2
        const bboxPenalty = insideLargestBbox ? 10 : -5
        const depthPenalty = Math.max(0, SEA_LEVEL - h) * (pass < 3 ? 0.45 : 0.22)
        grow.push({
          i,
          score: neighborScore + bias * 5 - depthPenalty - neckPenalty - bboxPenalty,
        })
      }
      if (grow.length === 0) break
      grow.sort((a, b) => b.score - a.score)
      const limit = Math.min(remaining, grow.length, Math.max(1, Math.round(n * 0.035)))
      for (let k = 0; k < limit; k++) {
        const cellId = grow[k].i
        cells.h[cellId] = 23 + Math.floor(hash2D(cellId, pass + 0.417) * 5)
      }
      remaining -= limit
    }
    return
  }

  const erode: CandidateScore[] = []
  for (let i = 0; i < n; i++) {
    const h = cells.h[i]
    if (h < SEA_LEVEL || h > 34 || !isBoundaryLand(cells, i)) continue
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
    erode.push({ i, score: -Math.abs(h - SEA_LEVEL) - bias * 2 + hash2D(i, 0.613) })
  }
  erode.sort((a, b) => b.score - a.score)
  const limit = Math.min(-diff, erode.length)
  for (let k = 0; k < limit; k++) {
    const cellId = erode[k].i
    cells.h[cellId] = 13 + Math.floor(hash2D(cellId, 0.913) * 4)
  }
}

/**
 * 阶段 A:sort + median-threshold 算出 shift 方向,小步 ±10 × 6 逼近。
 * 思路与原 `adjustSeaLevel` 一致（最大 shift = ±60 应对 pangea / archipelago
 * 等基线极端模板）。Phase B 在此之后接管"窗口内不规则化 + 精确收尾"。
 */
function globalShiftApproach(cells: GridCells, targetLandRatio: number): void {
  const n = cells.length
  // 第一次 sort 算 shift
  let heights = Array.from(cells.h).sort((a, b) => a - b)
  const targetWater = clamp(Math.floor(n * (1 - targetLandRatio)), 0, n - 1)
  let shift = SEA_LEVEL - heights[targetWater]
  if (shift === 0) return

  let attempts = 0
  while (shift !== 0 && attempts++ < 6) {
    const step = clamp(shift, -10, 10)
    for (let i = 0; i < n; i++) {
      cells.h[i] = clamp(cells.h[i] + step, 0, 100)
    }
    const land = countLand(cells)
    const landRatio = land / n
    if (Math.abs(landRatio - targetLandRatio) <= 0.025) return
    heights = Array.from(cells.h).sort((a, b) => a - b)
    shift = SEA_LEVEL - heights[targetWater]
  }
}

interface Transition {
  i: number
  h: number
  cost: number
  bias: number
}

interface LocalLandComponent {
  id: number
  cellIds: number[]
  size: number
  centroid: { x: number; y: number }
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
  angle: number
  seed: number
}

interface LandformKernel {
  x: number
  y: number
  rx: number
  ry: number
  angle: number
  weight: number
}

interface ComponentLandformProfile {
  extX: number
  extY: number
  kernels: LandformKernel[]
  bays: LandformKernel[]
  seed: number
}

function isBoundaryLand(cells: GridCells, i: number): boolean {
  if (cells.h[i] < SEA_LEVEL) return false
  for (const nb of cells.c[i]) {
    if (cells.h[nb] < SEA_LEVEL) return true
  }
  return false
}

function periodicNoise1D(t: number, period: number, seed: number): number {
  const wrapped = ((t % period) + period) % period
  const i0 = Math.floor(wrapped)
  const i1 = (i0 + 1) % period
  const f = smooth01(wrapped - i0)
  return lerp(hash2D(i0, seed), hash2D(i1, seed), f) * 2 - 1
}

function findLocalLandComponents(
  cells: GridCells,
  minSize: number,
): { owner: Int32Array; components: LocalLandComponent[] } {
  const n = cells.length
  const owner = new Int32Array(n).fill(-1)
  const components: LocalLandComponent[] = []

  for (let i = 0; i < n; i++) {
    if (cells.h[i] < SEA_LEVEL || owner[i] !== -1) continue
    const id = components.length
    const queue: number[] = [i]
    owner[i] = id
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]
      for (const nb of cells.c[cur]) {
        if (cells.h[nb] < SEA_LEVEL || owner[nb] !== -1) continue
        owner[nb] = id
        queue.push(nb)
      }
    }
    if (queue.length < minSize) {
      for (const cellId of queue) owner[cellId] = -2
      continue
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let sumX = 0, sumY = 0
    for (const cellId of queue) {
      const x = cells.p[cellId * 2]
      const y = cells.p[cellId * 2 + 1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      sumX += x
      sumY += y
    }
    const centroid = { x: sumX / queue.length, y: sumY / queue.length }

    let vx = 0, vy = 0, cxy = 0
    for (const cellId of queue) {
      const dx = cells.p[cellId * 2] - centroid.x
      const dy = cells.p[cellId * 2 + 1] - centroid.y
      vx += dx * dx
      vy += dy * dy
      cxy += dx * dy
    }
    const angle = 0.5 * Math.atan2(2 * cxy, vx - vy)
    components.push({
      id,
      cellIds: queue,
      size: queue.length,
      centroid,
      bbox: { minX, minY, maxX, maxY },
      angle,
      seed: hash2D(centroid.x * 0.013 + queue.length, centroid.y * 0.017 + id) * 1000,
    })
  }

  components.sort((a, b) => b.size - a.size)
  return { owner, components }
}

function silhouetteBiasForCell(cells: GridCells, cellId: number, comp: LocalLandComponent): number {
  const x = cells.p[cellId * 2] - comp.centroid.x
  const y = cells.p[cellId * 2 + 1] - comp.centroid.y
  const cos = Math.cos(-comp.angle)
  const sin = Math.sin(-comp.angle)
  const rx = x * cos - y * sin
  const ry = x * sin + y * cos
  const theta = Math.atan2(ry, rx)
  const a = (theta + Math.PI) / (Math.PI * 2)
  const broad = periodicNoise1D(a * 5, 5, comp.seed)
  const secondary = periodicNoise1D(a * 9, 9, comp.seed + 37.7)
  return clamp(broad * 0.72 + secondary * 0.28, -1, 1)
}

function boundaryPressure(cells: GridCells, cellId: number, comp: LocalLandComponent): number {
  const x = cells.p[cellId * 2]
  const y = cells.p[cellId * 2 + 1]
  const w = Math.max(1, comp.bbox.maxX - comp.bbox.minX)
  const h = Math.max(1, comp.bbox.maxY - comp.bbox.minY)
  const nx = clamp((x - comp.bbox.minX) / w, 0, 1)
  const ny = clamp((y - comp.bbox.minY) / h, 0, 1)
  return 1 - clamp(Math.min(nx, 1 - nx, ny, 1 - ny) / 0.34, 0, 1)
}

function hasLandNeighbor(cells: GridCells, i: number): boolean {
  for (const nb of cells.c[i]) {
    if (cells.h[nb] >= SEA_LEVEL) return true
  }
  return false
}

/**
 * 阶段 B-1:为命中 targetLandRatio 翻动过渡带 cell。
 * cost = |h - 20| + bias * 3。bias ∈ [-1, 1] 来自低频 FBM。
 * 同一 bias 区域内的多个过渡 cell 共享 cost 偏移 → 翻动聚集成不规则
 * 条带 / 海湾（避免全局 shift 切出来的直线 / 带状边界）。
 *
 * Round 2 修复:加极地 cost 惩罚 `(1 - polarFactor) * 100`,极地 cell
 * 排到队尾、被翻动的优先级远低于赤道 cell。这样 macroReshape /
 * transitionFlip 不会把极地边缘原本被 `softenMapEdges` 压成水/低陆
 * 的 cell 翻成大片绿洲,推反 `polar-realism` 合同。
 */
function transitionFlip(cells: GridCells, targetLandRatio: number): void {
  const n = cells.length
  const canvasH = inferCanvasHeight(cells, n)
  const currentLand = countLand(cells)
  const currentRatio = currentLand / n
  if (Math.abs(currentRatio - targetLandRatio) <= 0.025) return

  const needMoreLand = currentRatio < targetLandRatio
  const transitions: Transition[] = []
  for (let i = 0; i < n; i++) {
    const h = cells.h[i]
    if (h < LO || h > HI) continue
    if (needMoreLand ? h >= SEA_LEVEL : h < SEA_LEVEL) continue
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
    const pf = polarFactor(y / canvasH)
    // 增陆时优先翻 bias>0 的水格；减陆时优先翻 bias<0 的陆格。
    const directionalBias = needMoreLand ? -bias * BIAS_GAIN : bias * BIAS_GAIN
    transitions.push({
      i, h,
      cost: Math.abs(h - SEA_LEVEL) + directionalBias + (1 - pf) * 100,
      bias,
    })
  }
  if (transitions.length === 0) return

  // 翻动上限:剩余差值对应的 cell 数,封顶 eligible 总数
  const diffCells = Math.abs(currentRatio - targetLandRatio) * n
  const targetFlips = Math.max(1, Math.round(diffCells))
  const flipsNeeded = Math.min(targetFlips, transitions.length)

  transitions.sort((a, b) => a.cost - b.cost)
  const flips = transitions.slice(0, flipsNeeded)

  for (const f of flips) {
    if (needMoreLand) {
      // 拉到 24-26 区间(SEA_LEVEL 上方但不过分高)
      cells.h[f.i] = 24 + Math.floor(hash2D(f.i, 0.337) * 3)
    } else {
      // 拉到 14-16 区间(SEA_LEVEL 下方但不过分低)
      cells.h[f.i] = 14 + Math.floor(hash2D(f.i, 0.919) * 3)
    }
  }
}

/**
 * 阶段 B-2:宏观海岸重塑(原 Round 2 `reshapeCoasts` 合并进来)。
 *
 * 与 B-1 的关键区别:**不**关心 landRatio,只把低频 FBM bias 高的过渡
 * cell 翻向陆(bias>0)或翻向水(bias<0),聚集成不规则海湾 / 半岛凸出。
 * 这样能**真正**重塑大陆轮廓 — 之前的 reshapeCoasts 只对陆地 cell
 * ±1 高度,无法改变 coastline 形状。
 *
 * 翻转数量 ~ n * 3%(经验值),能形成 2-3 cell 半径的海湾凹凸。
 */
function macroReshape(cells: GridCells): void {
  const n = cells.length
  const canvasH = inferCanvasHeight(cells, n)
  const targetPairs = Math.max(1, Math.round(n * MACRO_PAIR_RATIO))
  const grow: Transition[] = []
  const erode: Transition[] = []
  for (let i = 0; i < n; i++) {
    const h = cells.h[i]
    if (h < LO || h > HI) continue
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
    const pf = polarFactor(y / canvasH)
    const npf = nearPolarFactor(y / canvasH)
    // 极地 + 近极地双重 cost 惩罚。极地带(y < 12% / y > 88%)惩罚
    // 极重;近极地带(y < 40% / y > 60%)惩罚较重。共同防止
    // macroReshape 把大片高纬 cell 翻成陆,推反 `softenMapEdges` 的
    // 极地海冰带 + `polar-realism` 合同要求的"非全绿洲"分布。
    // Round 2.5 hotfix:NEAR_POLAR_BAND 0.30→0.40 扩到 y=0.7+ 也有
    // 惩罚。penalty (1-pf)*180 + (1-npf)*120 是 unit fix + pangea
    // 保持最大的平衡点;再高会切碎 pangea(largestRatio 0.85→0.81)。
    const polarPenalty = (1 - pf) * 180
      + (1 - npf) * 120
    const candidate = {
      i, h,
      // 低频 bias 绝对值越大越优先，离海平面越近越优先，高纬越靠后。
      cost: Math.abs(h - SEA_LEVEL) - Math.abs(bias) * MACRO_BIAS_GAIN + polarPenalty,
      bias,
    }
    if (h < SEA_LEVEL && bias > 0) grow.push(candidate)
    else if (h >= SEA_LEVEL && bias < 0) erode.push(candidate)
  }
  if (grow.length === 0 || erode.length === 0) return

  grow.sort((a, b) => a.cost - b.cost)
  erode.sort((a, b) => a.cost - b.cost)
  const pairs = Math.min(targetPairs, grow.length, erode.length)
  for (let k = 0; k < pairs; k++) {
    const g = grow[k]
    const e = erode[k]
    // 成对翻转，避免宏观重塑破坏前面已命中的 landRatio。
    cells.h[g.i] = 24 + Math.floor(hash2D(g.i, 0.337) * 3)
    cells.h[e.i] = 14 + Math.floor(hash2D(e.i, 0.919) * 3)
  }
}

/**
 * 阶段 B-2.5:按陆块质心角度场重塑大陆骨架。
 *
 * 海岸 edge noise 只能让边缘变碎,不能让矩形大陆出现大尺度湾/角。这里
 * 对每个主陆块构造周期性低频角度 bias:
 *   - bias < 0 的陆块边缘被切成海湾
 *   - bias > 0 的相邻水格长成半岛
 * 每轮成对翻转,保持 landRatio 基本不动;重复 3 轮,让新海湾继续向内
 * 侵入 2-3 个 cell,形成视觉可见的大轮廓变化。
 */
function silhouetteLandformReshape(cells: GridCells): void {
  const n = cells.length
  const canvasH = inferCanvasHeight(cells, n)
  const minSize = Math.max(80, Math.round(n * 0.035))
  const maxPairsPerPass = Math.max(1, Math.round(n * SILHOUETTE_PAIR_RATIO))

  for (let pass = 0; pass < SILHOUETTE_PASSES; pass++) {
    const { owner, components } = findLocalLandComponents(cells, minSize)
    if (components.length === 0) return

    const major = components.slice(0, 4)
    const majorIds = new Set(major.map(c => c.id))
    const byId = new Map(major.map(c => [c.id, c]))
    const erode: Transition[] = []
    const grow: Transition[] = []

    for (const comp of major) {
      for (const cellId of comp.cellIds) {
        const h = cells.h[cellId]
        if (h < LO || h > SHAPE_ERODE_HI || !isBoundaryLand(cells, cellId)) continue
        const x = cells.p[cellId * 2]
        const y = cells.p[cellId * 2 + 1]
        const bias = silhouetteBiasForCell(cells, cellId, comp)
        if (bias > -SILHOUETTE_BIAS_THRESHOLD) continue
        const pf = polarFactor(y / canvasH)
        const npf = nearPolarFactor(y / canvasH)
        const polarPenalty = (1 - pf) * 180 + (1 - npf) * 120
        erode.push({
          i: cellId,
          h,
          cost: Math.abs(h - SEA_LEVEL)
            + bias * 10
            - boundaryPressure(cells, cellId, comp) * 7
            + polarPenalty,
          bias,
        })
      }
    }

    for (let i = 0; i < n; i++) {
      const h = cells.h[i]
      if (h < LO || h >= SEA_LEVEL) continue
      let bestComp: LocalLandComponent | undefined
      let bestBias = -Infinity
      for (const nb of cells.c[i]) {
        const id = owner[nb]
        if (!majorIds.has(id)) continue
        const comp = byId.get(id)
        if (!comp) continue
        const bias = silhouetteBiasForCell(cells, i, comp)
        if (bias > bestBias) {
          bestBias = bias
          bestComp = comp
        }
      }
      if (!bestComp || bestBias < SILHOUETTE_BIAS_THRESHOLD) continue
      const y = cells.p[i * 2 + 1]
      const pf = polarFactor(y / canvasH)
      const npf = nearPolarFactor(y / canvasH)
      const polarPenalty = (1 - pf) * 180 + (1 - npf) * 120
      grow.push({
        i,
        h,
        cost: Math.abs(h - SEA_LEVEL) - bestBias * 10 + polarPenalty,
        bias: bestBias,
      })
    }

    if (erode.length === 0 || grow.length === 0) return

    erode.sort((a, b) => a.cost - b.cost)
    grow.sort((a, b) => a.cost - b.cost)
    const pairs = Math.min(maxPairsPerPass, erode.length, grow.length)
    for (let k = 0; k < pairs; k++) {
      const e = erode[k]
      const g = grow[k]
      cells.h[e.i] = 8 + Math.floor(hash2D(e.i, pass + 0.919) * 5)
      cells.h[g.i] = 25 + Math.floor(hash2D(g.i, pass + 0.337) * 4)
    }
  }
}

/**
 * 阶段 B-3:专门处理"最大陆块过于 compact / 方块化"。
 *
 * `macroReshape` 会增加海岸线细节,但如果模板本身产出的最大陆块已经把
 * bbox 填得很满,只做随机过渡带翻转仍可能留下矩形外轮廓。这里用
 * shape-metrics 的最大陆块 bboxFillRatio 作为触发条件:
 *   - fill <= 0.68:不动,避免过度破碎正常大陆
 *   - fill > 0.68:从最大陆块边缘且低频 bias<0 的位置挖海湾
 *   - 等量在最大 bbox 外的水缘 bias>0 位置补陆,保持 landRatio 稳定
 */
function compactLandmassErosion(cells: GridCells): void {
  const n = cells.length
  const currentLand = countLand(cells)
  const currentRatio = currentLand / n
  if (currentRatio <= LANDFORM_MIN_RATIO) return

  const largest = getLargestLandmass(cells, { minSize: Math.max(50, Math.round(n * 0.025)) })
  if (!largest) return

  const { minX, minY, maxX, maxY } = largest.bbox
  let cellsInBbox = 0
  for (let i = 0; i < n; i++) {
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) cellsInBbox++
  }
  if (cellsInBbox === 0) return

  const fill = largest.size / cellsInBbox
  if (fill <= COMPACT_FILL_THRESHOLD) return

  const canvasH = inferCanvasHeight(cells, n)
  const largestSet = new Set(largest.cellIds)
  const erode: Transition[] = []
  const grow: Transition[] = []
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)

  for (let i = 0; i < n; i++) {
    const cellH = cells.h[i]
    if (cellH < LO || cellH > SHAPE_ERODE_HI) continue
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
    const pf = polarFactor(y / canvasH)
    const npf = nearPolarFactor(y / canvasH)
    const polarPenalty = (1 - pf) * 180 + (1 - npf) * 120

    if (largestSet.has(i)) {
      if (!isBoundaryLand(cells, i)) continue
      const nx = clamp((x - minX) / w, 0, 1)
      const ny = clamp((y - minY) / h, 0, 1)
      const sidePressure = 1 - clamp(Math.min(nx, 1 - nx, ny, 1 - ny) / 0.28, 0, 1)
      // 过满 bbox 的陆块优先从边缘 + 负 bias 区切海湾，而不是从内部打洞。
      erode.push({
        i,
        h: cellH,
        cost: Math.abs(cellH - SEA_LEVEL)
          + bias * MACRO_BIAS_GAIN
          - sidePressure * 8
          + polarPenalty,
        bias,
      })
      continue
    }

    if (cellH >= SEA_LEVEL || bias <= 0 || !hasLandNeighbor(cells, i)) continue
    // 补陆优先发生在最大陆块 bbox 外,避免刚挖出的海湾又被填回去。
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue
    grow.push({
      i,
      h: cellH,
      cost: Math.abs(cellH - SEA_LEVEL) - bias * MACRO_BIAS_GAIN + polarPenalty,
      bias,
    })
  }

  if (erode.length === 0) return

  erode.sort((a, b) => a.cost - b.cost)
  grow.sort((a, b) => a.cost - b.cost)

  // 要把 largest.size / cellsInBbox 拉回阈值,理论需要侵蚀
  // `cellsInBbox * (fill - threshold)` 个 cell。旧版用 largest.size 乘差值,
  // 对高填充陆块会低估预算,导致方块轮廓只被轻微削边。
  const compactBudget = Math.round(cellsInBbox * (fill - COMPACT_FILL_THRESHOLD))
  const target = Math.min(
    Math.max(1, compactBudget),
    Math.round(n * COMPACT_PAIR_RATIO),
    erode.length,
  )
  const paired = Math.min(target, grow.length)
  for (let k = 0; k < paired; k++) {
    const e = erode[k]
    const g = grow[k]
    cells.h[e.i] = 7 + Math.floor(hash2D(e.i, 0.919) * 5)
    cells.h[g.i] = 24 + Math.floor(hash2D(g.i, 0.337) * 3)
  }

  // 极端情况下 bbox 外没有足够补陆候选;允许少量单向侵蚀,但保住全局 landRatio 下限。
  const safeUnpaired = Math.max(0, Math.floor((currentRatio - LANDFORM_MIN_RATIO) * n))
  const unpaired = Math.min(target - paired, safeUnpaired)
  for (let k = 0; k < unpaired; k++) {
    const e = erode[paired + k]
    if (!e) break
    cells.h[e.i] = 7 + Math.floor(hash2D(e.i, 0.919) * 5)
  }
}

/**
 * 大尺度深海湾雕刻。
 *
 * compactLandmassErosion 主要削边,对某些"正方形 bbox 内满铺陆地"的
 * 显式 continents seed 仍不够。这里从最大陆块的一侧切入连续楔形海湾:
 *   - 只在 bboxFill 仍高于阈值时触发
 *   - 不切到 targetLandRatio - 3.5% 以下,避免低陆地率样本继续变薄
 *   - 新海湾写成 h<12 的深水,restoreTargetLandRatio 不会立刻填回
 */
function deepBayCarve(
  cells: GridCells,
  targetLandRatio: number,
): void {
  const n = cells.length
  if (n === 0) return

  for (let pass = 0; pass < 3; pass++) {
    const currentLand = countLand(cells)
    const currentRatio = currentLand / n
    const safeErosion = Math.floor(currentLand - n * Math.max(LANDFORM_MIN_RATIO, targetLandRatio - 0.035))
    if (safeErosion <= 0 || currentRatio < targetLandRatio - 0.035) return

    const largest = getLargestLandmass(cells, { minSize: Math.max(50, Math.round(n * 0.025)) })
    if (!largest) return
    const { minX, minY, maxX, maxY } = largest.bbox
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)

    let cellsInBbox = 0
    for (let i = 0; i < n; i++) {
      const x = cells.p[i * 2]
      const y = cells.p[i * 2 + 1]
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) cellsInBbox++
    }
    if (cellsInBbox === 0) return
    const fill = largest.size / cellsInBbox
    if (fill <= DEEP_BAY_FILL_THRESHOLD) return

    const seed = largest.size * 0.173 + largest.centroid.x * 0.011 + largest.centroid.y * 0.019
    const side = Math.floor(hash2D(seed, pass + 0.37) * 4)
    const center = 0.18 + hash2D(seed, pass + 1.41) * 0.64
    const width = 0.13 + hash2D(seed, pass + 2.53) * 0.14
    const depth = 0.16 + hash2D(seed, pass + 3.79) * 0.13
    const canvasH = inferCanvasHeight(cells, n)
    const candidates: CandidateScore[] = []

    for (const cellId of largest.cellIds) {
      const cellH = cells.h[cellId]
      if (cellH < SEA_LEVEL || cellH > DEEP_BAY_ERODE_HI) continue
      const x = cells.p[cellId * 2]
      const y = cells.p[cellId * 2 + 1]
      const nx = clamp((x - minX) / w, 0, 1)
      const ny = clamp((y - minY) / h, 0, 1)
      const alongBase = side < 2 ? ny : nx
      const sideDepth = side === 0 ? nx : side === 1 ? 1 - nx : side === 2 ? ny : 1 - ny
      const meander = fbm2D(sideDepth * 4.2 + seed * 0.01, pass * 13.7, 3) * 0.055
      const along = clamp(alongBase + meander, 0, 1)
      const alongDist = Math.abs(along - center)
      if (alongDist > width) continue

      const taper = 1 - alongDist / width
      const maxDepth = depth * (0.25 + taper * 0.92)
      if (sideDepth > maxDepth) continue
      if (!isBoundaryLand(cells, cellId) && sideDepth > maxDepth * 0.45) continue

      const pf = polarFactor(y / canvasH)
      const npf = nearPolarFactor(y / canvasH)
      const polarPenalty = (1 - pf) * 150 + (1 - npf) * 85
      const bias = fbm2D(x * FBM_SCALE, y * FBM_SCALE, 3)
      candidates.push({
        i: cellId,
        h: cellH,
        cost: sideDepth * 18 + alongDist * 8 + Math.abs(cellH - SEA_LEVEL) * 0.18 + bias * 3 + polarPenalty,
        bias,
      })
    }

    if (candidates.length === 0) return
    candidates.sort((a, b) => a.cost - b.cost)
    const compactBudget = Math.round(cellsInBbox * (fill - DEEP_BAY_TARGET_FILL))
    const target = Math.min(
      Math.max(1, compactBudget),
      Math.round(n * DEEP_BAY_PAIR_RATIO),
      safeErosion,
      candidates.length,
    )
    for (let k = 0; k < target; k++) {
      const cellId = candidates[k].i
      cells.h[cellId] = 5 + Math.floor(hash2D(cellId, pass + 0.251) * 6)
    }
  }
}

/**
 * 极端 landRatio + 强积极 sea-level shift 下,某些 seed 会把所有 cell
 * 推到 SEA_LEVEL 以下变成"全水图"。这里保最少 1% 陆地:挑最高的若干个
 * cell 拉到 SEA_LEVEL+5 区间。仅作为防止 downstream 模块(features /
 * climate)炸掉的兜底,**不**纠正 landRatio 到目标值。
 */
function rescueZeroLand(cells: GridCells, minLandRatio: number): void {
  const n = cells.length
  let land = 0
  for (let i = 0; i < n; i++) {
    if (cells.h[i] >= SEA_LEVEL) land++
  }
  const minLand = Math.max(1, Math.round(n * minLandRatio))
  if (land >= minLand) return
  const indices = Array.from({ length: n }, (_, i) => i)
  indices.sort((a, b) => cells.h[b] - cells.h[a])
  for (let k = 0; k < minLand; k++) {
    const i = indices[k]
    if (cells.h[i] >= SEA_LEVEL) continue
    cells.h[i] = SEA_LEVEL + 5 + Math.floor(hash2D(i, 0.71) * 3)
  }
}

/**
 * 三阶段 remap(Round 2 修复):
 *  阶段 A — `globalShiftApproach`  sort + median-threshold 全局 ±10 × 6
 *           逼近目标,处理"基线远离 20"的极端模板(pangea / archipelago)。
 *  阶段 B-1 — `transitionFlip`  在过渡带 h ∈ [LO, HI] 内,按
 *           cost = |h - 20| + bias * 3 翻动最低 cost 的 cell 直至 ratio
 *           命中,聚集成不规则条带/海湾(取代全局 shift 切出的直线边界)。
 *  阶段 B-2 — `macroReshape`  合并原 Round 2 `reshapeCoasts`:不关心
 *           landRatio,只把低频 FBM bias 高的过渡 cell 翻成陆/水,
 *           真正重塑大陆轮廓(原 reshapeCoasts 只 ±1 陆地 cell 高度,
 *           无法改变 coastline 形状)。翻转量 ~ n * 3%。
 *  阶段 B-2.5 — `silhouetteLandformReshape`  按主陆块角度低频场
 *           迭代切海湾 / 生半岛,从骨架层面打破矩形大陆。
 *  阶段 B-3 — `compactLandmassErosion`  对 bboxFillRatio 过高的最大
 *           陆块做边缘海湾侵蚀 + bbox 外补陆,专门抑制矩形大陆。
 * 兜底 — `rescueZeroLand`  landRatio < 1% 时强保最高的 1% cell 为陆地,
 *           避免极端 landRatio + aggressive shift 产出全水图。
 */
export function adjustSeaLevelTemplateAware(
  cells: GridCells,
  targetLandRatio: number,
  shapeIntent?: TemplateShapeIntent,
  templateName?: HeightmapTemplate,
): void {
  if (cells.length === 0) return
  macroHeightWarp(cells, targetLandRatio)
  globalShiftApproach(cells, targetLandRatio)
  transitionFlip(cells, targetLandRatio)
  componentShapeRemap(cells, shapeIntent, templateName)
  splitOverconnectedContinents(cells, shapeIntent, templateName)
  macroReshape(cells)
  silhouetteLandformReshape(cells)
  compactLandmassErosion(cells)
  deepBayCarve(cells, targetLandRatio)
  splitOverconnectedContinents(cells, shapeIntent, templateName)
  restoreTargetLandRatio(cells, targetLandRatio, shapeIntent, templateName)
  forceContinentalSeparation(cells, shapeIntent, templateName)
  rescueZeroLand(cells, 0.01)
}
