# States Perf 残余问题（states perf residual issue）

日期：2026-06-02
模块：`src/services/world-map/engine/nations.ts` 中的 `expandStates`（Dijkstra 领土扩张）

> **SUPERSEDED 2026-06-04** — `heightmapTemplate: 'pangea'` + `seed=42` 的慢路径触发器已随 10 个 heightmap 模板的删除而消失。
> 新测试触发器改为 `plateCount: 2` + `seed=42`（见 `src/__tests__/nations.test.js`）。
> 本文档其余结论（Dijkstra 边界场景、heap 退化路径）仍然相关，保留以供参考。

## TL;DR

`expandStates` 的二叉堆 `heapPop` 中**下滤模式错误（MOVE vs SWAP）已经修复**，
并且对**绝大多数**配置在合成基准与全量 perf sweep 中都达到毫秒级。
但**仍然存在**至少 2 个配置（pangea 模板 + seed=42）`generateStates` 单步耗时 ~110 秒，
导致 `WorldMapVoronoi.vue` 中的 60 秒 `REQUEST_TIMEOUT_MS` 必触发，
在浏览器侧表现为 `Failed to execute 'structuredClone'` 的报错（worker 永远不返回 → 主线程拿到的是旧 proxy，postMessage 失败）。

下一轮需要诊断：**heap 之外的某个代码路径**在该拓扑下退化。

## 已经修复的部分

### 1. 根因：二叉堆 `heapPop` 的 MOVE 模式

`src/services/world-map/engine/nations.ts:209-240`（以及 `findPath:589-611`）的 `heapPop` 原本使用 MOVE 模式：

```ts
// ❌ 旧实现（MOVE 模式）
heapCost[i] = heapCost[smallest]
heapCell[i] = heapCell[smallest]
i = smallest
// 循环结束后再把 lastC 放回去
heapCost[i] = lastC
heapCell[i] = lastCell
```

问题：进入下一轮比较 `heapCost[l] < heapCost[smallest]` 时，
`heapCost[smallest]` 已是下滤过程中保留的**旧子节点值**（不是真正的下滤基准 lastC），
堆序被破坏，后续 pop 出来的 cost 顺序错乱，触发大量重复 push。

```ts
// ✅ 新实现（SWAP 模式）
const tmpC = heapCost[i]
const tmpCell = heapCell[i]
heapCost[i] = heapCost[smallest]
heapCell[i] = heapCell[smallest]
heapCost[smallest] = tmpC
heapCell[smallest] = tmpCell
i = smallest
```

### 2. 合成基准验证（standalone）

`/tmp/dijkstra-bench.mjs`（N=20000，6 邻居，8 个源）：

| 实现 | pop 次数 | 时间 |
|---|---|---|
| 旧 MOVE | 13,629,775 | >15s（超时） |
| 线性扫描基线 | 23,558 | ~120ms |
| 修后 SWAP | 23,558 | ~150ms |

1000 倍加速，与线性扫描在常数因子上完全吻合（堆的 O(log n) 期望）。

### 3. 全量 perf sweep 结果（截至 log:805）

`/tmp/sweep.log` 共 189 个配置（7 模板 × 3 pointCount × 3 洲数 × 3 种子）。
已完成 53/189，**states 阶段耗时分布**：

| 区间 | 数量 | 占比 |
|---|---|---|
| < 500ms | 50 | 94% |
| 500ms-5s | 1 | 2% |
| > 5s | 2 | 4% |

50 个 < 500ms 的样本里包含原报告的 `continents pc=20000 cc=1 seed=7`，从 >60s 降到 58ms。

**所有慢配置的共同模式**：

```
pangea        pc=20000 cc=1 seed=  42   states=107049.7ms  (1:47)
pangea        pc=20000 cc=2 seed=  42   states=106360.8ms  (1:46)
```

特征：模板必须是 pangea，pc=20000，seed 必须是 42。
改 seed=1/7 或改成 continents 模板都毫秒级。

## 仍未修复的部分

### 现象

```text
[MapEngine] Burgs: 7.978ms
[MapEngine] States: 1:49.938 (m:ss.mmm)
[MapEngine] Provinces: 10.213ms
[MapEngine] Total generation: 1:50.350 (m:ss.mmm)
```

`States` 阶段（`generateStates`）耗时 ~110s。
最终生成的 8 个国家大小正常（59–2044 cell / state，total ≈ land count 9229），
**说明最终状态本身正确，但算法在这个拓扑下走了指数级路径**。

### 排除了什么

- 合成基准下 `SWAP` 堆与 `linear scan` pop 数完全一致（23,558），堆本身没问题
- 邻居数、land/ocean 比、capitals 之间距离都和 seed=1/7 类似
- 同 seed=42 + `continents` 模板：正常（几百毫秒）

### 工作假说（按可能性排序）

1. **Voronoi 邻居图局部密度异常** — pangea+seed=42 可能让某些 cell 的
   `cells.c[cell].length` 远大于平均（已观察到最大 14，平均 6）。
   若某些 cell 在 Dijkstra 主循环里反复 `push` 又 `pop`，
   堆扩容（`newCap = heapCost.length * 2`）触发的 `set(heapCost)` 拷贝可能成为瓶颈。
   需在 expandStates 里加一个 `__maxHeap` + `__totalPushes` 计数器验证。

2. **`cells.culture` 跨文化成本** — `moveCost += 50` 当邻居文化不同。
   若文化中心排列使得绝大多数边都跨文化，每条边的 cost 都偏大，
   `totalCost` 增长更快但 push 数不增。可能性低。

3. **海平面 + 山地惩罚** — `if (cells.h[neighbor] > 70) moveCost += (h-70)*5`。
   若 seed=42 产生很多 h>70 的高地，移动代价极高，
   Dijkstra 在跨越高山的步骤中频繁触发 `currentCost > cost[cell]` 的 stale 路径。
   不会增加 push 数但会浪费 pop 次数（**注意 Dijkstra 的 pop 数是有界的 = push 数 + 1**）。

4. **浮点 NaN/Infinity 路径** — 若某些 `moveCost / stateData.expansionism` 算出 NaN，
   `totalCost < cost[neighbor]` 恒为 false，cell 永远不更新，但不影响 push 数。
   验证方式：单步 `pangea pc=20000 cc=1 seed=42` 后 dump `cost[100]` 之类的若干值。

5. **`expandStates` 之外的 `generateStates` 部分** — lines 147-167 里有
   `for (let i = 0; i < cells.length; i++) if (cells.state[i] === state.i) cellCount++`
   这种 O(states × cells) 双重循环。states=8, cells=20000, 160k 次比较。
   其他配置也是这个量级，不会成为瓶颈。但**第 291-310 行的 smoothing pass**
   3 × 20000 × 6 neighbors ≈ 360k 次外加 `Object.entries` 分配，
   若 V8 没把它 JIT 掉，~100ms 级别，**不是 110s 的主因**。

### 最高优先验证

把 `__popCount / __pushCount / __staleCount / __maxHeap` 4 个计数器加进
`expandStates`，在 pangea pc=20000 cc=1 seed=42 上跑一次。
- 若 `__pushCount ≈ 20000`：堆本身没问题，问题在堆外（per-iteration work）
- 若 `__pushCount > 200000`：某个边界条件导致 cell 被反复 push，定位到具体 cell
- 若 `__maxHeap > 50000`：堆扩容的 `set` 拷贝是瓶颈

## 仍待调查的 `structuredClone` 报错

`Failed to execute 'structuredClone' on 'Window': [object Array] could not be cloned.`

源头在 `worker-bridge.ts` 的 `self.postMessage(response)`（line 66 内部走 structuredClone），
而 `response.data` 是 `VoronoiMapData`（含 reactive proxy 化的 cells）。
之前 `WorldMapVoronoi.vue:58372e2` 已经用 `JSON.parse(JSON.stringify(cfg))` 处理 cfg 端，
但 cells 数据是 worker 内**生成**后 postMessage 回来，理论上应是普通对象不是 proxy。
**怀疑**：60s 超时后 worker 被丢弃，主线程 await 永远 pending，UI 触发了另一条
fallback 路径，里面某个对象被 proxy 包了。

**这取决于 perf bug 是否真的修干净**——如果 states 阶段 < 5s，整个 postMessage 链路
不会再触发超时，structuredClone 报错会自然消失。

## 复现脚本

```bash
npx tsx -e "
import { generateMap } from './src/services/world-map/engine/generate.ts';
import { PerfCollector } from './src/services/world-map/engine/perf.ts';
const cfg = { seed: '42', pointCount: 20000, continentCount: 1, stateCount: 8, heightmapTemplate: 'pangea' };
const t0 = Date.now();
generateMap(cfg, new PerfCollector());
console.log('total:', Date.now()-t0, 'ms');
"
```

实测：~111s，其中 states 阶段 ~110s。

## 下一轮可做

- [ ] 在 `expandStates` 临时加 4 个计数器，跑一次确认 push/pop 量级
- [ ] 若 push 数正常（≈ 2×cells），把 `cells.c[cell]` 的迭代替换为 flat
      `Int32Array`（类似 heap），消除 V8 hidden class 上的 property load 开销
- [ ] 把 smoothing pass 替换成 `Int32Array(stateCount+1)` 直方图（已写好
      `/tmp/smoothing-bench.mjs` 验证 2-3 倍加速），但注意 priority：
      smoothing 不会让 states 阶段从 110s 变 1s

## 相关文件

- `src/services/world-map/engine/nations.ts:175-311` — expandStates（含修复后的堆）
- `src/services/world-map/engine/nations.ts:562-680` — findPath（同样的 SWAP 修复）
- `src/services/world-map/engine/worker-bridge.ts:9` — 60s REQUEST_TIMEOUT_MS
- `src/components/geography/WorldMapVoronoi.vue:58372e2` — cfg 端 JSON 兜底
- `/tmp/sweep.log` — perf sweep 部分日志（53/189）
- `/tmp/dijkstra-bench.mjs` — 合成基准（验证 SWAP 修复有效）
- `/tmp/diag-states.mjs` — 复现脚本
