# ADR-0003: Azgaar 风格地图管线重写（板驱 heightmap）

- **状态**: accepted
- **日期**: 2026-06-04
- **领域**: world-map
- **当前实现注记（2026-06-08）**: 本 ADR 记录 06-04 的原始方向。Round 1 / Round 2 已恢复 14 个 Azgaar `heightmapTemplate` 语义入口、`heightmap-templates.ts`、`parseTemplate.ts` 和 `enforceTemplateContract.ts`；当前 owning surface 以 [`../code-map.md`](../code-map.md) 为准。
- **影响范围**:
  - `src/services/world-map/engine/tectonics.ts`（新增 `generatePlates` + `detectPlateBoundaries`，纯板块生成、不读 `cells.h`）
  - `src/services/world-map/engine/heightmap.ts`（重写：板块 base → 噪声 → 边界效果 → mask → sea-level → smooth）
  - `src/services/world-map/engine/boundary-terrain.ts`（4 个 `apply*` 函数：convergent range / divergent rift / transform shear / volcanic arc）
  - `src/services/world-map/engine/tectonic-data.ts`（`computeTectonicData` 6 个并行数组；**修重复调用 bug**）
  - **删除**：`heightmap-templates.ts` 整体 + `HeightmapTemplate` 类型 + `realism.level: 'classic' | 'azgaar' | 'geologic'` 三档开关
  - `MapRealism` 简化：仅保留可独立调节的数值（`rivers.style` / `meanderAmplitude` / `coast.noiseScale/Amplitude` / `tectonics.rangeWidth/riftDepth`）
- **详细 spec (canonical)**: [`../rfcs/azgaar-pipeline/`](../rfcs/azgaar-pipeline/)
- **supersedes**: `docs/superpowers/specs/2026-06-03-realistic-tectonics-rendering-design.md`（保留作考古）

## 背景

旧管线把 heightmap 当"不动"的底层，再叠"现实化补丁"；实测证明视觉仍不像真地图。Azgaar 公开算法是"板块是主结构、heightmap 由板块生成"，更接近真实构造。

旧 `tectonics.ts:120` 和 `:128` 各调一次 `computeTectonicData`，后者覆盖前者（隐式 bug）。

## 决策

管线新顺序：

1. `generatePoints / buildVoronoi`（`grid.ts`）—— 不变
2. `generatePlates`（`tectonics.ts`）—— 新
3. `detectPlateBoundaries`（`tectonics.ts`）—— 新
4. `generateHeightmap`（`heightmap.ts`）—— 重写
5. `perturbCoast`（`coast.ts`）—— 不变
6. `computeTectonicData`（`tectonic-data.ts`）—— 填 6 个并行数组，**修重复调用**
7. detectFeatures → wind → climate → rivers → biomes → nations —— 不变

输出形状（`VoronoiMapData.plates / .boundaries / .cells.tectonic.* / .cells.h / .cells.volcano`）与旧管线一致，渲染层无感。

## 备选方案

- 保留 3-level realism（classic / azgaar / geologic）：复杂度高、无用户价值、容易出现"经典模式没人用"。
- 保留 `heightmap-templates.ts`：维护两份 heightmap 来源会持续分裂。
- 在 `climate.ts` 层面修视觉差异：根因是 heightmap 来源，不是气候算法。

## 后果

- 正面：山脉 / 火山 / 裂谷沿真实板块边界生成，视觉接近 Azgaar；消除 `computeTectonicData` 重复调用 bug。
- 负面：所有依赖 `realism.level` 旧字段的 caller 必须迁移。
- 后续约束：
  - 06-08 后续修订：`heightmap.ts` 已重新读取 `HeightmapTemplate` 参数，但模板选择必须走 `resolveHeightmapTemplate` / sub-RNG / contract 机制，不得回到跨组随机。
  - 任何新视觉"开关"必须是 `MapRealism` 数值字段，**不**再增加 `level` 维度。
  - 遇到 `MapGenConfig.realism.level` 旧调用方应删除而非兼容。
