#!/usr/bin/env node
/**
 * knowledge-read-model offline benchmark (K4).
 *
 *   node scripts/knowledge-read-model/benchmark.mjs [--json <path>]
 *
 * Synthetic load only (no user data, no network, no storage writes).
 * Measures, per scale (100 / 1,000 / 10,000 worldbook entries with
 * proportional facts):
 * - cold scope build time (createKnowledgeScope incl. alias index + freeze)
 * - bounded query latency p50/p95 (entity-context, exact match)
 * - fact-at-time query latency p50/p95 (rich timeline window filtering)
 * - pre-aborted cancellation latency
 * - output size (serialized result chars) and process memory
 *
 * Memory口径: process.memoryUsage() — rss = 常驻集合, heapUsed = V8 活跃堆。
 * 记录 Node/CPU 信息；初始数据不作手机性能保证。
 * 建议门槛建立在 1,000 条有界样例：查询 p95 ≤ 100ms。超过时先报告瓶颈，
 * 不引入缓存或 Worker。
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))

const { freezeKnowledgeSnapshot, queryKnowledge } = await import(
  new URL('../../src/services/project/knowledgeReadModel/index.js', `file://${scriptDir}/`).href
)
const { createRichSnapshotA } = await import(new URL('./fixtures/richSnapshot.js', `file://${scriptDir}/`).href)

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function timeMs(fn) {
  const start = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

/**
 * Scale the rich fixture up: N entries (half locations, half characters),
 * each location gets facts; the queried entity sits in the middle so the
 * adapter scan cost stays honest (full collection iteration per query).
 */
function buildScaledSnapshot(count) {
  const base = createRichSnapshotA()
  const snapshot = structuredClone(base)
  snapshot.project = { id: 'book_bench', revision: 'bench_1', worldbookId: 'wb_bench' }
  snapshot.worldbook.id = 'wb_bench'
  const entries = []
  const canonicalFacts = {}
  for (let index = 0; index < count; index += 1) {
    const isLocation = index % 2 === 0
    const id = `entry_bench_${index}`
    entries.push({
      id,
      name: isLocation ? `测点城${index}` : `测点人物${index}`,
      content: `合成负载条目${index}：用于基准测量的有界正文，长度约一百字，包含若干占位句子以接近真实条目体积。临江城引用词仅出现在专属条目。`,
      keys: [`测点${index}`],
      keysSecondary: [],
      type: isLocation ? 'location' : 'character',
      injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 4, excludeRecursion: false, group: null },
      relations: { tags: [], locations: [], characters: [], events: [] },
      visibility: { level: 'public' },
      metadata: { createdAt: 1700000000000 + index, updatedAt: 1700000100000 + index, reviewState: 'ready' }
    })
    if (isLocation) {
      canonicalFacts[`fact_bench_${index}_a`] = {
        subjectId: id,
        predicate: 'controlled-by',
        value: index % 4 === 0 ? '商会' : '城主府',
        status: 'confirmed',
        confidence: 0.9,
        sourceRefs: [`chapter:${index}`],
        validDuring: {
          timelineId: 'timeline:linjiang-main',
          start: { eraId: 'age-expansion', ordinal: index % 50 },
          end: { eraId: 'age-strife', ordinal: (index % 40) + 1 },
          endSemantic: 'exclusive'
        },
        visibility: { level: 'public' }
      }
    }
  }
  snapshot.worldbook.entries = entries
  snapshot.runtime.canonicalFacts = canonicalFacts
  return snapshot
}

async function measureScale(count, repeats) {
  const snapshotData = buildScaledSnapshot(count)
  // Cold scope build (includes freeze + alias index + timeline validation).
  const snapshot = structuredClone(snapshotData)
  const buildMs = timeMs(() => freezeKnowledgeSnapshot(snapshot))
  const queryStart = process.hrtime.bigint()
  freezeKnowledgeSnapshot(snapshot)
  const refreezeMs = Number(process.hrtime.bigint() - queryStart) / 1e6

  const entityContextRequest = {
    schemaVersion: 1,
    projectId: 'book_bench',
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_bench_0' }],
    questionKind: 'entity-context'
  }
  const factAtTimeRequest = {
    schemaVersion: 1,
    projectId: 'book_bench',
    entityRefs: [{ kind: 'worldbook-entry', id: 'entry_bench_0' }],
    questionKind: 'fact-at-time',
    storyTime: { timelineId: 'timeline:linjiang-main', eraId: 'age-expansion', ordinal: 10 },
    perspective: { viewer: 'author' }
  }
  const abortedController = new AbortController()
  abortedController.abort()

  const entitySamples = []
  const timeSamples = []
  const cancelSamples = []
  let outputChars = 0
  for (let index = 0; index < repeats; index += 1) {
    entitySamples.push(timeMs(() => {
      const result = queryKnowledge(entityContextRequest, { snapshot })
      if (result.status === 'denied') throw new Error('benchmark query denied')
      outputChars = JSON.stringify(result).length
    }))
    timeSamples.push(timeMs(() => {
      queryKnowledge(factAtTimeRequest, { snapshot })
    }))
    cancelSamples.push(timeMs(() => {
      const result = queryKnowledge(entityContextRequest, { snapshot, signal: abortedController.signal })
      if (result.status !== 'aborted') throw new Error('cancel benchmark did not abort')
    }))
    if (globalThis.gc) await new Promise((resolveTick) => setImmediate(resolveTick))
  }
  entitySamples.sort((a, b) => a - b)
  timeSamples.sort((a, b) => a - b)
  cancelSamples.sort((a, b) => a - b)
  const memory = process.memoryUsage()
  return {
    scale: count,
    coldScopeBuildMs: Number(buildMs.toFixed(3)),
    refreezeMs: Number(refreezeMs.toFixed(3)),
    queryEntityContext: {
      repeats,
      p50Ms: Number(percentile(entitySamples, 50).toFixed(3)),
      p95Ms: Number(percentile(entitySamples, 95).toFixed(3)),
      maxMs: Number(entitySamples[entitySamples.length - 1].toFixed(3))
    },
    queryFactAtTime: {
      repeats,
      p50Ms: Number(percentile(timeSamples, 50).toFixed(3)),
      p95Ms: Number(percentile(timeSamples, 95).toFixed(3)),
      maxMs: Number(timeSamples[timeSamples.length - 1].toFixed(3))
    },
    cancelPreAborted: {
      repeats,
      p95Ms: Number(percentile(cancelSamples, 95).toFixed(3))
    },
    outputChars,
    memory: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      note: 'rss=进程常驻集合, heapUsed=V8活跃堆; 取本规模测量结束时的单次读数, 无跨规模GC同步口径'
    }
  }
}

console.log('knowledge-read-model benchmark（合成负载，无真实数据/网络/存储写入）')
console.log(`node ${process.version}, cpus=${process.cpuUsage ? 'available' : 'n/a'}, arch=${process.arch}, platform=${process.platform}`)
console.log(`建议门槛：1,000 条有界样例查询 p95 ≤ 100ms\n`)

const results = []
for (const [count, repeats] of [[100, 200], [1000, 200], [10000, 50]]) {
  process.stdout.write(`测量 ${count} 条 × ${repeats} 次 … `)
  const measurement = await measureScale(count, repeats)
  results.push(measurement)
  console.log('完成')
}

for (const result of results) {
  console.log(`\n--- 规模 ${result.scale} ---`)
  console.log(`冷建 scope（freeze+alias index）: ${result.coldScopeBuildMs}ms（再冻结 ${result.refreezeMs}ms）`)
  console.log(`entity-context 查询: p50=${result.queryEntityContext.p50Ms}ms p95=${result.queryEntityContext.p95Ms}ms max=${result.queryEntityContext.maxMs}ms (n=${result.queryEntityContext.repeats})`)
  console.log(`fact-at-time 查询:   p50=${result.queryFactAtTime.p50Ms}ms p95=${result.queryFactAtTime.p95Ms}ms max=${result.queryFactAtTime.maxMs}ms (n=${result.queryFactAtTime.repeats})`)
  console.log(`预取消请求: p95=${result.cancelPreAborted.p95Ms}ms`)
  console.log(`单次结果序列化大小: ${result.outputChars} chars`)
  console.log(`内存: rss=${(result.memory.rssBytes / 1048576).toFixed(1)}MiB heapUsed=${(result.memory.heapUsedBytes / 1048576).toFixed(1)}MiB（${result.memory.note}）`)
}

const scale1k = results.find((result) => result.scale === 1000)
const worst1kP95 = Math.max(scale1k.queryEntityContext.p95Ms, scale1k.queryFactAtTime.p95Ms)
console.log(`\n1,000 条门槛检查: 查询 p95 最大 ${worst1kP95}ms → ${worst1kP95 <= 100 ? '达标 (≤100ms)' : '超出建议门槛：先分析瓶颈，不引入缓存/Worker'}`)

const jsonArgs = process.argv.indexOf('--json')
if (jsonArgs > -1 && process.argv[jsonArgs + 1]) {
  const outPath = resolve(process.argv[jsonArgs + 1])
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    node: process.version,
    arch: process.arch,
    platform: process.platform,
    threshold: { scale: 1000, queryP95Ms: 100 },
    worst1kP95Ms: worst1kP95,
    thresholdMet: worst1kP95 <= 100,
    results
  }, null, 2))
  console.log(`JSON 报告已写入 ${outPath}（显式请求的报告文件，非业务写入）`)
}

process.exit(worst1kP95 <= 100 ? 0 : 1)
