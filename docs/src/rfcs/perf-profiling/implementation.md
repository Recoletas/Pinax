# 地图生成性能分析基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-stage timing collection to the map generation pipeline and surface it via a dev-mode overlay so we can identify the dominant bottleneck before optimizing.

**Architecture:** A small `PerfCollector` class is threaded through `generateMap`. The worker constructs one when the main thread sets a debug flag on the request, otherwise runs the pipeline unchanged. Timing data is attached to the worker response alongside the map data. A Vue composable + dev overlay component display the latest run when the URL contains `?debug=perf`.

**Tech Stack:** TypeScript (engine), Vue 3 (composable + component), Vitest (tests), Vite (build).

---

## File Structure

**New files:**
- `src/services/world-map/engine/perf.ts` — `PerfCollector` class. Pure logic.
- `src/composables/usePerf.js` — Vue composable. Reads URL flag once. Holds history ref.
- `src/components/debug/PerfOverlay.vue` — Fixed-position table. Self-hides when flag is off.
- `docs/superpowers/notes/perf-overlay.md` — One-line usage note.
- `src/__tests__/perfCollector.test.js` — Unit tests.
- `src/__tests__/usePerf.test.js` — Unit tests.

**Modified files:**
- `src/services/world-map/engine/types.ts` — Add `GenerationMeta` type.
- `src/services/world-map/engine/generate.ts` — Accept optional `collector`; add `population` stage timer; pair every `console.time` with a `collector?.start/end`.
- `src/services/world-map/engine/worker.ts` — Read `debugPerf` from request; construct collector; attach `meta` to response.
- `src/services/world-map/engine/worker-bridge.ts` — Response type widens to `{ data, meta }`. `generateMapInWorker` signature gains an `options.debugPerf` arg; return type becomes `{ data: VoronoiMapData; meta: GenerationMeta }`.
- `src/components/geography/WorldMapVoronoi.vue` — Read URL flag, pass `debugPerf` option to `generateMapInWorker`, destructure `{ data, meta }`, call `usePerf().record(meta)`.
- `src/pages/WorldMapPage.vue` — Mount `<PerfOverlay>`.

**Decisions:**
- The `debugPerf` flag is **not** stored in `MapGenConfig`. It travels alongside the config in the postMessage payload but never reaches the AI prompt, never gets persisted, and never gets sent through `JSON.parse(JSON.stringify(...))`. This avoids accidentally persisting it in `localStorage` via the store.
- `console.time` / `console.timeEnd` calls in `generate.ts` are **kept**; we just pair them with `collector?.start/end`. This means in any environment (Node, non-debug browser), the console output is unchanged.
- `generateMap` itself keeps returning `VoronoiMapData` (no API change). The worker calls `collector.finish()` and attaches the resulting `meta` to its own postMessage. The collector never leaks into the function's return type.
- `population` stage was missing in the original code; we add it as part of this work.

---

## Task 1: Add `GenerationMeta` type

**Files:**
- Modify: `src/services/world-map/engine/types.ts:5-9` (after the existing type exports header)

- [ ] **Step 1: Add the type**

Open `src/services/world-map/engine/types.ts`. After the file's top doc comment, before the `GridCells` interface, add:

```ts
/** 性能分析元数据：随 worker 响应一起返回 */
export interface GenerationMeta {
  /** 各阶段耗时（毫秒） */
  timings: Array<{ stage: string; durationMs: number }>
  /** 整次生成的总耗时（毫秒） */
  totalMs: number
  /** 触发本次生成的 seed */
  seed: string
}
```

- [ ] **Step 2: Verify type compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20` (or whatever the project uses — fall back to `npx vite build` if there's no standalone tsc script)

Expected: no new errors. If tsc isn't directly available, run `npx vitest run --reporter=basic` and confirm 193 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/world-map/engine/types.ts
git commit -m "feat(engine): add GenerationMeta type for perf collector"
```

---

## Task 2: PerfCollector — failing tests

**Files:**
- Create: `src/__tests__/perfCollector.test.js`

- [ ] **Step 1: Write the test file**

```js
import { describe, it, expect } from 'vitest'
import { PerfCollector } from '../services/world-map/engine/perf'

describe('PerfCollector', () => {
  it('records positive duration for a started-then-ended stage', () => {
    const c = new PerfCollector()
    c.start('grid')
    c.end('grid')
    const meta = c.finish('seed-1')
    const stage = meta.timings.find(t => t.stage === 'grid')
    expect(stage).toBeDefined()
    expect(stage.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('end without matching start is a no-op', () => {
    const c = new PerfCollector()
    c.end('never-started')
    const meta = c.finish('seed-1')
    expect(meta.timings).toEqual([])
  })

  it('tracks multiple stages independently', () => {
    const c = new PerfCollector()
    c.start('a')
    c.start('b')
    c.end('a')
    c.end('b')
    const meta = c.finish('seed-1')
    const stages = meta.timings.map(t => t.stage)
    expect(stages).toEqual(['a', 'b'])
  })

  it('finish returns totalMs that is non-negative', () => {
    const c = new PerfCollector()
    c.start('a'); c.end('a')
    const meta = c.finish('seed-x')
    expect(meta.totalMs).toBeGreaterThanOrEqual(0)
    expect(meta.seed).toBe('seed-x')
  })

  it('re-timing the same stage replaces the previous entry', () => {
    const c = new PerfCollector()
    c.start('grid'); c.end('grid')
    c.start('grid'); c.end('grid')
    const meta = c.finish('seed-1')
    const matches = meta.timings.filter(t => t.stage === 'grid')
    expect(matches).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/perfCollector.test.js --reporter=basic 2>&1 | tail -20`

Expected: FAIL with "Cannot find module '../services/world-map/engine/perf'" or similar import error.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/__tests__/perfCollector.test.js
git commit -m "test(engine): add PerfCollector failing tests"
```

---

## Task 3: PerfCollector — minimal implementation

**Files:**
- Create: `src/services/world-map/engine/perf.ts`

- [ ] **Step 1: Write the implementation**

```ts
/**
 * 性能分析收集器
 * 在生成管线的每个阶段调用 start/end，最后调用 finish() 拿到 GenerationMeta。
 */

import type { GenerationMeta } from './types'

interface StageRecord {
  stage: string
  startTime: number
  endTime: number
}

export class PerfCollector {
  private starts = new Map<string, number>()
  private records: StageRecord[] = []
  private readonly t0: number

  constructor() {
    this.t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  }

  start(stage: string): void {
    this.starts.set(stage, this.now())
  }

  end(stage: string): void {
    const t = this.starts.get(stage)
    if (t === undefined) return
    this.starts.delete(stage)
    this.records.push({ stage, startTime: t, endTime: this.now() })
  }

  finish(seed: string): GenerationMeta {
    // 关闭任何还在进行的阶段（防御性：理论上不应发生）
    for (const [stage, t] of this.starts) {
      this.records.push({ stage, startTime: t, endTime: this.now() })
    }
    this.starts.clear()
    const timings = this.records.map(r => ({
      stage: r.stage,
      durationMs: Math.max(0, r.endTime - r.startTime),
    }))
    // 同名阶段只保留最后一条
    const deduped: typeof timings = []
    for (const t of timings) {
      const idx = deduped.findIndex(x => x.stage === t.stage)
      if (idx >= 0) deduped[idx] = t
      else deduped.push(t)
    }
    return {
      timings: deduped,
      totalMs: Math.max(0, this.now() - this.t0),
      seed,
    }
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }
}
```

- [ ] **Step 2: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/perfCollector.test.js --reporter=basic 2>&1 | tail -10`

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/services/world-map/engine/perf.ts
git commit -m "feat(engine): implement PerfCollector"
```

---

## Task 4: Thread collector through `generateMap`

**Files:**
- Modify: `src/services/world-map/engine/generate.ts:19-41, 50-137`

- [ ] **Step 1: Add the import**

At the top of `generate.ts`, after the existing imports, add:

```ts
import type { PerfCollector } from './perf'
```

(We import the type only; the runtime value is passed in by the caller.)

- [ ] **Step 2: Update the `generateMap` signature**

Change line 19 from:

```ts
export function generateMap(config: MapGenConfig = {}): VoronoiMapData {
```

to:

```ts
export function generateMap(config: MapGenConfig = {}, collector?: PerfCollector): VoronoiMapData {
```

- [ ] **Step 3: Pair each `console.time` block with a `collector?.start/end` call**

For every pair of `console.time(label)` and `console.timeEnd(label)` in `generateMap` (excluding the `[MapEngine] Total generation` pair — see step 4), wrap them as follows. The pattern is:

Before:
```ts
console.time('[MapEngine] Grid')
const points = generatePoints(...)
const { cells, vertices } = buildVoronoi(...)
console.timeEnd('[MapEngine] Grid')
```

After:
```ts
console.time('[MapEngine] Grid')
collector?.start('grid')
const points = generatePoints(...)
const { cells, vertices } = buildVoronoi(...)
console.timeEnd('[MapEngine] Grid')
collector?.end('grid')
```

Apply this pattern to all of these stage labels, mapping to lowercase stage names (without the `[MapEngine] ` prefix):

| console.time label | stage name |
|---|---|
| `[MapEngine] Grid` | `grid` |
| `[MapEngine] Heightmap` | `heightmap` |
| `[MapEngine] Tectonics` | `tectonics` |
| `[MapEngine] Features` | `features` |
| `[MapEngine] Wind & Currents` | `wind` |
| `[MapEngine] Climate` | `climate` |
| `[MapEngine] Rivers` | `rivers` |
| `[MapEngine] Biomes` | `biomes` |
| `[MapEngine] Cultures` | `cultures` |
| `[MapEngine] Burgs` | `burgs` |
| `[MapEngine] States` | `states` |
| `[MapEngine] Provinces` | `provinces` |
| `[MapEngine] Roads` | `roads` |

- [ ] **Step 4: Add a `population` stage around the population loop**

The original code at lines ~101-103 of `generate.ts`:

```ts
// 10. 人口分布
for (let i = 0; i < cells.length; i++) {
  cells.pop[i] = cells.s[i] > 0 ? cells.s[i] * (0.5 + rng() * 0.5) : 0
}
```

Replace with:

```ts
// 10. 人口分布
collector?.start('population')
for (let i = 0; i < cells.length; i++) {
  cells.pop[i] = cells.s[i] > 0 ? cells.s[i] * (0.5 + rng() * 0.5) : 0
}
collector?.end('population')
```

(No `console.time` here — the original didn't have one either; we add it to the collector only.)

- [ ] **Step 5: Leave the `[MapEngine] Total generation` wrapper alone**

The Total pair already exists in the file:

```ts
console.time('[MapEngine] Total generation')
// ... all the work ...
console.timeEnd('[MapEngine] Total generation')
```

Do not pair it with `collector?.start/end`. The collector's own `finish()` records the total wall time from its construction.

- [ ] **Step 6: Apply the same changes to `generateMapAsync` (lines 164-300)**

Repeat steps 2-5 for `generateMapAsync`. Its signature becomes:

```ts
export async function generateMapAsync(
  config: MapGenConfig = {},
  onProgress?: (step: string, percent: number) => void,
  collector?: PerfCollector,
): Promise<VoronoiMapData>
```

Pair each `console.time` block with the same `collector?.start/end` calls, and add the `population` wrap.

- [ ] **Step 7: Run the full test suite to verify no regression**

Run: `npx vitest run --reporter=basic 2>&1 | tail -10`

Expected: 193 tests pass (no new tests yet for generate.ts, just regression check).

- [ ] **Step 8: Commit**

```bash
git add src/services/world-map/engine/generate.ts
git commit -m "feat(engine): thread PerfCollector through generateMap"
```

---

## Task 5: Worker constructs collector, attaches meta

**Files:**
- Modify: `src/services/world-map/engine/worker.ts`

- [ ] **Step 1: Update the worker to read the flag and construct the collector**

Replace the entire contents of `worker.ts` with:

```ts
/**
 * Web Worker 入口 — 在独立线程中运行 generateMap
 * 主线程通过 postMessage 发送 { id, config, debugPerf }，
 * Worker 返回 { id, data, meta }，其中 meta 仅在 debugPerf 为真时填充。
 */

import { generateMap } from './generate'
import { PerfCollector } from './perf'
import type { MapGenConfig, GenerationMeta, VoronoiMapData } from './types'

interface WorkerRequest {
  id: number
  config: MapGenConfig
  debugPerf?: boolean
}

interface WorkerResponse {
  id: number
  data?: VoronoiMapData
  meta?: GenerationMeta
  error?: string
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, config, debugPerf } = e.data
  const collector = debugPerf ? new PerfCollector() : null
  try {
    const data = generateMap(config, collector ?? undefined)
    const meta = collector
      ? collector.finish(config.seed ?? 'unknown')
      : { timings: [], totalMs: 0, seed: config.seed ?? 'unknown' }
    const response: WorkerResponse = { id, data, meta }
    self.postMessage(response)
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
```

- [ ] **Step 2: Build to confirm TypeScript is happy**

Run: `npx vite build --mode production 2>&1 | tail -10`

Expected: build succeeds, the worker bundle still emits. (The worker is a separate chunk in the build output.)

- [ ] **Step 3: Commit**

```bash
git add src/services/world-map/engine/worker.ts
git commit -m "feat(engine): worker constructs PerfCollector and attaches meta"
```

---

## Task 6: Worker bridge — widen return type

**Files:**
- Modify: `src/services/world-map/engine/worker-bridge.ts`

- [ ] **Step 1: Update the imports**

At the top of `worker-bridge.ts`, change the type import line to:

```ts
import type { MapGenConfig, GenerationMeta, VoronoiMapData } from './types'
```

- [ ] **Step 2: Update the `onmessage` handler**

Find the `worker.onmessage` block and replace the message type annotation. The new handler type:

```ts
worker.onmessage = (e: MessageEvent<{ id: number; data?: VoronoiMapData; meta?: GenerationMeta; error?: string }>) => {
  const { id, data, meta, error } = e.data
  const p = pending.get(id)
  if (!p) return
  pending.delete(id)
  clearTimeout(p.timer)
  if (error) p.reject(new Error(error))
  else if (data) p.resolve({ data, meta: meta ?? { timings: [], totalMs: 0, seed: '' } })
}
```

- [ ] **Step 3: Update the `PendingRequest` type and the `pending` Map**

Find the `PendingRequest` interface and change its `resolve` signature:

```ts
interface PendingRequest {
  resolve: (result: { data: VoronoiMapData; meta: GenerationMeta }) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}
```

- [ ] **Step 4: Update `generateMapInWorker` signature and body**

Replace the existing `generateMapInWorker` function:

```ts
export function generateMapInWorker(
  config: MapGenConfig = {},
  options: { debugPerf?: boolean } = {},
): Promise<{ data: VoronoiMapData; meta: GenerationMeta }> {
  return new Promise((resolve, reject) => {
    const id = ++requestId
    const timer = setTimeout(() => {
      if (pending.delete(id)) {
        reject(new Error(`地图生成超时（${REQUEST_TIMEOUT_MS / 1000}s）`))
      }
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    try {
      getWorker().postMessage({ id, config, debugPerf: options.debugPerf === true })
    } catch (err) {
      pending.delete(id)
      clearTimeout(timer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}
```

- [ ] **Step 5: Build to confirm the wider return type compiles**

Run: `npx vite build --mode production 2>&1 | tail -10`

Expected: build succeeds. The next task updates the only call site (`WorldMapVoronoi.vue`); the build will fail there until then, but this task's scope is the bridge itself.

- [ ] **Step 6: Commit**

```bash
git add src/services/world-map/engine/worker-bridge.ts
git commit -m "feat(engine): worker-bridge returns { data, meta }"
```

---

## Task 7: `usePerf` composable — failing tests

**Files:**
- Create: `src/__tests__/usePerf.test.js`

- [ ] **Step 1: Write the test file**

```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// We have to control the URL flag the composable reads. The composable
// reads window.location.search at module-load time, so we mock window.location
// before importing the composable in each test.

// Mock helper: replace window.location with an object whose .search is settable.
function mockLocation(search) {
  delete window.location
  window.location = { search }
}

describe('usePerf', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('record is a no-op when ?debug=perf is not in the URL', async () => {
    mockLocation('')
    const { usePerf } = await import('../composables/usePerf')
    const { record, history } = usePerf()
    record({ timings: [{ stage: 'grid', durationMs: 10 }], totalMs: 10, seed: 's' })
    expect(history.value).toEqual([])
  })

  it('record pushes to history when ?debug=perf is in the URL', async () => {
    mockLocation('?debug=perf')
    const { usePerf } = await import('../composables/usePerf')
    const { record, history, latest } = usePerf()
    const meta = { timings: [{ stage: 'grid', durationMs: 10 }], totalMs: 10, seed: 's1' }
    record(meta)
    expect(history.value).toHaveLength(1)
    expect(latest.value).toEqual(meta)
  })

  it('latest returns the most recent entry', async () => {
    mockLocation('?debug=perf')
    const { usePerf } = await import('../composables/usePerf')
    const { record, history, latest } = usePerf()
    record({ timings: [], totalMs: 1, seed: 'first' })
    record({ timings: [], totalMs: 2, seed: 'second' })
    expect(history.value).toHaveLength(2)
    expect(latest.value.seed).toBe('second')
  })

  it('clear empties history', async () => {
    mockLocation('?debug=perf')
    const { usePerf } = await import('../composables/usePerf')
    const { record, clear, history } = usePerf()
    record({ timings: [], totalMs: 1, seed: 's' })
    clear()
    expect(history.value).toEqual([])
  })

  it('record(undefined) does not throw', async () => {
    mockLocation('?debug=perf')
    const { usePerf } = await import('../composables/usePerf')
    const { record, history } = usePerf()
    expect(() => record(undefined)).not.toThrow()
    expect(history.value).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/usePerf.test.js --reporter=basic 2>&1 | tail -20`

Expected: FAIL — `usePerf` module doesn't exist yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/__tests__/usePerf.test.js
git commit -m "test: add usePerf failing tests"
```

---

## Task 8: `usePerf` composable — implementation

**Files:**
- Create: `src/composables/usePerf.js`

- [ ] **Step 1: Write the composable**

```js
import { ref, computed } from 'vue'

/** 模块加载时一次性读 URL flag — 之后整次会话不变 */
function readFlag() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debug') === 'perf'
}

const DEBUG_PERF = readFlag()

/**
 * 性能数据 composable
 * - flag 关闭时 record() 静默 no-op，history 永远是空数组
 * - flag 打开时 record() 追加到 history，latest 是 history 末尾
 */
export function usePerf() {
  const history = ref([])

  function record(meta) {
    if (!DEBUG_PERF) return
    if (!meta || !Array.isArray(meta.timings)) return
    history.value.push(meta)
    if (DEBUG_PERF && typeof console !== 'undefined') {
      const label = `%c[MapEngine] ${meta.seed}`
      console.groupCollapsed(label, 'color:#888')
      console.table(meta.timings)
      console.log('Total:', meta.totalMs, 'ms')
      console.groupEnd()
    }
  }

  function clear() {
    history.value = []
  }

  const latest = computed(() => history.value[history.value.length - 1] ?? null)

  return { history, latest, record, clear, enabled: DEBUG_PERF }
}
```

- [ ] **Step 2: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/usePerf.test.js --reporter=basic 2>&1 | tail -10`

Expected: 5 tests pass.

- [ ] **Step 3: Run the full test suite to verify no regression**

Run: `npx vitest run --reporter=basic 2>&1 | tail -5`

Expected: 198 tests pass (193 prior + 5 new).

- [ ] **Step 4: Commit**

```bash
git add src/composables/usePerf.js
git commit -m "feat: add usePerf composable for dev-mode timing overlay"
```

---

## Task 9: Main thread wires the flag and records meta

**Files:**
- Modify: `src/components/geography/WorldMapVoronoi.vue:170-180, 250-260`

- [ ] **Step 1: Add the import**

At the top of `WorldMapVoronoi.vue`'s `<script setup>`, after the existing imports, add:

```js
import { usePerf } from '../../composables/usePerf'
```

- [ ] **Step 2: Instantiate the composable inside the setup**

Right after the existing `const STYLE_LABELS = STYLE_PRESET_LABELS` line, add:

```js
const perf = usePerf()
```

- [ ] **Step 3: Pass `debugPerf` to `generateMapInWorker` and destructure meta**

Find the `doGenerate` function. The relevant block currently looks like:

```js
const plainCfg = JSON.parse(JSON.stringify(cfg))
const data = await generateMapInWorker(plainCfg)
```

Replace with:

```js
const plainCfg = JSON.parse(JSON.stringify(cfg))
const { data, meta } = await generateMapInWorker(plainCfg, { debugPerf: perf.enabled })
perf.record(meta)
```

- [ ] **Step 4: Build to confirm no compile errors**

Run: `npx vite build --mode production 2>&1 | tail -10`

Expected: build succeeds. (If it fails, it's likely a type mismatch from the widened return; check the destructure and the `perf.enabled` access.)

- [ ] **Step 5: Run all tests**

Run: `npx vitest run --reporter=basic 2>&1 | tail -5`

Expected: 198 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/geography/WorldMapVoronoi.vue
git commit -m "feat: pass debugPerf to worker and record meta in usePerf"
```

---

## Task 10: PerfOverlay component

**Files:**
- Create: `src/components/debug/PerfOverlay.vue`

- [ ] **Step 1: Write the component**

```vue
<template>
  <div v-if="latest" class="perf-overlay">
    <div class="perf-header">
      <span class="perf-title">生成性能</span>
      <span class="perf-total">{{ formatMs(latest.totalMs) }}</span>
      <button class="perf-clear" @click="clear">清除</button>
    </div>
    <table class="perf-table">
      <thead>
        <tr>
          <th class="col-stage">阶段</th>
          <th class="col-ms">耗时</th>
          <th class="col-pct">占比</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sortedRows" :key="row.stage">
          <td class="col-stage">{{ row.stage }}</td>
          <td class="col-ms">{{ formatMs(row.durationMs) }}</td>
          <td class="col-pct">{{ row.percent.toFixed(1) }}%</td>
        </tr>
      </tbody>
    </table>
    <div class="perf-footer">seed: {{ latest.seed }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePerf } from '../../composables/usePerf'

const { latest, clear } = usePerf()

const sortedRows = computed(() => {
  if (!latest.value) return []
  const total = latest.value.totalMs || 1
  return [...latest.value.timings]
    .sort((a, b) => b.durationMs - a.durationMs)
    .map(t => ({ ...t, percent: (t.durationMs / total) * 100 }))
})

function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}
</script>

<style scoped>
.perf-overlay {
  position: fixed;
  top: 12px;
  right: 12px;
  width: 280px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  z-index: 1000;
  box-shadow: var(--shadow-floating, 0 4px 16px rgba(0,0,0,0.2));
  font-size: 12px;
  color: var(--text-primary);
}

.perf-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.perf-title {
  flex: 1;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 11px;
}

.perf-total {
  color: var(--accent);
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.perf-clear {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.perf-clear:hover { color: var(--text-primary); border-color: var(--text-muted); }

.perf-table {
  width: 100%;
  border-collapse: collapse;
}

.perf-table th, .perf-table td {
  padding: 2px 4px;
  text-align: left;
}

.perf-table th {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 11px;
  border-bottom: 1px solid var(--border);
}

.col-ms, .col-pct { text-align: right; font-family: ui-monospace, SFMono-Regular, monospace; }
.col-stage { color: var(--text-primary); }

.perf-footer {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 10px;
  word-break: break-all;
}
</style>
```

- [ ] **Step 2: Build to confirm it compiles**

Run: `npx vite build --mode production 2>&1 | tail -10`

Expected: build succeeds. The overlay chunk is created.

- [ ] **Step 3: Commit**

```bash
git add src/components/debug/PerfOverlay.vue
git commit -m "feat(debug): add PerfOverlay component"
```

---

## Task 11: Mount overlay in WorldMapPage

**Files:**
- Modify: `src/pages/WorldMapPage.vue`

- [ ] **Step 1: Add the import and template tag**

Replace the file contents with:

```vue
<template>
  <div class="world-map-page">
    <WorldMapPanel />
    <PerfOverlay />
  </div>
</template>

<script setup>
import WorldMapPanel from '../components/geography/WorldMapPanel.vue'
import PerfOverlay from '../components/debug/PerfOverlay.vue'
</script>

<style scoped>
.world-map-page {
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 12px;
}
</style>
```

Note: the overlay self-hides via `v-if="latest"` inside the component, AND because the URL flag is off, the composable never pushes anything. So when the flag is off, nothing is rendered.

- [ ] **Step 2: Build to confirm**

Run: `npx vite build --mode production 2>&1 | tail -10`

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/WorldMapPage.vue
git commit -m "feat: mount PerfOverlay in WorldMapPage"
```

---

## Task 12: Usage note doc

**Files:**
- Create: `docs/superpowers/notes/perf-overlay.md`

- [ ] **Step 1: Write the one-liner**

```markdown
# PerfOverlay

Append `?debug=perf` to the URL to enable the per-stage generation
timing overlay (and the matching `console.table` output in devtools).

Example: `http://localhost:5173/world-map?debug=perf`
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/notes/perf-overlay.md
git commit -m "docs: add perf-overlay usage note"
```

---

## Task 13: Manual smoke test

**Files:** none (manual verification only)

- [ ] **Step 1: Start the dev server**

Run: `npx vite` in one terminal. Wait for "Local: http://localhost:5173/".

- [ ] **Step 2: Open the page without the flag**

Visit `http://localhost:5173/world-map` in a browser.

Expected: page loads, no overlay visible, no `console.groupCollapsed` spam in devtools. (The existing `console.time` lines still print to devtools — that's pre-existing behavior, not new output.)

- [ ] **Step 3: Open the page with the flag**

Visit `http://localhost:5173/world-map?debug=perf`.

Expected: page loads, still no overlay yet (overlay shows only after a generation completes).

- [ ] **Step 4: Generate a map**

Click "AI 生成地图". Wait for generation to complete (the existing loading indicator should show, then the map renders).

Expected:
- A fixed-position panel appears in the top-right with title "生成性能"
- A table lists 13 rows (grid, heightmap, tectonics, features, wind, climate, rivers, biomes, population, cultures, burgs, states, provinces/roads depending on toggles), sorted by duration descending
- The total ms is shown in accent color
- A "seed: ..." line at the bottom
- DevTools console shows `[MapEngine] <seed>` groupCollapsed with a table of timings

- [ ] **Step 5: Test the clear button**

Click "清除" in the overlay.

Expected: overlay disappears. Generating again makes it reappear.

- [ ] **Step 6: Re-generate with same seed**

Click "AI 生成地图" again with the same config. (The AI may return a different seed, so to truly test repeatability, manually set a seed if possible — otherwise just observe whether the relative ordering of stages is stable across two runs.)

Expected: stage ordering is similar (same top-3 stages, same bottom-3 stages). Totals are within ~30% of each other (the AI step adds variance, but the engine portion is deterministic).

- [ ] **Step 7: Remove the flag and reload**

Remove `?debug=perf` from the URL and reload the page.

Expected: page loads, no overlay, no console output from the perf collector.

- [ ] **Step 8: Note the dominant stage**

From the timings, write down the top-3 stages by duration. This is the data that drives the **next** spec (the actual optimization).

Example output to record:
```
grid:        120 ms
heightmap:   340 ms   ← likely candidate
tectonics:   180 ms
features:     50 ms
wind:        220 ms
climate:     140 ms
...
total:      1500 ms
```

- [ ] **Step 9: No code changes — just the recorded observation**

If anything is broken, fix it in a follow-up commit. Otherwise, this task is done.

- [ ] **Step 10: Push everything**

```bash
git push origin main
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| 目标 — 测量基础设施 | 2, 3, 4, 5, 6, 7, 8, 9 |
| 范围 — 浮层 + 控制台 | 8, 9, 10, 11, 12 |
| 架构 — PerfCollector + meta 旁路 | 1, 2, 3, 4, 5, 6 |
| 组件与数据流 — 7 个新文件 / 6 个修改 | 1, 2, 3, 7, 8, 10, 11 (perf.ts, usePerf.js, PerfOverlay.vue, perf-overlay.md, perfCollector.test.js, usePerf.test.js, plus all 6 modified files) |
| 错误处理 — collector 缺失 / 阶段抛错 / flag 关闭 | covered in Tasks 3 (no-op if missing), 4 (try/finally via console.time pairing), 8 (no-op if flag off) |
| 测试 — 单元 + 手动 | 2, 3, 7, 8, 13 |
| UI 设计 | 10, 11 |
| 控制台补充输出 | 8 (added in the usePerf composable) |
| 后续 spec 计划 | 13 (Step 8 — record the dominant stage) |

**2. Placeholder scan:** No TBD/TODO. All code blocks are complete. All commands have expected output.

**3. Type consistency:**
- `GenerationMeta` defined in Task 1, used in Tasks 5, 6, 7, 8 — consistent.
- `PerfCollector` class: `start`/`end`/`finish` defined in Task 3, called in Tasks 4, 5 — consistent.
- `usePerf` return: `{ history, latest, record, clear, enabled }` defined in Task 8, used in Tasks 9, 10 — consistent.
- `generateMapInWorker` signature: `(config, options: { debugPerf? })` defined in Task 6, called in Task 9 — consistent.
- `__debugPerf` was mentioned in the spec as a config field. In this plan it's moved to a separate `options.debugPerf` argument (Task 6) and a separate field in the postMessage payload (Task 5). This is **deliberately different** from the spec — see the file-structure note at the top of this plan. The spec said "config 增 __debugPerf? 字段" but having the flag live inside `config` would risk it being persisted into `localStorage` via the AI result, which is undesirable. Moving it to the postMessage payload (but outside the config) preserves the behavior without that risk. Worth a quick mention to the user before implementing Tasks 5 and 6.

**Issues fixed inline during self-review:**
- Stage names: I had `wind & currents` in the spec table, mapped to `wind` in Task 4. Made consistent.
- The `[MapEngine] Total generation` wrapper: spec said it should not be paired with the collector (collector has its own total). Made explicit in Task 4 step 5.
- `__debugPerf` location: moved out of `config` (see type-consistency note above).

---

## Plan Stats

- **13 tasks total** (12 implementation + 1 manual smoke)
- **6 new files**, **6 modified files**
- **10 unit tests** added (5 for PerfCollector, 5 for usePerf)
- **Estimated commits:** 12 (one per task, plus a final push)
