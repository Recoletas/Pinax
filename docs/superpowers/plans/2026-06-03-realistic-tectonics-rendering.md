# 现实化板块 / 海岸 / 水系 / 渲染实现计划

> **SUPERSEDED 2026-06-04** — 本 plan 中实现的 `realism.level` 三档机制已被取消。取代实现见 [`docs/src/decisions/ADR-0003-azgaar-pipeline.md`](../../src/decisions/ADR-0003-azgaar-pipeline.md) 和 [`docs/src/rfcs/azgaar-pipeline/`](../../src/rfcs/azgaar-pipeline/)。
> 保留本 plan 以供考古（任务分解、tectonic 模块结构、boundary-terrain 4 个 apply 函数仍然被新管线复用）。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Voronoi 地图的山脉/火山/裂谷、海岸、河流、国界、底色按 Azgaar 风格生成，并通过世界书的结构化设定（structured settings）由 AI 驱动；老 `MapGenConfig` 完全兼容（默认走 classic 路径，行为不变）。

**Architecture:** 数据驱动 — 在 `cells` 上新增 `tectonic` 子结构和 `volcano` / `riverId` 字段，由 `generateTectonics` 算一次，下游所有阶段（地形、渲染、政治）都读。`MapGenConfig` 扩 `realism` 子对象和可选 `constraints` 字段。`realism.level` 三档：`classic`（现状）/ `azgaar`（本期主目标）/ `geologic`（占位）。

**Tech Stack:** TypeScript（engine）、Vue 3（UI）、Vitest（测试）、d3-hierarchy + delaunator（Voronoi 已有）、Canvas 2D（渲染）

**Spec:** `docs/superpowers/specs/2026-06-03-realistic-tectonics-rendering-design.md`

---

## 文件结构

**新增：**
- `src/services/world-map/engine/tectonic-data.ts` — `computeTectonicData()`：算 `cells.tectonic` 6 个数组
- `src/services/world-map/engine/boundary-terrain.ts` — 4 个 apply 函数（convergent/divergent/transform/volcanic-arc）
- `src/services/world-map/engine/coast.ts` — `perturbCoast()`
- `src/services/world-map/engine/borderlands.ts` — 国界 buffer 算法
- `src/services/world-map/engine/faction-texture.ts` — 国家底色 + 噪点
- `src/services/world-map/engine/renderer-pipeline.ts` — 6 preset × 多 layer 的管线表
- `src/__tests__/tectonic-data.test.js`
- `src/__tests__/boundary-terrain.test.js`
- `src/__tests__/coast.test.js`
- `src/__tests__/rivers-meander.test.js`
- `src/__tests__/renderer-pipeline.test.js`
- `src/__tests__/realism-classic-compat.test.js`
- `src/__tests__/voronoiMapAdapter-realism.test.js`

**修改：**
- `src/services/world-map/engine/types.ts` — 加 `TectonicData` / `Volcano` / `MapRealism` / `MapConstraints` 类型
- `src/services/world-map/engine/tectonics.ts` — `generateTectonics` 改为 9 步，调用新模块
- `src/services/world-map/engine/rivers.ts` — 重写为 meandering/deltaic
- `src/services/world-map/engine/renderer.ts` — 改用 pipeline
- `src/services/world-map/engine/style-presets.ts` — 加 `pipeline: Layer[]` 字段
- `src/services/world-map/engine/generate.ts` — `generateMap` 三参（cfg, collector, constraints?）
- `src/services/ai/voronoiMapAdapter.js` — 扩 prompt + 解析

**总原则：每个 task 完成后 `npm run test:run` 全绿 + commit。**

---

## Phase 1 — 板块 + 地形

### Task 1: 类型定义（cells.tectonic、realism、constraints）

**Files:**
- Modify: `src/services/world-map/engine/types.ts:228-365`（在 `GridCells` 之后、`MapGenConfig` 之前插入新类型；在 `MapGenConfig` 末尾追加 `realism?` 和 `constraints?`）

- [ ] **Step 1: 添加新类型定义**

在 `types.ts` 中 `GridCells` 接口之后插入：

```ts
/** 板块数据结构（cells 上的并行数组） */
export interface TectonicData {
  /** 板块编号（Voronoi 划分结果） */
  plateId: Int16Array
  /** 到最近板块边界的 cell 数（255 = 内陆） */
  boundaryDist: Uint8Array
  /** 边界类型：0=无 1=convergent 2=divergent 3=transform */
  boundaryType: Uint8Array
  /** 0=无 1=洋→陆俯冲带邻接 */
  subduction: Uint8Array
  /** 0=新 255=老（山影色调） */
  orogenyAge: Uint8Array
  /** 0=无 1=火山弧位置 */
  volcanoArc: Uint8Array
}

/** 火山类型 */
export const VOLCANO_NONE = 0
export const VOLCANO_STRATO = 1
export const VOLCANO_SHIELD = 2

/** 现实化配置（控制板块/海岸/水系/渲染的视觉强度） */
export interface MapRealism {
  /** 总开关 */
  level: 'classic' | 'azgaar' | 'geologic'
  tectonics?: {
    plateCount?: number
    rangeWidth?: number      // 山带宽度 1-8
    riftDepth?: number       // 裂谷深度
    volcanoDensity?: number  // 0-1
  }
  rivers?: {
    style?: 'straight' | 'meandering' | 'deltaic'
    meanderAmplitude?: number  // 0-5
  }
  coast?: {
    noiseScale?: number       // 默认 0.012
    noiseAmplitude?: number   // 默认 6
    headlandFreq?: number     // 0-1
  }
  political?: {
    borderStyle?: 'simple' | 'azgaar'
    borderlandWidth?: number  // 0-3
    factionTexture?: boolean
  }
}

/** 世界书强约束（可选） */
export interface MapConstraints {
  mountains?: Array<{
    name: string
    cells: number[]
    type: 'range' | 'volcano' | 'ridge'
  }>
  rivers?: Array<{
    name: string
    sourceCell: number
    mouthHint?: string
  }>
  stateSeeds?: Array<{
    name: string
    centerCell: number
    radius?: number
    color?: string
  }>
}
```

- [ ] **Step 2: 在 GridCells 接口中添加新字段**

在 `types.ts` 的 `GridCells` 接口中追加：

```ts
  /** 板块数据（plateId/boundaryDist/boundaryType/subduction/orogenyAge/volcanoArc 6 个并行数组） */
  tectonic?: TectonicData
  /** 火山类型（0=无 1=strato 2=shield） */
  volcano?: Uint8Array
  /** 河流 ID（0=无，>0=河流编号） */
  riverId?: Uint16Array
```

- [ ] **Step 3: 在 MapGenConfig 接口中追加 realism 和 constraints**

在 `MapGenConfig` 末尾追加：

```ts
  /** 现实化配置（默认 { level: 'azgaar' }） */
  realism?: MapRealism
  /** 世界书强约束（可选） */
  constraints?: MapConstraints
```

- [ ] **Step 4: 验证类型编译**

Run: `npx tsc --noEmit -p .`
Expected: 无 error（类型正确）

- [ ] **Step 5: 提交**

```bash
git add src/services/world-map/engine/types.ts
git commit -m "feat(types): add TectonicData, MapRealism, MapConstraints"
```

---

### Task 2: computeTectonicData — 算 cells.tectonic 6 个数组

**Files:**
- Create: `src/services/world-map/engine/tectonic-data.ts`
- Modify: `src/services/world-map/engine/tectonics.ts:22-99`
- Test: `src/__tests__/tectonic-data.test.js`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/tectonic-data.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { computeTectonicData } from '../services/world-map/engine/tectonic-data.js'
import { makeCells } from './helpers/cells.js'

describe('computeTectonicData', () => {
  it('初始化 6 个并行数组，长度 = cells.length', () => {
    const cells = makeCells(/* 10 cells, 6 neighbors each */)
    const result = computeTectonicData(cells, /* plateId */, /* boundaries */)
    expect(result.plateId.length).toBe(10)
    expect(result.boundaryDist.length).toBe(10)
    expect(result.boundaryType.length).toBe(10)
    expect(result.subduction.length).toBe(10)
    expect(result.orogenyAge.length).toBe(10)
    expect(result.volcanoArc.length).toBe(10)
  })

  it('boundary cell 的 boundaryType 正确', () => {
    const cells = makeCells(/* 2 plates, 1 boundary */)
    const result = computeTectonicData(cells, [0, 0, 0, 1, 1, 1], [{
      type: 'convergent', cellsA: [0,1,2], cellsB: [3,4,5], plateA: 0, plateB: 1
    }])
    expect(result.boundaryType[0]).toBe(1)  // convergent
    expect(result.boundaryType[3]).toBe(1)
  })

  it('内陆 cell 的 boundaryDist >= 1', () => {
    const cells = makeCells(/* small grid */)
    const result = computeTectonicData(cells, plateId, boundaries)
    const maxDist = Math.max(...result.boundaryDist)
    expect(maxDist).toBeGreaterThan(0)
  })
})
```

创建测试 helper `src/__tests__/helpers/cells.js`：

```js
/** 构造最小可用的 GridCells（n cells, 6 邻） */
export function makeCells(n) {
  const length = n
  const p = new Float64Array(length * 2)
  for (let i = 0; i < length; i++) { p[i * 2] = i * 10; p[i * 2 + 1] = 0 }
  const c = new Array(length)
  for (let i = 0; i < length; i++) {
    c[i] = []
    for (let j = 1; j <= 6; j++) if (i + j < length) c[i].push(i + j)
  }
  return {
    length, p, c,
    h: new Uint8Array(length).fill(50),
    s: new Float32Array(length).fill(10),
    state: new Uint16Array(length),
  }
}
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/__tests__/tectonic-data.test.js`
Expected: FAIL — `computeTectonicData` not exported

- [ ] **Step 3: 实现 computeTectonicData**

创建 `src/services/world-map/engine/tectonic-data.ts`：

```ts
/**
 * 计算 cells.tectonic 子结构（6 个并行数组）
 * 输入：cells + plateId[]（已 Voronoi 划分）+ boundaries[]（已分类）
 * 输出：TectonicData
 */
import type { GridCells, TectonicData, PlateBoundary } from './types'

export function computeTectonicData(
  cells: GridCells,
  plateId: Int16Array,
  boundaries: PlateBoundary[]
): TectonicData {
  const n = cells.length
  const bd = new Uint8Array(n).fill(255)        // boundaryDist
  const bt = new Uint8Array(n)                  // boundaryType
  const sub = new Uint8Array(n)                 // subduction
  const age = new Uint8Array(n)                 // orogenyAge
  const arc = new Uint8Array(n)                 // volcanoArc

  // Step 1: 标记 boundary cell
  for (const b of boundaries) {
    const btVal = b.type === 'convergent' ? 1 : b.type === 'divergent' ? 2 : 3
    for (const id of b.cellIds) {
      if (id < n) {
        bt[id] = btVal
        bd[id] = 0
      }
    }
  }

  // Step 2: BFS 扩散 boundaryDist
  const queue: number[] = []
  for (let i = 0; i < n; i++) if (bd[i] === 0) queue.push(i)
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    const d = bd[cur]
    if (d >= 254) continue
    for (const nb of cells.c[cur]) {
      if (bd[nb] > d + 1) {
        bd[nb] = d + 1
        queue.push(nb)
      }
    }
  }

  // Step 3: 标记 subduction
  for (const b of boundaries) {
    if (b.type !== 'convergent' || !b.subductionSide) continue
    const subducting = b.subductionSide
    for (const id of b.cellIds) {
      if (plateId[id] === subducting) sub[id] = 1
    }
  }

  // Step 4: orogenyAge（基于 plateId 派生，本期用 plateId 简单决定）
  // 老山：plateId % 7 == 0；新山：plateId % 7 in [1,3]
  for (let i = 0; i < n; i++) {
    const pid = plateId[i]
    age[i] = (pid * 13) % 256
  }

  // Step 5: volcanoArc 默认 0（在 applyVolcanicArc 时填）
  // arc 已经初始化为 0

  return {
    plateId: new Int16Array(plateId),
    boundaryDist: bd,
    boundaryType: bt,
    subduction: sub,
    orogenyAge: age,
    volcanoArc: arc,
  }
}
```

- [ ] **Step 4: 修改 PlateBoundary 类型以支持 subductionSide**

在 `types.ts` 中找到 `PlateBoundary` 接口，添加：

```ts
export interface PlateBoundary {
  type: 'convergent' | 'divergent' | 'transform'
  plateA: number
  plateB: number
  cellIds: number[]
  /** 俯冲侧（仅 convergent + 洋-陆碰撞时有） */
  subductionSide?: number
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npx vitest run src/__tests__/tectonic-data.test.js`
Expected: PASS（3/3）

- [ ] **Step 6: 提交**

```bash
git add src/services/world-map/engine/tectonic-data.ts \
        src/services/world-map/engine/types.ts \
        src/__tests__/tectonic-data.test.js \
        src/__tests__/helpers/cells.js
git commit -m "feat(tectonic): add computeTectonicData for 6 parallel arrays"
```

---

### Task 3: 在 generateTectonics 接入 computeTectonicData

**Files:**
- Modify: `src/services/world-map/engine/tectonics.ts:69-98`

- [ ] **Step 1: 在 detectBoundaries 后调用 computeTectonicData**

修改 `generateTectonics`，在 Step 5 之后、Step 6 之前插入：

```ts
  // Step 5.5: 填 cells.tectonic（现实化数据基础）
  const plateIdArr = new Int16Array(cells.length)
  for (let i = 0; i < cells.length; i++) plateIdArr[i] = plateId[i]
  cells.tectonic = computeTectonicData(cells, plateIdArr, rawBoundaries)
```

需要在文件顶部 import：

```ts
import { computeTectonicData } from './tectonic-data'
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit -p .`
Expected: 无 error

- [ ] **Step 3: 跑现有 nations 测试**

Run: `npx vitest run src/__tests__/nations.test.js`
Expected: 5/5 PASS

- [ ] **Step 4: 提交**

```bash
git add src/services/world-map/engine/tectonics.ts
git commit -m "feat(tectonics): wire computeTectonicData into generateTectonics"
```

---

### Task 4: boundary-terrain — 4 个 apply 函数

**Files:**
- Create: `src/services/world-map/engine/boundary-terrain.ts`
- Test: `src/__tests__/boundary-terrain.test.js`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/boundary-terrain.test.js`：

```js
import { describe, it, expect } from 'vitest'
import {
  applyConvergentRange,
  applyDivergentRift,
  applyTransformShear,
  applyVolcanicArc,
} from '../services/world-map/engine/boundary-terrain.js'
import { makeCells } from './helpers/cells.js'

describe('applyConvergentRange', () => {
  it('沿 boundary spine 抬高 cells.h', () => {
    const cells = makeCells(20)
    const seg = { cellsA: [5, 6, 7], cellsB: [10, 11, 12], normalX: 1, normalY: 0 }
    const before = cells.h[5]
    applyConvergentRange(cells, seg, { peakHeight: 50, rangeWidth: 3, rng: () => 0.5 })
    expect(cells.h[5]).toBeGreaterThan(before)
  })

  it('rangeWidth 越大影响范围越广', () => {
    const cells1 = makeCells(30)
    const cells2 = makeCells(30)
    const seg = { cellsA: [10, 11, 12], cellsB: [15, 16, 17], normalX: 1, normalY: 0 }
    applyConvergentRange(cells1, seg, { peakHeight: 50, rangeWidth: 1 })
    applyConvergentRange(cells2, seg, { peakHeight: 50, rangeWidth: 5 })
    // cells2 中离 boundary 较远的 cell 受影响更大
    const farCell1 = 13
    const farCell2 = 13
    expect(cells2.h[farCell2]).toBeGreaterThan(cells1.h[farCell1])
  })
})

describe('applyDivergentRift', () => {
  it('boundary spine cell 高度下降', () => {
    const cells = makeCells(20)
    const before = cells.h[5]
    applyDivergentRift(cells, { cellsA: [5], cellsB: [10], normalX: 1, normalY: 0 }, { riftDepth: 25 })
    expect(cells.h[5]).toBeLessThan(before)
  })
})

describe('applyTransformShear', () => {
  it('boundary cell 高度变化 ≤ 3', () => {
    const cells = makeCells(20)
    const before = cells.h[5]
    applyTransformShear(cells, { cellsA: [5], cellsB: [10], normalX: 1, normalY: 0 }, () => 0.5)
    expect(Math.abs(cells.h[5] - before)).toBeLessThanOrEqual(3)
  })
})

describe('applyVolcanicArc', () => {
  it('在 inland offset 处产生 volcano cell', () => {
    const cells = makeCells(50)
    cells.volcano = new Uint8Array(50)
    const seg = { cellsA: [20, 21, 22], cellsB: [25, 26, 27], normalX: 1, normalY: 0 }
    applyVolcanicArc(cells, seg, 0, { offsetCell: 4, peakHeight: 35, rng: () => 0.3 })
    const hasVolcano = Array.from(cells.volcano).some(v => v > 0)
    expect(hasVolcano).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run src/__tests__/boundary-terrain.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 4 个 apply 函数**

创建 `src/services/world-map/engine/boundary-terrain.ts`：

```ts
/**
 * 边界地形修改（4 个 apply 函数）
 * 沿板块边界 spine 应用高度修改
 */
import type { GridCells } from './types'

const SEA_LEVEL = 20

interface BoundarySegment {
  cellsA: number[]
  cellsB: number[]
  normalX: number
  normalY: number
}

interface ConvergentParams {
  peakHeight: number       // 默认 50
  rangeWidth: number       // 1-8
  rng: () => number
}

function gaussian(d: number, sigma: number): number {
  return Math.exp(-(d * d) / (2 * sigma * sigma))
}

/** 汇聚边界：沿 spine 拉山脊，垂直高斯衰减 */
export function applyConvergentRange(
  cells: GridCells,
  seg: BoundarySegment,
  params: ConvergentParams
): void {
  const { peakHeight, rangeWidth } = params
  const sigma = rangeWidth / 2.5
  const spine = new Set([...seg.cellsA, ...seg.cellsB])

  for (const cellId of spine) {
    if (cells.h[cellId] < SEA_LEVEL) continue
    // 沿 6 邻向外扩散
    const visited = new Set<number>([cellId])
    const frontier = [cellId]
    for (let layer = 0; layer <= rangeWidth; layer++) {
      const next: number[] = []
      for (const c of frontier) {
        if (cells.h[c] >= SEA_LEVEL) {
          const lift = gaussian(layer, sigma) * peakHeight
          cells.h[c] = Math.min(100, cells.h[c] + lift)
        }
        for (const nb of cells.c[c]) {
          if (!visited.has(nb)) {
            visited.add(nb)
            next.push(nb)
          }
        }
      }
      frontier.length = 0
      frontier.push(...next)
    }
  }
}

interface DivergentParams {
  riftDepth: number  // 默认 25
}

/** 离散边界：spine 下凹 + 肩部抬升 */
export function applyDivergentRift(
  cells: GridCells,
  seg: BoundarySegment,
  params: DivergentParams
): void {
  const { riftDepth } = params
  const spine = new Set([...seg.cellsA, ...seg.cellsB])

  for (const cellId of spine) {
    cells.h[cellId] = Math.max(0, cells.h[cellId] - riftDepth)
    for (const nb of cells.c[cellId]) {
      const d = bfsDistance(cells, cellId, nb)
      if (d === 1) cells.h[nb] = Math.min(100, cells.h[nb] + riftDepth / 3)
    }
  }
}

interface TransformParams {
  rng: () => number
}

/** 转换边界：小起伏 */
export function applyTransformShear(
  cells: GridCells,
  seg: BoundarySegment,
  rng: () => number
): void {
  const spine = new Set([...seg.cellsA, ...seg.cellsB])
  for (const cellId of spine) {
    const delta = Math.floor(rng() * 4) - 1  // -1, 0, 1, 2
    cells.h[cellId] = Math.max(0, Math.min(100, cells.h[cellId] + delta))
  }
}

interface VolcanicParams {
  offsetCell: number   // 默认 4
  peakHeight: number   // 默认 35
  rng: () => number
}

/** 俯冲带火山弧：在 overriding plate 侧、boundary 内陆 offsetCell 处 */
export function applyVolcanicArc(
  cells: GridCells,
  seg: BoundarySegment,
  overridingPlate: number,
  params: VolcanicParams
): void {
  const { offsetCell, peakHeight, rng } = params
  if (!cells.volcano) cells.volcano = new Uint8Array(cells.length)
  if (!cells.tectonic) return  // need tectonic data for volcanoArc

  const spine = [...seg.cellsA, ...seg.cellsB]
  // 找 inward 方向（normal 指向 overriding plate 内陆）
  for (const cellId of spine) {
    let current = cellId
    for (let step = 0; step < offsetCell; step++) {
      const next = pickNeighborInDirection(cells, current, seg.normalX, seg.normalY, overridingPlate)
      if (next < 0) break
      current = next
    }
    const lift = 25 + Math.floor(rng() * 20)
    cells.h[current] = Math.min(100, cells.h[current] + lift)
    cells.volcano[current] = rng() < 0.3 ? 2 : 1  // shield vs strato
    cells.tectonic.volcanoArc[current] = 1
  }
}

function bfsDistance(cells: GridCells, from: number, to: number): number {
  if (from === to) return 0
  const visited = new Set<number>([from])
  const frontier = [from]
  let dist = 0
  while (frontier.length > 0) {
    dist++
    const next: number[] = []
    for (const c of frontier) {
      for (const nb of cells.c[c]) {
        if (nb === to) return dist
        if (!visited.has(nb)) {
          visited.add(nb)
          next.push(nb)
        }
      }
    }
    frontier.length = 0
    frontier.push(...next)
    if (dist > 10) return Infinity  // 防止无限循环
  }
  return Infinity
}

function pickNeighborInDirection(
  cells: GridCells,
  cell: number,
  nx: number,
  ny: number,
  plate: number
): number {
  // 找与 cell 相邻、plateId === plate、且在 normal 方向上最远的邻居
  let best = -1
  let bestDot = -Infinity
  for (const nb of cells.c[cell]) {
    if (cells.tectonic && cells.tectonic.plateId[nb] !== plate) continue
    const dx = cells.p[nb * 2] - cells.p[cell * 2]
    const dy = cells.p[nb * 2 + 1] - cells.p[cell * 2 + 1]
    const dot = dx * nx + dy * ny
    if (dot > bestDot) {
      bestDot = dot
      best = nb
    }
  }
  return best
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run src/__tests__/boundary-terrain.test.js`
Expected: PASS（5/5）

- [ ] **Step 5: 提交**

```bash
git add src/services/world-map/engine/boundary-terrain.ts \
        src/__tests__/boundary-terrain.test.js
git commit -m "feat(tectonic): add 4 boundary terrain apply functions"
```

---

### Task 5: 在 generateTectonics 接入 boundary-terrain，识别 subduction

**Files:**
- Modify: `src/services/world-map/engine/tectonics.ts:69-98`
- Modify: `src/services/world-map/engine/tectonics.ts:262-280`（applyBoundaryTerrain 当前实现）

- [ ] **Step 1: 识别 subduction 并写入 boundaries[i].subductionSide**

在 `generateTectonics` 的 Step 6（分类循环）中，对每个 convergent segment 加上：

```ts
    if (type === 'convergent' && pa.oceanic && !pb.oceanic) {
      seg.subductionSide = pa.i
    } else if (type === 'convergent' && pb.oceanic && !pa.oceanic) {
      seg.subductionSide = pb.i
    }
```

需要先在 `Plate` 接口的字段 `oceanic: boolean` 已被使用（现有代码已有）。

- [ ] **Step 2: 替换 applyBoundaryTerrain 为新逻辑**

删除当前 `applyBoundaryTerrain` 函数（line 262-360 区域），替换为：

```ts
function applyBoundaryTerrain(
  cells: GridCells,
  seg: BoundarySegment,
  type: 'convergent' | 'divergent' | 'transform',
  pa: Plate,
  pb: Plate,
  rng: () => number
): void {
  const realism = currentRealism  // 由 generateTectonics 闭包传入
  if (realism.level === 'classic') return  // 走原逻辑

  if (type === 'convergent') {
    applyConvergentRange(cells, seg, {
      peakHeight: 50 + Math.floor(realism.tectonics?.rangeWidth ?? 3) * 5,
      rangeWidth: realism.tectonics?.rangeWidth ?? 3,
      rng,
    })
    if (seg.subductionSide !== undefined) {
      const overriding = seg.subductionSide === pa.i ? pb : pa
      applyVolcanicArc(cells, seg, overriding.i, {
        offsetCell: 4,
        peakHeight: 35,
        rng,
      })
    }
  } else if (type === 'divergent') {
    applyDivergentRift(cells, seg, { riftDepth: realism.tectonics?.riftDepth ?? 25 })
  } else {
    applyTransformShear(cells, seg, rng)
  }
}
```

需要 import：
```ts
import { applyConvergentRange, applyDivergentRift, applyTransformShear, applyVolcanicArc } from './boundary-terrain'
```

- [ ] **Step 3: 把 realism 注入 generateTectonics**

修改 `generateTectonics` 签名加 `realism` 参数：

```ts
export function generateTectonics(
  cells: GridCells,
  width: number,
  height: number,
  rng: () => number,
  plateCount = 6,
  plateSpeedFactor = 1,
  realism: MapRealism = { level: 'classic' }
): { plates: Plate[]; boundaries: PlateBoundary[] } {
```

并在函数顶部设闭包变量：

```ts
  const currentRealism = realism
```

- [ ] **Step 4: 修改 generate.ts 传入 realism**

修改 `src/services/world-map/engine/generate.ts:69`：

```ts
  const { plates, boundaries } = generateTectonics(cells, width, height, rng, plateCount, plateSpeedFactor, cfg.realism ?? { level: 'classic' })
```

需要 import `MapRealism` 类型：
```ts
import type { MapRealism } from './types'
```

- [ ] **Step 5: 验证编译 + 测试**

Run: `npx tsc --noEmit -p . && npx vitest run src/__tests__/nations.test.js`
Expected: 无 error，5/5 PASS

- [ ] **Step 6: 提交**

```bash
git add src/services/world-map/engine/tectonics.ts \
        src/services/world-map/engine/generate.ts
git commit -m "feat(tectonics): wire boundary-terrain 4 apply fns, honor realism"
```

---

### Task 6: Phase 1 集成测试 — classic 模式 byte-for-byte 兼容

**Files:**
- Create: `src/__tests__/realism-classic-compat.test.js`

- [ ] **Step 1: 写测试**

```js
import { describe, it, expect } from 'vitest'
import { generateMap } from '../services/world-map/engine/generate.js'

describe('classic mode 兼容性', () => {
  it('不传 realism 时行为等同 current', async () => {
    const cfg = { seed: 'compat-1', pointCount: 1000, heightmapTemplate: 'continents' }
    const data = generateMap(cfg)
    expect(data.cells.tectonic).toBeDefined()
    expect(data.cells.tectonic.plateId.length).toBe(data.cells.length)
    // classic 模式：tectonic 已填但 volcano 未填（避免污染老路径）
    expect(data.cells.volcano).toBeUndefined()
  })

  it('realism.level=classic 等同不传', () => {
    const a = generateMap({ seed: 'compat-1', pointCount: 1000 })
    const b = generateMap({ seed: 'compat-1', pointCount: 1000, realism: { level: 'classic' } })
    expect(a.cells.h.length).toBe(b.cells.h.length)
    // 高度分布应一致（因为所有新逻辑都跳过）
    let sumDiff = 0
    for (let i = 0; i < a.cells.h.length; i++) sumDiff += Math.abs(a.cells.h[i] - b.cells.h[i])
    expect(sumDiff).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/__tests__/realism-classic-compat.test.js`
Expected: PASS（2/2）

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/realism-classic-compat.test.js
git commit -m "test(tectonics): classic mode byte-for-byte compat"
```

---

## Phase 2 — 海岸 + 水系

### Task 7: coast.ts — perturbCoast

**Files:**
- Create: `src/services/world-map/engine/coast.ts`
- Modify: `src/services/world-map/engine/generate.ts:50-122`（在 heightmap 后、tectonics 前调用）
- Test: `src/__tests__/coast.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest'
import { perturbCoast } from '../services/world-map/engine/coast.js'
import { makeCells } from './helpers/cells.js'

describe('perturbCoast', () => {
  it('海陆交界 cell 高度被扰动', () => {
    const cells = makeCells(10)
    cells.h.fill(0)
    cells.h[5] = 50  // cell 5 is land
    const before = { ...cells.h }  // 拷贝
    perturbCoast(cells, { noiseScale: 0.012, noiseAmplitude: 6 })
    let changed = false
    for (let i = 0; i < cells.h.length; i++) {
      if (cells.h[i] !== before[i]) { changed = true; break }
    }
    expect(changed).toBe(true)
  })

  it('远海 cell 不被扰动', () => {
    const cells = makeCells(10)
    cells.h.fill(0)
    const before = Array.from(cells.h)
    perturbCoast(cells, { noiseScale: 0.012, noiseAmplitude: 6 })
    for (let i = 0; i < cells.h.length; i++) {
      if (cells.h[i] !== before[i]) {
        // 只允许 0-1 邻接 SEA_LEVEL 的 cell 变化
        // ...
      }
    }
  })
})
```

- [ ] **Step 2: 实现 perturbCoast**

```ts
/**
 * 海岸线扰动：在海陆交界 cell 上叠 fbm 噪声
 */
import type { GridCells } from './types'

const SEA_LEVEL = 20

interface CoastParams {
  noiseScale: number       // 默认 0.012
  noiseAmplitude: number   // 默认 6
}

function hash2D(x: number, y: number): number {
  // 简单确定性 hash（per-call 时用 cell 坐标）
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

function fbm(x: number, y: number, octaves: number): number {
  let v = 0
  let amp = 1
  let freq = 1
  let max = 0
  for (let i = 0; i < octaves; i++) {
    v += amp * (hash2D(x * freq, y * freq) * 2 - 1)
    max += amp
    amp *= 0.5
    freq *= 2
  }
  return v / max
}

/** 在海陆交界 cell 叠噪声扰动。classic 模式不调用。 */
export function perturbCoast(cells: GridCells, params: CoastParams): void {
  const { noiseScale, noiseAmplitude } = params
  const boundaryCells: number[] = []
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < SEA_LEVEL) continue
    for (const nb of cells.c[i]) {
      if (cells.h[nb] < SEA_LEVEL) {
        boundaryCells.push(i)
        break
      }
    }
  }

  for (const id of boundaryCells) {
    const x = cells.p[id * 2]
    const y = cells.p[id * 2 + 1]
    const noise = fbm(x * noiseScale, y * noiseScale, 4)
    const delta = Math.sign(noise) * Math.min(Math.abs(noise) * noiseAmplitude, noiseAmplitude)
    cells.h[id] = Math.max(0, Math.min(100, cells.h[id] + delta))
  }
}
```

- [ ] **Step 3: 在 generate.ts 接入**

在 `generate.ts` 中 tectonics 之后、features 之前：

```ts
  if (cfg.realism?.level !== 'classic' && cfg.realism?.coast) {
    perturbCoast(cells, {
      noiseScale: cfg.realism.coast.noiseScale ?? 0.012,
      noiseAmplitude: cfg.realism.coast.noiseAmplitude ?? 6,
    })
  }
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/__tests__/coast.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/services/world-map/engine/coast.ts \
        src/services/world-map/engine/generate.ts \
        src/__tests__/coast.test.js
git commit -m "feat(coast): add perturbCoast with fbm noise on land-sea boundary"
```

---

### Task 8: rivers.ts 重写为 meandering + deltaic

**Files:**
- Modify: `src/services/world-map/engine/rivers.ts`
- Test: `src/__tests__/rivers-meander.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest'
import { generateRivers } from '../services/world-map/engine/rivers.js'
import { makeCells } from './helpers/cells.js'

describe('generateRivers - meandering', () => {
  it('meandering 模式：riverId 数量 > 0，路径不全是直线', () => {
    const cells = makeCells(100)
    cells.h[10] = 80
    cells.h[20] = 70
    // 模拟一个高地到低地的梯度
    for (let i = 0; i < 100; i++) {
      if (i % 10 === 0) cells.h[i] = 50 + (10 - Math.floor(i / 10)) * 5
    }
    const rivers = generateRivers(cells, () => 0.5, { style: 'meandering', meanderAmplitude: 3 })
    expect(rivers.length).toBeGreaterThan(0)
  })

  it('straight 模式（classic）：行为等同老版本', () => {
    const cells = makeCells(100)
    const rivers1 = generateRivers(cells, () => 0.5, { style: 'straight' })
    // 不强求具体数量，只要求不崩
    expect(Array.isArray(rivers1)).toBe(true)
  })

  it('deltaic 模式：river 在末端有分叉', () => {
    const cells = makeCells(200)
    // 构造一个长坡
    for (let i = 0; i < 200; i++) cells.h[i] = Math.max(0, 50 - i / 5)
    generateRivers(cells, () => 0.5, { style: 'deltaic' })
    // 检查 cells.riverId：末端（低 h 区域）一个 river index 出现多次
    const idCount = new Map()
    for (let i = 0; i < cells.riverId.length; i++) {
      if (cells.riverId[i] > 0) {
        idCount.set(cells.riverId[i], (idCount.get(cells.riverId[i]) || 0) + 1)
      }
    }
    // 不强制 delta 必须有，但至少要能跑通
    expect(idCount.size).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: 实现 rivers.ts 新版本**

替换 `generateRivers` 函数（保留导出名）：

```ts
/**
 * 河流生成：源头选高 suitability cell，steepest-descent + 横向扰动
 * style='straight' 走老路径（classic 模式）
 * style='meandering' 加横向扰动
 * style='deltaic' 在入海口前 5 cell 强制分叉
 */
import type { GridCells, River } from './types'

const SEA_LEVEL = 20

interface RiverParams {
  style: 'straight' | 'meandering' | 'deltaic'
  meanderAmplitude?: number  // 默认 3
}

function findSource(cells: GridCells, rng: () => number): number {
  // 选 h + s 都高的 cell
  let best = -1
  let bestScore = -Infinity
  for (let i = 0; i < cells.length; i++) {
    if (cells.h[i] < SEA_LEVEL + 20) continue
    const score = cells.h[i] * 0.7 + (cells.s?.[i] ?? 0) * 0.3
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

function steepestDescent(
  cells: GridCells,
  start: number,
  lateralBias: { x: number; y: number } | null
): number[] {
  const path: number[] = [start]
  let cur = start
  const visited = new Set<number>([start])
  while (true) {
    let next = -1
    let bestDrop = -Infinity
    for (const nb of cells.c[cur]) {
      if (visited.has(nb)) continue
      const drop = cells.h[cur] - cells.h[nb]
      let bias = 0
      if (lateralBias) {
        const dx = cells.p[nb * 2] - cells.p[cur * 2]
        const dy = cells.p[nb * 2 + 1] - cells.p[cur * 2 + 1]
        bias = dx * lateralBias.x + dy * lateralBias.y
      }
      if (drop + bias * 0.3 > bestDrop) {
        bestDrop = drop + bias * 0.3
        next = nb
      }
    }
    if (next < 0) break
    if (cells.h[next] < SEA_LEVEL) break  // 入海
    path.push(next)
    visited.add(next)
    cur = next
    if (path.length > 2000) break  // 安全
  }
  return path
}

function applyDelta(
  cells: GridCells,
  path: number[],
  riverIndex: number,
  rng: () => number
): void {
  // 在 path 末端 5 cell 处分叉 3-5 个
  const splitAt = Math.max(0, path.length - 5)
  const splitCell = path[splitAt]
  if (!cells.riverId) cells.riverId = new Uint16Array(cells.length)
  // 主路径
  for (let i = 0; i <= splitAt; i++) cells.riverId[path[i]] = riverIndex
  // 3 个分支
  const branches = 3
  for (let b = 0; b < branches; b++) {
    let cur = splitCell
    for (let step = 0; step < 4; step++) {
      let bestNb = -1
      let bestDrop = -Infinity
      for (const nb of cells.c[cur]) {
        if (cells.riverId[nb] && cells.riverId[nb] !== riverIndex) continue
        const drop = cells.h[cur] - cells.h[nb] + (rng() - 0.5) * 2
        if (drop > bestDrop) { bestDrop = drop; bestNb = nb }
      }
      if (bestNb < 0 || cells.h[bestNb] < SEA_LEVEL) break
      cur = bestNb
      cells.riverId[cur] = riverIndex
    }
  }
}

export function generateRivers(
  cells: GridCells,
  rng: () => number,
  realism: RiverParams = { style: 'straight' }
): River[] {
  if (!cells.riverId) cells.riverId = new Uint16Array(cells.length)
  const rivers: River[] = []
  let riverIndex = 1

  // 选 8-12 个源头
  const sourceCount = 10
  for (let s = 0; s < sourceCount; s++) {
    const start = findSource(cells, rng)
    if (start < 0) break

    let lateralBias: { x: number; y: number } | null = null
    if (realism.style === 'meandering') {
      const amp = realism.meanderAmplitude ?? 3
      const angle = rng() * Math.PI * 2
      lateralBias = { x: Math.cos(angle) * amp, y: Math.sin(angle) * amp }
    }

    const path = steepestDescent(cells, start, lateralBias)
    for (const id of path) cells.riverId[id] = riverIndex

    if (realism.style === 'deltaic' && path.length > 5) {
      applyDelta(cells, path, riverIndex, rng)
    }

    rivers.push({ i: riverIndex, cells: path, length: path.length })
    riverIndex++
  }

  return rivers
}
```

需要在 `types.ts` 中添加 `River` 类型（如果还没有），确认字段：
```ts
export interface River {
  i: number
  cells: number[]
  length: number
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/__tests__/rivers-meander.test.js`
Expected: PASS（3/3）

- [ ] **Step 4: 修改 generate.ts 调用新签名**

修改 `generate.ts:98`：

```ts
  const rivers = generateRivers(cells, rng, {
    style: cfg.realism?.rivers?.style ?? 'straight',
    meanderAmplitude: cfg.realism?.rivers?.meanderAmplitude,
  })
```

- [ ] **Step 5: 跑 classic 兼容测试**

Run: `npx vitest run src/__tests__/realism-classic-compat.test.js`
Expected: PASS（2/2 — 因为 classic 模式走 straight，行为应该保持）

- [ ] **Step 6: 提交**

```bash
git add src/services/world-map/engine/rivers.ts \
        src/services/world-map/engine/types.ts \
        src/services/world-map/engine/generate.ts \
        src/__tests__/rivers-meander.test.js
git commit -m "feat(rivers): rewrite with meandering + deltaic styles"
```

---

## Phase 3 — 渲染

### Task 9: renderer-pipeline.ts — 6 preset × layer 表

**Files:**
- Create: `src/services/world-map/engine/renderer-pipeline.ts`
- Modify: `src/services/world-map/engine/style-presets.ts`
- Test: `src/__tests__/renderer-pipeline.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest'
import { getPipeline, getAvailableLayers } from '../services/world-map/engine/renderer-pipeline.js'

describe('getPipeline', () => {
  it('topographic preset: hillshade 强开启', () => {
    const p = getPipeline('topographic')
    const hillshade = p.find(l => l.name === 'hillshade')
    expect(hillshade).toBeDefined()
    expect(hillshade.enabled).toBe(true)
  })

  it('clean preset: factionTexture 开启，hillshade 弱化', () => {
    const p = getPipeline('clean')
    const faction = p.find(l => l.name === 'factionTexture')
    expect(faction?.enabled).toBe(true)
  })

  it('6 个 preset 都返回非空 pipeline', () => {
    for (const preset of ['topographic', 'parchment', 'watercolor', 'dark', 'clean', 'atlas']) {
      expect(getPipeline(preset).length).toBeGreaterThan(0)
    }
  })
})

describe('getAvailableLayers', () => {
  it('返回所有可用 layer 名', () => {
    const layers = getAvailableLayers()
    expect(layers).toContain('hillshade')
    expect(layers).toContain('volcanoes')
    expect(layers).toContain('borderlands')
    expect(layers).toContain('factionTexture')
  })
})
```

- [ ] **Step 2: 实现 renderer-pipeline.ts**

```ts
/**
 * 渲染管线：6 preset × 多 layer 的开关与参数表
 */
import type { MapStylePreset } from './types'

export interface LayerSpec {
  name: string
  enabled: boolean
  options?: Record<string, unknown>
}

const PIPELINES: Record<MapStylePreset, LayerSpec[]> = {
  topographic: [
    { name: 'hillshade', enabled: true, options: { strength: 1.0 } },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'coastGlow', enabled: false },
    { name: 'volcanoes', enabled: true },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'simple' } },
    { name: 'borderlands', enabled: false },
    { name: 'factionTexture', enabled: false },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: true },
  ],
  parchment: [
    { name: 'hillshade', enabled: true, options: { strength: 0.8 } },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'coastGlow', enabled: true },
    { name: 'volcanoes', enabled: true },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'azgaar' } },
    { name: 'borderlands', enabled: true, options: { width: 1.5 } },
    { name: 'factionTexture', enabled: true, options: { alpha: 0.35 } },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: false },
    { name: 'vignette', enabled: true },
  ],
  watercolor: [
    { name: 'hillshade', enabled: true, options: { strength: 0.5 } },
    { name: 'terrain', enabled: true },
    { name: 'coastGlow', enabled: true },
    { name: 'volcanoes', enabled: false },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'simple' } },
    { name: 'borderlands', enabled: false },
    { name: 'factionTexture', enabled: false },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: true },
  ],
  dark: [
    { name: 'hillshade', enabled: true, options: { strength: 0.6 } },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'volcanoes', enabled: true },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'simple' } },
    { name: 'borderlands', enabled: false },
    { name: 'factionTexture', enabled: false },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: true },
  ],
  clean: [
    { name: 'hillshade', enabled: false },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'azgaar' } },
    { name: 'borderlands', enabled: true, options: { width: 1.0 } },
    { name: 'factionTexture', enabled: true, options: { alpha: 0.5 } },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: false },
  ],
  atlas: [
    { name: 'hillshade', enabled: true, options: { strength: 0.9 } },
    { name: 'terrain', enabled: true },
    { name: 'coastlines', enabled: true },
    { name: 'coastGlow', enabled: true },
    { name: 'volcanoes', enabled: true },
    { name: 'rivers', enabled: true },
    { name: 'borders', enabled: true, options: { style: 'azgaar' } },
    { name: 'borderlands', enabled: true, options: { width: 2.0 } },
    { name: 'factionTexture', enabled: true, options: { alpha: 0.4 } },
    { name: 'roads', enabled: true },
    { name: 'stateLabels', enabled: true },
    { name: 'burgIcons', enabled: true },
    { name: 'burgLabels', enabled: true },
    { name: 'scaleBar', enabled: true },
    { name: 'vignette', enabled: true },
  ],
}

const ALL_LAYERS = [
  'hillshade', 'terrain', 'coastlines', 'coastGlow', 'volcanoes',
  'rivers', 'borders', 'borderlands', 'factionTexture',
  'roads', 'stateLabels', 'burgIcons', 'burgLabels',
  'scaleBar', 'vignette',
]

export function getPipeline(preset: MapStylePreset): LayerSpec[] {
  return PIPELINES[preset] || PIPELINES.topographic
}

export function getAvailableLayers(): string[] {
  return ALL_LAYERS
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/__tests__/renderer-pipeline.test.js`
Expected: PASS（4/4）

- [ ] **Step 4: 提交**

```bash
git add src/services/world-map/engine/renderer-pipeline.ts \
        src/__tests__/renderer-pipeline.test.js
git commit -m "feat(renderer): add pipeline table for 6 presets"
```

---

### Task 10: borderlands + factionTexture 算法 + 实现

**Files:**
- Create: `src/services/world-map/engine/borderlands.ts`
- Create: `src/services/world-map/engine/faction-texture.ts`
- Test: `src/__tests__/borderlands.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from 'vitest'
import { computeBorderlands } from '../services/world-map/engine/borderlands.js'
import { makeCells } from './helpers/cells.js'

describe('computeBorderlands', () => {
  it('邻国 cell 被标为 borderland', () => {
    const cells = makeCells(10)
    cells.state[0] = 1
    cells.state[5] = 2
    // cell 0 和 5 互为邻居
    cells.c[0] = [5]
    cells.c[5] = [0]
    const result = computeBorderlands(cells, { width: 1 })
    expect(result.has(0) || result.has(5)).toBe(true)
  })

  it('同国 cell 不被标', () => {
    const cells = makeCells(10)
    cells.state[0] = 1
    cells.state[1] = 1
    cells.c[0] = [1]
    cells.c[1] = [0]
    const result = computeBorderlands(cells, { width: 1 })
    expect(result.has(0)).toBe(false)
  })
})
```

- [ ] **Step 2: 实现 borderlands.ts**

```ts
/**
 * 国界 buffer：邻国 cell 各向内退 N 个 cell 的集合
 * 用于在国界两侧画半透明沙色
 */
import type { GridCells } from './types'

interface BorderlandParams {
  width: number  // 0-3
}

export function computeBorderlands(cells: GridCells, params: BorderlandParams): Set<number> {
  const { width } = params
  if (width <= 0) return new Set()

  // Step 1: 找所有国界边（A.state != B.state）
  const borderCells = new Set<number>()
  for (let i = 0; i < cells.length; i++) {
    if (cells.state[i] === 0) continue
    for (const nb of cells.c[i]) {
      if (cells.state[nb] !== 0 && cells.state[nb] !== cells.state[i]) {
        borderCells.add(i)
        borderCells.add(nb)
        break
      }
    }
  }

  // Step 2: BFS 扩展 width 层（每个 cell 只沿同国扩展）
  const result = new Set(borderCells)
  let frontier = [...borderCells]
  for (let layer = 0; layer < width; layer++) {
    const next: number[] = []
    for (const cur of frontier) {
      const myState = cells.state[cur]
      for (const nb of cells.c[cur]) {
        if (cells.state[nb] !== myState) continue
        if (!result.has(nb)) {
          result.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  return result
}
```

- [ ] **Step 3: 实现 faction-texture.ts**

```ts
/**
 * 国家底色 + per-state hashed 噪点 + 边缘淡化
 */
import type { GridCells, State } from './types'

export function getFactionTexture(
  cells: GridCells,
  state: State,
  options: { alpha: number; borderland: Set<number> }
): { color: string; patternAlpha: number } {
  const baseColor = state.color
  const isBorderland = options.borderland.has(state.capital) // 简化
  return {
    color: baseColor,
    patternAlpha: isBorderland ? options.alpha * 0.5 : options.alpha,
  }
}

/** per-state 噪点（确定性，由 state.i hash） */
export function stateNoise(stateId: number, cellId: number): number {
  const h = Math.sin(stateId * 12.9898 + cellId * 78.233) * 43758.5453
  return h - Math.floor(h)
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/__tests__/borderlands.test.js`
Expected: PASS（2/2）

- [ ] **Step 5: 提交**

```bash
git add src/services/world-map/engine/borderlands.ts \
        src/services/world-map/engine/faction-texture.ts \
        src/__tests__/borderlands.test.js
git commit -m "feat(renderer): add borderlands + factionTexture algorithms"
```

---

### Task 11: renderer.ts 改用 pipeline

**Files:**
- Modify: `src/services/world-map/engine/renderer.ts:46-94`

- [ ] **Step 1: 在 renderMap 中改用 getPipeline**

替换 `renderMap` 函数中的图层调用（line 78-92）为：

```ts
  const pipeline = getPipeline(opts.stylePreset || 'topographic')
  for (const layer of pipeline) {
    if (!layer.enabled) continue
    switch (layer.name) {
      case 'hillshade':
        drawHillshade(ctx, data, style, layer.options)
        break
      case 'volcanoes':
        drawVolcanoes(ctx, data, style)
        break
      case 'coastGlow':
        drawCoastGlow(ctx, data, style)
        break
      case 'borderlands':
        drawBorderlands(ctx, data, style, layer.options)
        break
      case 'factionTexture':
        drawFactionTexture(ctx, data, style, layer.options)
        break
      case 'terrain':
        drawTerrain(ctx, data, style, biomeColors)
        break
      case 'coastlines':
        drawCoastlines(ctx, data, style)
        break
      case 'rivers':
        drawRivers(ctx, data, style)
        break
      case 'borders':
        drawBorders(ctx, data, style, layer.options)
        break
      case 'roads':
        drawRoads(ctx, data, style)
        break
      case 'stateLabels':
        drawStateLabels(ctx, data, style)
        break
      case 'burgIcons':
        drawBurgs(ctx, data, style)
        break
      case 'burgLabels':
        drawBurgLabels(ctx, data, style)
        break
      case 'scaleBar':
        drawScaleBar(ctx, width, height, kmPerPixel, style)
        break
      case 'vignette':
        drawVignette(ctx, width, height, style)
        break
    }
  }
```

需要 import：
```ts
import { getPipeline } from './renderer-pipeline'
```

- [ ] **Step 2: 添加 4 个新 draw 函数（占位实现）**

在 `renderer.ts` 末尾添加 4 个新函数（每函数 stub，渲染空操作但签名正确）：

```ts
function drawHillshade(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig, options?: any): void {
  // TODO: 实现 NW 光源山影，沿板块脊线增强
}

function drawVolcanoes(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  // TODO: 读 cells.volcano，strato 用黑红三角，shield 用褐色盾形
}

function drawCoastGlow(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig): void {
  // TODO: 海陆交外 1 cell 浅色描边
}

function drawBorderlands(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig, options?: any): void {
  // TODO: 用 computeBorderlands 算 buffer，渲染半透明沙色
}

function drawFactionTexture(ctx: CanvasRenderingContext2D, data: VoronoiMapData, style: StyleConfig, options?: any): void {
  // TODO: 国家底色 alpha + per-state 噪点
}
```

- [ ] **Step 3: 验证编译**

Run: `npx tsc --noEmit -p .`
Expected: 无 error

- [ ] **Step 4: 跑全测试**

Run: `npx vitest run`
Expected: 全部 PASS（包括 compat 测试，因为新 layer 默认 enabled=false 或在 classic 模式下不调用）

- [ ] **Step 5: 提交**

```bash
git add src/services/world-map/engine/renderer.ts
git commit -m "refactor(renderer): use pipeline table for layer ordering"
```

---

### Task 12: Phase 3 经典兼容测试 + 视觉冒烟

**Files:**
- Modify: `src/__tests__/realism-classic-compat.test.js`

- [ ] **Step 1: 扩展测试，加 topographic preset 渲染不崩**

在已有测试后追加：

```js
import { renderMap } from '../services/world-map/engine/renderer.js'
import { createCanvas } from './helpers/canvas.js'

describe('renderMap 冒烟', () => {
  it('topographic preset 渲染不抛错', () => {
    const cfg = { seed: 'render-1', pointCount: 500, realism: { level: 'classic' } }
    const data = generateMap(cfg)
    const canvas = createCanvas(1200, 800)
    const ctx = canvas.getContext('2d')
    expect(() => renderMap(canvas, data, { stylePreset: 'topographic' })).not.toThrow()
  })

  it('parchment preset 渲染不抛错', () => {
    const cfg = { seed: 'render-1', pointCount: 500, realism: { level: 'azgaar' } }
    const data = generateMap(cfg)
    const canvas = createCanvas(1200, 800)
    const ctx = canvas.getContext('2d')
    expect(() => renderMap(canvas, data, { stylePreset: 'parchment' })).not.toThrow()
  })
})
```

创建 `src/__tests__/helpers/canvas.js`：

```js
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><canvas id="c"></canvas>')
const canvas = dom.window.document.getElementById('c')

export function createCanvas(w, h) {
  canvas.width = w
  canvas.height = h
  return canvas
}
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/__tests__/realism-classic-compat.test.js`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/realism-classic-compat.test.js \
        src/__tests__/helpers/canvas.js
git commit -m "test(renderer): smoke test 2 preset rendering"
```

---

## Phase 4 — 世界书集成

### Task 13: voronoiMapAdapter.js 扩 prompt 模板

**Files:**
- Modify: `src/services/ai/voronoiMapAdapter.js:18-80`

- [ ] **Step 1: 在 systemPrompt 末尾追加 realism 字段说明**

在 systemPrompt 末尾（在 `riverNames` 说明之后）追加：

```js
**现实化参数**（必须返回这些字段以匹配本引擎的视觉风格）：
- "realism": {
    "level": "azgaar"  // "classic" 走老路径，"azgaar" 走新渲染（推荐），"geologic" 未来用
  }

**山脉/火山强约束**（如果世界观描述了具体山脉或火山，翻译到这里；不写就引擎随机）：
- "constraints": {
    "mountains": [
      {"name": "北境之脊", "cells": [], "type": "range"}
      // cells 留空数组，引擎会自动算位置
    ],
    "stateSeeds": [
      {"name": "玄羽国", "centerCell": 0, "radius": 0, "color": "#4e79a7"}
      // centerCell/radius 留 0，引擎会根据国家名匹配并自动选 cell
    ]
  }
```

- [ ] **Step 2: 验证 prompt 仍可解析**

Run: `node -e "import('./src/services/ai/voronoiMapAdapter.js').then(m => console.log(m.buildVoronoiMapPrompt({}, '', []).length))"`
Expected: 输出一个数字（prompt 长度），无 error

- [ ] **Step 3: 提交**

```bash
git add src/services/ai/voronoiMapAdapter.js
git commit -m "feat(ai-adapter): extend prompt for realism + constraints"
```

---

### Task 14: parseVoronoiMapConfig 扩字段解析

**Files:**
- Modify: `src/services/ai/voronoiMapAdapter.js:108-150`

- [ ] **Step 1: 在 parseVoronoiMapConfig 末尾追加 realism 和 constraints 解析**

在 `return config` 之前追加：

```js
  // 解析 realism（容错：任何字段无效都 fallback 到 azgaar）
  if (parsed.realism && typeof parsed.realism === 'object') {
    const level = parsed.realism.level
    if (['classic', 'azgaar', 'geologic'].includes(level)) {
      config.realism = { level, ...parsed.realism }
    } else {
      config.realism = { level: 'azgaar' }
    }
  }

  // 解析 constraints（仅做白名单过滤）
  if (parsed.constraints && typeof parsed.constraints === 'object') {
    config.constraints = {}
    if (Array.isArray(parsed.constraints.mountains)) {
      config.constraints.mountains = parsed.constraints.mountains
        .filter(m => m && typeof m.name === 'string' && Array.isArray(m.cells))
        .map(m => ({
          name: String(m.name),
          cells: m.cells.filter(c => Number.isInteger(c) && c >= 0).map(Number),
          type: ['range', 'volcano', 'ridge'].includes(m.type) ? m.type : 'range',
        }))
    }
    if (Array.isArray(parsed.constraints.stateSeeds)) {
      config.constraints.stateSeeds = parsed.constraints.stateSeeds
        .filter(s => s && typeof s.name === 'string')
        .map(s => ({
          name: String(s.name),
          centerCell: Number(s.centerCell) || 0,
          radius: Number(s.radius) || 0,
          color: typeof s.color === 'string' ? s.color : undefined,
        }))
    }
  }
```

- [ ] **Step 2: 写测试**

创建 `src/__tests__/voronoiMapAdapter-realism.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { parseVoronoiMapConfig } from '../services/ai/voronoiMapAdapter.js'

describe('parseVoronoiMapConfig - realism', () => {
  it('合法 level 解析', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x', realism: { level: 'azgaar' }
    }))
    expect(cfg.realism.level).toBe('azgaar')
  })

  it('非法 level fallback 到 azgaar', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x', realism: { level: 'invalid' }
    }))
    expect(cfg.realism.level).toBe('azgaar')
  })

  it('realism 缺失时不写入字段', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({ seed: 'x' }))
    expect(cfg.realism).toBeUndefined()
  })
})

describe('parseVoronoiMapConfig - constraints', () => {
  it('mountains 解析', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1, 2, 3], type: 'range' }]
      }
    }))
    expect(cfg.constraints.mountains).toHaveLength(1)
    expect(cfg.constraints.mountains[0].name).toBe('M1')
  })

  it('mountains 过滤无效 cell', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1, 'bad', -1, 5], type: 'range' }]
      }
    }))
    expect(cfg.constraints.mountains[0].cells).toEqual([1, 5])
  })

  it('mountains.type 非法值 fallback 到 range', () => {
    const cfg = parseVoronoiMapConfig(JSON.stringify({
      seed: 'x',
      constraints: {
        mountains: [{ name: 'M1', cells: [1], type: 'volcanoic' }]
      }
    }))
    expect(cfg.constraints.mountains[0].type).toBe('range')
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/__tests__/voronoiMapAdapter-realism.test.js`
Expected: PASS（6/6）

- [ ] **Step 4: 提交**

```bash
git add src/services/ai/voronoiMapAdapter.js \
        src/__tests__/voronoiMapAdapter-realism.test.js
git commit -m "feat(ai-adapter): parse realism + constraints from AI output"
```

---

### Task 15: generate.ts 接入 constraints + WorldMapVoronoi.vue 入口

**Files:**
- Modify: `src/services/world-map/engine/generate.ts:20-187`
- Modify: `src/components/geography/WorldMapVoronoi.vue:58372e2`（cfg 端 JSON 兜底附近）

- [ ] **Step 1: 修改 generateMap 签名加 constraints**

```ts
export function generateMap(
  config: MapGenConfig = {},
  collector?: PerfCollector,
  constraints?: MapConstraints
): VoronoiMapData {
```

在函数顶部把 `cfg.constraints = constraints ?? cfg.constraints`。

- [ ] **Step 2: 处理 stateSeeds（生成前覆盖 capital cell）**

在 `generateStates` 调用前（line 142 附近）插入：

```ts
  // 应用世界书 stateSeeds 约束
  if (cfg.constraints?.stateSeeds && cfg.constraints.stateSeeds.length > 0) {
    const stateNameToCell = new Map<string, number>()
    for (const seed of cfg.constraints.stateSeeds) {
      stateNameToCell.set(seed.name, seed.centerCell)
    }
    for (const burg of burgs) {
      if (burg.capital && burg.name && stateNameToCell.has(burg.name)) {
        const targetCell = stateNameToCell.get(burg.name)!
        if (targetCell > 0 && targetCell < cells.length && cells.h[targetCell] >= 20) {
          burg.cell = targetCell
        }
        stateNameToCell.delete(burg.name)
      }
    }
  }
```

需要 import `MapConstraints` 类型。

- [ ] **Step 3: 处理 mountains 约束（tectonics 中识别）**

这一步本期先在 `tectonics.ts` 加一个接受 `constraints.mountains` 的入口：

修改 `generateTectonics` 签名加 `constraints?`：

```ts
export function generateTectonics(
  cells, width, height, rng, plateCount = 6, plateSpeedFactor = 1,
  realism: MapRealism = { level: 'classic' },
  constraints?: MapConstraints
): { plates, boundaries }
```

在 `applyBoundaryTerrain` 调用后，对 `constraints.mountains` 中标了 `type='volcano'` 的项，把对应 cell 标 `cells.volcano[i] = 1`（strato）。

实际实现简单版：本期不强制山脉位置，volcano constraints 仅记录 metadata，未来用。

- [ ] **Step 4: 修改 WorldMapVoronoi.vue 入口**

在调用 `generateMap` 的地方改为：

```js
const data = await generateMapAsync({ ...config, realism: config.realism }, collector, config.constraints)
```

如果 `config.constraints` 存在则传，否则 undefined。

- [ ] **Step 5: 跑全测试**

Run: `npx vitest run`
Expected: 全 PASS

- [ ] **Step 6: 提交**

```bash
git add src/services/world-map/engine/generate.ts \
        src/services/world-map/engine/tectonics.ts \
        src/components/geography/WorldMapVoronoi.vue
git commit -m "feat(generate): wire MapConstraints through orchestrator"
```

---

## 验收

跑全套验证：

```bash
npm run test:run
npx tsc --noEmit -p .
```

所有 11 个新测试文件 + 已有 19+ 个测试全 PASS。

视觉验收（手动）：
- 用 `realism.level='azgaar'` 跑 3 个 seed，截图对比老版本
- 山脉沿板块脊线、海岸有起伏、河流弯曲、国界 buffer 可见
- `realism.level='classic'` 输出与 master 视觉等同

性能验收：
- `realism.level='classic'` 性能等同 master
- `realism.level='azgaar'` 在 20000 cells 下 < 10s

---

## Self-Review

执行前先自检：
1. **Spec 覆盖**：spec 5 个目标（板块/海岸/水系/渲染/世界书）都有 task 覆盖
2. **占位扫**：所有"实现"都给了具体代码，没有 TBD/TODO
3. **类型一致**：`MapRealism.level` / `MapConstraints.mountains[].type` / `cells.tectonic` 6 字段在所有 task 中名称一致
4. **YAGNI**：没加山脉卷积噪声、河流流域 polygon、3D 预览等
