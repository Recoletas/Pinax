import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
  normalizeNarrativeProductionRun,
  summarizeNarrativeProductionMetrics
} from '../src/services/agents/narrativeProductionMetrics.js'

function usage() {
  return [
    'Usage: npm run report:narrative-production -- --input <metrics.json> [options]',
    '',
    'Options:',
    '  --annotations <file>  Quality annotations keyed by runId or supplied as an array',
    '  --baseline <file>     Baseline metrics for latency, token and retry comparison',
    '  --review-cases <file> review-cases.json (smoke output) for auto narrative-quality metrics',
    '  --allow-incomplete    Exit successfully when release gates are not yet met',
    '  --help                Show this message',
    '',
    'The report only accepts the production metric whitelist; story text and prompts are ignored.',
    '',
    '真实 provider A/B 与人工盲评（C7）需在有可用 API key 的环境中手动跑：',
    '  smoke 脚本产出 review-cases.json + metrics.json 后，人工对每条 1-5 分标注',
    '  （因果连续/角色声音/信息密度/段落节奏/细节必要性/自然落点/可读性），',
    '  再与 baseline 对比。本报告只输出自动指标，不替代人工盲评。'
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    input: '',
    annotations: '',
    baseline: '',
    reviewCases: '',
    allowIncomplete: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      options.help = true
    } else if (token === '--allow-incomplete') {
      options.allowIncomplete = true
    } else if (['--input', '--annotations', '--baseline', '--review-cases'].includes(token)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${token} requires a file path`)
      }
      const key = token === '--review-cases' ? 'reviewCases' : token.slice(2)
      options[key] = value
      index += 1
    } else {
      throw new Error(`Unknown argument: ${token}`)
    }
  }
  return options
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${label} JSON at ${path}: ${error.message}`)
  }
}

function eventsFrom(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.events)) return value.events
  throw new Error('Metrics input must be an event array or an object with an events array')
}

function annotationMap(value) {
  const entries = Array.isArray(value)
    ? value.map((item) => [item?.runId, item])
    : Object.entries(value || {})
  return new Map(entries.filter(([runId]) => String(runId || '').trim()))
}

function mergeAnnotations(events, annotations) {
  if (!annotations) return events
  const byRunId = annotationMap(annotations)
  return events.map((event) => {
    const runId = String(event?.runId || '')
    const annotation = byRunId.get(runId)
    return annotation
      ? { ...event, quality: { ...(event?.quality || {}), ...(annotation?.quality || annotation) } }
      : event
  })
}

function delta(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null
  return Number((current - baseline).toFixed(4))
}

function average(total, count) {
  if (!count) return null
  return Number((total / count).toFixed(2))
}

function ratio(numerator, denominator) {
  if (!denominator) return null
  return Number((numerator / denominator).toFixed(4))
}

function buildComparison(current, baseline) {
  if (!baseline) return null
  return {
    baselineSample: baseline.sample.total,
    currentSample: current.sample.total,
    firstTokenP50MsDelta: delta(current.latencyMs.firstTokenP50, baseline.latencyMs.firstTokenP50),
    totalP50MsDelta: delta(current.latencyMs.totalP50, baseline.latencyMs.totalP50),
    averageTokens: {
      baseline: average(
        baseline.usage.inputTokens
          + baseline.usage.outputTokens
          + baseline.usage.estimatedFinalTokens,
        baseline.sample.total
      ),
      current: average(
        current.usage.inputTokens
          + current.usage.outputTokens
          + current.usage.estimatedFinalTokens,
        current.sample.total
      )
    },
    averageCalls: {
      baseline: average(baseline.usage.calls, baseline.sample.total),
      current: average(current.usage.calls, current.sample.total)
    },
    retryRateDelta: delta(current.rates.retry, baseline.rates.retry),
    evidenceAdoptionDelta: delta(
      current.rates.evidenceAdoption,
      baseline.rates.evidenceAdoption
    ),
    unsupportedFactReductionDelta: delta(
      current.rates.unsupportedFactReduction,
      baseline.rates.unsupportedFactReduction
    )
  }
}

// --- 叙事质量自动指标（C7）--- 纯文本启发式，不依赖 LLM。输入统一为 turns：[{ input, response }]。
function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function cjkCount(value) {
  const matches = String(value ?? '').match(/[\u4e00-\u9fff]/g)
  return matches ? matches.length : 0
}

function splitSentences(value) {
  return String(value ?? '')
    .split(/[。！？!?…]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function charGrams(value, size) {
  const source = cleanText(value)
  const set = new Set()
  for (let index = 0; index + size <= source.length; index += 1) {
    set.add(source.slice(index, index + size))
  }
  return set
}

// 1. 短回合率：正文 < 240 中文字的回合比例（不含明确短答场景的标注）。
function shortTurnRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (!list.length) return null
  const short = list.filter((turn) => cjkCount(turn?.response) < 240).length
  return ratio(short, list.length)
}

// 2. 相邻开头相似率：相邻 assistant 开头 80 字的 3-gram/Jaccard ≥0.6 的比例。
function openingSimilarityRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (list.length < 2) return null
  let similar = 0
  let pairs = 0
  for (let index = 1; index < list.length; index += 1) {
    const prev = charGrams(cleanText(list[index - 1]?.response).slice(0, 80), 3)
    const curr = charGrams(cleanText(list[index]?.response).slice(0, 80), 3)
    if (!prev.size || !curr.size) continue
    pairs += 1
    let intersection = 0
    for (const gram of curr) if (prev.has(gram)) intersection += 1
    const union = prev.size + curr.size - intersection
    if (union && intersection / union >= 0.6) similar += 1
  }
  return ratio(similar, pairs)
}

// 3. 末尾锚点命中率：上一轮末句与下一轮开头共享 ≥1 个 2-gram 的比例。
function tailAnchorCarryRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (list.length < 2) return null
  let carried = 0
  let pairs = 0
  for (let index = 1; index < list.length; index += 1) {
    const tail = splitSentences(list[index - 1]?.response).at(-1) || ''
    const head = cleanText(list[index]?.response).slice(0, 120)
    if (!tail || !head) continue
    pairs += 1
    const bigrams = charGrams(tail, 2)
    let hit = false
    for (let cursor = 0; cursor + 2 <= head.length; cursor += 1) {
      if (bigrams.has(head.slice(cursor, cursor + 2))) { hit = true; break }
    }
    if (hit) carried += 1
  }
  return ratio(carried, pairs)
}

// 4. 段落碎片率：大量单句短段（≥4 段且 <30 字短段占比 ≥60%）的回合比例。
function fragmentedParagraphRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (!list.length) return null
  const fragmented = list.filter((turn) => {
    const blocks = String(turn?.response || '')
      .split(/\n\s*\n+/)
      .map((block) => block.trim())
      .filter(Boolean)
    const shortBlocks = blocks.filter((block) => cjkCount(block) > 0 && cjkCount(block) < 30)
    return blocks.length >= 4 && shortBlocks.length / blocks.length >= 0.6
  }).length
  return ratio(fragmented, list.length)
}

// 5. 无来源新专名率：正文出现输入中不存在的候选专名（2-4 字连续短语）的比例。
function unexplainedNoveltyRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (!list.length) return null
  const candidateNouns = (value) => new Set(
    (String(value ?? '').match(/[\u4e00-\u9fff]{2,4}/g) || [])
  )
  let novel = 0
  let evaluated = 0
  for (const turn of list) {
    const inputNouns = candidateNouns(turn?.input)
    const responseNouns = candidateNouns(turn?.response)
    if (!responseNouns.size) continue
    evaluated += 1
    if ([...responseNouns].some((noun) => !inputNouns.has(noun))) novel += 1
  }
  return ratio(novel, evaluated)
}

// 6. 玩家控制权违规率：替玩家决定/行动/总结心理的回合比例（启发式）。
function playerAgencyViolationRate(turns = []) {
  const list = Array.isArray(turns) ? turns : []
  if (!list.length) return null
  const PATTERNS = [
    /你(决定|选择|打算|会|要)去/,
    /你感到|你意识到|你明白|你知道|你觉得/,
    /你(转身|走出|伸手|点头|摇头)/
  ]
  const violating = list.filter((turn) => (
    PATTERNS.some((pattern) => pattern.test(String(turn?.response || '')))
  )).length
  return ratio(violating, list.length)
}

function summarizeNarrativeQuality(turns = []) {
  return {
    turnCount: turns.length,
    shortTurnRate: shortTurnRate(turns),
    openingSimilarityRate: openingSimilarityRate(turns),
    tailAnchorCarryRate: tailAnchorCarryRate(turns),
    fragmentedParagraphRate: fragmentedParagraphRate(turns),
    unexplainedNoveltyRate: unexplainedNoveltyRate(turns),
    playerAgencyViolationRate: playerAgencyViolationRate(turns)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (!options.input) throw new Error('--input is required')

  const input = await readJson(options.input, 'metrics')
  const annotations = options.annotations
    ? await readJson(options.annotations, 'annotations')
    : null
  const events = mergeAnnotations(eventsFrom(input), annotations)
    .map(normalizeNarrativeProductionRun)
  const summary = summarizeNarrativeProductionMetrics(events)

  let baselineSummary = null
  if (options.baseline) {
    const baselineInput = await readJson(options.baseline, 'baseline')
    baselineSummary = summarizeNarrativeProductionMetrics(eventsFrom(baselineInput))
  }

  let quality = null
  if (options.reviewCases) {
    const cases = await readJson(options.reviewCases, 'review-cases')
    const turns = (Array.isArray(cases) ? cases : []).map((item) => ({
      input: item?.action || '',
      response: item?.response || ''
    }))
    quality = summarizeNarrativeQuality(turns)
  }

  const output = {
    reportVersion: 1,
    summary,
    quality,
    comparison: buildComparison(summary, baselineSummary)
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  if (!summary.releaseReady && !options.allowIncomplete) process.exitCode = 2
}

main().catch((error) => {
  process.stderr.write(`Narrative production report failed: ${error.message}\n`)
  process.exitCode = 1
})
