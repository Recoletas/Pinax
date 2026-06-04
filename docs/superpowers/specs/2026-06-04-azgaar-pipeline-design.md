# Azgaar 风格地图管线重写

日期: 2026-06-04
状态: 已批准

> 取代 `2026-06-03-realistic-tectonics-rendering-design.md`（旧 spec 把 heightmap 当作"不动"的底层、在其上叠"现实化补丁"——这条路被实测证明视觉仍不像真地图）。本 spec 改为**板块是主结构、heightmap 由板块生成**，与 Azgaar 公开算法一致。

## 目标

把地图管线的 heightmap 生成从"10 个手写模板"改为 Azgaar 风格的板块驱动生成。具体：

1. **板块是源头**：`generatePlates` 选 N 个种子、Voronoi 划 plateId，每板块有 `type` / `direction` / `speed` / `oceanic` 四个属性。
2. **heightmap 从板块生成**：每板块的 base 高度 = 洋 5-15 / 陆 25-50；叠加 FBM 噪声打破板块几何；沿边界调用 4 个 `apply*` 函数（`applyConvergentRange` / `applyDivergentRift` / `applyTransformShear` / `applyVolcanicArc`）生成山脊/裂谷/断层/火山弧。
3. **删 10 个模板** + `HeightmapTemplate` 类型 + `realism.level: 'classic' | 'azgaar' | 'geologic'` 三档开关。
4. **简化 `MapRealism`**：只保留可独立调节的数值（`rivers.style`、`meanderAmplitude`、`coast.noiseScale/Amplitude`、`tectonics.rangeWidth/riftDepth`），去掉从未被读的 `political.*` / `volcanoDensity` / `headlandFreq`。
5. **修 `computeTectonicData` 的重复调用 bug**（旧 `tectonics.ts:120` 和 `:128` 各调一次，后者覆盖前者）。

## 不在本 spec 范围

- `climate.ts` / `rivers.ts` / `wind.ts` / `nations.ts` / `features.ts` 算法本身——它们已经是 Azgaar 启发式实现（纬向温度带、min-neighbor 流累积、Whittaker biome 表、Dijkstra 扩张），按 `cells.h` 的 `SEA_LEVEL = 20` 阈值读取；本次只重写 heightmap 来源，阈值不动。
- 渲染层（`renderer.ts`）——它读 `cells.h` / `cells.biome` / `cells.tectonic.*`（TODO）等，新管线产物形状兼容，渲染层不动。
- 板块时间演化（动态边界移动）—— Azgaar 也不做，瞬时分类即可。
- 热柱火山 / 弧后盆地 / 多层板块——不做。

## 管线（新顺序）

```
1.  generatePoints / buildVoronoi            (grid.ts)         — 不变
2.  generatePlates                            (tectonics.ts)    — 新：纯板块生成，不读 cells.h
3.  detectPlateBoundaries                     (tectonics.ts)    — 新：相邻 plateId → 段 + 法线 + 分类
4.  generateHeightmap                         (heightmap.ts)    — 重写：板块 base → 噪声 → 边界效果 → mask → sea-level → smooth
5.  perturbCoast                              (coast.ts)        — 不变
6.  computeTectonicData                       (tectonic-data.ts)— 填 cells.tectonic.* 6 数组（修重复调用）
7.  detectFeatures → wind → climate → rivers → biomes → nations  — 不变
```

输出形状（`VoronoiMapData.plates / .boundaries / .cells.tectonic.* / .cells.h / .cells.volcano`）与旧管线一致，渲染层无感。

## 数据模型变化

### 删除

- `types.ts::HeightmapTemplate`（10 个 string literal）
- `MapRealism.level` 字段
- `MapRealism.political` 子对象
- `MapRealism.tectonics.volcanoDensity`（已声明从未读）
- `MapRealism.coast.headlandFreq`（已声明从未读）
- `MapGenConfig.heightmapTemplate`
- `MapGenConfig.continentCount`（改由 `plateCount` 兼任；`continentCount` 暂保留为 `plateCount` 的别名以减少破坏面，下一版本移除）

### 新增 / 改动

```ts
// types.ts —— MapRealism 简化版
interface MapRealism {
  tectonics?: {
    rangeWidth?: number  // 山带宽度 1-8（applyConvergentRange）
    riftDepth?: number   // 裂谷深度（applyDivergentRift）
  }
  rivers?: {
    style?: 'straight' | 'meandering' | 'deltaic'
    meanderAmplitude?: number
  }
  coast?: {
    noiseScale?: number
    noiseAmplitude?: number
  }
}
```

`MapGenConfig.continentCount` 默认 2（保持兼容），被改名为逻辑含义的 `plateCount`（也保留为 alias）。`config.realism` 整体可选；不传时所有子字段走各模块的硬编码默认（`rivers.style` 默认 `'meandering'`、`coast.noiseScale/Amplitude` 默认 0.012/6、`tectonics.rangeWidth` 默认 3）。

## 算法伪代码

### 步骤 2：`generatePlates(cells, rng, plateCount)`

```
seeds = pick N plate seeds:
  - 至少 2 个 continental seed（保证有大陆）
  - 其余 random seed，plateCount 总数范围 [3, 12]
  - 种子之间最小距离 = sqrt(area) / sqrt(plateCount) / 2

plateId[i] = argmin_j dist(cells.p[i], seeds[j].p)  // Voronoi

plates = seeds.map((seed, i) => ({
  i,
  center: seed,
  type: seed.continental ? 'continental' : 'oceanic',
  direction: rng() * 2π,
  speed: (0.3 + rng() * 0.7) * plateSpeedFactor,
  cells: count of cells with plateId === i,
}))
```

### 步骤 3：`detectPlateBoundaries(cells, plates)`

对每个相邻 plateId 对：
- `cellsA` / `cellsB`：双侧 cells
- `normalX/Y` = 单位法向量（质心差）
- `dot = (pa·dir - pb·dir) · normal`：
  - `dot > 0.3` → `'convergent'`
  - `dot < -0.3` → `'divergent'`
  - 其他 → `'transform'`
- 若 `convergent` 且 `pa.oceanic !== pb.oceanic` → `subductionSide = oceanic.i`

返回 `boundaries: PlateBoundary[]`，含 `type / plateA / plateB / cellIds / subductionSide?`。

### 步骤 4：`generateHeightmap(cells, width, height, rng, landRatio, plateCount)`

```
// 4a. 板块 base 高度
for cell in cells:
  plate = plates[plateId[cell]]
  cells.h[cell] = plate.type === 'continental'
    ? 25 + rng() * 25      // 25-50
    :  5 + rng() * 10      //  5-15

// 4b. FBM 噪声（4 octaves，scale 0.015，amplitude 5）
for cell in cells:
  cells.h[cell] += fbm2D(cells.p[cell] * 0.015) * 5

// 4c. 边界效果
for boundary in boundaries:
  seg = { cellsA, cellsB, normalX, normalY }
  switch boundary.type:
    case 'convergent':
      applyConvergentRange(cells, seg, { peakHeight, rangeWidth: realism.tectonics?.rangeWidth ?? 3 })
      if boundary.subductionSide !== undefined:
        overriding = plates[boundary.subductionSide === plateA ? plateB : plateA]
        applyVolcanicArc(cells, seg, overriding.i, { offsetCell: 4, peakHeight: 35 })
    case 'divergent':
      applyDivergentRift(cells, seg, { riftDepth: realism.tectonics?.riftDepth ?? 25 })
    case 'transform':
      applyTransformShear(cells, seg, rng)

// 4d. 边缘遮罩
for cell in cells:
  x = cells.p[cell*2] / width; y = cells.p[cell*2+1] / height
  edgeMask = (1 - (2x-1)^6) * (1 - (2y-1)^6)
  cells.h[cell] = cells.h[cell] * edgeMask

// 4e. 调整海陆比
adjustSeaLevel(cells, landRatio)

// 4f. 平滑
smooth(cells, 2, 2)
smooth(cells, 1, 1)
```

## 配置面（AI 可调）

旧 `voronoiMapAdapter.js` 的 prompt 列出 10 模板 + 3 档 level。新 prompt 只列：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `plateCount` | 2-12 | 6 | 板块数量；多=多岛海/碎大陆，少=超大洲 |
| `landRatio` | 0-1 | 0.45 | 陆地占比 |
| `realism.tectonics.rangeWidth` | 1-8 | 3 | 山带宽度（视觉上山有多"宽"） |
| `realism.tectonics.riftDepth` | 5-40 | 25 | 裂谷深度 |
| `realism.rivers.style` | `'straight'`/`'meandering'`/`'deltaic'` | `'meandering'` | 河流风格 |
| `realism.rivers.meanderAmplitude` | 0-5 | 3 | 河流弯曲度 |
| `realism.coast.noiseScale` | 0-0.1 | 0.012 | 海岸扰动频率 |
| `realism.coast.noiseAmplitude` | 0-20 | 6 | 海岸扰动幅度 |

`parseVoronoiMapConfig` 行为：
- `heightmapTemplate` 字段 → 静默丢弃（旧存档兼容）
- `realism.level` 字段 → 静默丢弃（已无意义）
- `realism.tectonics.volcanoDensity` / `realism.coast.headlandFreq` / `realism.political.*` → 静默丢弃
- 其他字段照常 clamp 验证

## UI 变化

`WorldMapVoronoi.vue` 的 3 档 `realism.level` 按钮组（`REALISM_LABELS` / `REALISM_HINTS` / `handleRealismChange`）整段删除。替换为单个"复杂度"下拉框（低/中/高），映射：

| 复杂度 | plateCount | rangeWidth |
|---|---|---|
| 低 | 4 | 2 |
| 中 | 6 | 3 |
| 高 | 9 | 5 |

默认值 = 中。`realismLevel` ref 与 `handleRealismChange` 整体删除；`props.config.realism.level` 监听器删除（已无对应字段）。

## 关键设计决策

1. **板块是源头，不派生自 heightmap**：旧 `tectonics.ts::findLandmasses` 读 `cells.h >= 20` 选种子——这是"鸡生蛋"，且导致 10 模板的形状直接决定板块分布。新管线把板块挪到 heightmap 之前，板块形状决定 heightmap 形状。
2. **保留 4 个 `apply*` 函数**：它们已经是 azgaar 风格的实现（汇聚→山带、离散→裂谷、转换→小起伏、俯冲→火山弧），直接复用，零改动。
3. **删除 3 档 level**：旧 level 实际只控制了 `applyConvergentRange` 的 `rangeWidth`（1/3-5/6-8），三个 level 视觉差异极弱（已在 `docs/plan/map-realism-status.md` §2.6 诊断）。新管线把它降为普通 `realism.tectonics.rangeWidth` 数值参数，让 AI 自由调。
4. **不重写 climate/rivers/biomes/nations**：这些模块虽然不是 Azgaar 逐字 port，但已经是 azgaar 启发的合理实现（纬向温度带、Whittaker biome 表、min-neighbor 流累积、Dijkstra 文化扩张）。忠实 port 每一个是 separate spec 的工作。
5. **保留 `continentCount` 字段**：作为 `plateCount` 的 alias 保留一版，避免破坏世界书 AI 已经写过的 prompt 和老存档。
6. **不重写渲染**：渲染读 `cells.h` / `cells.biome` / `cells.tectonic.*`（部分为 TODO）；新 heightmap 给出更真实的 `cells.h`，渲染自然变好。

## 错误处理

- `plateCount < 2` → clamp 到 2
- `plateCount > 12` → clamp 到 12
- `rangeWidth > 8` → clamp 到 8
- `rangeWidth < 1` → clamp 到 1
- AI 返回的 `realism.level` 字段 → 静默丢弃（容错）
- 种子选取时 `seaPool` 用尽（无足够海洋种子）→ 放宽距离限制重选
- 边界检测产生 0 segments（如 `plateCount === 1`）→ 跳过边界效果阶段

## 测试

### 现有测试更新

- `__tests__/realism-classic-compat.test.js` —— 重写为"默认 cfg 产生连贯地图"断言
- `__tests__/voronoiMapAdapter-realism.test.js` —— 重写为 `plateCount` / `mountainIntensity` 解析测试
- `__tests__/voronoiMapAdapter-prompt.test.js` —— 断言 prompt 含 `plateCount` / `mountainIntensity`，不含旧 3 档 level
- `__tests__/visual-verification.test.js` —— 删 `realism: { level: 'classic' | 'azgaar' }` 行
- `__tests__/rivers-meander.test.js` —— 删 `level` 字段
- `__tests__/worker-bridge.test.js` —— 删 `level` 字段
- `__tests__/renderer-smoke.test.js` —— 删 `level` 字段
- `__tests__/nations.test.js` —— pangea+seed=42 性能回归测试改 `plateCount: 2 + seed=42`

### 新增

- `__tests__/heightmap-azgaar.test.js` —— 烟雾测试：
  - `plates.length === plateCount`
  - 每个 cell 有 `plateId` 赋值
  - `cells.h` 同时有 ≥ 20 和 < 20 两种值
  - 至少 1 个 convergent 边界 cell 高度高于其周围 cells
  - `cells.tectonic` 6 数组全部填充

### 不变

- `__tests__/boundary-terrain.test.js` —— 直接测 `apply*` 函数，不动
- `__tests__/coast.test.js` —— 直接测 `perturbCoast`，不动
- `__tests__/tectonic-data.test.js` —— 直接测 `computeTectonicData`，不动
- `__tests__/borderlands.test.js` —— 渲染层，不动

## 阶段顺序

| 阶段 | 改动 | 验收 |
|---|---|---|
| 1. Spec 文档 | 本文件 | 获批 |
| 2. 实现 | heightmap.ts 重写 + tectonics.ts 简化 + types.ts 更新 + generate.ts 改序 + AI adapter + UI + 7 测试更新 + 1 新测试 + 4 文档注 supersede | `tsc --noEmit` 通过；286+ 测试 + 新测试全过；视觉验收：4 大陆不规则、汇聚边界有山、离散边界有裂谷、火山弧在 inland |

整个改动打包为 2 个 commit：
- `docs: azgaar-pipeline spec — plate-driven heightmap, drop 10 templates`
- `feat(engine): azgaar-style plate-driven heightmap pipeline`

## 不做

- WebAssembly / Worker 并行化
- 板块时间演化
- 多层板块（super-plate + sub-plate）
- 海洋地形细节（海底山 / 洋中脊可视化）
- 海岸侵蚀（erosion）模拟
- 河流流域多边形（watershed polygon）
- 气候算法的忠实 Azgaar port（按现有 azimuth + Whittaker 继续用）

## 风险

- **视觉回归**：老存档（`heightmapTemplate: 'pangea'` 等）的形状完全消失；用户用"经典地图"心智模型会不习惯。**缓解**：在 `docs/plan/map-realism-status.md` 加 supersede 提示；UI 把"复杂度"档位默认放中档。
- **性能退化**：每 cell 跑 FBM（4 octaves × 4 频率）= ~16 噪声采样 + 4 个 `apply*` 函数，3000 cells 单 seed 应 < 100ms（与旧管线可比），20000 cells 大场景可能慢 20-30%。**缓解**：`tectonic-data.ts` 阶段不再做重复 `computeTectonicData` 调用（旧 bug 导致 2×），净节约 ≥ 一次全 cell BFS 距离扩展。
- **AI 解析失败**：`parseVoronoiMapConfig` 对 `heightmapTemplate` / `realism.level` 等旧字段必须容错。**缓解**：parser 静默丢弃未知字段，单字段坏掉不影响其他字段（已有逻辑）。
- **板块极端情况**：`plateCount === 2` 时两个板块可能拼成一块盘古大陆（不一定是坏事）；`plateCount === 12` 时陆地可能碎到没意义。**缓解**：clamp 范围 [2, 12]；`landRatio` 是独立的兜底。

## 后续 spec（本期不做）

- `findPath` 用 `cells.tectonic.boundaryType` / `boundaryDist` 加权 cost（沿山脊绕路）
- 气候（`climate.ts`）用 `cells.tectonic.subduction` / `volcanoArc` 做雨影增强
- 河流约束（`constraints.rivers[].sourceCell`）的完整实现
- 板块时间演化（动态边界移动）
- 真实 Azgaar 风格的 climate/rivers/biomes 忠实 port
