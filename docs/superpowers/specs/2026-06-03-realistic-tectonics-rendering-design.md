# 现实化板块 / 海岸 / 水系 / 渲染（含世界书集成）

日期: 2026-06-03
状态: 待批准

## 目标

让 Voronoi 地图的板块行为、山脉/火山/裂谷、海岸线、河流、国界、底色 7 个方面
看起来更像 Azgaar 风格的中世纪奇幻地图，同时让这些"现实化"参数能被世界书的结构化
设定（structured settings）通过 AI 适配器驱动，而不是只能纯随机。

**视觉参考**：以 Azgaar's Fantasy Map Generator 为主，手绘幻想插画为可选风格。

## 范围

包含 3 个阶段 + 1 个贯穿性关切（世界书集成）：

1. **板块 + 地形**：`tectonics.ts` 重写，让山脉沿汇聚边界脊线生长、裂谷沿离散边界下凹、火山弧在俯冲带内陆侧成链
2. **海岸 + 水系**：海岸在海陆交界叠小尺度噪声；河流走真实坡度 + 蜿蜒 + 三角洲
3. **渲染**：分层管线，按 style preset 选择启用哪些层；新增山影、火山符号、国界 buffer、国家纹理 4 个 Azgaar 风的层
4. **世界书集成**：`MapGenConfig` 扩 `realism` 子对象，`voronoiMapAdapter.js` 扩 prompt 把 `mountainsRivers / factionLayout` 翻译为 `MapConstraints`

## 不在本 spec 范围

- `heightmap.ts` 大尺度几何（陆地/海洋分布）—— 保持现有，仅在边界处微扰
- `climate.ts`（温度/降水）—— 阶段 3 渲染可以读 `tectonic.boundaryType` 做雨影，但算法本身不动
- `nations.ts`（国家生成算法）—— 阶段 3 仅改渲染，不改生成
- `findPath` / A* —— 不变
- WebAssembly / Worker 并行化 —— 不变
- 时间演化（边界移动的动态模拟）—— 不做
- 热柱火山（hotspot）—— 不做
- 弧后盆地（back-arc basin）—— 不做

## 架构

### 数据模型

`GridCells` 新增 `tectonic` 子结构（在 `types.ts` 定义）：

- `plateId: Int16Array` — 板块编号
- `boundaryDist: Uint8Array` — 到最近边界的 cell 数（255 = 内陆）
- `boundaryType: Uint8Array` — 0=无 1=convergent 2=divergent 3=transform
- `subduction: Uint8Array` — 0=无 1=洋→陆俯冲带邻接
- `orogenyAge: Uint8Array` — 0=新 255=老（山影色调）
- `volcanoArc: Uint8Array` — 0=无 1=火山弧位置

`GridCells` 新增 `volcano: Uint8Array`（0=无 1=strato 2=shield）和 `riverId: Uint16Array`
（0=无，>0=河流编号）。

`Plate` 扩 `subductionZones: number[]`（俯冲段索引）。

`MapGenConfig` 扩 `realism` 子对象（详见配置面）。

`MapGenConfig.constraints?` 接受 `MapConstraints`（世界书强约束，可选）。

### 配置面（世界书 AI 可调）

```ts
realism: {
  level: 'classic' | 'azgaar' | 'geologic'  // 总开关，默认 'azgaar'
  tectonics: { plateCount?, rangeWidth?, riftDepth?, volcanoDensity? }
  rivers:    { style: 'straight' | 'meandering' | 'deltaic', meanderAmplitude? }
  coast:     { noiseScale?, noiseAmplitude?, headlandFreq? }
  political: { borderStyle: 'simple' | 'azgaar', borderlandWidth?, factionTexture? }
}

constraints?: {
  mountains?:  { name: string; cells: number[]; type: 'range' | 'volcano' | 'ridge' }[]
  rivers?:     { name: string; sourceCell: number; mouthHint?: string }[]
  stateSeeds?: { name: string; centerCell: number; radius?: number; color?: string }[]
}
```

兼容性：
- 老 `MapGenConfig`（无 `realism`）→ 默认 `{ level: 'classic' }`，行为完全等同当前
- `classic` 模式下所有新逻辑跳过

### 阶段 1：板块 + 地形

`generateTectonics(cells, ..., rng, realism)` 重写为 9 步：

| Step | 内容 | 来源 |
|---|---|---|
| A | 识别陆块 | 沿用 `findLandmasses` |
| B | 选 plateCount 个种子 | 沿用 `selectPlateSeeds` |
| C | Voronoi 划 plateId | 沿用 |
| D | 建 Plate（含 subducting flag） | 扩字段 |
| E | 边界检测 + 法线 | 沿用 `detectBoundaries` |
| F | 分类（汇聚/离散/转换） | 沿用 dot product |
| G | 填 `cells.tectonic` | 新增：boundaryType/Dist/Subduction/Age/VolcanoArc |
| H | 写 `plates[].subductionZones` | 新增 |
| I | 写 `boundaries[]` | 沿用 + 加 `subductionSide?` |

地形修改拆为 4 个子函数（替换当前 `applyBoundaryTerrain`）：

- `applyConvergentRange(seg, rng, params)` — 沿 spine 拉山脊，垂直高斯衰减；洋-陆仅陆地侧长山；峰值 50–80
- `applyDivergentRift(seg, params)` — spine 下凹 + 肩部抬升 + 概率性轴向火山
- `applyTransformShear(seg, rng)` — 小起伏（1–3），不产生大尺度地形
- `applyVolcanicArc(seg, overridingPlate, rng)` — 在 overriding plate 侧、离 boundary 内陆 3–6 cell 处成链

`rangeWidth`（山带宽度）按档位：
- `classic`: 1（退化）
- `azgaar`: 3–5
- `geologic`: 6–8（本期占位，未实现细节）

### 阶段 2：海岸 + 水系

- 新增 `coast.ts::perturbCoast(cells, realism)` — 在海陆交界 cell 上叠 fbm 噪声（4 octaves，scale 0.012，amplitude 6）
- 重写 `rivers.ts::generateRivers` — 源头选高 suitability cell；steepest-descent 但概率性横向扰动（`meanderAmplitude`）；`style='deltaic'` 时入海口前 5 cell 强制分叉
- `realism.level === 'classic'` 时 `rivers.ts` 走老分支
- `riverNames` 从世界书 AI prompt 来的按出现顺序绑 `riverId`

### 阶段 3：渲染

`renderer.ts` 改为按"风格预设 + 数据驱动"管线：

```
renderMap(canvas, data, opts):
  biomeColors = getBiomeColors(opts.stylePreset)
  for each Layer in pipeline[opts.stylePreset]:
    layer.fn(canvas, data, opts, biomeColors)
```

`pipeline[preset]` 6 个 preset 各自一份，preset 的 `topographic/parchment/watercolor/dark/clean/atlas` 行为：

- `topographic`：山影强，等高线保留
- `parchment` / `atlas`：Azgaar 浓度最高，山影 + 国界 + 国家纹理全开
- `watercolor` / `dark`：自然层全开，政治层简化
- `clean`：政治层全开，山影弱化

新增 6 个渲染层：

| 层 | 数据源 | 行为 |
|---|---|---|
| `hillshade` | `cells.h` + `cells.tectonic.boundaryType/Dist` | NW 光源；沿板块脊线方向增强对比 1.4× |
| `volcanoes` | `cells.volcano` + `cells.tectonic.volcanoArc` | strato 用黑红三角，shield 用褐色盾形 |
| `coastGlow` | `cells.h` 海陆交 | 海岸外侧 1 cell 浅色描边 |
| `terrainTexture` | `cells.biome` | per-biome 噪点 pattern |
| `borderlands` | `cells.state` | 邻国 cell 各向内退 N cell 的 buffer，半透明沙色 + 黑线 |
| `factionTexture` | `cells.state` | 国家底色 alpha 0.35 + per-state hashed 噪点 + 边缘淡化 |

`LayerVisibility` 扩字段不破坏旧 API。

### 世界书集成

- `voronoiMapAdapter.js::buildVoronoiMapPrompt` 在 systemPrompt 末尾追加 `realism.level` / `realism.tectonics.rangeWidth` / `realism.rivers.style` / `realism.political.borderStyle` 的说明
- 扩 prompt 引导 AI 把 `mountainsRivers` 字段翻译成 `constraints.mountains[]`，把 `factionLayout` 翻译成 `constraints.stateSeeds[]`
- `parseVoronoiMapConfig` 扩字段解析 `realism` 和 `constraints`，clamp 到合理范围
- `voronoiMapAdapter.js` 的 `WorldMapVoronoi.vue` 入口 `generateMap(cfg, collector, constraints?)` 三参
- `MapConstraints` 第 1 阶段实现 `mountains`（`tectonics.ts` 读取）和 `stateSeeds`（`generate.ts` 编排层处理：在调 `generateStates` 前用 `stateSeeds[i].centerCell` 覆盖对应 burg 的 cell，不改 `nations.ts` 自身算法）；`rivers` 留到第 2 阶段

## 关键设计决策

1. **数据驱动 vs 视觉补丁**：选数据驱动。板块的 `tectonic` 结构是上游算一次，下游所有阶段读。让"3 阶段"形成同源故事，而不是补丁堆叠。
2. **老数据兼容**：`realism.level='classic'` 走老路径，老 `MapGenConfig` 默认 `classic`，老存档无破坏。
3. **Azgaar 风 vs 地质学**：azgaar 优先（用户确认）。`geologic` 档位本期只挂占位。
4. **世界书强约束 vs AI 软建议**：软建议通过 `realism` 字段（AI 翻译），强约束通过 `constraints` 字段（命名地点/山脉）。两类并存，不冲突。
5. **不做时间演化**：Azgaar 也不做。板块运动是瞬时分类，不模拟地质时间。

## 阶段顺序

| 阶段 | 改动文件 | 验收 |
|---|---|---|
| 1. 板块 + 地形 | `types.ts`、`tectonics.ts`（重写）、`heightmap.ts`（不动） | 3 seed × 2 landRatio，对比 classic/azgaar 截图；山带明显、地形有起伏 |
| 2. 海岸 + 水系 | `rivers.ts`（重写）、新增 `coast.ts` | 同 seed 对比直线版；海岸有起伏，河流弯曲 |
| 3. 渲染 | `renderer.ts`（分层管线）、`style-presets.ts`（pipeline 表）、新增 `borderlands.ts` + `factionTexture.ts` | 6 preset 各 1 截图；国界相邻国家视觉可分 |
| 4. 世界书集成 | `voronoiMapAdapter.js`（扩 prompt + 解析） | 4 个典型世界观描述 → cfg，验证 AI 输出含 `realism` 和 `constraints` |

## 错误处理

- AI 返回的 `realism.level` 不是合法值 → 静默 fallback 到 `'azgaar'`
- AI 返回的 `constraints.mountains[].cells` 引用了非陆地 cell → 过滤掉
- `rangeWidth` 超过 8 → clamp 到 8
- `pointCount < 5000` 仍按老规则（保护小规模场景的稳定性）

## 测试

- 单元测试（`vitest`）：
  - `tectonics.ts`：固定 seed 下 plateId、boundaryType、boundaryDist 三个数组的具体值
  - `rivers.ts`：固定 seed 下 riverId 数量、是否形成 delta
  - `coast.ts`：海陆交界 cell 数 ≥ 一定阈值
- 集成测试：固定 seed + `level='classic'` 必须与现状 byte-for-byte 相同
- 视觉验收：手画 4 张参考图（直观看"对"），用脚本截图对比

## 不做

- WebAssembly 移植
- 实时编辑板块拖拽 UI
- 多层板块（板块之上再分小板块）
- 海洋地形细节（海底山、洋中脊可视化）
- 海岸侵蚀模拟（erosion）
- 河流流域系统（watershed polygon）

## 风险

- **性能退化**：新算法在 20000 cells 上可能比当前慢 2–3×。`realism.level='classic'` 路径必须保持当前速度。验收时必须跑 perf-sweep。
- **视觉回归**：老的 6 个 preset 在新管线下的输出必须视觉上等同。`clean` 尤其要保持简洁。
- **AI 解析失败**：`parseVoronoiMapConfig` 对 `realism` / `constraints` 字段必须容错，单字段坏掉不能影响其他字段。

## 后续 spec（本期不做）

- `findPath` 用 `tectonic` 避开陡坡（地形成本）
- 气候用 `tectonic.boundaryType` 做雨影（增强温度/降水）
- 河流通向具体国家/省份（约束 stateSeeds）
- 3D 预览（用 tectonic 高度场）
