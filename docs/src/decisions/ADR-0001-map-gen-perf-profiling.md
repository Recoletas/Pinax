# ADR-0001: 地图生成管线分阶段计时基础设施

- **状态**: accepted
- **日期**: 2026-06-01
- **领域**: world-map
- **影响范围**:
  - `src/services/world-map/engine/perf.ts`（新增 `PerfCollector`）
  - `src/services/world-map/engine/types.ts`（新增 `GenerationMeta`）
  - `src/services/world-map/engine/generate.ts` / `worker.ts` / `worker-bridge.ts`（透传 collector 与 `meta`）
  - `src/composables/usePerf.js` + `src/components/debug/PerfOverlay.vue`（dev 浮层）
  - `src/pages/WorldMapPage.vue`（挂载浮层）
- **详细 spec (canonical)**: [`../rfcs/perf-profiling/`](../rfcs/perf-profiling/)
- **实施记录**: [`../rfcs/perf-profiling/implementation.md`](../rfcs/perf-profiling/implementation.md)

## 背景

`engine/generate.ts` 已有 `console.time` / `console.timeEnd`，但没有集中采集。在不知道哪一阶段是瓶颈的情况下做优化，等于盲改。

## 决策

- 新增 `PerfCollector`，被 `generateMap` 透传到管线；worker 在收到 `debugPerf: true` 时构造一个。
- 每对 `console.time` 配一个 `collector?.start/end`，所以非 dev / Node 环境下行为不变。
- `?debug=perf` 打开浮层（`PerfOverlay`）显示最近一次 `meta.stages`。
- `meta` 通过 postMessage 走，**不**进 `MapGenConfig`、**不**进 `localStorage`、**不**进 AI prompt。

## 备选方案

- 直接读 `performance.now()` 自己画表格：缺 stage 名硬编码，与 console 重复。
- 在 `usePerf` 内 import `engine` 模块：worker 边界 + Vue reactive proxy 双重问题。
- 把 collector 放进 `MapGenConfig`：污染用户配置和 AI prompt。

## 后果

- 正面：为后续"states / roads 等阶段的算法重写"提供数据支撑（见 ADR-0002）。
- 负面：worker 边界需要 strip Vue reactive proxy（已在 `99c4190` 处理）；`generateMap` 返回类型不变但 `generateMapInWorker` 多返回一个 `meta`。
- 后续约束：
  - 任何"算法重写 / 并行化 / WASM 化"提案必须先引用 `meta.stages` 数据；不允许凭直觉改。
  - `?debug=perf` 浮层只用于 dev；不允许在生产路径引入新的 `meta` 字段。
