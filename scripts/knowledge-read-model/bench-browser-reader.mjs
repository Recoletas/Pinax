#!/usr/bin/env node
/**
 * K36 browser formal-reader benchmark: runs the REAL
 * authoringKnowledgeQuerySession with the REAL default repositories
 * (localStorage-backed, synthetic project) inside a real browser runtime.
 *
 *   BASE=http://127.0.0.1:5197 npx vite-node scripts/knowledge-read-model/bench-browser-reader.mjs [--json <path>] [--seam]
 *
 * Measures, per scale (worldbook entries x chapters):
 * - cold first prepare (storage read + clone + catalog index + retrieval)
 * - hot prepare p50/p95 (repeat on the same data; repositories re-read every
 *   time — there is no cross-request cache)
 * - seam-on prepare p50/p95 (I0 knowledgeReadModel enabled)
 * - cancelled prepare residual (pre-aborted: must be a typed failure with no
 *   published result)
 *
 * This is the BROWSER layer companion to benchmark.mjs (in-memory
 * repositories). localStorage timings are not IndexedDB/SQLite timings and
 * must not be reported as such. Advisory threshold: 1k bounded query
 * p95 <= 100ms.
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE || 'http://127.0.0.1:5197'
const seamArg = process.argv.includes('--seam')

const { chromium } = await import(
  new URL('../../../text-game-framework/node_modules/playwright/index.mjs', `file://${scriptDir}/`).href
).catch(async () => await import('playwright'))

// The evaluator is a real file (lintable), never executed in Node; its source
// is handed to page.evaluate verbatim so dynamic imports run in the browser.
const evaluatorSource = readFileSync(join(scriptDir, 'browser-reader-evaluator.js'), 'utf8')
  .replace('export async function browserReaderEvaluator', 'async function browserReaderEvaluator')
const evaluatorFunction = new Function(`return ${evaluatorSource};`)()

const results = []
let failures = 0

async function measure({ entries, chapters, repeats }) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error.message)))
  await page.goto(`${BASE}/authoring`, { waitUntil: 'domcontentloaded' })

  // 以表达式字符串调用（本脚本由纯 node 运行，无 SSR 转换层），绕开
  // 编译函数在部分环境下的序列化兼容性问题。
  const expression = '(' + evaluatorSource + ')(' + JSON.stringify({ entries, chapters, repeats, seamEnabled: seamArg }) + ')'
  const measurement = await page.evaluate(expression)

  await context.close()
  await browser.close()
  if (errors.length) failures += 1
  return { ...measurement, entries, chapters, pageErrors: errors }
}

for (const scale of [{ entries: 100, chapters: 20, repeats: 15 }, { entries: 1000, chapters: 50, repeats: 15 }, { entries: 5000, chapters: 100, repeats: 8 }]) {
  process.stdout.write(`浏览器正式 reader 测量 ${scale.entries} 条目 × ${scale.chapters} 章 … `)
  const measurement = await measure(scale)
  results.push(measurement)
  console.log('完成')
}

console.log('\n--- 浏览器正式 reader 基准（localStorage 层）---')
for (const result of results) {
  console.log(`条目 ${result.entries}×章 ${result.chapters}：冷 ${result.coldMs}ms · 热 p50/p95 ${result.hotP50Ms}/${result.hotP95Ms}ms` +
    (result.seamOnP50Ms != null ? ` · 接缝开 p50/p95 ${result.seamOnP50Ms}/${result.seamOnP95Ms}ms` : '') +
    ` · 预取消 ${result.cancelledMs}ms（typed=${result.cancelledTypedFailure}） · envelope ${result.envelopeChars} chars · 页面错误 ${result.pageErrors.length}`)
}
console.log('口径：localStorage 正式 reader；非 IndexedDB/SQLite；1k 查询 p95≤100ms 为建议门槛。')

const jsonArgs = process.argv.indexOf('--json')
if (jsonArgs > -1 && process.argv[jsonArgs + 1]) {
  const outPath = resolve(process.argv[jsonArgs + 1])
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, results }, null, 2))
  console.log(`JSON 报告已写入 ${outPath}`)
}
const worst = Math.max(...results.map((result) => Math.max(result.hotP95Ms, result.seamOnP95Ms ?? 0)))
process.exit(failures > 0 || worst > 100 ? 1 : 0)
