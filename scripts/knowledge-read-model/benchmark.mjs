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
const { createAuthoringKnowledgeEvidenceBridge } = await import(
  new URL('../../src/services/project/knowledgeReadModel/authoringEvidenceBridge.js', `file://${scriptDir}/`).href
)
const { createRichSnapshotA } = await import(new URL('./fixtures/richSnapshot.js', `file://${scriptDir}/`).href)
const { createAuthoringKnowledgeQuerySession } = await import(
  new URL('../../src/services/agents/authoring/authoringKnowledgeQuerySession.js', `file://${scriptDir}/`).href
)
const { createWritingDocument } = await import(
  new URL('../../src/services/writing/writingDocumentSchema.js', `file://${scriptDir}/`).href
)

async function timeMsAsync(fn) {
  const start = process.hrtime.bigint()
  await fn()
  return Number(process.hrtime.bigint() - start) / 1e6
}

/***
 * K-R2: session-level staged cost with REAL F2 repositories (synthetic
 * book/worldbook): distinguishes repository reads, snapshot clone, catalog
 * index build, retrieval, and the I0 seam on/off. Repeat-prepare is bounded
 * (no cross-request caching); bridge-level cancellation is measured in the
 * main scale section (pre-aborted).
 */
async function measureSessionScale(chapterCount, repeats) {
  const documents = []
  for (let index = 0; index < chapterCount; index += 1) {
    documents.push({
      id: `bench-chapter-${index}`,
      title: `第 ${index + 1} 章`,
      editorDocument: createWritingDocument(`合成章节${index}：艾德加在旧港档案室翻找蓝铜钥匙的下落线索。`)
    })
  }
  let worldbookRevision = 0
  const repositories = {
    getBook: async () => ({
      id: 'bench-session-book',
      title: '合成会话书',
      worldbookId: 'bench-session-worldbook',
      chapters: documents.map((chapter) => ({ ...chapter }))
    }),
    getBoundWorldbook: async () => ({
      projectId: 'bench-session-book',
      worldbookId: 'bench-session-worldbook',
      worldbook: {
        id: 'bench-session-worldbook',
        entries: [
          { id: 'entry_edgar', name: '艾德加', type: 'character', content: `旧港档案员。修订 ${worldbookRevision}。` },
          { id: 'entry_key', name: '蓝铜钥匙', type: 'item', content: `旧港档案室的钥匙。修订 ${worldbookRevision}。` }
        ]
      }
    }),
    listExplorations: async () => [],
    listOutlineNodes: async () => [{ id: 'bench-outline', projectId: 'bench-session-book', title: '钥匙伏笔', intent: '钥匙下落兑现。', status: 'adopted' }],
    listOutlineEdges: async () => [],
    listMemories: async () => []
  }
  const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })
  const request = {
    projectId: 'bench-session-book', queryIntent: 'whole-book', question: '艾德加与蓝铜钥匙有什么设定？'
  }
  // staged: repository reads alone
  const readerSamples = []
  const prepareSamples = []
  const prepareSeamSamples = []
  let outputChars = 0
  for (let index = 0; index < repeats; index += 1) {
    readerSamples.push(await timeMsAsync(async () => {
      await repositories.getBook('bench-session-book')
      await repositories.getBoundWorldbook('bench-session-book', 'bench-session-worldbook')
      await repositories.listOutlineNodes('bench-session-book')
      await repositories.listMemories('bench-session-book')
    }))
    prepareSamples.push(await timeMsAsync(async () => {
      const prepared = await session.prepare({ ...request, now: 1000 + index })
      if (!prepared.ok) throw new Error('session prepare failed')
      outputChars = JSON.stringify(prepared.session.evidenceEnvelope).length
    }))
    prepareSeamSamples.push(await timeMsAsync(async () => {
      const prepared = await session.prepare({
        ...request,
        knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:entry_edgar', 'worldbook-entry:entry_key'] },
        now: 2000 + index
      })
      if (!prepared.ok) throw new Error('seam prepare failed')
    }))
  }
  // source change forces revision invalidation on the next prepare
  worldbookRevision = 1
  const afterChange = await timeMsAsync(async () => {
    const prepared = await session.prepare({ ...request, now: 9999 })
    if (!prepared.ok) throw new Error('post-change prepare failed')
  })
  const sortedPrepare = [...prepareSamples].sort((a, b) => a - b)
  const sortedSeam = [...prepareSeamSamples].sort((a, b) => a - b)
  const sortedReader = [...readerSamples].sort((a, b) => a - b)
  const memory = process.memoryUsage()
  return {
    chapters: chapterCount,
    repeats,
    readerReadsP50Ms: Number(percentile(sortedReader, 50).toFixed(3)),
    prepareP50Ms: Number(percentile(sortedPrepare, 50).toFixed(3)),
    prepareP95Ms: Number(percentile(sortedPrepare, 95).toFixed(3)),
    prepareSeamOnP50Ms: Number(percentile(sortedSeam, 50).toFixed(3)),
    prepareSeamOnP95Ms: Number(percentile(sortedSeam, 95).toFixed(3)),
    prepareAfterSourceChangeMs: Number(afterChange.toFixed(3)),
    evidenceEnvelopeChars: outputChars,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed
  }
}

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

/***
 * Staged cold/hot cost for the F2 bridge path: evidence catalog → clone →
 * freeze → bridge(scope) → query → back-mapping. Companion to the standalone
 * scope benchmark above (I0 seam on/off is measured at the bottom).
 */
async function measureBridgeScale(count, repeats) {
  const entries = []
  const evidence = []
  const projectId = 'book_bridge_bench'
  const worldbookId = 'wb_bridge_bench'
  for (let index = 0; index < count; index += 1) {
    const entryId = `entry_b_${index}`
    entries.push(entryId)
    evidence.push({
      sourceRef: `worldbook-entry:${entryId}`,
      projectId,
      authority: 'worldbook',
      label: `测点${index}`,
      excerpt: `合成负载证据${index}：用于桥接分阶段测量的有界摘录，长度约一百字，覆盖名称、正文与修订字段。`,
      revision: `entry-r${index}`,
      locator: { kind: 'worldbook-entry', worldbookId, entryId }
    })
  }
  const requested = evidence.slice(0, Math.min(8, count)).map((item) => item.sourceRef)
  const cloneMs = timeMs(() => JSON.parse(JSON.stringify(evidence)))
  let bridge = null
  const buildMs = timeMs(() => {
    const built = createAuthoringKnowledgeEvidenceBridge({
      projectId, worldbookId, authorizedEvidence: evidence
    })
    if (!built.ok) throw new Error('bridge build failed')
    bridge = built.bridge
  })
  const hotQuerySamples = []
  let outputChars = 0
  for (let index = 0; index < repeats; index += 1) {
    hotQuerySamples.push(timeMs(() => {
      const query = bridge.queryBySourceRefs(requested)
      outputChars = JSON.stringify(query.kResult).length
    }))
  }
  const backSamples = []
  for (let index = 0; index < repeats; index += 1) {
    backSamples.push(timeMs(() => {
      const query = bridge.queryBySourceRefs(requested)
      bridge.toAuthoringEvidence(query.kResult)
    }))
  }
  hotQuerySamples.sort((a, b) => a - b)
  backSamples.sort((a, b) => a - b)
  const memory = process.memoryUsage()
  return {
    scale: count,
    evidenceCount: evidence.length,
    cloneMs: Number(cloneMs.toFixed(3)),
    bridgeBuildMs: Number(buildMs.toFixed(3)),
    queryP50Ms: Number(percentile(hotQuerySamples, 50).toFixed(3)),
    queryP95Ms: Number(percentile(hotQuerySamples, 95).toFixed(3)),
    withBackmapP95Ms: Number(percentile(backSamples, 95).toFixed(3)),
    outputChars,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed
  }
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
for (const [count, repeats] of [[100, 200], [1000, 200], [5000, 50], [10000, 20]]) {
  process.stdout.write(`测量 ${count} 条 × ${repeats} 次 … `)
  const measurement = await measureScale(count, repeats)
  results.push(measurement)
  console.log('完成')
}

const bridgeResults = []
for (const [count, repeats] of [[100, 200], [1000, 200], [5000, 50], [10000, 20]]) {
  process.stdout.write(`桥接分阶段测量 ${count} 条 × ${repeats} 次 … `)
  bridgeResults.push(await measureBridgeScale(count, repeats))
  console.log('完成')
}

const sessionResults = []
for (const [chapters, repeats] of [[25, 30], [100, 30], [400, 8]]) {
  process.stdout.write(`会话分阶段测量 ${chapters} 章 × ${repeats} 次 … `)
  sessionResults.push(await measureSessionScale(chapters, repeats))
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

console.log('\n--- 会话分阶段成本（F2 repositories；I0 接缝关/开对照；重复 prepare 有界）---')
for (const result of sessionResults) {
  console.log(`章节数 ${result.chapters}：repository 读 p50 ${result.readerReadsP50Ms}ms · prepare p50/p95 ${result.prepareP50Ms}/${result.prepareP95Ms}ms · 接缝开 p50/p95 ${result.prepareSeamOnP50Ms}/${result.prepareSeamOnP95Ms}ms · 来源变更后首次 ${result.prepareAfterSourceChangeMs}ms · envelope ${result.evidenceEnvelopeChars} chars · rss ${(result.rssBytes / 1048576).toFixed(0)}MiB`)
}

console.log('\n--- 桥接分阶段成本（F2 evidence → clone → build/scope → query → 回映射）---')
for (const result of bridgeResults) {
  console.log(`规模 ${result.scale}：clone ${result.cloneMs}ms · bridge冷建 ${result.bridgeBuildMs}ms · 查询 p50/p95 ${result.queryP50Ms}/${result.queryP95Ms}ms · 含回映射 p95 ${result.withBackmapP95Ms}ms · 输出 ${result.outputChars} chars · rss ${(result.rssBytes / 1048576).toFixed(0)}MiB`)
}

const scale1k = results.find((result) => result.scale === 1000)
const bridge1k = bridgeResults.find((result) => result.scale === 1000)
const worst1kP95 = Math.max(scale1k.queryEntityContext.p95Ms, scale1k.queryFactAtTime.p95Ms, bridge1k.queryP95Ms)
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
    results,
    bridgeResults,
    sessionResults
  }, null, 2))
  console.log(`JSON 报告已写入 ${outPath}（显式请求的报告文件，非业务写入）`)
}

process.exit(worst1kP95 <= 100 ? 0 : 1)
