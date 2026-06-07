# Voronoi 引擎 v2：AI 配置对齐与渲染性能优化计划

日期：2026-06-05
范围：`src/services/ai/*`、`src/services/world-map/engine/*`、`src/components/geography/*`、`src/stores/geographyStore.js`
背景：realism pass 已经显著改善地形生成，但当前仍有两类残留问题：

1. AI 配置链路不透明，LLM 看到的配置面和实际引擎支持的配置面不一致。
2. 渲染与局部生成热点仍然存在，地图复杂度上来后交互和重绘成本偏高。

本文档只描述当前代码库下的真实现状、缺口和执行顺序，不把“计划项”写成“已完成项”。

---

## 目标

本轮优化只做两件事：

1. 让 AI 适配器、UI、store、worker 和引擎的配置接口重新对齐。
2. 处理当前最明确的渲染和国家/道路生成热点，降低重绘与生成尾延迟。

不在本轮处理的内容：

- 不继续扩展新的地图 realism 规则。
- 不引入全新的地图编辑器架构。
- 不把所有 JS 文件强制迁移成 TS。
- 不为当前渲染器补一套像素级视觉回归框架。

---

## 当前代码现状

以下内容是当前仓库中已经成立的事实。

### 1. AI 适配器现状

- AI 适配器仍是 [voronoiMapAdapter.js](/home/recoletas/jiuguan/text-game-framework/src/services/ai/voronoiMapAdapter.js)，尚未迁移到 TS。
- `parseVoronoiMapConfig(raw)` 当前直接 `JSON.parse`，没有 `try/catch`，返回值也不是 discriminated union。
- 适配器默认 `pointCount` 仍是 `10000`，而引擎默认值已经是 `6000`。
- prompt 中暴露给 LLM 的字段不完整，和引擎真实支持的 `MapGenConfig` 不一致。
- 当前适配器没有把 `stylePreset`、`layers`、`plateSpeedFactor`、`biomeOverrides`、`generateProvinces`、`generateRoads` 这组配置稳定地纳入解析和校验流程。

### 2. 引擎配置现状

- `MapGenConfig` 当前定义在 [types.ts](/home/recoletas/jiuguan/text-game-framework/src/services/world-map/engine/types.ts)，已经支持：
  - `stylePreset`
  - `layers`
  - `plateCount`
  - `plateSpeedFactor`
  - `biomeOverrides`
  - `generateProvinces`
  - `generateRoads`
- `generate.ts` 当前默认值已经是：
  - `width = 1200`
  - `height = 800`
  - `pointCount = 6000`
  - `plateCount = 6`
  - `plateSpeedFactor = 1`
- 当前渲染 preset 的真实枚举是：
  - `topographic`
  - `parchment`
  - `watercolor`
  - `dark`
  - `clean`
  - `atlas`
- 当前没有 `cartographic`、`fantasy`、`archipelago` 这类 style preset。

### 3. UI 与 store 现状

- [WorldMapPanel.vue](/home/recoletas/jiuguan/text-game-framework/src/components/geography/WorldMapPanel.vue) 仍然假定 `parseVoronoiMapConfig(raw)` 直接返回 config 对象。
- [WorldMapVoronoi.vue](/home/recoletas/jiuguan/text-game-framework/src/components/geography/WorldMapVoronoi.vue) 能从 worker 拿到 `{ data, meta }`，也会 `perf.record(meta)`，但最终只 `emit('map-generated', data)`。
- [geographyStore.js](/home/recoletas/jiuguan/text-game-framework/src/stores/geographyStore.js) 当前没有 `lastGenerationMeta`，因此上次生成耗时并没有进入可复用状态。
- `WorldMapPanel.vue` 的 `onMapGenerated` 目前基本是占位 hook，没有消费 meta，也没有回写其他状态。

### 4. worker 与错误处理现状

- [worker-bridge.ts](/home/recoletas/jiuguan/text-game-framework/src/services/world-map/engine/worker-bridge.ts) 的 timeout 仍然是 `new Error(...)`。
- 当前没有 `MapGenError` 这样的 typed error，也没有对 engine error / parse error / timeout 做统一分类。

### 5. 性能热点现状

- [renderer.ts](/home/recoletas/jiuguan/text-game-framework/src/services/world-map/engine/renderer.ts) 中 `drawHillshade` 仍然是按帧按 cell 即时计算。
- `sharedCellIds` 当前仍通过 `Set` 做共享边求交，且被多个边界绘制路径复用。
- [nations.ts](/home/recoletas/jiuguan/text-game-framework/src/services/world-map/engine/nations.ts) 中：
  - `expandStates` smoothing 阶段仍使用 `Record<number, number>`
  - `deExclaveStates` 仍使用 `Record<number, number>`
  - 道路寻路仍使用 `graphology` + string node id 的 `astar.bidirectional`
- [WorldMapVoronoi.vue](/home/recoletas/jiuguan/text-game-framework/src/components/geography/WorldMapVoronoi.vue) 仍是整图 `rerender()`，没有 per-layer cache，也没有统一的 `schedulePaint()` 收敛重绘调用。

---

## 当前主要缺口

### Track A：AI 配置对齐

1. 适配器默认值与引擎默认值不一致。
2. prompt 可见字段与真实 `MapGenConfig` 能力不一致。
3. AI 返回 JSON 失败时没有稳定错误分支。
4. 上次生成耗时没有回流给 AI，也没有持久化到 store。
5. 配置解析缺乏系统性白名单和范围校验。

### Track E：性能与交互

1. hillshade 仍在渲染期重复计算。
2. 边界求交和热点循环存在可预计算空间。
3. `expandStates` / `deExclaveStates` 仍有对象分配热点。
4. 道路寻路仍走 string-key graphology 路径，存在额外装箱和转换开销。
5. 图层开关和样式切换仍会触发整图重绘。

---

## 执行原则

1. 先修接口对齐，再做性能优化。
2. 优先修复“当前调用链会直接受影响”的问题，不先做大规模架构改造。
3. 每一步都要求可以单独验证，不依赖后续阶段兜底。
4. 文档中提到的“迁移到 TS”不是强制前提，只有在能明确减少接口漂移时才做。

---

## Track A：AI 配置对齐计划

### A1. 解析结果改为显式成功/失败结构

状态：planned

目标：

- 让 `parseVoronoiMapConfig` 能区分“成功解析但有 warnings”和“完全解析失败”。

建议改动：

- 在 [voronoiMapAdapter.js](/home/recoletas/jiuguan/text-game-framework/src/services/ai/voronoiMapAdapter.js) 为 `JSON.parse` 增加 `try/catch`。
- 返回结构调整为：
  - 成功：`{ ok: true, config, warnings }`
  - 失败：`{ ok: false, reason, message, raw }`
- `reason` 至少区分：
  - `PARSE`
  - `VALIDATION`

同步改动：

- [WorldMapPanel.vue](/home/recoletas/jiuguan/text-game-framework/src/components/geography/WorldMapPanel.vue) 需要改成消费 `result.ok`。

验收标准：

- AI 返回非法 JSON 时，前端能稳定提示“返回无效 JSON”而不是抛未捕获异常。
- AI 返回合法 JSON 但字段超界时，不阻塞生成，但会产生 warnings。

### A2. 增加一层明确的配置校验

状态：planned

目标：

- 在不引入额外 schema 库的前提下，给 AI 输出增加稳定的白名单和范围校验。

建议改动：

- 新增 `src/services/ai/mapConfigSchema.ts` 或同等职责文件。
- 校验来源以 [types.ts](/home/recoletas/jiuguan/text-game-framework/src/services/world-map/engine/types.ts) 中 `MapGenConfig` 为准。
- 覆盖至少这些字段：
  - `width`
  - `height`
  - `pointCount`
  - `landRatio`
  - `plateCount`
  - `stateCount`
  - `burgDensity`
  - `temperatureShift`
  - `precipitationFactor`
  - `plateSpeedFactor`

输出建议：

- `warnings: string[]`
- `unknownFields: string[]`

验收标准：

- 解析器能对超界值做 clamp，并把原因写入 warnings。
- 未知字段不会 silently 混入最终 config。

### A3. 默认值与 prompt 对齐引擎

状态：planned

目标：

- 消除 AI 适配器默认值和引擎默认值之间的漂移。

必须对齐的默认值：

- `pointCount: 6000`
- `width: 1200`
- `height: 800`
- `plateCount: 6`
- `plateSpeedFactor: 1`

建议改动：

- 更新 [voronoiMapAdapter.js](/home/recoletas/jiuguan/text-game-framework/src/services/ai/voronoiMapAdapter.js) 的默认值。
- 同步更新 prompt 中所有硬编码示例，不再写 `pointCount: 10000`。

验收标准：

- 适配器在空输入下生成的 config 与 `generate.ts` 默认行为一致。

### A4. 补齐 LLM 可见字段

状态：planned

目标：

- 让 prompt、解析器、引擎三者支持的字段集合一致。

本阶段最少补齐：

- `stylePreset`
- `layers`
- `plateSpeedFactor`
- `biomeOverrides`
- `generateProvinces`
- `generateRoads`
- `width`
- `height`

特别说明：

- style preset 名称必须使用当前真实值：
  - `topographic`
  - `parchment`
  - `watercolor`
  - `dark`
  - `clean`
  - `atlas`

验收标准：

- LLM 生成包含上述字段的 JSON 时，解析器不会丢字段。
- prompt 中不再出现当前代码里不存在的 preset 名称。

### A5. 把枚举源集中化，避免 prompt 再次漂移

状态：planned

目标：

- 给 AI 适配器提供一套稳定、可复用的枚举来源，而不是在 prompt 里手写散落常量。

建议改动：

- 评估是否把 [geography-types.js](/home/recoletas/jiuguan/text-game-framework/src/config/geography-types.js) 扩展为更完整的常量源。
- 至少补齐：
  - style preset 列表
  - biome id 列表或 biome override 允许范围

注意：

- 这一项不强制要求把文件迁成 TS。
- 重点是“减少漂移源”，不是“形式上 TS 化”。

验收标准：

- AI prompt 和解析器不再各自维护一套 preset/枚举常量。

### A6. 命名数组长度和替补逻辑前置告警

状态：planned

目标：

- 现在引擎会在 `stateNames` / `burgNames` 数量不足时回退自动命名，但 AI 适配器没有提前给出告警。

建议改动：

- 在适配器层检查：
  - `stateNames.length < stateCount`
  - `burgNames.length < stateCount * 2`
- 不报错，但写入 warnings。

验收标准：

- 用户能知道哪些名称会被引擎自动补齐，而不是把“名字风格不一致”误判成生成质量问题。

### A7. Generation meta 回流到 store 和 AI prompt

状态：planned

目标：

- 把 worker 已经产生的性能元数据串回可见状态，供后续 AI 调参使用。

建议改动：

- [WorldMapVoronoi.vue](/home/recoletas/jiuguan/text-game-framework/src/components/geography/WorldMapVoronoi.vue) 的 `map-generated` 事件改为发 `{ data, meta }`。
- [geographyStore.js](/home/recoletas/jiuguan/text-game-framework/src/stores/geographyStore.js) 增加 `lastGenerationMeta`。
- [WorldMapPanel.vue](/home/recoletas/jiuguan/text-game-framework/src/components/geography/WorldMapPanel.vue) 在接收事件时写回 store。
- `buildVoronoiMapPrompt` 可选地把最近一次 `meta.totalMs` 与分阶段耗时注入 system prompt。

验收标准：

- 一次成功生成后，store 中可以读取到最近一次 `GenerationMeta`。
- 下一次 AI 生成 prompt 可以选择性包含最近一次性能摘要。

### A8. worker 错误分类

状态：planned

目标：

- 让 UI 能区分 timeout、engine 内部错误和解析错误。

建议改动：

- 在 [worker-bridge.ts](/home/recoletas/jiuguan/text-game-framework/src/services/world-map/engine/worker-bridge.ts) 引入 `MapGenError`。
- 至少定义：
  - `TIMEOUT`
  - `ENGINE`
- `PARSE` 可以留在 AI 适配层处理，不强行塞进 worker bridge。

验收标准：

- 超时、worker 内部错误和 AI JSON 错误在日志与 UI 提示上可以分开识别。

### A9. 测试补齐

状态：planned

目标：

- 为配置解析和 typed error 加上回归保护。

建议新增：

- `mapConfigSchema.test.js`
- `mapGenError.test.js`
- `voronoiMapAdapter` 相关 prompt/parse 测试

重点断言：

- 非法 JSON
- 超界 clamp
- 未知字段过滤
- warning 输出
- timeout error 类型

验收标准：

- A1-A8 涉及的行为变化都至少有一层自动化覆盖。

---

## Track E：性能优化计划

### E1. 先做渲染热点确认，再改 drawHillshade

状态：planned

目标：

- 优先确认 `drawHillshade` 是否仍然是当前最重的 per-frame 热点，再决定是否把 shade 值前置到生成期缓存。

建议改动：

- 基于现有 `perf` 和浏览器 performance profile，确认地图尺寸在常见档位下的热点占比。
- 如果 `drawHillshade` 明确占主导，再新增 `computeHillshade` 之类的生成期预计算。

注意：

- 不建议在没有 profile 的情况下直接大改渲染路径。
- 这一项和 realism 无关，纯粹是 runtime 优化。

验收标准：

- 有明确 profile 证据证明 hillshade 值得前移。
- 改动后渲染视觉没有明显退化。

### E2. 边界共享边求交结果做结构化缓存

状态：planned

目标：

- 降低 `sharedCellIds` 在多种边界绘制路径中的重复分配和重复求交。

建议改动：

- 在 `renderer.ts` 中增加边索引缓存。
- 仅缓存“稳定复用”的边数据，不在热路径里重复创建 `Set`。

适用路径：

- `drawBorders`
- `drawProvinceBorders`
- `drawContinents`
- `drawTectonicBoundaries`

验收标准：

- 大地图多边界层开启时，重绘时间有可观察下降。

### E3. `expandStates` 和 `deExclaveStates` 去对象分配

状态：planned

目标：

- 把 smoothing 和去飞地阶段的 `Record<number, number>` 换成定长数组或可复用缓冲区。

建议改动：

- 在 [nations.ts](/home/recoletas/jiuguan/text-game-framework/src/services/world-map/engine/nations.ts) 中把两处计数结构换成 `Int32Array` 或等价结构。
- 保持输出一致，不改变国家划分语义。

验收标准：

- 同 seed 下，state 划分结果保持一致。
- 生成阶段对象分配下降，GC 压力减轻。

### E4. 道路寻路从 string-key graph 过渡到 numeric graph

状态：planned

目标：

- 降低 `findPath` 中 graphology + string 节点 id 带来的转换开销。

建议改动：

- 先在生成期或道路生成入口建立 numeric land graph。
- 用 numeric heap / adjacency 表替代 string-key `astar.bidirectional`。

风险：

- tie-break 变化可能导致“同成本多解”时路径形状不同。
- 因此验收不应要求 path 字节完全一致。

验收标准：

- 同 seed 下，道路总数、端点集合、路径总成本保持一致。
- 允许路径在等成本分支上发生形状变化，但不能退化到明显更差路线。

### E5. `WorldMapVoronoi.vue` 重绘收敛

状态：planned

目标：

- 先减少重复 `paint()` 调用，再评估是否需要做 per-layer cache。

建议执行顺序：

1. 先引入 `schedulePaint()`，把散落的 `paint()` 调用收敛到 RAF。
2. 再判断 `rerender()` 是否需要按 layer 做缓存。
3. 如果做 layer cache，必须同时处理：
   - layer ordering
   - DPR
   - viewport transform
   - cache 释放

注意：

- per-layer cache 是架构性改动，不要和小修混在一个阶段里。
- 当前阶段更合理的做法是先收敛 paint，再根据 profile 决定是否继续。

验收标准：

- 高频交互下重复重绘次数下降。
- 样式切换、图层切换、标记拖动不引入错层或残影。

---

## 推荐执行顺序

按依赖关系，建议严格按以下顺序推进：

1. A1 `parseVoronoiMapConfig` 返回结构改造
2. A2 配置校验与 warnings
3. A3 默认值对齐
4. A4 prompt 和解析器字段补齐
5. A5 枚举常量收口
6. A6 命名数组 warnings
7. A7 generation meta 回流
8. A8 typed error
9. A9 测试补齐
10. E1 做 profile，确认当前渲染主热点
11. E2 边界求交缓存
12. E3 状态扩张计数结构优化
13. E4 numeric pathfinding
14. E5 重绘收敛与可选 layer cache

这样安排的原因：

- Track A 会直接影响 UI、AI 调参和错误提示，优先级高于 runtime 微优化。
- Track E 中 E5 风险最高，应该放在热点已经足够清晰之后再动。

---

## 风险与回滚点

### 高风险

- E4 numeric pathfinding 改动容易影响道路形状与稳定性。
- E5 per-layer cache 涉及渲染顺序、DPR、缓存生命周期，容易引入隐藏 bug。

### 中风险

- A1 改返回结构会影响所有调用 `parseVoronoiMapConfig` 的代码。
- A7 改事件 payload 也会影响 `map-generated` 监听端。

### 低风险

- A3 默认值对齐
- A6 warnings 增量输出
- E3 计数结构优化

推荐回滚边界：

- A 系列尽量集中在一组接口对齐提交中完成。
- E4 和 E5 不要与其他优化混提，必须能单独回滚。

---

## 验收方式

### 功能验收

- AI 生成的 JSON 出错时，前端提示明确，不再直接炸栈。
- AI 可以稳定设置当前引擎真实支持的关键字段。
- store 能拿到最近一次生成 meta。
- prompt 中的 style preset 与当前渲染器保持一致。

### 性能验收

- 至少保留一次变更前后的 profile 对比。
- 重点观察：
  - 首次生成总耗时
  - 图层切换重绘耗时
  - 样式切换重绘耗时
  - 大地图拖拽与缩放流畅度

### 稳定性验收

- 同 seed 下，A 系列改动不应改变地形和国家分布结果。
- E3 改动不应改变国家划分输出。
- E4 改动允许道路细节变化，但不能引入明显断路或异常长路径。

---

## 文档维护规则

后续更新本文件时遵守以下规则：

1. “已完成”只写已经在仓库中存在的事实。
2. “planned” 和 “implemented” 必须分开。
3. 不再引用会快速漂移的伪行号级描述，优先引用文件和函数。
4. preset、字段名、默认值必须以当前代码定义为准，不能在文档中另写一套。
