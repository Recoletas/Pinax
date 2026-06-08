<!-- canonical-source -->

- **状态**: accepted
- **负责人**: @Recoletas
- **最后更新**: 2026-06-01
- **领域**: world-map
- **开放问题**: 无（已落地）
- **下一步**: 已落地；维护阶段不主动推进

---

# 地图生成性能分析基础设施

日期: 2026-06-01
状态: 已批准，待实现

## 目标

为地图生成管线引入分阶段计时能力，使我们能够**先识别瓶颈阶段，再做有针对性的优化**。在看到数据之前，不对任何具体阶段做算法重写。

## 范围

本 spec 仅覆盖**性能测量基础设施**：

1. 在生成管线的每个阶段记录耗时
2. 在 dev 模式下通过一个可关闭的浮层面板呈现这些数据
3. 在 devtools 控制台输出可复制的表格

实际优化（针对最慢阶段的算法重写 / 内存优化 / 并行化）是一个**后续 spec**，由本 spec 收集到的数据驱动。

## 不在本 spec 范围

- 任何 Voronoi / 高度图 / 气候 / 板块 / 国家的算法改动
- 改用 WebAssembly 移植热路径
- 把工作拆分到多个 Web Worker
- 按 seed 缓存生成结果
- 修改 `VoronoiMapData` 主类型
- 修改任何已存在的渲染层

## 架构

### 测量来源

`engine/generate.ts` 已经在每个阶段使用 `console.time` / `console.timeEnd`：

```ts
console.time('[MapEngine] Grid')
const points = generatePoints(...)
const { cells, vertices } = buildVoronoi(...)
console.timeEnd('[MapEngine] Grid')
```

我们**不删除** `console.time` 调用，而是把它们包在一个 `PerfCollector` 对象外：

```ts
collector?.start('grid')
const points = generatePoints(...)
const { cells, vertices } = buildVoronoi(...)
collector?.end('grid')
```

collector 缺失时 `?.` 链式调用全部 no-op，向后兼容所有调用方。

### Worker 边界

今天 worker 的响应只有 `{ id, data }`。本 spec 扩展为 `{ id, data, meta }`，其中：

```ts
type GenerationMeta = {
  timings: Array<{ stage: string; durationMs: number }>
  totalMs: number
  seed: string
}
```

`VoronoiMapData` 类型保持纯净。timings 永远不进入渲染层。

### 跨线程的 dev flag

`?debug=perf` 是 dev-only 的开关。worker 端按以下规则处理：

- 在 `config` 中新增一个可选字段 `__debugPerf?: boolean`
- Worker 端读取这个字段，仅当为真时构造 `PerfCollector`
- 若未启用，timings 数组为空对象 `{ timings: [], totalMs: 0 }`，主线程在 dev flag 关闭时也直接丢弃

主线程（`WorldMapPanel.vue` / `WorldMapVoronoi.vue`）从 URL 读取 `?debug=perf`，只在 dev flag 打开时把 `__debugPerf: true` 注入到 config。

## 组件与数据流

### 新文件

- `src/services/world-map/engine/perf.ts` — `PerfCollector` 类
  - `start(name: string)`: 记录开始时间戳
  - `end(name: string)`: 计算耗时并 push 进数组
  - `finish()`: 记录总耗时，返回 `GenerationMeta`
  - 阶段名重复 `end` 不会抛错，而是合并到该阶段名的最新一条
  - `end` 没匹配的 `start` 是 no-op

- `src/composables/usePerf.js` — Vue composable
  - 模块加载时一次性读取 `?debug=perf`
  - 暴露 `record(meta)` — 若 flag 关闭直接 return
  - 暴露 `history: Ref<GenerationMeta[]>` — 全部历史记录（追加，最新在末尾）
  - 暴露 `latest = computed(() => history.value.at(-1) ?? null)` — 给 overlay 用
  - 暴露 `clear()` — 清空历史

- `src/components/debug/PerfOverlay.vue` — 浮层面板组件
  - 仅当 flag 打开时渲染
  - 内部通过 `usePerf()` 拿 `latest`，不接 prop
  - 自带"清除"按钮
  - 用现有 token：`--bg-secondary` / `--border` / `--text-muted` / `--accent`
  - 不写 scoped CSS，复用现有变量

- `docs/superpowers/notes/perf-overlay.md` — 一句话说明 URL flag 用法（放在 docs 下，因为属于开发工具说明，不在 src 树里）

### 修改的文件

- `engine/generate.ts`
  - `generateMap(config, collector?)` 增加可选参数
  - 每个 `console.time` 调用外包 `collector?.start/end`，但 `console.time/timeEnd` 本身保留
  - **新增** `collector?.start/end('population')` 包住 Population 那段循环（原代码无 console.time）
  - `console.time('[MapEngine] Total generation')` / `console.timeEnd` 这一对外**不**包到 collector 里——它在 collector 自身构造之前已开始，collector 用 `finish()` 内部记录自己的总耗时更准确
  - `generateMapAsync(config, onProgress?, collector?)` 同上
  - 末尾若 collector 存在，附加 `meta = collector.finish()` 到返回值外层对象

  最终 collector 包含 13 个具名阶段（grid / heightmap / tectonics / features / wind & currents / climate / rivers / biomes / population / cultures / burgs / states / provinces / roads，其中 population 是新增），`finish()` 单独算 `totalMs`。

- `engine/worker.ts`
  - 读取 `config.__debugPerf`
  - 若为真，构造 collector 并传给 `generateMap`
  - postMessage payload 形如 `{ id, data, meta: collector?.finish() ?? { timings: [], totalMs: 0 } }`

- `engine/worker-bridge.ts`
  - 响应类型从 `{ data }` 扩为 `{ data, meta }`
  - `generateMapInWorker` 的返回类型相应扩展
  - `terminateWorker` 不变

- `engine/types.ts`
  - 新增 `GenerationMeta` 类型
  - `MapGenConfig` 增 `__debugPerf?: boolean` 字段

- `components/geography/WorldMapVoronoi.vue`
  - `doGenerate` 解构 `{ data, meta }` 而非只取 `data`
  - 调用 `usePerf().record(meta)` 推送数据

- `pages/WorldMapPage.vue`
  - 模板末尾挂 `<PerfOverlay>`

- `components/geography/WorldMapPanel.vue`（仅当 `usePerf` 实际从面板取 URL flag）
  - 不需要改动

### 数据流（启用 dev flag 时）

```
[main] WorldMapVoronoi.doGenerate
  └─ generateMapInWorker({ ...cfg, __debugPerf: true })
       └─ postMessage
[worker] config.__debugPerf === true
  └─ new PerfCollector()
  └─ generateMap(config, collector)
       ├─ collector.start('grid') ... collector.end('grid')
       ├─ collector.start('heightmap') ... collector.end('heightmap')
       └─ ... 13 named stages + total tracked separately
  └─ postMessage({ id, data, meta: { timings, totalMs, seed } })
[main] { data, meta } = await ...
  └─ usePerf().record(meta)
       └─ console.groupCollapsed / console.table
       └─ <PerfOverlay> reactive ref 触发重渲染
```

### 数据流（关闭 dev flag 时）

```
[main] ... __debugPerf: undefined
[worker] config.__debugPerf !== true
  └─ collector = null
  └─ generateMap(config, undefined)  // console.time 仍正常输出
  └─ postMessage({ id, data, meta: { timings: [], totalMs: 0, seed } })
[main] usePerf().record(meta) // flag 关闭 → 直接 return，不更新 ref
```

## 错误处理

| 失败场景 | 当前行为 | 本 spec 后的行为 |
|---|---|---|
| Worker 不可用 | `getWorker()` 抛错 → 整个 `generateMapInWorker` reject | 不变（collector 在 getWorker 之后构造） |
| 阶段中间抛错 | 整个管线 reject，UI 展示错误 | collector 在 try/finally 中也调用 `end()`，timings 数组部分填充；`GenerationMeta` 仍返回；UI 错误展示不变 |
| 用户卸载组件（`terminateWorker`） | 现有 commit 已处理 | 不变（collector 不持有 main-thread 状态） |
| `?debug=perf` 在生成中切换 | n/a | flag 在模块加载时读一次，in-flight 请求不受影响；新请求采用新状态 |
| `generateMap` 被调用但没传 collector | n/a | 所有 `collector?.start/end` 全部 no-op（向后兼容） |
| `meta` 字段缺失或畸形 | 旧代码不会处理 | `usePerf().record()` 默认空数组，overlay 显示"无数据" |

## 测试

### 单元测试

- `src/__tests__/perfCollector.test.js`
  - start/end 记录非负耗时
  - 多阶段独立记录
  - end 无 start 是 no-op
  - finish() 返回的 totalMs 与各阶段和接近
  - 重复 end 同一 stage 合并到最新值

- `src/__tests__/usePerf.test.js`
  - 无 `?debug=perf` → `record()` 不更新 ref
  - 有 flag → `record()` 推到 timings ref
  - `record(undefined)` 不抛错

### 手动冒烟

1. 启动 dev server，访问 `http://localhost:5173/world-map?debug=perf`
2. 点击"AI 生成地图"，等出图
3. 浮层面板应出现，列出 13 行具名阶段（grid / heightmap / ... / roads），外加顶部的"总耗时"
4. 验证行按耗时降序排序
5. 同一 seed 重新生成，耗时应在 ±20% 内
6. 移除 `?debug=perf`，刷新，浮层面板应消失
7. devtools console 应有 `console.table` 输出
8. 关闭 flag 时控制台仍可有原 `console.time` 输出（保留原行为）

### 不写的内容

- 不写 E2E 测试覆盖 overlay（dev 工具，不是用户功能）
- 不写 overlay 的 VTU 渲染测试
- 不写 worker 端到端集成测试（手工冒烟足够）

## UI 设计

### 浮层位置

固定在视口右上角，宽 280px，距离顶部 12px，距离右侧 12px。

### 内容

- 标题行："生成性能" + 总耗时（如 "1.42 s"）+ "清除"按钮
- 表格，列：阶段 / 耗时 / 占比
  - 阶段名：来自 collector 的 stage key（如"grid"、"heightmap"）
  - 耗时：`84 ms`，右对齐，等宽字体
  - 占比：该阶段 / 总耗时 百分比，1 位小数
- 行按耗时降序
- 颜色 token：`--text-primary` 用于阶段名，`--text-muted` 用于耗时数字，`--accent` 用于总耗时
- "清除"按钮：清空 `timings` ref，关闭面板直到下次生成

### 控制台补充输出

dev flag 打开时，每次生成额外调用：

```js
console.groupCollapsed(`%c[MapEngine] ${seed}`, 'color:#888')
console.table(stageTimings)
console.log('Total:', totalMs, 'ms')
console.groupEnd()
```

方便不开 overlay 也能在 devtools 里直接复制数据。

## 后续 spec 计划

实现本 spec 并跑几次生成后，我们用收集到的数据决定下一步：

- **若 heightmap 最慢** → 单独 spec 优化高度图（如模板预计算 / 简化噪声）
- **若 nations 最慢** → 单独 spec 优化城镇 / 国家 / 省份（如用 Uint16Array 替代对象数组）
- **若 grid 最慢** → 单独 spec 评估 Delaunator 替代品或缓存策略
- **若多个阶段均衡** → 单独 spec 评估跨阶段共享优化（如预计算噪声网格）

这些都明确**不**在本 spec 内。
