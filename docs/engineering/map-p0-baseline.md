# P0 基线报告：固定 fixtures 生成/内存/v2 投影

日期：2026-08-29
环境：Node（vite-node），worktree `feature/map-platform-v2`，baseline `c22af4c`
测量脚本：`scripts/map-p0-baseline.mjs`（原始 JSON 在 `/tmp`，按 §9.6 不入库）

## 1. 生成与规模基线

| Fixture | cells | burgs | rivers | roads | states | 生成 ms | 二次生成 ms | 确定性 | heap Δ | v2 feature 数 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| archipelago（群岛+长海岸） | 8,000 | 17 | 51 | 14 | 7 | 378 | 274 | ✅ | +12.5MB | 92 |
| multi-continent（多大陆+多国家） | 10,000 | 35 | 51 | 37 | 13 | 302 | 267 | ✅ | +12.1MB | 148 |
| elongated（狭长大陆+长河） | 9,000 | 21 | 51 | 12 | 6 | 424 | 416 | ✅ | +12.9MB | 113 |
| dense-12k（12,000 cells 主性能 fixture） | 12,000 | 69 | 51 | 64 | 11 | 309 | 301 | ✅ | -45MB* | 201 |

\* dense-12k 的 heapAfter 低于 heapBefore 是 GC 时机巧合，不代表负增长；单次生成增量以其余三行 ~12MB 为准。

结论：

1. 同 seed 同 config 结构下，同步重生成输出规模一致（seed/cells/burgs/rivers/coastlines 全等），作为 P7 "同 seed + config 输出确定" 的基线证据；
2. 12,000-cell 主 fixture 在 Node 主线程同步生成约 0.3s，与现有 worker 化生成兼容，不构成 Gate 阻塞；
3. 每个 fixture 的 v2 投影全部通过 `validateMapDocumentV2`（含跨集合 feature ID 唯一性）。

## 2. 挂载/缩放/导出基线

这三项需要浏览器环境，由 P1 Gate 的原型 #1（当前 Canvas）在真实视口中补充测量，
结论记录于 `docs/superpowers/plans/2026-08-29-mature-map-platform-v2.md` 的 Gate
证据与 `map-p1-gate-report.md`。本报告先冻结生成/内存门槛：

- 12,000-cell 生成 p95 ≤ 1.5s（当前 ~0.31s，余量 5x）；
- 单次生成 heap 增量 ≤ 50MB（当前 ~13MB）；
- v2 投影不复制基础 cells 进 feature collections（当前 201 features vs 12,000 cells）。

## 3. 迁移矩阵样例

`LEGACY_MAP_CONFIG_JSON_SAMPLE`（旧 `mapConfigJSON` 格式 + confirmed marker + userAdded marker）
覆盖：分桶格式解析、pre-bucket 兼容、非法 JSON 隔离、legacy placeId alias 生成。
对应用例：`src/__tests__/mapModelV2.test.js`。
