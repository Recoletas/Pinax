/**
 * Azgaar 高度图模板（faithful port from
 * ../azgaar/Fantasy-Map-Generator/public/config/heightmap-templates.js）
 *
 * 模板格式（每行一个操作）：
 *   <Op> <count-range|value> <height-range|axis> <x-range> <y-range>
 *
 * 操作语义与 Azgaar 的 HeightmapModule.addStep 一致：
 *   Hill    N h x y        在 (x,y) 范围放 N 个山地 blob（BFS + blobPower 衰减）
 *   Pit     N h x y        同上但是下沉
 *   Range   N h x y        在 (x,y) 范围放 N 条山脉（两点间 pathfind + linePower 衰减）
 *   Trough  N h x y        同上但是下凹
 *   Strait  W dir 0 0      宽度 W 的海峡（h^=exp 把 h 压低）
 *   Smooth  fr 0 0 0       fr-均值 平滑：lim((h*(fr-1) + mean + 0) / fr)
 *   Mask    P 0 0 0         径向遮罩，P=1 中心最大，<0 反向
 *   Invert  P axis 0 0     概率 P 镜像（axis=x/y/both）
 *   Add     V range 0 0    range 内加 V（range 可为 "all" / "land" / "min-max"）
 *   Multiply V range 0 0   range 内乘 V
 *
 * 模板选用：按用户 continentCount / 地形风格从中挑一个，或固定默认 `continents`。
 */

export interface HeightmapTemplateEntry {
  id: number
  name: string
  /** 原始模板字符串（每行一个操作） */
  template: string
  /** 选取概率（Azgaar 原版给定） */
  probability: number
}

/** Azgaar 原版 14 个模板 */
export const HEIGHTMAP_TEMPLATES: Record<string, HeightmapTemplateEntry> = {
  volcano: {
    id: 0,
    name: 'Volcano',
    probability: 3,
    template: `Hill 1 90-100 44-56 40-60
Multiply 0.8 50-100 0 0
Range 1.5 30-55 45-55 40-60
Smooth 3 0 0 0
Hill 1.5 35-45 25-30 20-75
Hill 1 35-55 75-80 25-75
Hill 0.5 20-25 10-15 20-25
Mask 3 0 0 0`,
  },
  highIsland: {
    id: 1,
    name: 'High Island',
    probability: 19,
    template: `Hill 1 90-100 65-75 47-53
Add 7 all 0 0
Hill 5-6 20-30 25-55 45-55
Range 1 40-50 45-55 45-55
Multiply 0.8 land 0 0
Mask 3 0 0 0
Smooth 2 0 0 0
Trough 2-3 20-30 20-30 20-30
Trough 2-3 20-30 60-80 70-80
Hill 1 10-15 60-60 50-50
Hill 1.5 13-16 15-20 20-75
Range 1.5 30-40 15-85 30-40
Range 1.5 30-40 15-85 60-70
Pit 3-5 10-30 15-85 20-80`,
  },
  lowIsland: {
    id: 2,
    name: 'Low Island',
    probability: 9,
    template: `Hill 1 90-99 60-80 45-55
Hill 1-2 20-30 10-30 10-90
Smooth 2 0 0 0
Hill 6-7 25-35 20-70 30-70
Range 1 40-50 45-55 45-55
Trough 2-3 20-30 15-85 20-30
Trough 2-3 20-30 15-85 70-80
Hill 1.5 10-15 5-15 20-80
Hill 1 10-15 85-95 70-80
Pit 5-7 15-25 15-85 20-80
Multiply 0.4 20-100 0 0
Mask 4 0 0 0`,
  },
  continents: {
    id: 3,
    name: 'Continents',
    probability: 16,
    template: `Hill 1 80-85 60-80 40-60
Hill 1 80-85 20-30 40-60
    Hill 6-7 15-30 25-75 15-85
    Multiply 0.6 land 0 0
    Hill 8-10 5-10 15-85 20-80
    Range 1-2 30-60 5-15 25-75
    Range 1-2 30-60 80-95 25-75
    Range 0-3 30-60 80-90 20-80
    Strait 2 vertical 0 0
    Strait 1 vertical 0 0
Smooth 3 0 0 0
Trough 3-4 15-20 15-85 20-80
Trough 3-4 5-10 45-55 45-55
Pit 3-4 10-20 15-85 20-80
Mask 4 0 0 0`,
  },
  archipelago: {
    id: 4,
    name: 'Archipelago',
    probability: 18,
    template: `Add 11 all 0 0
Range 2-3 40-60 20-80 20-80
Hill 5 15-20 10-90 30-70
Hill 2 10-15 10-30 20-80
Hill 2 10-15 60-90 20-80
Smooth 3 0 0 0
Trough 10 20-30 5-95 5-95
Strait 2 vertical 0 0
Strait 2 horizontal 0 0`,
  },
  atoll: {
    id: 5,
    name: 'Atoll',
    probability: 1,
    template: `Hill 1 75-80 50-60 45-55
Hill 1.5 30-50 25-75 30-70
Hill .5 30-50 25-35 30-70
Smooth 1 0 0 0
Multiply 0.2 25-100 0 0
Hill 0.5 10-20 50-55 48-52`,
  },
  mediterranean: {
    id: 6,
    name: 'Mediterranean',
    probability: 5,
    template: `Range 4-6 30-80 0-100 0-10
Range 4-6 30-80 0-100 90-100
Hill 6-8 30-50 10-90 0-5
Hill 6-8 30-50 10-90 95-100
Multiply 0.9 land 0 0
Mask -2 0 0 0
Smooth 1 0 0 0
Hill 2-3 30-70 0-5 20-80
Hill 2-3 30-70 95-100 20-80
Trough 3-6 40-50 0-100 0-10
Trough 3-6 40-50 0-100 90-100`,
  },
  peninsula: {
    id: 7,
    name: 'Peninsula',
    probability: 3,
    template: `Range 2-3 20-35 40-50 0-15
Add 5 all 0 0
Hill 1 90-100 10-90 0-5
Add 13 all 0 0
Hill 3-4 3-5 5-95 80-100
Hill 1-2 3-5 5-95 40-60
Trough 5-6 10-25 5-95 5-95
Smooth 3 0 0 0
Invert 0.4 both 0 0`,
  },
  pangea: {
    id: 8,
    name: 'Pangea',
    probability: 5,
    template: `Hill 1-2 25-40 15-50 0-10
Hill 1-2 5-40 50-85 0-10
Hill 1-2 25-40 50-85 90-100
Hill 1-2 5-40 15-50 90-100
Hill 8-12 20-40 20-80 48-52
Smooth 2 0 0 0
Multiply 0.7 land 0 0
Trough 3-4 25-35 5-95 10-20
Trough 3-4 25-35 5-95 80-90
Range 5-6 30-40 10-90 35-65`,
  },
  isthmus: {
    id: 9,
    name: 'Isthmus',
    probability: 2,
    template: `Hill 5-10 15-30 0-30 0-20
Hill 5-10 15-30 10-50 20-40
Hill 5-10 15-30 30-70 40-60
Hill 5-10 15-30 50-90 60-80
Hill 5-10 15-30 70-100 80-100
Smooth 2 0 0 0
Trough 4-8 15-30 0-30 0-20
Trough 4-8 15-30 10-50 20-40
Trough 4-8 15-30 30-70 40-60
Trough 4-8 15-30 50-90 60-80
Trough 4-8 15-30 70-100 80-100
Invert 0.25 x 0 0`,
  },
  shattered: {
    id: 10,
    name: 'Shattered',
    probability: 7,
    template: `Hill 8 35-40 15-85 30-70
Trough 10-20 40-50 5-95 5-95
Range 5-7 30-40 10-90 20-80
Pit 12-20 30-40 15-85 20-80`,
  },
  taklamakan: {
    id: 11,
    name: 'Taklamakan',
    probability: 1,
    template: `Hill 1-3 20-30 30-70 30-70
Hill 2-4 60-85 0-5 0-100
Hill 2-4 60-85 95-100 0-100
Hill 3-4 60-85 20-80 0-5
Hill 3-4 60-85 20-80 95-100
Smooth 3 0 0 0`,
  },
  oldWorld: {
    id: 12,
    name: 'Old World',
    probability: 8,
    template: `Range 3 70 15-85 20-80
Hill 2-3 50-70 15-45 20-80
Hill 2-3 50-70 65-85 20-80
Hill 4-6 20-25 15-85 20-80
Multiply 0.5 land 0 0
Smooth 2 0 0 0
Range 3-4 20-50 15-35 20-45
Range 2-4 20-50 65-85 45-80
Strait 3-7 vertical 0 0
Trough 6-8 20-50 15-85 45-65
Pit 5-6 20-30 10-90 10-90`,
  },
  fractious: {
    id: 13,
    name: 'Fractious',
    probability: 3,
    template: `Hill 12-15 50-80 5-95 5-95
Mask -1.5 0 0 0
Mask 3 0 0 0
Add -20 30-100 0 0
Range 6-8 40-50 5-95 10-90`,
  },
}

/** 模板的几何语义分组（只描述「产生什么形状」，不约束概率） */
export type TemplateShapeIntent =
  | 'single'      // 单一主陆块
  | 'continents'  // 多大陆
  | 'archipelago' // 多岛链
  | 'peninsula'   // 半岛 / 地峡
  | 'special'     // 极特殊（火山、沙漠化、破碎）

/**
 * 按 shape intent 聚合的模板集合（round 1.5 静态分组）
 *  - `single`      仅 `pangea`（oldWorld 暂未验证稳定产生单主陆块，留待第二轮）
 *  - `special`     不在自动分支暴露，仅 landRatio>0.85 触发或显式选择
 *  - `continents`  Round 1.5 临时去掉 `mediterranean`：mediterranean 模板的
 *                  Mask -2 + 上下 Hills 组合在部分 seed 下覆盖几乎全图，
 *                  在自动路径里会显著拉高 landRatio（snapshot cc=6: 0.613）。
 *                  Round 2 完成「中心水域 + 上下陆地带 + 中心水域不填死」
 *                  完整合同后再放回。显式选择仍可触发（reverse-map 走
 *                  `TEMPLATE_TO_INTENT.mediterranean = 'continents'`）。
 *  - 其它组别权重取自各模板 entry 的 `probability` 字段
 */
export const TEMPLATE_GROUPS: Record<TemplateShapeIntent, readonly HeightmapTemplate[]> = {
  single:      ['pangea'],
  continents:  ['continents', 'oldWorld'],
  archipelago: ['archipelago', 'shattered', 'highIsland', 'lowIsland', 'atoll'],
  peninsula:   ['peninsula', 'isthmus'],
  special:     ['volcano', 'taklamakan', 'fractious'],
} as const

/** 模板名 → 所属 shape intent（反向映射，供显式模板用） */
export const TEMPLATE_TO_INTENT: Record<HeightmapTemplate, TemplateShapeIntent> = {
  pangea:        'single',
  oldWorld:      'continents',
  continents:    'continents',
  mediterranean: 'continents',
  archipelago:   'archipelago',
  shattered:     'archipelago',
  highIsland:    'archipelago',
  lowIsland:     'archipelago',
  atoll:         'archipelago',
  peninsula:     'peninsula',
  isthmus:       'peninsula',
  volcano:       'special',
  taklamakan:    'special',
  fractious:     'special',
}

/**
 * 仅自动路径使用：根据 continentCount + landRatio 决定 shape intent。
 * 显式模板不走这里（避免 `continentCount=1 + 显式 peninsula` 被误归到 `single`）。
 *
 * Round 1.5 规则修正：
 *  - 删掉 `landRatio > 0.45 → archipelago` 的反直觉分支（陆地更多却去岛链
 *    组，与用户预期相反）
 *  - peninsula 组加自动入口：`cc === 2 && landRatio ∈ [0.4, 0.5]` → peninsula
 *    （保守窗口：仅"2 个板块 + 中等陆地"走半岛，其他 cc 走 continents）
 */
export function resolveShapeIntent(
  continentCount: number,
  landRatio: number,
): TemplateShapeIntent {
  if (continentCount <= 1) return 'single'
  if (landRatio > 0.85)    return 'special'
  if (landRatio < 0.15)    return 'archipelago'
  if (continentCount === 2 && landRatio >= 0.4 && landRatio <= 0.5) return 'peninsula'
  return 'continents'
}

/** 在指定 shape intent 组内按各模板的 `probability` 字段加权抽，不跨组 */
export function pickTemplateInGroup(
  intent: TemplateShapeIntent,
  _landRatio: number,
  rng: () => number,
): HeightmapTemplate {
  const group = TEMPLATE_GROUPS[intent]
  const weights: Array<[HeightmapTemplate, number]> = group.map(name => [
    name,
    HEIGHTMAP_TEMPLATES[name].probability,
  ])
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  let r = rng() * total
  for (const [name, w] of weights) {
    r -= w
    if (r <= 0) return name
  }
  return weights[0][0]
}

/**
 * 统一入口：显式模板直接返回（不消费 RNG）；自动路径走 shape intent 同组内加权。
 * 显式模板的 `shapeIntent` 来自反向映射，避免被自动 intent 错误归类。
 */
export function resolveHeightmapTemplate(config: {
  continentCount: number
  landRatio: number
  rng: () => number
  explicitTemplate?: HeightmapTemplate
}): { templateName: HeightmapTemplate; shapeIntent: TemplateShapeIntent } {
  if (config.explicitTemplate) {
    return {
      templateName: config.explicitTemplate,
      shapeIntent: TEMPLATE_TO_INTENT[config.explicitTemplate],
    }
  }
  const shapeIntent = resolveShapeIntent(config.continentCount, config.landRatio)
  const templateName = pickTemplateInGroup(shapeIntent, config.landRatio, config.rng)
  return { templateName, shapeIntent }
}

/**
 * @deprecated 请改用 `resolveHeightmapTemplate`，它同时返回 `templateName` 与 `shapeIntent`，
 *             显式模板也请通过 `config.explicitTemplate` 传入，避免被自动 intent 错误归类。
 *
 *             本函数仅作为旧 API 兼容壳：内部走 `resolveHeightmapTemplate` 自动路径。
 *             行为差异（与 plan 第一轮同步）：
 *               - 旧版 `landRatio<0.15` 永远返回 'atoll'；新版按 archipelago 组内概率加权
 *               - 旧版 `landRatio>0.85` 永远返回 'volcano'；新版按 special 组内概率加权
 *               - 旧版 `continentCount<=1` 含 pangea/oldWorld/peninsula/continents 跨组混合；
 *                 新版 `single` 组只含 pangea
 */
export function pickTemplate(
  continentCount: number,
  landRatio: number,
  rng: () => number,
): string {
  return resolveHeightmapTemplate({ continentCount, landRatio, rng }).templateName
}

// ── 模板执行（faithful port from
//     azgaar/Fantasy-Map-Generator/src/modules/heightmap-generator.ts） ──

import type { GridCells, HeightmapTemplate } from './types'

/** 解析 "1-2" → rand(1, 2) 或 "5" → 5。Azgaar 模板里的所有数字参数都走这个 */
function getNumberInRange(r: string, rng: () => number): number {
  if (typeof r !== 'string') return 0
  if (!Number.isNaN(+r)) {
    const v = +r
    return Math.floor(v) + (rng() < v - Math.floor(v) ? 1 : 0)
  }
  const sign = r[0] === '-' ? -1 : 1
  if (Number.isNaN(+r[0])) r = r.slice(1)
  const range = r.includes('-') ? r.split('-') : null
  if (!range) return 0
  const min = parseFloat(range[0]) * sign
  const max = parseFloat(range[1])
  if (Number.isNaN(min) || Number.isNaN(max)) return 0
  return min + rng() * (max - min)
}

function lim(v: number): number {
  return Math.max(0, Math.min(100, v))
}

/** 解析 "15-85" → 15% 到 85% of length 的随机点 */
function getPointInRange(range: string, length: number, rng: () => number): number {
  const parts = range.split('-')
  const min = parseInt(parts[0], 10) / 100 || 0
  const max = parseInt(parts[1] ?? parts[0], 10) / 100 || min
  return min * length + rng() * (max - min) * length
}

/** Voronoi 网格下找离 (x, y) 最近的 cellId（Azgaar 原版是规则格 → 直接 floor） */
function findGridCell(x: number, y: number, cells: GridCells): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < cells.length; i++) {
    const dx = cells.p[i * 2] - x
    const dy = cells.p[i * 2 + 1] - y
    const d = dx * dx + dy * dy
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

function getBlobPower(n: number): number {
  if (n <= 1000) return 0.93
  if (n <= 2000) return 0.95
  if (n <= 5000) return 0.97
  if (n <= 10000) return 0.98
  if (n <= 20000) return 0.99
  if (n <= 30000) return 0.991
  if (n <= 40000) return 0.993
  if (n <= 50000) return 0.994
  if (n <= 60000) return 0.995
  if (n <= 70000) return 0.9955
  if (n <= 80000) return 0.996
  if (n <= 90000) return 0.9964
  return 0.9973
}

function getLinePower(n: number): number {
  if (n <= 1000) return 0.75
  if (n <= 2000) return 0.77
  if (n <= 5000) return 0.79
  if (n <= 10000) return 0.81
  if (n <= 20000) return 0.82
  if (n <= 30000) return 0.83
  if (n <= 40000) return 0.84
  if (n <= 50000) return 0.86
  if (n <= 60000) return 0.87
  if (n <= 70000) return 0.88
  if (n <= 80000) return 0.91
  if (n <= 90000) return 0.92
  return 0.93
}

/**
 * 在 [startX%, endX%] × [startY%, endY%] 矩形内放 N 个山地 blob；
 * 每个 blob 中心抬高 h，BFS 扩散时按 blobPower 衰减。
 */
function addHill(
  cells: GridCells,
  width: number,
  height: number,
  count: string,
  h: string,
  rangeX: string,
  rangeY: string,
  blobPower: number,
  rng: () => number,
): void {
  const addOne = () => {
    let start: number
    let limit = 0
    const heightVal = lim(getNumberInRange(h, rng))
    do {
      const x = getPointInRange(rangeX, width, rng)
      const y = getPointInRange(rangeY, height, rng)
      if (x === undefined || y === undefined) return
      start = findGridCell(x, y, cells)
      limit++
    } while (cells.h[start] + heightVal > 90 && limit < 50)

    const change = new Uint8Array(cells.length)
    change[start] = heightVal
    const queue = [start]
    while (queue.length) {
      const q = queue.shift()!
      for (const c of cells.c[q]) {
        if (change[c]) continue
        change[c] = Math.round(change[q] ** blobPower * (rng() * 0.2 + 0.9))
        if (change[c] > 1) queue.push(c)
      }
    }
    for (let i = 0; i < cells.length; i++) {
      cells.h[i] = lim(cells.h[i] + change[i])
    }
  }

  const desired = getNumberInRange(count, rng)
  for (let i = 0; i < desired; i++) addOne()
}

/**
 * 在矩形内放 N 个凹陷 blob；BFS 扩散并按 blobPower 衰减。
 */
function addPit(
  cells: GridCells,
  width: number,
  height: number,
  count: string,
  h: string,
  rangeX: string,
  rangeY: string,
  blobPower: number,
  rng: () => number,
): void {
  const addOne = () => {
    const used = new Uint8Array(cells.length)
    let start: number
    let hVal = lim(getNumberInRange(h, rng))
    let limit = 0
    do {
      const x = getPointInRange(rangeX, width, rng)
      const y = getPointInRange(rangeY, height, rng)
      if (x === undefined || y === undefined) return
      start = findGridCell(x, y, cells)
      limit++
    } while (cells.h[start] < 20 && limit < 50)

    const queue = [start]
    used[start] = 1
    while (queue.length) {
      const q = queue.shift()!
      hVal = hVal ** blobPower * (rng() * 0.2 + 0.9)
      if (hVal < 1) return
      for (const c of cells.c[q]) {
        if (used[c]) continue
        used[c] = 1
        cells.h[c] = lim(cells.h[c] - hVal * (rng() * 0.2 + 0.9))
        queue.push(c)
      }
    }
  }

  const desired = getNumberInRange(count, rng)
  for (let i = 0; i < desired; i++) addOne()
}

/** 在矩形内放 N 条山脉（两点 pathfind + linePower 衰减） */
function addRange(
  cells: GridCells,
  width: number,
  height: number,
  count: string,
  h: string,
  rangeX: string,
  rangeY: string,
  linePower: number,
  rng: () => number,
): void {
  const getRange = (cur: number, end: number, used: Uint8Array): number[] => {
    const range: number[] = [cur]
    used[cur] = 1
    while (cur !== end) {
      let min = Infinity
      let next = cur
      for (const e of cells.c[cur]) {
        if (used[e]) continue
        let diff = (cells.p[end * 2] - cells.p[e * 2]) ** 2 +
          (cells.p[end * 2 + 1] - cells.p[e * 2 + 1]) ** 2
        if (rng() > 0.85) diff = diff / 2
        if (diff < min) {
          min = diff
          next = e
        }
      }
      if (min === Infinity) return range
      cur = next
      range.push(cur)
      used[cur] = 1
    }
    return range
  }

  const addOne = () => {
    let hVal = lim(getNumberInRange(h, rng))
    const used = new Uint8Array(cells.length)

    const startX = getPointInRange(rangeX, width, rng)
    const startY = getPointInRange(rangeY, height, rng)
    let dist = 0
    let limit = 0
    let endX = 0
    let endY = 0
    do {
      endX = rng() * width * 0.8 + width * 0.1
      endY = rng() * height * 0.7 + height * 0.15
      dist = Math.abs(endY - startY) + Math.abs(endX - startX)
      limit++
    } while ((dist < width / 8 || dist > width / 3) && limit < 50)

    const startCellId = findGridCell(startX, startY, cells)
    const endCellId = findGridCell(endX, endY, cells)
    const range = getRange(startCellId, endCellId, used)

    let queue = range.slice()
    let i = 0
    while (queue.length) {
      const frontier = queue.slice()
      queue = []
      i++
      for (const id of frontier) {
        cells.h[id] = lim(cells.h[id] + hVal * (rng() * 0.3 + 0.85))
      }
      hVal = hVal ** linePower - 1
      if (hVal < 2) break
      for (const f of frontier) {
        for (const n of cells.c[f]) {
          if (!used[n]) {
            queue.push(n)
            used[n] = 1
          }
        }
      }
    }

    // Add side prominences to avoid overly straight mountain ribbons.
    for (let d = 0; d < range.length; d++) {
      if (d % 6 !== 0) continue
      let cur = range[d]
      for (let step = 0; step < i; step++) {
        let minNeighbor = -1
        let minHeight = Infinity
        for (const nb of cells.c[cur]) {
          if (cells.h[nb] < minHeight) {
            minHeight = cells.h[nb]
            minNeighbor = nb
          }
        }
        if (minNeighbor === -1) break
        cells.h[minNeighbor] = lim(Math.round((cells.h[cur] * 2 + cells.h[minNeighbor]) / 3))
        cur = minNeighbor
      }
    }
  }

  const desired = getNumberInRange(count, rng)
  for (let i = 0; i < desired; i++) addOne()
}

/** 在矩形内放 N 条凹槽（两点 pathfind + linePower 衰减） */
function addTrough(
  cells: GridCells,
  width: number,
  height: number,
  count: string,
  h: string,
  rangeX: string,
  rangeY: string,
  linePower: number,
  rng: () => number,
): void {
  const getRange = (cur: number, end: number, used: Uint8Array): number[] => {
    const range: number[] = [cur]
    used[cur] = 1
    while (cur !== end) {
      let min = Infinity
      let next = cur
      for (const e of cells.c[cur]) {
        if (used[e]) continue
        let diff = (cells.p[end * 2] - cells.p[e * 2]) ** 2 +
          (cells.p[end * 2 + 1] - cells.p[e * 2 + 1]) ** 2
        if (rng() > 0.8) diff = diff / 2
        if (diff < min) {
          min = diff
          next = e
        }
      }
      if (min === Infinity) return range
      cur = next
      range.push(cur)
      used[cur] = 1
    }
    return range
  }

  const addOne = () => {
    let hVal = lim(getNumberInRange(h, rng))
    const used = new Uint8Array(cells.length)

    let startCellId: number
    let limit = 0
    do {
      const startX = getPointInRange(rangeX, width, rng)
      const startY = getPointInRange(rangeY, height, rng)
      startCellId = findGridCell(startX, startY, cells)
      limit++
    } while (cells.h[startCellId] < 20 && limit < 50)

    let endX = 0
    let endY = 0
    limit = 0
    let dist = 0
    do {
      endX = rng() * width * 0.8 + width * 0.1
      endY = rng() * height * 0.7 + height * 0.15
      dist = Math.abs(endY - cells.p[startCellId * 2 + 1]) + Math.abs(endX - cells.p[startCellId * 2])
      limit++
    } while ((dist < width / 8 || dist > width / 2) && limit < 50)

    const endCellId = findGridCell(endX, endY, cells)
    const range = getRange(startCellId, endCellId, used)

    let queue = range.slice()
    let i = 0
    while (queue.length) {
      const frontier = queue.slice()
      queue = []
      i++
      for (const id of frontier) {
        cells.h[id] = lim(cells.h[id] - hVal * (rng() * 0.3 + 0.85))
      }
      hVal = hVal ** linePower - 1
      if (hVal < 2) break
      for (const f of frontier) {
        for (const n of cells.c[f]) {
          if (!used[n]) {
            queue.push(n)
            used[n] = 1
          }
        }
      }
    }

    for (let d = 0; d < range.length; d++) {
      if (d % 6 !== 0) continue
      let cur = range[d]
      for (let step = 0; step < i; step++) {
        let minNeighbor = -1
        let minHeight = Infinity
        for (const nb of cells.c[cur]) {
          if (cells.h[nb] < minHeight) {
            minHeight = cells.h[nb]
            minNeighbor = nb
          }
        }
        if (minNeighbor === -1) break
        cells.h[minNeighbor] = lim(Math.round((cells.h[cur] * 2 + cells.h[minNeighbor]) / 3))
        cur = minNeighbor
      }
    }
  }

  const desired = getNumberInRange(count, rng)
  for (let i = 0; i < desired; i++) addOne()
}

/** 沿一条横/纵线开凿海峡（heights ^= exp 把 h 压低） */
function addStrait(
  cells: GridCells,
  width: number,
  height: number,
  widthStr: string,
  direction: string,
  rng: () => number,
): void {
  const desiredWidth = Math.min(getNumberInRange(widthStr, rng), cells.length / 3)
  if (desiredWidth < 1) return
  const vert = direction === 'vertical'

  const startX = vert ? Math.floor(rng() * width * 0.4 + width * 0.3) : 5
  const startY = vert ? 5 : Math.floor(rng() * height * 0.4 + height * 0.3)
  const endX = vert
    ? Math.floor(width - startX - width * 0.1 + rng() * width * 0.2)
    : width - 5
  const endY = vert
    ? height - 5
    : Math.floor(height - startY - height * 0.1 + rng() * height * 0.2)

  const start = findGridCell(startX, startY, cells)
  const end = findGridCell(endX, endY, cells)

  const range: number[] = []
  let cur = start
  const usedRange = new Uint8Array(cells.length)
  while (cur !== end) {
    let min = Infinity
    let next = cur
    for (const e of cells.c[cur]) {
      if (usedRange[e]) continue
      let diff = (cells.p[end * 2] - cells.p[e * 2]) ** 2 +
        (cells.p[end * 2 + 1] - cells.p[e * 2 + 1]) ** 2
      if (rng() > 0.8) diff = diff / 2
      if (diff < min) {
        min = diff
        next = e
      }
    }
    if (min === Infinity) break
    cur = next
    range.push(cur)
    usedRange[cur] = 1
  }

  const step = 0.1 / desiredWidth
  const used = new Uint8Array(cells.length)
  for (let i = 0; i < desiredWidth; i++) {
    const remaining = desiredWidth - i
    const exp = 0.9 - step * remaining
    const query: number[] = []
    for (const r of range) {
      for (const e of cells.c[r]) {
        if (used[e]) continue
        used[e] = 1
        query.push(e)
        cells.h[e] = cells.h[e] ** exp
        if (cells.h[e] > 100) cells.h[e] = 5
      }
    }
    range.length = 0
    range.push(...query)
  }
}

/** fr-均值平滑：lim((h*(fr-1) + mean + add) / fr) */
function templateSmooth(
  cells: GridCells,
  fr: number,
  add: number,
): void {
  if (fr <= 0) return
  const newH = new Uint8Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    let sum = cells.h[i]
    let count = 1
    for (const c of cells.c[i]) {
      sum += cells.h[c]
      count++
    }
    const mean = sum / count
    if (fr === 1) {
      newH[i] = lim(Math.round(mean + add))
    } else {
      newH[i] = lim(Math.round((cells.h[i] * (fr - 1) + mean + add) / fr))
    }
  }
  cells.h.set(newH)
}

/** 径向遮罩：power > 0 中心高、power < 0 边缘高。Azgaar 公式：lim((h*(fr-1) + h*distance) / fr) */
function templateMask(
  cells: GridCells,
  width: number,
  height: number,
  power: number,
  rng: () => number,
): void {
  const fr = power ? Math.abs(power) : 1
  for (let i = 0; i < cells.length; i++) {
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const nx = (2 * x) / width - 1
    const ny = (2 * y) / height - 1
    let distance = (1 - nx ** 2) * (1 - ny ** 2)
    if (power < 0) distance = 1 - distance
    const masked = cells.h[i] * distance
    cells.h[i] = lim(Math.round((cells.h[i] * (fr - 1) + masked) / fr))
  }
}

/** 概率 P 沿 axis 翻转高度分布，Voronoi 下按镜像坐标重采样最近 cell。 */
function templateInvert(
  cells: GridCells,
  width: number,
  height: number,
  prob: number,
  axis: string,
  rng: () => number,
): void {
  if (rng() > prob) return
  const invertX = axis === 'x' || axis === 'both'
  const invertY = axis === 'y' || axis === 'both'
  if (!invertX && !invertY) return
  const source = Uint8Array.from(cells.h)
  for (let i = 0; i < cells.length; i++) {
    const x = cells.p[i * 2]
    const y = cells.p[i * 2 + 1]
    const sx = invertX ? width - x : x
    const sy = invertY ? height - y : y
    const mirrored = findGridCell(sx, sy, cells)
    cells.h[i] = source[mirrored]
  }
}

/** Add V range / Multiply V range 范围调整 */
function templateModify(
  cells: GridCells,
  range: string,
  add: number,
  mult: number,
): void {
  let min: number
  let max: number
  if (range === 'land') {
    min = 20
    max = 100
  } else if (range === 'all') {
    min = 0
    max = 100
  } else {
    const parts = range.split('-')
    min = +parts[0]
    max = +(parts[1] ?? parts[0])
  }
  const isLand = min === 20
  for (let i = 0; i < cells.length; i++) {
    const h = cells.h[i]
    if (h < min || h > max) continue
    let v = h
    if (add) v = isLand ? Math.max(v + add, 20) : v + add
    if (mult !== 1) v = isLand ? (v - 20) * mult + 20 : v * mult
    cells.h[i] = lim(v)
  }
}

/** 模板解析入口：把每行 "Op arg1 arg2 arg3 arg4" dispatch 到对应函数 */
export function applyTemplate(
  cells: GridCells,
  width: number,
  height: number,
  templateString: string,
  rng: () => number,
): void {
  const blobPower = getBlobPower(cells.length)
  const linePower = getLinePower(cells.length)
  const steps = templateString.split('\n').map(s => s.trim()).filter(Boolean)
  for (const step of steps) {
    const els = step.split(/\s+/)
    if (els.length < 2) continue
    const [tool, a2, a3, a4, a5] = els
    switch (tool) {
      case 'Hill':
        addHill(cells, width, height, a2, a3, a4, a5, blobPower, rng)
        break
      case 'Pit':
        addPit(cells, width, height, a2, a3, a4, a5, blobPower, rng)
        break
      case 'Range':
        addRange(cells, width, height, a2, a3, a4, a5, linePower, rng)
        break
      case 'Trough':
        addTrough(cells, width, height, a2, a3, a4, a5, linePower, rng)
        break
      case 'Strait':
        addStrait(cells, width, height, a2, a3, rng)
        break
      case 'Smooth':
        templateSmooth(cells, +a2, +(a3 ?? 0))
        break
      case 'Mask':
        templateMask(cells, width, height, +a2, rng)
        break
      case 'Invert':
        templateInvert(cells, width, height, +a2, a3, rng)
        break
      case 'Add':
        templateModify(cells, a3, +a2, 1)
        break
      case 'Multiply':
        templateModify(cells, a3, 0, +a2)
        break
    }
  }
}
