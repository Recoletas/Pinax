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
    '  --allow-incomplete    Exit successfully when release gates are not yet met',
    '  --help                Show this message',
    '',
    'The report only accepts the production metric whitelist; story text and prompts are ignored.'
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    input: '',
    annotations: '',
    baseline: '',
    allowIncomplete: false,
    help: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      options.help = true
    } else if (token === '--allow-incomplete') {
      options.allowIncomplete = true
    } else if (['--input', '--annotations', '--baseline'].includes(token)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${token} requires a file path`)
      }
      options[token.slice(2)] = value
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

  const output = {
    reportVersion: 1,
    summary,
    comparison: buildComparison(summary, baselineSummary)
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  if (!summary.releaseReady && !options.allowIncomplete) process.exitCode = 2
}

main().catch((error) => {
  process.stderr.write(`Narrative production report failed: ${error.message}\n`)
  process.exitCode = 1
})
