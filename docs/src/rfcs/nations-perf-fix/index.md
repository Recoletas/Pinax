<!-- canonical-source -->

- **状态**: accepted
- **负责人**: @Recoletas
- **最后更新**: 2026-06-02
- **领域**: world-map
- **开放问题**: 无（已落地）
- **下一步**: 已落地；维护阶段不主动推进

---

# `states` 与 `roads` 阶段性能修复

日期: 2026-06-02
状态: 已批准，已落地

## 目标

修复 Voronoi 地图生成管线中两个**实测**已被识别为瓶颈的阶段：

1. **`states` 阶段**的尾部延迟 bug — 在某些 seed 下，`expandStates` 的 36.81 s 运行时（占总生成时间 99.4%）
2. **`roads` 阶段**的 A\* 优先级队列 bug — 在常规 seed 下稳定的 226 ms 运行时（占总生成时间 62.7%）

使两次运行在常规 seed 与 pathological seed 下都能在毫秒级完成，且**输出形状不变**（renderer 契约不破）。

## 范围

- 重写 `src/services/world-map/engine/nations.ts` 中 `expandStates`（约 60 行替换）
- 重写 `src/services/world-map/engine/nations.ts` 中 `findPath`（约 60 行替换）
- 新增 `src/__tests__/nations.test.js`，5 个表征测试
- 修复**不**触碰 `VoronoiMapData`、renderer、`State` / `Road` 形状、worker 边界、`usePerf` composable、收集器调用

## 不在本 spec 范围

- `roads` 阶段剩余的 per-call 分配（`Float32Array(n)` per findPath、每 cell `[x,y]` tuple）— 单独 spec
- 任何 countries / provinces / 高度图 / 气候 / 板块阶段的改动
- WebAssembly 移植、Web Worker 并行化
- 按 seed 缓存生成结果
- 改用 Uint16Array 替代对象数组（即使在 spec 的"后续 spec 计划"里被提过 — 数据说优先修 heap bug）
- 任何渲染层改动

## 动机与数据

来自 `?debug=perf` 浮层两次收集的实测数据：

| Run | 总耗时 | 最慢阶段 | 占比 |
|---|---|---|---|
| #1 (normal seed) | 361 ms | `roads` 226 ms | 62.7% |
| #2 (pathological seed) | 37,021 ms | `states` 36,810 ms | 99.4% |

两阶段都源于**错误的优先级队列实现**（sort 替代 heap，splice 替代 decrease-key），且都缺**关闭集/已处理标志**。

## 架构

### 修改的文件

- `src/services/world-map/engine/nations.ts`
  - `expandStates`（行 173-261）：保留状态初始化（行 116-144）、stat tally（155-167）、smoothing（240-260）三段不变；重写核心 Dijkstra 循环（行 178-237）。
  - `findPath`（行 512-574）：整段重写。`path.unshift` 反向回溯改为 `push` + `reverse`。
  - `generateRoads`（行 412-509）**不**改 — `findPath` 内部修复即生效。
  - `generateStates`（行 116-170）**不**改 — 它只负责初始化和包装 `expandStates`。

### 新文件

- `src/__tests__/nations.test.js` — 5 个 vitest 覆盖：
  1. `generateStates` 在小型 200-cell 网格上：所有 land cell 被某个 state 认领；邻接 capital 的 cell 归相应 capital
  2. `findPath` 在 50-cell 走廊上：返回的 path 是邻居 cell 序列、长度与手算答案一致
  3. `findPath` 在不可达目标上：返回 `null` 或空数组，不抛错
  4. **Idempotence 测试**：固定 seed 下，`generateMap` 输出的 `cells.state` 数组与 pre-fix 记录的字面常量匹配（pre-fix 输出作为内联常量写在测试里 — 不引 `.snap` 文件，本项目无此约定）
  5. **Bad-seed 回归测试**：挑选或计算一组能复现 36-second 路径的 config；用 `performance.now()` 计时 `states` 阶段；断言 <500ms

  测试使用 vitest 现有 esbuild 转译对 `.ts` 引擎的支持；测试文件本身用 `.js`，匹配项目惯例。

### 数据流（无变化）

```
[main] WorldMapVoronoi.doGenerate
  └─ generateMapInWorker
[worker] generateMap / generateMapAsync
  ├─ collector.start('states')    // 仍是同一对调用
  ├─ expandStates (新实现)
  ├─ collector.end('states')
  ├─ collector.start('roads')
  ├─ generateRoads → findPath (新实现)
  └─ collector.end('roads')
[main] usePerf.record(meta)
  └─ overlay / console 输出阶段耗时
```

## 组件

### A. `expandStates` Dijkstra 重写

**替换** `nations.ts:178-237` 的 `queue` + `findIndex` + `splice` 实现。

**新数据结构**（在 `expandStates` 入口一次性分配；行 178 之前）：

```ts
const n = cells.c.length
const gScore = new Float32Array(n)   // 到达每 cell 的最佳 cost
const prev = new Int32Array(n)       // 路径回溯
prev.fill(-1)
// 二叉堆：cost / cell 两路平行 typed array
let heapCost = new Float32Array(Math.max(n, 16))
let heapCell = new Int32Array(heapCost.length)
let heapSize = 0
```

**新堆操作**（本地 helpers）：

- `heapPush(cost, cell)`：append at end, siftUp。O(log Q)。
- `heapPop()`：返回 `{cost, cell}`，与末尾交换，siftDown，size--。O(log Q)。
- `decreaseKey(cell, newCost)`：在 `[0, heapSize)` 线性扫找 cell（典型 n=6000，可接受）；找到则 siftUp；找不到则 heapPush。O(Q) — 对 n=6000 仍然是常数因子代价，可接受；若后续 profile 显示瓶颈可改用 `indexInHeap: Int32Array(n)` 索引表。

**新主循环**（替换行 197-235）：

```
heapPush(0, capitalCell)  // 每个 state 一次
gScore[capitalCell] = 0
cells.state[capitalCell] = stateIdx

while heapSize > 0:
  { cost, cell } = heapPop()
  if cost > gScore[cell]: continue    // stale entry，跳过
  for each neighbor n of cell:        // 6 邻 Voronoi
    movePenalty = biomeCost(cell, n, stateIdx)  // 复用原 logic
    newCost = cost + movePenalty
    if newCost < gScore[n]:
      gScore[n] = newCost
      prev[n] = cell
      cells.state[n] = stateIdx
      heapPush(newCost, n)
```

**关键不变量**：
- `gScore[cell]` 永远是最小已知 cost（lazy decrease-key 通过 `cost > gScore[cell]` 检查过滤 stale）
- 关闭集隐式 — cell 在被 `heapPop` 时如果 `cost === gScore[cell]` 即最终被处理
- `cells.state[i]` 在 Dijkstra 主循环内即时写入（与原实现一致）— 平滑 pass（行 240-260）看到的是完整 `cells.state`

**Smoothing**（行 240-260）**不**改 — O(N) 固定开销，不是瓶颈。
**Stat tally**（行 155-167）**不**改 — 同上。

### B. `findPath` A\* 重写

**替换** `nations.ts:512-574` 的 sort-priority-queue A\*。

**新数据结构**（每次 findPath 调用入口；这些分配从 60+ 次调用降为同样的 60+ 次但内部开销小几个数量级）：

```ts
const n = cells.c.length
const gScore = new Float32Array(n)
const parent = new Int32Array(n)
parent.fill(-1)
const closed = new Uint8Array(n)   // 关闭集
let heapCost = new Float32Array(n) // f = g + h
let heapCell = new Int32Array(n)
let heapSize = 0
```

**新主循环**：

```
heapPush(heuristic(start, goal), start)
gScore[start] = 0

while heapSize > 0:
  { f, cell } = heapPop()
  if closed[cell]: continue
  if cell === goal: break            // 找到
  closed[cell] = 1
  for each neighbor n of cell:
    if closed[n]: continue
    tentativeG = gScore[cell] + 1    // Voronoi cell graph 单位 cost（与原实现一致）
    if tentativeG < gScore[n]:
      gScore[n] = tentativeG
      parent[n] = cell
      heapPush(tentativeG + heuristic(n, goal), n)

// 回溯：forward push + reverse
const path = []
let cur = goal
while cur !== -1:
  path.push(cur)
  cur = parent[cur]
path.reverse()
return path
```

**关键变化**：
- 二叉堆替代 sort-on-push（O(log Q) vs O(Q log Q)）
- 显式 `closed` 集合替代 `cost > gScore[cell]` 隐式检查
- `push` + `reverse` 替代 `unshift`（O(L) vs O(L²)）

### C. 测试策略

`src/__tests__/nations.test.js` 详细设计见 §"测试"。

## 错误处理

| 失败场景 | 当前行为 | 本 spec 后 |
|---|---|---|
| 堆分配 `Float32Array(n)` OOM | 与现在一致 | 与现在一致（n=6000 ~24KB，无实际风险） |
| `expandStates` 中途抛错 | 整管线 reject，UI 展示错误 | 同 — heap 内部不抛新错 |
| 关闭集 + decrease-key 漏掉某 cell | n/a（新机制不存在此情形） | `closed` 位 + `gScore` 比较共同保证：每 cell 最多处理一次 |
| 预计算 heuristic 错误 | 路径仍有效，只是非最优 | 复用原 `heuristic` 逻辑，不动 |
| 测试用 seed 在 pre-fix / post-fix 引擎上行为不同 | 视 seed 而定 | 测试 #4 用内联常量锁住 pre-fix 输出，确保形状未变 |

## 测试

### 单元测试（新增 `src/__tests__/nations.test.js`）

**1. `generateStates` 邻接正确性**
构造一个 200-cell 网格、2 个 capital、简单 biome。断言：
- 所有 `land` cell 的 `cells.state[i] !== 0`（被认领）
- `state.cells.length` 之和 = land cell 总数（无遗漏、无重复）
- 至少一个 capital 邻接 cell 归该 capital

**2. `findPath` 路径正确性**
50-cell 线性走廊（每个 cell 6 邻中只有 1-2 个邻居在走廊内）。断言：
- 返回的 path 是邻居 cell 序列
- 长度等于手算答案
- 起末 cell 与输入一致

**3. `findPath` 不可达**
构造一个目标 cell 周围被冰川/深海完全包围。断言：
- 返回 `null` 或空数组
- 不抛错

**4. Idempotence / 形状回归**
固定 seed（用 `config.seed` 或直接注入固定 `rng`），调用 `generateMap`。将输出 `cells.state`、`state.cells`、`state.color` 与 pre-fix 跑出来的内联常量逐项比较。pre-fix 输出作为测试源里的字面常量保存。

如果 pre-fix 实现因其他原因产生稍微不同的结果（理论上 Dijkstra 重写后同 seed 同 rng 必产生同输出，但保险起见），接受"形状一致 + 关键 invariant 一致"作为最低标准。

**5. Bad-seed 回归（**核心安全网**）**
用一个已知能触发 36-second 路径的 config 调用 `generateMap`，用 `performance.now()` 包住生成调用。断言总耗时 <500ms（或 `states` 阶段 <100ms — 二选一，看实现难度）。

> **如何得到 bad seed**：在 pre-fix 代码上跑 ~20 次，收集 `states` 阶段耗时分布，挑出 >1s 的那个，记下 `config`（尤其是 `seed`、`plateCount` 等可能影响 capital 放置的参数）。这步是**spec 实现前**必须做的预工作。

**测试运行器**：vitest 已有，本 spec 不新增依赖。

### 手动冒烟

1. `npm run dev`
2. 访问 `http://localhost:5173/world-map?debug=perf`
3. 生成 3-5 次不同 seed 的地图
4. 浮层面板中 `states` 阶段应 <30ms，`roads` 应 <100ms
5. 视觉对比：与 pre-fix 生成的地图应**视觉上不可区分**（河流、国界、城镇归属一致）
6. 移除 `?debug=perf`、刷新，确认无 console group 输出

### 不写的内容

- 不写 perf 基准测试（用 ?debug=perf 浮层即可）
- 不写 VTU 渲染测试
- 不写 worker 端到端集成测试

## 成功标准

实现完成、提交但未推送前需验证：

- [ ] 全部 203 个现有测试通过
- [ ] 新增 5 个 nations 测试通过
- [ ] `npx vite build --mode production` 无错误
- [ ] `?debug=perf` 下，bad-seed `states` 阶段 <100ms
- [ ] `?debug=perf` 下，normal-seed `roads` 阶段 <100ms
- [ ] 视觉对比：同 seed 下，pre-fix 与 post-fix 生成的地图**像素级一致**（用旧版生成一张截图，再切到新版生成同 seed，对比；diff 应为零或仅抗锯齿抖动）

## 后续 spec 计划

实现本 spec 后，下次 profile 再决定：

- **若 `roads` 仍显著**（>50ms） → 单独 spec 做 `roads` 分配清理（`Float32Array(n)` per findPath、每 cell `[x,y]` tuple、`{burg, dist}` 对象）
- **若多个阶段均衡** → 单独 spec 评估跨阶段共享优化（共用 `gScore` 缓冲之类）
- **若 `heightmap` / `wind` / `climate` 浮上来** → 单独 spec 处理各自瓶颈

这些都明确**不**在本 spec 内。

## 关键不变式（实现期间需保持）

1. `cells.state` 数组在 `expandStates` 结束后被完整写入，与 pre-fix 同 seed 同 rng 必产生同结果
2. `roads[].cells` 与 `roads[].points` 字段保持存在、保持相同语义
3. `roads[].points` 中每个 cell 坐标与 `cells.p[i*2..i*2+1]` 一致
4. `Road.type` 取值集不变（`'major' | 'minor' | 'trade' | 'sea'`）
5. `State` 字段集不变（`i, name, color, expansionism, area, capital, cells, totalPopulation`）
6. `findPath` 不可达时返回 `null` 或空数组（不抛错，与原实现行为一致）
7. `collector?.start/end('states')` / `('roads')` 调用对不变
