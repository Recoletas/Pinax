<!-- canonical-source -->

- **状态**: accepted
- **负责人**: @Recoletas
- **最后更新**: 2026-06-08
- **领域**: world-map
- **开放问题**: 无（已落地）
- **下一步**: 已落地；维护阶段不主动推进

> 当前实现注记：文中“`heightmap-templates.ts` 整体删除”反映 2026-06-05 当时对 ADR-0003 的理解。2026-06-08 Round 1 / Round 2 后该文件已恢复为当前高程图模板语义的一部分。

---

# 世界地图引擎 5 个 OSS 替换

日期: 2026-06-05
状态: 已批准

## 目标

把 `src/services/world-map/engine/` 里 5 处自造基础设施替换为成熟 OSS 库；同步清理 5 个未跟踪的 `_debug-*.test.js`。**不**改变任何对外 API、**不**改变 `VoronoiMapData` 输出形状、**不**改变 `MapGenConfig` 配置项。

预期：

- 净减约 400 行自造代码
- 消除 `nations.ts` 的手写二叉堆（已发生过堆腐败 bug，commit `3678bf1` / `e3828b2`）
- 与项目里已经在用的 `delaunator` / `d3-hierarchy` / `pinia` 风格一致
- 8 个 `heightmap-azgaar.test.js` 契约测试全绿
- `npm run verify` 通过

## 不在本 spec 范围

- `polygon-clipping` —— 引擎里**没有**多边形布尔代码（grep 0 命中）
- `unique-names-generator` —— `name-pool.ts` 是策划过的主题名池，不是过程化拼接
- BFS 洪泛（`borderlands.ts` / `boundary-terrain.ts` / `features.ts` / `tectonic-data.ts` / `heightmap-templates.ts` / `wind.ts`） —— 分层遍历，层数是 BFS 本身的意义
- `rivers.ts` 排水 —— 陡降法，不是最短路径
- `climate.ts::SpatialGrid` —— 均匀格桶哈希，对此访问模式比 `d3-quadtree`/`rbush` 更快
- `heightmap-templates.ts` 整体删除 —— 这是 2026-06-05 原始方案外的判断；06-08 后当前实现已恢复模板语义，删除不再适用
- `LICENSE` 文件 —— 与本次工作无关

## 5 个 Swap 概览

| # | 目标 | OSS 包 | 风险 | 行数变化 |
|---|---|---|---|---|
| 1 | `random.ts::seedRandom` | `alea@^1.0.1` | 低 | -20 LOC |
| 4 | `nations.ts` 两份手写堆 | `graphology@^0.26.0` + `graphology-shortest-path@^2.0.0` | 中 | -110 LOC |
| 3 | `heightmap-templates.ts::findGridCell` | `d3-delaunay@^6.0.4` | 低 | -10 LOC（+1 个 Delaunay 实例构造） |
| 5 | `worker-bridge.ts` + `worker.ts` IPC | `comlink@^4.4.2` | 中 | -75 LOC |
| 2 | `heightmap.ts` + `coast.ts` 两份 FBM | `simplex-noise@^4.0.3` | 高 | -25 LOC（+新 `noise.ts`） |

排序原则：低风险 → 中风险 → 高风险，最后一个 simplex-noise 时前面 4 个都已稳定，便于把测试 flake 归因到唯一变量。

## 实施顺序（7 个 commit）

```
1.  docs(superpowers): 本 spec                                ← 本次 commit
2.  chore(tests): 删除 5 个 _debug-*.test.js                  ← 独立清理
3.  refactor(engine): random.ts 改用 npm 包 alea              ← swap 1
4.  refactor(engine): nations.ts 用 graphology 替两份手写堆    ← swap 4
5.  refactor(engine): heightmap-templates 用 d3-delaunay.find  ← swap 3
6.  refactor(engine): worker-bridge 改用 comlink                ← swap 5
7.  refactor(engine): heightmap/coast 共享 simplex-noise FBM    ← swap 2
```

每个 commit 独立可回滚，diff 控制在 1-2 个文件。

## Swap 1 — `alea` 替 `random.ts`

**动机**：`random.ts` 的 `mash` + `2091639 * s0 + c * 2.3283064365386963e-10` 循环就是 Alea 的源码，连 JSDoc 注释都写 "Alea PRNG"。直接装包。

**改动**：

- `package.json` `dependencies` 加 `"alea": "^1.0.1"`（MIT，~1 KB，无传递依赖）
- `random.ts` 删 `mash` + `seedRandom` 实现，改为 `export function seedRandom(seed: string): () => number { return alea(seed) }`
- `gauss` / `randInt` / `chance` / `pick` 4 个 helper **完全不动**
- JSDoc 注释里"逐字复刻 Alea"删掉，换成"基于 alea npm 包"

**对外 API**：`seedRandom(seed: string) => () => number` 签名保留。JSDoc 注释更新。

**测试**：不加新测试（已有 `heightmap-azgaar.test.js` 8 个测试覆盖种子稳定性）。

## Swap 3 — `d3-delaunay` 替 `findGridCell`

**动机**：`heightmap-templates.ts:308-321::findGridCell` 暴力 O(N) 最近格点查找；`addHill` / `addRange` / `addTrough` / `addStrait` 每次都调它。对于 3000 格 × 14 个模板 × 几行 = 几十万次暴力扫描。

**改动**：

- `package.json` `dependencies` 加 `"d3-delaunay": "^6.0.4"`（ISC，依赖项目里已装的 `delaunator@^5.1.0`）
- `heightmap-templates.ts:308-321` 删暴力实现；`applyTemplate` 入口构造一次 `Delaunay.from(cellPoints)`，闭包传给 4 个 `add*` 函数
- **不复用** `grid.ts:49` 的 `delaunator` 实例（`d3-delaunay` 需要其 `Delaunay` 包装，跨模块共享点数组风险更大）
- `HEIGHTMAP_TEMPLATES` 字符串本身**不动**

**对外 API**：`HEIGHTMAP_TEMPLATES` / `pickTemplate` / `applyTemplate` 全部不变。

**测试**：不加新测试（不验证 perf）。

## Swap 4 — `graphology` 替两份堆

**动机**：`nations.ts:222-286`（Dijkstra 给 `expandStates` 用）和 `nations.ts:625-680`（A* 给 `findPath` 用）是**两份几乎相同的手写二叉堆**。堆腐败 bug 史：`3678bf1` 提交 message "MOVE vs SWAP"，`e3828b2` 提交 message "rewrite nations with binary-heap A* and Dijkstra"。这是项目已经反复踩过的坑。

**改动**：

- `package.json` `dependencies` 加 `"graphology": "^0.26.0"`（MIT）和 `"graphology-shortest-path": "^2.0.0"`（MIT）
- `expandStates`：从 `cells.c` 构一个无向 `Graph`（仅陆地边），加一个虚拟超级源连各首都不带权。`dijkstra.bidirectional` 配 `getEdgeWeight` 复现原成本公式：
  ```ts
  edgeWeight = (biome.moveCost[neighbor] / 10
               + cultureCrossPenalty(a, b)
               + uninhabitedPenalty
               + elevationCost(a, b)) / stateData.expansionism
  ```
  `maxCost = n * 0.8` → `cutoff`。
- `findPath`：直接 `bidirectional.dijkstra`（Voronoi 图 ~20K 节点 Dijkstra < 100ms，**不**用 A*，免维护启发式；profiling 显示慢再切 `astar`）
- **诊断接口兼容**：
  - `__test_setExpandStatesDiagnosticsEnabled` / `__test_getLastExpandStatesDiagnostics` 保留
  - `diagnostics.pushCount` 改计 `edges relaxed`（在 `getEdgeWeight` 里 `++`）
  - `diagnostics.maxHeap` 改为 0（堆由库管，库不暴露）
- **`nations.test.js` 的 bad-seed 回归测试一并调整**：
  - `pushCount < 50000` → `edges relaxed` 的合理上限（按实测放宽）
  - `maxHeap < 5000` → 改为 `0`（库不暴露）
  - `stateMs < 5000` 性能门**保留不动**
  - 在 commit message 写清楚"语义变化"以备 review

**对外 API**：`generateBurgs` / `generateStates` / `generateCultures` / `generateProvinces` / `generateRoads` 签名不变。`__test_*` 接口保留。

**测试**：`nations.test.js` 全套（bad-seed 回归 + 3 个 expandStates + 2 个 findPath）必须绿。

## Swap 5 — `comlink` 替 `worker-bridge`

**动机**：`worker-bridge.ts:17-100` + `worker.ts:25-37` 是 100 行手写 IPC：`requestId` 关联 / `pending` Map / 60s 超时 / `JSON.parse(JSON.stringify(...))` 剥 Vue proxy。Comlink 是 Google Chrome Labs 出的标准库，专门干这个。

**改动**：

- `package.json` `dependencies` 加 `"comlink": "^4.4.2"`（Apache-2.0，~5 KB）
- `worker-bridge.ts`：删 `pending` / `requestId` / 60s 计时器，wrap comlink proxy；`generateMapInWorker(config?, options?) => Promise<{data, meta}>` 字面保留
- `worker.ts`：`onmessage` → `Comlink.expose({ generateMap })`
- **`serializeConfigForWorker` 保留原样**继续在边界剥 Vue proxy（已验证过，**不**改 transfer handler）
- **60s 超时**用 `Promise.race([proxyCall, timeoutPromise])` 包装一次
- **模块 worker** `type: 'module'` 保留；Vite 必须能 emit worker chunk
- **公共 API 不变**：`WorldMapVoronoi.vue:172,260,612` 调用点零修改

**对外 API**：`generateMapInWorker` / `terminateWorker` / `serializeConfigForWorker` 签名一字不动。

**测试**：`worker-bridge.test.js` 全套必须绿。`npm run build` 必须成功（捕获 worker chunk 回归）。

**手动 smoke**：`npm run dev` → 打开世界地图页 → 用 `pointCount` 2 000 / 10 000 / 20 000 各生成一张图 → 控制台无 Worker error → PerfOverlay 仍显示各阶段计时。

## Swap 2 — `simplex-noise` 替两份 FBM（**最高风险**）

**动机**：`heightmap.ts:120-138` 和 `coast.ts:18-36` 各自手写一份 `Math.sin` 哈希 + FBM，**两份字面相同**。`Math.sin(x*12.9898 + y*78.233) * 43758.5453` 是 GLSL 经典哈希，**不**可种子化、连续性差。`simplex-noise` 是社区标准、MIT、有类型、2D/3D/4D + seeded。

**改动**：

- `package.json` `dependencies` 加 `"simplex-noise": "^4.0.3"`（MIT）
- 新 `src/services/world-map/engine/noise.ts`：
  ```ts
  import { createNoise2D } from 'simplex-noise'
  import type { Alea } from 'alea'
  export function createFbm2D(rng: () => number, octaves = 4): (x: number, y: number) => number {
    const noise2D = createNoise2D(rng)
    return (x, y) => {
      let v = 0, amp = 1, freq = 1, max = 0
      for (let i = 0; i < octaves; i++) {
        v += amp * noise2D(x * freq, y * freq)
        max += amp
        amp *= 0.5
        freq *= 2
      }
      return v / max
    }
  }
  ```
- `heightmap.ts:71` 和 `coast.ts:59` 两处 FBM 调用都换成新 helper，**rng 出自 `seedRandom(seed)`**

**A/B 验证（必做）**：

1. swap 之前：在干净 commit 跑 `node --input-type=module -e "..."` 用 `seed: 'az-3'` `pointCount: 3000` `landRatio: 0.45` 落 `tmp/old-h.json`，统计 `water%`
2. swap 之后：同样种子跑新实现落 `tmp/new-h.json`
3. 接受条件：`water%` 偏差 < 2pp；8 个 `heightmap-azgaar.test.js` 测试**全绿**

**如果 `realism-classic-compat.test.js` 快照了 exact heights**：

- 提交前**先读**该测试
- 若快照了 exact heights：要么改测试要么按 A/B 结果 re-snapshot
- 在 commit message 写理由

## 风险与缓解

| # | 风险 | 缓解 |
|---|---|---|
| 1 | simplex-noise 改变地形 bytes | A/B 验证（见上），water% 偏差 > 2pp 则不提交，调 octaves/scale 后重测 |
| 2 | graphology dijkstra 权值语义差异 | 提交前**先读** `graphology-shortest-path/dijkstra` 源码（~100 LOC）确认 `getEdgeWeight` 在边的两端都可见 |
| 3 | bad-seed 回归测试的 `pushCount`/`maxHeap` 断言会坏 | 在同一个 swap 4 的 commit 里**一并改测试**（详见 swap 4 节），`stateMs < 5000` 性能门保留 |
| 4 | comlink + Vue proxy 兼容 | 保留 `serializeConfigForWorker` 现状，**不**在同一 commit 改 transfer handler |
| 5 | `.ts` 测试在 `vitest.config.js` 不会被匹配（include 是 `.{js,mjs}`） | 不写任何 `.ts` 测试；如需 `noise.ts` 单元测试就用 `.js` import |

## 验证

每个 commit 后跑（按顺序）：

```bash
npm run lint
npm run test:run
npm run test:run -- heightmap-azgaar    # 8 个核心契约
npm run test:run -- nations             # swap 4 重点
npm run test:run -- worker-bridge       # swap 5 重点
npm run verify                          # test:run + vite build
```

**Swap 2 专用 A/B 验证**（在 swap 2 commit 之前和之后各跑一次）：

```bash
node --input-type=module -e "
import { generateMap } from './src/services/world-map/engine/generate.ts'
const d = generateMap({ seed: 'az-3', pointCount: 3000, landRatio: 0.45 })
const h = [...d.cells.h]
const water = h.filter(x => x < 20).length
console.log(JSON.stringify({ water, total: h.length, ratio: +(water/h.length).toFixed(4) }))
"
```

## 接受标准

- ✅ 7 个 commit 全部干净，每个独立可回滚
- ✅ `npm run verify` 在最后 swap 2 commit 之后**全绿**
- ✅ `npm run test:run -- heightmap-azgaar` 8 个测试全绿
- ✅ `nations.test.js` bad-seed 回归测试通过（断言值已更新）
- ✅ 5 个 `_debug-*.test.js` 已删，`git status` 不再列出
- ✅ diff 净减 ≥ 300 LOC（不含新 `noise.ts`）
